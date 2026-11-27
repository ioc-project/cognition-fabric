# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import httpx
import pytest
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.server.routes import create_rest_routes, add_a2a_routes_to_fastapi
from fastapi import FastAPI

from noa_trip_planner.a2a.cards import create_agent_cards
from noa_trip_planner.a2a.executor import SpecialistAgentExecutor
from noa_trip_planner.a2a import messenger as messaging
from noa_trip_planner.application_runtime import ApplicationRuntime
from noa_trip_planner.settings import Settings
from noa_trip_planner.api import create_app

URLS = {name: f"http://specialists.test/a2a/{name}" for name in
        ("schedule_agent", "itinerary_agent", "concierge_agent")}


@pytest.mark.asyncio
async def test_http_moderator_does_not_start_slim_or_local_specialists(monkeypatch):
    runtime = ApplicationRuntime(Settings(_env_file=None, a2a_transport="http", a2a_http_urls=URLS))
    monkeypatch.setattr(runtime, "_create_tool_provider", lambda: pytest.fail("Moderator must not start specialist tools"))
    try:
        await runtime.start()
        assert runtime.ready
    finally:
        await runtime.stop()
    assert not runtime.ready


@pytest.mark.asyncio
async def test_http_messenger_executes_original_specialist():
    cards = create_agent_cards("agntcy", "sample", http_urls=URLS)
    calls = []
    class Specialist:
        name = "schedule_agent"
        async def answer(self, question):
            calls.append(question)
            return "Train at 09:00"
    app = FastAPI()
    handler = DefaultRequestHandler(agent_executor=SpecialistAgentExecutor(Specialist()),
        task_store=InMemoryTaskStore(), agent_card=cards["schedule_agent"])
    add_a2a_routes_to_fastapi(app, rest_routes=create_rest_routes(handler, path_prefix="/a2a/schedule_agent"))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as client:
        messenger = messaging.HttpA2AMessenger(cards, client)
        assert await messenger.send("schedule_agent", "Morning train?") == "Train at 09:00"
        assert calls == ["Morning train?"]
        with pytest.raises(ValueError, match="Unknown"):
            await messenger.send("missing", "task")


@pytest.mark.asyncio
async def test_missing_http_destinations_fail_before_startup():
    runtime = ApplicationRuntime(Settings(_env_file=None, a2a_transport="http"))
    with pytest.raises(ValueError, match="exactly three"):
        await runtime.start()
    assert not runtime.ready


def test_http_cards_leave_default_slim_binding_unchanged():
    assert create_agent_cards("agntcy", "sample")["schedule_agent"].supported_interfaces[0].protocol_binding == "slimrpc"
    card = create_agent_cards("agntcy", "sample", http_urls=URLS)["schedule_agent"]
    assert card.supported_interfaces[0].url == "http://specialists.test/a2a/schedule_agent"
    assert card.supported_interfaces[0].protocol_binding == "HTTP+JSON"


@pytest.mark.asyncio
async def test_specialist_native_api_serves_envoy_rewritten_a2a_path(monkeypatch):
    runtime = ApplicationRuntime(Settings(_env_file=None, a2a_transport="http",
        agent_role="schedule_agent", a2a_http_urls=URLS, tool_transport="local"))
    calls = []
    class Specialist:
        name = "schedule_agent"
        async def answer(self, question):
            calls.append(question)
            return "Train at 09:00"
    monkeypatch.setattr(runtime, "_create_specialists", lambda provider, role: {role: Specialist()})
    app = create_app(runtime)
    for _ in range(2):
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as client:
                assert (await client.get("http://noa.test/ready")).status_code == 200
                # Envoy strips /a2a/schedule_agent before forwarding.
                cards = create_agent_cards("agntcy", "sample", http_urls={"schedule_agent": "http://noa.test"})
                messenger = messaging.HttpA2AMessenger(cards, client)
                assert await messenger.send("schedule_agent", "Morning train?") == "Train at 09:00"
        assert not runtime.ready
    assert calls == ["Morning train?", "Morning train?"]
