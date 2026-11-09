"""HTTP server for MAS lifecycle notifications."""

import logging
import os
from datetime import datetime

from aiohttp import web
import httpx

logger = logging.getLogger(__name__)

NOTIFICATION_PORT = 8080
NOTIFICATION_PATH = "/notification"


def _text(value, *, first_line=False):
    if value is None:
        return "not supplied"
    if not isinstance(value, (str, int, float, bool)):
        return "not supplied"
    lines = str(value).splitlines()
    if first_line:
        value = next((line for line in lines if line.strip()), "")
    return " ".join(str(value).split()) or "not supplied"


def _object(value):
    return value if isinstance(value, dict) else {}


def _section(lines, title, value, indent="  "):
    if not isinstance(value, list):
        lines.append(f"{indent}{title}: not supplied")
        return []
    if not value:
        lines.append(f"{indent}{title}: none")
    else:
        lines.append(f"{indent}{title} ({len(value)}):")
    return value


def format_mas_summary(mas):
    """Readable inventory/graph summary without config, schemas or raw snapshots."""
    mas = _object(mas)
    lines = [
        f"[Notification] MAS details: id={_text(mas.get('id'))} "
        f"name={_text(mas.get('name'))} workspace_id={_text(mas.get('workspace_id'))}",
        f"  Description: {_text(mas.get('description'))}",
    ]
    for item in _section(lines, "Agents", mas.get("agents")):
        agent = _object(item)
        lines.append(
            f"    id={_text(agent.get('agent_id'))} | name={_text(agent.get('name'))} "
            f"| description={_text(agent.get('description'))}"
        )

    sources = mas.get("topology_sources")
    if isinstance(sources, dict):
        statuses = ", ".join(
            f"{_text(source)}={_text(_object(state).get('status'))}"
            for source, state in sources.items()
        )
        lines.append(f"  Topology sources: {statuses or 'none'}")
    else:
        lines.append("  Topology sources: not supplied")

    for item in _section(lines, "Topologies", mas.get("topologies")):
        graph = _object(item)
        lines.append(
            f"    source={_text(graph.get('source'))} "
            f"completeness={_text(graph.get('completeness'))}"
        )
        for item in _section(lines, "Nodes", graph.get("nodes"), indent="      "):
            node = _object(item)
            node_type = node.get("type") or "agent"
            assignment = ""
            if node_type == "agent":
                tool_ids = node.get("tool_ids")
                tools = (
                    (", ".join(_text(tool_id) for tool_id in tool_ids) or "none")
                    if isinstance(tool_ids, list)
                    else "not supplied"
                )
                assignment = f" | tools={tools}"
            lines.append(f"        {_text(node.get('id'))} ({_text(node_type)}){assignment}")
        for item in _section(lines, "Edges", graph.get("edges"), indent="      "):
            edge = _object(item)
            annotations = []
            if edge.get("interaction_type"):
                annotations.append(_text(edge["interaction_type"]))
            if edge.get("conditional") is True:
                annotations.append("conditional")
            suffix = f" ({', '.join(annotations)})" if annotations else ""
            lines.append(
                f"        {_text(edge.get('source'))} -> {_text(edge.get('target'))}{suffix}"
            )

    for item in _section(lines, "Tools", mas.get("tools")):
        tool = _object(item)
        definition = _object(tool.get("definition"))
        lines.append(
            f"    id={_text(tool.get('tool_id'))} | name={_text(definition.get('name'))} "
            f"| description={_text(definition.get('description'), first_line=True)}"
        )
        provider = _object(tool.get("provider"))
        if provider:
            lines.append(
                f"      MCP binding: server={_text(provider.get('mcp_server_name'))} "
                f"tool={_text(provider.get('native_tool_name'))}"
            )
    return "\n".join(lines)


async def fetch_mas_details(mas_id: str):
    """Fetch MAS details from CFN (ping + pull pattern)."""
    cfn_url = os.getenv("CFN_URL", "").rstrip("/")
    if not cfn_url:
        return

    try:
        endpoint = f"{cfn_url}/api/multi-agentic-systems/{mas_id}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(endpoint, params={"metadata": "true"})
            if response.status_code == 200:
                logger.info("%s", format_mas_summary(response.json()))
            else:
                logger.warning(f"[Notification] Failed to fetch MAS: {response.status_code}")
    except Exception as e:
        logger.warning(f"[Notification] Error fetching MAS: {e}")


async def handle_notification(request: web.Request) -> web.Response:
    """Handle POST /notification - MAS lifecycle notification endpoint."""
    try:
        payload = await request.json()
        event_type = payload.get("event_type")
        mas_id = payload.get("mas_id")
        timestamp = payload.get("timestamp")

        logger.info(
            f"[Notification] event_type={event_type} mas_id={mas_id} "
            f"timestamp={timestamp} received_at={datetime.utcnow().isoformat()}Z"
        )

        # Ping + pull: fetch full MAS details from CFN
        await fetch_mas_details(mas_id)

        return web.json_response({"status": "received"}, status=200)

    except Exception as e:
        logger.error(f"[Notification] Error: {e}", exc_info=True)
        return web.json_response({"error": "Failed to process notification"}, status=500)


async def start_notification_server(port: int = NOTIFICATION_PORT) -> web.AppRunner:
    """Start HTTP server for receiving notifications."""
    app = web.Application()
    app.router.add_post(NOTIFICATION_PATH, handle_notification)
    app.router.add_get("/health", lambda r: web.json_response({"status": "healthy"}))

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()

    logger.info(f"Notification server started on port {port} at {NOTIFICATION_PATH}")
    return runner


async def shutdown_notification_server(runner: web.AppRunner):
    """Shutdown notification server."""
    if runner:
        await runner.cleanup()
