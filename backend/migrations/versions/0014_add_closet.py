"""add closet

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-09

Closet (docs/planning/2026-11-09-outfit-design.md): the owner's garments
(`garments`) with one downscaled WebP each (`garment_images`, kept apart so
no list query loads the bytes), the outfits worn (`outfits`,
`outfit_garments`) and a row per garment per day worn (`wears`), the stored
day plans (`outfit_plans`, keyed day x occasion x bike), the one-row
profile (`closet_profile`), the cull's outcomes (`garment_decisions`), and
one key/value table for the jobs' run summaries (`closet_settings`, the
`spot_settings` shape).

Every table arrives here although only `garments`, `garment_images`,
`closet_profile` and `closet_settings` are written by the PR that ships it:
one Neon apply for the whole stack, as 0013 did for Denver spots.

Additive: nine new tables and five new types, created empty. Nothing
existing is altered, renamed or dropped, so the code before this revision
boots against it and the deploy order (migrate, then merge) holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0005 and 0013.
garment_category = postgresql.ENUM(
    "outer",
    "mid",
    "top",
    "bottom",
    "shoes",
    "accessory",
    name="garment_category",
    create_type=False,
)
garment_status = postgresql.ENUM(
    "untagged",
    "active",
    "packed",
    "listed",
    "gone",
    name="garment_status",
    create_type=False,
)
outfit_source = postgresql.ENUM(
    "planned",
    "swapped",
    "alternative",
    "own",
    name="outfit_source",
    create_type=False,
)
garment_tag_source = postgresql.ENUM(
    "model", "manual", name="garment_tag_source", create_type=False
)
garment_outcome = postgresql.ENUM(
    "kept",
    "packed",
    "listed",
    "sold",
    "donated",
    name="garment_outcome",
    create_type=False,
)
TYPES = (
    garment_category,
    garment_status,
    outfit_source,
    garment_tag_source,
    garment_outcome,
)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True)


def _now(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _jsonb(name: str, empty: str) -> sa.Column:
    return sa.Column(
        name,
        postgresql.JSONB(),
        nullable=False,
        server_default=sa.text(f"'{empty}'::jsonb"),
    )


def _garment_fk(name: str = "garment_id", **kwargs) -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("garments.id", ondelete="CASCADE"),
        nullable=False,
        **kwargs,
    )


def upgrade() -> None:
    for enum_type in TYPES:
        enum_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "garments",
        _uuid_pk(),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("category", garment_category, nullable=True),
        sa.Column("subtype", sa.String(60), nullable=True),
        sa.Column("brand", sa.String(80), nullable=True),
        sa.Column("primary_color", sa.String(40), nullable=True),
        sa.Column("primary_hex", sa.String(7), nullable=True),
        sa.Column("secondary_color", sa.String(40), nullable=True),
        sa.Column("secondary_hex", sa.String(7), nullable=True),
        sa.Column("pattern", sa.String(40), nullable=True),
        sa.Column("material", sa.String(60), nullable=True),
        sa.Column("warmth", sa.SmallInteger(), nullable=True),
        sa.Column("formality", sa.SmallInteger(), nullable=True),
        _jsonb("seasons", "[]"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("acquired_on", sa.Date(), nullable=True),
        sa.Column(
            "status",
            garment_status,
            nullable=False,
            server_default=sa.text("'untagged'"),
        ),
        sa.Column("back_on", sa.Date(), nullable=True),
        sa.Column("tag_source", garment_tag_source, nullable=True),
        sa.Column(
            "tag_attempts", sa.SmallInteger(), nullable=False, server_default="0"
        ),
        _now("created_at"),
        _now("updated_at"),
        sa.CheckConstraint(
            "warmth IS NULL OR warmth BETWEEN 1 AND 5", name="garments_warmth_range"
        ),
        sa.CheckConstraint(
            "formality IS NULL OR formality BETWEEN 1 AND 5",
            name="garments_formality_range",
        ),
    )
    op.create_index("ix_garments_status_created", "garments", ["status", "created_at"])

    op.create_table(
        "garment_images",
        _garment_fk(primary_key=True),
        sa.Column("webp", sa.LargeBinary(), nullable=False),
        sa.Column("width", sa.SmallInteger(), nullable=False),
        sa.Column("height", sa.SmallInteger(), nullable=False),
        _now("created_at"),
    )

    op.create_table(
        "outfits",
        _uuid_pk(),
        sa.Column("worn_on", sa.Date(), nullable=False),
        sa.Column("occasion", sa.String(20), nullable=False),
        sa.Column("bike", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", outfit_source, nullable=False),
        sa.Column("not_this", sa.String(40), nullable=True),
        _now("created_at"),
    )
    op.create_index("ix_outfits_worn_on", "outfits", ["worn_on"])

    op.create_table(
        "outfit_garments",
        sa.Column(
            "outfit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("outfits.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        _garment_fk(primary_key=True),
        sa.Column("slot", garment_category, nullable=False),
    )

    op.create_table(
        "wears",
        _uuid_pk(),
        _garment_fk(),
        sa.Column("worn_on", sa.Date(), nullable=False),
        sa.Column(
            "outfit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("outfits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _now("created_at"),
        sa.UniqueConstraint("garment_id", "worn_on", name="ux_wears_garment_day"),
    )

    op.create_table(
        "outfit_plans",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("occasion", sa.String(20), primary_key=True),
        sa.Column("bike", sa.Boolean(), primary_key=True),
        sa.Column("body", postgresql.JSONB(), nullable=False),
        _now("planned_at"),
    )

    op.create_table(
        "closet_profile",
        sa.Column("id", sa.SmallInteger(), primary_key=True, autoincrement=False),
        _jsonb("sizes", "{}"),
        _jsonb("coloring", "{}"),
        sa.Column("build_fit", sa.Text(), nullable=True),
        _jsonb("style_words", "[]"),
        _jsonb("dislikes", "[]"),
        _jsonb("weekly_occasions", "[]"),
        _jsonb("weekly_bike", "[]"),
        sa.Column(
            "spring_turn",
            sa.String(5),
            nullable=False,
            server_default=sa.text("'04-25'"),
        ),
        sa.Column(
            "autumn_turn",
            sa.String(5),
            nullable=False,
            server_default=sa.text("'10-25'"),
        ),
        sa.Column(
            "repeat_top_days", sa.SmallInteger(), nullable=False, server_default="5"
        ),
        sa.Column(
            "repeat_outfit_weeks",
            sa.SmallInteger(),
            nullable=False,
            server_default="3",
        ),
        sa.Column("tag_budget", sa.SmallInteger(), nullable=False, server_default="5"),
        _now("updated_at"),
        sa.CheckConstraint("id = 1", name="closet_profile_single_row"),
    )

    op.create_table(
        "garment_decisions",
        _uuid_pk(),
        _garment_fk(),
        sa.Column("outcome", garment_outcome, nullable=False),
        sa.Column("decided_on", sa.Date(), nullable=False),
        sa.Column("back_on", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        _now("created_at"),
    )
    op.create_index(
        "ix_garment_decisions_garment",
        "garment_decisions",
        ["garment_id", "decided_on"],
    )

    op.create_table(
        "closet_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        _now("updated_at"),
    )


def downgrade() -> None:
    op.drop_table("closet_settings")
    op.drop_index("ix_garment_decisions_garment", table_name="garment_decisions")
    op.drop_table("garment_decisions")
    op.drop_table("closet_profile")
    op.drop_table("outfit_plans")
    op.drop_table("wears")
    op.drop_table("outfit_garments")
    op.drop_index("ix_outfits_worn_on", table_name="outfits")
    op.drop_table("outfits")
    op.drop_table("garment_images")
    op.drop_index("ix_garments_status_created", table_name="garments")
    op.drop_table("garments")
    for enum_type in reversed(TYPES):
        enum_type.drop(op.get_bind(), checkfirst=True)
