"""The public set: Tonight's picks, Read next and Watch next, live.

Recommendation engine spec, "The public set is live". The set is a pure
function of public rows (every type, with their play records), the "never"
events dated before today's UTC midnight, and the UTC day:

- the profile is built over public rows only, so a reason can name nothing
  private;
- each strategy's public pool is scored on LANE_TERMS -- no waiting (it
  reads the private acquired_at) and no staleness (it reads the owner's
  events) -- with jitter seeded by the day, so every visitor sees one list
  and it moves at most once a day unless the shelf itself changes;
- diversity (picker.next_diverse) runs against the last public finish of
  the lane's type.

Nothing here reads a shown, skipped or pinned event, so using Play Next
changes nothing on the public page; finishing a game does, in the same
refetch that changes the Just finished chip. Pick for me
(public_pick_for_me.py) reads the same inputs through load_public_inputs.

Slots on the public page (spec, "Slots on the public page"): Best fit is the
top pick; Change of pace is the second, diverse game pick, labelled only
when the last public finish exists and change_of_pace_reason has something
to say against it (that reason leads); Overdue classic is the third game
pick when one at or above the median affinity has a release date, oldest
first ("Out since 1999" leads). Waited longest and Pick it back up read
private data and are never public. Anything else stands unlabelled.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from facets import facets_of
from models import Item, PickAction, PickEvent
from picker import (
    LANE_TERMS,
    MAX_REASONS,
    SLOT_LABELS,
    PickRequest,
    Scored,
    Taste,
    _common_reasons,
    _median,
    _slot_reason,
    build_taste,
    candidates,
    change_of_pace_reason,
    last_finish,
    next_diverse,
    score_pool,
)
from picker_items import PickerItem
from picker_routes import load_play_records, to_picker_item
from strategies import PUBLIC, strategy_for

# How many picks each lane publishes (spec, "Tonight on /shelf/next").
LANE_SIZES = {"game": 3, "comic": 2, "movie": 2}


@dataclass(frozen=True)
class PublicPick:
    """One public pick: the item, its public slot (None when no label's
    premise is public and true) and its reasons, first person."""

    item: PickerItem
    slot: str | None
    slot_label: str | None
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class PublicInputs:
    """Everything the public set reads: public rows by id, the same rows as
    picker items (with their play records), and the refused ids."""

    rows: dict[str, Item]
    items: list[PickerItem]
    never: frozenset[str]


@dataclass(frozen=True)
class PublicSets:
    game: list[PublicPick]
    comic: list[PublicPick]
    movie: list[PublicPick]
    profile: list[PickerItem]
    rows: dict[str, Item]


async def load_public_inputs(session: AsyncSession, now: datetime) -> PublicInputs:
    """Public rows of every type, their play records, and the nevers dated
    before today's UTC midnight (a refusal shows tomorrow, not as it
    happens, so the page cannot be watched for it)."""
    rows = list(
        (await session.execute(select(Item).where(Item.is_public.is_(True)))).scalars()
    )
    if not rows:
        return PublicInputs(rows={}, items=[], never=frozenset())
    ids = [row.id for row in rows]
    plays = await load_play_records(session, ids)
    midnight = datetime.combine(now.astimezone(UTC).date(), time.min, tzinfo=UTC)
    never = (
        await session.execute(
            select(PickEvent.item_id).where(
                PickEvent.item_id.in_(ids),
                PickEvent.action == PickAction.NEVER,
                PickEvent.created_at < midnight,
            )
        )
    ).scalars()
    return PublicInputs(
        rows={str(row.id): row for row in rows},
        items=[to_picker_item(row, play=plays.get(row.id)) for row in rows],
        never=frozenset(str(item_id) for item_id in never),
    )


def public_pool(items: list[PickerItem], never: frozenset[str], item_type: str):
    """The public candidates of one type: its strategy's public pool, less
    the refused. No events beyond the nevers are read."""
    # No events go in, so candidates never compares against `now`.
    now = datetime.min.replace(tzinfo=UTC)
    return [
        item
        for item in candidates(items, [], PickRequest(type=item_type), now, PUBLIC)
        if item.id not in never
    ]


def _lane(
    items: list[PickerItem],
    never: frozenset[str],
    taste: Taste,
    item_type: str,
    today: date,
) -> list[PublicPick]:
    strategy = strategy_for(item_type)
    pool = public_pool(items, never, item_type)
    if not pool:
        return []
    ranked = score_pool(pool, taste, strategy, "any", today, terms=LANE_TERMS)
    last = last_finish(items, item_type)
    last_facets = facets_of(last) if last else frozenset()
    slots = strategy.slots(PUBLIC)
    count = LANE_SIZES.get(item_type, 0)

    chosen: list[tuple[str | None, Scored]] = [("best_fit", ranked[0])]
    while len(chosen) < count:
        picked = [entry for _slot, entry in chosen]
        slot, entry = None, None
        if len(chosen) == 1:
            entry = next_diverse(ranked, picked, last_facets)
            if (
                entry is not None
                and "change_of_pace" in slots
                and last is not None
                and change_of_pace_reason(entry.item, last) is not None
            ):
                slot = "change_of_pace"
        elif len(chosen) == 2 and "overdue_classic" in slots:
            median = _median([e.terms["affinity"] for e in ranked])
            taken = {e.item.id for e in picked}
            released = sorted(
                (
                    e
                    for e in ranked
                    if e.item.id not in taken
                    and e.item.release_date is not None
                    and e.terms["affinity"] >= median
                ),
                key=lambda e: (e.item.release_date, e.item.title, e.item.id),
            )
            entry = next_diverse(released, picked, last_facets) if released else None
            slot = "overdue_classic" if entry is not None else None
        if entry is None:
            entry = next_diverse(ranked, picked, last_facets)
        if entry is None:
            break
        chosen.append((slot, entry))

    picks = []
    for slot, entry in chosen:
        reasons = _common_reasons(
            entry.item, entry.leading, entry.similar_to, taste, today
        )
        reasons.insert(0, _slot_reason(slot, entry.item, last, today))
        picks.append(
            PublicPick(
                item=entry.item,
                slot=slot,
                slot_label=SLOT_LABELS[slot] if slot else None,
                reasons=tuple(reason for reason in reasons if reason)[:MAX_REASONS],
            )
        )
    return picks


def build_public_sets(
    items: list[PickerItem],
    never: frozenset[str],
    today: date,
) -> dict[str, list[PublicPick]]:
    """Every lane's picks, pure: `items` must be public rows only (they are
    the profile and the pool), `never` the ids refused before midnight.

    Change of pace is measured against the last public finish, never the
    last finish over every row: nothing about a private finish, not even
    that one exists, reaches the page.
    """
    taste = build_taste(items, today)
    return {
        item_type: _lane(items, never, taste, item_type, today)
        for item_type in LANE_SIZES
    }


async def public_picks(session: AsyncSession, now: datetime) -> PublicSets:
    """The live public set."""
    inputs = await load_public_inputs(session, now)
    sets = build_public_sets(inputs.items, inputs.never, now.astimezone(UTC).date())
    return PublicSets(
        game=sets["game"],
        comic=sets["comic"],
        movie=sets["movie"],
        profile=inputs.items,
        rows=inputs.rows,
    )


__all__ = [
    "LANE_SIZES",
    "PublicInputs",
    "PublicPick",
    "PublicSets",
    "build_public_sets",
    "load_public_inputs",
    "public_picks",
    "public_pool",
]
