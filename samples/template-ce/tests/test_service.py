"""Tests for Template CE gRPC service."""
import logging
import pytest
from uuid import uuid4
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

import grpc
from concurrent import futures

from generated import ce_pb2, ce_pb2_grpc
from service import CognitionEngineServicer


@pytest.fixture
def grpc_server():
    """Create a test gRPC server."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    ce_pb2_grpc.add_CognitionEngineServicer_to_server(
        CognitionEngineServicer(), server
    )
    port = server.add_insecure_port('[::]:0')
    server.start()
    yield f'localhost:{port}'
    server.stop(grace=0)


@pytest.fixture
def stub(grpc_server):
    """Create a CognitionEngine stub."""
    channel = grpc.insecure_channel(grpc_server)
    yield ce_pb2_grpc.CognitionEngineStub(channel)
    channel.close()


def make_request(**kwargs) -> ce_pb2.EvaluateRequest:
    """Helper to create EvaluateRequest."""
    defaults = {
        "mas_id": str(uuid4()),
        "source_agent_id": "agent-1",
        "destination_agent_id": "agent-2",
        "trace_id": f"trace-{uuid4().hex[:8]}",
        "action_class": ce_pb2.ACTION_CLASS_A2A_DELEGATION,
        "direction": ce_pb2.DIRECTION_REQUEST,
    }
    defaults.update(kwargs)
    return ce_pb2.EvaluateRequest(**defaults)


class TestEvaluateRPC:
    """Test Evaluate RPC."""

    def test_returns_allow(self, stub):
        """Test Evaluate returns ALLOW."""
        response = stub.Evaluate(make_request())
        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_echoes_trace_id(self, stub):
        """Test Evaluate echoes trace_id."""
        response = stub.Evaluate(make_request(trace_id="test-trace-123"))
        assert response.trace_id == "test-trace-123"

    @pytest.mark.parametrize("span_id", ["160e9f7d67d9173e", ""])
    def test_logs_span_id(self, stub, caplog, span_id):
        """Preserve CFN's field 18 over gRPC, including older clients that omit it."""
        assert ce_pb2.EvaluateRequest.DESCRIPTOR.fields_by_name["span_id"].number == 18
        request = make_request(span_id=span_id)
        with caplog.at_level(logging.INFO, logger="service"):
            response = stub.Evaluate(request, timeout=5)

        assert response.outcome == ce_pb2.DECISION_ALLOW
        assert response.trace_id == request.trace_id
        assert f"trace_id={request.trace_id} span_id={span_id} session_id=" in caplog.text

    def test_includes_timestamp(self, stub):
        """Test Evaluate includes timestamp."""
        response = stub.Evaluate(make_request())
        assert response.timestamp != ""

    def test_mcp_tool_call(self, stub):
        """Test Evaluate with MCP_TOOL_CALL."""
        response = stub.Evaluate(make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST,
        ))
        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_agent_response(self, stub):
        """Test Evaluate with AGENT_RESPONSE."""
        response = stub.Evaluate(make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE,
        ))
        assert response.outcome == ce_pb2.DECISION_ALLOW


class TestGetInfoRPC:
    """Test GetInfo RPC."""

    def test_returns_metadata(self, stub):
        """Test GetInfo returns CE metadata."""
        response = stub.GetInfo(ce_pb2.GetInfoRequest())

        assert response.ce_type == "CASA"
        assert response.version == "1.0.0"
        assert response.matcher_strategy == "hybrid"
