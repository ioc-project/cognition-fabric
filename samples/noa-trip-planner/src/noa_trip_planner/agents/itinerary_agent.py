"""Itinerary Agent implementation."""

from .base_agent import SpecializedAgent
from .tools import calculate, query_graph_database


class ItineraryAgent(SpecializedAgent):
    """Agent specialized in data analysis and itinerary planning."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Itinerary Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        tools = [query_graph_database, calculate]
        super().__init__(
            name="itinerary_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
