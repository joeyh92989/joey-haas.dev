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
from sqlalchemy import func, select
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
    the most recent pick day, latest first, with reasons from public rows.

    A game the owner said "never" to, or skipped after it was shown, is not
    a suggestion any more and is left out.
    """
    latest = await session.scalar(
        select(func.max(PickEvent.created_at)).where(
            PickEvent.action == PickAction.SHOWN
        )
    )
    if latest is None:
        return []
    day = latest.astimezone(UTC).date()
    if now.astimezone(UTC).date() - day >= PICKS_WINDOW:
        return []
    start = datetime.combine(day, time.min, tzinfo=UTC)
    shown = dict(
        (
            await session.execute(
                select(PickEvent.item_id, func.max(PickEvent.created_at))
                .where(
                    PickEvent.action == PickAction.SHOWN,
                    PickEvent.created_at >= start,
                    PickEvent.created_at < start + timedelta(days=1),
                )
                .group_by(PickEvent.item_id)
            )
        ).all()
    )
    answers = (
        await session.execute(
            select(PickEvent.item_id, PickEvent.action, PickEvent.created_at).where(
                PickEvent.item_id.in_(list(shown)),
                PickEvent.action.in_((PickAction.NEVER, PickAction.SKIPPED)),
            )
        )
    ).all()
    refused = {
        item_id
        for item_id, action, at in answers
        if action == PickAction.NEVER or at >= shown[item_id]
    }
    public_rows = list(
        (await session.execute(select(Item).where(Item.is_public.is_(True)))).scalars()
    )
    picks = sorted(
        (
            row
            for row in public_rows
            if row.id in shown
            and row.id not in refused
            and row.owned_format != OwnedFormat.NONE
            and row.status in PICKABLE
            and row.pinned_at is None
        ),
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
