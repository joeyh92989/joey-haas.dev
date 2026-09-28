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
from datetime import UTC, datetime, time, timedelta

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Item, ItemStatus, ItemType, OwnedFormat, PickAction, PickEvent
from picker import public_reasons
from picker_routes import to_picker_item

# Picks from the most recent UTC day Play Next showed anything, if that day is
# within this window; older picks are not "recent" and the section hides.
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
    suggestion, latest first, with reasons from public rows.

    The day is chosen among those games only: a private, pinned or refused
    game shown later must not move it, or the list would change with rows the
    public cannot see. A game the owner said "never" to, or skipped after it
    was shown, is not a suggestion any more.
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
    window_start = datetime.combine(
        now.astimezone(UTC).date() - PICKS_WINDOW + timedelta(days=1),
        time.min,
        tzinfo=UTC,
    )
    events = (
        await session.execute(
            select(PickEvent.item_id, PickEvent.action, PickEvent.created_at).where(
                PickEvent.item_id.in_(list(eligible)),
                PickEvent.action.in_(
                    (PickAction.SHOWN, PickAction.NEVER, PickAction.SKIPPED)
                ),
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
    shown: dict[uuid.UUID, datetime] = {}
    for item_id, at in suggestions:
        if at.astimezone(UTC).date() == day:
            shown[item_id] = max(at, shown.get(item_id, at))
    picks = sorted(
        (eligible[item_id] for item_id in shown),
        key=lambda row: (-shown[row.id].timestamp(), row.title),
    )[:PICKS_LIMIT]
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
