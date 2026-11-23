"""items.slug: readable item URLs

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-23

Additive (#479; docs/planning/2026-11-23-readable-item-urls-design.md).
Adds `items.slug` (text, nullable) and the partial unique index `ux_items_slug`
(`WHERE slug IS NOT NULL`), then fills the new column for every existing row
with `item_slugs.backfill`, oldest row first, so the oldest of a set of
same-titled items keeps the bare slug and the rest get a short id suffix. No
existing column or value changes.

The generator is imported, not copied, so a new item and a backfilled one get
the same slug. `item_slugs` has no app imports, so this stays runnable by
alembic alone.

Downgrade drops the index and the column. Slugs are not preserved; a later
upgrade regenerates them.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import item_slugs

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BATCH = 500


def upgrade() -> None:
    op.add_column("items", sa.Column("slug", sa.Text(), nullable=True))
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, title, type::text FROM items ORDER BY created_at, id")
    ).all()
    slugs = item_slugs.backfill((row[0], row[1], row[2]) for row in rows)
    update = sa.text("UPDATE items SET slug = :slug WHERE id = :id")
    pairs = [{"id": item_id, "slug": slug} for item_id, slug in slugs.items()]
    for start in range(0, len(pairs), BATCH):
        connection.execute(update, pairs[start : start + BATCH])
    op.create_index(
        "ux_items_slug",
        "items",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("slug IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_items_slug", table_name="items")
    op.drop_column("items", "slug")
