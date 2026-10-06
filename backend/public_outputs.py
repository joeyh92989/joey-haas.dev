"""The public What's next output (Spine Next spec), built from Play Next's
and Radar's stored rows.

Outputs, never inputs or state: tonight's games, the wanted list and what to
look for in a store. Nothing here writes, generates or spends quota; it
reads what the admin tools already stored. The models are allowlists, as in
public.py, and tests/test_public_outputs.py pins them. (The separate picks and
radar endpoints were retired in favour of /api/public/next.)

Registered on the public router (public.py) rather than a router of its own,
so "the one unauthenticated router" stays one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta

from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    PickAction,
    PickEvent,
    ReasonSource,
    RecommendationKind,
)
from next_list import (
    NextEntry,
    PublicTaste,
    catalogue_item,
    public_reasons_for,
    sections,
)
from next_load import catalogue_times, load_next, taste_sparing_owned
from picker import public_reasons
from picker_routes import to_picker_item
from sources.igdb import IGDB_URL_PREFIX

# Picks from the most recent UTC day Play Next showed a public suggestion, if
# that day is one of the seven ending yesterday; older picks are not "recent"
# and the section hides. Today never counts (see public_picks_with_day).
PICKS_WINDOW = timedelta(days=7)
PICKS_LIMIT = 3
PICKABLE = (ItemStatus.BACKLOG, ItemStatus.ACTIVE)


class _PickRow(BaseModel):
    """A recent Play Next pick on its way to a tonight card: the game, and why.

    No slot, score, date or event: those describe the owner's use of the
    tool, not the game. Never a response model; PublicTonightCard is.
    """

    id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    reasons: list[str]


async def public_picks_with_day(
    session: AsyncSession, now: datetime
) -> tuple[date | None, list[_PickRow]]:
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

    Returns that day too, or None when there are no picks: What's next
    names it as when the picks were made.
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
        return None, []
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
                # A never is permanent, while shown and skipped events matter
                # only inside the window (a skip counts only at or after a
                # windowed shown event).
                or_(
                    PickEvent.action == PickAction.NEVER,
                    PickEvent.created_at >= window_start,
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
        return None, []
    day = max(at.astimezone(UTC).date() for _, at in suggestions)
    shown = {item_id for item_id, at in suggestions if at.astimezone(UTC).date() == day}
    ordered = sorted(
        (eligible[item_id] for item_id in shown), key=lambda row: (row.title, row.id)
    )
    picks = ordered[:PICKS_LIMIT]
    profile = [to_picker_item(row) for row in public_rows]
    return day, [
        _PickRow(
            id=row.id,
            type=row.type,
            title=row.title,
            cover_url=row.cover_url,
            platform=row.platform,
            reasons=list(public_reasons(to_picker_item(row), profile)),
        )
        for row in picks
    ]


def _igdb_url(metadata: dict) -> str | None:
    """IGDB's own page URL from the snapshot, or None. Anything not on
    igdb.com is dropped rather than published as a link."""
    snapshot = metadata.get("snapshot")
    url = snapshot.get("url") if isinstance(snapshot, dict) else None
    return url if isinstance(url, str) and url.startswith(IGDB_URL_PREFIX) else None


class PublicTonightCard(BaseModel):
    """A public game for tonight: Up next or a recent pick. `item_id`, not
    `id`, so the What's next body carries no key named id (spec, S1)."""

    item_id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    reasons: list[str]


class PublicTonight(BaseModel):
    """Tonight: the pinned Up next game, if any, and Play Next's recent picks."""

    up_next: PublicTonightCard | None
    picks: list[PublicTonightCard]


class PublicNextRow(BaseModel):
    """A game on What's next. Never a store, price, stock, pre-order window,
    score, rank, lane or recommendation id (spec, B5). `item_id` is set only
    on the wanted list, whose rows are public items."""

    title: str
    platform: str | None
    physical_format: PhysicalFormat | None
    release_date: date | None
    release_precision: str | None
    cover_url: str | None
    igdb_url: str | None
    reasons: list[str]
    top_pick: bool
    new: bool
    item_id: uuid.UUID | None = None


class PublicNextGenerated(BaseModel):
    """How old each part of What's next is, as UTC days: the picks' day, the
    stalest store's last good run, and the latest Radar and Discover
    generates. Days, never times: a timestamp would say when the owner was
    at the admin pages."""

    picks: date | None
    catalogue: date | None
    radar: date | None
    discover: date | None


def _utc_day(when: datetime | None) -> date | None:
    return when.astimezone(UTC).date() if when is not None else None


class PublicNextOut(BaseModel):
    """GET /api/public/next: tonight, the wanted list, and the four store
    sections. tests/test_public_outputs.py pins the fields and walks the
    body for private keys."""

    generated_at: PublicNextGenerated
    tonight: PublicTonight
    wanted: list[PublicNextRow]
    buy_now: list[PublicNextRow]
    preorders: list[PublicNextRow]
    later: list[PublicNextRow]
    not_on_cartridge: list[PublicNextRow]


def _next_row(entry: NextEntry, taste: PublicTaste) -> PublicNextRow:
    """One sectioned suggestion as the public sees it. The date is the one
    sectioning chose to show (registry only, in public mode), and reasons
    are rebuilt by public_reasons_for, never the stored store lines."""
    row = entry.candidate.payload
    meta = row.source_metadata or {}
    snapshot = meta.get("snapshot") if isinstance(meta.get("snapshot"), dict) else {}
    item = catalogue_item(
        row.external_id, row.title, snapshot, row.platform_id, row.release_date
    )
    return PublicNextRow(
        title=row.title,
        platform=row.platform,
        physical_format=row.physical_format,
        release_date=entry.date_shown,
        release_precision=meta.get("release_precision") if entry.date_shown else None,
        cover_url=row.cover_url,
        igdb_url=_igdb_url(meta),
        reasons=public_reasons_for(
            entry.candidate.kind,
            # Unfiltered: public_reasons_for gates only stored[0], the model's
            # sentence. The lines after it are the store window and price, so
            # dropping a blank first line would promote one into its place.
            (row.reason or "").split("\n"),
            row.reason_source == ReasonSource.MODEL,
            [str(ref) for ref in (row.based_on or [])],
            item,
            taste,
        ),
        top_pick=entry.top_pick,
        new=entry.new,
    )


def _tonight_card(game: Item | _PickRow, reasons: list[str]) -> PublicTonightCard:
    """A tonight card from a public item (Up next) or a public pick."""
    return PublicTonightCard(
        item_id=game.id,
        type=game.type,
        title=game.title,
        cover_url=game.cover_url,
        platform=game.platform,
        reasons=reasons,
    )


def _wanted_row(item: Item, today: date) -> PublicNextRow:
    """A public wanted game. Its date shows only while it is still to come;
    the owner typed it, so it carries no precision and no IGDB link."""
    upcoming = item.release_date is not None and item.release_date > today
    return PublicNextRow(
        title=item.title,
        platform=item.platform,
        physical_format=item.physical_format,
        release_date=item.release_date if upcoming else None,
        release_precision=None,
        cover_url=item.cover_url,
        igdb_url=None,
        reasons=[],
        top_pick=False,
        new=False,
        item_id=item.id,
    )


async def load_public_next(session: AsyncSession, now: datetime) -> PublicNextOut:
    """What's next for the public (spec, B5): tonight's games, the wanted
    list, and the store sections, built by next_list in public mode from
    the rows frozen to the latest batch (spec, S9)."""
    today = now.astimezone(UTC).date()
    day, picks = await public_picks_with_day(session, now)
    data = await load_next(session, public=True)
    built = sections(data.candidates, today, public=True)
    taste = taste_sparing_owned(
        data,
        [entry.candidate.payload for entries in built.values() for entry in entries],
    )
    pinned = [item for item in data.public_games if item.pinned_at is not None]
    up_next = max(pinned, key=lambda item: item.pinned_at, default=None)
    wanted = sorted(
        # Wanted is "no copy owned", as public.py derives it.
        (item for item in data.public_games if item.owned_format == OwnedFormat.NONE),
        key=lambda item: (
            item.release_date is None or item.release_date <= today,
            item.release_date or date.max,
            item.title,
        ),
    )
    catalogue = await catalogue_times(session)
    return PublicNextOut(
        generated_at=PublicNextGenerated(
            picks=day,
            catalogue=_utc_day(catalogue["stores_at"]),
            radar=_utc_day(data.generated_at.get(RecommendationKind.RADAR.value)),
            discover=_utc_day(data.generated_at.get(RecommendationKind.DISCOVER.value)),
        ),
        tonight=PublicTonight(
            up_next=_tonight_card(up_next, []) if up_next else None,
            picks=[_tonight_card(pick, pick.reasons) for pick in picks],
        ),
        wanted=[_wanted_row(item, today) for item in wanted],
        **{
            key: [_next_row(entry, taste) for entry in entries]
            for key, entries in built.items()
        },
    )
