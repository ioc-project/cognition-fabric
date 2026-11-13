# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Tests for serve_async startup ordering and cleanup."""
import asyncio
import socket
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

import health
import notification_server
import registration
import service


class _Recorder:
    """Patches the startup collaborators of serve_async and records the order of calls."""

    def __init__(self, monkeypatch, real_health=False):
        self.events = []
        self.registered = asyncio.Event()
        self.fail_grpc = False

        outer = self

        class FakeHealth:
            def close(self):
                outer.events.append("health.close")

        class FakeGrpc:
            def stop(self, grace=None):
                outer.events.append("grpc.stop")

        def fake_start_health(port, *args, **kwargs):
            outer.events.append(f"health.start:{port}")
            return FakeHealth()

        def fake_serve(port):
            outer.events.append(f"grpc.start:{port}")
            if outer.fail_grpc:
                raise RuntimeError("grpc bind failed")
            return FakeGrpc()

        async def fake_register():
            outer.events.append("register")
            outer.registered.set()

        async def fake_shutdown_lifecycle():
            outer.events.append("lifecycle.shutdown")

        async def fake_shutdown_store():
            outer.events.append("store.shutdown")

        if not real_health:
            monkeypatch.setattr(health, "start_health_server", fake_start_health)
        monkeypatch.setattr(service, "serve", fake_serve)
        monkeypatch.setattr(registration, "register_template_ce", fake_register)
        monkeypatch.setattr(registration, "shutdown_lifecycle_client", fake_shutdown_lifecycle)
        monkeypatch.setattr(service, "shutdown_cognition_store_client", fake_shutdown_store)
        # Startup-order tests must not compete with a running CE for port 8080.
        monkeypatch.setattr(
            notification_server, "start_notification_server", AsyncMock(return_value=None)
        )


@pytest.mark.asyncio
async def test_health_endpoint_starts_before_grpc_and_registration(monkeypatch):
    monkeypatch.setenv("HEALTH_PORT", "8081")
    rec = _Recorder(monkeypatch)

    task = asyncio.create_task(service.serve_async(50052))
    await asyncio.wait_for(rec.registered.wait(), timeout=2)
    task.cancel()
    await asyncio.wait_for(task, timeout=2)

    # The health endpoint must answer before registration so the first CFN probe succeeds
    assert rec.events[:3] == ["health.start:8081", "grpc.start:50052", "register"]
    assert set(rec.events[3:]) == {"health.close", "lifecycle.shutdown", "store.shutdown", "grpc.stop"}


@pytest.mark.asyncio
async def test_health_bind_failure_stops_startup_before_grpc_and_registration(monkeypatch):
    rec = _Recorder(monkeypatch, real_health=True)  # real health server so the bind really fails

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as blocker:
        blocker.bind(("0.0.0.0", 0))
        blocker.listen()
        monkeypatch.setenv("HEALTH_PORT", str(blocker.getsockname()[1]))

        with pytest.raises(OSError):
            await asyncio.wait_for(service.serve_async(50052), timeout=2)

    assert rec.events == []


@pytest.mark.asyncio
async def test_grpc_start_failure_closes_health_server(monkeypatch):
    monkeypatch.setenv("HEALTH_PORT", "8081")
    rec = _Recorder(monkeypatch)
    rec.fail_grpc = True

    with pytest.raises(RuntimeError, match="grpc bind failed"):
        await asyncio.wait_for(service.serve_async(50052), timeout=2)

    assert "register" not in rec.events
    assert "health.close" in rec.events
    assert "lifecycle.shutdown" in rec.events


@pytest.mark.asyncio
async def test_invalid_health_port_fails_before_starting_anything(monkeypatch):
    monkeypatch.setenv("HEALTH_PORT", "not-a-port")
    rec = _Recorder(monkeypatch)

    with pytest.raises(ValueError, match="HEALTH_PORT"):
        await service.serve_async(50052)

    assert rec.events == []


@pytest.mark.asyncio
async def test_invalid_http_port_fails_before_starting_anything(monkeypatch):
    monkeypatch.setenv("HEALTH_PORT", "8081")
    monkeypatch.setenv("HTTP_PORT", "not-a-port")
    rec = _Recorder(monkeypatch)

    with pytest.raises(ValueError, match="HTTP_PORT"):
        await service.serve_async(50052)

    assert rec.events == []
