# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Minimal HTTP health endpoint for Template CE.

CFN probes `GET /healthz` on the `health_url` the CE declares at registration.
A 200 means the CE is up. No auth and no body are required.

`GET` and `HEAD /healthz` return 200 and any other path returns 404. Each connection is served on
its own thread, so a client that connects and sends nothing cannot block other probes. It is
dropped after `timeout` seconds.
"""
from __future__ import annotations

import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logger = logging.getLogger(__name__)

DEFAULT_HEALTH_PORT = 8080
HEALTH_PATH = "/healthz"


def get_health_port() -> int:
    """Return the HTTP health port from HEALTH_PORT (default 8080).

    Raises ValueError for a value that is not an integer in 1..65535. Binding some other port
    would silently break the health_url this CE declares to CFN, so an invalid value fails startup.
    """
    raw = os.getenv("HEALTH_PORT")
    if raw is None or raw.strip() == "":
        return DEFAULT_HEALTH_PORT
    try:
        port = int(raw)
    except ValueError:
        port = 0
    if not 1 <= port <= 65535:
        raise ValueError(f"HEALTH_PORT must be an integer between 1 and 65535, got {raw!r}")
    return port


class _HealthHandler(BaseHTTPRequestHandler):
    timeout = 5  # drop connections that send nothing

    def do_GET(self):
        self.send_response(200 if self.path.split("?")[0] == HEALTH_PATH else 404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_HEAD = do_GET

    def log_message(self, format, *args):
        pass  # a probe every couple of seconds would flood the logs


class HealthServer:
    """The running health endpoint."""

    def __init__(self, port: int):
        # Raises OSError if the port cannot be bound
        self._httpd = ThreadingHTTPServer(("0.0.0.0", port), _HealthHandler)
        self._httpd.daemon_threads = True
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, kwargs={"poll_interval": 0.1}, name="health-server", daemon=True
        )
        self._thread.start()

    @property
    def port(self) -> int:
        return self._httpd.server_address[1]

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)


def start_health_server(port: int = DEFAULT_HEALTH_PORT) -> HealthServer:
    """Start serving /healthz in a background thread. Raises OSError if the port cannot be bound."""
    server = HealthServer(port)
    logger.info(f"Template CE health endpoint started on port {server.port} ({HEALTH_PATH})")
    return server
