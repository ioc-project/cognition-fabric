# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import httpx2
import pytest

from noa_trip_planner import http_clients
from noa_trip_planner.settings import Settings


@pytest.mark.asyncio
async def test_mcp_control_and_calls_preserve_body_and_session():
    settings = Settings(_env_file=None, mcp_control_url="https://configured.test/control")
    seen = []
    async def destination(request):
        seen.append((request.url.path, request.content, request.headers["mcp-session-id"]))
        return httpx2.Response(403)
    async with http_clients.mcp_client_factory(settings)(transport=httpx2.MockTransport(destination)) as client:
        for body in (b'{"method":"initialize"}', b'{"method":"tools/call","params":{"name":"calculate"}}'):
            response = await client.post("https://configured.test/call", content=body,
                headers={"mcp-session-id": "session"})
            assert response.status_code == 403
    assert seen == [("/control", b'{"method":"initialize"}', "session"),
                    ("/call", b'{"method":"tools/call","params":{"name":"calculate"}}', "session")]


def test_partial_client_identity_is_rejected():
    with pytest.raises(ValueError, match="together"):
        http_clients.tls_context(Settings(_env_file=None, http_cert_file="client.crt"))


def test_default_model_client_stays_native():
    assert http_clients.model_client_options(Settings(_env_file=None)) == {}


def test_model_client_requires_explicit_model(monkeypatch):
    monkeypatch.delenv("NOA_LLM_MODEL", raising=False)
    with pytest.raises(ValueError, match="Set NOA_LLM_MODEL"):
        http_clients.create_model_client()


def test_model_client_uses_provider_configuration(monkeypatch):
    monkeypatch.setenv("NOA_LLM_MODEL", "provider/model")
    monkeypatch.setenv("AI_GATEWAY_BASE_URL", "https://model.example.test/v1")
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "fixture-key")
    monkeypatch.setattr(http_clients, "ChatOpenAI", lambda **options: options)
    monkeypatch.setattr(http_clients, "model_client_options", lambda: {})

    assert http_clients.create_model_client() == {
        "temperature": 0,
        "model": "provider/model",
        "base_url": "https://model.example.test/v1",
        "api_key": "fixture-key",
    }
