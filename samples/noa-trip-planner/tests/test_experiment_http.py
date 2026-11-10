import json
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from experiments import run_experiment_http as rh


def _handler(seen):
    def handler(request: httpx.Request):
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "healthy"})
        body = json.loads(request.content)
        seen.append(body)
        return httpx.Response(
            200,
            json={
                "final_answer": "ok",
                "messages": [{}, {}],
                "session_id": "s1",
                "communication_chain": [{"from": "moderator", "to": "schedule_agent"}],
            },
        )

    return handler


def test_http_runner_writes_records(tmp_path):
    seen = []
    path = rh.run_experiment(
        output_prefix="t",
        coalition_filter="schedule",
        transport=httpx.MockTransport(_handler(seen)),
        results_dir=tmp_path,
    )
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    assert rows and all(r["status"] == "success" for r in rows)
    assert rows[0]["message_count"] == 2 and rows[0]["chain_length"] == 1
    assert all(b["available_agents"] == ["schedule_agent"] for b in seen)
    assert all(b["debugging"] is False for b in seen)


def test_http_runner_records_errors(tmp_path):
    def handler(request):
        if request.url.path == "/health":
            return httpx.Response(200, json={})
        return httpx.Response(500, text="boom")

    path = rh.run_experiment(
        output_prefix="e", coalition_filter="schedule",
        transport=httpx.MockTransport(handler), results_dir=tmp_path,
    )
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    assert rows and all(r["status"] == "error" for r in rows)


def test_unreachable_app_fails_fast():
    def handler(request):
        raise httpx.ConnectError("down")

    with pytest.raises(SystemExit):
        rh.run_experiment(transport=httpx.MockTransport(handler))


def test_api_available_agents_validation(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    from noa_trip_planner import api

    client = TestClient(api.app)
    with patch.object(api, "ask_question", return_value={"final_answer": "x"}) as m:
        assert client.post("/ask", json={"question": "q", "available_agents": []}).status_code == 200
        assert m.call_args.kwargs["available_agents"] == []
        assert client.post("/ask", json={"question": "q"}).status_code == 200
        assert m.call_args.kwargs["available_agents"] is None
        assert client.post("/ask", json={"question": "q", "available_agents": ["bogus"]}).status_code == 422
