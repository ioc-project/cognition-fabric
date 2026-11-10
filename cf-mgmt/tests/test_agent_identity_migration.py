# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Test the complete Alembic lineage and agent key cutover on real Postgres."""

from pathlib import Path
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.util.exc import CommandError
from sqlalchemy.orm import Session

from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.agent import Agent
from server.database.relational_db.models.cognition_engine import CognitionEngine
from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode
from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem
from server.database.relational_db.models.workspace import Workspace


@pytest.fixture
def legacy_database(monkeypatch):
    """An independent schema, upgraded through the real legacy revisions."""
    root_engine = RelationalDB().engine
    schema = "agent_migration_" + uuid4().hex
    with root_engine.begin() as connection:
        connection.execute(sa.schema.CreateSchema(schema))
    url = root_engine.url.set(query={"options": f"-csearch_path={schema}"})
    monkeypatch.setenv("ALEMBIC_DB_URL", url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    engine = sa.create_engine(url)
    try:
        command.upgrade(config, "0007")
        with engine.begin() as connection:
            connection.execute(
                CognitionFabricNode.__table__.insert().values(
                    id="legacy-cfn",
                    name="Legacy CFN",
                    config_version=19,
                    config={
                        "config_version": 19,
                        "workspaces": [
                            {
                                "multi_agentic_systems": [
                                    {
                                        "id": "mas-a",
                                        "last_updated_on": "2026-10-20T11:12:13",
                                        "cognition_engines": [{"id": "ce-a"}],
                                    }
                                ]
                            }
                        ],
                    },
                )
            )
            connection.execute(
                Workspace.__table__.insert().values(id="workspace-a", name="Legacy", cfn_id="legacy-cfn")
            )
            connection.execute(
                MultiAgenticSystem.__table__.insert(),
                [
                    {"id": "mas-a", "workspace_id": "workspace-a", "name": "Legacy A"},
                    {"id": "mas-b", "workspace_id": "workspace-a", "name": "Legacy B"},
                ],
            )
            connection.execute(
                CognitionEngine.__table__.insert().values(
                    id="ce-a",
                    cfn_id="legacy-cfn",
                    name="Legacy CE",
                    version="1.0",
                    ce_type="CASA",
                    enforcing_url="ce:50051",
                    enforcing_endpoint="/Evaluate",
                    enforcing_protocol="grpc",
                    health_url="http://ce:8080",
                    health_endpoint="/healthz",
                    registration_token=str(uuid4()),
                )
            )
            connection.execute(
                MasCognitionEngine.__table__.insert().values(
                    mas_id="mas-a",
                    ce_id="ce-a",
                    mas_config={"opaque": ["preserved", 7]},
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO agent (agent_id, mas_id, name, description, config, identity_type, "
                    "identity_identifiers, created_at, updated_at) VALUES "
                    "('legacy-client-id', 'mas-a', NULL, 'Legacy description', "
                    '\'{"opaque": {"values": [1, "two"]}}\', '
                    "'openclaw', '{\"url\": \"main::agents::legacy\"}', '2026-10-01 09:00:00', '2026-10-02 10:00:00'), "
                    "('12345678-1234-4234-8234-123456789abc', 'mas-a', 'Generated legacy ID', NULL, NULL, NULL, NULL, "
                    "'2026-10-03 11:00:00', '2026-10-04 12:00:00')"
                )
            )
        yield engine, config
    finally:
        engine.dispose()
        with root_engine.begin() as connection:
            connection.execute(sa.schema.DropSchema(schema, cascade=True))


def _state(engine):
    with engine.connect() as connection:
        return {
            table: [
                dict(row) for row in connection.execute(sa.text(f'SELECT * FROM "{table}" ORDER BY {order}')).mappings()
            ]
            for table, order in (
                ("agent", "agent_id"),
                ("multi_agentic_system", "id"),
                ("cognition_engine", "id"),
                ("mas_cognition_engines", "mas_id, ce_id"),
                ("cognition_fabric_node", "id"),
            )
        }


def test_backfill_preserves_runtime_ids_data_associations_and_config(legacy_database):
    engine, config = legacy_database
    before = _state(engine)
    command.upgrade(config, "agent_identity_0008")
    after = _state(engine)
    mappings = {row["agent_id"]: str(row["cf_agent_id"]) for row in after["agent"]}
    assert len(set(mappings.values())) == 2
    assert all(UUID(value).version == 4 for value in mappings.values())
    for row in after["agent"]:
        row.pop("cf_agent_id")
    assert after == before

    with engine.connect() as connection:
        inspector = sa.inspect(connection)
        assert inspector.get_pk_constraint("agent")["constrained_columns"] == ["cf_agent_id"]
        assert any(c["column_names"] == ["mas_id", "agent_id"] for c in inspector.get_unique_constraints("agent"))
        assert any(i["name"] == "uq_agent_mas_name" for i in inspector.get_indexes("agent"))
    command.upgrade(config, "agent_identity_0008")
    assert {row["agent_id"]: str(row["cf_agent_id"]) for row in _state(engine)["agent"]} == mappings
    command.upgrade(config, "head")
    with Session(engine) as session:
        assert session.get(Agent, mappings["legacy-client-id"]).agent_id == "legacy-client-id"


def test_migrated_constraints_scope_runtime_ids_and_preserve_name_rules(legacy_database):
    engine, config = legacy_database
    command.upgrade(config, "agent_identity_0008")
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO agent (agent_id, mas_id) VALUES ('legacy-client-id', 'mas-b')"))
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as connection:
            connection.execute(sa.text("INSERT INTO agent (agent_id, mas_id) VALUES ('legacy-client-id', 'mas-a')"))
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO agent (agent_id, mas_id, name) VALUES ('another-id', 'mas-a', 'Generated legacy ID')"
                )
            )
    with engine.begin() as connection:
        connection.execute(
            sa.text("INSERT INTO agent (agent_id, mas_id, name) VALUES ('another-id', 'mas-b', 'Generated legacy ID')")
        )


def test_downgrade_refuses_cross_mas_duplicates_without_partial_changes(legacy_database):
    engine, config = legacy_database
    command.upgrade(config, "agent_identity_0008")
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO agent (agent_id, mas_id) VALUES ('legacy-client-id', 'mas-b')"))
    before = _state(engine)
    with pytest.raises(RuntimeError, match="same runtime ID exists in multiple MAS"):
        command.downgrade(config, "0007")
    assert _state(engine) == before
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "agent_identity_0008"
        assert sa.inspect(connection).get_pk_constraint("agent")["constrained_columns"] == ["cf_agent_id"]


def test_explicit_downgrade_restores_legacy_schema_when_ids_are_globally_unique(legacy_database):
    engine, config = legacy_database
    before = _state(engine)
    command.upgrade(config, "agent_identity_0008")
    command.downgrade(config, "0007")
    assert _state(engine) == before
    with engine.connect() as connection:
        assert sa.inspect(connection).get_pk_constraint("agent")["constrained_columns"] == ["agent_id"]
        assert "cf_agent_id" not in {c["name"] for c in sa.inspect(connection).get_columns("agent")}


def test_upgrade_reports_external_runtime_id_foreign_keys_before_mutation(legacy_database):
    engine, config = legacy_database
    with engine.begin() as connection:
        connection.execute(
            sa.text("CREATE TABLE external_agent_ref (agent_id varchar(255) REFERENCES agent(agent_id))")
        )
        connection.execute(sa.text("INSERT INTO external_agent_ref VALUES ('legacy-client-id')"))
    before = _state(engine)
    with pytest.raises(RuntimeError, match="foreign keys reference agent.agent_id"):
        command.upgrade(config, "agent_identity_0008")
    assert _state(engine) == before
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "0007"
        assert "cf_agent_id" not in {c["name"] for c in sa.inspect(connection).get_columns("agent")}
        assert connection.scalar(sa.text("SELECT agent_id FROM external_agent_ref")) == "legacy-client-id"


def test_downgrade_reports_references_to_new_storage_identity(legacy_database):
    engine, config = legacy_database
    command.upgrade(config, "agent_identity_0008")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE cf_agent_ref (id uuid REFERENCES agent(cf_agent_id))"))
        connection.execute(sa.text("INSERT INTO cf_agent_ref SELECT cf_agent_id FROM agent LIMIT 1"))
    before = _state(engine)
    with pytest.raises(RuntimeError, match="foreign keys reference agent.cf_agent_id"):
        command.downgrade(config, "0007")
    assert _state(engine) == before
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "agent_identity_0008"


def test_historical_0008_marker_is_not_accepted_as_new_revision_prefix(legacy_database):
    engine, config = legacy_database
    with engine.begin() as connection:
        connection.execute(sa.text("UPDATE alembic_version SET version_num = '0008'"))
    before = _state(engine)
    with pytest.raises(CommandError, match="Can't locate revision identified by '0008'"):
        command.upgrade(config, "agent_identity_0008")
    assert _state(engine) == before
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "0008"
        assert "cf_agent_id" not in {c["name"] for c in sa.inspect(connection).get_columns("agent")}
