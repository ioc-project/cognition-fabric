"""consolidated schema

Revision ID: 0001
Revises:
Create Date: 2026-01-28 00:00:01
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE "cognition_fabric_node" (
      "id" character varying(255) NOT NULL,
      "name" character varying(255) NOT NULL,
      "cfn_config" jsonb NULL,
      "config" jsonb NULL,
      "ip_address" character varying(45) NULL,
      "port" character varying(5) NULL,
      "status" character varying(50) NOT NULL DEFAULT 'online',
      "last_seen" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "enabled" boolean NOT NULL DEFAULT true,
      "config_version" integer NOT NULL DEFAULT 0,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by" character varying(255) NULL,
      "updated_by" character varying(255) NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id")
    );
    COMMENT ON COLUMN "cognition_fabric_node"."ip_address" IS 'IP address of the CFN node (IPv4 or IPv6)';
    COMMENT ON COLUMN "cognition_fabric_node"."port" IS 'Port number of the CFN node (1-65535)';
    CREATE INDEX "idx_cfn_enabled" ON "cognition_fabric_node" ("enabled");
    CREATE INDEX "idx_cfn_deleted_at" ON "cognition_fabric_node" ("deleted_at");
    CREATE INDEX "idx_cfn_last_seen" ON "cognition_fabric_node" ("last_seen");
    CREATE INDEX "idx_cfn_status" ON "cognition_fabric_node" ("status");
    CREATE UNIQUE INDEX "idx_cfn_name_unique" ON "cognition_fabric_node" ("name") WHERE "deleted_at" IS NULL;

    CREATE TABLE "user" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "username" character varying(360) NOT NULL,
      "password" character varying(360) NOT NULL,
      "domain" character varying(360) NOT NULL,
      "role" character varying(200) NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id")
    );
    CREATE INDEX "idx_user_deleted_at" ON "user" ("deleted_at");
    CREATE UNIQUE INDEX "idx_user_username_unique" ON "user" ("username") WHERE "deleted_at" IS NULL;

    CREATE TABLE "workspace" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "name" character varying(255) NOT NULL,
      "cfn_id" character varying(255) NULL,
      "users" character varying[] NULL,
      "config" jsonb NULL,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by" character varying(255) NULL,
      "updated_by" character varying(255) NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id"),
      CONSTRAINT "fk_workspace_cfn" FOREIGN KEY ("cfn_id") REFERENCES "cognition_fabric_node" ("id") ON DELETE RESTRICT
    );
    CREATE INDEX "idx_workspace_name" ON "workspace" ("name");
    CREATE INDEX "idx_workspace_deleted_at" ON "workspace" ("deleted_at");
    CREATE INDEX "idx_workspace_cfn_id" ON "workspace" ("cfn_id");

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

    CREATE TABLE "multi_agentic_system" (
      "id" character varying(36) NOT NULL DEFAULT (gen_random_uuid())::text,
      "workspace_id" character varying(36) NOT NULL,
      "name" character varying(255) NOT NULL,
      "description" text NULL,
      "agents" jsonb NULL,
      "config" jsonb NULL,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by" character varying(255) NULL,
      "updated_by" character varying(255) NULL,
      "deleted_at" timestamp NULL,
      PRIMARY KEY ("id"),
      CONSTRAINT "fk_multi_agentic_system_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
    );
    CREATE INDEX "idx_mas_workspace_id" ON "multi_agentic_system" ("workspace_id");
    CREATE INDEX "idx_mas_deleted_at" ON "multi_agentic_system" ("deleted_at");
    CREATE UNIQUE INDEX "idx_mas_workspace_name_unique" ON "multi_agentic_system" ("workspace_id", "name") WHERE "deleted_at" IS NULL;

    CREATE TABLE "agent" (
      "agent_id" character varying(255) NOT NULL,
      "mas_id" character varying(36) NOT NULL,
      "name" character varying(255) NULL,
      "url" text NULL,
      "identity_type" character varying(50) NULL,
      "identity_identifiers" jsonb NULL,
      "config" jsonb NULL,
      "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by" character varying(255) NULL,
      "updated_by" character varying(255) NULL,
      PRIMARY KEY ("agent_id"),
      CONSTRAINT "fk_agent_mas" FOREIGN KEY ("mas_id") REFERENCES "multi_agentic_system" ("id") ON DELETE CASCADE
    );
    CREATE INDEX "idx_agent_mas_id" ON "agent" ("mas_id");
    CREATE INDEX "idx_agent_identity_type" ON "agent" ("identity_type");
    CREATE UNIQUE INDEX "uq_agent_mas_name" ON "agent" ("mas_id", "name") WHERE "name" IS NOT NULL;

    CREATE TABLE "cognition_engine" (
      "id" character varying(255) NOT NULL,
      "cfn_id" character varying(255) NOT NULL,
      "ce_type" character varying(20) NOT NULL,
      "base_url" character varying(512) NOT NULL,
      "endpoint" character varying(255) NOT NULL,
      "status" character varying(20) NOT NULL DEFAULT 'offline',
      "enabled" boolean NOT NULL DEFAULT true,
      "mas_auto_associate" boolean NOT NULL DEFAULT false,
      "last_seen" timestamptz NULL,
      "mas_config" jsonb NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz NULL,
      "created_by" character varying(36) NULL,
      "updated_by" character varying(36) NULL,
      "deleted_at" timestamptz NULL,
      PRIMARY KEY ("id"),
      CONSTRAINT "fk_ce_cfn" FOREIGN KEY ("cfn_id") REFERENCES "cognition_fabric_node" ("id")
    );
    CREATE INDEX "idx_ce_cfn_id" ON "cognition_engine" ("cfn_id");
    CREATE INDEX "idx_ce_status" ON "cognition_engine" ("status");
    CREATE INDEX "idx_ce_enabled" ON "cognition_engine" ("enabled");
    CREATE INDEX "idx_ce_mas_auto_associate" ON "cognition_engine" ("mas_auto_associate");

    CREATE TABLE "mas_cognition_engines" (
      "mas_id" character varying(36) NOT NULL REFERENCES "multi_agentic_system" ("id") ON DELETE CASCADE,
      "ce_id" character varying(255) NOT NULL REFERENCES "cognition_engine" ("id") ON DELETE CASCADE,
      "mas_config" jsonb NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "created_by" character varying(255) NULL,
      CONSTRAINT "pk_mas_cognition_engines" PRIMARY KEY ("mas_id", "ce_id")
    );
    CREATE INDEX "idx_mas_ce_ce_id" ON "mas_cognition_engines" ("ce_id");

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


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "policy" CASCADE')
    op.execute('DROP TABLE IF EXISTS "mas_cognition_engines" CASCADE')
    op.execute('DROP TABLE IF EXISTS "cognition_engine" CASCADE')
    op.execute('DROP TABLE IF EXISTS "agent" CASCADE')
    op.execute('DROP TABLE IF EXISTS "multi_agentic_system" CASCADE')
    op.execute('DROP TABLE IF EXISTS "workspace_invitation" CASCADE')
    op.execute('DROP TABLE IF EXISTS "workspace_member" CASCADE')
    op.execute('DROP TABLE IF EXISTS "api_key" CASCADE')
    op.execute('DROP TABLE IF EXISTS "workspace" CASCADE')
    op.execute('DROP TABLE IF EXISTS "user" CASCADE')
    op.execute('DROP TABLE IF EXISTS "cognition_fabric_node" CASCADE')
