# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Coordinator messaging adapters for delegated A2A requests."""

from collections.abc import Awaitable, Callable, Mapping
from typing import Protocol

import httpx
import slim_bindings
from a2a.helpers import get_stream_response_text, new_text_message
from a2a.client import ClientConfig as HttpClientConfig, ClientFactory
from a2a.utils.constants import TransportProtocol
from a2a.types.a2a_pb2 import AgentCard, Role, SendMessageRequest
from ioa_observe.sdk.decorators import task as ioa_observe_task
from opentelemetry.propagate import inject
from slima2a.client_transport import (
    ClientConfig,
    MultiAgentClientFactory,
    slimrpc_channel_factory,
)

from noa_trip_planner.observability import COORDINATOR_APPLICATION_ID


class AgentMessenger(Protocol):
    """Delegate one textual task to a named agent."""

    async def send(self, agent_name: str, task: str) -> str: ...


class SlimA2AMessenger:
    """Send formal A2A messages over a shared SLIM runtime connection."""

    def __init__(
        self,
        cards: Mapping[str, AgentCard],
        local_app: slim_bindings.App,
        connection_id: int,
        timeout_seconds: float = 120,
    ):
        self._cards = cards
        self._httpx_client = httpx.AsyncClient(timeout=timeout_seconds)
        config = ClientConfig(
            supported_protocol_bindings=["slimrpc"],
            streaming=True,
            httpx_client=self._httpx_client,
            slimrpc_channel_factory=slimrpc_channel_factory(local_app, connection_id),
        )
        self._factory = MultiAgentClientFactory(config)

    @ioa_observe_task(
        name="a2a_slimrpc_send",
        description="Send an A2A request over SLIMRPC",
        protocol="A2A",
        application_id=COORDINATOR_APPLICATION_ID,
    )
    async def send(self, agent_name: str, task: str) -> str:
        card = self._cards.get(agent_name)
        if card is None:
            raise ValueError(f"Unknown A2A agent: {agent_name}")

        client = self._factory.create(card=card)
        message = new_text_message(task, role=Role.ROLE_USER)
        trace_context: dict[str, str] = {}
        inject(trace_context)
        message.metadata.update(trace_context)
        request = SendMessageRequest(message=message)
        latest_text = ""
        async for response in client.send_message(request=request):
            response_text = get_stream_response_text(response).strip()
            if response_text:
                latest_text = response_text
        if not latest_text:
            raise RuntimeError(f"A2A agent returned no text: {agent_name}")
        return latest_text

    async def close(self) -> None:
        await self._httpx_client.aclose()


class HttpA2AMessenger:
    """Use the standard A2A HTTP binding with explicitly configured endpoints."""

    def __init__(self, cards: Mapping[str, AgentCard], client: httpx.AsyncClient):
        self._cards = cards
        self._client = client
        self._factory = ClientFactory(HttpClientConfig(
            streaming=False, httpx_client=client,
            supported_protocol_bindings=[TransportProtocol.HTTP_JSON],
        ))

    @ioa_observe_task(name="a2a_http_send", protocol="A2A", application_id=COORDINATOR_APPLICATION_ID)
    async def send(self, agent_name: str, task: str) -> str:
        if agent_name not in self._cards:
            raise ValueError(f"Unknown A2A agent: {agent_name}")
        message = new_text_message(task, role=Role.ROLE_USER)
        carrier: dict[str, str] = {}
        inject(carrier)
        message.metadata.update(carrier)
        latest = ""
        client = self._factory.create(self._cards[agent_name])
        async for response in client.send_message(SendMessageRequest(message=message)):
            latest = get_stream_response_text(response).strip() or latest
        if not latest:
            raise RuntimeError(f"A2A agent returned no text: {agent_name}")
        return latest

    async def close(self) -> None:
        await self._client.aclose()


class InMemoryAgentMessenger:
    """Explicit development adapter that dispatches without a transport."""

    def __init__(self, handlers: Mapping[str, Callable[[str], Awaitable[str]]]):
        self._handlers = handlers

    async def send(self, agent_name: str, task: str) -> str:
        handler = self._handlers.get(agent_name)
        if handler is None:
            raise ValueError(f"Unknown in-memory agent: {agent_name}")
        return await handler(task)
