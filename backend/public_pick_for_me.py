"""GET /api/public/pick-for-me: Pick for me's whole answer in one body.

Every size and mood combination's top three, ranked by
picker.public_pick_table over public rows only (spec
docs/planning/2026-11-06-pick-for-me-design.md). Precomputed, so the
build-time snapshot carries the feature and a visitor's press never waits on
the API; cached on next_fingerprint like /next, so a burst of visitors is one
computation.

What it may not carry: anything private. The profile and the pool are public
rows; the score leaves out waiting (acquired_at), jitter and staleness (the
owner's pick events). A "never" counts only once it is dated before today's
UTC midnight, as on Tonight, so a refusal shows here no sooner than there.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Item, OwnedFormat, PickAction, PickEvent
from picker import PICKER_WEIGHTS, PUBLIC_TERMS, public_pick_table
from picker_routes import to_picker_item
from public_outputs import PICKABLE, _hours, _igdb_url


class PublicPickCard(BaseModel):
    """A picked game, listed once however many combinations pick it. `item_id`,
    not `id`, as on What's next (Spine Next spec, S1)."""

    item_id: uuid.UUID
    title: str
    cover_url: str | None
    platform: str | None
    time_to_beat_hours: float | None
    igdb_url: str | None
    reasons: list[str]


class PublicPickScore(BaseModel):
    """One game's place in one combination: its total and the four terms."""

    item_id: uuid.UUID
    score: float
    terms: dict[str, float]


class PublicPickForMeOut(BaseModel):
    """The whole table. `combos` keys are `<size>|<moods sorted, +-joined>`
    (picker.combo_key); every one of the 88 is present, empty or not.
    tests/test_public_outputs.py walks it for private keys."""

    generated_on: date
    weights: dict[str, int]
    games: dict[str, PublicPickCard]
    combos: dict[str, list[PublicPickScore]]


async def load_pick_for_me(session: AsyncSession, now: datetime) -> PublicPickForMeOut:
    """Builds the body from public rows and the nevers dated before midnight."""
    today = now.astimezone(UTC).date()
    public_rows = list(
        (await session.execute(select(Item).where(Item.is_public.is_(True)))).scalars()
    )
    eligible = [
        row
        for row in public_rows
        if row.owned_format != OwnedFormat.NONE
        and row.status in PICKABLE
        and row.pinned_at is None
    ]
    refused: set[uuid.UUID] = set()
    if eligible:
        midnight = datetime.combine(today, time.min, tzinfo=UTC)
        refused = set(
            (
                await session.execute(
                    select(PickEvent.item_id).where(
                        PickEvent.item_id.in_([row.id for row in eligible]),
                        PickEvent.action == PickAction.NEVER,
                        PickEvent.created_at < midnight,
                    )
                )
            ).scalars()
        )
    rows = {str(row.id): row for row in eligible if row.id not in refused}
    table = public_pick_table(
        [to_picker_item(row) for row in public_rows],
        [to_picker_item(row) for row in rows.values()],
        today,
    )
    return PublicPickForMeOut(
        generated_on=today,
        weights={name: PICKER_WEIGHTS[name] for name in PUBLIC_TERMS},
        games={
            item_id: PublicPickCard(
                item_id=rows[item_id].id,
                title=rows[item_id].title,
                cover_url=rows[item_id].cover_url,
                platform=rows[item_id].platform,
                time_to_beat_hours=_hours(rows[item_id].source_metadata),
                igdb_url=_igdb_url(rows[item_id].source_metadata or {}),
                reasons=list(reasons),
            )
            for item_id, reasons in table.reasons.items()
        },
        combos={
            key: [
                PublicPickScore(
                    item_id=pick.item_id, score=pick.score, terms=pick.terms
                )
                for pick in picks
            ]
            for key, picks in table.combos.items()
        },
    )
