#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""One-off, checked cache regeneration after the UTC migration; never a startup task."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.database.relational_db.db import RelationalDB  # noqa: E402
from server.database.relational_db.models.agent import Agent  # noqa: E402
from server.database.relational_db.models.mcp_server import MCPServer  # noqa: E402
from server.database.relational_db.models.mcp_tool import MCPTool  # noqa: E402
from server.database.relational_db.models.cognition_engine import CognitionEngine  # noqa: E402
from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode  # noqa: E402
from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine  # noqa: E402
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem  # noqa: E402
from server.database.relational_db.models.workspace import Workspace  # noqa: E402
from server.services.cognition_fabric_node import cognition_fabric_node_service  # noqa: E402
from server.utils.timestamps import format_utc  # noqa: E402


def _require(condition):
    if not condition:
        raise ValueError("Incomplete or inconsistent regenerated config")


def _stamp(value):
    from pydantic import TypeAdapter
    from server.utils.timestamps import UtcDateTime

    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("snapshot timestamp is not UTC Z")
    TypeAdapter(UtcDateTime).validate_python(value)


def _receipt_stamps(actual, expected, field):
    from pydantic import TypeAdapter
    from server.utils.timestamps import UtcDateTime

    _require(len(actual or []) == len(expected or []))
    for item, original in zip(actual or [], expected or []):
        if original.get(field) is not None:
            _stamp(item[field])
            _require(item[field] == format_utc(TypeAdapter(UtcDateTime).validate_python(original[field])))
        else:
            _require(item.get(field) is None)


def _provenance(actual, expected):
    original = expected or {}
    _receipt_stamps([actual or {}], [original], "collected_at")


def _owned_stamps(session, payload, row):
    # Explicit owned paths only: source snapshots, content and claims are opaque.
    _require(payload["created_at"] == format_utc(row.created_at))
    updated = format_utc(row.updated_at) if row.updated_at else None
    _require(payload.get("updated_at") == updated)
    _require(payload.get("last_updated_on") == updated)
    _receipt_stamps(payload.get("documentation"), row.documentation, "collected_at")
    _receipt_stamps(payload.get("topologies"), row.topologies, "updated_at")
    agents = session.query(Agent).filter(Agent.mas_id == row.id).all()
    actual_agents = {agent["cf_agent_id"]: agent for agent in payload.get("agents") or []}
    _require(set(actual_agents) == {str(agent.cf_agent_id) for agent in agents})
    for agent in agents:
        _receipt_stamps(
            actual_agents[str(agent.cf_agent_id)].get("agent_descriptions"), agent.agent_descriptions, "collected_at"
        )
    servers = session.query(MCPServer).filter(MCPServer.mas_id == row.id).all()
    actual_servers = {server["id"]: server for server in payload.get("mcp_servers") or []}
    _require(set(actual_servers) == {server.id for server in servers})
    native = {}
    for server in servers:
        tools = session.query(MCPTool).filter(MCPTool.mcp_server_id == server.id).all()
        actual_tools = {tool["id"]: tool for tool in actual_servers[server.id].get("tools") or []}
        _require(set(actual_tools) == {tool.id for tool in tools})
        for tool in tools:
            native[(server.name, tool.name)] = tool
            _provenance(actual_tools[tool.id].get("provenance"), tool.provenance)
    actual_runtime = {tool["tool_id"]: tool for tool in payload.get("tools") or []}
    _require(set(actual_runtime) == {tool["tool_id"] for tool in row.runtime_tools or []})
    for tool in row.runtime_tools or []:
        provider = tool.get("provider")
        expected = (
            native[(provider["mcp_server_name"], provider["native_tool_name"])].provenance
            if provider
            else tool.get("provenance")
        )
        _provenance(actual_runtime[tool["tool_id"]].get("provenance"), expected)


def regenerate_and_check(db, service=cognition_fabric_node_service):
    """Return checked count; raise with failing IDs when the existing helper hid a failure."""
    with db.get_session() as session:
        versions = {
            row.id: row.config_version or 0
            for row in session.query(CognitionFabricNode).filter(CognitionFabricNode.deleted_at.is_(None))
        }
    service.update_config_for_all_cfns()
    failures = []
    with db.get_session() as session:
        for cfn_id, previous in versions.items():
            try:
                row = session.get(CognitionFabricNode, cfn_id)
                _require(row is not None and row.deleted_at is None)
                _require(row.config_version > previous)
                payload = row.config
                _require(payload["config_version"] == row.config_version)
                workspaces = (
                    session.query(Workspace).filter(Workspace.cfn_id == cfn_id, Workspace.deleted_at.is_(None)).all()
                )
                engines = (
                    session.query(CognitionEngine)
                    .filter(CognitionEngine.cfn_id == cfn_id, CognitionEngine.deleted_at.is_(None))
                    .all()
                )
                ce_ids = {engine.id for engine in engines}
                _require({engine["id"] for engine in payload["cognition_engines"]} == ce_ids)
                actual_ws = {ws["workspace_id"]: ws for ws in payload["workspaces"]}
                _require(set(actual_ws) == {ws.id for ws in workspaces})
                for workspace in workspaces:
                    systems = (
                        session.query(MultiAgenticSystem)
                        .filter(
                            MultiAgenticSystem.workspace_id == workspace.id,
                            MultiAgenticSystem.deleted_at.is_(None),
                        )
                        .all()
                    )
                    actual_mas = {mas["id"]: mas for mas in actual_ws[workspace.id]["multi_agentic_systems"]}
                    _require(set(actual_mas) == {mas.id for mas in systems})
                    for mas in systems:
                        snapshot = actual_mas[mas.id]
                        associations = session.query(MasCognitionEngine).filter(MasCognitionEngine.mas_id == mas.id)
                        _require(
                            {ce["id"] for ce in snapshot["cognition_engines"]}
                            == {link.ce_id for link in associations if link.ce_id in ce_ids}
                        )
                        _owned_stamps(session, snapshot, mas)
            except (KeyError, TypeError, ValueError):
                failures.append(cfn_id)
    if failures:
        raise RuntimeError("CFN config regeneration verification failed: " + ", ".join(failures))
    return len(versions)


def main():
    # Unlike server.main, this one-off does not load or override environment from .env.
    required = ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError("Explicit target database settings required: " + ", ".join(missing))
    db = RelationalDB()
    db.init()
    try:
        count = regenerate_and_check(db)
        print(f"Verified regenerated config for {count} non-deleted CFNs (including disabled/offline).")
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
