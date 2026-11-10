# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Optional, snapshot-only onboarding metadata. References never trigger I/O."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator, model_serializer, field_validator


class PresenceModel(BaseModel):
    """Read nested snapshots without inventing omitted optional properties."""

    @model_serializer(mode="wrap")
    def preserve_presence(self, handler):
        result = handler(self)
        present = self.model_fields_set | set(self.model_extra or {})
        return {key: value for key, value in result.items() if key in present}


class DocumentSnapshot(BaseModel):
    # Extensions and unsupported formats are deliberately preserved for consumers.
    model_config = ConfigDict(extra="allow")

    content: Any = None
    source_url: str | None = None
    source: dict[str, Any] | None = None
    media_type: str | None = None
    provenance: dict[str, Any] | None = None

    @model_validator(mode="after")
    def has_document_or_reference(self):
        if self.content is None and not self.source_url and not self.source:
            raise ValueError("Supply content, source_url or a source reference")
        if self.source and self.source.get("type") == "agntcy-directory":
            if not self.source.get("directory_id") or not self.source.get("record_cid"):
                raise ValueError("Directory references require directory_id and record_cid")
        return self


class AgentDescription(DocumentSnapshot):
    format: str
    spec_version: str | None = None
    schema_version: str | None = None


class ToolProvider(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mcp_server_name: str
    native_tool_name: str


class ToolSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    definition: dict[str, Any] | None = None
    protocol_version: str | None = None
    provenance: dict[str, Any] | None = None

    @field_validator("definition")
    @classmethod
    def validate_legacy_projection(cls, value):
        if value is None:
            return value
        if not isinstance(value.get("name"), str):
            raise ValueError("definition.name must be a string")
        for key, expected in (("description", str), ("inputSchema", dict)):
            if value.get(key) is not None and not isinstance(value[key], expected):
                raise ValueError(f"definition.{key} has an invalid type")
        return value


class RuntimeTool(ToolSnapshot):
    tool_id: str = Field(min_length=1)
    provider: ToolProvider | None = None
    metadata: dict[str, Any] | None = None


class TopologyNode(PresenceModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    type: Literal["agent", "start", "end"] = "agent"
    tool_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def tool_assignments(self):
        if self.type != "agent" and "tool_ids" in self.model_fields_set:
            raise ValueError("Start/end markers cannot own tools")
        if len(set(self.tool_ids)) != len(self.tool_ids):
            raise ValueError("Duplicate tool ID in node")
        return self


class TopologyEdge(PresenceModel):
    model_config = ConfigDict(extra="forbid")
    source: str
    target: str
    interaction_type: str | None = None
    conditional: bool | None = None
    data: Any = None


class ProvidedTopology(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["provided"]
    completeness: Literal["complete", "partial"]
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]

    @model_validator(mode="after")
    def graph_integrity(self):
        ids = [node.id for node in self.nodes]
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate node ID")
        for edge in self.edges:
            if edge.source not in ids or edge.target not in ids:
                raise ValueError("Edge endpoints must reference nodes in this graph")
        return self


class MetadataWrite(BaseModel):
    metadata_schema_version: str | None = None
    tag: str | None = None
    version: str | None = None
    metadata: dict[str, Any] | None = None
    documentation: list[DocumentSnapshot] = Field(default_factory=list)
    tools: list[RuntimeTool] = Field(default_factory=list)
    topologies: list[ProvidedTopology] = Field(default_factory=list, max_length=1)


class DocumentRead(DocumentSnapshot, PresenceModel):
    collected_at: str
    content_hash: str | None = None
    resolution_state: Literal["inline", "unresolved"]


class AgentDescriptionRead(AgentDescription, DocumentRead):
    support_state: Literal["supported", "unsupported"]


class RuntimeToolRead(RuntimeTool, PresenceModel):
    source_snapshot: dict[str, Any] | None = None


class TopologyRead(PresenceModel):
    source: Literal["provided", "observed"]
    completeness: Literal["complete", "partial"]
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
    updated_at: str | None = None


class SourceAvailability(BaseModel):
    status: Literal["available", "absent", "disabled", "unavailable"]


class TopologySources(BaseModel):
    provided: SourceAvailability
    observed: SourceAvailability


class MetadataRead(BaseModel):
    # None means never supplied, [] means explicitly cleared. Keep this distinction.
    metadata_schema_version: str | None = Field(None, exclude_if=lambda v: v is None)
    tag: str | None = Field(None, exclude_if=lambda v: v is None)
    version: str | None = Field(None, exclude_if=lambda v: v is None)
    metadata: dict[str, Any] | None = Field(None, exclude_if=lambda v: v is None)
    documentation: list[DocumentRead] | None = Field(None, exclude_if=lambda v: v is None)
    tools: list[RuntimeToolRead] | None = Field(None, exclude_if=lambda v: v is None)
    topologies: list[TopologyRead] | None = Field(None, exclude_if=lambda v: v is None)
    topology_sources: TopologySources
