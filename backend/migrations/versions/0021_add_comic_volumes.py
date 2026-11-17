"""add comic volumes and collects

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-17

Comics, book-first (docs/planning/2026-11-17-comics-book-first-design.md, epic
#323, stories #324 and #325). A title stays an `items` row. A book of a title
is a `comic_volumes` row (its own cover, format, ISBN, pages, line number,
owned and read), and what a book contains is `comic_volume_collects` rows: a
series name plus issue text as written, optionally linked to a synced run.

The backfill copies every entry of `items.editions` into one volume plus one
collects row (series_name = the title, source 'migrated', linked to the item).
Counts are equal before and after. `kind_raw` keeps the original free text;
`kind` maps Trade / Hardcover / Omnibus (any case) and everything else to
'trade'. The slug is the one `comics.edition_slugs` builds, so old
`/shelf/<id>/ed-<from>-<to>/` URLs keep resolving.

Additive: two new tables. `items.editions` is not touched (a later, destructive
release drops it). Downgrade drops both tables, so the next upgrade copies
again from the untouched column.

The backfill is plain SQL through the migration's connection and imports
nothing from the app, so a later change to `comics.py` cannot change what this
revision did.
"""

import json
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = ("trade", "hardcover", "omnibus", "compendium", "ogn")
MAPPED = {"trade", "hardcover", "omnibus"}
SOURCES = ("migrated", "typed", "parsed", "photo")
SMALLINT_MAX = 32767


def _uuid_pk() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True)


def _in_list(column: str, values: Sequence[str]) -> str:
    return f"{column} IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.create_table(
        "comic_volumes",
        _uuid_pk(),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("kind_raw", sa.Text(), nullable=True),
        sa.Column("line_number", sa.SmallInteger(), nullable=True),
        sa.Column("isbn", sa.Text(), nullable=True),
        sa.Column("pages", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("large_url", sa.Text(), nullable=True),
        sa.Column("cv_id", sa.Integer(), nullable=True),
        sa.Column("owned", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("read", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("item_id", "slug", name="comic_volumes_item_slug"),
        sa.CheckConstraint(_in_list("kind", KINDS), name="comic_volumes_kind"),
    )
    op.create_index(
        "ix_comic_volumes_item_position", "comic_volumes", ["item_id", "position"]
    )
    op.create_table(
        "comic_volume_collects",
        _uuid_pk(),
        sa.Column("volume_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("series_name", sa.Text(), nullable=False),
        sa.Column("issue_text", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("from_number", sa.SmallInteger(), nullable=True),
        sa.Column("to_number", sa.SmallInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["volume_id"], ["comic_volumes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            _in_list("source", SOURCES), name="comic_volume_collects_source"
        ),
    )
    op.create_index(
        "ix_comic_volume_collects_volume_position",
        "comic_volume_collects",
        ["volume_id", "position"],
    )
    op.create_index(
        "ix_comic_volume_collects_item", "comic_volume_collects", ["item_id"]
    )
    _backfill(op.get_bind())


def downgrade() -> None:
    op.drop_table("comic_volume_collects")
    op.drop_table("comic_volumes")


def _number(value: object) -> int | None:
    """An edition bound as a smallint, or None when it is not a whole number
    the column can hold (validate_editions never stored one, but a hand-edited
    row might hold anything)."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 <= value <= SMALLINT_MAX else None


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _backfill(connection: sa.engine.Connection) -> None:
    volumes = sa.text(
        "INSERT INTO comic_volumes (id, item_id, position, slug, label, kind, "
        "kind_raw, description, cover_url, large_url, cv_id, owned, read) "
        "VALUES (CAST(:id AS uuid), CAST(:item_id AS uuid), :position, :slug, "
        ":label, :kind, :kind_raw, :description, :cover_url, :large_url, :cv_id, "
        "true, false)"
    )
    collects = sa.text(
        "INSERT INTO comic_volume_collects (id, volume_id, position, series_name, "
        "issue_text, source, item_id, from_number, to_number) "
        "VALUES (CAST(:id AS uuid), CAST(:volume_id AS uuid), 0, :series_name, "
        ":issue_text, 'migrated', CAST(:item_id AS uuid), :from_number, :to_number)"
    )
    rows = connection.execute(
        sa.text(
            "SELECT id, title, editions FROM items "
            "WHERE editions IS NOT NULL AND jsonb_typeof(editions) = 'array' "
            "AND jsonb_array_length(editions) > 0 ORDER BY id"
        )
    ).all()
    for item_id, title, editions in rows:
        if isinstance(editions, str):
            editions = json.loads(editions)
        seen: dict[str, int] = {}
        for position, raw in enumerate(editions):
            edition = raw if isinstance(raw, dict) else {}
            # The slug rule of comics.edition_slugs, inlined on purpose:
            # `ed-<from>-<to>`, then -2, -3... on a repeated range.
            base = f"ed-{edition.get('from')}-{edition.get('to')}"
            seen[base] = seen.get(base, 0) + 1
            slug = base if seen[base] == 1 else f"{base}-{seen[base]}"
            kind_raw = edition.get("kind")
            kind_raw = kind_raw if isinstance(kind_raw, str) and kind_raw else None
            mapped = (kind_raw or "").strip().lower()
            kind = mapped if mapped in MAPPED else "trade"
            low, high = _number(edition.get("from")), _number(edition.get("to"))
            if low is None or high is None:
                low = high = None
                issue_text = _text(edition.get("label")) or title
            elif low == high:
                issue_text = f"#{low}"
            else:
                issue_text = f"#{low}-{high}"
            description = edition.get("description")
            if isinstance(description, list):
                description = "\n\n".join(p for p in description if isinstance(p, str))
            description = description if isinstance(description, str) else None
            cv_id = edition.get("cv_id")
            volume_id = uuid.uuid4()
            connection.execute(
                volumes,
                {
                    "id": str(volume_id),
                    "item_id": str(item_id),
                    "position": position,
                    "slug": slug,
                    "label": _text(edition.get("label")) or title,
                    "kind": kind,
                    "kind_raw": kind_raw,
                    "description": description or None,
                    "cover_url": _text(edition.get("cover_url")),
                    "large_url": _text(edition.get("large_url")),
                    "cv_id": cv_id
                    if isinstance(cv_id, int)
                    and not isinstance(cv_id, bool)
                    and cv_id <= 2147483647
                    else None,
                },
            )
            connection.execute(
                collects,
                {
                    "id": str(uuid.uuid4()),
                    "volume_id": str(volume_id),
                    "series_name": title,
                    "issue_text": issue_text,
                    "item_id": str(item_id),
                    "from_number": low,
                    "to_number": high,
                },
            )
