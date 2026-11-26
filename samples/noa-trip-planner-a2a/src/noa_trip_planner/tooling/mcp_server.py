# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""MCP server exposing trip-planner tools over Streamable HTTP."""

import os

from ioa_observe.sdk.decorators import tool as ioa_observe_tool
from mcp.server import MCPServer

from noa_trip_planner.observability import MCP_APPLICATION_ID, initialize_observe
from noa_trip_planner.tooling.operations import (
    calculate as calculate_operation,
    list_documents,
    query_graph_database as query_graph_database_operation,
    read_document,
)


def create_mcp_server() -> MCPServer:
    """Create the MCP server used by trip-planner agents."""
    server = MCPServer(
        "noa-trip-planner-tools",
        version="0.1.0",
        instructions="Tools for schedule, itinerary, and concierge agents.",
    )

    @server.tool()
    @ioa_observe_tool(name="list_schedule_documents", application_id=MCP_APPLICATION_ID)
    def list_schedule_documents() -> list[str]:
        """List train schedule and timetable documents."""
        return list_documents("schedule_agent")

    @server.tool()
    @ioa_observe_tool(name="read_schedule_document", application_id=MCP_APPLICATION_ID)
    def read_schedule_document(document_name: str) -> str:
        """Read a train schedule document by file name."""
        return read_document("schedule_agent", document_name)

    @server.tool()
    @ioa_observe_tool(
        name="list_concierge_documents", application_id=MCP_APPLICATION_ID
    )
    def list_concierge_documents() -> list[str]:
        """List fare and destination documents available to the concierge."""
        return list_documents("concierge_agent")

    @server.tool()
    @ioa_observe_tool(name="read_concierge_document", application_id=MCP_APPLICATION_ID)
    def read_concierge_document(document_name: str) -> str:
        """Read a concierge document by file name."""
        return read_document("concierge_agent", document_name)

    @server.tool()
    @ioa_observe_tool(name="query_graph_database", application_id=MCP_APPLICATION_ID)
    def query_graph_database() -> str:
        """Return all possible routes and travel times from the city graph."""
        return query_graph_database_operation()

    @server.tool()
    @ioa_observe_tool(name="calculate", application_id=MCP_APPLICATION_ID)
    def calculate(expression: str) -> str:
        """Evaluate a restricted arithmetic expression."""
        return calculate_operation(expression)

    return server


mcp = create_mcp_server()


def main() -> None:
    """Run the tool server using Streamable HTTP."""
    initialize_observe(MCP_APPLICATION_ID)
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("MCP_SERVER_PORT", "8001")),
    )


if __name__ == "__main__":
    main()
