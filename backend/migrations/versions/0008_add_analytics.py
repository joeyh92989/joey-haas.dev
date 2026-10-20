"""add analytics

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-19

First-party page analytics: `page_views`, one raw row per beacon (kept 90
days), and `daily_stats`, the nightly rollup per day and dimension. Neither
holds an IP address or a user agent; a visitor is a daily-salted hash.
Additive: two new tables, nothing existing changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "page_views",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("referrer_host", sa.Text(), nullable=True),
        sa.Column("device", sa.Text(), nullable=False),
        sa.Column("visitor_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "device IN ('desktop', 'phone', 'tablet')", name="page_views_device_known"
        ),
    )
    op.create_index("ix_page_views_day", "page_views", ["day"])
    op.create_table(
        "daily_stats",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("dimension", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("views", sa.Integer(), nullable=False),
        sa.Column("visitors", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("day", "dimension", "value"),
        sa.CheckConstraint(
            "dimension IN ('total', 'path', 'referrer', 'device')",
            name="daily_stats_dimension_known",
        ),
    )


def downgrade() -> None:
    op.drop_table("daily_stats")
    op.drop_index("ix_page_views_day", table_name="page_views")
    op.drop_table("page_views")
