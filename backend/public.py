"""The public, read-only view of the collection.

The only unauthenticated router in the application, and the only part of the
public site that calls the API at all -- every other public page ships its
content in the frontend bundle so it renders while the free-tier backend is
asleep.

Everything here is deliberately an allowlist. The response model names the
fields that may be published rather than serializing the ORM object, because
the failure mode of the latter is silent: adding a private column later would
publish it with no code change, no review signal, and no failing test.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Item, ItemStatus, ItemType

# Lifted out of the source_metadata snapshot rather than publishing the
# snapshot itself: its shape varies per source and may carry fields nobody
# reviewed for publication.
PUBLIC_METADATA_FIELDS = ("genres", "community_score")


class PublicItemOut(BaseModel):
    """An item as the public site may see it.

    Written by hand. `notes` and `owned_format` are absent by construction --
    what someone privately thought of a film, and whether they own it, are not
    part of a showcase.
    """

    id: uuid.UUID
    type: ItemType
    title: str
    year: int | None
    creator: str | None
    cover_url: str | None
    status: ItemStatus
    rating: int | None
    favorite: bool
    finished_at: date | None
    genres: list[str]
    community_score: float | None


class PublicStatsOut(BaseModel):
    """Aggregates over the public rows only."""

    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]
    rating_histogram: dict[str, int]
    finishes_by_month: dict[str, int]


def _to_public(item: Item) -> PublicItemOut:
    """Maps a row onto the publishable fields, and only those."""
    snapshot = item.source_metadata or {}
    genres = snapshot.get("genres") or []
    score = snapshot.get("community_score")
    return PublicItemOut(
        id=item.id,
        type=item.type,
        title=item.title,
        year=item.year,
        creator=item.creator,
        cover_url=item.cover_url,
        status=item.status,
        rating=item.rating,
        favorite=item.favorite,
        finished_at=item.finished_at,
        genres=[str(genre) for genre in genres if genre],
        community_score=float(score) if isinstance(score, int | float) else None,
    )


def create_public_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the unauthenticated collection routes.

    Deliberately has no require_admin dependency. Every query filters on
    is_public, so the gate is the data rather than the caller.
    """
    router = APIRouter(prefix="/api/public", tags=["public"])

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    @router.get("/items", response_model=list[PublicItemOut])
    async def list_public_items(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicItemOut]:
        """Every item flagged public, most recently finished first."""
        statement = (
            select(Item)
            .where(Item.is_public.is_(True))
            .order_by(Item.finished_at.desc().nullslast(), Item.created_at.desc())
        )
        result = await session.execute(statement)
        return [_to_public(item) for item in result.scalars()]

    @router.get("/stats", response_model=PublicStatsOut)
    async def public_stats(
        session: AsyncSession = Depends(get_session),
    ) -> PublicStatsOut:
        """Counts over public rows, computed in SQL.

        Aggregated by the database rather than by loading every row into
        Python: the page renders these next to the grid, and a collection is
        expected to outgrow the point where counting in the application is
        reasonable.
        """
        public = Item.is_public.is_(True)

        by_type = await session.execute(
            select(Item.type, func.count()).where(public).group_by(Item.type)
        )
        by_status = await session.execute(
            select(Item.status, func.count()).where(public).group_by(Item.status)
        )
        ratings = await session.execute(
            select(Item.rating, func.count())
            .where(public, Item.rating.is_not(None))
            .group_by(Item.rating)
        )
        month = func.to_char(Item.finished_at, "YYYY-MM")
        finishes = await session.execute(
            select(month, func.count())
            .where(public, Item.finished_at.is_not(None))
            .group_by(month)
            .order_by(month)
        )

        type_counts = {row[0].value: row[1] for row in by_type}
        return PublicStatsOut(
            total=sum(type_counts.values()),
            by_type=type_counts,
            by_status={row[0].value: row[1] for row in by_status},
            rating_histogram={str(row[0]): row[1] for row in ratings},
            finishes_by_month={row[0]: row[1] for row in finishes},
        )

    return router
