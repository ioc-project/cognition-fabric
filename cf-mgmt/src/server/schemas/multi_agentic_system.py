# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from pydantic import BaseModel, Field, ConfigDict, model_validator
from datetime import datetime
from typing import Optional, Dict, Any, List


class AgentIdentity(BaseModel):
    """Schema for agent identity provider configuration"""

    type: str = Field(..., description="Identity provider type (e.g. openclaw, claude_code, or any custom type)")
    identifiers: Dict[str, str] = Field(..., description="Provider-specific identifiers (varies by type)")


# MCP Server Schemas


class MCPToolConfig(BaseModel):
    """Schema for MCP tool configuration (input)"""

    name: str = Field(..., description="Tool name")
    description: Optional[str] = Field(None, description="Tool description (used for governance integrity checks)")
    parameters: Optional[Dict[str, Any]] = Field(None, description="JSON Schema for tool parameters")


class MCPToolDetail(BaseModel):
    """Schema for MCP tool details (output)"""

    id: str = Field(..., description="Unique identifier for the tool")
    name: str = Field(..., description="Tool name")
    description: Optional[str] = Field(None, description="Tool description (used for governance integrity checks)")
    parameters: Optional[Dict[str, Any]] = Field(None, description="JSON Schema for tool parameters")


class MCPServerConfig(BaseModel):
    """Schema for MCP server configuration (input)"""

    name: str = Field(..., description="MCP server name")
    transport: Optional[str] = Field(None, description="Transport type (e.g. 'stdio', 'sse')")
    description: Optional[str] = Field(None, description="MCP server description")
    tools: Optional[List[MCPToolConfig]] = Field(None, description="List of tools provided by this MCP server")
    config: Optional[Dict[str, Any]] = Field(None, description="MCP server-specific configuration")


class MCPServerDetail(BaseModel):
    """Schema for MCP server details (output)"""

    id: str = Field(..., description="Unique identifier for the MCP server")
    name: str = Field(..., description="MCP server name")
    transport: Optional[str] = Field(None, description="Transport type (e.g. 'stdio', 'sse')")
    description: Optional[str] = Field(None, description="MCP server description")
    tools: Optional[List[MCPToolDetail]] = Field(None, description="List of tools provided by this MCP server")
    config: Optional[Dict[str, Any]] = Field(None, description="MCP server-specific configuration")


class AgentConfig(BaseModel):
    """Schema for individual agent configuration in MAS (input)"""

    agent_id: Optional[str] = Field(
        None, description="Unique identifier for the agent (server-generated, ignored on input)"
    )
    name: Optional[str] = Field(None, description="Human-readable agent name")
    description: Optional[str] = Field(None, description="Agent description (used for governance integrity checks)")
    url: Optional[str] = Field(None, description="Agent endpoint URL")
    identity: Optional[AgentIdentity] = Field(None, description="Identity provider configuration")
    config: Optional[Dict[str, Any]] = Field(None, description="Agent-specific configuration")


class AgentDetail(BaseModel):
    """Schema for agent details (output)"""

    agent_id: str = Field(..., description="Unique identifier for the agent")
    name: Optional[str] = Field(None, description="Human-readable agent name")
    description: Optional[str] = Field(None, description="Agent description (used for governance integrity checks)")
    url: Optional[str] = Field(None, description="Agent endpoint URL")
    identity: Optional[AgentIdentity] = Field(None, description="Identity provider configuration")
    config: Optional[Dict[str, Any]] = Field(None, description="Agent-specific configuration")


class MultiAgenticSystemRequest(BaseModel):
    """Schema for creating a new Multi-Agentic System"""

    name: str = Field(
        ...,
        description="Unique name within the workspace for the multi-agentic system",
        min_length=1,
        max_length=255,
    )
    description: Optional[str] = Field(
        None,
        description="Description of the multi-agentic system",
    )
    agents: Optional[List[AgentConfig]] = Field(
        None,
        description="List of agents in the system with their configurations",
    )
    mcp_servers: Optional[List[MCPServerConfig]] = Field(
        None,
        description="List of MCP servers in the system with their tool definitions",
    )
    config: Optional[Dict[str, Any]] = Field(
        None,
        description="Configuration object",
    )
    cognition_engine_ids: Optional[List[str]] = Field(
        None,
        description="CE IDs to associate with this MAS on creation. Additive — auto-attach CEs are also attached.",
    )


class MultiAgenticSystemUpdate(BaseModel):
    """Schema for updating a Multi-Agentic System"""

    name: Optional[str] = Field(
        None,
        description="Updated name for the multi-agentic system",
        min_length=1,
        max_length=255,
    )
    description: Optional[str] = Field(
        None,
        description="Updated description of the multi-agentic system",
    )
    agents: Optional[List[AgentConfig]] = Field(
        None,
        description="Updated list of agents in the system",
    )
    mcp_servers: Optional[List[MCPServerConfig]] = Field(
        None,
        description="Updated list of MCP servers in the system",
    )
    config: Optional[Dict[str, Any]] = Field(
        None,
        description="Updated configuration object",
    )
    cognition_engine_ids: Optional[List[str]] = Field(
        None,
        description="CE IDs to sync with this MAS. Attaches new ones, detaches removed ones. Omit to leave unchanged.",
    )
    cognition_engine_configs: Optional[Dict[str, Any]] = Field(
        None,
        description="Per-CE mas_config overrides, keyed by ce_id. Overrides the CE factory defaults for this MAS only.",
    )


class MultiAgenticSystemResponse(BaseModel):
    """Schema for multi-agentic system creation response"""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "unique-name-within-a-workspace",
            }
        }
    )

    id: str = Field(..., description="Unique identifier for the multi-agentic system")
    name: str = Field(..., description="Name of the multi-agentic system")


class MasCognitionEngineItem(BaseModel):
    """Schema for a cognition engine associated with a MAS"""

    ce_id: str
    name: str
    version: str
    ce_type: str
    base_url: str
    endpoint: str
    enabled: bool
    status: str
    mas_config: Optional[dict]


class MultiAgenticSystem(BaseModel):
    """Schema for detailed multi-agentic system information"""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "workspace_id": "660e8400-e29b-41d4-a716-446655440000",
                "name": "unique-name-within-a-workspace",
                "description": "A system for collaborative AI agents",
                "agents": [
                    {
                        "agent_id": "agent-1",
                        "name": "retrieval-agent",
                        "url": "http://localhost:8080",
                        "identity": {
                            "type": "openclaw",
                            "identifiers": {"url": "main::agents::agent-1"},
                        },
                        "config": {"type": "planner"},
                    }
                ],
                "config": {"memory": {"type": "long-term", "retention": "90d"}},
                "created_at": "2024-12-11T10:30:00Z",
                "updated_at": "2024-12-11T10:30:00Z",
            }
        }
    )

    id: str
    workspace_id: str
    name: str
    description: Optional[str] = None
    agents: Optional[List[AgentDetail]] = Field(None, description="List of agents in the system")
    mcp_servers: Optional[List[MCPServerDetail]] = Field(None, description="List of MCP servers in the system")
    config: Optional[Dict[str, Any]] = None
    cognition_engines: Optional[List[MasCognitionEngineItem]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class MultiAgenticSystems(BaseModel):
    """Schema for listing multi-agentic systems"""

    systems: List[MultiAgenticSystem] = Field(..., description="List of multi-agentic systems in the workspace")


class MasCognitionEngineAssociateRequest(BaseModel):
    """Schema for adding a Cognition Engine to a MAS"""

    ce_id: str = Field(..., description="ID of the Cognition Engine to associate with this MAS")


class MasCognitionEnginePatchRequest(BaseModel):
    """Schema for PATCH /workspaces/{ws}/mas/{mas_id}/cognition-engines/{ce_id}"""

    mas_config: dict = Field(..., description="Per-MAS config override for this CE")


class MASQueryByIdentity(BaseModel):
    """Schema for querying MAS by agent identity type and/or identifiers"""

    identity_type: Optional[str] = Field(
        None, description="Identity provider type to filter by (e.g. 'claude', 'openclaw')"
    )
    identity_identifiers: Optional[Dict[str, str]] = Field(
        None, description='Identity identifiers to match against agent identity_identifiers (e.g. {"xyz": "pqr"})'
    )

    @model_validator(mode="after")
    def at_least_one_filter(self):
        if not self.identity_type and not self.identity_identifiers:
            raise ValueError("At least one of 'identity_type' or 'identity_identifiers' must be provided")
        return self
