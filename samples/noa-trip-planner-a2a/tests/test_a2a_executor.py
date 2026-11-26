# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest
from a2a.helpers import new_text_message
from a2a.types.a2a_pb2 import Role
from opentelemetry.context import attach, detach, get_value, set_value
from opentelemetry.propagate import inject
from opentelemetry.trace import (
    NonRecordingSpan,
    SpanContext,
    TraceFlags,
    get_current_span,
    set_span_in_context,
)

from noa_trip_planner.a2a.executor import SpecialistAgentExecutor


class RecordingEventQueue:
    def __init__(self):
        self.events = []

    async def enqueue_event(self, event) -> None:
        self.events.append(event)


class FakeContext:
    task_id = "task-1"
    context_id = "context-1"
    current_task = None

    def __init__(self):
        self.message = new_text_message(
            "Find a train",
            role=Role.ROLE_USER,
            task_id=self.task_id,
            context_id=self.context_id,
        )

    def get_user_input(self) -> str:
        return "Find a train"


class FakeAgent:
    name = "schedule_agent"

    def __init__(self):
        self.questions = []
        self.session_ids = []
        self.trace_ids = []

    async def answer(self, question: str) -> str:
        self.questions.append(question)
        self.session_ids.append(get_value("session.id"))
        self.trace_ids.append(get_current_span().get_span_context().trace_id)
        return "The train leaves at 09:00."


@pytest.mark.asyncio
async def test_executor_publishes_complete_task_lifecycle() -> None:
    agent = FakeAgent()
    queue = RecordingEventQueue()
    executor = SpecialistAgentExecutor(agent)

    await executor.execute(FakeContext(), queue)

    assert agent.questions == ["Find a train"]
    assert [type(event).__name__ for event in queue.events] == [
        "Task",
        "TaskStatusUpdateEvent",
        "TaskArtifactUpdateEvent",
        "TaskStatusUpdateEvent",
    ]
    assert queue.events[2].artifact.parts[0].text == "The train leaves at 09:00."


@pytest.mark.asyncio
async def test_executor_attaches_trace_context_from_a2a_metadata() -> None:
    trace_id = 0x1234567890ABCDEF1234567890ABCDEF
    span_context = SpanContext(
        trace_id=trace_id,
        span_id=0x1234567890ABCDEF,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )
    carrier: dict[str, str] = {}
    inject(
        carrier,
        context=set_span_in_context(NonRecordingSpan(span_context)),
    )
    context = FakeContext()
    context.message.metadata.update(carrier)
    agent = FakeAgent()

    await SpecialistAgentExecutor(agent).execute(context, RecordingEventQueue())

    assert agent.trace_ids == [trace_id]


@pytest.mark.asyncio
async def test_executor_preserves_restored_observe_session() -> None:
    context = FakeContext()
    agent = FakeAgent()
    session_token = attach(set_value("session.id", "session-1"))

    try:
        await SpecialistAgentExecutor(agent).execute(context, RecordingEventQueue())
    finally:
        detach(session_token)

    assert agent.session_ids == ["session-1"]


@pytest.mark.asyncio
async def test_executor_preserves_active_a2a_server_trace() -> None:
    incoming_trace_id = 0x1234567890ABCDEF1234567890ABCDEF
    incoming_span_context = SpanContext(
        trace_id=incoming_trace_id,
        span_id=0x1234567890ABCDEF,
        is_remote=True,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )
    carrier: dict[str, str] = {}
    inject(
        carrier,
        context=set_span_in_context(NonRecordingSpan(incoming_span_context)),
    )
    context = FakeContext()
    context.message.metadata.update(carrier)

    server_trace_id = 0xABCDEF1234567890ABCDEF1234567890
    server_span_context = SpanContext(
        trace_id=server_trace_id,
        span_id=0xABCDEF1234567890,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )
    server_token = attach(set_span_in_context(NonRecordingSpan(server_span_context)))
    agent = FakeAgent()

    try:
        await SpecialistAgentExecutor(agent).execute(context, RecordingEventQueue())
    finally:
        detach(server_token)

    assert agent.trace_ids == [server_trace_id]
