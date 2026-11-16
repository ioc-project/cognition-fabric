# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Add optional MAS onboarding snapshots without backfilling existing records."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "mas_metadata_0009"
down_revision = "agent_identity_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("multi_agentic_system", sa.Column("metadata_schema_version", sa.Text(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("tag", sa.Text(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("version", sa.Text(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("mas_metadata", JSONB(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("documentation", JSONB(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("runtime_tools", JSONB(), nullable=True))
    op.add_column("multi_agentic_system", sa.Column("topologies", JSONB(), nullable=True))
    op.add_column("agent", sa.Column("agent_descriptions", JSONB(), nullable=True))
    op.add_column("agent", sa.Column("agent_metadata", JSONB(), nullable=True))
    op.add_column("mcp_tool", sa.Column("definition", JSONB(), nullable=True))
    op.add_column("mcp_tool", sa.Column("source_snapshot", JSONB(), nullable=True))
    op.add_column("mcp_tool", sa.Column("provenance", JSONB(), nullable=True))
    op.add_column("mcp_tool", sa.Column("protocol_version", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("mcp_tool", "protocol_version")
    op.drop_column("mcp_tool", "provenance")
    op.drop_column("mcp_tool", "source_snapshot")
    op.drop_column("mcp_tool", "definition")
    op.drop_column("agent", "agent_metadata")
    op.drop_column("agent", "agent_descriptions")
    op.drop_column("multi_agentic_system", "topologies")
    op.drop_column("multi_agentic_system", "runtime_tools")
    op.drop_column("multi_agentic_system", "documentation")
    op.drop_column("multi_agentic_system", "mas_metadata")
    op.drop_column("multi_agentic_system", "version")
    op.drop_column("multi_agentic_system", "tag")
    op.drop_column("multi_agentic_system", "metadata_schema_version")
