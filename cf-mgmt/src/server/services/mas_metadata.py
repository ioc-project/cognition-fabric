# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Pure snapshot handling and final-state integrity under the MAS parent lock."""

import copy
import hashlib
import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import HTTPException

from server.database.relational_db.models.agent import Agent
from server.database.relational_db.models.mcp_server import MCPServer
from server.database.relational_db.models.mcp_tool import MCPTool
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem

logger = logging.getLogger(__name__)


def utc_now():
    return datetime.now(timezone.utc)


def stamp():
    return utc_now().isoformat().replace("+00:00", "Z")


def digest(content):
    return (
        "sha256:"
        + hashlib.sha256(
            json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        ).hexdigest()
    )


def lock_workspace_cfn(session, workspace_id):
    # Registration claims CE rows before carrying associations forward. Its
    # exclusive CFN lock must precede our MAS lock; independent MAS writers
    # share this scope lock and can still proceed concurrently.
    from server.database.relational_db.models.workspace import Workspace
    from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode

    cfn_id = session.query(Workspace.cfn_id).filter(Workspace.id == workspace_id).scalar()
    if cfn_id:
        session.query(CognitionFabricNode).filter(CognitionFabricNode.id == cfn_id).with_for_update(read=True).first()


def lock_mas(session, mas_id, workspace_id=None):
    if workspace_id is None:
        workspace_id = session.query(MultiAgenticSystem.workspace_id).filter(MultiAgenticSystem.id == mas_id).scalar()
    if workspace_id:
        lock_workspace_cfn(session, workspace_id)
    query = session.query(MultiAgenticSystem).filter(
        MultiAgenticSystem.id == mas_id, MultiAgenticSystem.deleted_at.is_(None)
    )
    if workspace_id is not None:
        query = query.filter(MultiAgenticSystem.workspace_id == workspace_id)
    row = query.with_for_update().populate_existing().first()
    if not row:
        raise HTTPException(404, "Multi-agentic system not found")
    return row


_DOCUMENT_SNAPSHOT_FIELDS = {"collected_at", "content_hash", "resolution_state", "support_state"}


def _document_payload(item):
    return {key: value for key, value in item.items() if key not in _DOCUMENT_SNAPSHOT_FIELDS}


def snapshot_documents(entries, agent=False, previous=None):
    # Match by complete caller data, not list position, document format alone or
    # just the content hash. Reordering and duplicate snapshots retain their own
    # receipt times; changing references, provenance or extensions is a new snapshot.
    previous_times = defaultdict(deque)
    for item in previous or []:
        previous_times[digest(_document_payload(item))].append(item.get("collected_at"))
    result = []
    for entry in entries:
        item = _document_payload(entry.model_dump(mode="json", exclude_unset=True))
        times = previous_times[digest(item)]
        collected_at = times.popleft() if times else None
        # Verification claims in provenance remain claims, not CF verification.
        item["resolution_state"] = "inline" if "content" in item and item["content"] is not None else "unresolved"
        item["collected_at"] = collected_at if collected_at is not None else stamp()
        if item["resolution_state"] == "inline":
            item["content_hash"] = digest(item["content"])
        if agent:
            supported = (item.get("format"), item.get("spec_version") or item.get("schema_version")) in {
                ("a2a", "1.0.1"),
                ("oasf", "1.0.0"),
            }
            item["support_state"] = "supported" if supported else "unsupported"
        result.append(item)
    return result


def update_agent_metadata(row, cfg):
    if "agent_descriptions" in cfg.model_fields_set:
        row.agent_descriptions = snapshot_documents(cfg.agent_descriptions, agent=True, previous=row.agent_descriptions)
    if "metadata" in cfg.model_fields_set:
        row.agent_metadata = cfg.metadata


def update_native_snapshot(row, cfg):
    """Project full definitions to legacy fields, or patch only edited legacy fields."""
    supplied = cfg.model_fields_set
    original = copy.deepcopy(row.definition)
    definition = copy.deepcopy(original)
    if "definition" in supplied:
        definition = copy.deepcopy(cfg.definition)
        if definition is not None:
            if definition.get("name") != cfg.name:
                raise HTTPException(422, "MCP definition.name must equal its native tool name")
            for legacy, rich in (("parameters", "inputSchema"), ("description", "description")):
                if legacy in supplied and getattr(cfg, legacy) != definition.get(rich):
                    raise HTTPException(422, f"Conflicting {legacy} and definition.{rich}")
            row.parameters = definition.get("inputSchema")
            row.description = definition.get("description")
        if definition != original or row.source_snapshot is None:
            row.source_snapshot = copy.deepcopy(definition)
    elif definition is not None:
        for legacy, rich in (("parameters", "inputSchema"), ("description", "description")):
            if legacy in supplied:
                if getattr(cfg, legacy) is None:
                    definition.pop(rich, None)
                else:
                    definition[rich] = getattr(cfg, legacy)
        # Omitted legacy fields retain their rich projections.
        row.parameters = definition.get("inputSchema")
        row.description = definition.get("description")
    row.definition = definition
    if "protocol_version" in supplied:
        row.protocol_version = cfg.protocol_version
    if "provenance" in supplied:
        row.provenance = {**(row.provenance or {}), "claims": cfg.provenance}
    if definition is not None and (definition != original or not row.provenance):
        row.provenance = {
            **(row.provenance or {}),
            "content_hash": digest(definition),
            "collected_at": stamp(),
            "state": "snapshot" if "definition" in supplied else "derived",
        }
    elif definition is None and row.provenance:
        row.provenance = {k: v for k, v in row.provenance.items() if k == "claims"} or None


def native_map(session, mas_id):
    return {
        (server.name, tool.name): tool
        for server, tool in session.query(MCPServer, MCPTool)
        .join(MCPTool, MCPTool.mcp_server_id == MCPServer.id)
        .filter(MCPServer.mas_id == mas_id)
        .all()
    }


def capture_native_snapshots(session, mas_id):
    from types import SimpleNamespace

    return {
        key: SimpleNamespace(
            **{
                field: copy.deepcopy(getattr(row, field))
                for field in ("definition", "source_snapshot", "provenance", "protocol_version")
            }
        )
        for key, row in native_map(session, mas_id).items()
    }


def apply_metadata(session, mas, request, previous_native=None):
    for field, column in (
        ("metadata_schema_version", "metadata_schema_version"),
        ("tag", "tag"),
        ("version", "version"),
        ("metadata", "mas_metadata"),
    ):
        if field in request.model_fields_set:
            setattr(mas, column, getattr(request, field))
    if "documentation" in request.model_fields_set:
        mas.documentation = snapshot_documents(request.documentation, previous=mas.documentation)
    if "tools" in request.model_fields_set:
        existing = {tool["tool_id"]: tool for tool in mas.runtime_tools or []}
        native = native_map(session, mas.id)
        declared_definitions = {
            (server.name, tool.name): tool.definition
            for server in request.mcp_servers or []
            for tool in server.tools or []
            if "definition" in tool.model_fields_set
        }
        tools = []
        ids = set()
        for cfg in request.tools:
            if cfg.tool_id in ids:
                raise HTTPException(422, f"Duplicate tool_id: {cfg.tool_id}")
            ids.add(cfg.tool_id)
            tool = {**copy.deepcopy(existing.get(cfg.tool_id, {})), **cfg.model_dump(mode="json", exclude_unset=True)}
            provider = tool.get("provider")
            snapshot_fields = {
                k: getattr(cfg, k)
                for k in ("definition", "provenance", "protocol_version")
                if k in cfg.model_fields_set
            }
            from server.schemas.multi_agentic_system import MCPToolConfig

            if provider:
                row = native.get((provider["mcp_server_name"], provider["native_tool_name"]))
                key = (provider["mcp_server_name"], provider["native_tool_name"])
                if (
                    "definition" in snapshot_fields
                    and key in declared_definitions
                    and cfg.definition != declared_definitions[key]
                ):
                    raise HTTPException(422, "Conflicting native and bound runtime definitions")
                if row is not None and snapshot_fields:
                    if "definition" in snapshot_fields and cfg.definition is not None:
                        if row.definition is not None and row.definition != cfg.definition:
                            raise HTTPException(422, "Bound runtime definition conflicts with MCP catalogue definition")
                        for legacy, rich in (("parameters", "inputSchema"), ("description", "description")):
                            if getattr(row, legacy) is not None and getattr(row, legacy) != cfg.definition.get(rich):
                                raise HTTPException(422, f"Bound definition.{rich} conflicts with MCP {legacy}")
                    update_native_snapshot(row, MCPToolConfig(name=row.name, **snapshot_fields))
                # No divergent copies for bound runtime tools.
                for key in ("definition", "source_snapshot", "provenance", "protocol_version"):
                    tool.pop(key, None)
            else:
                previous = existing.get(cfg.tool_id, {})
                if previous.get("provider"):
                    old_provider = previous["provider"]
                    old_native = (previous_native if previous_native is not None else native).get(
                        (old_provider["mcp_server_name"], old_provider["native_tool_name"])
                    )
                    if old_native is not None:
                        for key in ("definition", "source_snapshot", "provenance", "protocol_version"):
                            tool[key] = copy.deepcopy(getattr(old_native, key))
                # Use the same snapshot/provenance lifecycle for unbound tools.
                from types import SimpleNamespace

                old_definition = tool.get("definition")
                # The merged request already holds new values; reconstruct the
                # retained snapshot before applying explicitly supplied fields.
                if "definition" in snapshot_fields and not previous.get("provider"):
                    old_definition = previous.get("definition")
                row = SimpleNamespace(
                    definition=old_definition,
                    source_snapshot=tool.get("source_snapshot"),
                    provenance=previous.get("provenance") if not previous.get("provider") else tool.get("provenance"),
                    protocol_version=tool.get("protocol_version"),
                    parameters=None,
                    description=None,
                )
                name = (cfg.definition or old_definition or {}).get("name", cfg.tool_id)
                if snapshot_fields:
                    update_native_snapshot(row, MCPToolConfig(name=name, **snapshot_fields))
                    for key in ("definition", "source_snapshot", "provenance", "protocol_version"):
                        if getattr(row, key) is not None or key in cfg.model_fields_set:
                            tool[key] = copy.deepcopy(getattr(row, key))
                        else:
                            tool.pop(key, None)
            tools.append(tool)
        mas.runtime_tools = tools
    if "topologies" in request.model_fields_set:
        graphs = [g.model_dump(mode="json", exclude_unset=True) for g in request.topologies]
        old = [{k: v for k, v in g.items() if k != "updated_at"} for g in mas.topologies or []]
        if graphs != old or mas.topologies is None:
            mas.topologies = [{**g, "updated_at": stamp()} for g in graphs]


def validate_final_state(session, mas):
    session.flush()
    agents = {row.agent_id for row in session.query(Agent).filter(Agent.mas_id == mas.id)}
    tools = {tool["tool_id"] for tool in mas.runtime_tools or []}
    native = native_map(session, mas.id)
    references = []
    for tool in mas.runtime_tools or []:
        provider = tool.get("provider")
        if provider and (provider["mcp_server_name"], provider["native_tool_name"]) not in native:
            references.append({"kind": "binding", "tool_id": tool["tool_id"], **provider})
    for gi, graph in enumerate(mas.topologies or []):
        missing = set()
        for ni, node in enumerate(graph["nodes"]):
            path = f"topologies[{gi}].nodes[{ni}]"
            if node.get("type", "agent") == "agent" and node["id"] not in agents:
                missing.add(node["id"])
                references.append({"kind": "node", "path": path, "node_id": node["id"], "agent_id": node["id"]})
            for ti, tool_id in enumerate(node.get("tool_ids", [])):
                if tool_id not in tools:
                    references.append({"kind": "tool", "path": f"{path}.tool_ids[{ti}]", "tool_id": tool_id})
        for ei, edge in enumerate(graph["edges"]):
            if edge["source"] in missing or edge["target"] in missing:
                references.append(
                    {
                        "kind": "edge",
                        "path": f"topologies[{gi}].edges[{ei}]",
                        **edge,
                        "reason": "Referenced agent would be absent.",
                    }
                )
    if references:
        logger.warning("Rejected dangling MAS references: mas_id=%s references=%s", mas.id, references)
        raise HTTPException(
            422,
            {
                "code": "dangling_references",
                "message": "Update or clear topologies or the affected binding in the same request as the deletion.",
                "references": references,
            },
        )


def read_metadata(mas, servers):
    native = {(s.name, t.name): t for s in servers or [] for t in s.tools or []}
    tools = copy.deepcopy(mas.runtime_tools)
    for tool in tools or []:
        if tool.get("provider"):
            provider = tool["provider"]
            row = native.get((provider["mcp_server_name"], provider["native_tool_name"]))
            if row is not None:
                for field in ("definition", "source_snapshot", "protocol_version", "provenance"):
                    if getattr(row, field) is not None:
                        tool[field] = copy.deepcopy(getattr(row, field))
    return dict(
        metadata_schema_version=mas.metadata_schema_version,
        tag=mas.tag,
        version=mas.version,
        metadata=mas.mas_metadata,
        documentation=mas.documentation,
        tools=tools,
        topologies=mas.topologies,
        topology_sources={
            "provided": {"status": "available" if mas.topologies else "absent"},
            "observed": {"status": "disabled"},
        },
    )
