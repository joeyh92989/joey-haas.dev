"""add garment products

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-16

Closet products (docs/planning/2026-11-16-closet-products-design.md, D1):
a garment records the store's own colour wording (`color_name`), who set it
(`color_source`) and its size, and a side table `garment_products` holds
where it was bought (one row per garment, kept apart as `garment_images` is
so list queries never load the snapshot). `primary_color` stays the colour
family.

Additive: three nullable columns, one new table and two new types. Older
code ignores them, so the deploy order (migrate, then merge) holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0014.
garment_color_source = postgresql.ENUM(
    "vendor", "manual", "model", name="garment_color_source", create_type=False
)
garment_product_source = postgresql.ENUM(
    "stitchfix",
    "nordstromrack",
    "marinelayer",
    "duer",
    "link",
    "manual",
    name="garment_product_source",
    create_type=False,
)
TYPES = (garment_color_source, garment_product_source)


def upgrade() -> None:
    for enum_type in TYPES:
        enum_type.create(op.get_bind(), checkfirst=True)

    op.add_column("garments", sa.Column("color_name", sa.String(80), nullable=True))
    op.add_column(
        "garments", sa.Column("color_source", garment_color_source, nullable=True)
    )
    op.add_column("garments", sa.Column("size", sa.String(40), nullable=True))

    op.create_table(
        "garment_products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "garment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("garments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("source", garment_product_source, nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("order_ref", sa.String(80), nullable=True),
        sa.Column("store_item_no", sa.String(80), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(8, 2), nullable=True),
        sa.Column("snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("garment_products")
    op.drop_column("garments", "size")
    op.drop_column("garments", "color_source")
    op.drop_column("garments", "color_name")
    for enum_type in reversed(TYPES):
        enum_type.drop(op.get_bind(), checkfirst=True)
