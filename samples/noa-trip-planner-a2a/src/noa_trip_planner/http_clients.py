# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Optional HTTP client identity and trace propagation for configured transports."""
import json
import ssl

import httpx
import httpx2
from opentelemetry.propagate import inject

from noa_trip_planner.settings import Settings

_model_client: httpx.AsyncClient | None = None


def tls_context(settings: Settings) -> ssl.SSLContext:
    if bool(settings.http_cert_file) != bool(settings.http_key_file):
        raise ValueError("HTTP_CERT_FILE and HTTP_KEY_FILE must be configured together")
    context = ssl.create_default_context(cafile=settings.http_ca_file)
    if settings.http_cert_file:
        context.load_cert_chain(settings.http_cert_file, settings.http_key_file)
    return context


async def propagate_trace(request):
    if "traceparent" not in request.headers:
        carrier = {}
        inject(carrier)
        request.headers.update(carrier)


def http_client(settings: Settings) -> httpx.AsyncClient:
    return httpx.AsyncClient(verify=tls_context(settings), trust_env=False,
        follow_redirects=False, timeout=settings.agent_request_timeout_seconds,
        event_hooks={"request": [propagate_trace]})


def mcp_client_factory(settings: Settings):
    async def prepare(request):
        body = await request.aread()
        payload = json.loads(body) if body else {}
        if not isinstance(payload, dict):
            raise ValueError("MCP batch requests are not supported")
        if settings.mcp_control_url and payload.get("method") != "tools/call":
            request.url = httpx2.URL(settings.mcp_control_url)
        await propagate_trace(request)

    def factory(**kwargs):
        hooks = kwargs.pop("event_hooks", {})
        hooks["request"] = [*hooks.get("request", []), prepare]
        kwargs.pop("follow_redirects", None)
        kwargs.pop("timeout", None)
        return httpx2.AsyncClient(verify=tls_context(settings), trust_env=False,
            follow_redirects=False, timeout=settings.agent_request_timeout_seconds,
            event_hooks=hooks, **kwargs)
    return factory


def model_client_options(settings: Settings | None = None) -> dict:
    global _model_client
    settings = settings or Settings()
    if not settings.http_ca_file and not settings.http_cert_file:
        return {}
    if _model_client is None:
        _model_client = http_client(settings)
    return {"http_async_client": _model_client, "max_retries": 0}


async def close_model_client() -> None:
    global _model_client
    if _model_client is not None:
        await _model_client.aclose()
        _model_client = None
