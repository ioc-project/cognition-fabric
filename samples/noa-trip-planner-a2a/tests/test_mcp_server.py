# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest
from mcp import Client

from noa_trip_planner.tooling.mcp_server import create_mcp_server


EXPECTED_TOOLS = {
    "calculate",
    "list_concierge_documents",
    "list_schedule_documents",
    "query_graph_database",
    "read_concierge_document",
    "read_schedule_document",
}


@pytest.mark.asyncio
async def test_mcp_server_exposes_expected_tools() -> None:
    async with Client(create_mcp_server()) as client:
        tools = await client.list_tools()

    assert {tool.name for tool in tools.tools} == EXPECTED_TOOLS


@pytest.mark.asyncio
async def test_mcp_server_executes_calculator() -> None:
    async with Client(create_mcp_server()) as client:
        result = await client.call_tool("calculate", {"expression": "10 * (5 + 3)"})

    assert result.is_error is False
    assert result.content[0].text == "80"


@pytest.mark.asyncio
async def test_mcp_server_reports_invalid_document_path_as_tool_error() -> None:
    async with Client(create_mcp_server()) as client:
        result = await client.call_tool(
            "read_schedule_document",
            {"document_name": "../concierge_agent/train_fares.txt"},
        )

    assert result.is_error is True
