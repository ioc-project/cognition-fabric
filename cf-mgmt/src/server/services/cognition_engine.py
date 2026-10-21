# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine service - Business logic for Cognition Engine operations"""

import copy
import logging
from datetime import datetime, timedelta, timezone
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

from server.utils import generate_uuid

_IMMUTABLE_CE_FIELDS = {"cfn_id", "name", "version", "ce_type"}

# An explicit null clears these on PATCH. A null on any other field is ignored.
_CLEARABLE_CE_FIELDS = {"notification_url", "notification_endpoint"}


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

        for (mas_id,) in predecessor_mas_ids:
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
                engine.deleted_at = datetime.now(timezone.utc)
                engine.updated_by = user_id
                engine.updated_at = datetime.now(timezone.utc)

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

    def patch(self, ce_id: str, patch_data: CognitionEnginePatchRequest, user_id: str) -> CognitionEngineDetail:
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

                _validate_cfn_active(session, engine.cfn_id)

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
                        engine.enforcing_endpoint,
                        engine.health_endpoint,
                        engine.notification_url,
                        engine.notification_endpoint,
                    )
                    if error:
                        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

                # A disabled CE is no longer probed, so its status would otherwise stay stale
                if provided.get("enabled") is False and engine.status != "offline":
                    engine.status = "offline"
                    cfn_visible_change = True

                engine.updated_by = user_id
                engine.updated_at = datetime.now(timezone.utc)

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

    def patch_mas_config(self, mas_id: str, ce_id: str, mas_config: dict) -> None:
        """Update the mas_config override for a specific CE-MAS association."""
        try:
            from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

            db = RelationalDB()
            session = db.get_session()
            try:
                engine = session.query(CognitionEngineModel).filter(CognitionEngineModel.id == ce_id).first()
                if not engine:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Cognition Engine not found",
                    )

                # Validate keys against the CE factory default
                factory_default = engine.mas_config or {}
                if factory_default:
                    unknown_keys = set(mas_config.keys()) - set(factory_default.keys())
                    if unknown_keys:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail=f"Unknown mas_config keys: {sorted(unknown_keys)}. "
                            f"Allowed keys: {sorted(factory_default.keys())}",
                        )

                assoc = (
                    session.query(MasCognitionEngine)
                    .filter(
                        MasCognitionEngine.mas_id == mas_id,
                        MasCognitionEngine.ce_id == ce_id,
                    )
                    .first()
                )
                if not assoc:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="CE is not associated with this MAS",
                    )
                assoc.mas_config = mas_config
                session.commit()

                cfn_id = engine.cfn_id
            finally:
                session.close()

            if cfn_id:
                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_cfn(cfn_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update mas_config: {str(e)}",
            )

    def associate(self, mas_id: str, ce_id: str, user_id: str) -> CognitionEngineAssociateResponse:
        """
        Associate a CE with a MAS.

        Validates:
        - CE exists and is not deleted
        - CE's CFN is active
        - MAS exists and is not deleted
        - MAS's workspace belongs to the same CFN as the CE (boundary constraint)
        - Association does not already exist
        """
        try:
            from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
            from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem
            from server.database.relational_db.models.workspace import Workspace

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
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"CE {ce_id} not found")

                _validate_cfn_active(session, engine.cfn_id)

                mas = (
                    session.query(MultiAgenticSystem)
                    .filter(
                        MultiAgenticSystem.id == mas_id,
                        MultiAgenticSystem.deleted_at.is_(None),
                    )
                    .first()
                )
                if not mas:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"MAS {mas_id} not found",
                    )

                workspace = session.query(Workspace).filter(Workspace.id == mas.workspace_id).first()
                if not workspace or workspace.cfn_id != engine.cfn_id:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="MAS belongs to a workspace on a different CFN than the CE",
                    )

                workspace_id = mas.workspace_id  # Capture before commit expires attributes

                existing = (
                    session.query(MasCognitionEngine)
                    .filter(
                        MasCognitionEngine.mas_id == mas_id,
                        MasCognitionEngine.ce_id == ce_id,
                    )
                    .first()
                )
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="CE is already associated with this MAS",
                    )

                association = MasCognitionEngine(
                    mas_id=mas_id,
                    ce_id=ce_id,
                    mas_config=copy.deepcopy(engine.mas_config) if engine.mas_config else None,
                    created_by=user_id,
                )
                session.add(association)
                session.commit()
                session.refresh(association)

                response = CognitionEngineAssociateResponse(
                    ce_id=ce_id,
                    mas_id=mas_id,
                    created_at=association.created_at,
                )

            finally:
                session.close()

            from server.services.cognition_fabric_node import cognition_fabric_node_service

            cognition_fabric_node_service.update_config_for_workspace(workspace_id)

            return response

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to associate cognition engine: {str(e)}",
            )

    def disassociate(self, ce_id: str, mas_id: str, user_id: str, workspace_id: Optional[str] = None) -> None:
        """
        Remove the association between a CE and a MAS.

        Raises 404 if the CE does not exist or the association does not exist.
        """
        try:
            from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

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
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"CE {ce_id} not found")

                _validate_cfn_active(session, engine.cfn_id)

                association = (
                    session.query(MasCognitionEngine)
                    .filter(
                        MasCognitionEngine.ce_id == ce_id,
                        MasCognitionEngine.mas_id == mas_id,
                    )
                    .first()
                )
                if not association:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"No association found between CE {ce_id} and MAS {mas_id}",
                    )

                session.delete(association)
                session.commit()

            finally:
                session.close()

            if workspace_id:
                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_workspace(workspace_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to disassociate cognition engine: {str(e)}",
            )

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
                        "last_seen": e.last_seen.isoformat() if e.last_seen else None,
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

    def list_probe_targets(self) -> List[str]:
        """List the IDs of the enabled, non-deleted engines the health monitor must probe.

        A database error is raised, not turned into an empty list, so the monitor can tell "could not read"
        from "no engines" and skip the tick.
        """
        db = RelationalDB()
        session = db.get_session()

        try:
            rows = (
                session.query(CognitionEngineModel.id)
                .filter(
                    CognitionEngineModel.enabled.is_(True),
                    CognitionEngineModel.deleted_at.is_(None),
                )
                .all()
            )
            return [row.id for row in rows]

        finally:
            session.close()

    def record_probe_result(
        self,
        ce_id: str,
        healthy: bool,
        offline_threshold_seconds: float,
        now: Optional[datetime] = None,
    ) -> Optional[str]:
        """
        Apply a health probe result to an engine.

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
                    )
                    .first()
                )
                # A CE disabled while its probe was in flight keeps the offline status disabling gave it
                if not engine:
                    return None

                now = now or datetime.now(timezone.utc)
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

    def auto_attach_for_new_mas(self, mas_id: str, cfn_id: str) -> None:
        """Auto-associate: on MAS create/update, associate all enabled mas_auto_associate=True CEs in the CFN."""
        if not cfn_id:
            return

        try:
            from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

            db = RelationalDB()
            session = db.get_session()

            try:
                auto_ces = (
                    session.query(CognitionEngineModel)
                    .filter(
                        CognitionEngineModel.cfn_id == cfn_id,
                        CognitionEngineModel.mas_auto_associate.is_(True),
                        CognitionEngineModel.enabled.is_(True),
                        CognitionEngineModel.deleted_at.is_(None),
                    )
                    .all()
                )

                for ce_engine in auto_ces:
                    exists = (
                        session.query(MasCognitionEngine)
                        .filter(
                            MasCognitionEngine.ce_id == ce_engine.id,
                            MasCognitionEngine.mas_id == mas_id,
                        )
                        .first()
                    )
                    if not exists:
                        session.add(
                            MasCognitionEngine(
                                mas_id=mas_id,
                                ce_id=ce_engine.id,
                                mas_config=copy.deepcopy(ce_engine.mas_config) if ce_engine.mas_config else None,
                                created_by="system",
                            )
                        )

                auto_ce_ids = [e.id for e in auto_ces]

                if auto_ce_ids:
                    session.commit()

            finally:
                session.close()

        except Exception as e:
            logging.getLogger(__name__).error(f"Auto-attach MAS {mas_id} to CEs failed: {e}")


def _validate_cfn_active(session, cfn_id: str) -> None:
    """Raise 404 if the CFN does not exist, is soft-deleted, or is disabled."""
    from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode

    cfn = (
        session.query(CognitionFabricNode)
        .filter(
            CognitionFabricNode.id == cfn_id,
            CognitionFabricNode.deleted_at.is_(None),
            CognitionFabricNode.enabled.is_(True),
        )
        .first()
    )
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
