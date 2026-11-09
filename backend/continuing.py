"""The Continue card: the game being played, as Tonight leads with it.

One builder for two readers. `/api/public/next` (public_outputs.py) calls it
over the public active games, and the admin read on the picker router
(picker_routes.py) over every owned active game, so the hours, the session
count, "last played" and the stale flag are computed in one place and the
client only renders them (Tonight continue spec, Open questions).

Hours and sessions are the journal inside the open run's dates, attributed
as the play-states rule attributes it (playthroughs.attribute_journal). A
card never carries a status key: the What's next body bans one
(tests/test_public_outputs.py, FORBIDDEN).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from models import Item, ItemStatus, ItemType, OwnedFormat
from playthroughs import runs_with_journal

# An active game with no journal day in this long (counted from the open
# run's start when it has no journal at all) is stale: "last played" turns
# amber and the action row asks whether it is still being played. Distinct
# from picker.STALLED_AFTER, which reads shown and pinned events, not the
# journal, and decides the public "Pick it back up" slot.
STALE_DAYS = 21


class ContinuingCard(BaseModel):
    """A game in progress, for the Continue card. `item_id`, not `id`."""

    item_id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    time_to_beat_hours: float | None
    # The open run's number: "Playthrough 2" on a replay.
    playthrough: int
    playing_since: date | None
    last_played_on: date | None
    # Journal inside the open run; None hours when there are no sessions.
    journal_hours: float | None
    sessions: int
    stale: bool


def hours_to_beat(metadata: dict | None) -> float | None:
    """IGDB's "normally" figure, unrounded, or None."""
    time_to_beat = (metadata or {}).get("time_to_beat")
    normally = time_to_beat.get("normally") if isinstance(time_to_beat, dict) else None
    if isinstance(normally, bool) or not isinstance(normally, int | float):
        return None
    return float(normally)


def is_stale(
    playing_since: date | None, last_played_on: date | None, today: date
) -> bool:
    """No journal day (or, without any, no start) within STALE_DAYS."""
    last = last_played_on or playing_since
    return last is not None and today - last >= timedelta(days=STALE_DAYS)


def _sort_key(card: ContinuingCard) -> tuple:
    # Most recent session first, undated last; then the newest start; then
    # the title, so two cards without a journal keep one order.
    return (
        card.last_played_on is None,
        -(card.last_played_on or date.min).toordinal(),
        card.playing_since is None,
        -(card.playing_since or date.min).toordinal(),
        card.title,
    )


async def build_continuing(
    session: AsyncSession, items: list[Item], today: date
) -> list[ContinuingCard]:
    """Continue cards for the active owned games among `items`, most recent
    session first. A NULL owned_format counts as owned, as picker counts it."""
    active = [
        item
        for item in items
        if item.type == ItemType.GAME
        and item.status == ItemStatus.ACTIVE
        and item.owned_format != OwnedFormat.NONE
    ]
    if not active:
        return []
    journal = await runs_with_journal(session, [item.id for item in active])
    cards = []
    for item in active:
        current = next(
            (entry for entry in journal.get(item.id, []) if entry[0].outcome is None),
            None,
        )
        if current is None:
            # An active game always has an open run (playthroughs.apply_status);
            # a row written around the rules still gets a card, undated.
            run, days, minutes, last = None, 0, 0, None
        else:
            run, days, minutes, last = current
        since = run.started_on if run else None
        cards.append(
            ContinuingCard(
                item_id=item.id,
                type=item.type,
                title=item.title,
                cover_url=item.cover_url,
                platform=item.platform,
                time_to_beat_hours=hours_to_beat(item.source_metadata),
                playthrough=run.number if run else 1,
                playing_since=since,
                last_played_on=last,
                # None, not 0.0: Log tonight writes days without minutes,
                # and "0 h over 3 sessions" reads as a bug.
                journal_hours=round(minutes / 60, 1) if minutes else None,
                sessions=days,
                stale=is_stale(since, last, today),
            )
        )
    return sorted(cards, key=_sort_key)
