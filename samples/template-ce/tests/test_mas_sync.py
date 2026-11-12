"""Initial MAS discovery, GET-by-id retries, and notification apply."""
import asyncio
import logging
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import mas_sync
from notification_server import handle_notification


def _transport(handler):
    real = httpx.AsyncClient
    return lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs)


@pytest.fixture(autouse=True)
def reset_mas_state(monkeypatch):
    mas_sync._mas.clear()

    async def immediate(_delay):
        return

    monkeypatch.setattr(mas_sync.asyncio, "sleep", immediate)
    yield
    mas_sync._mas.clear()


@pytest.mark.asyncio
async def test_discovery_retries_404_then_returns_ids(monkeypatch):
    attempts = {"n": 0}

    urls = []

    def respond(request):
        attempts["n"] += 1
        urls.append(str(request.url))
        if attempts["n"] == 1:
            return httpx.Response(404, json={"error": "CE not yet in CFN config"})
        return httpx.Response(200, json={"mas_ids": ["mas-b", "mas-a"]})

    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", _transport(respond))
    ids = await mas_sync.list_associated_mas_ids("ce-1", cfn_url="http://cfn.local:9002")
    assert ids == ["mas-b", "mas-a"]
    assert attempts["n"] == 2
    assert urls[0].endswith("/api/cognition-engine/ce-1/multi-agentic-systems")


@pytest.mark.asyncio
async def test_discovery_empty_list_is_terminal(monkeypatch):
    def respond(request):
        return httpx.Response(200, json={"mas_ids": []})

    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", _transport(respond))
    ids = await mas_sync.list_associated_mas_ids("ce-1", cfn_url="http://cfn.local")
    assert ids == []


@pytest.mark.asyncio
async def test_fetch_404_drops_without_retry(monkeypatch):
    await mas_sync.upsert_mas("mas-one", {"id": "mas-one"})
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(404, json={"error": "MAS not found"})

    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", _transport(respond))
    result = await mas_sync.fetch_mas_details("mas-one", cfn_url="http://cfn.local")
    assert result is None
    assert len(requests) == 1
    assert mas_sync.known_mas_ids() == []


@pytest.mark.asyncio
async def test_fetch_retries_503_then_upserts(monkeypatch, caplog):
    attempts = {"n": 0}

    def respond(request):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(503, text="unavailable")
        return httpx.Response(200, json={"id": "mas-one", "name": "Trip planner"})

    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", _transport(respond))
    with caplog.at_level(logging.INFO):
        result = await mas_sync.fetch_mas_details("mas-one", cfn_url="http://cfn.local")
    assert attempts["n"] == 2
    assert result["name"] == "Trip planner"
    assert mas_sync.known_mas_ids() == ["mas-one"]
    assert "Trip planner" in caplog.text


@pytest.mark.asyncio
async def test_deleted_notification_does_not_get(monkeypatch):
    await mas_sync.upsert_mas("mas-one", {"id": "mas-one"})
    client = httpx.AsyncClient
    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", client)
    called = {"n": 0}

    def boom(**kwargs):
        called["n"] += 1
        raise AssertionError("GET must not run on mas.deleted")

    monkeypatch.setattr(mas_sync.httpx, "AsyncClient", boom)
    await mas_sync.apply_notification("mas.deleted", "mas-one")
    assert called["n"] == 0
    assert mas_sync.known_mas_ids() == []


@pytest.mark.asyncio
async def test_handle_notification_returns_before_apply(monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow(event_type, mas_id):
        started.set()
        await release.wait()

    monkeypatch.setattr("mas_sync.apply_notification", slow)
    monkeypatch.setattr("notification_server.apply_notification", slow)

    class Req:
        async def json(self):
            return {"event_type": "mas.created", "mas_id": "mas-one", "timestamp": "t"}

    resp = await handle_notification(Req())
    assert resp.status == 200
    await asyncio.wait_for(started.wait(), timeout=1)
    assert not release.is_set()
    release.set()
    await asyncio.sleep(0)
