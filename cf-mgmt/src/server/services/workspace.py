# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Workspace service - Business logic for workspace operations"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, exists
from sqlalchemy.exc import IntegrityError


from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem as MASModel
from server.database.relational_db.models.workspace import Workspace as WorkspaceModel
from server.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceList,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from server.utils import generate_uuid

logger = logging.getLogger(__name__)


class WorkspaceService:
    """Service layer for workspace business logic"""

    DEFAULT_WORKSPACE_NAME = "Default Workspace"

    def _get_dependency_status(self, session, workspace_id: str):
        """Check if workspace has dependent objects before deletion.
        Returns a tuple: (has_dependents: bool, detail: str)
        """
        mas_exists = bool(
            session.query(
                exists().where(and_(MASModel.workspace_id == workspace_id, MASModel.deleted_at.is_(None)))
            ).scalar()
        )

        if not mas_exists:
            return False, ""

        mas_count = (
            session.query(MASModel).filter(MASModel.workspace_id == workspace_id, MASModel.deleted_at.is_(None)).count()
        )

        found_parts = []
        if mas_count > 0:
            found_parts.append(f"{mas_count} MAS")
        return True, ", ".join(found_parts)

    def create(
        self, workspace_data: WorkspaceCreate, creator_user_id: str, workspace_id: str = None
    ) -> WorkspaceResponse:
        """Create a new workspace

        Args:
            workspace_data: Workspace creation data
            creator_user_id: ID of the user creating the workspace
            workspace_id: Optional hardcoded workspace ID (for admin default workspace only)

        Raises:
            HTTPException: 404 if CFN not found, 400 if CFN required but not provided, 409 on conflict
        """
        from server.database.relational_db.models.cognition_fabric_node import (
            CognitionFabricNode as CognitionFabricNodeModel,
        )

        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                # Validate CFN if provided
                if workspace_data.cfn_id:
                    cfn = (
                        session.query(CognitionFabricNodeModel)
                        .filter(
                            CognitionFabricNodeModel.id == workspace_data.cfn_id,
                            CognitionFabricNodeModel.deleted_at.is_(None),
                        )
                        .first()
                    )

                    if not cfn:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"CFN with id '{workspace_data.cfn_id}' not found or has been deleted",
                        )

                    if not cfn.enabled:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"CFN '{workspace_data.cfn_id}' is disabled. Please enable it first.",
                        )

                workspace_kwargs = {
                    "name": workspace_data.name,
                    "users": [],  # Legacy field, kept for backwards compatibility
                    "config": workspace_data.config,
                    "created_by": creator_user_id,
                    "cfn_id": workspace_data.cfn_id,
                }

                # Add workspace_id - either provided (for admin default workspace) or generate new one
                workspace_kwargs["id"] = workspace_id if workspace_id else generate_uuid()

                # Check if workspace name already exists for the user to prevent duplicates
                existing_workspace = (
                    session.query(WorkspaceModel)
                    .filter(
                        and_(
                            WorkspaceModel.name == workspace_data.name,
                            WorkspaceModel.created_by == creator_user_id,
                            WorkspaceModel.deleted_at.is_(None),
                        )
                    )
                    .first()
                )

                if existing_workspace:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Workspace with name '{workspace_data.name}' already exists",
                    )

                new_workspace = WorkspaceModel(**workspace_kwargs)

                session.add(new_workspace)
                session.flush()

                session.commit()
                session.refresh(new_workspace)

                if workspace_data.cfn_id:
                    from server.services.cognition_fabric_node import cognition_fabric_node_service

                    cfn = (
                        session.query(CognitionFabricNodeModel)
                        .filter(CognitionFabricNodeModel.id == workspace_data.cfn_id)
                        .first()
                    )
                    if cfn:
                        cfn.config_version = (cfn.config_version or 0) + 1
                        workspace_ids = (
                            session.query(WorkspaceModel.id)
                            .filter(WorkspaceModel.cfn_id == workspace_data.cfn_id, WorkspaceModel.deleted_at.is_(None))
                            .all()
                        )
                        ws_ids = [ws.id for ws in workspace_ids]
                        cfn.config = cognition_fabric_node_service.generate_config(
                            cfn.id, ws_ids, cfn.cfn_config, cfn.config_version
                        )
                        session.commit()

                response = WorkspaceResponse(id=new_workspace.id)  # type: ignore[arg-type]

                return response

            finally:
                session.close()

        except HTTPException:
            raise
        except IntegrityError as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Workspace creation failed due to data conflict: {str(e)}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create workspace: {str(e)}",
            )

    def list(self, user_id: str, user_role: str) -> WorkspaceList:
        """List workspaces accessible to the user.

        Super admins see all workspaces. Regular users see workspaces they created.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                from server.database.relational_db.models.user import User as UserModel

                # Super admins can see all workspaces (future feature)
                if user_role == "super_admin":
                    workspaces = session.query(WorkspaceModel).filter(WorkspaceModel.deleted_at.is_(None)).all()
                else:
                    # Regular users see only workspaces they created
                    workspaces = (
                        session.query(WorkspaceModel)
                        .filter(
                            and_(
                                WorkspaceModel.deleted_at.is_(None),
                                WorkspaceModel.created_by == user_id,
                            )
                        )
                        .all()
                    )

                # Get creator usernames for all workspaces
                workspace_ids = [ws.id for ws in workspaces]
                creator_map = {}
                if workspace_ids:
                    creators = (
                        session.query(WorkspaceModel.id, UserModel.username)
                        .outerjoin(UserModel, WorkspaceModel.created_by == UserModel.id)
                        .filter(WorkspaceModel.id.in_(workspace_ids))
                        .all()
                    )
                    creator_map = {ws_id: username for ws_id, username in creators}

                workspace_details = [
                    WorkspaceDetail(
                        id=workspace.id,  # type: ignore[arg-type]
                        name=workspace.name,  # type: ignore[arg-type]
                        cfn_id=workspace.cfn_id,  # type: ignore[arg-type]
                        created_at=workspace.created_at,  # type: ignore[arg-type]
                        created_by=workspace.created_by,  # type: ignore[arg-type]
                        created_by_username=creator_map.get(workspace.id),  # type: ignore[arg-type]
                        config=workspace.config,  # type: ignore[arg-type]
                    )
                    for workspace in workspaces
                ]

                return WorkspaceList(workspaces=workspace_details, total=len(workspace_details))

            finally:
                session.close()

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list workspaces: {str(e)}",
            )

    def get(self, workspace_id: str, user_id: str = None, user_role: str = None) -> WorkspaceDetail:
        """Get a specific workspace by ID.

        If user_id and user_role are provided, verifies the user has access to the workspace.
        Super admins have access to all workspaces. Regular users must be the creator.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                workspace = (
                    session.query(WorkspaceModel)
                    .filter(
                        and_(
                            WorkspaceModel.id == workspace_id,
                            WorkspaceModel.deleted_at.is_(None),
                        )
                    )
                    .first()
                )

                if not workspace:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Workspace not found",
                    )

                # Check access if user info is provided
                if user_id and user_role:
                    if user_role != "super_admin" and workspace.created_by != user_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: You must be the workspace creator",
                        )

                # Get creator username
                from server.database.relational_db.models.user import User as UserModel

                creator_username = None
                if workspace.created_by:
                    creator = session.query(UserModel).filter(UserModel.id == workspace.created_by).first()
                    creator_username = creator.username if creator else None

                return WorkspaceDetail(
                    id=workspace.id,  # type: ignore[arg-type]
                    name=workspace.name,  # type: ignore[arg-type]
                    cfn_id=workspace.cfn_id,  # type: ignore[arg-type]
                    created_at=workspace.created_at,  # type: ignore[arg-type]
                    created_by=workspace.created_by,  # type: ignore[arg-type]
                    created_by_username=creator_username,
                    config=workspace.config,  # type: ignore[arg-type]
                )

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get workspace: {str(e)}",
            )

    def update(
        self, workspace_id: str, workspace_data: WorkspaceUpdate, user_id: str = None, user_role: str = None
    ) -> WorkspaceDetail:
        """Update a workspace.

        If user_id and user_role are provided, verifies the user has access to the workspace.
        Super admins have access to all workspaces. Regular users must be the creator.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                workspace = (
                    session.query(WorkspaceModel)
                    .filter(
                        and_(
                            WorkspaceModel.id == workspace_id,
                            WorkspaceModel.deleted_at.is_(None),
                        )
                    )
                    .first()
                )

                if not workspace:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Workspace not found",
                    )

                # Check access if user info is provided
                if user_id and user_role:
                    if user_role != "super_admin" and workspace.created_by != user_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: You must be the workspace creator",
                        )

                # Update only provided fields
                if workspace_data.name is not None:
                    workspace.name = workspace_data.name  # type: ignore[assignment]

                # Handle CFN reassignment
                old_cfn_id = workspace.cfn_id
                if workspace_data.cfn_id is not None:
                    # Validate new CFN exists and is enabled
                    from server.database.relational_db.models.cognition_fabric_node import (
                        CognitionFabricNode as CognitionFabricNodeModel,
                    )

                    cfn = (
                        session.query(CognitionFabricNodeModel)
                        .filter(
                            CognitionFabricNodeModel.id == workspace_data.cfn_id,
                            CognitionFabricNodeModel.deleted_at.is_(None),
                        )
                        .first()
                    )

                    if not cfn:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"CFN with id '{workspace_data.cfn_id}' not found or has been deleted",
                        )

                    if not cfn.enabled:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"CFN '{workspace_data.cfn_id}' is disabled. Please enable it first.",
                        )

                    workspace.cfn_id = workspace_data.cfn_id  # type: ignore[assignment]

                workspace.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]

                session.commit()
                session.refresh(workspace)

                # Update CFN config_version if workspace's CFN association changed
                if workspace_data.cfn_id is not None and old_cfn_id != workspace_data.cfn_id:
                    from server.database.relational_db.models.cognition_fabric_node import (
                        CognitionFabricNode as CognitionFabricNodeModel,
                    )
                    from server.services.cognition_fabric_node import cognition_fabric_node_service

                    # Update old CFN if it existed (workspace removed from it)
                    if old_cfn_id:
                        old_cfn = (
                            session.query(CognitionFabricNodeModel)
                            .filter(CognitionFabricNodeModel.id == old_cfn_id)
                            .first()
                        )
                        if old_cfn:
                            old_cfn.config_version = (old_cfn.config_version or 0) + 1
                            # Regenerate config without removed workspace
                            old_workspace_ids = (
                                session.query(WorkspaceModel.id)
                                .filter(WorkspaceModel.cfn_id == old_cfn_id, WorkspaceModel.deleted_at.is_(None))
                                .all()
                            )
                            old_ws_ids = [ws.id for ws in old_workspace_ids]
                            old_cfn.config = cognition_fabric_node_service.generate_config(
                                old_cfn.id, old_ws_ids, old_cfn.cfn_config, old_cfn.config_version
                            )

                    # Update new CFN (workspace added to it)
                    if workspace_data.cfn_id:
                        new_cfn = (
                            session.query(CognitionFabricNodeModel)
                            .filter(CognitionFabricNodeModel.id == workspace_data.cfn_id)
                            .first()
                        )
                        if new_cfn:
                            new_cfn.config_version = (new_cfn.config_version or 0) + 1
                            # Regenerate config with added workspace
                            new_workspace_ids = (
                                session.query(WorkspaceModel.id)
                                .filter(
                                    WorkspaceModel.cfn_id == workspace_data.cfn_id, WorkspaceModel.deleted_at.is_(None)
                                )
                                .all()
                            )
                            new_ws_ids = [ws.id for ws in new_workspace_ids]
                            new_cfn.config = cognition_fabric_node_service.generate_config(
                                new_cfn.id, new_ws_ids, new_cfn.cfn_config, new_cfn.config_version
                            )

                    session.commit()

                # Get creator username
                from server.database.relational_db.models.user import User as UserModel

                creator_username = None
                if workspace.created_by:
                    creator = session.query(UserModel).filter(UserModel.id == workspace.created_by).first()
                    creator_username = creator.username if creator else None

                response = WorkspaceDetail(
                    id=workspace.id,  # type: ignore[arg-type]
                    name=workspace.name,  # type: ignore[arg-type]
                    cfn_id=workspace.cfn_id,  # type: ignore[arg-type]
                    created_at=workspace.created_at,  # type: ignore[arg-type]
                    updated_at=workspace.updated_at,  # type: ignore[arg-type]
                    created_by=workspace.created_by,  # type: ignore[arg-type]
                    created_by_username=creator_username,
                    config=workspace.config,  # type: ignore[arg-type]
                )

                return response

            finally:
                session.close()

        except HTTPException:
            raise
        except IntegrityError as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Workspace update failed due to data conflict: {str(e)}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update workspace: {str(e)}",
            )

    def delete(
        self,
        workspace_id: str,
        user_id: str = None,
        user_role: str = None,
        allow_default_delete: bool = False,
    ) -> dict:
        """Delete a workspace (soft delete only).

        If user_id and user_role are provided, verifies the user has access to the workspace.
        Super admins have access to all workspaces. Regular users must be the creator.
        Blocks deletion of the Default Workspace unless allow_default_delete is True.
        """
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                workspace = (
                    session.query(WorkspaceModel)
                    .filter(
                        and_(
                            WorkspaceModel.id == workspace_id,
                            WorkspaceModel.deleted_at.is_(None),
                        )
                    )
                    .first()
                )

                if not workspace:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Workspace not found",
                    )

                # Block deletion of the Default Workspace (only allow via internal API)
                if (not allow_default_delete) and (workspace.name == self.DEFAULT_WORKSPACE_NAME):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Failed to delete workspace: Default Workspace cannot be deleted",
                    )

                # Check access if user info is provided
                if user_id and user_role:
                    if user_role != "super_admin" and workspace.created_by != user_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: You must be the workspace creator",
                        )

                # Validate dependent objects - soft delete requires no dependencies
                has_deps, found_detail = self._get_dependency_status(session, workspace_id)
                if has_deps:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            "Workspace has dependent objects. "
                            "Delete all dependent objects before deleting the workspace. "
                            f"Found: {found_detail}."
                        ),
                    )

                workspace.deleted_at = datetime.now(timezone.utc)  # type: ignore[assignment]
                message = "Workspace deleted successfully"

                # Track CFN ID before deletion
                deleted_workspace_cfn_id = workspace.cfn_id

                session.commit()

                # Update CFN config_version if workspace was associated with a CFN
                if deleted_workspace_cfn_id:
                    from server.database.relational_db.models.cognition_fabric_node import (
                        CognitionFabricNode as CognitionFabricNodeModel,
                    )
                    from server.services.cognition_fabric_node import cognition_fabric_node_service

                    cfn = (
                        session.query(CognitionFabricNodeModel)
                        .filter(CognitionFabricNodeModel.id == deleted_workspace_cfn_id)
                        .first()
                    )
                    if cfn:
                        cfn.config_version = (cfn.config_version or 0) + 1
                        # Regenerate config without deleted workspace
                        workspace_ids = (
                            session.query(WorkspaceModel.id)
                            .filter(
                                WorkspaceModel.cfn_id == deleted_workspace_cfn_id, WorkspaceModel.deleted_at.is_(None)
                            )
                            .all()
                        )
                        ws_ids = [ws.id for ws in workspace_ids]
                        cfn.config = cognition_fabric_node_service.generate_config(
                            cfn.id, ws_ids, cfn.cfn_config, cfn.config_version
                        )
                        session.commit()

                return {"message": message}

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete workspace: {str(e)}",
            )

    def exists(self, workspace_id: str) -> bool:
        """Check if a workspace exists"""
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                workspace = (
                    session.query(WorkspaceModel)
                    .filter(
                        and_(
                            WorkspaceModel.id == workspace_id,
                            WorkspaceModel.deleted_at.is_(None),
                        )
                    )
                    .first()
                )

                return workspace is not None

            finally:
                session.close()

        except Exception:
            return False


# Create singleton instance
workspace_service = WorkspaceService()
