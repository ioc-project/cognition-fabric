# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Exercise the ownership migration against legacy rows in the isolated test database."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations

from server.database.relational_db.db import RelationalDB
from server.services.cognition_engine import cognition_engine_service
from tests.test_cognition_engines import _create_mas, _get_ce, _register, _set_ce


def _migrate_legacy_rows():
    path = Path(__file__).parents[1] / "alembic/versions/0007_ce_registration_ownership.py"
    spec = importlib.util.spec_from_file_location("ownership_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with RelationalDB().engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.downgrade()
        assert "registration_token" not in {
            column["name"] for column in sa.inspect(connection).get_columns("cognition_engine")
        }
        migration.upgrade()


@pytest.mark.parametrize(
    "first_enabled,second_enabled,owner",
    [(True, True, None), (False, True, "new"), (True, False, "old"), (False, False, None)],
    ids=["multiple-enabled", "old-disabled", "new-disabled", "all-disabled"],
)
def test_migration_preserves_unique_and_sole_enabled_owners(
    client, registered_cfn, created_workspace, first_enabled, second_enabled, owner
):
    first = _register(client, registered_cfn, name="old")
    second = _register(client, registered_cfn, name="new")
    unique = _register(client, registered_cfn, name="unique")
    for ce_id, enabled in ((first, first_enabled), (second, second_enabled)):
        if not enabled:
            assert client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False}).status_code == 200
    mas_id = _create_mas(client, created_workspace, "migration-mas")
    for ce_id in (first, second):
        response = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert response.status_code == 201
    initial = client.get(f"/api/cognition-fabric-nodes/{registered_cfn}").json()
    _set_ce(second, health_url="http://old:8080", enforcing_url="old:50051")
    _migrate_legacy_rows()

    winner = {"old": first, "new": second}.get(owner)
    expected_targets = {unique} | ({winner} if winner else set())
    for ce_id in (first, second):
        assert (_get_ce(ce_id)["registration_token"] is not None) == (ce_id == winner)
        assert _get_ce(ce_id)["status"] == ("online" if ce_id == winner else "offline")
    assert {target.ce_id for target in cognition_engine_service.list_probe_targets()} == expected_targets

    assert _get_ce(unique)["status"] == "online"
    migrated = client.get(f"/api/cognition-fabric-nodes/{registered_cfn}").json()
    reported_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]
    assert reported_version == initial["config"]["config_version"] + 1
    assert migrated["config"]["config_version"] == reported_version
    statuses = {ce["id"]: ce["status"] for ce in migrated["config"]["cognition_engines"]}
    assert statuses == {
        first: "online" if winner == first else "offline",
        second: "online" if winner == second else "offline",
        unique: "online",
    }
    embedded = migrated["config"]["workspaces"][0]["multi_agentic_systems"][0]["cognition_engines"]
    assert {ce["id"]: ce["status"] for ce in embedded} == {first: statuses[first], second: statuses[second]}

    response = client.patch(
        f"/api/cognition-engines/{second}?reconnect=true",
        json={"health_url": "http://old:8080", "enforcing_url": "old:50051"},
    )
    assert response.status_code == 200
    assert {target.ce_id for target in cognition_engine_service.list_probe_targets()} == (
        {unique, second} if second_enabled else {unique}
    )


def test_disabled_bridge_does_not_make_independent_enabled_endpoints_ambiguous(client, registered_cfn):
    first = _register(client, registered_cfn, name="first")
    bridge = _register(client, registered_cfn, name="bridge")
    last = _register(client, registered_cfn, name="last")
    assert client.patch(f"/api/cognition-engines/{bridge}", json={"enabled": False}).status_code == 200
    # The disabled record overlaps first's health and last's enforcing endpoint.
    _set_ce(bridge, health_url="http://first:8080", enforcing_url="last:50051")
    _migrate_legacy_rows()
    assert {target.ce_id for target in cognition_engine_service.list_probe_targets()} == {first, last}
    assert _get_ce(bridge)["registration_token"] is None
    assert _get_ce(bridge)["status"] == "offline"
