# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Concierge Agent implementation."""

from .base_agent import SpecializedAgent
from noa_trip_planner.tool_registry import tools_for_agent


class ConciergeAgent(SpecializedAgent):
    """Agent specialized in code execution and review."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Concierge Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        tools = tools_for_agent("concierge_agent")
        super().__init__(
            name="concierge_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
