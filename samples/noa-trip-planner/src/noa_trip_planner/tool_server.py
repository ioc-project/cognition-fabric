"""HTTP execution boundary for the existing NOA tools, behind local Envoy."""

import hashlib
import hmac
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from opentelemetry import context, trace
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from pydantic import BaseModel, Field
import uvicorn

from noa_trip_planner.tool_registry import AGENT_TOOLS, tool_path, tools_for_agent

logger = logging.getLogger(__name__)


class ToolRequest(BaseModel):
    args: dict[str, Any] = Field(default_factory=dict)
    model_config = {"extra": "forbid"}


def create_app(token: str) -> FastAPI:
    app = FastAPI(title="Local NOA tools", redirect_slashes=False)
    instance = hashlib.sha256(token.encode()).hexdigest()

    @app.get("/health")
    def health():
        return {"service": "noa-tools", "instance": instance}

    def make_endpoint(agent, tool):
        def execute(payload: ToolRequest, request: Request):
            if not hmac.compare_digest(request.headers.get("x-noa-tool-token", ""), token):
                raise HTTPException(status_code=403, detail="Use the local enforcement proxy")
            parent = TraceContextTextMapPropagator().extract(dict(request.headers))
            if not trace.get_current_span(parent).get_span_context().is_valid:
                raise HTTPException(status_code=400, detail="A valid traceparent is required")
            session = request.headers.get("x-noa-session-id", "")
            if session:
                parent = context.set_value("session.id", session, parent)
            tracer = trace.get_tracer(__name__)
            with tracer.start_as_current_span("noa.remote_tool", context=parent) as span:
                span.set_attribute("agent.id", agent)
                span.set_attribute("tool.name", tool.name)
                span.set_attribute("mas.id", os.environ["NOA_MAS_ID"])
                if session:
                    span.set_attribute("session.id", session)
                try:
                    result = tool.invoke(payload.args)
                except Exception:
                    logger.exception("NOA tool failed: agent=%s tool=%s", agent, tool.name)
                    raise HTTPException(status_code=500, detail="NOA tool execution failed") from None
            logger.info("NOA tool executed through proxy: agent=%s tool=%s", agent, tool.name)
            return {"result": result}
        return execute

    for agent, names in AGENT_TOOLS.items():
        tools = {tool.name: tool for tool in tools_for_agent(agent)}
        for name in names:
            app.add_api_route(tool_path(agent, name), make_endpoint(agent, tools[name]), methods=["POST"])
    return app


def main() -> None:
    from ioa_observe.sdk import Observe

    token = Path(os.environ["NOA_TOOL_TOKEN_FILE"]).read_text().strip()
    if not token:
        raise ValueError("Local proxy tool token is empty")
    Observe.init(os.environ["NOA_MAS_ID"], api_endpoint=os.environ.get("OTLP_HTTP_ENDPOINT"))
    uvicorn.run(create_app(token), host=os.environ.get("NOA_TOOLS_HOST", "0.0.0.0"),
                port=int(os.environ.get("NOA_TOOLS_PORT", "8126")))


if __name__ == "__main__":
    main()
