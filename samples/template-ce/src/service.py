"""FastAPI service for CASA enforcement API."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from models import EnforcementRequest, EnforcementResponse, EnforcementAction


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    logger.info("Starting CASA enforcement service")

    # Register CE with CFN on startup (idempotent)
    from registration import register_casa_ce, shutdown_lifecycle_client
    await register_casa_ce()

    yield

    # Shutdown: stop heartbeats and close HTTP client
    await shutdown_lifecycle_client()
    logger.info("Shutting down CASA enforcement service")


app = FastAPI(
    title="CASA Enforcement API",
    description="Enforcement API for CASA Cognition Engine",
    version="1.0.0",
    lifespan=lifespan,
)


@app.post("/authorize", response_model=EnforcementResponse)
async def authorize(request: EnforcementRequest) -> EnforcementResponse:
    """
    BLOCKING authorization endpoint for CASA CE.

    This is a synchronous/blocking API - the caller waits for the authorization
    decision before proceeding.

    Args:
        request: Enforcement request containing workspace, agent, and trace info

    Returns:
        EnforcementResponse with action (allow/block/modify) and optional modify flag
    """
    try:
        # Log the authorization request for observability
        logger.info(
            "Authorization request",
            extra={
                "workspace_id": str(request.payload.workspace_id),
                "mas_id": str(request.payload.mas_id),
                "source_agent_id": request.payload.source_agent_id,
                "destination_agent_id": request.payload.destination_agent_id,
                "trace_id": request.payload.trace_id,
            }
        )

        # TODO: Implement authorization logic here
        # For now, default to allowing all requests
        action = EnforcementAction.ALLOW

        return EnforcementResponse(action=action)

    except Exception as e:
        logger.error(f"Authorization error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal authorization error")


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    uvicorn.run(app, host="0.0.0.0", port=8000)
