"""Direct CFN enforcement gate for the local NOA sample.

This is application-level demonstration code until the enforcement proxy is
integrated. It holds each tool call while CFN obtains a CE disposition.
"""

import json
import logging
import os

import grpc
from langchain_core.messages import ToolMessage
from opentelemetry import trace

from noa_trip_planner.generated import enforcement_pb2


logger = logging.getLogger(__name__)
_METHOD = "/ioc.cf.enforcement.v1.Enforcement/GetDisposition"


def _get_disposition(source_agent_id: str, tool_call: dict) -> int:
    """Publish a proposed-action span, then ask CFN before executing it."""
    mas_id = os.environ["NOA_MAS_ID"]
    tool_name = tool_call["name"]
    tracer = trace.get_tracer(__name__)

    # End this span before the blocking RPC. It describes the proposed call,
    # since the actual tool span may remain open while enforcement waits.
    with tracer.start_as_current_span("noa.proposed_tool_call") as span:
        span.set_attribute("tool.name", tool_name)
        span.set_attribute("tool.arguments", json.dumps(tool_call.get("args", {}), default=str))
        span.set_attribute("mas.id", mas_id)
        span.set_attribute("agent.id", source_agent_id)
        span_context = span.get_span_context()
        if not span_context.is_valid:
            raise RuntimeError("Observe tracing is not active; no action reference is available")
        trace_id = f"{span_context.trace_id:032x}"
        span_id = f"{span_context.span_id:016x}"

    request = enforcement_pb2.GetDispositionRequest(
        payload=enforcement_pb2.GetDispositionPayload(
            mas_id=mas_id,
            source_agent_id=source_agent_id,
            destination_agent_id=tool_name,
            trace_id=trace_id,
            span_id=span_id,
        ),
        extra={"tool_name": tool_name},
    )
    target = os.environ.get("NOA_CFN_GRPC_TARGET", "127.0.0.1:9003")
    timeout = float(os.environ.get("NOA_ENFORCEMENT_TIMEOUT_SEC", "10"))
    with grpc.insecure_channel(target) as channel:
        invoke = channel.unary_unary(
            _METHOD,
            request_serializer=enforcement_pb2.GetDispositionRequest.SerializeToString,
            response_deserializer=enforcement_pb2.GetDispositionResponse.FromString,
        )
        response = invoke(request, timeout=timeout)

    logger.info(
        "NOA tool disposition: agent=%s tool=%s trace_id=%s span_id=%s action=%s",
        source_agent_id,
        tool_name,
        trace_id,
        span_id,
        enforcement_pb2.GetDispositionResponse.Action.Name(response.action),
    )
    return response.action


def gated_tool_node(tool_node, source_agent_id: str):
    """Return a graph node that evaluates each proposed call before execution."""

    def run(state):
        messages = []
        for tool_call in state["messages"][-1].tool_calls:
            tool_name = tool_call["name"]
            try:
                action = _get_disposition(source_agent_id, tool_call)
            except (grpc.RpcError, OSError, ValueError, RuntimeError, KeyError) as exc:
                logger.error("NOA tool enforcement failed for %s: %s", tool_name, exc)
                action = enforcement_pb2.GetDispositionResponse.ACTION_UNSPECIFIED

            if action == enforcement_pb2.GetDispositionResponse.ACTION_ALLOW:
                # ToolNode expects the original AI message and matching call ID.
                approved_message = state["messages"][-1].model_copy(
                    update={"tool_calls": [tool_call]}
                )
                result = tool_node.invoke({"messages": [approved_message]})
                messages.extend(result["messages"])
            else:
                action_name = enforcement_pb2.GetDispositionResponse.Action.Name(action)
                logger.warning("NOA blocked tool %s: action=%s", tool_name, action_name)
                if action == enforcement_pb2.GetDispositionResponse.ACTION_BLOCK:
                    reason_code = "POLICY_DENIED"
                    reason = "Tool call denied by policy."
                    explanation = f"The {tool_name} call did not run and returned no data."
                elif action == enforcement_pb2.GetDispositionResponse.ACTION_UNSPECIFIED:
                    reason_code = "TOOL_UNAVAILABLE"
                    reason = "Tool unavailable due to a technical issue."
                    explanation = (
                        f"The {tool_name} call did not run and returned no data."
                    )
                else:
                    reason_code = "ACTION_NOT_APPLIED"
                    reason = "The required tool action could not be applied."
                    explanation = (
                        f"The {tool_name} tool was not executed, so it returned no data. "
                        "Do not infer its result. Use another permitted approach or explain "
                        "that the requested information could not be retrieved."
                    )
                messages.append(
                    ToolMessage(
                        content=json.dumps(
                            {
                                "action": "BLOCK",
                                "tool": tool_name,
                                "reason_code": reason_code,
                                "short_reason": reason,
                                "explanation": explanation,
                            }
                        ),
                        tool_call_id=tool_call["id"],
                        name=tool_name,
                        status="error",
                    )
                )
        return {"messages": messages}

    return run
