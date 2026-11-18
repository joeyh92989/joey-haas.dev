"""Seeding a comic the way production holds one: `items.editions` and the
`ed-*` volumes the compat shim mirrors from it.

The comic readers count owned volumes' ranges, not the `editions` column, so a
test row that sets `editions` directly also needs its volumes. Not a test
module (no `test_` prefix), so pytest does not collect it.
"""

from comics import sync_volumes_from_editions
from models import Item, ItemType


async def mirror_editions(session, *rows: object) -> None:
    """Gives each comic with `editions` its `ed-*` volumes (the shim's own
    code), flushing first; rows that are not comics are skipped. Does not commit."""
    await session.flush()
    for item in rows:
        if isinstance(item, Item) and item.type == ItemType.COMIC and item.editions:
            await sync_volumes_from_editions(session, item)
