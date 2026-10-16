"""HTTP server for MAS lifecycle notifications."""
import logging
import os
from datetime import datetime

from aiohttp import web
import httpx

logger = logging.getLogger(__name__)

NOTIFICATION_PORT = 8080
NOTIFICATION_PATH = "/notification"


async def fetch_mas_details(mas_id: str):
    """Fetch MAS details from CFN (ping + pull pattern)."""
    cfn_url = os.getenv("CFN_URL", "").rstrip("/")
    if not cfn_url:
        return

    try:
        endpoint = f"{cfn_url}/api/multi-agentic-systems/{mas_id}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(endpoint)
            if response.status_code == 200:
                mas = response.json()
                logger.info(
                    f"[Notification] MAS details: name={mas.get('name')} "
                    f"workspace_id={mas.get('workspace_id')} "
                    f"agent_count={len(mas.get('agents', []))}"
                )
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
