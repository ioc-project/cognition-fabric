"""Functional workflow: real Template CE listeners + registration + MAS sync against a mock CFN."""
from __future__ import annotations

import asyncio
import json
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import mas_sync
import service

CE_ID = "550e8400-e29b-41d4-a716-446655440000"
MAS_ONE = "660e8400-e29b-41d4-a716-446655440001"
MAS_TWO = "660e8400-e29b-41d4-a716-446655440002"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class MockCFN(ThreadingHTTPServer):
    def __init__(self, host_port):
        super().__init__(host_port, _MockCFNHandler)
        self.lock = threading.Lock()
        self.calls: list[str] = []
        self.discovery_attempts = 0
        self.gone: set[str] = set()

    def record(self, entry: str) -> None:
        with self.lock:
            self.calls.append(entry)

    def snapshot(self) -> list[str]:
        with self.lock:
            return list(self.calls)


class _MockCFNHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _write(self, code: int, payload: dict | None = None) -> None:
        raw = b"" if payload is None else json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if raw:
            self.wfile.write(raw)

    def do_POST(self):
        self.server.record(f"POST {self.path}")
        self._read_json()
        if self.path == "/api/cognition-engine":
            self._write(
                201,
                {
                    "ce_id": CE_ID,
                    "cfn_id": "cfn-1",
                    "name": "template-ce",
                    "version": "1.0.0",
                    "ce_type": "CASA",
                    "enforcing_url": "127.0.0.1:50051",
                    "enforcing_endpoint": "ioc.ce.v1.CognitionEngine",
                    "enabled": True,
                    "status": "online",
                },
            )
            return
        self._write(404, {"error": "not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parsed.query
        path = parsed.path
        label = f"GET {path}"
        if query:
            label += f"?{query}"
        self.server.record(label)
        if path == f"/api/cognition-engine/{CE_ID}/multi-agentic-systems":
            with self.server.lock:
                self.server.discovery_attempts += 1
                attempt = self.server.discovery_attempts
            if attempt < 2:
                self._write(404, {"error": "CE not yet in CFN config"})
                return
            self._write(200, {"mas_ids": [MAS_ONE]})
            return
        prefix = "/api/multi-agentic-systems/"
        if path.startswith(prefix):
            mas_id = path[len(prefix) :]
            if mas_id in self.server.gone:
                self._write(404, {"error": f"MAS not found: {mas_id}"})
                return
            self._write(
                200,
                {
                    "id": mas_id,
                    "name": f"MAS {mas_id[-4:]}",
                    "workspace_id": "workspace-one",
                    "description": "Functional workflow MAS",
                    "agents": [],
                    "tools": [],
                    "topologies": [],
                },
            )
            return
        self._write(404, {"error": "not found"})


async def _wait_until(predicate, timeout=8.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition not met before timeout")


@pytest.mark.asyncio
async def test_register_discovery_get_and_notifications(monkeypatch):
    mas_sync._mas.clear()
    mas_sync._gen.clear()
    cfn = MockCFN(("127.0.0.1", 0))
    thread = threading.Thread(target=cfn.serve_forever, daemon=True)
    thread.start()
    health_port = _free_port()
    http_port = _free_port()
    grpc_port = _free_port()
    monkeypatch.setenv("CFN_URL", f"http://127.0.0.1:{cfn.server_address[1]}")
    monkeypatch.setenv("COGNITION_ENGINE_HOST", "127.0.0.1")
    monkeypatch.setenv("HEALTH_PORT", str(health_port))
    monkeypatch.setenv("HTTP_PORT", str(http_port))
    monkeypatch.setenv("GRPC_PORT", str(grpc_port))
    monkeypatch.setenv("ENABLE_NOTIFICATIONS", "true")
    monkeypatch.delenv("COGNITION_STORE_URL", raising=False)

    task = asyncio.create_task(service.serve_async(grpc_port))
    try:
        await _wait_until(lambda: MAS_ONE in mas_sync.known_mas_ids())
        calls = cfn.snapshot()
        assert "POST /api/cognition-engine" in calls
        assert f"GET /api/cognition-engine/{CE_ID}/multi-agentic-systems" in calls
        assert f"GET /api/multi-agentic-systems/{MAS_ONE}?metadata=true" in calls
        assert cfn.discovery_attempts >= 2

        async with httpx.AsyncClient() as client:
            gets_before_update = sum(
                1 for call in cfn.snapshot() if call.startswith(f"GET /api/multi-agentic-systems/{MAS_ONE}")
            )
            updated = await client.post(
                f"http://127.0.0.1:{http_port}/notification",
                json={"event_type": "mas.updated", "mas_id": MAS_ONE, "timestamp": "2026-11-12T00:00:00Z"},
            )
            assert updated.status_code == 200
            await _wait_until(
                lambda: sum(
                    1 for call in cfn.snapshot() if call.startswith(f"GET /api/multi-agentic-systems/{MAS_ONE}")
                )
                > gets_before_update
            )

            mas_one_gets_before_delete = [
                call for call in cfn.snapshot() if call.startswith(f"GET /api/multi-agentic-systems/{MAS_ONE}")
            ]
            created = await client.post(
                f"http://127.0.0.1:{http_port}/notification",
                json={"event_type": "mas.created", "mas_id": MAS_TWO, "timestamp": "2026-11-12T00:00:01Z"},
            )
            assert created.status_code == 200
            await _wait_until(lambda: MAS_TWO in mas_sync.known_mas_ids())

            deleted = await client.post(
                f"http://127.0.0.1:{http_port}/notification",
                json={"event_type": "mas.deleted", "mas_id": MAS_ONE, "timestamp": "2026-11-12T00:00:02Z"},
            )
            assert deleted.status_code == 200
            await _wait_until(lambda: MAS_ONE not in mas_sync.known_mas_ids())
            gets_after_delete = [
                call for call in cfn.snapshot() if call.startswith(f"GET /api/multi-agentic-systems/{MAS_ONE}")
            ]
            assert gets_after_delete == mas_one_gets_before_delete

            cfn.gone.add(MAS_TWO)
            gone = await client.post(
                f"http://127.0.0.1:{http_port}/notification",
                json={"event_type": "mas.updated", "mas_id": MAS_TWO, "timestamp": "2026-11-12T00:00:03Z"},
            )
            assert gone.status_code == 200
            await _wait_until(lambda: MAS_TWO not in mas_sync.known_mas_ids())

        calls = cfn.snapshot()
        mas_one_gets = [call for call in calls if call.startswith(f"GET /api/multi-agentic-systems/{MAS_ONE}")]
        mas_two_gets = [call for call in calls if call.startswith(f"GET /api/multi-agentic-systems/{MAS_TWO}")]
        assert mas_one_gets
        assert mas_two_gets
        # delete must not issue another GET for mas-one after the drop
        assert calls[-1] != f"GET /api/multi-agentic-systems/{MAS_ONE}?metadata=true"
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        cfn.shutdown()
        mas_sync._mas.clear()
        mas_sync._gen.clear()
