# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Moderator graph that delegates specialist work over A2A."""

import logging
import operator
import os
from collections.abc import Sequence
from typing import Annotated, NotRequired, TypedDict

from ioa_observe.sdk.decorators import agent as ioa_observe_agent
from ioa_observe.sdk.decorators import graph as ioa_observe_graph
from ioa_observe.sdk.tracing import session_start
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from noa_trip_planner.a2a.messenger import AgentMessenger
from noa_trip_planner.agents import ModeratorAgent
from noa_trip_planner.agents.delegation_tools import AgentDelegationToolset
from noa_trip_planner.agents.prompts import (
    AGENT_DESCRIPTIONS,
    MODERATOR_AGENT_PROMPT,
    MODERATOR_SINGLE_AGENT_PROMPT,
)
from noa_trip_planner.observability import (
    COORDINATOR_APPLICATION_ID,
    observe_enabled,
)
from noa_trip_planner.reward_annotator import RewardAnnotator, prompt_for_reward
from opentelemetry.context import get_value

APPLICATION_ID = COORDINATOR_APPLICATION_ID
SPECIALIST_NAMES = ("schedule_agent", "itinerary_agent", "concierge_agent")

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)


class AgentState(TypedDict):
    """State shared across the coordinator graph."""

    messages: Annotated[Sequence[BaseMessage], operator.add]
    question: NotRequired[str]
    final_answer: NotRequired[str]
    communication_chain: Annotated[list[dict], operator.add]


def generate_adaptive_moderator_prompt(available_agents: list[str]) -> str:
    if not available_agents:
        return MODERATOR_SINGLE_AGENT_PROMPT
    available_descriptions = "\n".join(
        f"- {agent}: {AGENT_DESCRIPTIONS.get(agent)}"
        for agent in available_agents
        if agent in AGENT_DESCRIPTIONS
    )
    return MODERATOR_AGENT_PROMPT.format(
        available_agents_list=available_descriptions,
    )


def finalize_answer(state: AgentState) -> AgentState:
    """Extract the moderator's final answer."""
    if state.get("final_answer"):
        return {"final_answer": state["final_answer"]}

    findings = [
        message.content
        for message in state.get("messages", [])
        if isinstance(message.content, str)
        and any(
            keyword in message.content.lower()
            for keyword in ("schedule", "train", "route", "price", "fare", "attraction")
        )
    ]
    if findings:
        return {
            "final_answer": "[Partial Answer - Recursion limit reached]\n\n"
            "Information gathered:\n\n" + "\n\n---\n\n".join(findings[-3:])
        }
    return {"final_answer": "No answer provided."}


@ioa_observe_agent(
    name="finalize_on_error", description="Extracts final answer from graph state"
)
def finalize_answer_traced(state: AgentState) -> AgentState:
    return finalize_answer(state)


@ioa_observe_graph(name="noa-trip-planner", application_id=APPLICATION_ID)
def create_multi_agent_system(
    messenger: AgentMessenger,
    available_agents: list[str] | None = None,
):
    """Compile a moderator graph whose tools delegate over A2A."""
    if available_agents is None:
        available_agents = list(SPECIALIST_NAMES)
    selected_agents = [name for name in available_agents if name in SPECIALIST_NAMES]
    delegation_tools = AgentDelegationToolset(messenger, selected_agents)
    moderator_agent = ModeratorAgent(
        system_prompt=generate_adaptive_moderator_prompt(selected_agents),
        tools=delegation_tools.tools,
    )

    async def run_moderator(state: AgentState) -> AgentState:
        return await moderator_agent(state)

    moderator = ioa_observe_agent(
        name="moderator",
        description="Routes requests and synthesizes specialist findings",
    )(run_moderator)

    workflow = StateGraph(AgentState)
    workflow.add_node("moderator", moderator)
    workflow.add_node("finalize", finalize_answer)
    workflow.add_edge(START, "moderator")
    workflow.add_edge("moderator", "finalize")
    workflow.add_edge("finalize", END)
    return workflow.compile(checkpointer=MemorySaver())


async def ask_question(
    question: str,
    messenger: AgentMessenger,
    thread_id: str = "default",
    debugging: bool = False,
    annotation_mode: bool = False,
    available_agents: list[str] | None = None,
):
    """Ask the coordinator a question and preserve the existing API result shape."""
    initial_state: AgentState = {
        "messages": [HumanMessage(content=question)],
        "question": question,
        "final_answer": "",
        "communication_chain": [],
    }
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 25}

    if observe_enabled():
        session_start()
    session_id = get_value("session.id")
    app = create_multi_agent_system(messenger, available_agents)

    try:
        if debugging:
            async for event in app.astream(initial_state, config):
                logger.debug("Graph event: %s", list(event))
        else:
            await app.ainvoke(initial_state, config)
    except Exception:
        logger.exception("Trip planner graph execution failed")
        raise

    try:
        snapshot = await app.aget_state(config)
        state = snapshot.values
        finalized = finalize_answer(state)
        all_messages = state.get("messages", [])
        final_answer = finalized.get("final_answer", "")
        communication_chain = state.get("communication_chain", [])
    except Exception:
        logger.exception("Could not retrieve final graph state")
        all_messages = []
        final_answer = "No answer provided - execution failed"
        communication_chain = []

    if annotation_mode:
        reward = prompt_for_reward()
        if reward is not None:
            RewardAnnotator().annotate_session(session_id, reward)

    return {
        "final_answer": final_answer,
        "messages": all_messages,
        "session_id": session_id,
        "communication_chain": communication_chain,
    }
