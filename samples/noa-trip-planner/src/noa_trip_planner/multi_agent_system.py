# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Multi-Agent System with Dynamic Routing using LangGraph

This template implements a moderator-agent architecture where:
- A moderator receives questions and dynamically routes to specialized agents
- Each agent has access to specific tools
- The workflow adapts based on the question and agent responses
"""

import json
import logging
import operator
import os
from typing import Annotated, Literal, NotRequired, Sequence, TypedDict

from ioa_observe.sdk import Observe
from ioa_observe.sdk.decorators import agent as ioa_observe_agent
from ioa_observe.sdk.decorators import graph as ioa_observe_graph
from ioa_observe.sdk.tracing import session_start
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from noa_trip_planner.agents import (
    ConciergeAgent,
    ItineraryAgent,
    ModeratorAgent,
    ScheduleAgent,
)
from noa_trip_planner.agents.prompts import (
    AGENT_DESCRIPTIONS,
    CONCIERGE_AGENT_PROMPT,
    ITINERARY_AGENT_PROMPT,
    MODERATOR_AGENT_PROMPT,
    MODERATOR_SINGLE_AGENT_PROMPT,
    SCHEDULE_AGENT_PROMPT,
)
from noa_trip_planner.reward_annotator import RewardAnnotator, prompt_for_reward
from noa_trip_planner.enforcement import gated_tool_node
from opentelemetry.context import get_value


APPLICATION_ID = os.environ.get("NOA_MAS_ID", "noa-trip-planner-mas")

# Module logger
logger = logging.getLogger(__name__)
# Basic logging configuration when running as a script
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

# ============================================================================
# Prompt Generation
# ============================================================================


def generate_adaptive_moderator_prompt(available_agents: list[str]) -> str:
    # If no agents available, return a standalone moderator prompt
    if not available_agents:
        return MODERATOR_SINGLE_AGENT_PROMPT

    # Build available agents list with descriptions
    available_descriptions = "\n".join(
        f"- {agent}: {AGENT_DESCRIPTIONS.get(agent)}"
        for agent in available_agents
        if agent in AGENT_DESCRIPTIONS.keys()
    )

    # Build agent options for decision format
    agent_options = ", ".join(available_agents)

    # Substitute placeholders in template
    return MODERATOR_AGENT_PROMPT.format(
        available_agents_list=available_descriptions, agent_options=agent_options
    )


# ============================================================================
# Define the State
# ============================================================================
class AgentState(TypedDict):
    """State shared across the multi-agent system."""

    messages: Annotated[Sequence[BaseMessage], operator.add]
    next_agent: NotRequired[str]  # Which agent to route to next
    question: NotRequired[str]  # Original user question
    agent_query: NotRequired[str]  # Concise query for the next agent
    reasoning: NotRequired[str]  # Moderator's reasoning
    final_answer: NotRequired[str]  # Final response to return
    communication_chain: Annotated[
        list[dict], operator.add
    ]  # Track M->A->M communication edges


# ============================================================================
# Initialize Specialized Agents
# ============================================================================

# Initialize specialized agents using the new package structure
schedule_agent = ioa_observe_agent(name="schedule_agent", description="Handles train schedule and timetable queries")(
    ScheduleAgent(system_prompt=SCHEDULE_AGENT_PROMPT)
)
itinerary_agent = ioa_observe_agent(name="itinerary_agent", description="Plans travel itineraries and routes between cities")(
    ItineraryAgent(system_prompt=ITINERARY_AGENT_PROMPT)
)
concierge_agent = ioa_observe_agent(name="concierge_agent", description="Provides city attractions, fares, and travel recommendations")(
    ConciergeAgent(system_prompt=CONCIERGE_AGENT_PROMPT)
)
# Moderator agent will be created dynamically in the graph creation function

# ============================================================================
# Router Function
# ============================================================================


def _route_to_available_agent(state: AgentState, available_agents: list[str]) -> str:
    """Route to an available agent or end, filtering by available_agents list."""
    next_agent: str = state.get("next_agent", "end")

    if next_agent == "end":
        return "end"
    elif next_agent in available_agents:
        return next_agent
    else:
        # If agent is not available, default to end
        print(
            f"[WARNING] Agent '{next_agent}' requested but not available. Ending execution."
        )
        return "end"


# ============================================================================
# Tool Nodes for Each Agent
# ============================================================================

# Create ToolNodes using agents' bound tools to ensure consistency
schedule_tools = ToolNode(schedule_agent.tools)
itinerary_tools = ToolNode(itinerary_agent.tools)
concierge_tools = ToolNode(concierge_agent.tools)


def should_continue_to_tools(state: AgentState) -> Literal["tools", "moderator"]:
    """Determine if agent should use tools or return to moderator."""
    messages: Sequence[BaseMessage] = state["messages"]
    last_message: BaseMessage = messages[-1]

    has_tool_calls = hasattr(last_message, "tool_calls") and last_message.tool_calls
    destination = "tools" if has_tool_calls else "moderator"

    return destination


def finalize_answer(state: AgentState) -> AgentState:
    """Extract final_answer from messages for tracing."""
    # If final_answer is already set, just return it
    if state.get("final_answer"):
        return {"final_answer": state.get("final_answer")}

    # Otherwise, try to extract from messages
    for msg in reversed(state.get("messages", [])):
        if hasattr(msg, "content") and isinstance(msg.content, str):
            if "DECISION: FINAL_ANSWER:" in msg.content:
                extracted = msg.content.split("DECISION: FINAL_ANSWER:", 1)[1].strip()
                if extracted:
                    return {"final_answer": extracted}

    # Fallback: extract agent findings if no answer found
    agent_findings = [
        msg.content
        for msg in state.get("messages", [])
        if hasattr(msg, "content")
        and isinstance(msg.content, str)
        and any(
            kw in msg.content.lower()
            for kw in ["schedule", "train", "route", "price", "fare", "attraction"]
        )
    ]
    if agent_findings:
        return {
            "final_answer": "[Partial Answer - Recursion limit reached]\n\nInformation gathered:\n\n"
            + "\n\n---\n\n".join(agent_findings[-3:])
        }

    return {"final_answer": state.get("final_answer", "No answer provided.")}


# Create a traced version for exception handling
@ioa_observe_agent(name="finalize_on_error", description="Extracts final answer from state on error or recursion limit")
def finalize_answer_traced(state: AgentState) -> AgentState:
    """Traced wrapper for finalize_answer to use in exception handling."""
    return finalize_answer(state)


# ============================================================================
# Build the Graph
# ============================================================================


@ioa_observe_graph(name="noa-trip-planner", application_id=APPLICATION_ID)
def create_multi_agent_system(available_agents: list[str] | None = None):
    """Create and compile the multi-agent system graph.

    Args:
        available_agents: List of agents to use. If None, uses all agents.
                         Valid values: ["schedule_agent", "itinerary_agent", "concierge_agent"]
    """
    if available_agents is None:
        available_agents = ["schedule_agent", "itinerary_agent", "concierge_agent"]

    # Validate agent names
    valid_agents = {"schedule_agent", "itinerary_agent", "concierge_agent"}
    available_agents = [a for a in available_agents if a in valid_agents]

    # Create moderator with adaptive prompt
    adaptive_moderator_prompt = generate_adaptive_moderator_prompt(available_agents)
    adaptive_moderator = ioa_observe_agent(name="moderator", description="Routes questions to specialized agents and synthesizes final answers")(
        ModeratorAgent(system_prompt=adaptive_moderator_prompt)
    )

    # Initialize the graph
    workflow = StateGraph(AgentState)

    # Add moderator node
    workflow.add_node("moderator", adaptive_moderator)

    # Add finalize node to extract final_answer before ending
    workflow.add_node("finalize", finalize_answer)

    # Add agent nodes only if they're in available_agents
    if "schedule_agent" in available_agents:
        workflow.add_node("schedule_agent", schedule_agent)
        workflow.add_node("schedule_tools", gated_tool_node(schedule_tools, "schedule_agent"))

    if "itinerary_agent" in available_agents:
        workflow.add_node("itinerary_agent", itinerary_agent)
        workflow.add_node("itinerary_tools", gated_tool_node(itinerary_tools, "itinerary_agent"))

    if "concierge_agent" in available_agents:
        workflow.add_node("concierge_agent", concierge_agent)
        workflow.add_node("concierge_tools", gated_tool_node(concierge_tools, "concierge_agent"))

    # Set entry point
    workflow.add_edge(START, "moderator")

    # If no agents available, moderator goes directly to finalize
    if not available_agents:
        workflow.add_edge("moderator", "finalize")
        workflow.add_edge("finalize", END)
    else:
        # Build conditional edges based on available agents
        conditional_edges_dict = {"end": "finalize"}
        if "schedule_agent" in available_agents:
            conditional_edges_dict["schedule_agent"] = "schedule_agent"
        if "itinerary_agent" in available_agents:
            conditional_edges_dict["itinerary_agent"] = "itinerary_agent"
        if "concierge_agent" in available_agents:
            conditional_edges_dict["concierge_agent"] = "concierge_agent"

        workflow.add_conditional_edges(
            "moderator",
            lambda state: _route_to_available_agent(state, available_agents),
            conditional_edges_dict,
        )

    # Add conditional edges from schedule agent (only if available)
    if "schedule_agent" in available_agents:
        workflow.add_conditional_edges(
            "schedule_agent",
            should_continue_to_tools,
            {"tools": "schedule_tools", "moderator": "moderator"},
        )
        workflow.add_edge("schedule_tools", "schedule_agent")

    # Add conditional edges from itinerary agent (only if available)
    if "itinerary_agent" in available_agents:
        workflow.add_conditional_edges(
            "itinerary_agent",
            should_continue_to_tools,
            {"tools": "itinerary_tools", "moderator": "moderator"},
        )
        workflow.add_edge("itinerary_tools", "itinerary_agent")

    # Add conditional edges from concierge agent (only if available)
    if "concierge_agent" in available_agents:
        workflow.add_conditional_edges(
            "concierge_agent",
            should_continue_to_tools,
            {"tools": "concierge_tools", "moderator": "moderator"},
        )
        workflow.add_edge("concierge_tools", "concierge_agent")

    # All paths lead to finalize before END
    workflow.add_edge("finalize", END)

    # Compile with memory
    memory = MemorySaver()
    app = workflow.compile(checkpointer=memory)

    return app


# ============================================================================
# Graph Visualization
# ============================================================================


def display_graph_structure(app) -> None:
    """Display the graph structure of the multi-agent system."""
    try:
        from IPython.display import Image, display

        display(Image(app.get_graph().draw_mermaid_png()))
    except Exception as e:
        logger.warning(f"Could not render graph: {e}")
        logger.info("The system is still functional, visualization just failed.")


# ============================================================================
# Usage Example
# ============================================================================


def run(questions: list[str]) -> None:
    """Example usage of the multi-agent system."""

    if os.getenv("OTLP_HTTP_ENDPOINT") is not None:
        Observe.init(APPLICATION_ID, api_endpoint=os.getenv("OTLP_HTTP_ENDPOINT"))
        session_start()
    # Create the system
    app = create_multi_agent_system()

    # Display the graph structure
    display_graph_structure(app)

    for i, question in enumerate(questions):
        logger.info(f"\n{'='*80}")
        logger.info(f"Question {i+1}: {question}")
        logger.info("=" * 80)

        # Initialize state
        initial_state: AgentState = {
            "messages": [HumanMessage(content=question)],
            "next_agent": "moderator",
            "question": question,
            "final_answer": "",
        }

        # Configure with thread for conversation tracking
        config = {
            "configurable": {"thread_id": f"conversation_{i}"},
            "recursion_limit": 25,
        }

        # Run the system
        result: AgentState = app.invoke(initial_state, config)

        # Print final answer
        logger.info(
            f"\nFinal Answer: {result.get('final_answer', 'No answer provided')}"
        )


def ask_question(
    question: str,
    thread_id: str = "default",
    debugging: bool = False,
    annotation_mode: bool = False,
    available_agents: list[str] | None = None,
):
    """
    Helper function to ask a question to the multi-agent system.

    Args:
        question: The question to ask
        thread_id: Thread ID for conversation memory
        debugging: Enable debug output
        annotation_mode: If True, prompt user for reward annotation after execution
        available_agents: List of agents to use. If None, uses all agents.
                         Valid values: ["schedule_agent", "itinerary_agent", "concierge_agent"]
    """
    if available_agents is None:
        available_agents = ["schedule_agent", "itinerary_agent", "concierge_agent"]

    initial_state = {
        "messages": [HumanMessage(content=question)],
        "question": question,
        "final_answer": "",
        "communication_chain": [],
    }

    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 25}

    logger.info(f"\n{'='*80}")
    logger.info(f"Question: {question}")
    logger.info(f"Available agents: {', '.join(available_agents)}")
    logger.info("=" * 80)

    if os.getenv("OTLP_HTTP_ENDPOINT") is not None:
        Observe.init(APPLICATION_ID, api_endpoint=os.getenv("OTLP_HTTP_ENDPOINT"))
        session_start()

    # Get the session ID generated by the SDK (same as what's captured in traces)
    session_id = get_value("session.id")

    app = create_multi_agent_system(available_agents=available_agents)

    # Display the graph structure
    # display_graph_structure(app)

    try:
        if debugging:
            # Increase verbosity for debugging output
            logger.setLevel(logging.DEBUG)
            logger.debug("\n--- Streaming Execution ---\n")
            logger.debug("Starting app.stream()...")

            # Stream the execution to see the routing in action
            for event in app.stream(initial_state, config):
                logger.debug(f"Received event from stream: {list(event.keys())}")
                for node_name, node_state in event.items():
                    logger.debug(f"\n{'='*80}")
                    logger.debug(f"📍 EXECUTING NODE: {node_name}")
                    logger.debug(f"{'='*80}")

                    # Print state information
                    logger.debug(
                        f"   next_agent: {node_state.get('next_agent', 'NOT SET')}"
                    )
                    logger.debug(
                        f"   final_answer: {'SET' if node_state.get('final_answer') else 'NOT SET'}"
                    )
                    logger.debug(
                        f"   message_count: {len(node_state.get('messages', []))}"
                    )

                    # Print moderator reasoning if available
                    if node_name == "moderator" and "reasoning" in node_state:
                        logger.debug(f"   💭 Reasoning: {node_state['reasoning']}")

                    if "messages" in node_state and node_state["messages"]:
                        last_msg = node_state["messages"][-1]
                        if hasattr(last_msg, "content"):
                            content_preview = str(last_msg.content)[:200]
                            logger.debug(f"   📨 Last message: {content_preview}...")
                        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                            logger.debug(
                                f"   🔧 Tool calls: {[tc.get('name') for tc in last_msg.tool_calls]}"
                            )
                    logger.debug(f"{'='*80}\n")
        else:
            app.invoke(initial_state, config)

    except Exception as e:
        logger.error(f"\n⚠️  ERROR: {type(e).__name__}: {str(e)}")
        logger.info("Attempting to retrieve partial results from last checkpoint...\n")

    # Get final state after streaming completes (or fails)
    try:
        final_state = app.get_state(config)
        finalized_state = finalize_answer_traced(final_state.values)
        all_messages = final_state.values.get("messages", [])
        final_answer = finalized_state.get("final_answer", "")

    except Exception as e:
        logger.error(f"⚠️  Could not retrieve state: {e}")
        all_messages = []
        final_answer = "No answer provided - execution failed"

    logger.info(f"\n\n✅ FINAL ANSWER:\n{final_answer}")
    logger.info(f"\n📊 Total messages in conversation: {len(all_messages)}")
    logger.info(f"🆔 Session ID: {session_id}")

    # Annotation mode: prompt user for reward and write to ClickHouse
    if annotation_mode:
        reward = prompt_for_reward()
        if reward is not None:
            annotator = RewardAnnotator()
            annotator.annotate_session(session_id, reward)

    # Extract communication chain from final state if available
    communication_chain = []
    try:
        final_state = app.get_state(config)
        communication_chain = final_state.values.get("communication_chain", [])
    except Exception:
        pass

    return {
        "final_answer": final_answer,
        "messages": all_messages,
        "session_id": session_id,
        "communication_chain": communication_chain,
    }


def run_quiet():
    """Quiet run example without any console output."""
    import argparse

    logger.propagate = False
    parser = argparse.ArgumentParser(description="Multi-Agent Trip Planner")
    parser.add_argument(
        "--question",
        type=str,
        default="Propose me a detailed touristic trip plus itinerary, by choosing from the following cities: Celestia, Verdantia, Luminos. As for attractions etc., do not make things up but base your answer on the documents available. Further, provide exact departure times for the trains between the cities, use available data. Finally, provide the cost (prices) for the train travels between the cities. Look carefully in the prompts describing the agents (and their tools) available to you.",
        help="Question to ask the multi-agent system",
    )
    args = parser.parse_args()
    res = ask_question(args.question)
    if res["final_answer"]:
        answer = {
            "final_answer": res["final_answer"],
            "session_id": res["session_id"],
        }
    else:
        answer = {
            "session_id": res["session_id"],
        }
    print(json.dumps(answer))


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Multi-Agent Trip Planner")
    parser.add_argument(
        "--annotate",
        action="store_true",
        help="Enable annotation mode to rate the response after execution",
    )
    parser.add_argument(
        "--question",
        type=str,
        # default="Propose me a detailed touristic trip plus itinerary, by choosing from the following cities: Celestia, Verdantia, Luminos. As for attractions etc., do not make things up but base your answer on the documents available. Further, provide exact departure times for the trains between the cities, use available data. Finally, provide the cost (prices) for the train travels between the cities. Look carefully in the prompts describing the agents (and their tools) available to you.",
        default="Show me train schedules from Luminos to Celestia.",
        help="Question to ask the multi-agent system",
    )
    parser.add_argument(
        "--agents",
        type=str,
        default="schedule_agent,itinerary_agent,concierge_agent",
        help="Comma-separated list of available agents. Options: schedule_agent, itinerary_agent, concierge_agent. Default: all agents",
    )

    args = parser.parse_args()

    # Parse available agents from comma-separated string
    # Filter out empty strings to handle empty input
    available_agents = [a.strip() for a in args.agents.split(",") if a.strip()]

    ask_question(
        args.question, annotation_mode=args.annotate, available_agents=available_agents
    )


if __name__ == "__main__":
    main()
