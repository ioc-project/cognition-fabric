# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from langchain_core.messages import AIMessage, HumanMessage
import pytest
from types import SimpleNamespace

import noa_trip_planner.multi_agent_system as system
from noa_trip_planner.a2a.messenger import InMemoryAgentMessenger


class FakeModerator:
    def __init__(self, system_prompt: str, tools=()):
        self.system_prompt = system_prompt
        self.tools = tools

    async def __call__(self, state: dict) -> dict:
        return {
            "messages": [AIMessage(content="Finished")],
            "final_answer": "Finished",
            "communication_chain": [],
        }


@pytest.mark.asyncio
async def test_graph_awaits_async_moderator_node(monkeypatch) -> None:
    monkeypatch.setattr(system, "ModeratorAgent", FakeModerator)
    graph = system.create_multi_agent_system(InMemoryAgentMessenger({}))

    result = await graph.ainvoke(
        {
            "messages": [HumanMessage(content="Plan my trip")],
            "question": "Plan my trip",
            "final_answer": "",
            "communication_chain": [],
        },
        {"configurable": {"thread_id": "async-moderator-regression"}},
    )

    assert result["final_answer"] == "Finished"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("available_agents", "expected"),
    [
        (None, list(system.SPECIALIST_NAMES)),
        ([], []),
        (["schedule_agent"], ["schedule_agent"]),
    ],
)
async def test_ask_question_only_exposes_selected_specialists(
    monkeypatch, available_agents, expected,
) -> None:
    class CheckingModerator(FakeModerator):
        def __init__(self, system_prompt, tools):
            super().__init__(system_prompt, tools)
            assert [tool.name for tool in self.tools] == expected

    monkeypatch.setattr(system, "observe_enabled", lambda: False)
    monkeypatch.setattr(system, "ModeratorAgent", CheckingModerator)
    result = await system.ask_question(
        "Plan my trip", InMemoryAgentMessenger({}), available_agents=available_agents,
    )
    assert result["final_answer"] == "Finished"


@pytest.mark.asyncio
async def test_ask_question_does_not_trace_error_finalizer_on_success(
    monkeypatch,
) -> None:
    class FakeGraph:
        async def ainvoke(self, state, config) -> None:
            return None

        async def aget_state(self, config):
            return SimpleNamespace(
                values={
                    "messages": [AIMessage(content="Finished")],
                    "final_answer": "Finished",
                    "communication_chain": [],
                }
            )

    monkeypatch.setattr(system, "observe_enabled", lambda: False)
    monkeypatch.setattr(system, "create_multi_agent_system", lambda *args: FakeGraph())
    monkeypatch.setattr(
        system,
        "finalize_answer_traced",
        lambda state: pytest.fail("error finalizer called on successful request"),
    )

    result = await system.ask_question("Plan my trip", InMemoryAgentMessenger({}))

    assert result["final_answer"] == "Finished"
