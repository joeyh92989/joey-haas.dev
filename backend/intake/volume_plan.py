"""A collected book as a volume: what it adds, and writing it (#328).

A photographed or typed collected book commits as a `comic_volumes` row on a
title, never as an `items.editions` entry. This module is the one place that
decides what that volume is, so Check's preview and the commit cannot
disagree:

- `book_plan` is pure: the volume's label, kind and number in its line, and
  the contents it would write (the printed range, then the reprint note read
  by rules only, never the model), each with whether it links to the title.
- `preview` turns a plan into what Check shows.
- `write_volume` writes it, once per intake entry (`intake_entry_id`).

The link rule is the contents route's: an entry links only to the title's own
series, as one plain number or range within the title's known issue count,
with a bracketed year (if any) the title's. A range printed on the book is
linked when it is a sane range of a matched series, since the owner read it
off the book; everything else is text, and a link is never required.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import comic_contents
from comics import MAX_ISSUE
from intake.comic_books import EDITION_KINDS
from models import ComicVolume, ComicVolumeCollect, Item, ItemType

LABEL_MAX = 80


def is_book(payload: dict[str, Any] | None) -> bool:
    """A collected book: it commits as a volume, not as an issue."""
    return (payload or {}).get("format") == "collected"


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


@dataclass(frozen=True)
class CollectPlan:
    """One line of a volume's contents. `link` is the (from, to) range that
    links it to the title; None is text only."""

    series_name: str
    issue_text: str
    link: tuple[int, int] | None = None

    @property
    def will_link(self) -> bool:
        return self.link is not None


@dataclass(frozen=True)
class VolumePlan:
    title: str
    label: str
    kind: str
    line_number: int | None
    collects: tuple[CollectPlan, ...]


def _known(value: Any) -> int:
    n = _int(value)
    return n if n is not None and n > 0 else 0


def _count_and_year(
    item: Item | None, chosen: dict[str, Any] | None, row: dict[str, Any]
) -> tuple[int, int | None]:
    """The title's known issue count and first year. A title already on the
    shelf says first, then the match; a title still to be made has the match."""
    metadata = (item.source_metadata if item is not None else None) or {}
    count = _known(metadata.get("issue_count")) or _known(
        (chosen or {}).get("issue_count")
    )
    year = (item.year if item is not None else None) or metadata.get("start_year")
    year = year or row.get("year")
    try:
        year = int(year) if year else None
    except (TypeError, ValueError):
        year = None
    return count, year


def book_plan(
    payload: dict[str, Any],
    row: dict[str, Any],
    item: Item | None,
    chosen: dict[str, Any] | None = None,
) -> VolumePlan:
    """What a collected book's volume is. `row` is the entry's item row
    (`commit.shelf_row`), `item` the title already on the shelf (None when it
    is still to be made). Pure: no model, no network, no database."""
    matched = bool(row.get("external_source") and row.get("external_id"))
    title = (item.title if item is not None else row.get("title")) or ""
    kind = payload.get("edition_kind")
    kind = kind if kind in EDITION_KINDS else "trade"
    label = (
        (payload.get("detected_title") or "").strip() or title.strip() or kind.title()
    )[:LABEL_MAX]
    line = _int(payload.get("line_number"))
    line = line if line is not None and 1 <= line <= MAX_ISSUE else None
    count, year = _count_and_year(item, chosen, row)

    collects: list[CollectPlan] = []
    low, high = _int(payload.get("collects_from")), _int(payload.get("collects_to"))
    if low is not None and high is not None and 1 <= low <= high <= MAX_ISSUE:
        collects.append(
            CollectPlan(
                title,
                f"#{low}" if low == high else f"#{low}-{high}",
                (low, high) if matched else None,
            )
        )

    def key(series: str, issues: str) -> tuple[str, str]:
        return comic_contents.normalize_name(series), " ".join(issues.lower().split())

    taken = {key(c.series_name, c.issue_text) for c in collects}
    for found in comic_contents.parse_contents(payload.get("reprint_note")):
        series = found.series_name or title
        wanted = key(series, found.issue_text)
        if wanted in taken:
            continue
        taken.add(wanted)
        plain = comic_contents.plain_range(found.issue_text)
        own = (
            matched
            and plain is not None
            and count > 0
            and plain[1] <= count
            and comic_contents.normalize_name(series)
            == comic_contents.normalize_name(title)
            and (found.year is None or found.year == year)
        )
        collects.append(CollectPlan(series, found.issue_text, plain if own else None))
    return VolumePlan(title, label, kind, line, tuple(collects))


def title_key(name: str | None) -> str:
    """A title for comparing: case, a leading "The", `&` and punctuation do
    not tell two names apart."""
    text = comic_contents.normalize_name(name)
    return re.sub(r"[\W_]+", " ", text).strip() or (name or "").strip().lower()


async def find_manual_titles(
    session: AsyncSession, names: list[str], *, lock: bool = False
) -> dict[str, Item]:
    """The comic titles with no external id (made by hand, or for an earlier
    book with no match) that these names mean, by `title_key`: the oldest
    of each name, so books of one name keep landing on one title. `lock`
    takes them FOR UPDATE, in id order, for a writer about to add a volume."""
    wanted = {title_key(name) for name in names}
    rows = await session.execute(
        select(Item.id, Item.title)
        .where(Item.type == ItemType.COMIC, Item.external_source.is_(None))
        .order_by(Item.created_at, Item.id)
    )
    pick: dict[str, uuid.UUID] = {}
    for item_id, title in rows:
        key = title_key(title)
        if key in wanted and key not in pick:
            pick[key] = item_id
    if not pick:
        return {}
    query = select(Item).where(Item.id.in_(pick.values())).order_by(Item.id)
    items = {
        i.id: i
        for i in await session.scalars(query.with_for_update() if lock else query)
    }
    return {key: items[i] for key, i in pick.items() if i in items}


async def already_held(
    session: AsyncSession,
    item: Item | None,
    plan: VolumePlan,
    payload: dict[str, Any],
) -> dict[str, str] | None:
    """An owned volume of this title of the same kind that already links the
    same range: a warning for Check, never a refusal (the same issues in two
    books are two books)."""
    low, high = _int(payload.get("collects_from")), _int(payload.get("collects_to"))
    if item is None or low is None or high is None:
        return None
    found = await session.scalar(
        select(ComicVolume)
        .join(ComicVolumeCollect, ComicVolumeCollect.volume_id == ComicVolume.id)
        .where(
            ComicVolume.item_id == item.id,
            ComicVolume.owned.is_(True),
            ComicVolume.kind == plan.kind,
            ComicVolumeCollect.item_id == item.id,
            ComicVolumeCollect.from_number == low,
            ComicVolumeCollect.to_number == high,
        )
        .order_by(ComicVolume.position)
        .limit(1)
    )
    if found is None:
        return None
    return {"volume_id": str(found.id), "slug": found.slug, "label": found.label}


def preview(
    payload: dict[str, Any],
    plan: VolumePlan | None,
    item: Item | None,
    held: dict[str, str] | None = None,
) -> dict[str, Any]:
    """What Check shows for a comic entry, additive to the entry:
    `adds` (a volume or an issue), `title_will_be_created`, and for a book
    `contents_preview`, the entries the commit would write, and
    `already_held` (a warning, see `already_held`; null when none)."""
    shown: dict[str, Any] = {"title_will_be_created": item is None}
    if plan is None:
        shown["adds"] = {"kind": "issue", "issue_number": payload.get("issue_number")}
        return shown
    shown["adds"] = {
        "kind": "volume",
        "label": plan.label,
        "edition_kind": plan.kind,
        "line_number": plan.line_number,
        "title": plan.title,
        "title_id": str(item.id) if item is not None else None,
    }
    shown["already_held"] = held
    shown["contents_preview"] = [
        {
            "series_name": c.series_name,
            "issue_text": c.issue_text,
            "will_link": c.will_link,
        }
        for c in plan.collects
    ]
    return shown


async def existing_volumes(
    session: AsyncSession, entry_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ComicVolume]:
    """The volumes already written for these intake entries."""
    if not entry_ids:
        return {}
    found = await session.scalars(
        select(ComicVolume).where(ComicVolume.intake_entry_id.in_(entry_ids))
    )
    return {v.intake_entry_id: v for v in found if v.intake_entry_id is not None}


async def _next_slot(session: AsyncSession, item_id: uuid.UUID) -> tuple[str, int]:
    """The smallest unused `vol-<n>` on the title and the next position."""
    taken = set(
        await session.scalars(
            select(ComicVolume.slug).where(ComicVolume.item_id == item_id)
        )
    )
    n = 1
    while f"vol-{n}" in taken:
        n += 1
    top = await session.scalar(
        select(func.max(ComicVolume.position)).where(ComicVolume.item_id == item_id)
    )
    return f"vol-{n}", 0 if top is None else top + 1


async def write_volume(
    session: AsyncSession,
    title: Item,
    entry_id: uuid.UUID,
    plan: VolumePlan,
) -> tuple[ComicVolume, bool]:
    """Writes the plan's volume on `title` (a row the caller holds locked),
    owned, unread and `edited` (so the editions shim never touches it), with
    its contents as `photo` entries. Returns `(volume, created)`: when the
    entry's volume exists already, as a second writer may have made it between
    the caller's look and this insert (the unique `intake_entry_id`), that
    volume and False."""
    await session.flush()  # the title has its id
    for attempt in (1, 2):
        slug, position = await _next_slot(session, title.id)
        volume = ComicVolume(
            id=uuid.uuid4(),
            item_id=title.id,
            position=position,
            slug=slug,
            label=plan.label,
            kind=plan.kind,
            line_number=plan.line_number,
            owned=True,
            read=False,
            edited=True,
            intake_entry_id=entry_id,
        )
        try:
            async with session.begin_nested():
                session.add(volume)
                await session.flush()
        except IntegrityError:
            won = await session.scalar(
                select(ComicVolume).where(ComicVolume.intake_entry_id == entry_id)
            )
            if won is not None:
                return won, False
            if attempt == 2:
                raise
            continue  # the slug was taken meanwhile: take the next
        break
    session.add_all(
        ComicVolumeCollect(
            id=uuid.uuid4(),
            volume_id=volume.id,
            position=index,
            series_name=collect.series_name,
            issue_text=collect.issue_text,
            source="photo",
            item_id=title.id if collect.link else None,
            from_number=collect.link[0] if collect.link else None,
            to_number=collect.link[1] if collect.link else None,
        )
        for index, collect in enumerate(plan.collects)
    )
    await session.flush()
    return volume, True
