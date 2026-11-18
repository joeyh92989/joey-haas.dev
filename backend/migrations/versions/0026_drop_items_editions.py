"""drop items.editions

Revision ID: 0026
Revises: 0025
Create Date: 2026-11-18

DESTRUCTIVE: drops the column `items.editions` (JSONB, added by 0010). Retire
plan docs/planning/2026-11-18-retire-items-editions-design.md, PR 5b of 5 (5a,
#454, unmapped the column first, so no running code names it when this drops it).

Why it is safe: since #446-#451 nothing reads or writes the column. Every
comic book is a `comic_volumes` row (0021 copied each `editions` entry into a
volume plus one collects row), and the API, intake, the public pages and the
admin tools all use volumes. The production audit before this release found 12
comic rows and 4 `editions` entries, all mirrored by 4 `ed-*` volumes.

Restore step: take a Neon restore point (point-in-time) before this migration
runs, per backend/migrations/README.md "Restore". The restore point is the
only way to get the original column contents back exactly.

Downgrade re-adds the column as nullable JSONB (the type 0010 created) and
rebuilds it from the OWNED `ed-*` volumes: per item, one entry per volume in
position order, `kind` = the volume's `kind_raw` (else the mapped kind,
capitalised), `label` = the volume's label, `from` / `to` = the numbers of its
first collects row. Entries the old shape also carried (`description`,
`cv_id`, covers) are not rebuilt, and a volume added after the upgrade comes
back as an entry too. Items with no such volume stay NULL. This is an honest
approximation, not a byte-exact restore.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("items", "editions")


def downgrade() -> None:
    op.add_column("items", sa.Column("editions", postgresql.JSONB(), nullable=True))
    op.execute(
        "UPDATE items SET editions = built.entries FROM ("
        "SELECT v.item_id, jsonb_agg(jsonb_build_object("
        "'kind', COALESCE(v.kind_raw, initcap(v.kind)), "
        "'label', v.label, 'from', c.from_number, 'to', c.to_number"
        ") ORDER BY v.position) AS entries "
        "FROM comic_volumes v LEFT JOIN LATERAL ("
        "SELECT from_number, to_number FROM comic_volume_collects "
        "WHERE volume_id = v.id ORDER BY position LIMIT 1) c ON true "
        "WHERE v.slug LIKE 'ed-%' AND v.owned GROUP BY v.item_id"
        ") built WHERE items.id = built.item_id"
    )
