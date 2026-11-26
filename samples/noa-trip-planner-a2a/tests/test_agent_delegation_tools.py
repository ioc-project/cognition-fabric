# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest

from noa_trip_planner.a2a.messenger import InMemoryAgentMessenger
from noa_trip_planner.agents.delegation_tools import AgentDelegationToolset


@pytest.mark.asyncio
async def test_specialist_tool_delegates_query_over_a2a() -> None:
    received = []

    async def schedule_agent(query: str) -> str:
        received.append(query)
        return "The train leaves at 09:00."

    toolset = AgentDelegationToolset(
        InMemoryAgentMessenger({"schedule_agent": schedule_agent}),
        ["schedule_agent"],
    )

    result = await toolset.tools[0].ainvoke({"query": "Find a morning train"})

    assert result == "The train leaves at 09:00."
    assert received == ["Find a morning train"]


def test_specialist_tools_have_native_query_schema_and_descriptions() -> None:
    toolset = AgentDelegationToolset(InMemoryAgentMessenger({}), ["schedule_agent"])
    tool = toolset.tools[0]

    assert tool.name == "schedule_agent"
    assert "timetable" in tool.description
    assert tool.args_schema.model_json_schema()["required"] == ["query"]
