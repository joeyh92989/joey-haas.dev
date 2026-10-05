"""The Switch 1 registry's database side (switch1 spec B).

refresh-switch1 reads the sheet (registry_switch1) and hands its editions to
ingest_switch1, which pages IGDB's whole Switch list by id (switch1_titles,
one request per 500 games) to match the keys by name, upserts the editions,
decides each open key, fetches snapshots for what matched and links the
rows. IGDB is never a physical source here: a game is physical because the
sheet lists it; IGDB only names it.

One match is decided AUTO/EXACT, as the N64 ingest pre-decides its titles.
No match is IGNORED, so the titles IGDB spells differently never crowd Needs
match -- unless a live Switch 1 store listing carries the key, which is then
left undecided for Resolve: a store's game is never hidden by the registry's
spelling. An automatic ignore is written with match_confidence UNCERTAIN; a
human's (resolve.ignore) has none. Only automatic ignores are revisited --
on every Switch 1 refresh, and by release_listed_ignores after a store
refresh -- and no other decision is touched, so a manual link or a human's
ignore stands.

The editions carry no igdb_id of their own: propagate copies each key's
decision onto them, as it does for the Switch 2 registry. That is why
propagate protects igdb_platform rows (ids straight from IGDB) and not
these.

Nothing commits; the route owns the transaction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from models import (
    CatalogueMatch,
    ListingAvailability,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources.base import EditionRow
from physical_sources.catalogue import is_short, upsert_editions
from physical_sources.limits import SWITCH
from physical_sources.registry_switch1 import SOURCE
from physical_sources.resolve import fill_games, propagate
from physical_sources.switch1_titles import (
    PAGE,
    build_index,
    match,
    page_query,
    parse_titles,
    sheet_years,
)
from sources.base import SourceError, SourceNotConfigured, SourceRateLimited

# The title walk stops here even if IGDB keeps answering full pages: 50,000
# games is several times its Switch list.
MAX_TITLE_PAGES = 100


@dataclass
class Switch1Result:
    """What one Switch 1 refresh did, for its catalogue_runs row."""

    rows: int = 0
    changed: int = 0
    retired: int = 0
    short: bool = False
    matched: int = 0
    unmatched: int = 0
    left_to_resolve: int = 0
    games_fetched: int = 0
    # The title list could not be read, so nothing was written.
    fatal: bool = False
    errors: list[dict] = field(default_factory=list)


def _is_automatic_ignore(decision: CatalogueMatch) -> bool:
    return (
        decision.decided_by == MatchDecision.IGNORED
        and decision.match_confidence == MatchConfidence.UNCERTAIN
    )


def _automatic_ignores():
    return (
        CatalogueMatch.platform_id == SWITCH,
        CatalogueMatch.decided_by == MatchDecision.IGNORED,
        CatalogueMatch.match_confidence == MatchConfidence.UNCERTAIN,
    )


def _live_switch_1_listings():
    return select(StoreListing.title_normalized).where(
        StoreListing.platform_id == SWITCH,
        StoreListing.is_game.is_(True),
        StoreListing.availability != ListingAvailability.ARCHIVED,
    )


async def load_switch_titles(igdb) -> list[dict]:
    """Every IGDB Switch game as {id, name, first_release_date,
    alternative_names}, PAGE at a time. Raises the adapter's SourceErrors."""
    rows: list[dict] = []
    for page in range(MAX_TITLE_PAGES):
        # _query is the adapter's one query door; the platform listing is a
        # query no public method makes (as in platform_policy).
        batch = await igdb._query(page_query(page * PAGE))
        rows += batch
        if len(batch) < PAGE:
            return rows
    raise SourceError("igdb", f"more than {MAX_TITLE_PAGES} pages of Switch games")


async def record_matches(
    session, rows: list[EditionRow], title_rows: list[dict]
) -> tuple[list[int], int, int]:
    """Decides every open Switch 1 key among `rows`: no decision yet, or an
    automatic ignore. Returns (the IGDB ids matched, how many were ignored,
    how many were left to Resolve because a store lists them)."""
    years = sheet_years(rows)
    if not years:
        return [], 0, 0
    existing = {
        decision.title_normalized: decision
        for decision in await session.scalars(
            select(CatalogueMatch).where(
                CatalogueMatch.platform_id == SWITCH,
                CatalogueMatch.title_normalized.in_(list(years)),
            )
        )
    }
    open_keys = sorted(
        key
        for key in years
        if key not in existing or _is_automatic_ignore(existing[key])
    )
    if not open_keys:
        return [], 0, 0
    listed = set(
        await session.scalars(
            _live_switch_1_listings()
            .where(StoreListing.title_normalized.in_(open_keys))
            .distinct()
        )
    )
    index = build_index(parse_titles(title_rows))
    now = datetime.now(UTC)
    matched: list[int] = []
    unmatched = left = 0
    for key in open_keys:
        igdb_id = match(key, years[key], index)
        decision = existing.get(key)
        if igdb_id is None and key in listed:
            if decision is not None:
                await session.delete(decision)
            left += 1
            continue
        if decision is None:
            decision = CatalogueMatch(title_normalized=key, platform_id=SWITCH)
            session.add(decision)
        decision.igdb_id = igdb_id
        decision.candidates = []
        decision.decided_at = now
        if igdb_id is None:
            decision.match_confidence = MatchConfidence.UNCERTAIN
            decision.decided_by = MatchDecision.IGNORED
            unmatched += 1
        else:
            decision.match_confidence = MatchConfidence.EXACT
            decision.decided_by = MatchDecision.AUTO
            matched.append(igdb_id)
    await session.flush()
    return matched, unmatched, left


async def release_listed_ignores(session) -> int:
    """Drops the automatic ignores on Switch 1 that a live store listing now
    carries, so Resolve searches them. Returns how many."""
    result = await session.execute(
        delete(CatalogueMatch)
        .where(
            *_automatic_ignores(),
            CatalogueMatch.title_normalized.in_(_live_switch_1_listings()),
        )
        .execution_options(synchronize_session=False)
    )
    await session.flush()
    return result.rowcount or 0


async def count_unmatched(session) -> int:
    """The automatic ignores a live Switch 1 registry edition still carries:
    the catalogue page's "N Switch 1 titles unmatched"."""
    carried = select(PhysicalEdition.title_normalized).where(
        PhysicalEdition.source == SOURCE,
        PhysicalEdition.platform_id == SWITCH,
        PhysicalEdition.retired_at.is_(None),
    )
    return (
        await session.scalar(
            select(func.count())
            .select_from(CatalogueMatch)
            .where(
                *_automatic_ignores(),
                CatalogueMatch.title_normalized.in_(carried),
            )
        )
        or 0
    )


def _http_error(what: str, error: SourceError) -> dict:
    """A fixed message and the error's type, never the adapter's text: it can
    carry a request URL, and the Twitch token request puts client_secret in
    its query string. The run's errors are stored and shown on the page."""
    return {"code": "http_error", "detail": f"{what} failed: {type(error).__name__}"}


def _title_list_error(error: SourceError) -> dict:
    if isinstance(error, SourceRateLimited):
        return {"code": "igdb_rate_limited", "detail": "IGDB rate limit; press again"}
    if isinstance(error, SourceNotConfigured):
        return {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
    return _http_error("IGDB title list", error)


async def ingest_switch1(
    session, igdb, rows: list[EditionRow], *, previous: int | None = None
) -> Switch1Result:
    """The sheet's editions, matched and linked.

    The title list is read before anything is written: without it every key
    would fall to Resolve, thousands of searches. `previous` is the last
    successful run's row count: a short run upserts and retires nothing.
    """
    result = Switch1Result()
    if not igdb.configured():
        result.fatal = True
        result.errors.append(
            {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
        )
        return result
    try:
        title_rows = await load_switch_titles(igdb)
    except SourceError as error:
        result.fatal = True
        result.errors.append(_title_list_error(error))
        return result

    result.rows = len(rows)
    result.short = is_short(len(rows), previous)
    result.changed, result.retired = await upsert_editions(
        session, rows, SOURCE, retire=bool(rows) and not result.short
    )
    matched, result.unmatched, result.left_to_resolve = await record_matches(
        session, rows, title_rows
    )
    result.matched = len(matched)
    try:
        result.games_fetched = await fill_games(session, igdb, sorted(set(matched)))
    except SourceRateLimited:
        result.errors.append(
            {
                "code": "igdb_rate_limited",
                "detail": "IGDB rate limit filling games; Resolve fills the rest",
            }
        )
    except SourceError as error:
        result.errors.append(_http_error("IGDB game fetch", error))
    # Links every decided key whose game row exists, these among them.
    await propagate(session)
    return result
