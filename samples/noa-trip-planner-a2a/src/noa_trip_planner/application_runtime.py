# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Application lifecycle for MCP-backed specialists and SLIM or HTTP A2A."""

import httpx
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from slima2a.handler import SRPCHandler

from noa_trip_planner.a2a.cards import create_agent_cards
from noa_trip_planner.a2a.executor import SpecialistAgentExecutor
from noa_trip_planner.a2a.messenger import (
    AgentMessenger,
    InMemoryAgentMessenger,
    HttpA2AMessenger,
    SlimA2AMessenger,
)
from noa_trip_planner.a2a.runtime import A2ARuntime
from noa_trip_planner.agents import ConciergeAgent, ItineraryAgent, ScheduleAgent
from noa_trip_planner.agents.base_agent import SpecializedAgent
from noa_trip_planner.agents.prompts import (
    CONCIERGE_AGENT_PROMPT,
    ITINERARY_AGENT_PROMPT,
    SCHEDULE_AGENT_PROMPT,
)
from noa_trip_planner.observability import (
    COORDINATOR_APPLICATION_ID,
    initialize_observe,
)
from noa_trip_planner.settings import Settings
from noa_trip_planner.http_clients import http_client, mcp_client_factory, close_model_client
from fastmcp.client.transports import StreamableHttpTransport
from noa_trip_planner.tooling.provider import (
    LocalToolProvider,
    McpToolProvider,
    ToolProvider,
)


class ApplicationRuntime:
    """Own transport startup and shutdown for one API process."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.messenger: AgentMessenger | None = None
        self._a2a_runtime: A2ARuntime | None = None
        self._slim_messenger: SlimA2AMessenger | None = None
        self._http_messenger: HttpA2AMessenger | None = None
        self.http_handlers: dict[str, DefaultRequestHandler] = {}

    @property
    def ready(self) -> bool:
        return self.messenger is not None or bool(self.http_handlers)

    async def start(self) -> None:
        initialize_observe(COORDINATOR_APPLICATION_ID)
        if self.settings.a2a_transport == "http":
            await self._start_http()
            return
        provider = self._create_tool_provider()
        await provider.start()
        agents = self._create_specialists(provider)

        if self.settings.a2a_transport == "in_memory":
            self.messenger = InMemoryAgentMessenger(
                {name: self._local_handler(agent) for name, agent in agents.items()}
            )
            return
        if self.settings.a2a_transport != "slimrpc":
            raise ValueError(
                f"Unsupported A2A transport: {self.settings.a2a_transport}"
            )

        cards = create_agent_cards(
            self.settings.slim_namespace, self.settings.slim_group
        )
        handlers = {
            name: SRPCHandler(
                cards[name],
                DefaultRequestHandler(
                    agent_executor=SpecialistAgentExecutor(agent),
                    task_store=InMemoryTaskStore(),
                    agent_card=cards[name],
                ),
            )
            for name, agent in agents.items()
        }
        runtime = A2ARuntime(self.settings)
        await runtime.start(handlers, client_names=("moderator",))
        messenger = SlimA2AMessenger(
            cards=cards,
            local_app=runtime.apps["moderator"],
            connection_id=runtime.connection_id,
            timeout_seconds=self.settings.agent_request_timeout_seconds,
        )
        self._a2a_runtime = runtime
        self._slim_messenger = messenger
        self.messenger = messenger

    async def stop(self) -> None:
        self.messenger = None
        self.http_handlers.clear()
        if self._http_messenger is not None:
            await self._http_messenger.close()
        self._http_messenger = None
        await close_model_client()
        if self._slim_messenger is not None:
            await self._slim_messenger.close()
        if self._a2a_runtime is not None:
            await self._a2a_runtime.stop()
        self._slim_messenger = None
        self._a2a_runtime = None

    async def _start_http(self) -> None:
        names = {"schedule_agent", "itinerary_agent", "concierge_agent"}
        if set(self.settings.a2a_http_urls) != names:
            raise ValueError("A2A HTTP requires exactly three specialist URLs")
        for url in self.settings.a2a_http_urls.values():
            parsed = httpx.URL(url)
            if parsed.scheme not in ("http", "https") or not parsed.host:
                raise ValueError("A2A HTTP requires absolute HTTP(S) URLs")
        role = self.settings.agent_role
        if role != "moderator" and role not in names:
            raise ValueError(f"Unknown HTTP agent role: {role}")
        cards = create_agent_cards(self.settings.slim_namespace, self.settings.slim_group,
                                  http_urls=self.settings.a2a_http_urls)
        if role == "moderator":
            client = http_client(self.settings)
            self._http_messenger = HttpA2AMessenger(cards, client)
            self.messenger = self._http_messenger
        else:
            provider = self._create_tool_provider()
            await provider.start()
            agent = self._create_specialists(provider, role)[role]
            self.http_handlers[role] = DefaultRequestHandler(
                agent_executor=SpecialistAgentExecutor(agent),
                task_store=InMemoryTaskStore(), agent_card=cards[role],
            )

    def require_messenger(self) -> AgentMessenger:
        if self.messenger is None:
            raise RuntimeError("Application runtime is not ready")
        return self.messenger

    def _create_tool_provider(self) -> ToolProvider:
        if self.settings.tool_transport == "mcp":
            if self.settings.http_ca_file or self.settings.http_cert_file or self.settings.mcp_control_url:
                return McpToolProvider(StreamableHttpTransport(self.settings.mcp_server_url,
                    httpx_client_factory=mcp_client_factory(self.settings)))
            return McpToolProvider(self.settings.mcp_server_url)
        if self.settings.tool_transport == "local":
            return LocalToolProvider()
        raise ValueError(f"Unsupported tool transport: {self.settings.tool_transport}")

    @staticmethod
    def _create_specialists(
        provider: ToolProvider,
        role: str | None = None,
    ) -> dict[str, SpecializedAgent]:
        definitions = {
            "schedule_agent": (ScheduleAgent, SCHEDULE_AGENT_PROMPT),
            "itinerary_agent": (ItineraryAgent, ITINERARY_AGENT_PROMPT),
            "concierge_agent": (ConciergeAgent, CONCIERGE_AGENT_PROMPT),
        }
        return {name: agent_type(prompt, provider.tools_for(name))
                for name, (agent_type, prompt) in definitions.items()
                if role is None or name == role}

    @staticmethod
    def _local_handler(agent: SpecializedAgent):
        async def handle(task: str) -> str:
            return await agent.answer(task)

        return handle
