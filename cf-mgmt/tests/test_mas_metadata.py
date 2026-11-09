# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0
"""Stage 3 contract checks using real Postgres and the public Management API."""

import copy
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

import pytest

from server.database.relational_db.db import RelationalDB
from server.schemas.multi_agentic_system import MultiAgenticSystemUpdate
from server.services.mas_metadata import lock_mas
from server.services.multi_agentic_system import multi_agentic_system_service


def rich_request():
    definition = {
        "name": "read",
        "inputSchema": {"type": "object"},
        "outputSchema": {"x-large": 900719925474099312345},
        "annotations": {"readOnlyHint": True},
        "x-unknown": [None, True, 4],
    }
    return {
        "name": "Rich",
        "metadata_schema_version": "1.0",
        "tag": "reused",
        "version": "provider-v1",
        "metadata": {"big": 900719925474099312345, "opaque": [None, True]},
        "documentation": [{"content": "notes", "media_type": "text/markdown"}],
        "agents": [
            {
                "agent_id": "a",
                "agent_descriptions": [
                    {"format": "a2a", "spec_version": "1.0.1", "content": {"skills": [], "x-extra": 1}},
                    {
                        "format": "oasf",
                        "schema_version": "1.0.0",
                        "source": {"type": "agntcy-directory", "directory_id": "dir", "record_cid": "bafy-example"},
                    },
                    {"format": "future", "spec_version": "10", "source_url": "https://unreachable.invalid/card"},
                ],
            }
        ],
        "mcp_servers": [{"name": "docs", "tools": [{"name": "read", "definition": definition}]}],
        "tools": [{"tool_id": "read", "provider": {"mcp_server_name": "docs", "native_tool_name": "read"}}],
        "topologies": [
            {
                "source": "provided",
                "completeness": "partial",
                "nodes": [{"id": "a", "tool_ids": ["read"]}, {"id": "start", "type": "start"}],
                "edges": [{"source": "start", "target": "a", "conditional": True, "data": {"opaque": [None]}}],
            }
        ],
    }


def create(client, ws, body=None):
    base = f"/api/workspaces/{ws}/multi-agentic-systems"
    response = client.post(base, json=body or rich_request())
    assert response.status_code == 201, response.text
    return f"{base}/{response.json()['id']}"


def read(client, path):
    response = client.get(path)
    assert response.status_code == 200, response.text
    return response.json()


def test_rich_roundtrip_and_reference_only_zero_fetch(client, created_workspace):
    with patch("requests.get", side_effect=AssertionError("No document fetch")):
        path = create(client, created_workspace)
        saved = read(client, path)
        docs = saved["agents"][0]["agent_descriptions"]
        assert docs[0]["content"] == rich_request()["agents"][0]["agent_descriptions"][0]["content"]
        assert docs[0]["support_state"] == "supported"
        assert docs[1]["resolution_state"] == "unresolved" and "content_hash" not in docs[1]
        assert docs[2]["support_state"] == "unsupported"
        assert saved["metadata"]["big"] == 900719925474099312345
        assert saved["tools"][0]["definition"] == saved["mcp_servers"][0]["tools"][0]["definition"]
        assert saved["tools"][0]["source_snapshot"] == rich_request()["mcp_servers"][0]["tools"][0]["definition"]
        assert saved["topologies"][0]["updated_at"].endswith("Z")
        assert saved["topology_sources"] == {"provided": {"status": "available"}, "observed": {"status": "disabled"}}
        assert client.put(path, json={"description": "unrelated"}).status_code == 200
        after = read(client, path)
        for field in ("tools", "topologies", "documentation", "agents", "mcp_servers"):
            assert after[field] == saved[field]
        assert after["updated_at"] != saved["updated_at"]
        assert client.post(path.rsplit("/", 1)[0], json={"name": "Second", "tag": "reused"}).status_code == 201


@pytest.mark.parametrize(
    "payload, kinds",
    [
        ({"agents": []}, {"node", "edge"}),
        ({"tools": []}, {"tool"}),
        ({"mcp_servers": []}, {"binding"}),
        ({"mcp_servers": [{"name": "docs"}]}, {"binding"}),
    ],
)
def test_dangling_updates_rollback_all_state(client, created_workspace, payload, kinds):
    path = create(client, created_workspace)
    before = read(client, path)
    with patch(
        "server.services.cognition_fabric_node.cognition_fabric_node_service.update_config_for_workspace"
    ) as regen:
        response = client.put(path, json={**payload, "name": "Must rollback", "metadata": {"bad": True}})
        assert response.status_code == 422, response.text
        detail = response.json()["detail"]
        assert detail["code"] == "dangling_references"
        assert {r["kind"] for r in detail["references"]} == kinds
        regen.assert_not_called()
    assert read(client, path) == before


def test_clear_and_provider_presence(client, created_workspace):
    path = create(client, created_workspace)
    assert client.put(path, json={"tools": [{"tool_id": "read", "metadata": {"keep": True}}]}).status_code == 200
    assert read(client, path)["tools"][0]["provider"]["mcp_server_name"] == "docs"
    response = client.put(
        path,
        json={
            "agents": [],
            "tools": [{"tool_id": "read", "provider": None}],
            "mcp_servers": [],
            "topologies": [],
            "documentation": [],
            "tag": None,
            "version": None,
            "metadata": None,
            "metadata_schema_version": None,
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["topologies"] == saved["documentation"] == []
    assert saved["tools"][0]["provider"] is None
    for field in ("tag", "version", "metadata", "metadata_schema_version"):
        assert field not in saved


def test_native_legacy_edit_preserves_extensions_and_original_snapshot(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)["tools"][0]
    response = client.put(
        path, json={"mcp_servers": [{"name": "docs", "tools": [{"name": "read", "parameters": {"type": "number"}}]}]}
    )
    assert response.status_code == 200, response.text
    tool = response.json()["tools"][0]
    assert tool["source_snapshot"] == before["source_snapshot"]
    assert tool["definition"] == {**before["definition"], "inputSchema": {"type": "number"}}
    assert tool["provenance"]["state"] == "derived"
    assert tool["provenance"]["content_hash"] != before["provenance"]["content_hash"]
    response = client.put(
        path,
        json={
            "mcp_servers": [
                {"name": "docs", "tools": [{"name": "read", "parameters": {}, "definition": before["definition"]}]}
            ]
        },
    )
    assert response.status_code == 422
    assert read(client, path)["tools"][0] == tool


@pytest.mark.parametrize("field", ["documentation", "tools", "topologies"])
def test_new_lists_reject_null(client, created_workspace, field):
    path = create(client, created_workspace, {"name": "Legacy"})
    before = read(client, path)
    assert field not in before
    response = client.put(path, json={field: None})
    assert response.status_code == 422 and isinstance(response.json()["detail"], list)
    assert read(client, path) == before


@pytest.mark.parametrize("start,end", [(False, False), (True, False), (False, True), (True, True)])
def test_optional_marker_combinations(client, created_workspace, start, end):
    body = {
        "name": "Markers",
        "agents": [{"agent_id": "a"}],
        "topologies": [{"source": "provided", "completeness": "partial", "nodes": [{"id": "a"}], "edges": []}],
    }
    if start:
        body["topologies"][0]["nodes"].append({"id": "start", "type": "start"})
    if end:
        body["topologies"][0]["nodes"].append({"id": "end", "type": "end"})
    path = create(client, created_workspace, body)
    assert len(read(client, path)["topologies"][0]["nodes"]) == 1 + start + end


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["topologies"][0]["nodes"].append({"id": "a"}),
        lambda b: b["topologies"][0]["nodes"][1].update(tool_ids=[]),
        lambda b: b["topologies"][0]["nodes"][0].update(tool_ids=["read", "read"]),
        lambda b: b["topologies"][0]["edges"][0].update(target="missing"),
        lambda b: b["topologies"][0].update(source="observed"),
        lambda b: b["tools"].append(copy.deepcopy(b["tools"][0])),
    ],
)
def test_invalid_graphs_and_tool_ids_rejected(client, created_workspace, mutate):
    body = rich_request()
    mutate(body)
    response = client.post(f"/api/workspaces/{created_workspace}/multi-agentic-systems", json=body)
    assert response.status_code == 422, response.text
    assert read(client, f"/api/workspaces/{created_workspace}/multi-agentic-systems")["systems"] == []


def test_parent_lock_serializes_removal_and_retained_graph(client, created_workspace):
    path = create(client, created_workspace)
    mas_id = path.rsplit("/", 1)[1]
    acquired = Event()
    release = Event()

    def holder():
        session = RelationalDB().get_session()
        try:
            mas = lock_mas(session, mas_id)
            mas.topologies = []
            acquired.set()
            assert release.wait(5)
            session.commit()
        finally:
            session.close()

    def remove():
        return multi_agentic_system_service.update(created_workspace, mas_id, MultiAgenticSystemUpdate(agents=[]))

    with ThreadPoolExecutor(2) as pool:
        holding = pool.submit(holder)
        assert acquired.wait(5)
        removing = pool.submit(remove)
        assert not removing.done()
        release.set()
        holding.result(10)
        assert removing.result(10).agents == []
    assert read(client, path)["topologies"] == []


def test_agent_rich_omission_retains_and_clear_is_explicit(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)
    response = client.put(path, json={"agents": [{"agent_id": "a", "name": "Changed"}]})
    assert response.status_code == 200
    agent = response.json()["agents"][0]
    assert agent["cf_agent_id"] == before["agents"][0]["cf_agent_id"]
    assert agent["agent_descriptions"] == before["agents"][0]["agent_descriptions"]
    assert client.put(path, json={"agents": [{"agent_id": "a", "agent_descriptions": None}]}).status_code == 422
    response = client.put(path, json={"agents": [{"agent_id": "a", "agent_descriptions": []}]})
    assert response.json()["agents"][0]["agent_descriptions"] == []


def test_legacy_retained_native_description_keeps_rich_snapshot(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)["tools"][0]
    assert client.put(path, json={"mcp_servers": [{"name": "docs", "tools": [{"name": "read"}]}]}).status_code == 200
    assert read(client, path)["tools"][0] == before


def test_bound_definition_from_runtime_hydrates_single_native_snapshot(client, created_workspace):
    body = rich_request()
    definition = body["mcp_servers"][0]["tools"][0].pop("definition")
    body["mcp_servers"][0]["tools"][0]["parameters"] = definition["inputSchema"]
    body["tools"][0]["definition"] = definition
    path = create(client, created_workspace, body)
    saved = read(client, path)
    assert saved["tools"][0]["definition"] == definition
    assert saved["mcp_servers"][0]["tools"][0]["definition"] == definition


def test_invalid_ce_selection_rolls_back_create_and_update(client, created_cfn):
    ws, _ = created_cfn
    collection = f"/api/workspaces/{ws}/multi-agentic-systems"
    body = rich_request()
    body["cognition_engine_ids"] = ["missing-ce"]
    with patch(
        "server.services.cognition_fabric_node.cognition_fabric_node_service.update_config_for_workspace"
    ) as regen:
        response = client.post(collection, json=body)
        assert response.status_code == 404, response.text
        assert read(client, collection)["systems"] == []
        regen.assert_not_called()
    path = create(client, ws)
    before = read(client, path)
    with patch(
        "server.services.cognition_fabric_node.cognition_fabric_node_service.update_config_for_workspace"
    ) as regen:
        response = client.put(path, json={"name": "Rollback", "topologies": [], "cognition_engine_ids": ["missing-ce"]})
        assert response.status_code == 404
        regen.assert_not_called()
    assert read(client, path) == before


def test_membership_and_override_touch_mas_once_after_commit(client, created_cfn):
    from tests.test_cognition_engines import _register

    ws, cfn = created_cfn
    ce = _register(client, cfn, mas_config={"threshold": 1})
    path = create(client, ws)
    before = read(client, path)
    with patch(
        "server.services.cognition_fabric_node.cognition_fabric_node_service.update_config_for_workspace"
    ) as regen:
        response = client.put(
            path, json={"cognition_engine_ids": [ce], "cognition_engine_configs": {ce: {"threshold": 2}}}
        )
        assert response.status_code == 200, response.text
        assert regen.call_count == 1
    saved = read(client, path)
    assert saved["updated_at"] != before["updated_at"]
    assert saved["cognition_engines"][0]["mas_config"] == {"threshold": 2}
    assoc_path = path + f"/cognition-engines/{ce}"
    response = client.patch(assoc_path, json={"mas_config": {"threshold": 3}})
    assert response.status_code == 204, response.text
    overridden = read(client, path)
    assert overridden["updated_at"] != saved["updated_at"]
    response = client.delete(assoc_path)
    assert response.status_code == 204, response.text
    after = read(client, path)
    assert after["cognition_engines"] == [] and after["updated_at"] != overridden["updated_at"]


def test_auto_attachment_is_part_of_rollback(client, created_cfn):
    from tests.test_cognition_engines import _register
    from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

    ws, cfn = created_cfn
    _register(client, cfn, mas_auto_associate=True)
    body = rich_request()
    body["cognition_engine_ids"] = ["missing"]
    response = client.post(f"/api/workspaces/{ws}/multi-agentic-systems", json=body)
    assert response.status_code == 404
    with RelationalDB().get_session() as session:
        assert session.query(MasCognitionEngine).count() == 0


def test_provenance_updates_and_unrelated_resend_preserve_snapshot_identity(client, created_workspace):
    path = create(client, created_workspace)
    assert (
        client.put(
            path,
            json={"mcp_servers": [{"name": "docs", "tools": [{"name": "read", "parameters": {"type": "string"}}]}]},
        ).status_code
        == 200
    )
    before = read(client, path)["tools"][0]
    response = client.put(
        path,
        json={
            "mcp_servers": [
                {
                    "name": "docs",
                    "tools": [
                        {"name": "read", "definition": before["definition"], "provenance": {"owner": "new-owner"}}
                    ],
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    after = response.json()["tools"][0]
    assert after["source_snapshot"] == before["source_snapshot"]
    for key in ("content_hash", "collected_at", "state"):
        assert after["provenance"][key] == before["provenance"][key]
    assert after["provenance"]["claims"] == {"owner": "new-owner"}
    response = client.put(
        path,
        json={"tools": [{"tool_id": "read", "protocol_version": "2026-07-28", "provenance": {"provider": "operator"}}]},
    )
    assert response.status_code == 200
    tool = response.json()["tools"][0]
    assert tool["protocol_version"] == "2026-07-28"
    assert tool["provenance"]["claims"] == {"provider": "operator"}
    assert tool["provenance"]["content_hash"] == before["provenance"]["content_hash"]


def test_bound_runtime_snapshot_rejects_conflicting_native_description(client, created_workspace):
    body = rich_request()
    definition = body["mcp_servers"][0]["tools"][0].pop("definition")
    body["mcp_servers"][0]["tools"][0]["description"] = "Native description"
    body["tools"][0]["definition"] = {**definition, "description": "Conflicting description"}
    response = client.post(f"/api/workspaces/{created_workspace}/multi-agentic-systems", json=body)
    assert response.status_code == 422 and "description" in response.text


def test_null_legacy_ce_override_remains_supported(client, created_cfn):
    from tests.test_cognition_engines import _register

    ws, cfn = created_cfn
    ce = _register(client, cfn, mas_config={"threshold": 1})
    path = create(client, ws, {"name": "Legacy", "cognition_engine_ids": [ce]})
    response = client.put(path, json={"cognition_engine_configs": {ce: None}})
    assert response.status_code == 200, response.text
    assert response.json()["cognition_engines"][0]["mas_config"] is None


def test_concurrent_registration_and_mas_override_have_consistent_lock_order(client, created_cfn, monkeypatch):
    from tests.test_cognition_engines import _register
    from server.services.cognition_engine import cognition_engine_service

    ws, cfn = created_cfn
    old = _register(client, cfn, name="upgrade", version="1", mas_config={"threshold": 1})
    path = create(client, ws, {"name": "Legacy", "cognition_engine_ids": [old]})
    mas_id = path.rsplit("/", 1)[1]
    claims_locked = Event()
    release = Event()
    original = cognition_engine_service._claim_endpoints

    def paused_claim(session, engine):
        result = original(session, engine)
        claims_locked.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr(cognition_engine_service, "_claim_endpoints", paused_claim)
    with ThreadPoolExecutor(2) as pool:
        registering = pool.submit(_register, client, cfn, name="upgrade", version="2", mas_config={"threshold": 1})
        assert claims_locked.wait(5)
        updating = pool.submit(client.put, path, json={"cognition_engine_configs": {old: {"threshold": 2}}})
        try:
            # Registration already holds CE claim locks. The competing update
            # must wait on CFN scope before acquiring any MAS parent lock.
            from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem

            with RelationalDB().get_session() as session:
                session.query(MultiAgenticSystem).filter_by(id=mas_id).with_for_update(nowait=True).one()
        finally:
            release.set()
        new = registering.result(10)
        response = updating.result(10)
        assert response.status_code == 200, response.text
    associations = {ce["ce_id"]: ce for ce in read(client, path)["cognition_engines"]}
    assert set(associations) == {old, new}
    assert associations[old]["mas_config"] == {"threshold": 2}


def test_unbound_definition_clear_removes_effective_snapshot_and_hash(client, created_workspace):
    path = create(
        client,
        created_workspace,
        {"name": "Unbound", "tools": [{"tool_id": "read", "definition": {"name": "read", "inputSchema": {}}}]},
    )
    assert read(client, path)["tools"][0]["provenance"]["content_hash"]
    response = client.put(path, json={"tools": [{"tool_id": "read", "definition": None}]})
    assert response.status_code == 200
    tool = response.json()["tools"][0]
    assert tool.get("definition") is None and tool.get("source_snapshot") is None
    assert not tool.get("provenance", {}).get("content_hash")


def test_conflicting_explicit_native_and_runtime_definition_null_is_rejected(client, created_workspace):
    body = rich_request()
    body["tools"][0]["definition"] = None
    response = client.post(f"/api/workspaces/{created_workspace}/multi-agentic-systems", json=body)
    assert response.status_code == 422


@pytest.mark.parametrize(
    "definition",
    [
        {"name": None},
        {"name": 123},
        {"name": "read", "inputSchema": []},
        {"name": "read", "inputSchema": "bad"},
        {"name": "read", "description": {"bad": True}},
    ],
)
@pytest.mark.parametrize("native", [True, False])
def test_malformed_definition_projection_is_schema_422_without_write(client, created_workspace, definition, native):
    path = create(client, created_workspace)
    before = read(client, path)
    payload = (
        {"mcp_servers": [{"name": "docs", "tools": [{"name": "read", "definition": definition}]}]}
        if native
        else {"tools": [{"tool_id": "new", "definition": definition}]}
    )
    response = client.put(path, json=payload)
    assert response.status_code == 422 and isinstance(response.json()["detail"], list)
    assert read(client, path) == before


def test_unbinding_and_removing_native_provider_retains_omitted_tool_snapshot(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)["tools"][0]
    response = client.put(path, json={"mcp_servers": [], "tools": [{"tool_id": "read", "provider": None}]})
    assert response.status_code == 200, response.text
    tool = response.json()["tools"][0]
    assert tool["provider"] is None
    for field in ("definition", "source_snapshot", "provenance"):
        assert tool[field] == before[field]


def test_invalid_override_shape_rolls_back_before_commit(client, created_cfn):
    from tests.test_cognition_engines import _register

    ws, cfn = created_cfn
    ce = _register(client, cfn, mas_config={"threshold": 1})
    path = create(client, ws, {"name": "Original", "cognition_engine_ids": [ce]})
    before = read(client, path)
    with patch(
        "server.services.cognition_fabric_node.cognition_fabric_node_service.update_config_for_workspace"
    ) as regen:
        response = client.put(
            path,
            json={
                "name": "Must roll back",
                "metadata": {"bad": True},
                "cognition_engine_configs": {ce: "not-an-object"},
            },
        )
        assert response.status_code == 422, response.text
        regen.assert_not_called()
    assert read(client, path) == before
