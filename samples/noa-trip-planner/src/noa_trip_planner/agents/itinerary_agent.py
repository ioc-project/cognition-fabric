"""Itinerary Agent implementation."""

from .base_agent import SpecializedAgent
from noa_trip_planner.tool_registry import tools_for_agent


class ItineraryAgent(SpecializedAgent):
    """Agent specialized in data analysis and itinerary planning."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Itinerary Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        tools = tools_for_agent("itinerary_agent")
        super().__init__(
            name="itinerary_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
