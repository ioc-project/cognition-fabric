# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Agent-scoped LangChain tool providers."""

from collections.abc import Sequence
from typing import Protocol

from langchain.mcp import MCPAdapter
from langchain_core.tools import BaseTool, StructuredTool

from noa_trip_planner.tooling.operations import (
    calculate,
    list_documents,
    query_graph_database,
    read_document,
)


AGENT_TOOL_NAMES: dict[str, frozenset[str]] = {
    "schedule_agent": frozenset({"list_schedule_documents", "read_schedule_document"}),
    "itinerary_agent": frozenset({"query_graph_database", "calculate"}),
    "concierge_agent": frozenset(
        {
            "list_concierge_documents",
            "read_concierge_document",
            "calculate",
        }
    ),
}


class ToolProvider(Protocol):
    """Provide the tools an agent is permitted to invoke."""

    async def start(self) -> None:
        """Initialize and validate the provider."""

    def tools_for(self, agent_name: str) -> Sequence[BaseTool]:
        """Return tools permitted for an agent."""


class McpToolProvider:
    """Discover LangChain tools from an MCP endpoint once at startup."""

    def __init__(self, target: object):
        self._adapter = MCPAdapter(target)
        self._tools: dict[str, BaseTool] | None = None

    async def start(self) -> None:
        discovered_tools = await self._adapter.list_tools(cache_mode="refresh")
        tools = {tool.name: tool for tool in discovered_tools}
        required_tools = set().union(*AGENT_TOOL_NAMES.values())
        missing_tools = required_tools - tools.keys()
        if missing_tools:
            missing = ", ".join(sorted(missing_tools))
            raise RuntimeError(f"MCP server is missing required tools: {missing}")
        self._tools = tools

    def tools_for(self, agent_name: str) -> Sequence[BaseTool]:
        if self._tools is None:
            raise RuntimeError("MCP tool provider has not been started")
        try:
            names = AGENT_TOOL_NAMES[agent_name]
        except KeyError as error:
            raise ValueError(f"Unknown agent: {agent_name}") from error
        return tuple(self._tools[name] for name in sorted(names))


class LocalToolProvider:
    """Explicit development adapter over local tool operations."""

    def __init__(self) -> None:
        def list_schedule_documents() -> list[str]:
            """List train schedule and timetable documents."""
            return list_documents("schedule_agent")

        def read_schedule_document(document_name: str) -> str:
            """Read a train schedule document by file name."""
            return read_document("schedule_agent", document_name)

        def list_concierge_documents() -> list[str]:
            """List fare and destination documents available to the concierge."""
            return list_documents("concierge_agent")

        def read_concierge_document(document_name: str) -> str:
            """Read a concierge document by file name."""
            return read_document("concierge_agent", document_name)

        functions = (
            list_schedule_documents,
            read_schedule_document,
            list_concierge_documents,
            read_concierge_document,
            query_graph_database,
            calculate,
        )
        self._tools = {
            function.__name__: StructuredTool.from_function(function)
            for function in functions
        }

    async def start(self) -> None:
        return None

    def tools_for(self, agent_name: str) -> Sequence[BaseTool]:
        try:
            names = AGENT_TOOL_NAMES[agent_name]
        except KeyError as error:
            raise ValueError(f"Unknown agent: {agent_name}") from error
        return tuple(self._tools[name] for name in sorted(names))
