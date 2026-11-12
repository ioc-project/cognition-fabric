# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""The local NOA agent/tool identities used by both execution and proxy routes."""

AGENT_TOOLS = {
    "schedule_agent": ("list_documents", "read_document"),
    "itinerary_agent": ("query_graph_database", "calculate"),
    "concierge_agent": ("list_documents", "read_document", "calculate"),
}


def tool_path(agent: str, tool: str) -> str:
    if tool not in AGENT_TOOLS.get(agent, ()):
        raise ValueError(f"Unknown NOA agent/tool pair: {agent}/{tool}")
    return f"/tools/{agent}/{tool}"


def tools_for_agent(agent: str) -> list:
    # Keep the registry importable by the configuration renderer without loading
    # LangChain or creating any model clients.
    from noa_trip_planner.agents.tools import (
        calculate,
        create_agent_tools,
        query_graph_database,
        read_document,
    )

    tools = {
        "list_documents": lambda: create_agent_tools(agent),
        "read_document": lambda: read_document,
        "query_graph_database": lambda: query_graph_database,
        "calculate": lambda: calculate,
    }
    return [tools[name]() for name in AGENT_TOOLS[agent]]
