"""What's next's database side: suggestions as NextCandidates, and Play
Next's profile split into public and private (Spine Next spec, K9).

Shared by GET /api/public/next and GET /api/recommendations/store-list, so
the two read the same rows the same way. next_list.py decides everything.
The one difference is which rows: the admin list is live (pending only),
while the public sections are frozen to each kind's latest batch, Radar's
per platform (spec, S9).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import and_, func, or_, select
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
    private_games: list[Item] = field(default_factory=list)


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


async def _frozen_batches(session: AsyncSession) -> list:
    """Where the public page keeps answered rows: per group, the batches of
    its latest generation (every batch at its newest `generated_at`, so a
    tie cannot hide one), and only while that generation still has a
    pending row in the group.

    Radar groups per (kind, platform), because it replaces pending rows only
    on the platforms a generate covered, so another platform's generation is
    not over. Discover groups per kind: every generate replaces all of its
    pending picks, whatever the platform, so answering a platform's only
    pick must not end that platform's freeze. Fails closed: a generation
    with nothing pending left (a generate that wrote no rows deleted them,
    or the owner answered every one) shows none of its answered rows, which
    would otherwise be exactly what was answered.
    """
    groups: dict[tuple, dict] = {}
    for kind, platform_id, batch_id, at, status in await session.execute(
        select(
            Recommendation.kind,
            Recommendation.platform_id,
            Recommendation.batch_id,
            Recommendation.generated_at,
            Recommendation.status,
        )
    ):
        per_platform = kind == RecommendationKind.RADAR
        key = (kind, platform_id if per_platform else None)
        group = groups.setdefault(key, {"at": at, "rows": []})
        group["at"] = max(group["at"], at)
        group["rows"].append((batch_id, at, status))
    frozen = []
    for (kind, platform_id), group in groups.items():
        latest = [row for row in group["rows"] if row[1] == group["at"]]
        if any(status == RecommendationStatus.PENDING for _, _, status in latest):
            where = [
                Recommendation.kind == kind,
                Recommendation.batch_id.in_({batch for batch, _, _ in latest}),
            ]
            if platform_id is not None:
                where.append(Recommendation.platform_id == platform_id)
            frozen.append(and_(*where))
    return frozen


async def load_next(session: AsyncSession, *, public: bool = False) -> NextData:
    """Radar and Discover rows, and the games a reason may name.

    Admin (the default): pending rows only, so an answer leaves the list at
    once. Public: pending rows plus the answered rows of each kind's latest
    generation (Radar's per platform) while it has a pending row left (see
    _frozen_batches), so answering a game does not change the public page;
    it leaves when a new generation runs (spec, S9). Generation skips
    answered rows, which keep their batch, so a new batch ends them.
    Nothing on a row tells the public an answered row from a pending one.
    """
    shown = Recommendation.status == RecommendationStatus.PENDING
    if public:
        shown = or_(shown, *await _frozen_batches(session))
    rows = list(
        await session.scalars(
            select(Recommendation)
            .where(shown)
            .order_by(
                Recommendation.score.desc(),
                Recommendation.title,
                Recommendation.platform_id,
                Recommendation.external_id,
            )
        )
    )
    games = list(await session.scalars(select(Item).where(Item.type == ItemType.GAME)))
    public_games = [item for item in games if item.is_public]
    private_games = [item for item in games if not item.is_public]
    taste = public_taste(
        [to_picker_item(item) for item in public_games],
        [item.title for item in private_games],
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
        private_games=private_games,
    )


def _identity(row: Recommendation) -> tuple[str, str, int]:
    return (row.external_source, row.external_id, row.platform_id)


def taste_sparing_owned(data: NextData, shown: list[Recommendation]) -> PublicTaste:
    """The public taste, with the private-title scan lifted for exactly the
    games the owner answered Already own on in the frozen batch (spec, S9).

    Already own creates a private item carrying the row's IGDB id and
    platform (recommendations_routes._add_item), and the frozen row stays
    on the page by name until the next generation, so scanning reasons for
    that item would only refuse a frozen sentence the moment the owner
    answered. The match is by identity, never by title: the item's
    (external_source, external_id) and, where it has one, its platform must
    match an owned candidate row, and a row of that same game must be among
    `shown`, the rows the page renders. Every other private title, a
    same-titled remake or a game with no IGDB link among them, is scanned.
    """
    owned = {
        _identity(c.payload)
        for c in data.candidates
        if c.payload.status == RecommendationStatus.OWNED
    }
    spared = owned & {_identity(row) for row in shown}

    def is_spared(item: Item) -> bool:
        if item.external_source is None or item.external_id is None:
            return False
        return any(
            (source, external_id) == (item.external_source, item.external_id)
            and item.platform_id in (None, platform_id)
            for source, external_id, platform_id in spared
        )

    return public_taste(
        [to_picker_item(item) for item in data.public_games],
        [item.title for item in data.private_games if not is_spared(item)],
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
