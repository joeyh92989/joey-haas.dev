"""Radar's database reads: the catalogue, the owner's items and past
decisions, as the plain views `radar.py` scores.

Only linked rows (an `igdb_id`) reach Radar: a key still in Needs match has
no game to score (parent spec §7.1).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select

from models import (
    CatalogueGame,
    Item,
    ItemType,
    ListingAvailability,
    OwnedFormat,
    PhysicalEdition,
    Recommendation,
    RecommendationStatus,
    StoreListing,
)
from physical_sources.collapse import GameView, ListingView, collapse
from physical_sources.stores import STORES
from physical_sources.sync import edition_view
from picker import PickerItem
from picker_routes import to_picker_item
from radar import PoolGame

# The catalogue platforms with upcoming releases; N64 has none.
RADAR_PLATFORMS = (130, 508)
EXCLUDING = (
    RecommendationStatus.DISMISSED,
    RecommendationStatus.WANTED,
    RecommendationStatus.OWNED,
)


def _value(value: object) -> object:
    return getattr(value, "value", value)


def open_preorder(line: ListingView, today: date) -> bool:
    """A pre-order still taking orders: its window has not closed, or, with no
    window stated, the game is not out yet. A listing a store still marks as
    pre-order after either is stale, not open."""
    if line.availability != "preorder":
        return False
    if line.preorder_closes_at is not None:
        return line.preorder_closes_at >= today
    return line.release_date is None or line.release_date > today


def listing_view(row: StoreListing) -> ListingView:
    store = STORES.get(row.store)
    return ListingView(
        id=str(row.id),
        store=row.store,
        store_name=store.name if store else row.store,
        region=row.region,
        platform_id=row.platform_id,
        availability=_value(row.availability),
        url=row.url,
        price=row.price,
        currency=row.currency,
        preorder_closes_at=row.preorder_closes_at,
        format_hint=_value(row.format_hint),
        format_tier=_value(row.format_tier),
        release_date=row.release_date,
        release_precision=_value(row.release_precision),
    )


async def collection_platforms(session) -> tuple[int, ...]:
    """The Switch platforms the owner has games on; both when none (D5)."""
    found = set(
        await session.scalars(
            select(Item.platform_id)
            .where(Item.type == ItemType.GAME, Item.platform_id.in_(RADAR_PLATFORMS))
            .distinct()
        )
    )
    return tuple(sorted(found)) or RADAR_PLATFORMS


async def load_pool(
    session, platform_ids: tuple[int, ...], today: date
) -> list[PoolGame]:
    """Every linked catalogue game on these platforms, collapsed.

    Games with no future date and no open pre-order are included too: they
    fall out of Radar's sections but still keep lane 3 from calling a game
    with a physical edition on that platform "digital so far".
    """
    editions = defaultdict(list)
    for row in await session.scalars(
        select(PhysicalEdition).where(
            PhysicalEdition.igdb_id.is_not(None),
            PhysicalEdition.retired_at.is_(None),
            PhysicalEdition.is_physical.is_distinct_from(False),
            PhysicalEdition.platform_id.in_(platform_ids),
        )
    ):
        editions[(row.igdb_id, row.platform_id)].append(edition_view(row))
    listings = defaultdict(list)
    for row in await session.scalars(
        select(StoreListing).where(
            StoreListing.igdb_id.is_not(None),
            StoreListing.is_game.is_(True),
            StoreListing.availability != ListingAvailability.ARCHIVED,
            StoreListing.platform_id.in_(platform_ids),
        )
    ):
        listings[(row.igdb_id, row.platform_id)].append(listing_view(row))

    keys = set(editions) | set(listings)
    games = {
        game.igdb_id: game
        for game in await session.scalars(
            select(CatalogueGame).where(
                CatalogueGame.igdb_id.in_({igdb_id for igdb_id, _ in keys})
            )
        )
    }
    pool: list[PoolGame] = []
    for igdb_id, platform_id in sorted(keys):
        game = games.get(igdb_id)
        game_view = (
            GameView(
                igdb_id=igdb_id,
                title=game.title,
                cover_url=game.cover_url,
                release_date=game.release_date,
            )
            if game
            else None
        )
        its_listings = listings[(igdb_id, platform_id)]
        open_lines = [line for line in its_listings if open_preorder(line, today)]
        windows = [
            line.preorder_closes_at
            for line in open_lines
            if line.preorder_closes_at is not None
        ]
        pool.append(
            PoolGame(
                candidate=collapse(
                    igdb_id,
                    platform_id,
                    editions[(igdb_id, platform_id)],
                    its_listings,
                    game_view,
                ),
                snapshot=game.snapshot if game else {},
                hypes=game.hypes if game else None,
                lane="preorder" if open_lines else "dated",
                closes_at=min(windows, default=None),
            )
        )
    return pool


async def load_profile(session) -> list[PickerItem]:
    """The owner's games, as Play Next's profile reads them."""
    return [
        to_picker_item(item)
        for item in await session.scalars(
            select(Item).where(Item.type == ItemType.GAME)
        )
    ]


async def excluded_games(session) -> set[int]:
    """IGDB ids never to suggest: games the owner has (owned or watched), and
    any the owner dismissed, watched or owns in Radar or Discover."""
    ids: set[int] = set()
    for external_id in await session.scalars(
        select(Item.external_id).where(
            Item.external_source == "igdb", Item.external_id.is_not(None)
        )
    ):
        if external_id.isdigit():
            ids.add(int(external_id))
    for external_id in await session.scalars(
        select(Recommendation.external_id).where(
            Recommendation.external_source == "igdb",
            Recommendation.status.in_(EXCLUDING),
        )
    ):
        if external_id.isdigit():
            ids.add(int(external_id))
    return ids


async def watching(session, today: date) -> list[dict]:
    """Games the owner is watching: an item with no owned copy that comes out
    after today, or has an open pre-order at a linked listing on its
    platform. Soonest first; the pre-order is the soonest-closing one."""
    items = list(
        await session.scalars(
            select(Item).where(
                Item.type == ItemType.GAME, Item.owned_format == OwnedFormat.NONE
            )
        )
    )
    ids = {
        int(item.external_id)
        for item in items
        if item.external_source == "igdb" and (item.external_id or "").isdigit()
    }
    windows: dict[tuple[int, int], StoreListing] = {}
    if ids:
        for row in await session.scalars(
            select(StoreListing).where(
                StoreListing.igdb_id.in_(ids),
                StoreListing.availability == ListingAvailability.PREORDER,
            )
        ):
            if not open_preorder(listing_view(row), today):
                continue
            key = (row.igdb_id, row.platform_id)
            best = windows.get(key)
            if best is None or (row.preorder_closes_at or date.max) < (
                best.preorder_closes_at or date.max
            ):
                windows[key] = row

    found = []
    for item in items:
        key = (
            (int(item.external_id), item.platform_id)
            if item.external_source == "igdb" and (item.external_id or "").isdigit()
            else None
        )
        listing = windows.get(key) if key else None
        upcoming = item.release_date is not None and item.release_date > today
        if not upcoming and listing is None:
            continue
        store = STORES.get(listing.store) if listing else None
        found.append(
            {
                "item": {
                    "id": str(item.id),
                    "title": item.title,
                    "cover_url": item.cover_url,
                    "platform": item.platform,
                    "release_date": item.release_date.isoformat()
                    if item.release_date
                    else None,
                    "physical_format": _value(item.physical_format),
                },
                "preorder": {
                    "store": store.name if store else listing.store,
                    "closes_at": listing.preorder_closes_at.isoformat()
                    if listing.preorder_closes_at
                    else None,
                    "price": str(listing.price) if listing.price is not None else None,
                    "currency": listing.currency,
                    "url": listing.url,
                }
                if listing
                else None,
            }
        )
    found.sort(key=_soonest)
    return found


def _soonest(row: dict) -> tuple[str, str]:
    """The earlier of the window closing and the release: what comes first."""
    dates = [row["item"]["release_date"]]
    if row["preorder"]:
        dates.append(row["preorder"]["closes_at"])
    return (min((d for d in dates if d), default="9999-12-31"), row["item"]["title"])
