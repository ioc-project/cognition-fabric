"""Exercise CF additions using the real locked SDK, tools and wire messages."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import os
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

from fastapi.testclient import TestClient
import grpc
from langchain_core.messages import AIMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
import pytest

from noa_trip_planner import api, enforcement, multi_agent_system as mas
from noa_trip_planner.agents.tools import calculate
from noa_trip_planner.generated import enforcement_pb2 as pb
from noa_trip_planner.tool_registry import AGENT_TOOLS, tool_path, tools_for_agent
from noa_trip_planner.tool_server import create_app


ALLOW = pb.GetDispositionResponse.ACTION_ALLOW
BLOCK = pb.GetDispositionResponse.ACTION_BLOCK


@pytest.fixture
def cfn_rpc(monkeypatch):
    """Use a local gRPC peer to verify the vendored Python wire contract."""
    peer = Mock(action=ALLOW, unavailable=False, requests=[])

    def invoke(request, context):
        peer.requests.append(request)
        if peer.unavailable:
            context.abort(grpc.StatusCode.UNAVAILABLE, "test outage")
        return pb.GetDispositionResponse(action=peer.action)

    executor = ThreadPoolExecutor(max_workers=1)
    server = grpc.server(executor)
    server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler(
        "ioc.cf.enforcement.v1.Enforcement",
        {"GetDisposition": grpc.unary_unary_rpc_method_handler(
            invoke,
            request_deserializer=pb.GetDispositionRequest.FromString,
            response_serializer=pb.GetDispositionResponse.SerializeToString,
        )},
    ),))
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    monkeypatch.setenv("NOA_CFN_GRPC_TARGET", f"127.0.0.1:{port}")
    monkeypatch.setenv("NOA_ENFORCEMENT_MODE", "direct")
    try:
        yield peer
    finally:
        server.stop(0).wait()
        executor.shutdown()


def tool_call(expression="2 + 3", call_id="call-1"):
    return {"id": call_id, "name": "calculate", "args": {"expression": expression}}


def invoke_tool_node(calls):
    node = enforcement.gated_tool_node(ToolNode([calculate]), "itinerary_agent")
    workflow = StateGraph(MessagesState)
    workflow.add_node("tools", node)
    workflow.add_edge(START, "tools")
    workflow.add_edge("tools", END)
    state = workflow.compile().invoke({"messages": [AIMessage(content="", tool_calls=calls)]})
    return [message for message in state["messages"] if isinstance(message, ToolMessage)]


@pytest.mark.parametrize("outcome,reason", [
    (ALLOW, None),
    (BLOCK, "POLICY_DENIED"),
    (pb.GetDispositionResponse.ACTION_MODIFY, "ACTION_NOT_APPLIED"),
    (pb.GetDispositionResponse.ACTION_UNSPECIFIED, "TOOL_UNAVAILABLE"),
    ("unavailable", "TOOL_UNAVAILABLE"),
])
def test_direct_enforcement_keeps_wire_identity_and_fails_closed(cfn_rpc, spans, outcome, reason):
    cfn_rpc.unavailable = outcome == "unavailable"
    cfn_rpc.action = outcome if isinstance(outcome, int) else ALLOW
    with patch.object(calculate, "func", wraps=calculate.func) as execute:
        message, = invoke_tool_node([tool_call()])
    assert len(cfn_rpc.requests) == 1
    request = cfn_rpc.requests[0]
    assert request.payload.mas_id == os.environ["NOA_MAS_ID"] == mas.APPLICATION_ID
    assert request.payload.source_agent_id == "itinerary_agent"
    assert request.payload.destination_agent_id == "calculate"
    assert request.extra["tool_name"] == "calculate"
    proposed, = [s for s in spans.get_finished_spans() if s.name == "noa.proposed_tool_call"]
    assert request.payload.trace_id == f"{proposed.context.trace_id:032x}"
    assert request.payload.span_id == f"{proposed.context.span_id:016x}"
    assert proposed.attributes["mas.id"] == mas.APPLICATION_ID
    if reason is None:
        assert message.status == "success" and message.content == "5"
        execute.assert_called_once()
    else:
        assert message.status == "error"
        assert json.loads(message.content)["reason_code"] == reason
        execute.assert_not_called()


def test_direct_checks_each_call_independently(cfn_rpc, spans):
    messages = invoke_tool_node([tool_call(), tool_call("3 * 4", "call-2")])
    assert [m.content for m in messages] == ["5", "12"]
    assert [m.tool_call_id for m in messages] == ["call-1", "call-2"]
    assert len(cfn_rpc.requests) == 2
    assert len({r.payload.span_id for r in cfn_rpc.requests}) == 2


@pytest.mark.parametrize("status,reason", [(200, None), (403, "PROXY_BLOCKED"), (503, "TOOL_UNAVAILABLE")])
def test_proxy_forwards_once_with_trace_context_and_no_direct_fallback(monkeypatch, spans, status, reason):
    monkeypatch.setenv("NOA_ENFORCEMENT_MODE", "proxy")
    monkeypatch.setenv("NOA_ENFORCEMENT_PROXY_URL", "http://envoy.test:9010")
    forwarded = []
    tool_service = TestClient(create_app("test-token"))

    def forward(request, timeout):
        assert request.full_url == "http://envoy.test:9010/tools/itinerary_agent/calculate"
        forwarded.append(request)
        if status != 200:
            raise HTTPError(request.full_url, status, "test error", {}, BytesIO())
        headers = dict(request.header_items())
        headers["x-noa-tool-token"] = "test-token"
        response = tool_service.post(urlsplit(request.full_url).path, content=request.data, headers=headers)
        assert response.status_code == 200
        return BytesIO(response.content)

    opener = Mock()
    opener.open.side_effect = forward
    with patch.object(enforcement, "build_opener", return_value=opener), \
         patch.object(enforcement, "_get_disposition") as direct:
        message, = invoke_tool_node([tool_call()])
    opener.open.assert_called_once()
    direct.assert_not_called()
    proposed, = [s for s in spans.get_finished_spans() if s.name == "noa.proposed_tool_call"]
    headers = {key.lower(): value for key, value in forwarded[0].header_items()}
    assert headers["x-noa-session-id"] == "test-session"
    parent = TraceContextTextMapPropagator().extract(headers)
    from opentelemetry import trace
    propagated = trace.get_current_span(parent).get_span_context()
    assert propagated.trace_id == proposed.context.trace_id
    assert propagated.span_id == proposed.context.span_id
    remote = [s for s in spans.get_finished_spans() if s.name == "noa.remote_tool"]
    if reason is None:
        assert message.status == "success" and message.content == "5"
        assert len(remote) == 1
        assert remote[0].parent.span_id == proposed.context.span_id
        assert remote[0].attributes["session.id"] == "test-session"
    else:
        assert message.status == "error"
        assert json.loads(message.content)["reason_code"] == reason
        assert not remote


def test_proxy_tool_service_rejects_bypass_and_unknown_pairs(spans):
    client = TestClient(create_app("test-token"))
    path = tool_path("itinerary_agent", "calculate")
    assert client.post(path, json={"args": {"expression": "2 + 3"}}).status_code == 403
    assert client.post(path, json={"args": {}}, headers={"x-noa-tool-token": "test-token"}).status_code == 400
    assert client.post("/tools/schedule_agent/calculate", json={"args": {}}).status_code == 404
    for agent, names in AGENT_TOOLS.items():
        assert tuple(tool.name for tool in tools_for_agent(agent)) == names


@pytest.mark.parametrize("mode", ["direct", "proxy"])
@pytest.mark.parametrize("agents", [[], ["schedule_agent"], ["itinerary_agent"], ["concierge_agent"], None])
def test_coalition_graph_keeps_gates_for_selected_agents(monkeypatch, mode, agents):
    monkeypatch.setenv("NOA_ENFORCEMENT_MODE", mode)
    with patch.object(mas, "gated_tool_node", wraps=enforcement.gated_tool_node) as gate:
        graph = mas.create_multi_agent_system(available_agents=agents)
    selected = set(AGENT_TOOLS if agents is None else agents)
    assert {call.args[1] for call in gate.call_args_list} == selected
    nodes = graph.get_graph().nodes
    assert {agent for agent in AGENT_TOOLS if agent in nodes} == selected
    assert {agent for agent in AGENT_TOOLS if agent.replace("_agent", "_tools") in nodes} == selected


@pytest.mark.parametrize("action", [ALLOW, BLOCK])
def test_http_selected_agent_runs_through_real_graph_and_cfn_gate(cfn_rpc, spans, action):
    cfn_rpc.action = action
    responses = [
        AIMessage(content="REASONING: Need a calculation. QUERY: Calculate 2 + 3. DECISION: itinerary_agent"),
        AIMessage(content="", tool_calls=[tool_call()]),
        AIMessage(content="The tool returned a result or an error."),
        AIMessage(content="REASONING: Finished. DECISION: FINAL_ANSWER: Finished."),
    ]
    with patch.object(ChatOpenAI, "invoke", side_effect=responses), \
         patch.object(calculate, "func", wraps=calculate.func) as execute:
        response = TestClient(api.app).post("/ask", json={
            "question": "Calculate 2 + 3", "debugging": False,
            "available_agents": ["itinerary_agent"],
        })
    assert response.status_code == 200, response.text
    assert len(cfn_rpc.requests) == 1
    result = response.json()
    assert result["final_answer"] == "Finished."
    assert execute.call_count == (1 if action == ALLOW else 0)
    tool_messages = [message for message in result["messages"] if message["type"] == "tool"]
    assert len(tool_messages) == 1
    assert tool_messages[0]["status"] == ("success" if action == ALLOW else "error")
