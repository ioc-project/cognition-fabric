# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0
"""The additive migration preserves historical values and snapshot timestamps."""

import sqlalchemy as sa
from alembic import command

from tests.test_agent_identity_migration import legacy_database, _state  # noqa: F401


def test_metadata_migration_is_nullable_additive_and_repeatable(legacy_database):  # noqa: F811
    engine, config = legacy_database
    command.upgrade(config, "agent_identity_0008")
    before = _state(engine)
    command.upgrade(config, "mas_metadata_0009")
    after = _state(engine)
    additions = {
        "agent": {"agent_descriptions", "agent_metadata"},
        "multi_agentic_system": {
            "metadata_schema_version",
            "tag",
            "version",
            "mas_metadata",
            "documentation",
            "runtime_tools",
            "topologies",
        },
    }
    for table, names in additions.items():
        for row in after[table]:
            for name in names:
                assert row.pop(name) is None
    assert after == before
    with engine.connect() as connection:
        for table in ("multi_agentic_system", "agent", "mcp_tool"):
            columns = sa.inspect(connection).get_columns(table)
            new = additions.get(table, {"definition", "source_snapshot", "provenance", "protocol_version"})
            assert all(c["nullable"] for c in columns if c["name"] in new)
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "mas_metadata_0009"
    stable = _state(engine)
    command.upgrade(config, "mas_metadata_0009")
    assert _state(engine) == stable
    command.downgrade(config, "agent_identity_0008")
    assert _state(engine) == before
