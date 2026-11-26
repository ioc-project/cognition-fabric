# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Native LLM tools that delegate work to specialist agents over A2A."""

from collections.abc import Sequence

from ioa_observe.sdk.decorators import tool as ioa_observe_tool
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from noa_trip_planner.a2a.messenger import AgentMessenger
from noa_trip_planner.agents.prompts import AGENT_DESCRIPTIONS
from noa_trip_planner.observability import COORDINATOR_APPLICATION_ID


class AgentQuery(BaseModel):
    """Arguments accepted by every specialist agent tool."""

    query: str = Field(description="A specific, self-contained task for the agent")


class AgentDelegationToolset:
    """Expose selected A2A specialists as native async LLM tools."""

    def __init__(
        self,
        messenger: AgentMessenger,
        agent_names: Sequence[str],
    ) -> None:
        self._messenger = messenger
        self.tools = tuple(self._create_tool(name) for name in agent_names)

    def _create_tool(self, agent_name: str) -> BaseTool:
        try:
            description = AGENT_DESCRIPTIONS[agent_name]
        except KeyError as error:
            raise ValueError(f"Unknown specialist agent: {agent_name}") from error

        async def delegate(query: str) -> str:
            return await self._messenger.send(agent_name, query)

        observed_delegate = ioa_observe_tool(
            name=agent_name,
            description=description,
            application_id=COORDINATOR_APPLICATION_ID,
        )(delegate)
        return StructuredTool.from_function(
            coroutine=observed_delegate,
            name=agent_name,
            description=description,
            args_schema=AgentQuery,
        )
