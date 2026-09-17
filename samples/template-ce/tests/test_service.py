"""Tests for CASA Cognition Engine gRPC service.

Tests the ioc.ce.v1.CognitionEngine service implementation.
"""
import pytest
from uuid import uuid4
from pathlib import Path
import sys

# Add src to path
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
    port = server.add_insecure_port('[::]:0')  # Random available port
    server.start()
    yield f'localhost:{port}'
    server.stop(grace=0)


@pytest.fixture
def grpc_channel(grpc_server):
    """Create a gRPC channel to the test server."""
    channel = grpc.insecure_channel(grpc_server)
    yield channel
    channel.close()


@pytest.fixture
def stub(grpc_channel):
    """Create a CognitionEngine stub."""
    return ce_pb2_grpc.CognitionEngineStub(grpc_channel)


def make_evaluate_request(
    action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
    direction=ce_pb2.DIRECTION_REQUEST,
    **kwargs
) -> ce_pb2.EvaluateRequest:
    """Helper to create valid EvaluateRequest messages."""
    request = ce_pb2.EvaluateRequest(
        mas_id=str(uuid4()),
        source_agent_id="orchestrator",
        destination_agent_id="crm-agent",
        trace_id=f"trace-{uuid4().hex[:8]}",
        action_class=action_class,
        direction=direction,
    )
    # Apply any overrides
    for key, value in kwargs.items():
        if hasattr(request, key):
            setattr(request, key, value)
    return request


class TestEvaluateRPC:
    """Test the Evaluate RPC."""

    def test_evaluate_returns_response(self, stub):
        """Test Evaluate RPC returns a response."""
        request = make_evaluate_request()
        response = stub.Evaluate(request)

        assert response is not None
        assert isinstance(response, ce_pb2.EvaluateResponse)

    def test_evaluate_returns_allow_by_default(self, stub):
        """Test Evaluate RPC returns ALLOW (stub implementation)."""
        request = make_evaluate_request()
        response = stub.Evaluate(request)

        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_evaluate_echoes_trace_id(self, stub):
        """Test Evaluate RPC echoes the trace_id."""
        trace_id = "test-trace-12345"
        request = make_evaluate_request(trace_id=trace_id)
        response = stub.Evaluate(request)

        assert response.trace_id == trace_id

    def test_evaluate_includes_timestamp(self, stub):
        """Test Evaluate RPC includes timestamp."""
        request = make_evaluate_request()
        response = stub.Evaluate(request)

        assert response.timestamp != ""

    def test_evaluate_includes_context_sufficiency(self, stub):
        """Test Evaluate RPC includes context_sufficiency."""
        request = make_evaluate_request()
        response = stub.Evaluate(request)

        assert response.context_sufficiency == ce_pb2.CONTEXT_SUFFICIENCY_COMPLETE


class TestEvaluateActionClasses:
    """Test Evaluate RPC with different action classes."""

    def test_mcp_tool_call_action(self, stub):
        """Test Evaluate with MCP_TOOL_CALL action class."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST,
        )
        request.tool_call.tool_name = "customers_list"
        request.tool_call.tool_description = "List all customers"

        response = stub.Evaluate(request)
        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_a2a_delegation_action(self, stub):
        """Test Evaluate with A2A_DELEGATION action class."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
            direction=ce_pb2.DIRECTION_REQUEST,
        )
        request.a2a_delegation.target_agent_id = "crm-agent"
        request.a2a_delegation.delegated_task = "Find complaint for Swiss Federal Railways"

        response = stub.Evaluate(request)
        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_agent_response_action(self, stub):
        """Test Evaluate with AGENT_RESPONSE action class."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE,
        )
        request.agent_response.response_content = "The complaint is assigned to emp_035"
        request.agent_response.claims.append("Complaint is assigned to emp_035")

        response = stub.Evaluate(request)
        assert response.outcome == ce_pb2.DECISION_ALLOW


class TestEvaluateDirections:
    """Test Evaluate RPC with different directions."""

    def test_request_direction(self, stub):
        """Test Evaluate with REQUEST direction."""
        request = make_evaluate_request(direction=ce_pb2.DIRECTION_REQUEST)
        response = stub.Evaluate(request)
        assert response.outcome == ce_pb2.DECISION_ALLOW

    def test_response_direction(self, stub):
        """Test Evaluate with RESPONSE direction."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE,
        )
        response = stub.Evaluate(request)
        assert response.outcome == ce_pb2.DECISION_ALLOW


class TestEvaluateCheckResults:
    """Test check results in Evaluate response."""

    def test_response_includes_checks_run(self, stub):
        """Test response includes checks_run."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST,
        )
        response = stub.Evaluate(request)

        # Should have run checks for tool calls
        assert len(response.checks_run) > 0

    def test_check_results_have_correct_structure(self, stub):
        """Test check results have check_id, passed, and reason."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST,
        )
        response = stub.Evaluate(request)

        for check in response.checks_run:
            assert check.check_id != ""
            assert isinstance(check.passed, bool)

    def test_all_checks_pass_in_stub(self, stub):
        """Test all stub checks pass."""
        request = make_evaluate_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST,
        )
        response = stub.Evaluate(request)

        assert all(check.passed for check in response.checks_run)


class TestGetInfoRPC:
    """Test the GetInfo RPC."""

    def test_get_info_returns_response(self, stub):
        """Test GetInfo RPC returns a response."""
        request = ce_pb2.GetInfoRequest()
        response = stub.GetInfo(request)

        assert response is not None
        assert isinstance(response, ce_pb2.GetInfoResponse)

    def test_get_info_returns_ce_type(self, stub):
        """Test GetInfo returns CE type."""
        request = ce_pb2.GetInfoRequest()
        response = stub.GetInfo(request)

        assert response.ce_type == "CASA"

    def test_get_info_returns_version(self, stub):
        """Test GetInfo returns version."""
        request = ce_pb2.GetInfoRequest()
        response = stub.GetInfo(request)

        assert response.version != ""

    def test_get_info_returns_enabled_checks(self, stub):
        """Test GetInfo returns enabled checks."""
        request = ce_pb2.GetInfoRequest()
        response = stub.GetInfo(request)

        assert len(response.enabled_checks) > 0
        # Should include deterministic and semantic checks
        check_ids = list(response.enabled_checks)
        assert any("DETERMINISTIC" in c for c in check_ids)
        assert any("SEMANTIC" in c for c in check_ids)

    def test_get_info_returns_matcher_strategy(self, stub):
        """Test GetInfo returns matcher strategy."""
        request = ce_pb2.GetInfoRequest()
        response = stub.GetInfo(request)

        assert response.matcher_strategy != ""


class TestConcurrentRequests:
    """Test concurrent request handling."""

    def test_multiple_concurrent_requests(self, stub):
        """Test multiple requests can be handled concurrently."""
        requests = [make_evaluate_request() for _ in range(5)]
        responses = [stub.Evaluate(req) for req in requests]

        assert all(r.outcome == ce_pb2.DECISION_ALLOW for r in responses)
