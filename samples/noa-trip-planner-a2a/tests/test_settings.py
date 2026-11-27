# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from noa_trip_planner.settings import Settings


def test_transport_defaults_use_slim_and_mcp() -> None:
    settings = Settings(_env_file=None)

    assert settings.a2a_transport == "slimrpc"
    assert settings.tool_transport == "mcp"
    assert settings.mcp_server_url == "http://localhost:8001/mcp"


def test_shared_secret_is_hidden_from_repr() -> None:
    settings = Settings(_env_file=None, slim_shared_secret="do-not-print-this")

    assert "do-not-print-this" not in repr(settings)
