# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Remove memory provider feature

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-21 00:00:00

Changes:
  - Drop agent.agentic_memory_provider_id (FK fk_agent_memory_provider, index idx_agent_agentic_memory)
  - Drop multi_agentic_system.shared_memory_provider_id (FK fk_mas_shared_memory_provider,
    index idx_mas_shared_memory_provider_id)
  - Drop the memory_provider table
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE agent DROP CONSTRAINT IF EXISTS fk_agent_memory_provider")
    op.execute("DROP INDEX IF EXISTS idx_agent_agentic_memory")
    op.execute("ALTER TABLE agent DROP COLUMN IF EXISTS agentic_memory_provider_id")

    op.execute("ALTER TABLE multi_agentic_system DROP CONSTRAINT IF EXISTS fk_mas_shared_memory_provider")
    op.execute("DROP INDEX IF EXISTS idx_mas_shared_memory_provider_id")
    op.execute("ALTER TABLE multi_agentic_system DROP COLUMN IF EXISTS shared_memory_provider_id")

    op.execute("DROP TABLE IF EXISTS memory_provider")


def downgrade() -> None:
    op.execute(
        """
        CREATE TABLE memory_provider (
          "id" character varying(255) NOT NULL,
          "name" character varying(255) NOT NULL,
          "description" character varying(1000) NULL,
          "config" jsonb NULL,
          "enabled" boolean NOT NULL DEFAULT true,
          "created_at" timestamp NOT NULL,
          "updated_at" timestamp NULL,
          "created_by" character varying(36) NOT NULL,
          "updated_by" character varying(36) NULL,
          "deleted_at" timestamp NULL,
          PRIMARY KEY ("id")
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX idx_mp_name_unique ON memory_provider (name) WHERE deleted_at IS NULL")

    op.execute("ALTER TABLE multi_agentic_system ADD COLUMN shared_memory_provider_id VARCHAR(255)")
    op.execute(
        "ALTER TABLE multi_agentic_system ADD CONSTRAINT fk_mas_shared_memory_provider "
        "FOREIGN KEY (shared_memory_provider_id) REFERENCES memory_provider(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX idx_mas_shared_memory_provider_id ON multi_agentic_system(shared_memory_provider_id)")

    op.execute("ALTER TABLE agent ADD COLUMN agentic_memory_provider_id VARCHAR(255)")
    op.execute(
        "ALTER TABLE agent ADD CONSTRAINT fk_agent_memory_provider "
        "FOREIGN KEY (agentic_memory_provider_id) REFERENCES memory_provider(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX idx_agent_agentic_memory ON agent(agentic_memory_provider_id)")
