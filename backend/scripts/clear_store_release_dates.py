"""Clear release dates that Want / Already own copied from a store (#41).

Before #38, answering a Radar or Discover row copied the row's release_date
onto the new item whatever its source, so a store's date could reach
/api/public/items and What's next's Wanted list. #38 copies only a public
source's day-precise date (recommendations_routes._item_release_date). This
finds items still holding a copied date that would not pass that rule today
and, with --apply, sets their release_date to NULL. A later "Refresh game
metadata" on /admin/collection can refill dates from IGDB.

Dry run by default. Reads DATABASE_URL through load_config(), as the API does.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from sqlalchemy import select, tuple_, update  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from config import load_config  # noqa: E402
from db import create_engine_and_sessionmaker  # noqa: E402
from items import _release_date  # noqa: E402
from models import Item, Recommendation, RecommendationStatus  # noqa: E402
from recommendations_routes import _item_release_date  # noqa: E402

ANSWERED = (RecommendationStatus.WANTED, RecommendationStatus.OWNED)


@dataclass(frozen=True)
class Row:
    """An item holding a copied date, with what its recommendation said of it."""

    item_id: uuid.UUID
    title: str
    platform: str | None
    release_date: date
    release_source: str | None
    release_precision: str | None


async def find_store_dated(session: AsyncSession) -> list[Row]:
    """Items whose release_date is still the one copied from an answered
    recommendation, where no such recommendation's date would be copied today.

    An item is joined to its recommendations by (external_source,
    external_id); there can be one per kind. If any of them holds a date the
    current rule would copy, the item's date is that one and stays. So does an
    item whose date equals the one its own IGDB snapshot gives: "Refresh game
    metadata" overwrites release_date from the snapshot (items._apply_detail),
    so a matching value there is IGDB's, not the store's.
    """
    pairs = (
        await session.execute(
            select(Item, Recommendation)
            .join(
                Recommendation,
                (Recommendation.external_source == Item.external_source)
                & (Recommendation.external_id == Item.external_id),
            )
            .where(
                Recommendation.status.in_(ANSWERED),
                Item.release_date.is_not(None),
                Item.release_date == Recommendation.release_date,
            )
        )
    ).all()
    kept: set[uuid.UUID] = set()
    found: dict[uuid.UUID, Row] = {}
    for item, recommendation in pairs:
        if (
            _item_release_date(recommendation) is not None
            or _release_date(item.source_metadata or {}) == item.release_date
        ):
            kept.add(item.id)
            continue
        meta = recommendation.source_metadata or {}
        found.setdefault(
            item.id,
            Row(
                item.id,
                item.title,
                item.platform,
                item.release_date,
                meta.get("release_source"),
                meta.get("release_precision"),
            ),
        )
    rows = [row for item_id, row in found.items() if item_id not in kept]
    return sorted(rows, key=lambda row: (row.title, str(row.item_id)))


async def clear(session: AsyncSession, rows: list[Row]) -> int:
    """Sets release_date to NULL on those items and returns how many were
    cleared.

    The update is one statement that matches each item on its id and the date
    the dry run showed, so an item changed since (an edit, a refresh) is
    skipped rather than cleared; the count is the rows actually updated.
    """
    if not rows:
        return 0
    result = await session.execute(
        update(Item)
        .where(
            tuple_(Item.id, Item.release_date).in_(
                [(row.item_id, row.release_date) for row in rows]
            )
        )
        .values(release_date=None)
    )
    await session.commit()
    return result.rowcount


async def run(apply: bool) -> None:
    """Lists the affected items and, when `apply`, clears their dates."""
    config = load_config()
    engine, factory = create_engine_and_sessionmaker(config.database_url)
    try:
        async with factory() as session:
            rows = await find_store_dated(session)
            for row in rows:
                print(
                    f"{row.title} · {row.platform or '?'} · {row.release_date} "
                    f"(source {row.release_source or 'none'}, "
                    f"{row.release_precision or 'no precision'})"
                )
            print(f"{len(rows)} item(s) hold a copied non-public date.")
            if apply and rows:
                cleared = await clear(session, rows)
                print(f"Cleared {cleared} of {len(rows)} release date(s).")
            elif rows:
                print("Dry run: nothing changed. Re-run with --apply to clear them.")
    finally:
        await engine.dispose()


def main() -> None:
    """Command line entry: a dry run unless --apply is given."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply", action="store_true", help="clear the dates (default: dry run)"
    )
    asyncio.run(run(parser.parse_args().apply))


if __name__ == "__main__":
    main()
