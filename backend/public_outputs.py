"""Public, read-only outputs of Play Next and Radar (showcase spec, D).

Outputs, never inputs or state: which public games were picked recently and
why, and which cartridges are coming. Nothing here writes, generates or spends
quota; both read what the admin tools already stored. The models are
allowlists, as in public.py, and tests/test_public_outputs.py pins them.

Registered on the public router (public.py) rather than a router of its own,
so "the one unauthenticated router" stays one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    PickAction,
    PickEvent,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from picker import public_reasons
from picker_routes import to_picker_item
from radar import NEAR_PRECISIONS

# Picks from the most recent UTC day Play Next showed a public suggestion, if
# that day is one of the seven ending yesterday; older picks are not "recent"
# and the section hides. Today never counts (see load_public_picks).
PICKS_WINDOW = timedelta(days=7)
PICKS_LIMIT = 3
PICKABLE = (ItemStatus.BACKLOG, ItemStatus.ACTIVE)


class PublicPickOut(BaseModel):
    """A recent Play Next pick as the public sees it: the game, and why.

    No slot, score, date or event: those describe the owner's use of the
    tool, not the game.
    """

    id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    reasons: list[str]


async def load_public_picks(
    session: AsyncSession, now: datetime
) -> list[PublicPickOut]:
    """Up to three public, owned, unpinned backlog or active games shown on
    the most recent day Play Next showed a game that is still a public
    suggestion, in title order, with reasons from public rows.

    The list changes at most once a day. Only events before today's UTC
    midnight count -- shown, skipped and never alike -- and the day's picks
    are ordered by title, not by when they were shown. Otherwise anyone
    polling this route could watch the owner use Play Next, skip a game or
    refuse one as it happened. The one residual live change is accepted: the
    admin restore route deletes a never event outright, so a restored game
    can return the moment it is restored.

    The day is chosen among those games only: a private, pinned or refused
    game shown later must not move it, or the list would change with rows the
    public cannot see. A game the owner said "never" to, or skipped at or
    after the moment it was shown, is not a suggestion any more.
    """
    public_rows = list(
        (await session.execute(select(Item).where(Item.is_public.is_(True)))).scalars()
    )
    eligible = {
        row.id: row
        for row in public_rows
        if row.owned_format != OwnedFormat.NONE
        and row.status in PICKABLE
        and row.pinned_at is None
    }
    if not eligible:
        return []
    midnight = datetime.combine(now.astimezone(UTC).date(), time.min, tzinfo=UTC)
    window_start = midnight - PICKS_WINDOW
    events = (
        await session.execute(
            select(PickEvent.item_id, PickEvent.action, PickEvent.created_at).where(
                PickEvent.item_id.in_(list(eligible)),
                PickEvent.action.in_(
                    (PickAction.SHOWN, PickAction.NEVER, PickAction.SKIPPED)
                ),
                PickEvent.created_at < midnight,
            )
        )
    ).all()
    never = {item_id for item_id, action, _ in events if action == PickAction.NEVER}
    skipped_at: dict[uuid.UUID, list[datetime]] = {}
    for item_id, action, at in events:
        if action == PickAction.SKIPPED:
            skipped_at.setdefault(item_id, []).append(at)
    suggestions = [
        (item_id, at)
        for item_id, action, at in events
        if action == PickAction.SHOWN
        and at >= window_start
        and item_id not in never
        and not any(skip >= at for skip in skipped_at.get(item_id, ()))
    ]
    if not suggestions:
        return []
    day = max(at.astimezone(UTC).date() for _, at in suggestions)
    shown = {item_id for item_id, at in suggestions if at.astimezone(UTC).date() == day}
    ordered = sorted(
        (eligible[item_id] for item_id in shown), key=lambda row: (row.title, row.id)
    )
    picks = ordered[:PICKS_LIMIT]
    profile = [to_picker_item(row) for row in public_rows]
    return [
        PublicPickOut(
            id=row.id,
            type=row.type,
            title=row.title,
            cover_url=row.cover_url,
            platform=row.platform,
            reasons=list(public_reasons(to_picker_item(row), profile)),
        )
        for row in picks
    ]


RADAR_LIMIT = 6
IGDB_URL_PREFIX = "https://www.igdb.com/"


class PublicRadarOut(BaseModel):
    """An upcoming cartridge from Radar, as the public sees it.

    Deliberately not a recommendation: no store, price, currency,
    availability, store link, pre-order window, score, reason or id. Those
    are the owner's shopping, and the store data is read under robots.txt
    courtesy for private use (showcase review, Part 2).
    """

    title: str
    platform: str | None
    physical_format: PhysicalFormat
    release_date: date
    release_precision: str
    igdb_url: str | None
    cover_url: str | None


def _igdb_url(metadata: dict) -> str | None:
    """IGDB's own page URL from the snapshot, or None. Anything not on
    igdb.com is dropped rather than published as a link."""
    snapshot = metadata.get("snapshot")
    url = snapshot.get("url") if isinstance(snapshot, dict) else None
    return url if isinstance(url, str) and url.startswith(IGDB_URL_PREFIX) else None


async def load_public_radar(session: AsyncSession, today: date) -> list[PublicRadarOut]:
    """The six best-scored pending Radar suggestions that are full cartridges
    dated to a day or month after today, soonest first.

    Pending only: a wanted game is already an item and shows in "On the
    radar"; dismissed and owned ones are answered. Discover never appears.

    Registry-dated only: a date from a store listing (often parsed from its
    page) is store data and stays private, and IGDB's first release date is
    for any platform. It fails closed: a row stored before `release_source`
    was recorded stays hidden until the next Radar Generate.
    """
    rows = (
        await session.execute(
            select(Recommendation)
            .where(
                Recommendation.kind == RecommendationKind.RADAR,
                Recommendation.status == RecommendationStatus.PENDING,
                Recommendation.physical_format == PhysicalFormat.GAME_CARD,
                Recommendation.release_date > today,
            )
            .order_by(Recommendation.score.desc(), Recommendation.title)
        )
    ).scalars()
    near = [
        row
        for row in rows
        if (row.source_metadata or {}).get("release_precision") in NEAR_PRECISIONS
        and (row.source_metadata or {}).get("release_source") == "registry"
    ][:RADAR_LIMIT]
    near.sort(key=lambda row: (row.release_date, row.title))
    return [
        PublicRadarOut(
            title=row.title,
            platform=row.platform,
            physical_format=row.physical_format,
            release_date=row.release_date,
            release_precision=row.source_metadata["release_precision"],
            igdb_url=_igdb_url(row.source_metadata),
            cover_url=row.cover_url,
        )
        for row in near
    ]
