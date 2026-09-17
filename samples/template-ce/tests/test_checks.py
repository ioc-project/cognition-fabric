"""Tests for CASA Cognition Engine check framework."""
import pytest
from pathlib import Path
import sys

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from generated import ce_pb2
from checks import (
    ALL_CHECKS,
    CheckResult,
    DeterministicToolSelectedCheck,
    DeterministicLLMSelectedToolsCheck,
    SemanticA2ATaskRelevanceCheck,
    SemanticA2AResponseRelevanceCheck,
    SemanticMCPToolRelevanceCheck,
    SemanticA2AResponseGroundingCheck,
    run_checks_grpc,
    _check_applies_to,
)


def make_request(
    action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
    direction=ce_pb2.DIRECTION_REQUEST,
    **kwargs
) -> ce_pb2.EvaluateRequest:
    """Helper to create test gRPC requests."""
    request = ce_pb2.EvaluateRequest(
        mas_id=kwargs.get("mas_id", "550e8400-e29b-41d4-a716-446655440000"),
        source_agent_id=kwargs.get("source_agent_id", "orchestrator"),
        destination_agent_id=kwargs.get("destination_agent_id", "crm-agent"),
        trace_id=kwargs.get("trace_id", "trace-123"),
        action_class=action_class,
        direction=direction,
    )
    return request


class TestCheckRegistry:
    """Test check registry configuration."""

    def test_all_checks_registered(self):
        """Test all checks are registered in ALL_CHECKS."""
        assert len(ALL_CHECKS) == 6

    def test_check_order_deterministic_first(self):
        """Test deterministic checks come before semantic checks."""
        check_ids = [c.check_id for c in ALL_CHECKS]

        # Deterministic checks should be first
        assert check_ids[0] == "DETERMINISTIC_TOOL_SELECTED"
        assert check_ids[1] == "DETERMINISTIC_LLM_SELECTED_TOOLS"

        # Semantic checks follow
        assert "SEMANTIC_" in check_ids[2]


class TestDeterministicToolSelectedCheck:
    """Test DETERMINISTIC_TOOL_SELECTED check."""

    @pytest.fixture
    def check(self):
        return DeterministicToolSelectedCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "DETERMINISTIC_TOOL_SELECTED"

    def test_applies_to_mcp_tool_call(self, check):
        """Test check applies to MCP tool calls."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is True

    def test_does_not_apply_to_a2a_delegation(self, check):
        """Test check does not apply to A2A delegations."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is False

    def test_does_not_apply_to_agent_response(self, check):
        """Test check does not apply to agent responses."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE
        )
        assert _check_applies_to(check, request) is False


class TestDeterministicLLMSelectedToolsCheck:
    """Test DETERMINISTIC_LLM_SELECTED_TOOLS check."""

    @pytest.fixture
    def check(self):
        return DeterministicLLMSelectedToolsCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "DETERMINISTIC_LLM_SELECTED_TOOLS"

    def test_applies_to_mcp_tool_call(self, check):
        """Test check applies to MCP tool calls."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is True


class TestSemanticA2ATaskRelevanceCheck:
    """Test SEMANTIC_A2A_TASK_RELEVANCE check."""

    @pytest.fixture
    def check(self):
        return SemanticA2ATaskRelevanceCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "SEMANTIC_A2A_TASK_RELEVANCE"

    def test_applies_to_a2a_delegation_request(self, check):
        """Test check applies to A2A delegation requests."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is True

    def test_does_not_apply_to_a2a_delegation_response(self, check):
        """Test check does not apply to A2A delegation responses."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
            direction=ce_pb2.DIRECTION_RESPONSE
        )
        assert _check_applies_to(check, request) is False

    def test_does_not_apply_to_mcp_tool_call(self, check):
        """Test check does not apply to MCP tool calls."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is False


class TestSemanticA2AResponseRelevanceCheck:
    """Test SEMANTIC_A2A_RESPONSE_RELEVANCE check."""

    @pytest.fixture
    def check(self):
        return SemanticA2AResponseRelevanceCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "SEMANTIC_A2A_RESPONSE_RELEVANCE"

    def test_applies_to_agent_response(self, check):
        """Test check applies to agent responses."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE
        )
        assert _check_applies_to(check, request) is True

    def test_does_not_apply_to_request_direction(self, check):
        """Test check does not apply to request direction."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is False


class TestSemanticMCPToolRelevanceCheck:
    """Test SEMANTIC_MCP_TOOL_RELEVANCE check."""

    @pytest.fixture
    def check(self):
        return SemanticMCPToolRelevanceCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "SEMANTIC_MCP_TOOL_RELEVANCE"

    def test_applies_to_mcp_tool_call_request(self, check):
        """Test check applies to MCP tool call requests."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )
        assert _check_applies_to(check, request) is True

    def test_does_not_apply_to_mcp_tool_call_response(self, check):
        """Test check does not apply to tool call responses."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_RESPONSE
        )
        assert _check_applies_to(check, request) is False


class TestSemanticA2AResponseGroundingCheck:
    """Test SEMANTIC_A2A_RESPONSE_GROUNDING check."""

    @pytest.fixture
    def check(self):
        return SemanticA2AResponseGroundingCheck()

    def test_check_id(self, check):
        """Test check has correct ID."""
        assert check.check_id == "SEMANTIC_A2A_RESPONSE_GROUNDING"

    def test_applies_to_agent_response(self, check):
        """Test check applies to agent responses."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE
        )
        assert _check_applies_to(check, request) is True


class TestRunChecksGrpc:
    """Test the run_checks_grpc orchestration function."""

    def test_run_checks_for_mcp_tool_call(self):
        """Test run_checks_grpc returns results for MCP tool call."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )

        results, first_failure = run_checks_grpc(request)

        # Should run deterministic and semantic checks for tool calls
        assert len(results) >= 1
        assert first_failure is None  # All stubs pass

    def test_run_checks_for_a2a_delegation(self):
        """Test run_checks_grpc returns results for A2A delegation."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_A2A_DELEGATION,
            direction=ce_pb2.DIRECTION_REQUEST
        )

        results, first_failure = run_checks_grpc(request)

        # Should run semantic A2A task relevance check
        assert len(results) >= 1
        check_ids = [r.check_id for r in results]
        assert "SEMANTIC_A2A_TASK_RELEVANCE" in check_ids
        assert first_failure is None

    def test_run_checks_for_agent_response(self):
        """Test run_checks_grpc returns results for agent response."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_AGENT_RESPONSE,
            direction=ce_pb2.DIRECTION_RESPONSE
        )

        results, first_failure = run_checks_grpc(request)

        # Should run response relevance and grounding checks
        assert len(results) >= 1
        check_ids = [r.check_id for r in results]
        assert "SEMANTIC_A2A_RESPONSE_RELEVANCE" in check_ids or "SEMANTIC_A2A_RESPONSE_GROUNDING" in check_ids
        assert first_failure is None

    def test_all_results_pass(self):
        """Test all stub checks pass."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )

        results, first_failure = run_checks_grpc(request)

        assert all(r.passed for r in results)
        assert first_failure is None

    def test_check_result_structure(self):
        """Test CheckResult has correct structure."""
        request = make_request(
            action_class=ce_pb2.ACTION_CLASS_MCP_TOOL_CALL,
            direction=ce_pb2.DIRECTION_REQUEST
        )

        results, _ = run_checks_grpc(request)

        assert len(results) > 0
        result = results[0]
        assert isinstance(result, CheckResult)
        assert isinstance(result.check_id, str)
        assert isinstance(result.passed, bool)
        assert result.reason is None or isinstance(result.reason, str)
