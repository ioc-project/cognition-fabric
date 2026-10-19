"""Schedule Agent implementation."""

from .base_agent import SpecializedAgent
from .tools import create_agent_tools, read_document

class ScheduleAgent(SpecializedAgent):
    """Agent specialized in scheduling and information gathering."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Schedule Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        list_documents = create_agent_tools("schedule_agent")
        tools = [list_documents, read_document]
        super().__init__(
            name="schedule_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
