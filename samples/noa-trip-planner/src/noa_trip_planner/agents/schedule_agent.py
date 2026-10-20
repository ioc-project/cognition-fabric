"""Schedule Agent implementation."""

from .base_agent import SpecializedAgent
from noa_trip_planner.tool_registry import tools_for_agent

class ScheduleAgent(SpecializedAgent):
    """Agent specialized in scheduling and information gathering."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Schedule Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        tools = tools_for_agent("schedule_agent")
        super().__init__(
            name="schedule_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
