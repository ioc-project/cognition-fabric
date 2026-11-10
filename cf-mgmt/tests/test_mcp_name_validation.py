# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Direct API checks for MCP name uniqueness, including empty strings."""

import pytest


def _read(client, path):
    response = client.get(path)
    assert response.status_code == 200, response.text
    return response.json()


def _create(client, collection, name, servers):
    response = client.post(
        collection,
        json={
            "name": name,
            "description": "Keep original",
            "agents": [{"agent_id": "original", "name": "Original", "config": {"keep": True}}],
            "config": {"keep": True},
            "mcp_servers": servers,
        },
    )
    assert response.status_code == 201, response.text
    return f"{collection}/{response.json()['id']}"


@pytest.mark.parametrize("operation", ["create", "update"])
@pytest.mark.parametrize(
    "servers, message",
    [
        pytest.param([{"name": ""}, {"name": ""}], "Duplicate MCP server name", id="blank-servers"),
        pytest.param([{"name": "documents"}, {"name": "documents"}], "Duplicate MCP server name", id="named-servers"),
        pytest.param([{"name": " "}, {"name": " "}], "Duplicate MCP server name", id="whitespace-servers"),
        pytest.param(
            [{"name": "", "tools": [{"name": ""}, {"name": ""}]}], "Duplicate tool name", id="blank-tools-blank-server"
        ),
        pytest.param(
            [{"name": "", "tools": [{"name": "list"}, {"name": "list"}]}],
            "Duplicate tool name",
            id="named-tools-blank-server",
        ),
        pytest.param(
            [{"name": "documents", "tools": [{"name": ""}, {"name": ""}]}],
            "Duplicate tool name",
            id="blank-tools-named-server",
        ),
        pytest.param(
            [{"name": "documents", "tools": [{"name": "list"}, {"name": "list"}]}],
            "Duplicate tool name",
            id="named-tools-named-server",
        ),
        pytest.param(
            [{"name": "", "tools": [{"name": " "}, {"name": " "}]}],
            "Duplicate tool name",
            id="whitespace-tools-blank-server",
        ),
    ],
)
def test_duplicate_mcp_names_return_422_and_leave_saved_data_unchanged(
    client, created_workspace, operation, servers, message
):
    collection = f"/api/workspaces/{created_workspace}/multi-agentic-systems"
    path = _create(client, collection, "Original MAS", [{"name": "", "tools": [{"name": ""}]}])
    before = _read(client, path)
    before_list = _read(client, collection)
    payload = {
        "name": "Rejected MAS",
        "description": "Must not persist",
        "agents": [{"agent_id": "replacement", "name": "Replacement"}],
        "config": {"changed": True},
        "mcp_servers": servers,
    }

    response = client.post(collection, json=payload) if operation == "create" else client.put(path, json=payload)

    assert response.status_code == 422, response.text
    assert message in response.json()["detail"]
    assert "Database integrity error" not in response.text
    assert _read(client, path) == before
    assert _read(client, collection) == before_list


@pytest.mark.parametrize("operation", ["create", "update"])
def test_single_blank_names_and_name_reuse_in_the_correct_scopes_remain_valid(client, created_workspace, operation):
    collection = f"/api/workspaces/{created_workspace}/multi-agentic-systems"
    original_servers = [{"name": "", "tools": [{"name": ""}]}]
    path = _create(client, collection, "Original MAS", original_servers)
    before = _read(client, path)
    servers = [
        {"name": "", "tools": [{"name": ""}, {"name": "shared"}, {"name": " "}, {"name": "Tool"}, {"name": "tool"}]},
        {"name": "documents", "tools": [{"name": ""}, {"name": "shared"}]},
        {"name": " ", "tools": None},
        {"name": "Server", "tools": []},
        {"name": "server"},
    ]

    if operation == "create":
        path = _create(client, collection, "Another MAS", servers)
    else:
        response = client.put(path, json={"mcp_servers": servers})
        assert response.status_code == 200, response.text

    after = _read(client, path)
    actual = {server["name"]: server for server in after["mcp_servers"]}
    assert set(actual) == {server["name"] for server in servers}
    for server in servers:
        assert {tool["name"] for tool in actual[server["name"]]["tools"] or []} == {
            tool["name"] for tool in server.get("tools") or []
        }
    if operation == "update":
        assert actual[""]["id"] == before["mcp_servers"][0]["id"]
        assert (
            next(tool for tool in actual[""]["tools"] if tool["name"] == "")["id"]
            == before["mcp_servers"][0]["tools"][0]["id"]
        )
