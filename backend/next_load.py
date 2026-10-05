"""What's next's database side: pending suggestions as NextCandidates, and
Play Next's profile split into public and private (Spine Next spec, K9).

Shared by GET /api/public/next and GET /api/recommendations/store-list, so
the two read the same rows the same way. next_list.py decides everything.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    CatalogueRun,
    Item,
    ItemType,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from next_list import NextCandidate, PublicTaste, public_taste
from physical_sources.catalogue import latest_runs
from physical_sources.stores import STORES
from picker_routes import to_picker_item


@dataclass(frozen=True)
class NextData:
    """Everything next_list needs from the database, loaded once."""

    candidates: list[NextCandidate]
    taste: PublicTaste
    public_games: list[Item]
    generated_at: dict[str, datetime | None]


def _candidate(row: Recommendation) -> NextCandidate:
    meta = row.source_metadata or {}
    return NextCandidate(
        kind=row.kind.value,
        igdb_id=row.external_id,
        platform_id=row.platform_id,
        platform=row.platform,
        title=row.title,
        physical_format=row.physical_format.value if row.physical_format else None,
        lane=meta.get("lane"),
        release_date=row.release_date,
        release_precision=meta.get("release_precision"),
        release_source=meta.get("release_source"),
        score=row.score,
        rank=meta.get("rank"),
        payload=row,
    )


async def load_next(session: AsyncSession) -> NextData:
    """Pending Radar and Discover rows, and the games a reason may name."""
    rows = list(
        await session.scalars(
            select(Recommendation)
            .where(Recommendation.status == RecommendationStatus.PENDING)
            .order_by(Recommendation.score.desc(), Recommendation.title)
        )
    )
    games = list(await session.scalars(select(Item).where(Item.type == ItemType.GAME)))
    public_games = [item for item in games if item.is_public]
    taste = public_taste(
        [to_picker_item(item) for item in public_games],
        [item.title for item in games if not item.is_public],
    )
    generated_at: dict[str, datetime | None] = {}
    for kind in RecommendationKind:
        generated_at[kind.value] = await session.scalar(
            select(func.max(Recommendation.generated_at)).where(
                Recommendation.kind == kind
            )
        )
    return NextData(
        candidates=[_candidate(row) for row in rows],
        taste=taste,
        public_games=public_games,
        generated_at=generated_at,
    )


async def catalogue_times(session: AsyncSession) -> dict[str, datetime | None]:
    """Each store's last good run, whatever its latest run did; the stalest
    of those is how old the store data may be (the same figures the admin
    Radar list reports)."""
    registry_run = (await latest_runs(session)).get("nscollectors")
    store_times = list(
        await session.scalars(
            select(func.max(CatalogueRun.finished_at))
            .where(CatalogueRun.source.in_(tuple(STORES)), CatalogueRun.ok.is_(True))
            .group_by(CatalogueRun.source)
        )
    )
    return {
        "stores_at": min(store_times, default=None),
        "registry_at": registry_run.finished_at if registry_run else None,
    }
