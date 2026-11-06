# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""HTTP/service regressions for MAS-scoped runtime IDs and stable CF identities."""

from uuid import UUID, uuid4

from tests.test_cognition_engines import _register


def _create(client, workspace_id, name, agents, **extra):
    response = client.post(
        f"/api/workspaces/{workspace_id}/multi-agentic-systems",
        json={"name": name, "agents": agents, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _get(client, workspace_id, mas_id):
    response = client.get(f"/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}")
    assert response.status_code == 200, response.text
    return response.json()


def test_shared_runtime_ids_update_and_delete_only_the_selected_mas(client, created_workspace):
    workspace = created_workspace
    first = _create(client, workspace, "First MAS", [{"agent_id": "moderator", "name": "First"}])
    second = _create(client, workspace, "Second MAS", [{"agent_id": "moderator", "name": "Second"}])
    first_agent = _get(client, workspace, first)["agents"][0]
    second_agent = _get(client, workspace, second)["agents"][0]
    assert first_agent["cf_agent_id"] != second_agent["cf_agent_id"]
    UUID(first_agent["cf_agent_id"])
    UUID(second_agent["cf_agent_id"])

    response = client.put(
        f"/api/workspaces/{workspace}/multi-agentic-systems/{first}",
        json={"agents": [{"agent_id": "moderator", "name": "Renamed", "cf_agent_id": str(uuid4())}]},
    )
    assert response.status_code == 200, response.text
    renamed = response.json()["agents"][0]
    assert renamed["cf_agent_id"] == first_agent["cf_agent_id"]
    assert renamed["agent_id"] == "moderator"
    assert renamed["name"] == "Renamed"
    assert _get(client, workspace, second)["agents"] == [second_agent]

    response = client.put(f"/api/workspaces/{workspace}/multi-agentic-systems/{first}", json={"agents": []})
    assert response.status_code == 200, response.text
    assert response.json()["agents"] == []
    assert _get(client, workspace, second)["agents"] == [second_agent]


def test_replacing_runtime_id_can_reuse_the_removed_agents_name(client, created_workspace):
    mas_id = _create(client, created_workspace, "Replace agent", [{"agent_id": "old-runtime", "name": "Planner"}])
    before = _get(client, created_workspace, mas_id)["agents"][0]

    response = client.put(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
        json={"agents": [{"agent_id": "new-runtime", "name": "Planner"}]},
    )

    assert response.status_code == 200, response.text
    after = response.json()["agents"]
    assert len(after) == 1
    assert after[0]["agent_id"] == "new-runtime"
    assert after[0]["name"] == "Planner"
    assert after[0]["cf_agent_id"] != before["cf_agent_id"]
    assert _get(client, created_workspace, mas_id)["agents"] == after


def test_retained_agent_can_take_the_name_of_a_removed_agent(client, created_workspace):
    mas_id = _create(
        client,
        created_workspace,
        "Reuse removed name",
        [{"agent_id": "keep", "name": "Original"}, {"agent_id": "remove", "name": "Planner"}],
    )
    before = {a["agent_id"]: a for a in _get(client, created_workspace, mas_id)["agents"]}

    response = client.put(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
        json={"agents": [{"agent_id": "keep", "name": "Planner"}]},
    )

    assert response.status_code == 200, response.text
    after = response.json()["agents"]
    assert len(after) == 1
    assert after[0]["agent_id"] == "keep"
    assert after[0]["name"] == "Planner"
    assert after[0]["cf_agent_id"] == before["keep"]["cf_agent_id"]
    assert _get(client, created_workspace, mas_id)["agents"] == after


def test_agent_deletion_rolls_back_when_later_mcp_validation_fails(client, created_workspace):
    mas_id = _create(client, created_workspace, "Keep original", [{"agent_id": "old-runtime", "name": "Planner"}])
    before = _get(client, created_workspace, mas_id)

    response = client.put(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
        json={
            "name": "Must not persist",
            "agents": [{"agent_id": "new-runtime", "name": "Planner"}],
            "mcp_servers": [{"name": "duplicate"}, {"name": "duplicate"}],
        },
    )

    assert response.status_code == 422, response.text
    assert "Duplicate MCP server name" in response.json()["detail"]
    assert _get(client, created_workspace, mas_id) == before


def test_client_cannot_assign_cf_id_and_legacy_missing_runtime_ids_still_generate(client, created_workspace):
    attempted_id = str(uuid4())
    mas_id = _create(
        client,
        created_workspace,
        "Legacy payload",
        [
            {"name": "Generated", "cf_agent_id": attempted_id},
            {"agent_id": "provided-runtime-id", "name": "Provided"},
        ],
    )
    agents = {a["name"]: a for a in _get(client, created_workspace, mas_id)["agents"]}
    generated = agents["Generated"]
    UUID(generated["agent_id"])
    UUID(generated["cf_agent_id"])
    assert generated["cf_agent_id"] != attempted_id
    assert generated["cf_agent_id"] != generated["agent_id"]
    assert agents["Provided"]["agent_id"] == "provided-runtime-id"


def test_duplicate_runtime_ids_in_one_request_are_rejected_atomically(client, created_workspace):
    mas_id = _create(client, created_workspace, "Stable MAS", [{"agent_id": "moderator", "config": {"keep": True}}])
    before = _get(client, created_workspace, mas_id)
    response = client.put(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
        json={
            "name": "Must not persist",
            "agents": [{"agent_id": "duplicate"}, {"agent_id": "duplicate"}],
        },
    )
    assert response.status_code == 422
    assert "Duplicate agent_id" in response.json()["detail"]
    assert _get(client, created_workspace, mas_id) == before


def test_unnamed_agent_config_and_ce_association_survive_an_existing_form_style_update(
    client, created_workspace, registered_cfn
):
    ce_id = _register(client, registered_cfn, name="stage-one-ce")
    opaque = {"nested": {"values": [1, "two", None], "flag": True}}
    mas_id = _create(
        client,
        created_workspace,
        "Unnamed agent",
        [{"agent_id": "unnamed-runtime", "config": opaque}],
        cognition_engine_ids=[ce_id],
    )
    before = _get(client, created_workspace, mas_id)
    response = client.put(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
        json={
            "name": "Unrelated name change",
            "agents": [{"agent_id": "unnamed-runtime", "config": opaque}],
            "mcp_servers": [],
        },
    )
    assert response.status_code == 200, response.text
    after = response.json()
    assert after["agents"] == before["agents"]
    assert after["agents"][0]["name"] is None
    assert after["agents"][0]["config"] == opaque
    assert [ce["ce_id"] for ce in after["cognition_engines"]] == [ce_id]


def test_identity_query_keeps_same_runtime_id_agents_in_separate_mas(client, created_workspace):
    ids = {
        _create(
            client,
            created_workspace,
            name,
            [{"agent_id": "moderator", "identity": {"type": "openclaw", "identifiers": {"url": "same-runtime"}}}],
        )
        for name in ("Identity A", "Identity B")
    }
    response = client.post(
        f"/api/workspaces/{created_workspace}/multi-agentic-systems/query",
        json={"identity_type": "openclaw", "identity_identifiers": {"url": "same-runtime"}},
    )
    assert response.status_code == 200, response.text
    systems = response.json()["systems"]
    assert {m["id"] for m in systems} == ids
    assert len({m["agents"][0]["cf_agent_id"] for m in systems}) == 2
