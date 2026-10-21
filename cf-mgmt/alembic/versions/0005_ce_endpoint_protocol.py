"""per-purpose url/endpoint/protocol on cognition_engine

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-21 00:00:01
"""

from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('ALTER TABLE "cognition_engine" RENAME COLUMN "base_url" TO "enforcing_url"')
    op.execute('ALTER TABLE "cognition_engine" RENAME COLUMN "endpoint" TO "enforcing_endpoint"')
    op.execute('ALTER TABLE "cognition_engine" ALTER COLUMN "enforcing_endpoint" DROP NOT NULL')
    # Existing engines all use the transports CFN had hardcoded, so the defaults describe them correctly.
    op.execute("""ALTER TABLE "cognition_engine" ADD COLUMN "enforcing_protocol" character varying(10) NOT NULL DEFAULT 'grpc'""")
    op.execute('ALTER TABLE "cognition_engine" ADD COLUMN "health_endpoint" character varying(255)')
    op.execute("""ALTER TABLE "cognition_engine" ADD COLUMN "health_protocol" character varying(10) NOT NULL DEFAULT 'http'""")
    op.execute("""ALTER TABLE "cognition_engine" ADD COLUMN "notification_protocol" character varying(10) NOT NULL DEFAULT 'http'""")
    for col in ("enforcing_protocol", "health_protocol", "notification_protocol"):
        op.execute(f'ALTER TABLE "cognition_engine" ALTER COLUMN "{col}" DROP DEFAULT')


def downgrade() -> None:
    for col in ("notification_protocol", "health_protocol", "health_endpoint", "enforcing_protocol"):
        op.execute(f'ALTER TABLE "cognition_engine" DROP COLUMN "{col}"')
    op.execute("""UPDATE "cognition_engine" SET "enforcing_endpoint" = '' WHERE "enforcing_endpoint" IS NULL""")
    op.execute('ALTER TABLE "cognition_engine" ALTER COLUMN "enforcing_endpoint" SET NOT NULL')
    op.execute('ALTER TABLE "cognition_engine" RENAME COLUMN "enforcing_endpoint" TO "endpoint"')
    op.execute('ALTER TABLE "cognition_engine" RENAME COLUMN "enforcing_url" TO "base_url"')
