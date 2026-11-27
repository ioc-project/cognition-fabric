# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Moderator Agent implementation."""

import logging
import os
from collections.abc import Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from noa_trip_planner.delay import apply_simulated_delay
from noa_trip_planner.http_clients import model_client_options

logger = logging.getLogger(__name__)


class ModeratorAgent:
    """Coordinate specialists through native LLM tool calls."""

    def __init__(
        self,
        system_prompt: str,
        tools: Sequence[BaseTool] = (),
        llm: Any | None = None,
        max_tool_iterations: int = 8,
    ):
        self.system_prompt = system_prompt
        self.tools = tuple(tools)
        self.max_tool_iterations = max_tool_iterations

        base_url = os.environ.get("AI_GATEWAY_BASE_URL")
        api_key = os.environ.get("AI_GATEWAY_API_KEY")

        # Allow model override via environment variable (default: azure/gpt-4o for LiteLLM)
        model_name = os.environ.get("NOA_LLM_MODEL", "azure/gpt-4o")

        self.llm = llm or ChatOpenAI(
            model=model_name,
            temperature=0,
            base_url=base_url,
            api_key=api_key,
            **model_client_options(),
        )
        self.llm_with_tools = (
            self.llm.bind_tools(self.tools) if self.tools else self.llm
        )
        self._tools_by_name = {tool.name: tool for tool in self.tools}

    async def __call__(self, state: dict) -> dict:
        """
        Invoke specialist tools as needed, then synthesize a final answer.

        Args:
            state: The current agent state

        Returns:
            Updated state with the model/tool messages and final answer
        """
        print("apply_simulated_delay for moderator")
        apply_simulated_delay(component="moderator", step_name="moderator")
        print("applied_simulated_delay for moderator")

        prior_messages: Sequence[BaseMessage] = state["messages"]
        question: str = state.get("question", "")
        messages: list[BaseMessage] = [SystemMessage(content=self.system_prompt)]
        messages.extend(prior_messages)
        generated_messages: list[BaseMessage] = []
        communication_chain: list[dict] = []

        for _ in range(self.max_tool_iterations + 1):
            response: AIMessage = await self.llm_with_tools.ainvoke(messages)
            logger.info("Moderator response: %s", response.content)
            messages.append(response)
            generated_messages.append(response)

            if not response.tool_calls:
                return {
                    "messages": generated_messages,
                    "final_answer": response.text,
                    "question": question,
                    "communication_chain": communication_chain,
                }

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                query = tool_call["args"].get("query", "")
                tool = self._tools_by_name.get(tool_name)
                communication_chain.append(
                    {"from": "moderator", "to": tool_name, "query": query}
                )
                if tool is None:
                    result = f"Unknown specialist agent: {tool_name}"
                    status = "error"
                else:
                    try:
                        tool_result = await tool.ainvoke(tool_call)
                        if isinstance(tool_result, ToolMessage):
                            result = tool_result.content
                        else:
                            result = tool_result
                        status = "success"
                    except Exception as error:
                        logger.exception("Specialist delegation failed: %s", tool_name)
                        result = f"Specialist delegation failed: {error}"
                        status = "error"

                communication_chain.append(
                    {"from": tool_name, "to": "moderator", "response": result}
                )
                if (
                    tool is not None
                    and status == "success"
                    and isinstance(tool_result, ToolMessage)
                ):
                    tool_message = tool_result
                else:
                    tool_message = ToolMessage(
                        content=result,
                        tool_call_id=tool_call["id"],
                        name=tool_name,
                        status=status,
                    )
                messages.append(tool_message)
                generated_messages.append(tool_message)

        raise RuntimeError(
            f"Moderator exceeded {self.max_tool_iterations} tool iterations"
        )
