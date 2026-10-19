"""Tests for the HTTP health endpoint."""
import socket
import sys
from http.client import HTTPConnection
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from health import get_health_port, start_health_server


@pytest.fixture
def health():
    server = start_health_server(0)  # ephemeral port
    yield server
    server.close()


def _request(port: int, method: str, path: str) -> int:
    conn = HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        conn.request(method, path)
        return conn.getresponse().status
    finally:
        conn.close()


def test_get_healthz_returns_200(health):
    assert _request(health.port, "GET", "/healthz") == 200


def test_head_healthz_returns_200(health):
    assert _request(health.port, "HEAD", "/healthz") == 200


def test_other_path_returns_404(health):
    assert _request(health.port, "GET", "/other") == 404


def test_idle_connection_does_not_block_other_probes(health):
    # Connect and send nothing: a probe on another connection must still be answered
    with socket.create_connection(("127.0.0.1", health.port)):
        assert _request(health.port, "GET", "/healthz") == 200


def test_close_stops_the_server():
    server = start_health_server(0)
    port = server.port
    assert _request(port, "GET", "/healthz") == 200

    server.close()

    with pytest.raises(OSError):
        _request(port, "GET", "/healthz")


def test_bind_failure_raises_oserror():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as blocker:
        blocker.bind(("0.0.0.0", 0))
        blocker.listen()
        with pytest.raises(OSError):
            start_health_server(blocker.getsockname()[1])


class TestGetHealthPort:
    def test_default(self, monkeypatch):
        monkeypatch.delenv("HEALTH_PORT", raising=False)
        assert get_health_port() == 8080

    def test_empty_uses_default(self, monkeypatch):
        monkeypatch.setenv("HEALTH_PORT", "")
        assert get_health_port() == 8080

    def test_valid_value(self, monkeypatch):
        monkeypatch.setenv("HEALTH_PORT", "8081")
        assert get_health_port() == 8081

    @pytest.mark.parametrize("raw", ["abc", "0", "-1", "65536", "80.5"])
    def test_invalid_value_raises(self, monkeypatch, raw):
        monkeypatch.setenv("HEALTH_PORT", raw)
        with pytest.raises(ValueError, match="HEALTH_PORT"):
            get_health_port()
