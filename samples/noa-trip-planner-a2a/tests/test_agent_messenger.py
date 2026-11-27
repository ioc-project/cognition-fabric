# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import pytest

from noa_trip_planner.a2a.messenger import InMemoryAgentMessenger


@pytest.mark.asyncio
async def test_in_memory_messenger_dispatches_to_named_agent() -> None:
    calls = []

    async def schedule(task: str) -> str:
        calls.append(task)
        return "The train leaves at 09:00."

    messenger = InMemoryAgentMessenger({"schedule_agent": schedule})

    result = await messenger.send("schedule_agent", "Find a morning train")

    assert result == "The train leaves at 09:00."
    assert calls == ["Find a morning train"]


@pytest.mark.asyncio
async def test_in_memory_messenger_rejects_unknown_agent() -> None:
    messenger = InMemoryAgentMessenger({})

    with pytest.raises(ValueError, match="Unknown in-memory agent"):
        await messenger.send("missing", "task")
