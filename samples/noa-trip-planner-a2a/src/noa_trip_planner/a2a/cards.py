# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Static A2A Agent Cards used for direct private discovery."""

from a2a.types.a2a_pb2 import AgentCapabilities, AgentCard, AgentInterface, AgentSkill


AGENT_DEFINITIONS = {
    "moderator": (
        "Trip Planner Moderator",
        "Routes trip-planning requests to specialist agents and synthesizes answers.",
        "coordinate-trip-planning",
    ),
    "schedule_agent": (
        "Schedule Agent",
        "Finds train schedules and timetable information.",
        "find-travel-schedules",
    ),
    "itinerary_agent": (
        "Itinerary Agent",
        "Finds routes and computes travel times between cities.",
        "plan-city-routes",
    ),
    "concierge_agent": (
        "Concierge Agent",
        "Finds fares, attractions, and destination recommendations.",
        "provide-concierge-information",
    ),
}


def create_agent_cards(namespace: str, group: str, *, http_urls: dict[str, str] | None = None) -> dict[str, AgentCard]:
    """Create SLIMRPC cards or explicitly configured A2A HTTP interfaces."""
    cards: dict[str, AgentCard] = {}
    for agent_name, (display_name, description, skill_id) in AGENT_DEFINITIONS.items():
        cards[agent_name] = AgentCard(
            name=display_name,
            description=description,
            supported_interfaces=[
                AgentInterface(
                    url=http_urls[agent_name] if http_urls and agent_name in http_urls else f"{namespace}/{group}/{agent_name}",
                    protocol_binding="HTTP+JSON" if http_urls and agent_name in http_urls else "slimrpc",
                    protocol_version="1.0",
                )
            ],
            version="0.1.0",
            default_input_modes=["text/plain"],
            default_output_modes=["text/plain"],
            capabilities=AgentCapabilities(streaming=True),
            skills=[
                AgentSkill(
                    id=skill_id,
                    name=display_name,
                    description=description,
                    tags=["travel", "trip-planning"],
                    input_modes=["text/plain"],
                    output_modes=["text/plain"],
                )
            ],
        )
    return cards
