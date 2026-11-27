# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Base class for MCP-backed specialized agents."""

from collections.abc import Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import BaseTool

from noa_trip_planner.delay import apply_simulated_delay
from noa_trip_planner.http_clients import create_model_client


class SpecializedAgent:
    """A specialist that completes one delegated task using its allowed tools."""

    def __init__(
        self,
        name: str,
        tools: Sequence[BaseTool],
        system_prompt: str,
        llm: Any | None = None,
        max_tool_iterations: int = 8,
    ):
        self.name = name
        self.tools = tuple(tools)
        self.system_prompt = system_prompt
        self.max_tool_iterations = max_tool_iterations
        self.llm = llm if llm is not None else create_model_client()
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self._tools_by_name = {tool.name: tool for tool in self.tools}

    async def answer(self, question: str, delegated_task: str | None = None) -> str:
        """Complete a delegated task, invoking tools until the model responds."""
        apply_simulated_delay(component="agent", step_name=self.name)
        task = delegated_task or "Please address the original question."
        messages: list[BaseMessage] = [
            HumanMessage(content=self.system_prompt),
            HumanMessage(content=f"Original question: {question}\n\nYour task: {task}"),
        ]

        for _ in range(self.max_tool_iterations + 1):
            response: AIMessage = await self.llm_with_tools.ainvoke(messages)
            messages.append(response)
            if not response.tool_calls:
                return response.text

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool = self._tools_by_name.get(tool_name)
                if tool is None:
                    messages.append(
                        ToolMessage(
                            content=f"Tool is not allowed for {self.name}: {tool_name}",
                            tool_call_id=tool_call["id"],
                            name=tool_name,
                            status="error",
                        )
                    )
                    continue
                try:
                    result = await tool.ainvoke(tool_call)
                    if isinstance(result, ToolMessage):
                        messages.append(result)
                    else:
                        messages.append(
                            ToolMessage(
                                content=result,
                                tool_call_id=tool_call["id"],
                                name=tool_name,
                            )
                        )
                except Exception as error:
                    messages.append(
                        ToolMessage(
                            content=f"Tool execution failed: {error}",
                            tool_call_id=tool_call["id"],
                            name=tool_name,
                            status="error",
                        )
                    )

        raise RuntimeError(
            f"{self.name} exceeded {self.max_tool_iterations} tool iterations"
        )
