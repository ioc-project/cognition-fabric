"""Add notification fields to cognition_engine

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-12 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    # Add notification_url and notification_endpoint columns to cognition_engine table
    op.add_column('cognition_engine', sa.Column('notification_url', sa.String(length=512), nullable=True))
    op.add_column('cognition_engine', sa.Column('notification_endpoint', sa.String(length=255), nullable=True))


def downgrade():
    # Remove notification columns
    op.drop_column('cognition_engine', 'notification_endpoint')
    op.drop_column('cognition_engine', 'notification_url')
