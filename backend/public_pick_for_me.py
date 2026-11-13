"""GET /api/public/pick-for-me: Pick for me's whole answer in one body.

Every size and mood combination's top four, ranked by
picker.public_pick_table over public rows only (spec
docs/planning/2026-11-06-pick-for-me-design.md). Precomputed, so the
build-time snapshot carries the feature and a visitor's press never waits on
the API; cached on next_fingerprint like /next, so a burst of visitors is one
computation.

Four, not three: the page shows three and leaves out Tonight's lead, so a
combination whose top three holds the lead still fills the row.

What it may not carry: anything private. The profile and the pool are public
rows, read through public_picks.load_public_inputs, so Tonight's lanes and
this table rank from the same inputs and the same game pool; the score
leaves out waiting (acquired_at), jitter and staleness (the owner's pick
events). A "never" counts only once it is dated before today's
UTC midnight, as on Tonight, so a refusal shows here no sooner than there.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from picker import PICKER_WEIGHTS, PUBLIC_TERMS, public_pick_table
from public_outputs import _hours, _igdb_url
from public_picks import load_public_inputs, public_pool


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
    """Builds the body from the public set's inputs (public_picks): the
    public rows with their play records as the profile, and the game lane's
    public pool, less the nevers dated before midnight, as the pool."""
    today = now.astimezone(UTC).date()
    inputs = await load_public_inputs(session, now)
    pool = public_pool(inputs.items, inputs.never, "game")
    rows = {item.id: inputs.rows[item.id] for item in pool}
    table = public_pick_table(inputs.items, pool, today)
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
