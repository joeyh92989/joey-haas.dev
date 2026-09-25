"""Registry formats onto owned Switch 2 items, and the disagreements.

After every successful registry run, each owned Switch 2 game linked to IGDB
whose format was not recorded by its owner gets its registry edition's
format, through formats.apply_registry_format -- which refuses manual,
cart_id and photo rows, so nothing here can relabel a copy the owner has
spoken for. Those rows are compared instead, and a disagreement is a note
on the status page and the edit page, never a write.

The copy's edition is the sheet's row for its game, platform and region
(home when it has none). When that region holds editions in different
formats -- a Game-Key Card and a code in a box -- and nothing on the copy
says which it is, nothing is written: the owner picks on the edit page.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select

from formats import (
    HOME_REGION,
    KEY_CARD_PLATFORMS,
    PROTECTED_SOURCES,
    apply_registry_format,
)
from models import Item, ItemType, OwnedFormat, PhysicalEdition
from physical_sources.collapse import EditionView, ItemView, item_note


@dataclass(frozen=True)
class Disagreement:
    item_id: str
    title: str
    region: str
    yours: str | None
    yours_source: str | None
    registry: str
    cart_id: str | None
    note: str


def _value(value: object) -> object:
    return getattr(value, "value", value)


def edition_view(row: PhysicalEdition) -> EditionView:
    return EditionView(
        id=str(row.id),
        source=row.source,
        region=row.region,
        platform_id=row.platform_id,
        is_physical=row.is_physical,
        physical_format=_value(row.physical_format),
        format_source=_value(row.format_source),
        cart_id=row.cart_id,
        release_date=row.release_date,
        release_precision=_value(row.release_precision),
    )


def item_view(item: Item) -> ItemView:
    return ItemView(
        id=str(item.id),
        platform_id=item.platform_id,
        region=item.region,
        physical_format=_value(item.physical_format),
        format_source=_value(item.format_source),
        cart_id=item.cart_id,
    )


async def _owned_switch_2_games(session) -> list[Item]:
    return list(
        await session.scalars(
            select(Item).where(
                Item.type == ItemType.GAME,
                Item.owned_format.is_distinct_from(OwnedFormat.NONE),
                Item.platform_id.in_(KEY_CARD_PLATFORMS),
                Item.external_source == "igdb",
            )
        )
    )


async def registry_editions(
    session, igdb_ids: set[int]
) -> dict[int, list[EditionView]]:
    """Live sheet editions by IGDB id."""
    if not igdb_ids:
        return {}
    rows = await session.scalars(
        select(PhysicalEdition).where(
            PhysicalEdition.source == "nscollectors",
            PhysicalEdition.retired_at.is_(None),
            PhysicalEdition.igdb_id.in_(igdb_ids),
        )
    )
    found: dict[int, list[EditionView]] = {}
    for row in rows:
        found.setdefault(row.igdb_id, []).append(edition_view(row))
    return found


def _igdb_id(item: Item) -> int | None:
    return int(item.external_id) if (item.external_id or "").isdigit() else None


def registry_format(item: Item, editions: list[EditionView]) -> str | None:
    """The one format the sheet gives this copy, or None when it gives none,
    calls it digital, or offers several in the copy's region."""
    region = item.region or HOME_REGION
    formats = {
        e.physical_format
        for e in editions
        if e.platform_id == item.platform_id
        and e.region == region
        and e.is_physical
        and e.physical_format
    }
    return formats.pop() if len(formats) == 1 else None


async def sync_items(session) -> int:
    """Writes registry formats onto unprotected owned copies; returns how many
    changed. Nothing commits; the route owns the transaction."""
    items = await _owned_switch_2_games(session)
    editions = await registry_editions(
        session, {i for i in map(_igdb_id, items) if i is not None}
    )
    written = 0
    for item in items:
        if _value(item.format_source) in PROTECTED_SOURCES:
            continue
        fmt = registry_format(item, editions.get(_igdb_id(item), []))
        changes = apply_registry_format(item, fmt)
        if changes and (
            _value(item.physical_format) != _value(changes["physical_format"])
            or _value(item.format_source) != _value(changes["format_source"])
        ):
            for name, value in changes.items():
                setattr(item, name, value)
            written += 1
    await session.flush()
    return written


async def disagreements(session) -> list[Disagreement]:
    """Owner-recorded copies whose format the registry contradicts."""
    items = [
        item
        for item in await _owned_switch_2_games(session)
        if _value(item.format_source) in PROTECTED_SOURCES
    ]
    editions = await registry_editions(
        session, {i for i in map(_igdb_id, items) if i is not None}
    )
    found = []
    for item in items:
        note = item_note(item_view(item), editions.get(_igdb_id(item), []))
        if note.agrees is False:
            found.append(
                Disagreement(
                    item_id=str(item.id),
                    title=item.title,
                    region=item.region or HOME_REGION,
                    yours=_value(item.physical_format),
                    yours_source=_value(item.format_source),
                    registry=note.edition.physical_format,
                    cart_id=note.edition.cart_id,
                    note=note.note,
                )
            )
    return sorted(found, key=lambda d: d.title.casefold())
