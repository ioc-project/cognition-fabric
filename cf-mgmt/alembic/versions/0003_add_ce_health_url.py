"""add health_url to cognition_engine

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13 00:00:01
"""

from typing import Sequence, Union
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing engines predate health probing and have no health_url. They get an empty value,
    # which cfn-svc reports as unhealthy until the CE re-registers (its PATCH after a 409 sets it).
    op.execute("""ALTER TABLE "cognition_engine" ADD COLUMN "health_url" character varying(512) NOT NULL DEFAULT ''""")
    op.execute("""ALTER TABLE "cognition_engine" ALTER COLUMN "health_url" DROP DEFAULT""")


def downgrade() -> None:
    op.execute('ALTER TABLE "cognition_engine" DROP COLUMN "health_url"')
