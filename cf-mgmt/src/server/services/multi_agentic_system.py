# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Multi-Agentic System (MAS) service - Business logic for MAS operations"""

from server.utils.timestamps import utc_now

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from server.schemas.cognition_engine import ce_connection
from server.schemas.multi_agentic_system import (
    MultiAgenticSystemRequest,
    MultiAgenticSystemUpdate,
    MultiAgenticSystemResponse,
    MultiAgenticSystem as MultiAgenticSystemSchema,
    MultiAgenticSystems,
    AgentDetail,
    AgentIdentity,
    MASQueryByIdentity,
    MasCognitionEngineItem,
    MCPServerDetail,
    MCPToolDetail,
)
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem as MultiAgenticSystemModel
from server.database.relational_db.models.agent import Agent as AgentModel
from server.database.relational_db.models.mcp_server import MCPServer as MCPServerModel
from server.database.relational_db.models.mcp_tool import MCPTool as MCPToolModel
from server.database.relational_db.db import RelationalDB
from server.services.workspace import workspace_service
from server.utils import generate_uuid
from server.services.mas_metadata import (
    apply_metadata,
    capture_native_snapshots,
    lock_mas,
    lock_workspace_cfn,
    read_metadata,
    update_agent_metadata,
    update_native_snapshot,
    validate_final_state,
)


class MultiAgenticSystemService:
    """Service layer for MAS business logic"""

    def _agent_row_to_schema(self, agent_row: AgentModel) -> AgentDetail:
        identity = None
        if agent_row.identity_type:
            identity = AgentIdentity(
                type=agent_row.identity_type,
                identifiers=agent_row.identity_identifiers or {},
            )

        return AgentDetail(
            agent_descriptions=agent_row.agent_descriptions,
            metadata=agent_row.agent_metadata,
            cf_agent_id=agent_row.cf_agent_id,
            agent_id=agent_row.agent_id,
            name=agent_row.name,
            description=agent_row.description,
            url=agent_row.url,
            identity=identity,
            config=agent_row.config,
        )

    def _mcp_server_row_to_schema(self, server_row: MCPServerModel, tools: list[MCPToolModel]) -> MCPServerDetail:
        tool_details = [
            MCPToolDetail(
                definition=tool.definition,
                source_snapshot=tool.source_snapshot,
                provenance=tool.provenance,
                protocol_version=tool.protocol_version,
                id=tool.id,
                name=tool.name,
                description=tool.description,
                parameters=tool.parameters,
            )
            for tool in tools
        ]

        return MCPServerDetail(
            id=server_row.id,
            name=server_row.name,
            transport=server_row.transport,
            description=server_row.description,
            tools=tool_details if tool_details else None,
            config=server_row.config,
        )

    def _enrich_mas(
        self,
        mas: MultiAgenticSystemModel,
        agents: list,
        mcp_servers: list = None,
        ce_associations: list = None,
    ) -> MultiAgenticSystemSchema:
        enriched_agents = [self._agent_row_to_schema(a) for a in agents] if agents is not None else None

        return MultiAgenticSystemSchema(
            **read_metadata(mas, mcp_servers),
            id=mas.id,
            workspace_id=mas.workspace_id,
            name=mas.name,
            description=mas.description,
            agents=enriched_agents,
            mcp_servers=mcp_servers,
            config=mas.config,
            cognition_engines=ce_associations or [],
            created_at=mas.created_at,
            updated_at=mas.updated_at,
            created_by=mas.created_by,
            updated_by=mas.updated_by,
        )

    def _save_agents(self, session, mas_id: str, agents_data) -> list:
        """Create agent rows from AgentConfig list. Returns the created AgentModel instances."""
        if not agents_data:
            return []

        # Assign server-generated UUIDs where agent_id is not provided
        for agent_cfg in agents_data:
            if not agent_cfg.agent_id:
                agent_cfg.agent_id = generate_uuid()

        # Validate no duplicate agent_ids
        seen_ids = set()
        for agent_cfg in agents_data:
            if agent_cfg.agent_id in seen_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Duplicate agent_id in request: '{agent_cfg.agent_id}'",
                )
            seen_ids.add(agent_cfg.agent_id)

        # Validate no duplicate agent names within the same MAS
        seen_names = set()
        for agent_cfg in agents_data:
            if agent_cfg.name:
                if agent_cfg.name in seen_names:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Duplicate agent name in request: '{agent_cfg.name}'",
                    )
                seen_names.add(agent_cfg.name)

        agent_rows = []
        for agent_cfg in agents_data:
            identity_type = None
            identity_identifiers = None
            if agent_cfg.identity:
                identity_type = agent_cfg.identity.type if agent_cfg.identity.type else None
                identity_identifiers = agent_cfg.identity.identifiers

            row = AgentModel(
                mas_id=mas_id,
                agent_id=agent_cfg.agent_id,
                name=agent_cfg.name,
                description=agent_cfg.description,
                url=agent_cfg.url,
                identity_type=identity_type,
                identity_identifiers=identity_identifiers,
                config=agent_cfg.config,
            )
            update_agent_metadata(row, agent_cfg)
            session.add(row)
            agent_rows.append(row)

        return agent_rows

    def _sync_agents(self, session, mas_id: str, incoming_agents) -> None:
        """Sync agents by runtime ID, deleting removed rows before reusing their names."""
        now = utc_now()

        # Assign server-generated UUIDs where agent_id is not provided
        for agent_cfg in incoming_agents:
            if not agent_cfg.agent_id:
                agent_cfg.agent_id = generate_uuid()

        # Validate no duplicate agent_ids in incoming list
        seen_ids = set()
        for agent_cfg in incoming_agents:
            if agent_cfg.agent_id in seen_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Duplicate agent_id in request: '{agent_cfg.agent_id}'",
                )
            seen_ids.add(agent_cfg.agent_id)

        # Validate no duplicate agent names within the same MAS
        seen_names = set()
        for agent_cfg in incoming_agents:
            if agent_cfg.name:
                if agent_cfg.name in seen_names:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Duplicate agent name in request: '{agent_cfg.name}'",
                    )
                seen_names.add(agent_cfg.name)

        existing_rows = session.query(AgentModel).filter(AgentModel.mas_id == mas_id).all()
        existing_map = {row.agent_id: row for row in existing_rows}

        incoming_ids = {agent_cfg.agent_id for agent_cfg in incoming_agents}
        removed_rows = [row for agent_id, row in existing_map.items() if agent_id not in incoming_ids]
        for row in removed_rows:
            session.delete(row)
        if removed_rows:
            # Release removed names before SQLAlchemy flushes inserts/updates.
            session.flush()

        for agent_cfg in incoming_agents:
            identity_type = None
            identity_identifiers = None
            if agent_cfg.identity:
                identity_type = agent_cfg.identity.type if agent_cfg.identity.type else None
                identity_identifiers = agent_cfg.identity.identifiers

            if agent_cfg.agent_id in existing_map:
                row = existing_map[agent_cfg.agent_id]
                row.name = agent_cfg.name
                row.description = agent_cfg.description
                row.url = agent_cfg.url
                row.identity_type = identity_type
                row.identity_identifiers = identity_identifiers
                row.config = agent_cfg.config
                row.updated_at = now
            else:
                row = AgentModel(
                    mas_id=mas_id,
                    agent_id=agent_cfg.agent_id,
                    name=agent_cfg.name,
                    description=agent_cfg.description,
                    url=agent_cfg.url,
                    identity_type=identity_type,
                    identity_identifiers=identity_identifiers,
                    config=agent_cfg.config,
                )
                session.add(row)
            update_agent_metadata(row, agent_cfg)

    def _validate_mcp_server_names(self, mcp_servers_data) -> None:
        """Match persisted name uniqueness, including empty server/tool names."""
        if not mcp_servers_data:
            return

        seen_names = set()
        for server_cfg in mcp_servers_data:
            if server_cfg.name in seen_names:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Duplicate MCP server name in request: '{server_cfg.name}'",
                )
            seen_names.add(server_cfg.name)

            # A blank server name does not exempt its tools from validation.
            seen_tool_names = set()
            for tool_cfg in server_cfg.tools or []:
                if tool_cfg.name in seen_tool_names:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Duplicate tool name '{tool_cfg.name}' in MCP server '{server_cfg.name}'",
                    )
                seen_tool_names.add(tool_cfg.name)

    def _save_mcp_servers(self, session, mas_id: str, mcp_servers_data) -> list:
        """Create MCP server and tool rows. Returns the created MCPServerModel instances."""
        if not mcp_servers_data:
            return []

        self._validate_mcp_server_names(mcp_servers_data)

        server_rows = []
        for server_cfg in mcp_servers_data:
            server_id = generate_uuid()
            server_row = MCPServerModel(
                id=server_id,
                mas_id=mas_id,
                name=server_cfg.name,
                transport=server_cfg.transport,
                description=server_cfg.description,
                config=server_cfg.config,
            )
            session.add(server_row)
            server_rows.append(server_row)

            # Create tool rows for this server
            if server_cfg.tools:
                for tool_cfg in server_cfg.tools:
                    tool_row = MCPToolModel(
                        id=generate_uuid(),
                        mcp_server_id=server_id,
                        name=tool_cfg.name,
                        description=tool_cfg.description,
                        parameters=tool_cfg.parameters,
                    )
                    update_native_snapshot(tool_row, tool_cfg)
                    session.add(tool_row)

        return server_rows

    def _sync_mcp_servers(self, session, mas_id: str, incoming_servers) -> None:
        """Diff-based MCP server sync: insert new, update existing, delete removed. Preserves server IDs and config."""
        now = utc_now()

        self._validate_mcp_server_names(incoming_servers)

        existing_rows = session.query(MCPServerModel).filter(MCPServerModel.mas_id == mas_id).all()
        existing_map = {row.name: row for row in existing_rows}

        incoming_names = set()
        for server_cfg in incoming_servers:
            incoming_names.add(server_cfg.name)

            if server_cfg.name in existing_map:
                # Update existing server
                row = existing_map[server_cfg.name]
                row.transport = server_cfg.transport
                row.description = server_cfg.description
                # Preserve config if incoming is None
                if server_cfg.config is not None:
                    row.config = server_cfg.config
                row.updated_at = now

                # Sync tools for this server
                self._sync_mcp_tools(session, row.id, server_cfg.tools or [])
            else:
                # Create new server
                server_id = generate_uuid()
                server_row = MCPServerModel(
                    id=server_id,
                    mas_id=mas_id,
                    name=server_cfg.name,
                    transport=server_cfg.transport,
                    description=server_cfg.description,
                    config=server_cfg.config,
                )
                session.add(server_row)

                # Create tools for new server
                if server_cfg.tools:
                    for tool_cfg in server_cfg.tools:
                        tool_row = MCPToolModel(
                            id=generate_uuid(),
                            mcp_server_id=server_id,
                            name=tool_cfg.name,
                            description=tool_cfg.description,
                            parameters=tool_cfg.parameters,
                        )
                        update_native_snapshot(tool_row, tool_cfg)
                        session.add(tool_row)

        # Delete servers not in incoming list (cascade deletes tools)
        for name, row in existing_map.items():
            if name not in incoming_names:
                session.delete(row)

    def _sync_mcp_tools(self, session, server_id: str, incoming_tools) -> None:
        """Diff-based MCP tool sync within a server: insert new, update existing, delete removed."""
        now = utc_now()

        existing_tools = session.query(MCPToolModel).filter(MCPToolModel.mcp_server_id == server_id).all()
        existing_map = {tool.name: tool for tool in existing_tools}

        incoming_names = set()
        for tool_cfg in incoming_tools:
            incoming_names.add(tool_cfg.name)

            if tool_cfg.name in existing_map:
                # Update existing tool
                tool = existing_map[tool_cfg.name]
                tool.description = tool_cfg.description
                tool.parameters = tool_cfg.parameters
                update_native_snapshot(tool, tool_cfg)
                tool.updated_at = now
            else:
                # Create new tool
                tool_row = MCPToolModel(
                    id=generate_uuid(),
                    mcp_server_id=server_id,
                    name=tool_cfg.name,
                    description=tool_cfg.description,
                    parameters=tool_cfg.parameters,
                )
                update_native_snapshot(tool_row, tool_cfg)
                session.add(tool_row)

        # Delete tools not in incoming list
        for name, tool in existing_map.items():
            if name not in incoming_names:
                session.delete(tool)

    def _fetch_mcp_servers_for_mas(self, session, mas_id: str) -> list[MCPServerDetail]:
        """Fetch MCP servers and their tools for a MAS."""
        servers = session.query(MCPServerModel).filter(MCPServerModel.mas_id == mas_id).all()
        if not servers:
            return []

        server_ids = [s.id for s in servers]
        tools = session.query(MCPToolModel).filter(MCPToolModel.mcp_server_id.in_(server_ids)).all()

        # Group tools by server
        tools_by_server = {}
        for tool in tools:
            tools_by_server.setdefault(tool.mcp_server_id, []).append(tool)

        return [self._mcp_server_row_to_schema(server, tools_by_server.get(server.id, [])) for server in servers]

    def _sync_ce_membership(self, session, mas, request, user_id, creating=False):
        from server.services.cognition_engine import cognition_engine_service
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
        from server.database.relational_db.models.workspace import Workspace

        workspace = session.query(Workspace).filter(Workspace.id == mas.workspace_id).first()
        cognition_engine_service._auto_attach(session, mas, workspace.cfn_id if workspace else None)
        if request.cognition_engine_ids is not None:
            existing = {
                row.ce_id for row in session.query(MasCognitionEngine).filter(MasCognitionEngine.mas_id == mas.id)
            }
            incoming = set(request.cognition_engine_ids)
            for ce_id in sorted(incoming - existing):
                cognition_engine_service._associate(session, mas, ce_id, user_id)
            if not creating:
                for ce_id in sorted(existing - incoming):
                    cognition_engine_service._disassociate(session, mas, ce_id)
        session.flush()
        for ce_id, override in (getattr(request, "cognition_engine_configs", None) or {}).items():
            if session.query(MasCognitionEngine).filter_by(mas_id=mas.id, ce_id=ce_id).first():
                cognition_engine_service._patch_mas_config(session, mas, ce_id, override, validate_keys=False)

    def create(
        self, workspace_id: str, mas_data: MultiAgenticSystemRequest, user_id: str = "system"
    ) -> MultiAgenticSystemResponse:
        if not workspace_service.exists(workspace_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                lock_workspace_cfn(session, workspace_id)
                existing = (
                    session.query(MultiAgenticSystemModel)
                    .filter(
                        MultiAgenticSystemModel.workspace_id == workspace_id,
                        MultiAgenticSystemModel.name == mas_data.name,
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                    .first()
                )
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Multi-agentic system with name '{mas_data.name}' already exists in this workspace",
                    )

                new_mas = MultiAgenticSystemModel(
                    id=generate_uuid(),
                    workspace_id=workspace_id,
                    name=mas_data.name,
                    description=mas_data.description,
                    agents=None,
                    config=mas_data.config,
                )

                session.add(new_mas)
                session.flush()

                self._save_agents(session, new_mas.id, mas_data.agents)
                self._save_mcp_servers(session, new_mas.id, mas_data.mcp_servers)

                session.flush()
                apply_metadata(session, new_mas, mas_data)
                validate_final_state(session, new_mas)
                self._sync_ce_membership(session, new_mas, mas_data, user_id, creating=True)
                session.commit()
                response = MultiAgenticSystemResponse(id=new_mas.id, name=new_mas.name)

                # Regenerate config after all CE associations are committed
                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_workspace(workspace_id)

                return response

            except IntegrityError as e:
                session.rollback()
                if "idx_mas_workspace_name_unique" in str(e):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Multi-agentic system with name '{mas_data.name}' already exists in this workspace",
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Database integrity error: {str(e)}",
                )
            except HTTPException:
                session.rollback()
                raise
            except Exception as e:
                session.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create multi-agentic system: {str(e)}",
                )
            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create multi-agentic system: {str(e)}",
            )

    def list(self, workspace_id: str) -> MultiAgenticSystems:
        if not workspace_service.exists(workspace_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                systems = (
                    session.query(MultiAgenticSystemModel)
                    .filter(
                        MultiAgenticSystemModel.workspace_id == workspace_id,
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                    .all()
                )

                mas_ids = [mas.id for mas in systems]

                # Batch fetch all active agents for these MAS
                all_agents = []
                if mas_ids:
                    all_agents = session.query(AgentModel).filter(AgentModel.mas_id.in_(mas_ids)).all()

                # Group agents by mas_id
                agents_by_mas = {}
                for agent in all_agents:
                    agents_by_mas.setdefault(agent.mas_id, []).append(agent)

                from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
                from server.database.relational_db.models.cognition_engine import (
                    CognitionEngine as CognitionEngineModel,
                )

                ce_by_mas = {}
                if mas_ids:
                    ce_rows = (
                        session.query(MasCognitionEngine, CognitionEngineModel)
                        .join(CognitionEngineModel, MasCognitionEngine.ce_id == CognitionEngineModel.id)
                        .filter(MasCognitionEngine.mas_id.in_(mas_ids))
                        .all()
                    )
                    for junc, ce in ce_rows:
                        ce_by_mas.setdefault(junc.mas_id, []).append(
                            MasCognitionEngineItem(
                                ce_id=junc.ce_id,
                                name=ce.name,
                                version=ce.version,
                                ce_type=ce.ce_type,
                                **ce_connection(ce),
                                enabled=ce.enabled,
                                status=ce.status,
                                mas_config=junc.mas_config,
                            )
                        )

                # Batch fetch all MCP servers and tools for these MAS
                mcp_servers_by_mas = {}
                if mas_ids:
                    all_servers = session.query(MCPServerModel).filter(MCPServerModel.mas_id.in_(mas_ids)).all()
                    server_ids = [s.id for s in all_servers]
                    all_tools = []
                    if server_ids:
                        all_tools = session.query(MCPToolModel).filter(MCPToolModel.mcp_server_id.in_(server_ids)).all()

                    # Group tools by server
                    tools_by_server = {}
                    for tool in all_tools:
                        tools_by_server.setdefault(tool.mcp_server_id, []).append(tool)

                    # Group servers by MAS and convert to schema
                    for server in all_servers:
                        server_detail = self._mcp_server_row_to_schema(server, tools_by_server.get(server.id, []))
                        mcp_servers_by_mas.setdefault(server.mas_id, []).append(server_detail)

                system_responses = [
                    self._enrich_mas(
                        mas,
                        agents_by_mas.get(mas.id, []),
                        mcp_servers_by_mas.get(mas.id, []),
                        ce_by_mas.get(mas.id, []),
                    )
                    for mas in systems
                ]

                return MultiAgenticSystems(systems=system_responses)

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve multi-agentic systems: {str(e)}",
            )

    def get(self, workspace_id: str, mas_id: str) -> MultiAgenticSystemSchema:
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                # One committed view for the parent and all child inventories,
                # without blocking concurrent onboarding/CE membership writes.
                session.connection(
                    execution_options={
                        "isolation_level": "REPEATABLE READ",
                        "postgresql_readonly": True,
                    }
                )
                mas = (
                    session.query(MultiAgenticSystemModel)
                    .filter(
                        MultiAgenticSystemModel.id == mas_id,
                        MultiAgenticSystemModel.workspace_id == workspace_id,
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                    .first()
                )

                if not mas:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Multi-agentic system not found",
                    )

                agents = session.query(AgentModel).filter(AgentModel.mas_id == mas_id).all()

                from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
                from server.database.relational_db.models.cognition_engine import (
                    CognitionEngine as CognitionEngineModel,
                )

                ce_rows = (
                    session.query(MasCognitionEngine, CognitionEngineModel)
                    .join(CognitionEngineModel, MasCognitionEngine.ce_id == CognitionEngineModel.id)
                    .filter(MasCognitionEngine.mas_id == mas_id)
                    .all()
                )
                ce_associations = [
                    MasCognitionEngineItem(
                        ce_id=junc.ce_id,
                        name=ce.name,
                        version=ce.version,
                        ce_type=ce.ce_type,
                        **ce_connection(ce),
                        enabled=ce.enabled,
                        status=ce.status,
                        mas_config=junc.mas_config,
                    )
                    for junc, ce in ce_rows
                ]

                mcp_servers = self._fetch_mcp_servers_for_mas(session, mas_id)

                return self._enrich_mas(mas, agents, mcp_servers, ce_associations)

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve multi-agentic system: {str(e)}",
            )

    def update(
        self, workspace_id: str, mas_id: str, mas_data: MultiAgenticSystemUpdate, user_id: str = "system"
    ) -> MultiAgenticSystemSchema:
        """Update a multi-agentic system"""
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                mas = lock_mas(session, mas_id, workspace_id)
                previous_native = (
                    capture_native_snapshots(session, mas_id) if "tools" in mas_data.model_fields_set else None
                )

                if mas_data.name is not None:
                    existing = (
                        session.query(MultiAgenticSystemModel)
                        .filter(
                            MultiAgenticSystemModel.workspace_id == workspace_id,
                            MultiAgenticSystemModel.name == mas_data.name,
                            MultiAgenticSystemModel.id != mas_id,
                            MultiAgenticSystemModel.deleted_at.is_(None),
                        )
                        .first()
                    )
                    if existing:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=f"Multi-agentic system with name '{mas_data.name}' already exists in this workspace",
                        )
                    mas.name = mas_data.name

                if mas_data.description is not None:
                    mas.description = mas_data.description

                if mas_data.agents is not None:
                    self._sync_agents(session, mas_id, mas_data.agents)
                    mas.agents = None

                if mas_data.mcp_servers is not None:
                    self._sync_mcp_servers(session, mas_id, mas_data.mcp_servers)

                if mas_data.config is not None:
                    mas.config = mas_data.config

                session.flush()
                apply_metadata(session, mas, mas_data, previous_native)
                validate_final_state(session, mas)
                self._sync_ce_membership(session, mas, mas_data, user_id)

                mas.updated_at = utc_now()

                session.commit()
                session.refresh(mas)

                # Re-fetch agents after sync
                agents = session.query(AgentModel).filter(AgentModel.mas_id == mas_id).all()

                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_workspace(workspace_id)

                from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
                from server.database.relational_db.models.cognition_engine import (
                    CognitionEngine as CognitionEngineModel,
                )

                ce_rows = (
                    session.query(MasCognitionEngine, CognitionEngineModel)
                    .join(CognitionEngineModel, MasCognitionEngine.ce_id == CognitionEngineModel.id)
                    .filter(MasCognitionEngine.mas_id == mas.id)
                    .all()
                )
                ce_associations = [
                    MasCognitionEngineItem(
                        ce_id=junc.ce_id,
                        name=ce.name,
                        version=ce.version,
                        ce_type=ce.ce_type,
                        **ce_connection(ce),
                        enabled=ce.enabled,
                        status=ce.status,
                        mas_config=junc.mas_config,
                    )
                    for junc, ce in ce_rows
                ]

                mcp_servers = self._fetch_mcp_servers_for_mas(session, mas_id)

                return self._enrich_mas(mas, agents, mcp_servers, ce_associations)

            except IntegrityError as e:
                session.rollback()
                if "idx_mas_workspace_name_unique" in str(e):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Multi-agentic system with name '{mas_data.name}' already exists in this workspace",
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Database integrity error: {str(e)}",
                )
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update multi-agentic system: {str(e)}",
            )

    def query_by_identity(self, workspace_id: str, query: MASQueryByIdentity) -> MultiAgenticSystems:
        """Find MAS that have agents with identity_type='claude' and matching identity_identifiers."""
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                agent_query = (
                    session.query(AgentModel)
                    .join(
                        MultiAgenticSystemModel,
                        AgentModel.mas_id == MultiAgenticSystemModel.id,
                    )
                    .filter(
                        MultiAgenticSystemModel.workspace_id == workspace_id,
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                )

                if query.identity_type:
                    agent_query = agent_query.filter(
                        AgentModel.identity_type == query.identity_type,
                    )

                if query.identity_identifiers:
                    agent_query = agent_query.filter(
                        AgentModel.identity_identifiers.contains(query.identity_identifiers),
                    )

                matching_agents = agent_query.all()

                if not matching_agents:
                    return MultiAgenticSystems(systems=[])

                mas_ids = list({a.mas_id for a in matching_agents})

                systems = (
                    session.query(MultiAgenticSystemModel)
                    .filter(
                        MultiAgenticSystemModel.id.in_(mas_ids),
                        MultiAgenticSystemModel.deleted_at.is_(None),
                    )
                    .all()
                )

                all_agents = session.query(AgentModel).filter(AgentModel.mas_id.in_(mas_ids)).all()

                agents_by_mas = {}
                for agent in all_agents:
                    agents_by_mas.setdefault(agent.mas_id, []).append(agent)

                from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
                from server.database.relational_db.models.cognition_engine import (
                    CognitionEngine as CognitionEngineModel,
                )

                ce_by_mas = {}
                ce_rows = (
                    session.query(MasCognitionEngine, CognitionEngineModel)
                    .join(CognitionEngineModel, MasCognitionEngine.ce_id == CognitionEngineModel.id)
                    .filter(MasCognitionEngine.mas_id.in_(mas_ids))
                    .all()
                )
                for junc, ce in ce_rows:
                    ce_by_mas.setdefault(junc.mas_id, []).append(
                        MasCognitionEngineItem(
                            ce_id=junc.ce_id,
                            name=ce.name,
                            version=ce.version,
                            ce_type=ce.ce_type,
                            **ce_connection(ce),
                            enabled=ce.enabled,
                            status=ce.status,
                            mas_config=junc.mas_config,
                        )
                    )

                # Batch fetch all MCP servers and tools for these MAS
                mcp_servers_by_mas = {}
                all_servers = session.query(MCPServerModel).filter(MCPServerModel.mas_id.in_(mas_ids)).all()
                server_ids = [s.id for s in all_servers]
                all_tools = []
                if server_ids:
                    all_tools = session.query(MCPToolModel).filter(MCPToolModel.mcp_server_id.in_(server_ids)).all()

                tools_by_server = {}
                for tool in all_tools:
                    tools_by_server.setdefault(tool.mcp_server_id, []).append(tool)

                for server in all_servers:
                    server_detail = self._mcp_server_row_to_schema(server, tools_by_server.get(server.id, []))
                    mcp_servers_by_mas.setdefault(server.mas_id, []).append(server_detail)

                system_responses = [
                    self._enrich_mas(
                        mas,
                        agents_by_mas.get(mas.id, []),
                        mcp_servers_by_mas.get(mas.id, []),
                        ce_by_mas.get(mas.id, []),
                    )
                    for mas in systems
                ]

                return MultiAgenticSystems(systems=system_responses)

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to query multi-agentic systems by identity: {str(e)}",
            )

    def delete(self, workspace_id: str, mas_id: str, _purge: bool = False) -> dict:
        try:
            db = RelationalDB()
            session = db.get_session()

            try:
                mas = lock_mas(session, mas_id, workspace_id)

                now = utc_now()

                if _purge:
                    # CASCADE on FK handles agent row deletion
                    session.delete(mas)
                    message = "Multi-agentic system permanently deleted"
                else:
                    mas.deleted_at = now
                    # Hard-delete associated agents
                    session.query(AgentModel).filter(
                        AgentModel.mas_id == mas_id,
                    ).delete()
                    message = "Multi-agentic system deleted successfully"

                session.commit()

                from server.services.cognition_fabric_node import cognition_fabric_node_service

                cognition_fabric_node_service.update_config_for_workspace(workspace_id)

                return {"message": message}

            finally:
                session.close()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete multi-agentic system: {str(e)}",
            )


# Global service instance
multi_agentic_system_service = MultiAgenticSystemService()
