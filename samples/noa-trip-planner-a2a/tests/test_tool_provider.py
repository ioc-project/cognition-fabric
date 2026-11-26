# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest

from noa_trip_planner.tooling.mcp_server import create_mcp_server
from noa_trip_planner.tooling.provider import LocalToolProvider, McpToolProvider


EXPECTED_AGENT_TOOLS = {
    "schedule_agent": {"list_schedule_documents", "read_schedule_document"},
    "itinerary_agent": {"calculate", "query_graph_database"},
    "concierge_agent": {
        "calculate",
        "list_concierge_documents",
        "read_concierge_document",
    },
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider_factory",
    [LocalToolProvider, lambda: McpToolProvider(create_mcp_server())],
)
async def test_provider_enforces_agent_tool_allowlists(provider_factory) -> None:
    provider = provider_factory()
    await provider.start()

    actual = {
        agent_name: {tool.name for tool in provider.tools_for(agent_name)}
        for agent_name in EXPECTED_AGENT_TOOLS
    }

    assert actual == EXPECTED_AGENT_TOOLS


@pytest.mark.asyncio
async def test_mcp_provider_returns_callable_langchain_tools() -> None:
    provider = McpToolProvider(create_mcp_server())
    await provider.start()
    calculate_tool = next(
        tool
        for tool in provider.tools_for("itinerary_agent")
        if tool.name == "calculate"
    )

    result = await calculate_tool.ainvoke({"expression": "6 * 7"})

    assert result[0]["type"] == "text"
    assert result[0]["text"] == "42"


def test_mcp_provider_requires_startup() -> None:
    provider = McpToolProvider(create_mcp_server())

    with pytest.raises(RuntimeError, match="has not been started"):
        provider.tools_for("schedule_agent")
