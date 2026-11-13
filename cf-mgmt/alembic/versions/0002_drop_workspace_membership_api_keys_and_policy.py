# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""drop workspace_member, workspace_invitation, api_key, and policy tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-12 00:00:01
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "workspace_invitation" CASCADE')
    op.execute('DROP TABLE IF EXISTS "workspace_member" CASCADE')
    op.execute('DROP TABLE IF EXISTS "api_key" CASCADE')
    op.execute('DROP TABLE IF EXISTS "policy" CASCADE')


def downgrade() -> None:
    op.execute("""
    CREATE TABLE "api_key" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "user_id" character varying(36) NOT NULL,
      "key_hash" character varying(256) NOT NULL,
      "key_preview" character varying(20) NOT NULL,
      "name" character varying(200) NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id")
    );
    CREATE INDEX "idx_api_key_user_id" ON "api_key" ("user_id");
    CREATE INDEX "idx_api_key_deleted_at" ON "api_key" ("deleted_at");
    CREATE INDEX "idx_api_key_key_hash" ON "api_key" ("key_hash");
    CREATE UNIQUE INDEX "idx_api_key_user_name_unique" ON "api_key" ("user_id", "name") WHERE "deleted_at" IS NULL;

    CREATE TABLE "workspace_member" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "workspace_id" character varying(36) NOT NULL,
      "user_id" character varying(36) NOT NULL,
      "role" character varying(50) NOT NULL,
      "joined_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by" character varying(255) NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id"),
      CONSTRAINT "fk_workspace_member_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id"),
      CONSTRAINT "fk_workspace_member_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id")
    );
    CREATE UNIQUE INDEX "idx_workspace_member_unique" ON "workspace_member" ("workspace_id", "user_id") WHERE "deleted_at" IS NULL;
    CREATE INDEX "idx_workspace_member_workspace_id" ON "workspace_member" ("workspace_id");
    CREATE INDEX "idx_workspace_member_user_id" ON "workspace_member" ("user_id");
    CREATE INDEX "idx_workspace_member_deleted_at" ON "workspace_member" ("deleted_at");

    CREATE TABLE "workspace_invitation" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "workspace_id" character varying(36) NOT NULL,
      "inviter_id" character varying(36) NOT NULL,
      "invitee_username" character varying(360) NOT NULL,
      "role" character varying(50) NOT NULL,
      "status" character varying(50) NOT NULL DEFAULT 'pending',
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" timestamp NOT NULL,
      "responded_at" timestamp NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id"),
      CONSTRAINT "fk_workspace_invitation_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id"),
      CONSTRAINT "fk_workspace_invitation_inviter" FOREIGN KEY ("inviter_id") REFERENCES "user" ("id")
    );
    CREATE INDEX "idx_workspace_invitation_workspace_id" ON "workspace_invitation" ("workspace_id");
    CREATE INDEX "idx_workspace_invitation_invitee_username" ON "workspace_invitation" ("invitee_username");
    CREATE INDEX "idx_workspace_invitation_status" ON "workspace_invitation" ("status");
    CREATE INDEX "idx_workspace_invitation_expires_at" ON "workspace_invitation" ("expires_at");
    CREATE INDEX "idx_workspace_invitation_deleted_at" ON "workspace_invitation" ("deleted_at");

    CREATE TABLE "policy" (
      "id" character varying(36) NOT NULL,
      "workspace_id" character varying(36) NOT NULL,
      "name" character varying(255) NOT NULL,
      "config" jsonb NULL,
      "enabled" boolean NOT NULL DEFAULT true,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL,
      "created_by" character varying(36) NOT NULL,
      "updated_by" character varying(36) NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id")
    );
    CREATE INDEX "idx_policy_workspace_id" ON "policy" ("workspace_id");
    CREATE INDEX "idx_policy_deleted_at" ON "policy" ("deleted_at");
    """)
