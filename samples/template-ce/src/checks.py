"""Check framework for CASA Cognition Engine.

Implements deterministic and semantic checks per the specification in:
- ioc-governance-casa-ce/docs/specs/deterministic-checks.md
- ioc-governance-casa-ce/docs/specs/semantic-checks.md

Checks run in order: deterministic first, then semantic.
All checks are currently stubs that return PASS - ready for future logic.
"""
from dataclasses import dataclass
from typing import Optional

from generated import ce_pb2


@dataclass
class CheckResult:
    """Check result for gRPC responses."""
    check_id: str
    passed: bool
    reason: Optional[str] = None


# =============================================================================
# Check Classes
# =============================================================================


class DeterministicToolSelectedCheck:
    """DETERMINISTIC_TOOL_SELECTED check.

    Checks: Is the requested tool present in the session's allowed-tool list?

    Why: Prevents an agent from calling tools never granted for this user session,
    even if they exist in the MAS.

    Pass: Tool in the allowed list -> proceed
    Fail: Not in the list -> DENY
    """

    check_id = "DETERMINISTIC_TOOL_SELECTED"


class DeterministicLLMSelectedToolsCheck:
    """DETERMINISTIC_LLM_SELECTED_TOOLS check.

    Checks: Did the LLM actually select this tool for this request?

    Why: Prevents prompt-injection/manipulation where an agent is steered into
    requesting a tool the LLM never selected.

    Pass: Tool was in the LLM's selection -> proceed
    Fail: Not selected -> DENY
    """

    check_id = "DETERMINISTIC_LLM_SELECTED_TOOLS"


class SemanticA2ATaskRelevanceCheck:
    """SEMANTIC_A2A_TASK_RELEVANCE check.

    Inspects: A delegated A2A task, before the callee sees it.

    Allows: Delegations that refine, decompose, or continue the trusted task.
    Blocks: Unrelated work - even if the subtask appears valid on its own.
    """

    check_id = "SEMANTIC_A2A_TASK_RELEVANCE"


class SemanticA2AResponseRelevanceCheck:
    """SEMANTIC_A2A_RESPONSE_RELEVANCE check.

    Inspects: An agent's response, before the caller sees it.

    Allows: Responses that answer the task, advance it, ask a relevant
            clarification, or clearly report a blocker.
    Blocks: Off-topic responses - even when well-written and factually correct.
    """

    check_id = "SEMANTIC_A2A_RESPONSE_RELEVANCE"


class SemanticMCPToolRelevanceCheck:
    """SEMANTIC_MCP_TOOL_RELEVANCE check.

    Inspects: A tool call, before the tool executes.

    Allows: Calls that support the task.
    Blocks: AUTHORIZED tools whose stated purpose does not fit the trusted task.

    Note: "Authorized" is not "appropriate". This check exists to block tools
    the agent IS permitted to call but shouldn't for this specific task.
    """

    check_id = "SEMANTIC_MCP_TOOL_RELEVANCE"


class SemanticA2AResponseGroundingCheck:
    """SEMANTIC_A2A_RESPONSE_GROUNDING check.

    Inspects: The claims in an agent's response.

    Allows: Claims supported by the MCP tools or agents actually consulted.
    Blocks: MATERIAL claims that cannot be grounded in the available sources.
    """

    check_id = "SEMANTIC_A2A_RESPONSE_GROUNDING"


# =============================================================================
# Check Registry and Runner
# =============================================================================


# All available checks in execution order (deterministic first, then semantic)
ALL_CHECKS = [
    # Deterministic tier (fast, rule-based)
    DeterministicToolSelectedCheck(),
    DeterministicLLMSelectedToolsCheck(),
    # Semantic tier (AI-powered)
    SemanticA2ATaskRelevanceCheck(),
    SemanticA2AResponseRelevanceCheck(),
    SemanticMCPToolRelevanceCheck(),
    SemanticA2AResponseGroundingCheck(),
]


def run_checks_grpc(request: ce_pb2.EvaluateRequest) -> tuple[list[CheckResult], Optional[CheckResult]]:
    """Run all applicable checks for a gRPC EvaluateRequest.

    Checks run in order, stops at first failure.

    Args:
        request: The gRPC EvaluateRequest

    Returns:
        Tuple of (all check results, first failed check or None)
    """
    results: list[CheckResult] = []
    first_failure: Optional[CheckResult] = None

    for check in ALL_CHECKS:
        if not _check_applies_to(check, request):
            continue

        result = _run_check(check, request)
        results.append(result)

        if not result.passed and first_failure is None:
            first_failure = result
            # Stop at first failure (short-circuit)
            break

    return results, first_failure


def _check_applies_to(check, request: ce_pb2.EvaluateRequest) -> bool:
    """Determine if a check applies to a gRPC request."""
    action_class = request.action_class
    direction = request.direction

    if isinstance(check, (DeterministicToolSelectedCheck, DeterministicLLMSelectedToolsCheck)):
        return action_class == ce_pb2.ACTION_CLASS_MCP_TOOL_CALL

    if isinstance(check, SemanticA2ATaskRelevanceCheck):
        return (
            action_class == ce_pb2.ACTION_CLASS_A2A_DELEGATION
            and direction == ce_pb2.DIRECTION_REQUEST
        )

    if isinstance(check, SemanticA2AResponseRelevanceCheck):
        return (
            action_class == ce_pb2.ACTION_CLASS_AGENT_RESPONSE
            and direction == ce_pb2.DIRECTION_RESPONSE
        )

    if isinstance(check, SemanticMCPToolRelevanceCheck):
        return (
            action_class == ce_pb2.ACTION_CLASS_MCP_TOOL_CALL
            and direction == ce_pb2.DIRECTION_REQUEST
        )

    if isinstance(check, SemanticA2AResponseGroundingCheck):
        return (
            action_class == ce_pb2.ACTION_CLASS_AGENT_RESPONSE
            and direction == ce_pb2.DIRECTION_RESPONSE
        )

    return False


def _run_check(check, request: ce_pb2.EvaluateRequest) -> CheckResult:
    """Run a single check against a gRPC request.

    Currently all checks are stubs that return PASS.
    """
    # All stubs pass for now
    return CheckResult(
        check_id=check.check_id,
        passed=True,
        reason=f"Stub: {check.check_id} passed"
    )
