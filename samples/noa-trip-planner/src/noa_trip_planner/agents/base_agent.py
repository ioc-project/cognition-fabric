# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Base class for specialized agents."""

import os
from typing import Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from noa_trip_planner.delay import apply_simulated_delay


class SpecializedAgent:
    """Base class for specialized agents."""

    def __init__(self, name: str, tools: list, system_prompt: str):
        """
        Initialize a specialized agent.

        Args:
            name: The name of the agent
            tools: List of tools available to the agent
            system_prompt: The system prompt that defines the agent's behavior
        """
        self.name = name
        self.tools = tools
        self.system_prompt = system_prompt

        base_url = os.environ.get("AI_GATEWAY_BASE_URL")
        api_key = os.environ.get("AI_GATEWAY_API_KEY")
        # Allow model override via environment variable (default: azure/gpt-4o for LiteLLM)
        model_name = os.environ.get("NOA_LLM_MODEL", "azure/gpt-4o")

        self.llm = ChatOpenAI(
            model=model_name,
            temperature=0,
            base_url=base_url,
            api_key=api_key,
        )

        # Bind tools to the LLM
        self.llm_with_tools = self.llm.bind_tools(tools)

    def __call__(self, state: dict) -> dict:
        """
        Execute the agent.

        Args:
            state: The current agent state containing messages and metadata

        Returns:
            Updated state with agent's response
        """
        print("apply_simulated_delay for agent")
        # Simulate long-running execution to make observability timelines clearer.
        apply_simulated_delay(component="agent", step_name=self.name)
        print("applied_simulated_delay for agent")

        # Get the concise query from moderator (not full conversation history)
        agent_query = state.get("agent_query", "")
        original_question = state.get("question", "")
        messages: Sequence[BaseMessage] = state["messages"]

        # If no agent_query, fall back to using messages (backward compatibility)
        if not agent_query:
            # Find the last routing message to extract context
            for msg in reversed(messages):
                if isinstance(msg, AIMessage) and "Routing to" in str(msg.content):
                    agent_query = (
                        str(msg.content).split(":", 1)[1].strip()
                        if ":" in str(msg.content)
                        else str(msg.content)
                    )
                    break
            if not agent_query:
                agent_query = "Please address the original question."

        # Build concise context for the agent
        agent_input = (
            f"Original question: {original_question}\n\nYour task: {agent_query}"
        )

        # Find recent agent-specific messages (this agent's previous calls + tool results)
        # This allows the agent to see its own work-in-progress without full conversation history
        agent_recent_messages = []
        for msg in reversed(messages):
            msg_type = type(msg).__name__
            # Stop when we hit the routing message from moderator (start of this task)
            if msg_type == "AIMessage" and "Routing to" in str(msg.content):
                break
            # Include this agent's previous tool calls and tool results
            if msg_type in ["AIMessage", "ToolMessage"]:
                agent_recent_messages.insert(0, msg)

        # Create message list: system prompt, task, then recent work
        agent_messages: list[BaseMessage] = [
            HumanMessage(content=self.system_prompt),
            HumanMessage(content=agent_input),
        ] + agent_recent_messages

        # Call LLM with tools
        response: AIMessage = self.llm_with_tools.invoke(agent_messages)

        # Only record the response edge if NOT making tool calls
        # (intermediate tool-calling steps shouldn't add edges)
        has_tool_calls = bool(getattr(response, "tool_calls", None))
        communication_chain_update = []

        if not has_tool_calls:
            # This is the final response back to moderator - record the edge
            response_edge = {
                "from": self.name,
                "to": "moderator",
                "response": (
                    response.content if response.content else ""
                ),  # Truncate for storage
            }
            communication_chain_update = [response_edge]

        return {
            "messages": [response],
            "next_agent": "moderator",  # Return to moderator after agent execution
            "communication_chain": communication_chain_update,  # Add response edge only if final response
        }
