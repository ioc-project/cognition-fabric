"""Concierge Agent implementation."""

from .base_agent import SpecializedAgent
from .tools import calculate, create_agent_tools, read_document


class ConciergeAgent(SpecializedAgent):
    """Agent specialized in code execution and review."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Concierge Agent.

        Args:
            system_prompt: The system prompt defining the agent's behavior
        """
        list_documents = create_agent_tools("concierge_agent")
        tools = [list_documents, read_document, calculate]
        super().__init__(
            name="concierge_agent",
            tools=tools,
            system_prompt=system_prompt,
        )
