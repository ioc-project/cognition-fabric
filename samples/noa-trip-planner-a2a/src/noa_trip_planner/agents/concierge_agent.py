# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Concierge Agent implementation."""

from collections.abc import Sequence

from langchain_core.tools import BaseTool

from .base_agent import SpecializedAgent


class ConciergeAgent(SpecializedAgent):
    """Agent specialized in code execution and review."""

    def __init__(self, system_prompt: str, tools: Sequence[BaseTool], llm=None):
        """
        Initialize the Concierge Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        super().__init__(
            name="concierge_agent",
            tools=tools,
            system_prompt=system_prompt,
            llm=llm,
        )
