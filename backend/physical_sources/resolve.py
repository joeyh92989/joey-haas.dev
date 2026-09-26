"""Resolving catalogue rows to IGDB games (spec §3).

The database layer between the catalogue and the IGDB adapter. The work list
is every (title_normalized, platform_id) key on a catalogue platform, from a
live edition or a live game listing, that has no catalogue_matches row yet.
Each key is searched once: an exact or probable match is decided
automatically, anything less waits in Needs match with its top three
candidates, so a human never waits on a second search.

Order matters because editions and listings reference catalogue_games:
game rows are filled from the decided matches first, and only then is
igdb_id copied onto the rows -- and only where a game row exists. A fetch cut
short by a rate limit therefore leaves its rows unlinked without error, and
the next resolve links them, because the copy runs over every decided match,
not only this batch's.

Nothing commits; the route owns the transaction.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import (
    and_,
    case,
    delete,
    func,
    literal,
    select,
    tuple_,
    union,
    update,
)

from matching import Confidence, best_match
from models import (
    CatalogueGame,
    CatalogueMatch,
    ListingAvailability,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources.limits import (
    CATALOGUE_PLATFORMS,
    RESOLVE_LIMIT,
    SNAPSHOT_MAX_AGE_DAYS,
)
from sources.base import (
    SourceDetail,
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
)
from sources.igdb import BATCH, PLATFORM_NAMES

logger = logging.getLogger(__name__)

DECIDED = (MatchDecision.AUTO, MatchDecision.MANUAL)
CANDIDATE_COUNT = 3
# Stale snapshots refreshed per press; missing games are always filled. The
# cache fills in a few presses, so it goes stale all at once 30 days later.
STALE_REFRESH_LIMIT = 2 * BATCH


class UnknownGame(LookupError):
    """IGDB returned nothing for an id a human tried to link."""


# A quarter is left out of the year a search is narrowed by (spec §3).
YEAR_PRECISIONS = ("day", "month", "year")


@dataclass
class ResolveResult:
    resolved: int = 0
    pending: int = 0
    unresolved_remaining: int = 0
    games_fetched: int = 0
    errors: list[dict] = field(default_factory=list)


def _now() -> datetime:
    return datetime.now(UTC)


def _edition_keys():
    return select(
        PhysicalEdition.title_normalized.label("title_normalized"),
        PhysicalEdition.platform_id.label("platform_id"),
        PhysicalEdition.title.label("title"),
        PhysicalEdition.release_date.label("release_date"),
        PhysicalEdition.release_precision.label("release_precision"),
        literal(0).label("from_listing"),
    ).where(
        PhysicalEdition.retired_at.is_(None),
        PhysicalEdition.is_physical.is_distinct_from(False),
        PhysicalEdition.platform_id.in_(CATALOGUE_PLATFORMS),
        PhysicalEdition.igdb_id.is_(None),
    )


def _listing_keys():
    return select(
        StoreListing.title_normalized.label("title_normalized"),
        StoreListing.platform_id.label("platform_id"),
        StoreListing.title_normalized.label("title"),
        StoreListing.release_date.label("release_date"),
        StoreListing.release_precision.label("release_precision"),
        literal(1).label("from_listing"),
    ).where(
        StoreListing.availability != ListingAvailability.ARCHIVED,
        StoreListing.is_game.is_(True),
        StoreListing.platform_id.in_(CATALOGUE_PLATFORMS),
        StoreListing.igdb_id.is_(None),
    )


def _open_keys():
    """Rows whose key has no catalogue_matches row, as one subquery."""
    rows = union(_edition_keys(), _listing_keys()).subquery()
    return (
        select(rows)
        .outerjoin(
            CatalogueMatch,
            and_(
                CatalogueMatch.title_normalized == rows.c.title_normalized,
                CatalogueMatch.platform_id == rows.c.platform_id,
            ),
        )
        .where(CatalogueMatch.title_normalized.is_(None))
        .subquery()
    )


async def pending_keys(session, limit: int) -> list[tuple[str, int, int | None, str]]:
    """(title_normalized, platform_id, year, search title) for up to `limit`
    unmatched keys, in title order.

    The search title is the registry's own spelling when an edition carries
    the key, else the normalized title. The year is the earliest day-, month-
    or year-precision date among the key's rows (spec §3), else None, which
    best_match accepts.
    """
    rows = _open_keys()
    grouped = (
        select(
            rows.c.title_normalized,
            rows.c.platform_id,
            func.min(
                case(
                    (rows.c.release_precision.in_(YEAR_PRECISIONS), rows.c.release_date)
                )
            ),
            func.min(case((rows.c.from_listing == 0, rows.c.title))),
        )
        .group_by(rows.c.title_normalized, rows.c.platform_id)
        .order_by(rows.c.title_normalized, rows.c.platform_id)
        .limit(limit)
    )
    keys = []
    for title_normalized, platform_id, released, registry_title in (
        await session.execute(grouped)
    ).all():
        year = released.year if isinstance(released, date) else None
        keys.append(
            (title_normalized, platform_id, year, registry_title or title_normalized)
        )
    return keys


async def count_pending(session) -> int:
    rows = _open_keys()
    return (
        await session.scalar(
            select(func.count()).select_from(
                select(rows.c.title_normalized, rows.c.platform_id)
                .distinct()
                .subquery()
            )
        )
        or 0
    )


def _candidates(results) -> list[dict]:
    return [
        {
            "external_id": result.external_id,
            "title": result.title,
            "year": result.year,
            "thumbnail_url": result.thumbnail_url,
        }
        for result in results[:CANDIDATE_COUNT]
    ]


async def _decide(
    session, title_normalized, platform_id, *, new: bool = False, **fields
) -> None:
    """Records a decision. `new` skips the lookup when the caller knows the
    key has no row (resolve_batch's keys come from the unmatched list)."""
    match = (
        None
        if new
        else await session.get(CatalogueMatch, (title_normalized, platform_id))
    )
    if match is None:
        match = CatalogueMatch(
            title_normalized=title_normalized, platform_id=platform_id
        )
        session.add(match)
    for name, value in fields.items():
        setattr(match, name, value)
    match.decided_at = _now()


def _game_row(detail: SourceDetail) -> dict:
    snapshot = detail.source_metadata or {}
    released = snapshot.get("first_release_date")
    return {
        "title": detail.title,
        "cover_url": detail.cover_url,
        "release_date": date.fromisoformat(released) if released else None,
        "hypes": snapshot.get("hypes"),
        "snapshot": snapshot,
        "fetched_at": _now(),
    }


async def store_games(session, details: list[SourceDetail]) -> int:
    """Upserts catalogue_games from fetched details; returns how many."""
    ids = [int(detail.external_id) for detail in details]
    existing = {
        game.igdb_id: game
        for game in await session.scalars(
            select(CatalogueGame).where(CatalogueGame.igdb_id.in_(ids))
        )
    }
    for detail in details:
        game = existing.get(int(detail.external_id))
        values = _game_row(detail)
        if game is None:
            session.add(CatalogueGame(igdb_id=int(detail.external_id), **values))
        else:
            for name, value in values.items():
                setattr(game, name, value)
    await session.flush()
    return len(details)


async def fill_games(session, igdb, ids: list[int] | None = None) -> int:
    """catalogue_games for decided matches (or `ids`) that are missing or
    older than SNAPSHOT_MAX_AGE_DAYS, BATCH at a time.

    A failed batch raises; the batches before it are already stored.
    """
    if ids is None:
        ids = list(
            await session.scalars(
                select(CatalogueMatch.igdb_id)
                .where(
                    CatalogueMatch.decided_by.in_(DECIDED),
                    CatalogueMatch.igdb_id.is_not(None),
                )
                .distinct()
            )
        )
    cutoff = _now() - timedelta(days=SNAPSHOT_MAX_AGE_DAYS)
    cached = dict(
        (
            await session.execute(
                select(CatalogueGame.igdb_id, CatalogueGame.fetched_at).where(
                    CatalogueGame.igdb_id.in_(ids)
                )
            )
        ).all()
    )
    missing = sorted(set(ids) - set(cached))
    stale = sorted(
        (igdb_id for igdb_id, fetched in cached.items() if fetched < cutoff),
        key=cached.get,
    )[:STALE_REFRESH_LIMIT]
    wanted = missing + stale
    fetched = 0
    for start in range(0, len(wanted), BATCH):
        batch = [str(igdb_id) for igdb_id in wanted[start : start + BATCH]]
        fetched += await store_games(session, await igdb.fetch_many(batch))
    return fetched


async def propagate(session) -> None:
    """Copies each decided match's igdb_id onto its editions and listings --
    only where the game row exists -- and clears it from ignored keys.

    An N64 policy edition keeps the id it was ingested with: it came from
    IGDB directly, not from a title match.
    """
    linkable = (
        select(
            CatalogueMatch.title_normalized,
            CatalogueMatch.platform_id,
            CatalogueMatch.igdb_id,
        )
        .join(CatalogueGame, CatalogueGame.igdb_id == CatalogueMatch.igdb_id)
        .where(CatalogueMatch.decided_by.in_(DECIDED))
        .subquery()
    )
    ignored = select(CatalogueMatch.title_normalized, CatalogueMatch.platform_id).where(
        CatalogueMatch.decided_by == MatchDecision.IGNORED
    )
    for model in (PhysicalEdition, StoreListing):
        link = [
            model.title_normalized == linkable.c.title_normalized,
            model.platform_id == linkable.c.platform_id,
            model.igdb_id.is_distinct_from(linkable.c.igdb_id),
        ]
        if model is PhysicalEdition:
            # Two N64 games can share a normalized title (Bomberman 64 is
            # two IGDB games); a title match must not overwrite either id.
            link.append(PhysicalEdition.source != "igdb_platform")
        await session.execute(
            update(model)
            .where(*link)
            .values(igdb_id=linkable.c.igdb_id)
            .execution_options(synchronize_session=False)
        )
        clear = [
            model.igdb_id.is_not(None),
            tuple_(model.title_normalized, model.platform_id).in_(ignored),
        ]
        if model is PhysicalEdition:
            clear.append(PhysicalEdition.source != "igdb_platform")
        await session.execute(
            update(model)
            .where(*clear)
            .values(igdb_id=None)
            .execution_options(synchronize_session=False)
        )
    await session.flush()


async def resolve_batch(session, igdb, limit: int = RESOLVE_LIMIT) -> ResolveResult:
    """One press of Resolve: search up to `limit` keys, fill games, link rows."""
    result = ResolveResult()
    if not igdb.configured():
        result.errors.append(
            {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
        )
        result.unresolved_remaining = await count_pending(session)
        return result

    for title_normalized, platform_id, year, title in await pending_keys(
        session, limit
    ):
        try:
            found = await igdb.search(title, year, platform=PLATFORM_NAMES[platform_id])
        except SourceRateLimited:
            result.errors.append(
                {"code": "igdb_rate_limited", "detail": "IGDB rate limit; press again"}
            )
            break
        except SourceNotConfigured:
            result.errors.append(
                {
                    "code": "igdb_not_configured",
                    "detail": "IGDB credentials are not set",
                }
            )
            break
        except SourceError as error:
            # Queued for a human rather than retried forever by the loop.
            logger.warning("resolve %r on %s failed: %s", title, platform_id, error)
            await _decide(
                session,
                title_normalized,
                platform_id,
                new=True,
                igdb_id=None,
                match_confidence=None,
                decided_by=MatchDecision.PENDING,
                candidates=[],
            )
            result.pending += 1
            continue
        match = best_match(title, year, found)
        if match.result is not None and match.confidence in (
            Confidence.EXACT,
            Confidence.PROBABLE,
        ):
            await _decide(
                session,
                title_normalized,
                platform_id,
                new=True,
                igdb_id=int(match.result.external_id),
                match_confidence=MatchConfidence(match.confidence.value),
                decided_by=MatchDecision.AUTO,
                candidates=_candidates(found),
            )
            result.resolved += 1
        else:
            await _decide(
                session,
                title_normalized,
                platform_id,
                new=True,
                igdb_id=None,
                match_confidence=MatchConfidence.UNCERTAIN,
                decided_by=MatchDecision.PENDING,
                candidates=_candidates(found),
            )
            result.pending += 1
    await session.flush()

    try:
        result.games_fetched = await fill_games(session, igdb)
    except SourceRateLimited:
        result.errors.append(
            {"code": "igdb_rate_limited", "detail": "IGDB rate limit filling games"}
        )
    except SourceError as error:
        result.errors.append({"code": "http_error", "detail": str(error)})
    await propagate(session)
    result.unresolved_remaining = await count_pending(session)
    return result


async def link_by_hand(
    session, igdb, title_normalized: str, platform_id: int, igdb_id: int
) -> None:
    """A human's link: the game row first, then the decision and the copy.

    Raises UnknownGame when IGDB has nothing for the id, and decides nothing.
    """
    details = await igdb.fetch_many([str(igdb_id)])
    if not details:
        raise UnknownGame(igdb_id)
    await store_games(session, details)
    await _decide(
        session,
        title_normalized,
        platform_id,
        igdb_id=igdb_id,
        match_confidence=MatchConfidence.MANUAL,
        decided_by=MatchDecision.MANUAL,
    )
    await session.flush()
    await propagate(session)


async def ignore(session, title_normalized: str, platform_id: int) -> None:
    """Never match this key; its rows keep no game."""
    await _decide(
        session,
        title_normalized,
        platform_id,
        igdb_id=None,
        match_confidence=None,
        decided_by=MatchDecision.IGNORED,
    )
    await session.flush()
    await propagate(session)


async def rekey_platform(
    session, title_normalized: str, old_platform_id: int, new_platform_id: int
) -> int:
    """Gives a platform-less (0) or wrong-platform key a platform: its
    listings move, and the old key's decision is dropped so the rows queue
    under the new one. Returns how many listings moved."""
    if new_platform_id not in PLATFORM_NAMES:
        raise ValueError(f"unknown platform id {new_platform_id}")
    where = [StoreListing.title_normalized == title_normalized]
    if old_platform_id == 0:
        where += [StoreListing.platform_id.is_(None), StoreListing.platform.is_(None)]
    else:
        where.append(StoreListing.platform_id == old_platform_id)
    moved = await session.execute(
        update(StoreListing)
        .where(*where)
        .values(
            platform_id=new_platform_id,
            platform=PLATFORM_NAMES[new_platform_id],
            igdb_id=None,
        )
        .execution_options(synchronize_session=False)
    )
    await session.execute(
        delete(CatalogueMatch).where(
            CatalogueMatch.title_normalized == title_normalized,
            CatalogueMatch.platform_id == old_platform_id,
        )
    )
    await session.flush()
    return moved.rowcount or 0
