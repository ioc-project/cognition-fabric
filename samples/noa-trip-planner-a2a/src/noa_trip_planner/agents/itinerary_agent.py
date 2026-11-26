# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Itinerary Agent implementation."""

from collections.abc import Sequence

from langchain_core.tools import BaseTool

from .base_agent import SpecializedAgent


class ItineraryAgent(SpecializedAgent):
    """Agent specialized in data analysis and itinerary planning."""

    def __init__(self, system_prompt: str, tools: Sequence[BaseTool], llm=None):
        """
        Initialize the Itinerary Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        super().__init__(
            name="itinerary_agent",
            tools=tools,
            system_prompt=system_prompt,
            llm=llm,
        )
