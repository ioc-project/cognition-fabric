# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Simplify CE schema: ce_type + base_url + endpoint

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-13 00:00:00

Changes:
  - Add ce_type column (CASA or DETECTIVE)
  - Add endpoint column (API path for request forwarding)
  - Rename url to base_url
  - Remove kinds_subkinds, subprotocols, category, name, version, auth, capabilities, metrics, config columns
  - Migrate existing data: category GAT -> CASA, COG -> DETECTIVE
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns
    op.add_column("cognition_engine", sa.Column("ce_type", sa.String(20), nullable=True))
    op.add_column("cognition_engine", sa.Column("endpoint", sa.String(255), nullable=True))

    # Migrate existing data:
    # - category GAT -> ce_type CASA
    # - category COG/UNKNOWN -> ce_type DETECTIVE
    # - endpoint defaults to /api/l9/enforcement for CASA, /api/l9/detective for DETECTIVE
    op.execute(
        """
        UPDATE cognition_engine
        SET ce_type = CASE
            WHEN category = 'GAT' THEN 'CASA'
            ELSE 'DETECTIVE'
        END,
        endpoint = CASE
            WHEN category = 'GAT' THEN '/api/l9/enforcement'
            ELSE '/api/l9/detective'
        END
        """
    )

    # Make ce_type and endpoint NOT NULL after migration
    op.alter_column("cognition_engine", "ce_type", existing_type=sa.String(20), nullable=False)
    op.alter_column("cognition_engine", "endpoint", existing_type=sa.String(255), nullable=False)

    # Rename url to base_url
    op.alter_column("cognition_engine", "url", new_column_name="base_url")

    # Drop old columns
    op.drop_column("cognition_engine", "name")
    op.drop_column("cognition_engine", "kinds_subkinds")
    op.drop_column("cognition_engine", "subprotocols")
    op.drop_column("cognition_engine", "category")
    op.drop_column("cognition_engine", "version")
    op.drop_column("cognition_engine", "auth")
    op.drop_column("cognition_engine", "capabilities")
    op.drop_column("cognition_engine", "metrics")
    op.drop_column("cognition_engine", "config")


def downgrade() -> None:
    # Add back old columns
    op.add_column("cognition_engine", sa.Column("name", sa.String(255), nullable=True))
    op.add_column("cognition_engine", sa.Column("kinds_subkinds", sa.dialects.postgresql.JSONB, nullable=True))
    op.add_column("cognition_engine", sa.Column("subprotocols", sa.dialects.postgresql.JSONB, nullable=True))
    op.add_column("cognition_engine", sa.Column("category", sa.String(20), nullable=True))
    op.add_column("cognition_engine", sa.Column("version", sa.String(50), nullable=True))
    op.add_column("cognition_engine", sa.Column("auth", sa.dialects.postgresql.JSONB, nullable=True))
    op.add_column("cognition_engine", sa.Column("capabilities", sa.dialects.postgresql.JSONB, nullable=True))
    op.add_column("cognition_engine", sa.Column("metrics", sa.dialects.postgresql.JSONB, nullable=True))
    op.add_column("cognition_engine", sa.Column("config", sa.dialects.postgresql.JSONB, nullable=True))

    # Rename base_url back to url
    op.alter_column("cognition_engine", "base_url", new_column_name="url")

    # Migrate ce_type back to category and name
    op.execute(
        """
        UPDATE cognition_engine
        SET category = CASE
            WHEN ce_type = 'CASA' THEN 'GAT'
            ELSE 'COG'
        END,
        name = ce_type,
        kinds_subkinds = '{}'::jsonb,
        subprotocols = '[]'::jsonb,
        version = '1.0.0'
        """
    )

    # Make columns NOT NULL
    op.alter_column("cognition_engine", "name", existing_type=sa.String(255), nullable=False)
    op.alter_column("cognition_engine", "kinds_subkinds", nullable=False)
    op.alter_column("cognition_engine", "category", existing_type=sa.String(20), nullable=False)
    op.alter_column("cognition_engine", "version", existing_type=sa.String(50), nullable=False)

    # Drop new columns
    op.drop_column("cognition_engine", "ce_type")
    op.drop_column("cognition_engine", "endpoint")
