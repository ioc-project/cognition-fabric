# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from noa_trip_planner.a2a.cards import create_agent_cards


def test_agent_cards_advertise_slimrpc_as_the_primary_binding() -> None:
    cards = create_agent_cards("agntcy", "trip-planner")

    assert set(cards) == {
        "moderator",
        "schedule_agent",
        "itinerary_agent",
        "concierge_agent",
    }
    for agent_name, card in cards.items():
        interface = card.supported_interfaces[0]
        assert interface.protocol_binding == "slimrpc"
        assert interface.protocol_version == "1.0"
        assert interface.url == f"agntcy/trip-planner/{agent_name}"
