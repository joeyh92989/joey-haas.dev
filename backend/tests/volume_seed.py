"""Seeding a comic the way production holds one: owned `ed-*` volumes.

The comic readers count owned volumes' ranges. `seed_volumes` gives a comic the
volumes that migration 0021 (and the retired compat shim) made from an edition
list: one `ed-<from>-<to>` volume per entry (`-2`, `-3`... on a repeated range),
owned and unread, with the one `migrated` collects entry linked to the row.
Not a test module (no `test_` prefix), so pytest does not collect it.
"""

import uuid

from comics import volume_kind_from_edition
from models import ComicVolume, ComicVolumeCollect, Item, ItemType


def _slugs(editions: list[dict]) -> list[str]:
    seen: dict[str, int] = {}
    slugs = []
    for edition in editions:
        base = f"ed-{edition.get('from')}-{edition.get('to')}"
        seen[base] = seen.get(base, 0) + 1
        slugs.append(base if seen[base] == 1 else f"{base}-{seen[base]}")
    return slugs


async def seed_volumes(
    session, item: Item, editions: list[dict] | None
) -> list[ComicVolume]:
    """Adds an owned, unread volume per edition-shaped dict (`kind`, `label`,
    `from`, `to`, optional `cv_id`, `cover_url`, `large_url`, `description`) to
    `item`, flushing first (the row needs its id) and after. Does not commit."""
    if item.type != ItemType.COMIC or not editions:
        return []
    await session.flush()
    out = []
    for position, (slug, edition) in enumerate(
        zip(_slugs(editions), editions, strict=True)
    ):
        raw = edition.get("kind") or None
        low, high = edition.get("from"), edition.get("to")
        description = edition.get("description")
        if isinstance(description, list):
            description = "\n\n".join(description)
        volume = ComicVolume(
            id=uuid.uuid4(),
            item_id=item.id,
            slug=slug,
            position=position,
            label=edition.get("label") or item.title,
            kind=volume_kind_from_edition(raw),
            kind_raw=raw,
            description=description or None,
            cover_url=edition.get("cover_url"),
            large_url=edition.get("large_url"),
            cv_id=edition.get("cv_id"),
            owned=True,
            read=False,
        )
        session.add(volume)
        await session.flush()
        session.add(
            ComicVolumeCollect(
                id=uuid.uuid4(),
                volume_id=volume.id,
                position=0,
                source="migrated",
                series_name=item.title,
                issue_text=f"#{low}" if low == high else f"#{low}-{high}",
                item_id=item.id,
                from_number=low,
                to_number=high,
            )
        )
        out.append(volume)
    await session.flush()
    return out


def make_item(fields: dict) -> Item:
    """An `Item(**fields)` whose `editions` entry (edition-shaped dicts) is
    kept aside, not written to the retired column: `seed_row_volumes` turns it
    into owned volumes once the row is in the session."""
    fields = dict(fields)
    editions = fields.pop("editions", None)
    item = Item(**fields)
    item.seed_editions = editions
    return item


async def seed_row_volumes(session, *rows: object) -> None:
    """`seed_volumes` for each `make_item` row that kept editions aside."""
    await session.flush()
    for item in rows:
        if isinstance(item, Item):
            await seed_volumes(session, item, getattr(item, "seed_editions", None))
