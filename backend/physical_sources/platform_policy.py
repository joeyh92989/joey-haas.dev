"""The N64 catalogue from IGDB: every release there is a cartridge.

`refresh-platform?platform_id=4` pages IGDB for N64 games with at least
MIN_RATINGS ratings, stores their snapshots, and writes one igdb_platform
edition per game (region ALL, game_card at platform_policy, is_physical
true) with igdb_id set directly. It also decides the title match for each,
so a store's N64 listing of the same title links without a search.

Switch 1 is cartridge-only too, but is never ingested: its candidates come
only from the stores (spec §2).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select

from matching import normalize_title
from models import CatalogueMatch, MatchConfidence, MatchDecision
from physical_sources.base import EditionRow
from physical_sources.catalogue import is_short, upsert_editions
from physical_sources.limits import N64
from physical_sources.parse import parse_ymd
from physical_sources.resolve import store_games
from sources.base import SourceError, SourceNotConfigured, SourceRateLimited
from sources.igdb import BATCH

SOURCE = "igdb_platform"
INGESTED_PLATFORMS = frozenset({N64})
MIN_RATINGS = 5
PAGE = 500  # IGDB's largest page


@dataclass
class IngestResult:
    rows: int = 0
    changed: int = 0
    retired: int = 0
    short: bool = False
    with_cover: int = 0
    errors: list[dict] = field(default_factory=list)


async def _game_ids(igdb, platform_id: int) -> list[str]:
    ids: list[str] = []
    offset = 0
    while True:
        # _query is the adapter's one query door; the platform listing is a
        # query no public method makes.
        rows = await igdb._query(
            f"where platforms = ({platform_id}) & total_rating_count >= {MIN_RATINGS};"
            f" fields id; sort id asc; limit {PAGE}; offset {offset};"
        )
        ids += [str(row["id"]) for row in rows]
        if len(rows) < PAGE:
            return ids
        offset += PAGE


async def ingest_platform(
    session, igdb, platform_id: int, *, previous: int | None = None
) -> IngestResult:
    """Every IGDB game on `platform_id` as a policy edition (N64 only).

    `previous` is the last successful ingest's row count: a short run
    upserts what it saw and retires nothing.
    """
    if platform_id not in INGESTED_PLATFORMS:
        raise ValueError(
            f"platform {platform_id} is policy-only, never ingested from IGDB"
        )
    result = IngestResult()
    if not igdb.configured():
        result.errors.append(
            {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
        )
        return result
    try:
        ids = await _game_ids(igdb, platform_id)
        details = []
        for start in range(0, len(ids), BATCH):
            details += await igdb.fetch_many(ids[start : start + BATCH])
    except SourceRateLimited:
        result.errors.append(
            {"code": "igdb_rate_limited", "detail": "IGDB rate limit; press again"}
        )
        return result
    except SourceNotConfigured:
        result.errors.append(
            {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
        )
        return result
    except SourceError as error:
        result.errors.append({"code": "http_error", "detail": str(error)})
        return result

    # Games first: the editions reference them.
    await store_games(session, details)
    rows = []
    for detail in details:
        released = parse_ymd((detail.source_metadata or {}).get("first_release_date"))
        rows.append(
            EditionRow(
                source=SOURCE,
                source_ref=detail.external_id,
                title=detail.title,
                title_normalized=normalize_title(detail.title),
                platform_id=platform_id,
                region="ALL",
                is_physical=True,
                physical_format="game_card",
                format_source="platform_policy",
                release_date=released,
                release_precision="day" if released else None,
                igdb_id=int(detail.external_id),
            )
        )
    result.short = is_short(len(rows), previous)
    result.changed, result.retired = await upsert_editions(
        session, rows, SOURCE, retire=bool(rows) and not result.short
    )
    decided = set(
        await session.scalars(
            select(CatalogueMatch.title_normalized).where(
                CatalogueMatch.platform_id == platform_id,
                CatalogueMatch.title_normalized.in_(
                    {row.title_normalized for row in rows}
                ),
            )
        )
    )
    for row in rows:
        # One decision per title: two games can share a normalized title,
        # and the first by IGDB id stands for the key (each edition keeps
        # its own id regardless).
        if row.title_normalized in decided:
            continue
        decided.add(row.title_normalized)
        session.add(
            CatalogueMatch(
                title_normalized=row.title_normalized,
                platform_id=platform_id,
                igdb_id=row.igdb_id,
                match_confidence=MatchConfidence.EXACT,
                decided_by=MatchDecision.AUTO,
            )
        )
    await session.flush()
    result.rows = len(rows)
    result.with_cover = sum(1 for detail in details if detail.cover_url)
    return result
