"""Moderator Agent implementation."""

import logging
import os
from typing import Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from noa_trip_planner.delay import apply_simulated_delay

logger = logging.getLogger(__name__)


class ModeratorAgent:
    """Agent that coordinates and routes between specialized agents."""

    def __init__(self, system_prompt: str):
        """
        Initialize the Moderator Agent.

        Args:
            system_prompt: The system prompt template defining the moderator's behavior
        """
        self.system_prompt_template = system_prompt

        base_url = os.environ.get("AI_GATEWAY_BASE_URL")
        api_key = os.environ.get("AI_GATEWAY_API_KEY")

        # Allow model override via environment variable (default: azure/gpt-4o for LiteLLM)
        model_name = os.environ.get("NOA_LLM_MODEL", "azure/gpt-4o")

        self.llm = ChatOpenAI(
            model=model_name,
            temperature=0,
            base_url=base_url,
            api_key=api_key,
        )

    def format_messages(self, messages: Sequence[BaseMessage]) -> str:
        """Format messages for display in the prompt."""
        formatted: list[str] = []
        for msg in messages:  # Include all messages for complete context
            if isinstance(msg, HumanMessage):
                formatted.append(f"User: {msg.content}")
            elif isinstance(msg, AIMessage):
                formatted.append(f"Assistant: {msg.content}")
        return "\n".join(formatted)

    def __call__(self, state: dict) -> dict:
        """
        Execute the moderator to route to appropriate agents.

        Args:
            state: The current agent state

        Returns:
            Updated state with routing decision
        """
        print("apply_simulated_delay for moderator")
        apply_simulated_delay(component="moderator", step_name="moderator")
        print("applied_simulated_delay for moderator")

        messages: Sequence[BaseMessage] = state["messages"]
        question: str = state.get("question", "")

        # If this is the first message, save the question
        if not question and messages:
            question = (
                messages[0].content if isinstance(messages[0], HumanMessage) else ""
            )

        # Create moderator prompt using template
        moderator_prompt = self.system_prompt_template.format(
            conversation=self.format_messages(messages), question=question
        )

        response: AIMessage = self.llm.invoke([HumanMessage(content=moderator_prompt)])

        logger.info("Moderator Response: %s", response.content)

        response_text: str = (
            response.content.strip() if isinstance(response.content, str) else ""
        )

        # Parse the reasoning, query, and decision
        reasoning = ""
        agent_query = ""
        decision = ""

        # Split by REASONING:, QUERY:, and DECISION: markers
        if "REASONING:" in response_text:
            reasoning_start = response_text.find("REASONING:") + len("REASONING:")
            reasoning_end = (
                response_text.find("QUERY:")
                if "QUERY:" in response_text
                else response_text.find("DECISION:")
            )
            if reasoning_end != -1:
                reasoning = response_text[reasoning_start:reasoning_end].strip()
            else:
                reasoning = response_text[reasoning_start:].strip()

        if "QUERY:" in response_text:
            query_start = response_text.find("QUERY:") + len("QUERY:")
            query_end = response_text.find("DECISION:")
            if query_end != -1:
                agent_query = response_text[query_start:query_end].strip()
            else:
                agent_query = response_text[query_start:].strip()

        if "DECISION:" in response_text:
            decision_start = response_text.find("DECISION:") + len("DECISION:")
            decision = response_text[decision_start:].strip()

        # If no structured format found, fall back to the old format
        if not decision:
            decision = response_text.strip()
            reasoning = "No explicit reasoning provided"

        # Parse the decision
        if "FINAL_ANSWER:" in response_text:
            final_answer = decision.replace("FINAL_ANSWER:", "").strip()
            return {
                "messages": [AIMessage(content=final_answer)],
                "next_agent": "end",
                "final_answer": final_answer,
                "question": question,
                "reasoning": reasoning,
                "communication_chain": [],  # No new edges for final answer
            }
        elif decision in ["schedule_agent", "itinerary_agent", "concierge_agent"]:
            # Use agent_query if provided, otherwise fall back to reasoning or full response
            query_for_agent = (
                agent_query
                if agent_query
                else (reasoning if reasoning else response_text)
            )

            # Ensure we have a non-empty query
            if not query_for_agent.strip():
                query_for_agent = f"Please help with: {question}"

            # Record the routing decision in the communication chain
            routing_edge = {
                "from": "moderator",
                "to": decision,
                "query": query_for_agent,
            }

            return {
                "messages": [
                    AIMessage(
                        content=f"DECISION: {decision}\nQUERY: {query_for_agent}",
                        # Store agent_query in metadata for extraction
                        additional_kwargs={"agent_query": query_for_agent},
                    )
                ],
                "next_agent": decision,
                "question": question,
                "reasoning": reasoning,
                "agent_query": query_for_agent,  # Concise query for the agent
                "communication_chain": [routing_edge],  # Add routing edge
            }
        else:
            # Default: provide answer if unclear
            return {
                "messages": [AIMessage(content=decision)],
                "next_agent": "end",
                "final_answer": decision,
                "question": question,
                "reasoning": reasoning,
                "communication_chain": [],  # No new edges
            }
