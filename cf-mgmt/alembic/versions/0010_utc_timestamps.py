# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Store CF-owned instants as timestamptz.

Revision ID: utc_timestamps_0010
Revises: mas_metadata_0009
"""

import os

from alembic import context, op
import sqlalchemy as sa

revision = "utc_timestamps_0010"
down_revision = "mas_metadata_0009"
branch_labels = None
depends_on = None

COLUMNS = {
    "agent": ("created_at", "updated_at"),
    "mcp_server": ("created_at", "updated_at"),
    "mcp_tool": ("created_at", "updated_at"),
    "multi_agentic_system": ("created_at", "updated_at", "deleted_at"),
    "workspace": ("created_at", "updated_at", "deleted_at"),
    "user": ("created_at", "updated_at", "deleted_at"),
    "cognition_fabric_node": ("last_seen", "created_at", "updated_at", "deleted_at"),
}


def _convert(aware):
    if context.is_offline_mode():
        raise RuntimeError(
            "utc_timestamps_0010 requires a live PostgreSQL database to validate LEGACY_TIMESTAMP_TZ; "
            "offline --sql is unsupported. Use a disposable database for migration review."
        )
    zone = os.environ.get("LEGACY_TIMESTAMP_TZ", "").strip() or "UTC"
    connection = op.get_bind()
    if not connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = :zone)"), {"zone": zone}
    ):
        raise RuntimeError(f"Invalid LEGACY_TIMESTAMP_TZ: {zone!r}; use a PostgreSQL timezone name, e.g. UTC")
    # The validated zone is still quoted as a SQL literal; never interpolate raw environment values.
    literal = sa.literal(zone).compile(dialect=connection.dialect, compile_kwargs={"literal_binds": True})
    for table, columns in COLUMNS.items():
        for column in columns:
            op.alter_column(
                table, column, type_=sa.DateTime(timezone=aware), postgresql_using=f'"{column}" AT TIME ZONE {literal}'
            )


def upgrade():
    _convert(True)


def downgrade():
    # Wall times lose offset/DST-fold information. Exact restoration requires a backup.
    _convert(False)
