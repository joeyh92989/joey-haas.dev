"""add the physical catalogue

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-25

Five tables for E7c, created empty: catalogue_games, physical_editions,
store_listings, catalogue_matches, catalogue_runs. Additive: four new types,
nothing existing changes. physical_format and format_source, owned by 0003,
are reused as they are and never altered or dropped here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: the new types are created and dropped explicitly, for the
# reason 0002 gives, and the two reused ones must never be created or dropped
# by a create_table here.
release_precision = postgresql.ENUM(
    "day", "month", "quarter", "year", name="release_precision", create_type=False
)
listing_availability = postgresql.ENUM(
    "preorder",
    "in_stock",
    "sold_out",
    "archived",
    name="listing_availability",
    create_type=False,
)
match_confidence = postgresql.ENUM(
    "exact",
    "probable",
    "uncertain",
    "manual",
    name="match_confidence",
    create_type=False,
)
match_decision = postgresql.ENUM(
    "auto", "manual", "ignored", "pending", name="match_decision", create_type=False
)
NEW_TYPES = (release_precision, listing_availability, match_confidence, match_decision)

# Owned by 0003.
physical_format = postgresql.ENUM(name="physical_format", create_type=False)
format_source = postgresql.ENUM(name="format_source", create_type=False)


def _seen_at(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _game_link() -> sa.Column:
    return sa.Column(
        "igdb_id",
        sa.Integer(),
        sa.ForeignKey("catalogue_games.igdb_id", ondelete="SET NULL"),
        nullable=True,
    )


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in NEW_TYPES:
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "catalogue_games",
        sa.Column("igdb_id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("hypes", sa.Integer(), nullable=True),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        _seen_at("fetched_at"),
    )

    op.create_table(
        "physical_editions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("source_ref", sa.Text(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_normalized", sa.String(500), nullable=False),
        sa.Column("platform_id", sa.SmallInteger(), nullable=False),
        sa.Column("platform", sa.String(60), nullable=False),
        sa.Column("region", sa.String(4), nullable=False),
        sa.Column("is_physical", sa.Boolean(), nullable=True),
        sa.Column("physical_format", physical_format, nullable=True),
        sa.Column("format_source", format_source, nullable=True),
        sa.Column("cart_id", sa.String(20), nullable=True),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("editions", sa.Text(), nullable=True),
        sa.Column("ns1_compatible", sa.Boolean(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("release_precision", release_precision, nullable=True),
        _game_link(),
        _seen_at("first_seen_at"),
        _seen_at("last_seen_at"),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source", "source_ref", name="ux_physical_editions_source"),
    )
    op.create_index(
        "ix_physical_editions_igdb_platform",
        "physical_editions",
        ["igdb_id", "platform_id"],
    )
    op.create_index(
        "ix_physical_editions_live_platform_region",
        "physical_editions",
        ["platform_id", "region"],
        postgresql_where=sa.text("retired_at IS NULL"),
    )

    op.create_table(
        "store_listings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("store", sa.String(40), nullable=False),
        sa.Column("store_product_id", sa.String(40), nullable=False),
        sa.Column("variant_id", sa.String(40), nullable=False),
        sa.Column("handle", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("region", sa.String(4), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_normalized", sa.String(500), nullable=False),
        sa.Column("edition_label", sa.String(100), nullable=True),
        sa.Column("platform_id", sa.SmallInteger(), nullable=True),
        sa.Column("platform", sa.String(60), nullable=True),
        sa.Column("is_game", sa.Boolean(), nullable=False),
        sa.Column(
            "collections_seen",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("price", sa.Numeric(8, 2), nullable=True),
        sa.Column("currency", sa.CHAR(3), nullable=False),
        sa.Column("availability", listing_availability, nullable=False),
        sa.Column("preorder_closes_at", sa.Date(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("release_precision", release_precision, nullable=True),
        sa.Column("release_text", sa.Text(), nullable=True),
        sa.Column("format_hint", physical_format, nullable=True),
        sa.Column("format_tier", format_source, nullable=True),
        sa.Column("format_evidence", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        _game_link(),
        sa.Column(
            "raw",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        _seen_at("first_seen_at"),
        _seen_at("last_seen_at"),
        _seen_at("updated_at"),
        sa.UniqueConstraint("store", "variant_id", name="ux_store_listings_variant"),
    )
    op.create_index(
        "ix_store_listings_igdb_platform",
        "store_listings",
        ["igdb_id", "platform_id"],
    )
    op.create_index(
        "ix_store_listings_store_availability",
        "store_listings",
        ["store", "availability"],
    )

    op.create_table(
        "catalogue_matches",
        sa.Column("title_normalized", sa.String(500), primary_key=True),
        sa.Column(
            "platform_id", sa.SmallInteger(), primary_key=True, autoincrement=False
        ),
        sa.Column("igdb_id", sa.Integer(), nullable=True),
        sa.Column("match_confidence", match_confidence, nullable=True),
        sa.Column("decided_by", match_decision, nullable=False),
        sa.Column("candidates", postgresql.JSONB(), nullable=True),
        _seen_at("decided_at"),
    )

    op.create_table(
        "catalogue_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(40), nullable=False),
        _seen_at("started_at"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=True),
        *(
            sa.Column(name, sa.Integer(), nullable=False, server_default="0")
            for name in (
                "rows_seen",
                "rows_changed",
                "rows_retired",
                "items_synced",
                "unresolved_remaining",
            )
        ),
        sa.Column("short_run", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "errors",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_index(
        "ix_catalogue_runs_source_started",
        "catalogue_runs",
        ["source", sa.text("started_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_catalogue_runs_source_started", table_name="catalogue_runs")
    op.drop_table("catalogue_runs")
    op.drop_table("catalogue_matches")
    op.drop_index("ix_store_listings_store_availability", table_name="store_listings")
    op.drop_index("ix_store_listings_igdb_platform", table_name="store_listings")
    op.drop_table("store_listings")
    op.drop_index(
        "ix_physical_editions_live_platform_region", table_name="physical_editions"
    )
    op.drop_index("ix_physical_editions_igdb_platform", table_name="physical_editions")
    op.drop_table("physical_editions")
    # Children first: catalogue_games is referenced by both tables above.
    op.drop_table("catalogue_games")
    bind = op.get_bind()
    for enum_type in reversed(NEW_TYPES):
        enum_type.drop(bind, checkfirst=True)
