"""gRPC service for CASA Cognition Engine.

Implements the ioc.ce.v1.CognitionEngine service.
"""
import asyncio
import logging
from concurrent import futures
from datetime import datetime, timezone
import uuid

import grpc

from generated import ce_pb2, ce_pb2_grpc
from cognition_store import (
    get_cognition_store_client,
    shutdown_cognition_store_client,
    CEFinding,
)

logger = logging.getLogger(__name__)

DEFAULT_PORT = 50051


class CognitionEngineServicer(ce_pb2_grpc.CognitionEngineServicer):
    """Implementation of the ioc.ce.v1.CognitionEngine gRPC service."""

    def _run_async(self, coro):
        """Run an async coroutine from sync context."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                return asyncio.ensure_future(coro)
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def Evaluate(self, request: ce_pb2.EvaluateRequest, context) -> ce_pb2.EvaluateResponse:
        """
        ioc.ce.v1.Evaluate RPC - authorization decision for in-scope MAS actions.

        Flow:
        1. Read prior CE findings from Cognition Store (for MAS-level context)
        2. Make decision (stub: always ALLOW)
        3. Store current finding in Cognition Store
        4. Return decision
        """
        try:
            logger.info(
                f"Evaluate: mas_id={request.mas_id} trace_id={request.trace_id} "
                f"action_class={ce_pb2.ActionClass.Name(request.action_class)} "
                f"direction={ce_pb2.Direction.Name(request.direction)}"
            )

            # 1. Read prior findings from Cognition Store
            client = get_cognition_store_client()
            if client:
                prior_findings = self._run_async(
                    client.get_prior_findings(request.mas_id, request.trace_id)
                )
                logger.debug(f"Prior findings: {len(prior_findings.findings) if prior_findings else 0}")

            # 2. Make decision (stub: always ALLOW)
            response = ce_pb2.EvaluateResponse(
                outcome=ce_pb2.DECISION_ALLOW,
                context_sufficiency=ce_pb2.CONTEXT_SUFFICIENCY_COMPLETE,
                reason="Stub: all checks passed",
                trace_id=request.trace_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

            # 3. Store finding in Cognition Store
            if client:
                finding = CEFinding(
                    finding_id=str(uuid.uuid4()),
                    mas_id=request.mas_id,
                    trace_id=request.trace_id,
                    outcome=ce_pb2.Decision.Name(response.outcome),
                    reason=response.reason,
                    source_agent_id=request.source_agent_id,
                    destination_agent_id=request.destination_agent_id,
                    action_class=ce_pb2.ActionClass.Name(request.action_class),
                    direction=ce_pb2.Direction.Name(request.direction),
                    timestamp=response.timestamp,
                )
                self._run_async(client.store_finding(finding))

            logger.info(f"Evaluate result: {ce_pb2.Decision.Name(response.outcome)}")
            return response

        except Exception as e:
            logger.error(f"Evaluate error: {e}", exc_info=True)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return ce_pb2.EvaluateResponse()

    def GetInfo(self, request: ce_pb2.GetInfoRequest, context) -> ce_pb2.GetInfoResponse:
        """ioc.ce.v1.GetInfo RPC - returns CE capabilities."""
        return ce_pb2.GetInfoResponse(
            ce_type="CASA",
            version="1.0.0",
            matcher_strategy="hybrid",
        )


def serve(port: int = DEFAULT_PORT, max_workers: int = 10):
    """Start the gRPC server."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    ce_pb2_grpc.add_CognitionEngineServicer_to_server(CognitionEngineServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"CASA CE gRPC server started on port {port}")
    return server


async def serve_async(port: int = DEFAULT_PORT):
    """Start gRPC server and register with CFN."""
    from registration import register_casa_ce, shutdown_lifecycle_client

    server = serve(port)
    await register_casa_ce()

    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down CASA CE...")
    finally:
        await shutdown_lifecycle_client()
        await shutdown_cognition_store_client()
        server.stop(grace=5)
        logger.info("CASA CE stopped")


if __name__ == "__main__":
    import os

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    port = int(os.getenv("GRPC_PORT", DEFAULT_PORT))
    asyncio.run(serve_async(port))
