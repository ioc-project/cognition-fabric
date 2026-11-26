# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool
import pytest

from noa_trip_planner.agents.moderator_agent import ModeratorAgent


class FakeModel:
    def __init__(self):
        self.calls = []
        self.bound_tools = ()

    def bind_tools(self, tools):
        self.bound_tools = tuple(tools)
        return self

    async def ainvoke(self, messages):
        self.calls.append(list(messages))
        if len(self.calls) == 1:
            return AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "schedule_agent",
                        "args": {"query": "Find the morning trains."},
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            )
        return AIMessage(content="The first train leaves at 09:00.")


@pytest.mark.asyncio
async def test_moderator_delegates_with_native_tool_call() -> None:
    delegated_queries = []

    async def delegate(query: str) -> str:
        delegated_queries.append(query)
        return "The first train leaves at 09:00."

    tool = StructuredTool.from_function(
        coroutine=delegate,
        name="schedule_agent",
        description="Find train timetables.",
    )
    model = FakeModel()
    moderator = ModeratorAgent(
        "Coordinate trip planning specialists.", tools=[tool], llm=model
    )

    result = await moderator(
        {"messages": [HumanMessage(content="When is the train?")], "question": ""}
    )

    assert model.bound_tools == (tool,)
    assert delegated_queries == ["Find the morning trains."]
    assert isinstance(model.calls[1][-1], ToolMessage)
    assert model.calls[1][-1].content == "The first train leaves at 09:00."
    assert result["final_answer"] == "The first train leaves at 09:00."
    assert result["communication_chain"][0]["to"] == "schedule_agent"
