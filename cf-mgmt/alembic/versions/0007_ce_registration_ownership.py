"""Track CE endpoint ownership and fence probe results across reconnects.

Revision ID: 0007
Revises: 0006
"""

from collections import defaultdict
import json
from urllib.parse import urlsplit
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


# Frozen endpoint normalization; historical migrations do not import application code.
def _endpoint_keys(engine) -> set[tuple]:
    """Compare declared endpoints, without resolving DNS aliases or merging different services."""
    address = engine.health_url.rstrip("/") + engine.health_endpoint
    try:
        health = urlsplit(address)
        port = health.port if health.port is not None else (443 if health.scheme == "https" else 80)
        keys = {
            ("health", health.scheme.lower(), (health.hostname or "").lower(), port, health.path or "/", health.query)
        }
    except ValueError:
        # Legacy malformed endpoints must not prevent another CE from registering.
        keys = {("health_raw", address)}
    if engine.enforcing_url and engine.enforcing_endpoint:
        address = engine.enforcing_url
        try:
            enforcing = urlsplit(address if "://" in address else "//" + address)
            keys.add(("enforcing", (enforcing.hostname or "").lower(), enforcing.port, engine.enforcing_endpoint))
        except ValueError:
            keys.add(("enforcing_raw", address, engine.enforcing_endpoint))
    return keys


def upgrade() -> None:
    op.add_column("cognition_engine", sa.Column("registration_token", sa.String(36), nullable=True))
    connection = op.get_bind()
    engines = connection.execute(sa.text("SELECT * FROM cognition_engine WHERE deleted_at IS NULL")).all()
    owners = defaultdict(set)
    enabled_owners = defaultdict(set)
    for engine in engines:
        for key in _endpoint_keys(engine):
            owners[(engine.cfn_id, key)].add(engine.id)
            if engine.enabled:
                enabled_owners[(engine.cfn_id, key)].add(engine.id)
    retired = set().union(*(ids for ids in enabled_owners.values() if len(ids) > 1))
    retired.update(
        engine.id
        for engine in engines
        if not engine.enabled and any(len(owners[(engine.cfn_id, key)]) > 1 for key in _endpoint_keys(engine))
    )
    for engine in engines:
        # Preserve a sole enabled candidate, including when an old competitor was disabled.
        # Multiple enabled candidates cannot be disambiguated from legacy history.
        connection.execute(
            sa.text("UPDATE cognition_engine SET registration_token = :token, status = :status WHERE id = :id"),
            {
                "id": engine.id,
                "token": None if engine.id in retired else str(uuid4()),
                "status": "offline" if engine.id in retired else engine.status,
            },
        )

    # CFN heartbeats read the persisted snapshot/version, rather than regenerating it.
    # Retire old registrations in both snapshot locations and notify already-running CFNs.
    for cfn_id in {engine.cfn_id for engine in engines if engine.id in retired}:
        cfn = connection.execute(
            sa.text("SELECT config, config_version FROM cognition_fabric_node WHERE id = :id"), {"id": cfn_id}
        ).one()
        version = (cfn.config_version or 0) + 1
        config = cfn.config
        if isinstance(config, dict):
            groups = [config.get("cognition_engines", [])]
            groups.extend(
                mas.get("cognition_engines", [])
                for workspace in config.get("workspaces", [])
                for mas in workspace.get("multi_agentic_systems", [])
            )
            for group in groups:
                for engine in group:
                    if engine.get("id") in retired:
                        engine["status"] = "offline"
            config["config_version"] = version
        connection.execute(
            sa.text(
                "UPDATE cognition_fabric_node SET config = CAST(:config AS jsonb), "
                "config_version = :version WHERE id = :id"
            ),
            {"id": cfn_id, "version": version, "config": json.dumps(config) if config is not None else None},
        )


def downgrade() -> None:
    op.drop_column("cognition_engine", "registration_token")
