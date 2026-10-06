"""add recommendations

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-27

One table for E8c Radar, shared with E8b Discover (parent spec §7.2):
suggestions of either kind, what the owner decided about each, and the data
the admin page shows. Additive: three new types, created empty; item_type,
physical_format and format_source are reused as they are and never altered
or dropped here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: the new types are created and dropped explicitly, as in
# 0005, and the reused ones must never be created or dropped by a create_table.
recommendation_kind = postgresql.ENUM(
    "discover", "radar", name="recommendation_kind", create_type=False
)
reason_source = postgresql.ENUM(
    "model", "template", name="reason_source", create_type=False
)
recommendation_status = postgresql.ENUM(
    "pending",
    "wanted",
    "dismissed",
    "owned",
    "skipped",
    name="recommendation_status",
    create_type=False,
)
NEW_TYPES = (recommendation_kind, reason_source, recommendation_status)

# Owned by earlier revisions.
item_type = postgresql.ENUM(name="item_type", create_type=False)
physical_format = postgresql.ENUM(name="physical_format", create_type=False)
format_source = postgresql.ENUM(name="format_source", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in NEW_TYPES:
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", recommendation_kind, nullable=False),
        sa.Column("type", item_type, nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("external_source", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(50), nullable=False),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reason_source", reason_source, nullable=False),
        sa.Column(
            "based_on",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("status", recommendation_status, nullable=False),
        sa.Column("platform_id", sa.SmallInteger(), nullable=False),
        sa.Column("platform", sa.String(60), nullable=True),
        sa.Column("physical_format", physical_format, nullable=True),
        sa.Column("format_source", format_source, nullable=True),
        sa.Column("format_note", sa.Text(), nullable=True),
        sa.Column(
            "listing_ids",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "source_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.UniqueConstraint(
            "kind",
            "external_source",
            "external_id",
            "platform_id",
            name="ux_recommendations_game",
        ),
    )
    op.create_index(
        "ix_recommendations_kind_status", "recommendations", ["kind", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_recommendations_kind_status", table_name="recommendations")
    op.drop_table("recommendations")
    bind = op.get_bind()
    for enum_type in reversed(NEW_TYPES):
        enum_type.drop(bind, checkfirst=True)
