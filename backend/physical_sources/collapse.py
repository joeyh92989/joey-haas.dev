"""One honest format for a game on a platform, from all its editions.

Pure. E8b (Discover), E8c (Radar) and the item page's registry note call
this rather than writing the join themselves; the route layer builds the
plain views below from rows (the picker.py pattern).

The rule (spec §4, D9): the registry row and a boutique listing usually
describe different editions of one game -- a retail Game-Key Card beside a
Limited Run or Super Rare full cartridge -- so the best edition in the home
region wins. Any full cartridge there makes the game a cartridge; tiers only
break ties between rows saying the same thing. A cartridge in another region
is a note, never a relabel. The switch2-tracker cross-check is dropped
wherever the sheet speaks for the same region.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from physical_sources.limits import FORMAT_WORDS, HOME_REGION, REGISTRY_WORDS

TIER_ORDER = (
    "manual",
    "cart_id",
    "photo",
    "registry",
    "store_text",
    "store_policy",
    "platform_policy",
)
SOURCE_ORDER = ("nscollectors", "switch2tracker", "igdb_platform", "manual")
# Among formats that are not a full cartridge, the most useful first.
FORMAT_ORDER = ("game_card", "game_key_card", "code_in_box", "disc")
REGISTRY_SOURCES = ("nscollectors", "switch2tracker")
BUYABLE = frozenset({"preorder", "in_stock"})
SOURCE_NAMES = {
    "nscollectors": "r/NSCollectors",
    "switch2tracker": "switch2-tracker",
    "igdb_platform": "platform policy",
    "manual": "manual entry",
}


@dataclass(frozen=True)
class EditionView:
    id: str
    source: str
    region: str
    platform_id: int
    is_physical: bool | None
    physical_format: str | None
    format_source: str | None
    cart_id: str | None = None
    release_date: date | None = None
    release_precision: str | None = None


@dataclass(frozen=True)
class ListingView:
    id: str
    store: str
    store_name: str
    region: str
    platform_id: int | None
    availability: str
    url: str
    price: Decimal | None = None
    currency: str = "USD"
    preorder_closes_at: date | None = None
    format_hint: str | None = None
    format_tier: str | None = None
    release_date: date | None = None
    release_precision: str | None = None


@dataclass(frozen=True)
class GameView:
    igdb_id: int
    title: str
    cover_url: str | None = None
    release_date: date | None = None


@dataclass(frozen=True)
class ItemView:
    id: str
    platform_id: int | None
    region: str | None
    physical_format: str | None
    format_source: str | None
    cart_id: str | None = None


@dataclass(frozen=True)
class StoreLine:
    """One listing as a Discover card or the Radar shows it."""

    store: str
    price: Decimal | None
    currency: str
    availability: str
    preorder_closes_at: date | None
    url: str
    listing_format: str | None
    listing_id: str


@dataclass(frozen=True)
class Candidate:
    igdb_id: int
    platform_id: int
    title: str
    cover_url: str | None
    release_date: date | None
    release_precision: str | None
    physical_format: str | None
    format_source: str | None
    format_route: str | None
    format_note: str | None
    region_of_answer: str
    buyable: bool
    store_lines: tuple[StoreLine, ...]
    listing_ids: tuple[str, ...]
    edition_ids: tuple[str, ...]


@dataclass(frozen=True)
class RegistryNote:
    agrees: bool | None
    edition: EditionView | None
    note: str


@dataclass(frozen=True)
class _Claim:
    """One row's statement about the format, normalised across both kinds."""

    format: str | None
    tier: str | None
    source_rank: int
    route: str
    region: str


def _rank(order: tuple[str, ...], value: str | None) -> int:
    return order.index(value) if value in order else len(order)


def _live_editions(editions: Iterable[EditionView], platform_id: int):
    rows = [
        e
        for e in editions
        if e.platform_id == platform_id and e.is_physical is not False
    ]
    sheet_regions = {e.region for e in rows if e.source == "nscollectors"}
    # The tracker is never read where the sheet already speaks.
    return [
        e
        for e in rows
        if not (
            e.source == "switch2tracker"
            and sheet_regions
            and (e.region in sheet_regions or e.region == "ALL")
        )
    ]


def _edition_claim(edition: EditionView) -> _Claim:
    name = SOURCE_NAMES.get(edition.source, edition.source)
    route = name if edition.region == "ALL" else f"{name} ({edition.region})"
    return _Claim(
        edition.physical_format,
        edition.format_source,
        _rank(SOURCE_ORDER, edition.source),
        route,
        edition.region,
    )


def _listing_claim(listing: ListingView) -> _Claim:
    route = listing.store_name
    if listing.format_tier == "store_policy":
        route += " (store policy)"
    elif listing.format_tier == "platform_policy":
        route += " (platform policy)"
    return _Claim(
        listing.format_hint,
        listing.format_tier,
        len(SOURCE_ORDER),
        route,
        listing.region,
    )


def _best(claims: list[_Claim]) -> _Claim | None:
    """Any full cartridge wins; else the most useful known format. Ties go
    to the higher tier, then the sheet before the tracker."""
    known = [claim for claim in claims if claim.format]
    if not known:
        return None
    return min(
        known,
        key=lambda c: (
            _rank(FORMAT_ORDER, c.format),
            _rank(TIER_ORDER, c.tier),
            c.source_rank,
        ),
    )


def _release(editions, listings, game, home):
    registry = [e for e in editions if e.source in REGISTRY_SOURCES and e.release_date]
    for pool in (
        [e for e in registry if e.region in (home, "ALL")],
        registry,
        [listing for listing in listings if listing.release_date],
    ):
        if pool:
            first = min(pool, key=lambda row: row.release_date)
            return first.release_date, first.release_precision
    if game is not None and game.release_date:
        return game.release_date, "day"
    return None, None


def collapse(
    igdb_id: int,
    platform_id: int,
    editions: list[EditionView],
    listings: list[ListingView],
    game: GameView | None,
    home: str = HOME_REGION,
) -> Candidate:
    """The candidate for one game on one platform (spec §4)."""
    editions = _live_editions(editions, platform_id)
    listings = [
        listing
        for listing in listings
        if listing.platform_id == platform_id and listing.availability != "archived"
    ]
    claims = [_edition_claim(e) for e in editions] + [
        _listing_claim(listing) for listing in listings
    ]
    home_claims = [c for c in claims if c.region in (home, "ALL")]
    region = home
    if home_claims:
        chosen = _best(home_claims)
    else:
        chosen = _best(claims)
        if chosen is not None:
            region = chosen.region
        elif claims:
            region = claims[0].region

    answer = chosen.format if chosen else None
    note = None
    if answer != "game_card":
        elsewhere = _best(
            [
                c
                for c in claims
                if c.region not in (region, "ALL") and c.format == "game_card"
            ]
        )
        if elsewhere is not None:
            name = elsewhere.route.split(" (")[0]
            note = f"Full game on cartridge in {elsewhere.region} — {name}"

    released, precision = _release(editions, listings, game, home)
    return Candidate(
        igdb_id=igdb_id,
        platform_id=platform_id,
        title=game.title if game else "",
        cover_url=game.cover_url if game else None,
        release_date=released,
        release_precision=precision,
        physical_format=answer,
        format_source=chosen.tier if chosen else None,
        format_route=chosen.route if chosen else None,
        format_note=note,
        region_of_answer=region,
        buyable=any(listing.availability in BUYABLE for listing in listings),
        store_lines=tuple(
            StoreLine(
                store=listing.store_name,
                price=listing.price,
                currency=listing.currency,
                availability=listing.availability,
                preorder_closes_at=listing.preorder_closes_at,
                url=listing.url,
                listing_format=listing.format_hint,
                listing_id=listing.id,
            )
            for listing in listings
        ),
        listing_ids=tuple(listing.id for listing in listings),
        edition_ids=tuple(e.id for e in editions),
    )


def item_note(
    item: ItemView, editions: list[EditionView], home: str = HOME_REGION
) -> RegistryNote:
    """What the registry says about an owned copy, compared with the copy.

    The copy's edition is the sheet's row for its platform and region (home
    when it has none) -- the one carrying its cart ID if any, else the one in
    its format, else the first with a known card type. A title can have
    several editions in one region (WWE 2K25 EUR: a key card and a code in a
    box), which is why the copy picks.
    """
    region = item.region or home
    rows = [
        e
        for e in editions
        if e.source == "nscollectors"
        and e.platform_id == item.platform_id
        and e.region == region
    ]
    if not rows:
        return RegistryNote(None, None, "Not in the registry")
    edition = (
        next((e for e in rows if item.cart_id and e.cart_id == item.cart_id), None)
        or next(
            (
                e
                for e in rows
                if item.physical_format and e.physical_format == item.physical_format
            ),
            None,
        )
        or next((e for e in rows if e.physical_format), rows[0])
    )
    if edition.physical_format is None:
        return RegistryNote(
            None,
            edition,
            f"r/NSCollectors lists the {region} edition without a card type yet",
        )
    words = REGISTRY_WORDS[edition.physical_format]
    if item.physical_format == edition.physical_format:
        return RegistryNote(True, edition, f"Registry agrees: {words} ({region})")
    cart = f" ({edition.cart_id})" if edition.cart_id else ""
    listed = f"r/NSCollectors lists the {region} edition as {words}{cart}"
    if item.physical_format is None:
        return RegistryNote(False, edition, f"{listed}; you have not recorded one")
    yours = FORMAT_WORDS.get(item.physical_format, item.physical_format)
    how = f" ({item.format_source})" if item.format_source else ""
    return RegistryNote(False, edition, f"{listed}; you recorded {yours}{how}")
