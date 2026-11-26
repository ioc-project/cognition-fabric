# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Single-process A2A server runtime over one shared SLIM connection."""

import asyncio
from collections.abc import Iterable, Mapping

import slim_bindings
from slima2a import initialize_slim_service
from slima2a.handler import SRPCHandler
from slima2a.types.v1.a2a_pb2_slimrpc import add_A2AServiceServicer_to_server

from noa_trip_planner.settings import Settings


class A2ARuntime:
    """Own one SLIM connection and multiple named A2A server applications."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._service: slim_bindings.Service | None = None
        self._connection_id: int | None = None
        self._server_tasks: list[asyncio.Task[None]] = []
        self._apps: dict[str, slim_bindings.App] = {}

    @property
    def ready(self) -> bool:
        return self._connection_id is not None and bool(self._server_tasks)

    @property
    def apps(self) -> Mapping[str, slim_bindings.App]:
        return self._apps

    @property
    def connection_id(self) -> int:
        if self._connection_id is None:
            raise RuntimeError("A2A runtime has not been started")
        return self._connection_id

    async def start(
        self,
        handlers: Mapping[str, SRPCHandler],
        client_names: Iterable[str] = (),
    ) -> None:
        if self._service is not None:
            raise RuntimeError("A2A runtime is already started")

        service = await initialize_slim_service(log_level="info")
        connection_id = await service.connect_async(
            slim_bindings.new_insecure_client_config(self._settings.slim_endpoint)
        )
        apps: dict[str, slim_bindings.App] = {}
        server_tasks: list[asyncio.Task[None]] = []
        try:
            identities = tuple(dict.fromkeys((*client_names, *handlers)))
            for agent_name in identities:
                local_name = slim_bindings.Name(
                    self._settings.slim_namespace,
                    self._settings.slim_group,
                    agent_name,
                )
                app = service.create_app_with_secret(
                    local_name, self._settings.slim_shared_secret
                )
                await app.subscribe_async(local_name, connection_id)
                apps[agent_name] = app
                handler = handlers.get(agent_name)
                if handler is not None:
                    server = slim_bindings.Server.new_with_connection(
                        app, local_name, connection_id
                    )
                    add_A2AServiceServicer_to_server(handler, server)
                    server_tasks.append(asyncio.create_task(server.serve_async()))
        except BaseException:
            for task in server_tasks:
                task.cancel()
            await asyncio.gather(*server_tasks, return_exceptions=True)
            service.disconnect(connection_id)
            raise

        self._service = service
        self._connection_id = connection_id
        self._apps = apps
        self._server_tasks = server_tasks

    async def stop(self) -> None:
        for task in self._server_tasks:
            task.cancel()
        await asyncio.gather(*self._server_tasks, return_exceptions=True)
        if self._service is not None and self._connection_id is not None:
            self._service.disconnect(self._connection_id)
        self._server_tasks = []
        self._apps = {}
        self._connection_id = None
        self._service = None
