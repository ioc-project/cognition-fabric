# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine service - Business logic for Cognition Engine operations"""

import copy
import logging
from dataclasses import dataclass
from server.services.mas_metadata import lock_mas

from datetime import datetime, timedelta

from server.utils.timestamps import format_utc, utc_now
from typing import List, Optional

from fastapi import HTTPException, status

from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.cognition_engine import CognitionEngine as CognitionEngineModel
from server.schemas.cognition_engine import (
    CE_CONNECTION_FIELDS,
    CognitionEngineAssociateResponse,
    CognitionEngineDetail,
    CognitionEngineList,
    CognitionEngineListItem,
    CognitionEnginePatchRequest,
    CognitionEngineRegisterRequest,
    CognitionEngineResponse,
    ce_connection,
    connection_error,
)

from server.services.ce_endpoints import endpoint_keys
from server.utils import generate_uuid

_IMMUTABLE_CE_FIELDS = {"cfn_id", "name", "version", "ce_type"}

# An explicit null clears these on PATCH. A null on any other field is ignored.
_CLEARABLE_CE_FIELDS = {"enforcing_url", "enforcing_endpoint", "notification_url", "notification_endpoint"}

_OWNERSHIP_FIELDS = {
    "enforcing_url",
    "enforcing_endpoint",
    "enforcing_protocol",
    "health_url",
    "health_endpoint",
    "health_protocol",
}


@dataclass(frozen=True)
class CEProbeTarget:
    ce_id: str
    registration_token: str


class CognitionEngineService:
    """Service layer for Cognition Engine business logic"""

    def register(
        self, engine_data: CognitionEngineRegisterRequest, user_id: str
    ) -> tuple[CognitionEngineResponse, bool]:
        """
        Register a new Cognition Engine.

        Returns (response, created) — created=True for new registration.
        Raises HTTPException 404 if the CFN does not exist.
        Raises HTTPException 409 if CE with same (cfn_id, name, version) already exists.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode

                cfn = (
                    session.query(CognitionFabricNode)
                    .filter(
                        CognitionFabricNode.id == engine_data.cfn_id,
                        CognitionFabricNode.deleted_at.is_(None),
                    )
                    .with_for_update()
                    .first()
                )
                if not cfn:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Cognition Fabric Node '{engine_data.cfn_id}' not found",
                    )

                # Check for existing CE with same (cfn_id, name, version)
                existing = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.cfn_id == engine_data.cfn_id,
                        CognitionEngineModel.name == engine_data.name,
                        CognitionEngineModel.version == engine_data.version,
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .first()
                )

                if existing:
                    # Return 409 Conflict with existing CE ID for recovery
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "error": f"CE '{engine_data.name}' version '{engine_data.version}' already exists",
                            "existing_ce_id": existing.id,
                        },
                    )

                # Create new CE record
                engine = CognitionEngineModel(
                    id=generate_uuid(),
                    cfn_id=engine_data.cfn_id,
                    name=engine_data.name,
                    version=engine_data.version,
                    ce_type=engine_data.ce_type.value,  # Store enum value as string
                    **ce_connection(engine_data),
                    enabled=True,
                    mas_auto_associate=engine_data.mas_auto_associate,
                    status="online",
                    mas_config=engine_data.mas_config or {},
                    created_by=user_id,
                )
                session.add(engine)
                session.flush()
                self._claim_endpoints(session, engine)
                created = True

                self._carry_forward_mas_associations(session, engine, user_id)

                session.commit()

                response = (
                    CognitionEngineResponse(
                        ce_id=engine.id,
                        cfn_id=engine.cfn_id,
                        name=engine.name,
                        version=engine.version,
                        ce_type=engine.ce_type,
                        **ce_connection(engine),
                        enabled=engine.enabled,
                        mas_auto_associate=engine.mas_auto_associate,
                        status=engine.status,
                        created=created,
                    ),
                    created,
                )

            finally:
                session.close()

            from server.services.cognition_fabric_node import cognition_fabric_node_service

            cognition_fabric_node_service.update_config_for_cfn(engine_data.cfn_id)

            return response

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to register cognition engine: {str(e)}",
            )

    @staticmethod
    def _claim_endpoints(session, engine: CognitionEngineModel) -> bool:
        """Transfer service ownership inside the transaction holding the parent CFN's row lock."""
        claimed = endpoint_keys(engine)
        other_engines = (
            session.query(CognitionEngineModel)
            .filter(
                CognitionEngineModel.cfn_id == engine.cfn_id,
                CognitionEngineModel.id != engine.id,
                CognitionEngineModel.deleted_at.is_(None),
                CognitionEngineModel.registration_token.is_not(None),
            )
            .with_for_update()
            .all()
        )
        status_changed = False
        for other in other_engines:
            if claimed & endpoint_keys(other):
                status_changed = status_changed or other.status != "offline"
                other.registration_token = None
                other.status = "offline"
        engine.registration_token = generate_uuid()
        return status_changed

    def _carry_forward_mas_associations(self, session, engine: CognitionEngineModel, user_id: str) -> None:
        """Associate an upgraded CE with every MAS its immediate predecessor (most recently registered
        prior version, same cfn_id/name) was attached to.

        Runs inside the caller's transaction — does not commit or roll back itself. A failure here
        propagates to the caller so CE creation and association carry-forward commit or fail together,
        rather than leaving a CE registered with associations silently missing.
        """
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
        from server.database.relational_db.models.multi_agentic_system import (
            MultiAgenticSystem as MultiAgenticSystemModel,
        )

        predecessor = (
            session.query(CognitionEngineModel)
            .filter(
                CognitionEngineModel.cfn_id == engine.cfn_id,
                CognitionEngineModel.name == engine.name,
                CognitionEngineModel.id != engine.id,
                CognitionEngineModel.deleted_at.is_(None),
            )
            .order_by(CognitionEngineModel.created_at.desc(), CognitionEngineModel.id.desc())
            .first()
        )
        if not predecessor:
            return

        predecessor_mas_ids = (
            session.query(MasCognitionEngine.mas_id)
            .join(MultiAgenticSystemModel, MasCognitionEngine.mas_id == MultiAgenticSystemModel.id)
            .filter(
                MasCognitionEngine.ce_id == predecessor.id,
                MultiAgenticSystemModel.deleted_at.is_(None),
            )
            .all()
        )
        if not predecessor_mas_ids:
            return

        for (mas_id,) in sorted(predecessor_mas_ids):
            mas = lock_mas(session, mas_id)
            mas.updated_at = utc_now()
            session.add(
                MasCognitionEngine(
                    mas_id=mas_id,
                    ce_id=engine.id,
                    mas_config=copy.deepcopy(engine.mas_config) if engine.mas_config else None,
                    created_by=user_id,
                )
            )

    def get(self, ce_id: str) -> CognitionEngineDetail:
        """
        Get a Cognition Engine by ID.

        Raises HTTPException 404 if not found.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                engine = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.id == ce_id,
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .first()
                )

                if not engine:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"CE {ce_id} not found",
                    )

                _validate_cfn_active(session, engine.cfn_id)

                return _to_detail(engine)

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get cognition engine: {str(e)}",
            )

    def list(self, cfn_id: Optional[str] = None, status: Optional[str] = None) -> CognitionEngineList:
        """
        List Cognition Engines, optionally filtered by cfn_id and/or status.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                if cfn_id is not None:
                    _validate_cfn_active(session, cfn_id)

                query = session.query(CognitionEngineModel).filter(CognitionEngineModel.deleted_at.is_(None))

                if cfn_id is not None:
                    query = query.filter(CognitionEngineModel.cfn_id == cfn_id)
                if status is not None:
                    query = query.filter(CognitionEngineModel.status == status)

                engines = query.all()

                return CognitionEngineList(
                    cognition_engines=[
                        CognitionEngineListItem(
                            id=e.id,
                            cfn_id=e.cfn_id,
                            name=e.name,
                            version=e.version,
                            ce_type=e.ce_type,
                            **ce_connection(e),
                            enabled=e.enabled,
                            mas_auto_associate=e.mas_auto_associate,
                            status=e.status,
                            last_seen=e.last_seen,
                            mas_config=e.mas_config,
                            created_at=e.created_at,
                        )
                        for e in engines
                    ],
                    total=len(engines),
                )

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list cognition engines: {str(e)}",
            )

    def delete(self, ce_id: str, user_id: str) -> None:
        """
        Soft delete a Cognition Engine by ID.

        Raises HTTPException 404 if not found.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                engine = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.id == ce_id,
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .with_for_update()
                    .first()
                )

                if not engine:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"CE {ce_id} not found",
                    )

                _validate_cfn_active(session, engine.cfn_id)

                if engine.enabled:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="CE must be disabled before it can be deleted",
                    )

                from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
                from server.database.relational_db.models.multi_agentic_system import (
                    MultiAgenticSystem as MultiAgenticSystemModel,
                )

                attached = (
                    session.query(MasCognitionEngine)
                    .join(
                        MultiAgenticSystemModel,
                        MasCognitionEngine.mas_id == MultiAgenticSystemModel.id,
                    )
                    .filter(
                        MasCognitionEngine.ce_id == ce_id,
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                    .count()
                )
                if attached:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="CE cannot be deleted while it is associated with one or more MAS",
                    )

                cfn_id = engine.cfn_id
                engine.deleted_at = utc_now()
                engine.updated_by = user_id
                engine.updated_at = utc_now()

                session.commit()

            finally:
                session.close()

            from server.services.cognition_fabric_node import cognition_fabric_node_service

            cognition_fabric_node_service.update_config_for_cfn(cfn_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete cognition engine: {str(e)}",
            )

    def patch(
        self, ce_id: str, patch_data: CognitionEnginePatchRequest, user_id: str, *, reconnect: bool = False
    ) -> CognitionEngineDetail:
        """
        Partially update a Cognition Engine.

        Raises 400 if any immutable fields are included in the request.
        Raises 404 if the CE does not exist.
        """
        provided = {
            field: value
            for field, value in patch_data.model_dump(exclude_unset=True).items()
            if value is not None or field in _CLEARABLE_CE_FIELDS
        }

        attempted_immutable = _IMMUTABLE_CE_FIELDS & set(provided.keys())
        if attempted_immutable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following fields cannot be updated: {sorted(attempted_immutable)}",
            )

        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                engine = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.id == ce_id,
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .first()
                )

                if not engine:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"CE {ce_id} not found",
                    )

                # Serialize claims for a CFN, including reconnect PATCHes with unchanged addresses.
                _validate_cfn_active(session, engine.cfn_id, lock=True)
                session.refresh(engine)
                previous_endpoints = endpoint_keys(engine)

                # CFN reads these from its config snapshot, which is only regenerated by update_config_for_cfn
                cfn_visible_change = False
                for field in (*CE_CONNECTION_FIELDS, "enabled"):
                    if field in provided and provided[field] != getattr(engine, field):
                        setattr(engine, field, provided[field])
                        cfn_visible_change = True
                if "mas_auto_associate" in provided:
                    engine.mas_auto_associate = provided["mas_auto_associate"]

                # Re-check the merged row, but only when a connection field was sent,
                # so older rows don't block other patches
                if provided.keys() & set(CE_CONNECTION_FIELDS):
                    error = connection_error(
                        engine.enforcing_url,
                        engine.enforcing_endpoint,
                        engine.health_endpoint,
                        engine.notification_url,
                        engine.notification_endpoint,
                    )
                    if error:
                        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

                # UI forms send unchanged endpoint fields too. Only an explicit CE reconnect
                # or a real endpoint change establishes a new claim.
                if (reconnect and provided.keys() & _OWNERSHIP_FIELDS) or endpoint_keys(engine) != previous_endpoints:
                    cfn_visible_change = self._claim_endpoints(session, engine) or cfn_visible_change

                # A disabled CE is no longer probed, so its status would otherwise stay stale
                if provided.get("enabled") is False and engine.status != "offline":
                    engine.status = "offline"
                    cfn_visible_change = True

                engine.updated_by = user_id
                engine.updated_at = utc_now()

                cfn_id = engine.cfn_id
                session.commit()
                session.refresh(engine)

                detail = _to_detail(engine)

            finally:
                session.close()

            if cfn_visible_change:
                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_cfn(cfn_id)

            return detail

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update cognition engine: {str(e)}",
            )

    def _engine_for_association(self, session, ce_id):
        engine = (
            session.query(CognitionEngineModel)
            .filter(CognitionEngineModel.id == ce_id, CognitionEngineModel.deleted_at.is_(None))
            .with_for_update(read=True)
            .populate_existing()
            .first()
        )
        if not engine:
            raise HTTPException(404, f"CE {ce_id} not found")
        _validate_cfn_active(session, engine.cfn_id)
        return engine

    def _associate(self, session, mas, ce_id, user_id):
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
        from server.database.relational_db.models.workspace import Workspace

        engine = self._engine_for_association(session, ce_id)
        workspace = session.query(Workspace).filter(Workspace.id == mas.workspace_id).first()
        if not workspace or workspace.cfn_id != engine.cfn_id:
            raise HTTPException(422, "MAS belongs to a workspace on a different CFN than the CE")
        existing = session.query(MasCognitionEngine).filter_by(mas_id=mas.id, ce_id=ce_id).first()
        if existing:
            raise HTTPException(409, "CE is already associated with this MAS")
        assoc = MasCognitionEngine(
            mas_id=mas.id, ce_id=ce_id, mas_config=copy.deepcopy(engine.mas_config), created_by=user_id
        )
        session.add(assoc)
        mas.updated_at = utc_now()
        session.flush()
        return assoc

    def _disassociate(self, session, mas, ce_id):
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        self._engine_for_association(session, ce_id)
        assoc = session.query(MasCognitionEngine).filter_by(mas_id=mas.id, ce_id=ce_id).first()
        if not assoc:
            raise HTTPException(404, f"No association found between CE {ce_id} and MAS {mas.id}")
        session.delete(assoc)
        mas.updated_at = utc_now()

    def _patch_mas_config(self, session, mas, ce_id, mas_config, validate_keys=True):
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        engine = self._engine_for_association(session, ce_id)
        if mas_config is not None and not isinstance(mas_config, dict):
            raise HTTPException(422, "mas_config must be an object or null")
        factory_default = engine.mas_config or {}
        unknown = set(mas_config or {}) - set(factory_default) if validate_keys else set()
        if factory_default and unknown:
            raise HTTPException(
                422, f"Unknown mas_config keys: {sorted(unknown)}. " f"Allowed keys: {sorted(factory_default)}"
            )
        assoc = session.query(MasCognitionEngine).filter_by(mas_id=mas.id, ce_id=ce_id).first()
        if not assoc:
            raise HTTPException(404, "CE is not associated with this MAS")
        if assoc.mas_config != mas_config:
            assoc.mas_config = mas_config
            mas.updated_at = utc_now()

    def patch_mas_config(self, mas_id: str, ce_id: str, mas_config: dict) -> None:
        self._mutate_association(mas_id, lambda session, mas: self._patch_mas_config(session, mas, ce_id, mas_config))

    def associate(self, mas_id: str, ce_id: str, user_id: str) -> CognitionEngineAssociateResponse:
        return self._mutate_association(mas_id, lambda session, mas: self._associate(session, mas, ce_id, user_id))

    def disassociate(self, ce_id: str, mas_id: str, user_id: str, workspace_id: Optional[str] = None) -> None:
        self._mutate_association(mas_id, lambda session, mas: self._disassociate(session, mas, ce_id))

    def _mutate_association(self, mas_id, mutation):
        session = RelationalDB().get_session()
        try:
            mas = lock_mas(session, mas_id)
            workspace_id = mas.workspace_id
            result = mutation(session, mas)
            session.flush()
            response = (
                CognitionEngineAssociateResponse(ce_id=result.ce_id, mas_id=mas_id, created_at=result.created_at)
                if result is not None
                else None
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
        from server.services.cognition_fabric_node import cognition_fabric_node_service

        cognition_fabric_node_service.update_config_for_workspace(workspace_id)
        return response

    def list_for_cfn(self, cfn_id: str) -> list:
        """
        List Cognition Engines with raw auth for CFN consumption.

        Bypasses response masking so process_config_for_cfn() can decrypt credentials.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                engines = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.cfn_id == cfn_id,
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .all()
                )

                return [
                    {
                        "id": e.id,
                        "name": e.name,
                        "version": e.version,
                        "ce_type": e.ce_type,
                        **ce_connection(e),
                        "enabled": e.enabled,
                        "status": e.status,
                        "last_seen": format_utc(e.last_seen) if e.last_seen else None,
                        "mas_config": e.mas_config or {},
                        "mas_auto_associate": e.mas_auto_associate,
                    }
                    for e in engines
                ]

            finally:
                session.close()

        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to list cognition engines for CFN: {str(e)}")
            return []

    def list_probe_targets(self) -> List[CEProbeTarget]:
        """Snapshot enabled endpoint owners and their registration generations for the monitor.

        A database error is raised, not turned into an empty list, so the monitor can tell "could not read"
        from "no engines" and skip the tick.
        """
        db = RelationalDB()
        session = db.get_session()

        try:
            rows = (
                session.query(CognitionEngineModel.id, CognitionEngineModel.registration_token)
                .filter(
                    CognitionEngineModel.enabled.is_(True),
                    CognitionEngineModel.deleted_at.is_(None),
                    CognitionEngineModel.registration_token.is_not(None),
                )
                .all()
            )
            return [CEProbeTarget(row.id, row.registration_token) for row in rows]

        finally:
            session.close()

    def record_probe_result(
        self,
        ce_id: str,
        healthy: bool,
        offline_threshold_seconds: float,
        now: Optional[datetime] = None,
        *,
        registration_token: str,
    ) -> Optional[str]:
        """
        Apply a health probe result to an engine.

        Only the registration generation captured before probing may accept the result.
        A healthy probe sets last_seen to now and flips the engine online. An unhealthy probe flips an
        online engine offline only once more than offline_threshold_seconds have passed since its last
        successful probe (or since registration if it never answered).

        Returns the new status if it changed, otherwise None.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                engine = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.id == ce_id,
                        CognitionEngineModel.enabled.is_(True),
                        CognitionEngineModel.deleted_at.is_(None),
                        CognitionEngineModel.registration_token == registration_token,
                    )
                    .with_for_update()
                    .first()
                )
                # Disabled, deleted, superseded or re-registered while this probe was in flight.
                if not engine or registration_token is None:
                    return None

                now = now or utc_now()
                previous_status = engine.status
                cfn_id = engine.cfn_id

                if healthy:
                    engine.last_seen = now
                    engine.status = "online"
                elif engine.status == "online":
                    baseline = engine.last_seen or engine.created_at
                    if now - baseline > timedelta(seconds=offline_threshold_seconds):
                        engine.status = "offline"

                new_status = engine.status
                changed = new_status != previous_status
                session.commit()

            finally:
                session.close()

            # CFN's config snapshot carries CE status, so refresh it when a CE comes back online
            if changed and new_status == "online":
                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_cfn(cfn_id)

            return new_status if changed else None

        except Exception as e:
            logging.getLogger(__name__).error(f"Error recording probe result for cognition engine {ce_id}: {str(e)}")
            return None

    def _auto_attach(self, session, mas, cfn_id):
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
        from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode

        if not cfn_id:
            return
        active_cfn = (
            session.query(CognitionFabricNode)
            .filter(
                CognitionFabricNode.id == cfn_id,
                CognitionFabricNode.deleted_at.is_(None),
                CognitionFabricNode.enabled.is_(True),
            )
            .first()
        )
        if not active_cfn:
            logging.getLogger(__name__).warning(
                "Skipping automatic CE attachment for MAS %s: CFN %s not found or inactive",
                mas.id,
                cfn_id,
            )
            return
        auto_ces = (
            session.query(CognitionEngineModel)
            .filter(
                CognitionEngineModel.cfn_id == cfn_id,
                CognitionEngineModel.mas_auto_associate.is_(True),
                CognitionEngineModel.enabled.is_(True),
                CognitionEngineModel.deleted_at.is_(None),
            )
            .order_by(CognitionEngineModel.id)
            .all()
        )
        for engine in auto_ces:
            if not session.query(MasCognitionEngine).filter_by(mas_id=mas.id, ce_id=engine.id).first():
                self._associate(session, mas, engine.id, "system")

    def auto_attach_for_new_mas(self, mas_id: str, cfn_id: str) -> None:
        self._mutate_association(mas_id, lambda session, mas: self._auto_attach(session, mas, cfn_id))


def _validate_cfn_active(session, cfn_id: str, *, lock: bool = False) -> None:
    """Raise 404 if the CFN does not exist, is soft-deleted, or is disabled."""
    from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode

    query = session.query(CognitionFabricNode).filter(
        CognitionFabricNode.id == cfn_id,
        CognitionFabricNode.deleted_at.is_(None),
        CognitionFabricNode.enabled.is_(True),
    )
    if lock:
        query = query.with_for_update()
    cfn = query.first()
    if not cfn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cognition Fabric Node '{cfn_id}' not found or inactive",
        )


def _to_detail(engine: CognitionEngineModel) -> CognitionEngineDetail:
    return CognitionEngineDetail(
        id=engine.id,
        cfn_id=engine.cfn_id,
        name=engine.name,
        version=engine.version,
        ce_type=engine.ce_type,
        **ce_connection(engine),
        enabled=engine.enabled,
        mas_auto_associate=engine.mas_auto_associate,
        status=engine.status,
        last_seen=engine.last_seen,
        mas_config=engine.mas_config,
        created_at=engine.created_at,
        updated_at=engine.updated_at,
    )


# Singleton instance
cognition_engine_service = CognitionEngineService()
