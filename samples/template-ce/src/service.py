"""gRPC service for CASA Cognition Engine.

Implements the ioc.ce.v1.CognitionEngine service.
"""
import asyncio
import logging
from concurrent import futures
from datetime import datetime, timezone
import uuid

import grpc
from grpc_reflection.v1alpha import reflection

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
                f"[Evaluate] Received request: mas_id={request.mas_id} "
                f"source={request.source_agent_id} -> dest={request.destination_agent_id} "
                f"action_class={ce_pb2.ActionClass.Name(request.action_class)} "
                f"direction={ce_pb2.Direction.Name(request.direction)} "
                f"trace_id={request.trace_id}"
            )

            # 1. Read prior findings from Cognition Store
            client = get_cognition_store_client()
            if client:
                logger.info(f"[Evaluate] Fetching prior findings from Cognition Store for mas_id={request.mas_id}")
                prior_findings = self._run_async(
                    client.get_prior_findings(request.mas_id, request.trace_id)
                )
                num_findings = len(prior_findings.findings) if prior_findings else 0
                logger.info(f"[Evaluate] Retrieved {num_findings} prior findings, context_complete={prior_findings.context_complete if prior_findings else 'N/A'}")
            else:
                logger.info("[Evaluate] Cognition Store not configured, skipping prior findings fetch")

            # 2. Make decision (stub: always ALLOW)
            logger.info("[Evaluate] Making authorization decision...")
            response = ce_pb2.EvaluateResponse(
                outcome=ce_pb2.DECISION_ALLOW,
                context_sufficiency=ce_pb2.CONTEXT_SUFFICIENCY_COMPLETE,
                reason="Stub: all checks passed",
                trace_id=request.trace_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
            logger.info(f"[Evaluate] Decision: {ce_pb2.Decision.Name(response.outcome)} - {response.reason}")

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
                logger.info(f"[Evaluate] Storing finding in Cognition Store: finding_id={finding.finding_id}")
                self._run_async(client.store_finding(finding))
                logger.info("[Evaluate] Finding stored successfully")
            else:
                logger.info("[Evaluate] Cognition Store not configured, skipping finding storage")

            logger.info(f"[Evaluate] Complete: outcome={ce_pb2.Decision.Name(response.outcome)} trace_id={request.trace_id}")
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

    # Enable reflection for grpcurl/grpcui
    SERVICE_NAMES = (
        ce_pb2.DESCRIPTOR.services_by_name['CognitionEngine'].full_name,
        reflection.SERVICE_NAME,
    )
    reflection.enable_server_reflection(SERVICE_NAMES, server)

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
