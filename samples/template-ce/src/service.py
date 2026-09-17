"""gRPC service for CASA Cognition Engine.

Implements the ioc.ce.v1.CognitionEngine service for authorization decisions.
"""
import asyncio
import logging
from concurrent import futures
from datetime import datetime, timezone
from typing import Optional
import uuid

import grpc

from generated import ce_pb2, ce_pb2_grpc
from checks import run_checks_grpc, ALL_CHECKS
from cognition_store import (
    get_cognition_store_client,
    shutdown_cognition_store_client,
    CEFinding,
    PriorFindingsResult,
)

logger = logging.getLogger(__name__)

# Default port for gRPC server
DEFAULT_PORT = 50051


class CognitionEngineServicer(ce_pb2_grpc.CognitionEngineServicer):
    """Implementation of the ioc.ce.v1.CognitionEngine gRPC service."""

    def _run_async(self, coro):
        """
        Run an async coroutine from a sync context.

        The gRPC server uses a ThreadPoolExecutor, so we need to handle
        async operations (like Cognition Store calls) from sync methods.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're in an async context, create a task
                return asyncio.ensure_future(coro)
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            # No event loop, create a new one
            return asyncio.run(coro)

    async def _fetch_prior_findings(
        self,
        mas_id: str,
        trace_id: Optional[str] = None,
    ) -> Optional[PriorFindingsResult]:
        """
        Fetch prior CE findings from the Cognition Store.

        This provides MAS-level context (trajectory) for semantic checks.
        Prior findings help determine if the current action is consistent
        with the established pattern for this MAS.

        Args:
            mas_id: MAS identifier
            trace_id: Optional trace ID for filtering

        Returns:
            PriorFindingsResult if Cognition Store is configured, None otherwise
        """
        client = get_cognition_store_client()
        if client is None:
            return None

        try:
            return await client.get_prior_findings(mas_id, trace_id)
        except Exception as e:
            logger.warning(f"Failed to fetch prior findings: {e}")
            return None

    async def _store_finding(
        self,
        request: ce_pb2.EvaluateRequest,
        response: ce_pb2.EvaluateResponse,
    ) -> None:
        """
        Store the current CE finding in the Cognition Store.

        Called after evaluation to persist the finding for:
        - Audit/compliance logging
        - Future MAS-level context (trajectory)
        - Analytics and observability

        Args:
            request: The original EvaluateRequest
            response: The EvaluateResponse with the decision
        """
        client = get_cognition_store_client()
        if client is None:
            return

        try:
            finding = CEFinding(
                finding_id=str(uuid.uuid4()),
                mas_id=request.mas_id,
                trace_id=request.trace_id,
                outcome=ce_pb2.Decision.Name(response.outcome),
                denial_reason=ce_pb2.DenialReason.Name(response.denial_reason) if response.denial_reason else None,
                reason=response.reason,
                source_agent_id=request.source_agent_id,
                destination_agent_id=request.destination_agent_id,
                action_class=ce_pb2.ActionClass.Name(request.action_class),
                direction=ce_pb2.Direction.Name(request.direction),
                checks_run=[
                    {"check_id": cr.check_id, "passed": cr.passed, "reason": cr.reason}
                    for cr in response.checks_run
                ],
                ce_type="CASA",
                timestamp=response.timestamp,
            )
            await client.store_finding(finding)
        except Exception as e:
            logger.warning(f"Failed to store finding: {e}")

    def Evaluate(self, request: ce_pb2.EvaluateRequest, context) -> ce_pb2.EvaluateResponse:
        """
        ioc.ce.v1.Evaluate RPC implementation.

        BLOCKING authorization call - the caller (Enforcement Proxy via CFN)
        waits for the authorization decision before enforcing.

        Evaluates an in-scope MAS action and returns ALLOW/DENY/MODIFY decision.
        Supports three action classes:
        - MCP tool call (ACTION_CLASS_MCP_TOOL_CALL)
        - A2A delegation (ACTION_CLASS_A2A_DELEGATION)
        - Agent response (ACTION_CLASS_AGENT_RESPONSE)

        Both REQUEST and RESPONSE directions are inspected.
        """
        try:
            # Log the evaluation request for observability
            logger.info(
                "Evaluate request",
                extra={
                    "mas_id": request.mas_id,
                    "source_agent_id": request.source_agent_id,
                    "destination_agent_id": request.destination_agent_id,
                    "trace_id": request.trace_id,
                    "action_class": ce_pb2.ActionClass.Name(request.action_class),
                    "direction": ce_pb2.Direction.Name(request.direction),
                }
            )

            # Fetch prior findings from Cognition Store for MAS-level context
            # This provides trajectory context for semantic checks
            prior_findings = self._run_async(
                self._fetch_prior_findings(request.mas_id, request.trace_id)
            )
            if prior_findings:
                logger.debug(
                    "Prior findings fetched",
                    extra={
                        "mas_id": request.mas_id,
                        "num_findings": len(prior_findings.findings),
                        "context_complete": prior_findings.context_complete,
                    }
                )

            # Run all applicable checks (deterministic first, then semantic)
            # TODO: Pass prior_findings to checks for MAS-level context
            checks_results, first_failure = run_checks_grpc(request)

            # Build response
            response = ce_pb2.EvaluateResponse()
            response.trace_id = request.trace_id
            response.timestamp = datetime.now(timezone.utc).isoformat()

            # Add check results
            for check_result in checks_results:
                result = response.checks_run.add()
                result.check_id = check_result.check_id
                result.passed = check_result.passed
                if check_result.reason:
                    result.reason = check_result.reason

            # Determine outcome based on check results
            if first_failure is not None:
                # A check failed -> DENY
                response.outcome = ce_pb2.DECISION_DENY
                response.denial_reason = ce_pb2.DENIAL_REASON_DEVIATES_FROM_INTENT
                response.reason = first_failure.reason or "Check failed"
                response.context_sufficiency = ce_pb2.CONTEXT_SUFFICIENCY_COMPLETE

                logger.info(
                    "Evaluate decision: DENY",
                    extra={
                        "trace_id": request.trace_id,
                        "failed_check": first_failure.check_id,
                        "denial_reason": "DEVIATES_FROM_INTENT",
                    }
                )
            else:
                # All checks passed -> ALLOW
                response.outcome = ce_pb2.DECISION_ALLOW
                response.context_sufficiency = ce_pb2.CONTEXT_SUFFICIENCY_COMPLETE

                logger.info(
                    "Evaluate decision: ALLOW",
                    extra={
                        "trace_id": request.trace_id,
                        "checks_passed": len(checks_results),
                    }
                )

            # Store finding in Cognition Store (async, fire-and-forget)
            # This persists the decision for future MAS-level context
            self._run_async(self._store_finding(request, response))

            return response

        except Exception as e:
            logger.error(f"Evaluate error: {e}", exc_info=True)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal evaluation error: {str(e)}")
            return ce_pb2.EvaluateResponse()

    def GetInfo(self, request: ce_pb2.GetInfoRequest, context) -> ce_pb2.GetInfoResponse:
        """
        ioc.ce.v1.GetInfo RPC implementation.

        Returns CASA CE capabilities/metadata: which checks are enabled
        and the matcher strategy in effect.
        """
        response = ce_pb2.GetInfoResponse()
        response.ce_type = "CASA"
        response.version = "1.0.0"
        response.matcher_strategy = "hybrid"  # Default strategy

        # Add enabled checks
        for check in ALL_CHECKS:
            response.enabled_checks.append(check.check_id)

        logger.info("GetInfo request served")
        return response


def serve(port: int = DEFAULT_PORT, max_workers: int = 10):
    """Start the gRPC server.

    Args:
        port: Port to listen on (default: 50051)
        max_workers: Maximum number of worker threads (default: 10)
    """
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    ce_pb2_grpc.add_CognitionEngineServicer_to_server(
        CognitionEngineServicer(), server
    )
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"CASA Cognition Engine gRPC server started on port {port}")
    return server


async def serve_async(port: int = DEFAULT_PORT):
    """Start the gRPC server and register with CFN.

    This is the main entry point that:
    1. Starts the gRPC server
    2. Registers with CFN (if CFN_URL is set)
    3. Starts heartbeat background task
    4. Waits for termination
    """
    from registration import register_casa_ce, shutdown_lifecycle_client

    server = serve(port)

    # Register with CFN
    await register_casa_ce()

    try:
        # Wait forever (or until interrupted)
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down CASA Cognition Engine...")
    finally:
        await shutdown_lifecycle_client()
        await shutdown_cognition_store_client()
        server.stop(grace=5)
        logger.info("CASA Cognition Engine stopped")


if __name__ == "__main__":
    import os

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    port = int(os.getenv("GRPC_PORT", DEFAULT_PORT))
    asyncio.run(serve_async(port))
