"""Play Next routes: three picks from the backlog, and what the owner says.

The scoring is picker.py's, and pure. This module only loads rows and events,
turns them into picker's plain data, and records what was shown. A pick request
is a POST because it writes: each game returned is recorded as shown, at most
once per game per UTC day, which is what the staleness decay counts.
"""

from __future__ import annotations

import logging
import random
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from items import require_admin
from models import Item, ItemStatus, OwnedFormat, PickAction, PickEvent
from picker import PickerEvent, PickerItem, PickRequest, recommend
from playthroughs import runs_with_journal

logger = logging.getLogger(__name__)

Mood = Literal["cozy", "story", "action", "creepy", "brainy", "chaotic"]

# Every rule but "never" looks back at most this far (stalled games, 30 days).
EVENT_WINDOW = timedelta(days=30)


class PickNextIn(BaseModel):
    """What the owner asked for; `exclude` is the current reroll's picks."""

    # The retired `time` field is refused, not quietly read as any size.
    model_config = ConfigDict(extra="forbid")

    size: Literal["any", "short", "medium", "long"] = "any"
    moods: list[Mood] = []
    platforms: list[int] = []
    exclude: list[uuid.UUID] = Field(default=[], max_length=200)


class PickItemOut(BaseModel):
    id: uuid.UUID
    title: str
    year: int | None
    cover_url: str | None
    type: str
    platform: str | None
    genres: list[str]
    time_to_beat_hours: float | None


class PickOut(BaseModel):
    slot: str
    slot_label: str
    score: float
    reasons: list[str]
    item: PickItemOut


class PickNextOut(BaseModel):
    picks: list[PickOut]
    candidate_count: int
    profile_size: int


class SkippedTodayOut(BaseModel):
    item_ids: list[uuid.UUID]


class PickEventIn(BaseModel):
    """The owner's answer to a card. Pins go through /api/items/{id}/pin."""

    item_id: uuid.UUID
    action: Literal["skipped", "never"]


def _strings(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(str(entry) for entry in value if entry)


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def to_picker_item(
    item: Item,
    paused_on: date | None = None,
    journal_minutes: int = 0,
    run_started_on: date | None = None,
) -> PickerItem:
    """A row as picker's plain data, reading the snapshot defensively.

    `paused_on`, `journal_minutes` and `run_started_on` describe the open
    run; only Play Next passes them (open_run_details), for a paused game's
    Pick it back up and a stalled game's start.
    """
    snapshot = item.source_metadata or {}
    time_to_beat = snapshot.get("time_to_beat")
    normally = (
        _number(time_to_beat.get("normally"))
        if isinstance(time_to_beat, dict)
        else None
    )
    return PickerItem(
        id=str(item.id),
        title=item.title,
        type=item.type.value,
        status=item.status.value,
        owned=item.owned_format != OwnedFormat.NONE,
        rating=item.rating,
        favorite=item.favorite,
        pinned=item.pinned_at is not None,
        external_id=item.external_id if item.external_source == "igdb" else None,
        year=item.year,
        cover_url=item.cover_url,
        platform_id=item.platform_id,
        platform=item.platform,
        creator=item.creator,
        genres=_strings(snapshot.get("genres")),
        themes=_strings(snapshot.get("themes")),
        keywords=_strings(snapshot.get("keywords")),
        game_modes=_strings(snapshot.get("game_modes")),
        player_perspectives=_strings(snapshot.get("player_perspectives")),
        similar_games=_strings(snapshot.get("similar_games")),
        community_score=_number(snapshot.get("community_score")),
        time_to_beat_hours=normally,
        release_date=item.release_date,
        acquired_at=item.acquired_at,
        started_at=item.started_at,
        finished_at=item.finished_at,
        paused_on=paused_on,
        journal_minutes=journal_minutes,
        run_started_on=run_started_on,
    )


async def open_run_details(
    session: AsyncSession, rows: list[Item]
) -> dict[uuid.UUID, tuple[date | None, int, date | None]]:
    """Each in-progress game's open run: (pause date, journal minutes, start).

    Pause date and minutes only for a paused game; the start for both, since
    `started_at` is the first run's and a replay's own start is on its run.
    """
    status = {row.id: row.status for row in rows}
    open_ids = [
        row.id for row in rows if row.status in (ItemStatus.ACTIVE, ItemStatus.PAUSED)
    ]
    details = {}
    for item_id, runs in (await runs_with_journal(session, open_ids)).items():
        for run, _days, minutes in runs:
            if run.outcome is not None:
                continue
            if status[item_id] == ItemStatus.PAUSED:
                details[item_id] = (run.paused_on, minutes, run.started_on)
            else:
                details[item_id] = (None, 0, run.started_on)
    return details


def create_picker_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the Play Next routes; admin only, like everything that writes."""
    router = APIRouter(
        prefix="/api/picker",
        tags=["picker"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    def _today_midnight() -> datetime:
        return datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)

    @router.post("/next", response_model=PickNextOut)
    async def pick_next(
        payload: PickNextIn,
        session: AsyncSession = Depends(get_session),
    ) -> PickNextOut:
        """Three named picks, recorded as shown.

        No candidates is an answer, not an error: the page offers to drop the
        moods instead.
        """
        now = datetime.now(UTC)
        rows = list((await session.execute(select(Item))).scalars())
        open_runs = await open_run_details(session, rows)
        # "never" is permanent, so it is loaded whatever its age; every other
        # rule looks back a month at most.
        event_rows = (
            await session.execute(
                select(PickEvent).where(
                    or_(
                        PickEvent.action == PickAction.NEVER,
                        PickEvent.created_at >= now - EVENT_WINDOW,
                    )
                )
            )
        ).scalars()
        events = [
            PickerEvent(
                item_id=str(event.item_id),
                action=event.action.value,
                created_at=event.created_at,
            )
            for event in event_rows
        ]
        request = PickRequest(
            size=payload.size,
            moods=tuple(payload.moods),
            platforms=tuple(payload.platforms),
            exclude=tuple(str(item_id) for item_id in payload.exclude),
        )
        result = recommend(
            [
                to_picker_item(row, *open_runs.get(row.id, (None, 0, None)))
                for row in rows
            ],
            events,
            request,
            now,
            random.Random(),
        )

        midnight = datetime.combine(now.date(), time.min, tzinfo=UTC)
        shown_today = {
            event.item_id
            for event in events
            if event.action == "shown" and event.created_at >= midnight
        }
        for pick in result.picks:
            if pick.item.id not in shown_today:
                session.add(
                    PickEvent(
                        item_id=uuid.UUID(pick.item.id),
                        action=PickAction.SHOWN,
                        slot=pick.slot,
                    )
                )
        await session.commit()
        logger.info(
            "play next: %s picks from %s candidates",
            len(result.picks),
            result.candidate_count,
        )

        return PickNextOut(
            picks=[
                PickOut(
                    slot=pick.slot,
                    slot_label=pick.slot_label,
                    score=pick.score,
                    reasons=list(pick.reasons),
                    item=PickItemOut(
                        id=uuid.UUID(pick.item.id),
                        title=pick.item.title,
                        year=pick.item.year,
                        cover_url=pick.item.cover_url,
                        type=pick.item.type,
                        platform=pick.item.platform,
                        genres=list(pick.item.genres),
                        time_to_beat_hours=pick.item.time_to_beat_hours,
                    ),
                )
                for pick in result.picks
            ],
            candidate_count=result.candidate_count,
            profile_size=result.profile_size,
        )

    @router.post("/events", status_code=204)
    async def record_event(
        payload: PickEventIn,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Records "not tonight" (a week out) or "never suggest"."""
        if await session.get(Item, payload.item_id) is None:
            raise HTTPException(status_code=404, detail="Not found")
        session.add(
            PickEvent(item_id=payload.item_id, action=PickAction(payload.action))
        )
        await session.commit()
        return Response(status_code=204)

    @router.delete("/events/{item_id}/never", status_code=204)
    async def restore(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Undoes "never suggest". Idempotent: restoring twice is fine."""
        await session.execute(
            delete(PickEvent).where(
                PickEvent.item_id == item_id, PickEvent.action == PickAction.NEVER
            )
        )
        await session.commit()
        return Response(status_code=204)

    @router.get("/skipped-today", response_model=SkippedTodayOut)
    async def skipped_today(
        session: AsyncSession = Depends(get_session),
    ) -> SkippedTodayOut:
        """The games answered "not tonight" since UTC midnight, for Tonight's
        owner view to leave out until the snapshot catches up."""
        item_ids = (
            await session.execute(
                select(PickEvent.item_id)
                .where(
                    PickEvent.action == PickAction.SKIPPED,
                    PickEvent.created_at >= _today_midnight(),
                )
                .distinct()
                .order_by(PickEvent.item_id)
            )
        ).scalars()
        return SkippedTodayOut(item_ids=list(item_ids))

    @router.delete("/events/{item_id}/skipped", status_code=204)
    async def undo_skip(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Undoes today's "not tonight". Earlier skips stand, so an Undo never
        reaches back past the day it was offered. Idempotent."""
        await session.execute(
            delete(PickEvent).where(
                PickEvent.item_id == item_id,
                PickEvent.action == PickAction.SKIPPED,
                PickEvent.created_at >= _today_midnight(),
            )
        )
        await session.commit()
        return Response(status_code=204)

    return router
