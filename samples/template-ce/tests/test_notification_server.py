# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""MAS notification summaries and expanded metadata retrieval."""

import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import mas_sync
import notification_server


def sample_mas():
    return {
        "id": "mas-one",
        "workspace_id": "workspace-one",
        "name": "Trip planner",
        "description": "Plans a journey.",
        "agents": [
            {"agent_id": "moderator", "name": "Moderator", "description": "Routes questions."},
            {"agent_id": "reader", "name": None, "description": None},
        ],
        "topology_sources": {
            "provided": {"status": "available"},
            "observed": {"status": "disabled"},
        },
        "topologies": [
            {
                "source": "provided",
                "completeness": "partial",
                "nodes": [
                    {"id": "entry", "type": "start"},
                    {"id": "moderator"},
                    {"id": "reader", "tool_ids": ["read"]},
                    {"id": "exit", "type": "end"},
                ],
                "edges": [
                    {"source": "entry", "target": "moderator"},
                    {
                        "source": "moderator",
                        "target": "reader",
                        "interaction_type": "delegation",
                        "conditional": True,
                    },
                ],
            }
        ],
        "tools": [
            {
                "tool_id": "read",
                "definition": {
                    "name": "native_read",
                    "description": "Read a document.\n\nArgs:\n    file: its path",
                    "inputSchema": {"secret-schema-marker": True},
                    "outputSchema": {"secret-output-marker": True},
                },
                "provider": {"mcp_server_name": "documents", "native_tool_name": "native_read"},
                "source_snapshot": {"secret-snapshot-marker": True},
                "provenance": {"secret-provenance-marker": True},
            }
        ],
        "config": {"secret-config-marker": True},
        "metadata": {"secret-metadata-marker": True},
    }


def test_summary_shows_requested_details_without_raw_documents():
    result = notification_server.format_mas_summary(sample_mas())
    assert "id=mas-one name=Trip planner workspace_id=workspace-one" in result
    assert "Description: Plans a journey." in result
    assert "Agents (2):" in result
    assert "id=moderator | name=Moderator | description=Routes questions." in result
    assert "id=reader | name=not supplied | description=not supplied" in result
    assert "provided=available, observed=disabled" in result
    assert "source=provided completeness=partial" in result
    assert "entry (start)" in result and "exit (end)" in result
    assert "moderator (agent) | tools=not supplied" in result
    assert "reader (agent) | tools=read" in result
    assert "moderator -> reader (delegation, conditional)" in result
    assert "id=read | name=native_read | description=Read a document." in result
    assert "MCP binding: server=documents tool=native_read" in result
    assert "Args:" not in result
    assert "secret-" not in result
    assert "{" not in result


@pytest.mark.parametrize(
    "optional",
    [
        {},
        {
            "description": None,
            "agents": None,
            "tools": None,
            "topologies": None,
            "topology_sources": None,
        },
    ],
)
def test_missing_and_null_optional_collections_are_unspecified(optional):
    result = notification_server.format_mas_summary({"id": "legacy", "name": "Legacy", **optional})
    for section in ("Description", "Agents", "Topology sources", "Topologies", "Tools"):
        assert f"{section}: not supplied" in result
    assert "Agents (0)" not in result


def test_explicit_empty_lists_and_declared_empty_graph_are_distinct():
    result = notification_server.format_mas_summary({"agents": [], "tools": [], "topologies": []})
    assert "Agents: none" in result and "Tools: none" in result and "Topologies: none" in result
    result = notification_server.format_mas_summary(
        {
            "topologies": [
                {
                    "source": "provided",
                    "completeness": "complete",
                    "nodes": [],
                    "edges": [],
                }
            ]
        }
    )
    assert "Topologies (1):" in result and "source=provided completeness=complete" in result
    assert "Nodes: none" in result and "Edges: none" in result


def test_minimal_agents_tools_nodes_and_edges_have_readable_defaults():
    result = notification_server.format_mas_summary(
        {
            "agents": [{"agent_id": "a"}],
            "tools": [{"tool_id": "t", "definition": None, "provider": None}],
            "topologies": [
                {
                    "nodes": [{"id": "a", "tool_ids": []}, {"id": "b", "tool_ids": None}],
                    "edges": [{"source": "a", "target": "b"}],
                }
            ],
        }
    )
    assert "id=a | name=not supplied | description=not supplied" in result
    assert "id=t | name=not supplied | description=not supplied" in result
    assert "a (agent) | tools=none" in result
    assert "b (agent) | tools=not supplied" in result
    assert "a -> b" in result


def test_each_topology_source_is_summarized_independently():
    result = notification_server.format_mas_summary(
        {
            "topology_sources": {
                "provided": {"status": "absent"},
                "observed": {"status": "available"},
            },
            "topologies": [
                {
                    "source": "observed",
                    "completeness": "partial",
                    "nodes": [{"id": "seen"}],
                    "edges": [],
                }
            ],
        }
    )
    assert "provided=absent, observed=available" in result
    assert "source=observed completeness=partial" in result and "seen (agent)" in result
    assert "source=provided" not in result


@pytest.mark.asyncio
async def test_fetch_requests_expanded_metadata_and_emits_one_summary(monkeypatch, caplog):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json=sample_mas())

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        mas_sync.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(respond),
            **kwargs,
        ),
    )
    monkeypatch.setenv("CFN_URL", "http://cfn.local:9002/")
    with caplog.at_level(logging.INFO):
        await notification_server.fetch_mas_details("mas-one")
    assert len(requests) == 1
    assert (
        str(requests[0].url)
        == "http://cfn.local:9002/api/multi-agentic-systems/mas-one?metadata=true"
    )
    assert requests[0].extensions["timeout"]["read"] == 5.0
    assert "Agents (2):" in caplog.text and "moderator -> reader" in caplog.text
    assert "secret-" not in caplog.text


@pytest.mark.asyncio
async def test_fetch_skips_unconfigured_cfn(monkeypatch):
    monkeypatch.delenv("CFN_URL", raising=False)
    client = AsyncMock()
    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", client)
    await notification_server.fetch_mas_details("mas-one")
    client.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_404_drops_without_retry_or_summary(monkeypatch, caplog):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(404, text="upstream-body-not-for-summary")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        mas_sync.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(respond),
            **kwargs,
        ),
    )
    monkeypatch.setenv("CFN_URL", "http://cfn.local:9002")
    with caplog.at_level(logging.INFO):
        await notification_server.fetch_mas_details("mas-one")
    assert len(requests) == 1
    assert "MAS gone" in caplog.text
    assert "MAS details:" not in caplog.text and "upstream-body-not-for-summary" not in caplog.text


class TestGetHTTPPort:
    def test_default(self, monkeypatch):
        monkeypatch.delenv("HTTP_PORT", raising=False)
        assert notification_server.get_http_port() == 8080

    def test_valid_value(self, monkeypatch):
        monkeypatch.setenv("HTTP_PORT", "8090")
        assert notification_server.get_http_port() == 8090

    def test_invalid_value_raises(self, monkeypatch):
        monkeypatch.setenv("HTTP_PORT", "nope")
        with pytest.raises(ValueError, match="HTTP_PORT"):
            notification_server.get_http_port()
