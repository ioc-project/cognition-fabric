# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from langchain_core.messages import AIMessage
from langchain_core.tools import StructuredTool
import pytest

from noa_trip_planner.agents.base_agent import SpecializedAgent


class FakeToolCallingModel:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.received_messages = []

    def bind_tools(self, tools):
        self.bound_tools = tools
        return self

    async def ainvoke(self, messages):
        self.received_messages.append(list(messages))
        return next(self.responses)


@pytest.mark.asyncio
async def test_specialist_executes_injected_tool_and_returns_final_answer() -> None:
    def calculate(expression: str) -> str:
        """Return a deterministic test calculation."""
        return "42"

    model = FakeToolCallingModel(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "calculate",
                        "args": {"expression": "6 * 7"},
                        "id": "call-1",
                    }
                ],
            ),
            AIMessage(content="The answer is 42."),
        ]
    )
    agent = SpecializedAgent(
        "itinerary_agent",
        [StructuredTool.from_function(calculate)],
        "Plan routes.",
        llm=model,
    )

    result = await agent.answer("What is six times seven?", "Calculate it")

    assert result == "The answer is 42."
    tool_message = model.received_messages[1][-1]
    assert tool_message.content == "42"
    assert tool_message.tool_call_id == "call-1"


@pytest.mark.asyncio
async def test_specialist_reports_unapproved_tool_to_model() -> None:
    model = FakeToolCallingModel(
        [
            AIMessage(
                content="",
                tool_calls=[{"name": "forbidden", "args": {}, "id": "call-2"}],
            ),
            AIMessage(content="I cannot use that tool."),
        ]
    )
    agent = SpecializedAgent("schedule_agent", [], "Find schedules.", llm=model)

    result = await agent.answer("Do something unsafe")

    assert result == "I cannot use that tool."
    assert model.received_messages[1][-1].status == "error"
