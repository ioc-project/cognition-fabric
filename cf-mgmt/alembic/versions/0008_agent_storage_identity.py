"""Separate CF agent storage identity from MAS-scoped runtime identifiers.

Revision ID: agent_identity_0008
Revises: 0007

Stop old Management writers before applying this key cutover. Runtime IDs and
all timestamps/config snapshots are preserved; no config regeneration is needed.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "agent_identity_0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _check_referencing_foreign_keys(connection, column: str) -> None:
    references = connection.execute(
        sa.text(
            "SELECT conrelid::regclass::text AS table_name, conname "
            "FROM pg_constraint "
            "WHERE contype = 'f' AND confrelid = 'agent'::regclass "
            "AND (SELECT attnum FROM pg_attribute "
            "     WHERE attrelid = 'agent'::regclass AND attname = :column) = ANY(confkey)"
        ),
        {"column": column},
    ).all()
    if references:
        names = ", ".join(f"{row.table_name}.{row.conname}" for row in references)
        raise RuntimeError(
            f"Agent identity cutover cannot replace the key while foreign keys reference agent.{column}: {names}. "
            "Migrate these references explicitly before retrying; no records have been removed."
        )


def upgrade() -> None:
    connection = op.get_bind()
    _check_referencing_foreign_keys(connection, "agent_id")
    primary_key = sa.inspect(connection).get_pk_constraint("agent")["name"]

    # Expand/backfill before replacing the key, within Alembic's transaction.
    # gen_random_uuid is built into the supported PostgreSQL versions.
    op.add_column("agent", sa.Column("cf_agent_id", postgresql.UUID(as_uuid=False), nullable=True))
    connection.execute(sa.text("UPDATE agent SET cf_agent_id = gen_random_uuid()"))
    op.alter_column("agent", "cf_agent_id", nullable=False, server_default=sa.text("gen_random_uuid()"))
    op.create_unique_constraint("uq_agent_mas_agent_id", "agent", ["mas_id", "agent_id"])
    op.drop_constraint(primary_key, "agent", type_="primary")
    op.create_primary_key(primary_key, "agent", ["cf_agent_id"])


def downgrade() -> None:
    connection = op.get_bind()
    duplicate = connection.execute(
        sa.text("SELECT agent_id FROM agent GROUP BY agent_id HAVING count(*) > 1 LIMIT 1")
    ).first()
    if duplicate:
        raise RuntimeError(
            "Cannot restore globally unique agent_id: the same runtime ID exists in multiple MAS records "
            f"({duplicate.agent_id!r}). Reconcile those records deliberately before downgrading; "
            "no IDs have been renamed or deleted."
        )
    _check_referencing_foreign_keys(connection, "cf_agent_id")
    primary_key = sa.inspect(connection).get_pk_constraint("agent")["name"]
    op.drop_constraint(primary_key, "agent", type_="primary")
    op.create_primary_key(primary_key, "agent", ["agent_id"])
    op.drop_constraint("uq_agent_mas_agent_id", "agent", type_="unique")
    op.drop_column("agent", "cf_agent_id")
