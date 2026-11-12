# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Real PostgreSQL coverage of the bounded 19-column timestamp cutover."""

from datetime import timezone
from io import StringIO

import pytest
import sqlalchemy as sa
from alembic import command

from server.database.relational_db.utc import configure_utc
from tests.test_agent_identity_migration import legacy_database  # noqa: F401

# Alembic's installed package owns that import name; load the self-contained revision explicitly.
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location("utc_revision", Path(__file__).parents[1] / "alembic/versions/0010_utc_timestamps.py")
migration = module_from_spec(spec)
spec.loader.exec_module(migration)


def _prepare(engine, config):
    command.upgrade(config, "mas_metadata_0009")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                'INSERT INTO "user" (id, username, password, domain, role) '
                "VALUES ('utc-user', 'UTC', 'hash', 'local', 'admin')"
            )
        )
        connection.execute(sa.text("INSERT INTO mcp_server (id, mas_id, name) VALUES ('server', 'mas-a', 'Native')"))
        connection.execute(
            sa.text("INSERT INTO mcp_tool (id, mcp_server_id, name) VALUES ('tool', 'server', 'Native')")
        )
        for table, columns in migration.COLUMNS.items():
            assignments = ", ".join(f"\"{column}\" = TIMESTAMP '2026-07-10 12:34:56.123456'" for column in columns)
            connection.execute(sa.text(f'UPDATE "{table}" SET {assignments}'))
        connection.execute(sa.text("UPDATE agent SET updated_at = NULL WHERE agent_id = 'legacy-client-id'"))
        connection.execute(
            sa.text(
                "UPDATE multi_agentic_system SET created_at = TIMESTAMP '2026-01-10 12:34:56.123456' "
                "WHERE id = 'mas-b'"
            )
        )


def _snapshot(engine):
    with engine.connect() as connection:
        return {
            table: connection.execute(sa.text(f'SELECT * FROM "{table}" ORDER BY 1')).mappings().all()
            for table in [*migration.COLUMNS, "cognition_engine", "mas_cognition_engines"]
        }


@pytest.mark.parametrize("zone", [None, "", "Europe/Budapest"])
def test_conversion_preserves_precision_nulls_instants_and_cache(legacy_database, monkeypatch, zone):  # noqa: F811
    engine, config = legacy_database
    _prepare(engine, config)
    if zone is None:
        monkeypatch.delenv("LEGACY_TIMESTAMP_TZ", raising=False)
    else:
        monkeypatch.setenv("LEGACY_TIMESTAMP_TZ", zone)
    before = _snapshot(engine)
    # PGOPTIONS applies to Alembic's own fresh connection. Its hook must pin UTC without losing search_path.
    monkeypatch.setenv("PGTZ", "America/Los_Angeles")
    sessions = []

    def observe(connection, cursor, statement, parameters, context, executemany):
        if "FROM pg_timezone_names" in statement:
            sessions.append(
                (connection.scalar(sa.text("SHOW TimeZone")), connection.scalar(sa.text("SELECT current_schema()")))
            )

    sa.event.listen(sa.engine.Engine, "before_cursor_execute", observe)
    try:
        command.upgrade(config, "head")
    finally:
        sa.event.remove(sa.engine.Engine, "before_cursor_execute", observe)
    assert sessions and all(zone == "UTC" and schema.startswith("agent_migration_") for zone, schema in sessions)
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "utc_timestamps_0010"
        inspector = sa.inspect(connection)
        assert "cfn_workspace" not in inspector.get_table_names()
        for table, columns in migration.COLUMNS.items():
            metadata = {c["name"]: c for c in inspector.get_columns(table)}
            assert all(metadata[column]["type"].timezone for column in columns)
    after = _snapshot(engine)
    for table, rows in before.items():
        for old, new in zip(rows, after[table]):
            for column, value in old.items():
                if column in migration.COLUMNS.get(table, ()) and value is not None:
                    hour = 10 if zone == "Europe/Budapest" else 12
                    if value.month == 1 and zone == "Europe/Budapest":
                        hour = 11
                    expected = value.replace(hour=hour, tzinfo=timezone.utc)
                    assert new[column] == expected
                    assert new[column].microsecond == 123456
                else:
                    assert new[column] == value
    stable = _snapshot(engine)
    command.upgrade(config, "head")
    assert _snapshot(engine) == stable
    command.downgrade(config, "mas_metadata_0009")
    assert _snapshot(engine) == before


def test_invalid_zone_is_atomic_on_upgrade_and_downgrade(legacy_database, monkeypatch):  # noqa: F811
    engine, config = legacy_database
    _prepare(engine, config)
    before = _snapshot(engine)
    monkeypatch.setenv("LEGACY_TIMESTAMP_TZ", "UTC'; DROP TABLE agent; --")
    with pytest.raises(RuntimeError, match="Invalid LEGACY_TIMESTAMP_TZ"):
        command.upgrade(config, "head")
    assert _snapshot(engine) == before
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "mas_metadata_0009"
    monkeypatch.setenv("LEGACY_TIMESTAMP_TZ", "UTC")
    command.upgrade(config, "head")
    upgraded = _snapshot(engine)
    monkeypatch.setenv("LEGACY_TIMESTAMP_TZ", "invalid/zone")
    with pytest.raises(RuntimeError, match="Invalid LEGACY_TIMESTAMP_TZ"):
        command.downgrade(config, "mas_metadata_0009")
    assert _snapshot(engine) == upgraded


def test_offline_rejected_before_utc_ddl(legacy_database):  # noqa: F811
    _, config = legacy_database
    stream = StringIO()
    config.output_buffer = stream
    with pytest.raises(RuntimeError, match="requires a live PostgreSQL"):
        command.upgrade(config, "mas_metadata_0009:head", sql=True)
    assert "ALTER COLUMN" not in stream.getvalue()


def test_connection_hook_preserves_search_path_and_autocommit(legacy_database):  # noqa: F811
    engine, _ = legacy_database
    dedicated = sa.create_engine(engine.url)
    configure_utc(dedicated)
    try:
        with dedicated.connect() as connection:
            assert connection.scalar(sa.text("SHOW TimeZone")) == "UTC"
            assert connection.scalar(sa.text("SHOW search_path")).startswith("agent_migration_")
            assert not connection.connection.driver_connection.autocommit
            assert connection.scalar(sa.text("SELECT pg_typeof(CURRENT_TIMESTAMP)::text")) == "timestamp with time zone"
    finally:
        dedicated.dispose()
