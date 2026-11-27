# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""A2A executor adapter for trip-planner specialist agents."""

from a2a.helpers import new_task_from_user_message, new_text_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from ioa_observe.sdk.decorators import agent as ioa_observe_agent
from opentelemetry.context import attach, detach, get_current
from opentelemetry.propagate import extract
from opentelemetry.trace import get_current_span

from noa_trip_planner.agents.base_agent import SpecializedAgent
from noa_trip_planner.observability import COORDINATOR_APPLICATION_ID


class SpecialistAgentExecutor(AgentExecutor):
    """Publish a specialist response as a completed A2A task artifact."""

    def __init__(self, agent: SpecializedAgent):
        self._agent = agent

        async def run_specialist(question: str) -> str:
            return await agent.answer(question)

        self._run_specialist = ioa_observe_agent(
            name=agent.name,
            description=f"Execute the {agent.name} A2A specialist",
            protocol="A2A",
            application_id=COORDINATOR_APPLICATION_ID,
        )(run_specialist)

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task_id = context.task_id
        context_id = context.context_id
        if not task_id or not context_id:
            raise RuntimeError("A2A request is missing task or context identity")

        updater = TaskUpdater(event_queue, task_id, context_id)
        if context.current_task is None:
            if context.message is None:
                raise RuntimeError("New A2A task is missing its user message")
            await event_queue.enqueue_event(new_task_from_user_message(context.message))
        await updater.start_work()
        carrier = dict(context.message.metadata) if context.message else {}
        current_context = get_current()
        context_token = None
        if (
            carrier
            and not get_current_span(current_context).get_span_context().is_valid
        ):
            context_token = attach(extract(carrier, context=current_context))
        try:
            response = await self._run_specialist(context.get_user_input())
        finally:
            if context_token is not None:
                detach(context_token)
        await updater.add_artifact(
            [new_text_part(response)],
            name=f"{self._agent.name}-response",
            last_chunk=True,
        )
        await updater.complete(
            new_text_message(response, context_id=context_id, task_id=task_id)
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        if not context.task_id or not context.context_id:
            raise RuntimeError("A2A request is missing task or context identity")
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        await updater.cancel()
