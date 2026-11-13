"""Reading a sitting's shelf photos, one per call (spec D2-D4).

The browser calls `read-next` serially while Shoot is open, and the nightly
job calls `read_next` within the reserve, so one call reads at most one
photo: the oldest still `uploaded`. It reuses the photo importer's prompt,
schema and resolution (`importer.py`) unchanged; confidence comes from
`matching.py` through `resolve_detections`, never from the model.

- **Budget first.** A budget of zero or less returns `waiting` and touches
  nothing: the photo keeps its reading copy until a day with calls left.
- **One photo's failure is its own.** A model error marks that photo
  `failed` with the reason; the next call moves on to the next photo, and
  Retry puts the failed one back in the queue.
- **A busy source is not a miss.** A rate-limited or unavailable source
  leaves its entries `reading`, worded "<source> is busy, will retry".
  `retry_reading` matches them again from their detected fields, with no
  model call: at the start of every `read_next` and of the nightly.
- **Already on the shelf.** An exact or probable match whose
  `(external_source, external_id)` is already an item -- the commit's
  duplicate rule -- is `owned`; an uncertain one stays `check`.
- **A comic sitting reads books, not titles.** Its photos go out with the
  comic prompt and schema (`importer.COMIC_EXTRACTION_PROMPT`): one entry
  per book with its issue number, so four photos of one series are four
  entries, never merged. The same one request per photo. A mixed sitting
  keeps the shelf prompt. A series whose best match is not exact and whose
  title ends ": <story>" is searched again without the story.
- **Closet sittings read nothing here.** Their photos are garments from the
  moment they are uploaded, and the Closet's tag queue tags them.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from importer import (
    COMIC_DETECTION_SCHEMA,
    COMIC_EXTRACTION_PROMPT,
    DETECTION_SCHEMA,
    EXTRACTION_PROMPT,
    Detection,
    parse_books,
    parse_detections,
    resolve_detections,
)
from llm import Image, LLMProvider
from matching import Confidence
from models import (
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    Item,
    ItemType,
)
from sources.base import SourceAdapter, SourceRateLimited, SourceUnavailable

logger = logging.getLogger(__name__)

ReadStatus = Literal["read", "empty", "failed", "waiting", "idle"]

CONFIDENCE_STATES = {
    Confidence.EXACT.value: IntakeEntryState.EXACT,
    Confidence.PROBABLE.value: IntakeEntryState.PROBABLE,
    Confidence.UNCERTAIN.value: IntakeEntryState.CHECK,
}


@dataclass
class ReadOutcome:
    """What one call did. `status` is the photo's new state (`read`,
    `empty`, `failed`), `waiting` when the budget is spent, or `idle` when
    no photo is waiting to be read."""

    status: ReadStatus
    photo: IntakePhoto | None = None
    entries: list[IntakeEntry] = field(default_factory=list)


@dataclass
class _Watched:
    """An adapter that notes which searches found their source busy, so the
    importer's resolution (which folds every SourceError into "unresolved")
    can still be told apart from a real miss.

    It also answers a repeated search from memory for the length of one
    `_resolve`: four books of one series are one search (and a story-title
    retry at most one more), not four against a source with a daily cap. A
    refusal is remembered too, so a busy source is asked once."""

    adapter: SourceAdapter
    busy: dict[tuple, str]
    seen: dict[tuple, Any] = field(default_factory=dict)

    @property
    def source_name(self) -> str:
        return self.adapter.source_name

    def configured(self) -> bool:
        return self.adapter.configured()

    async def search(self, query, year=None, platform=None):
        key = (query, year, platform)
        if key not in self.seen:
            try:
                self.seen[key] = await self.adapter.search(query, year, platform)
            except (SourceRateLimited, SourceUnavailable) as error:
                self.busy[key] = self.adapter.source_name
                self.seen[key] = error
        found = self.seen[key]
        if isinstance(found, Exception):
            raise found
        return found


async def _owned(session: AsyncSession, rows: list[dict]) -> set[tuple[str, str]]:
    keys = {
        (row["match"]["external_source"], row["match"]["external_id"])
        for row in rows
        if row["match"]
    }
    if not keys:
        return set()
    found = await session.execute(
        select(Item.external_source, Item.external_id).where(
            tuple_(Item.external_source, Item.external_id).in_(keys)
        )
    )
    return {(source, external_id) for source, external_id in found.all()}


def _resolution(
    row: dict, busy: dict[tuple, str], owned: set[tuple[str, str]]
) -> tuple[IntakeEntryState, dict[str, Any]]:
    """An importer row's entry state and payload: `reading` while its
    source is busy, else its confidence, `owned` for a trusted match that
    is already an item."""
    payload: dict[str, Any] = {
        "detected_title": row["detected_title"],
        "detected_year": row["detected_year"],
        "detected_platform": row["detected_platform"],
        "reason": row["reason"],
    }
    if row["platform_id"] is not None:
        payload["platform_id"] = row["platform_id"]
    match = row["match"]
    source = busy.get(
        (row["detected_title"], row["detected_year"], row["detected_platform"])
    )
    if source is not None:
        payload["reason"] = f"{source} is busy, will retry"
        return IntakeEntryState.READING, payload
    state = CONFIDENCE_STATES[row["confidence"]]
    # Only a trusted match is called owned: an uncertain one may point
    # at the owned item by nothing more than being the nearest title.
    key = (match["external_source"], match["external_id"]) if match else None
    if state is not IntakeEntryState.CHECK and key in owned:
        state = IntakeEntryState.OWNED
    return state, payload


COMIC_SITTING = "comic"


def _book_payload(detection: Detection) -> dict[str, Any]:
    """What a comic book carries beyond its title: the number and where it
    came from, the format, and a collected edition's range and kind. The
    Check mark is derived from these when the entry is shown, never stored."""
    book: dict[str, Any] = {
        "issue_number": detection.issue_number,
        "number_source": detection.number_source,
        "format": detection.format or "unknown",
    }
    if detection.format == "collected":
        book["collects_from"] = detection.collects_from
        book["collects_to"] = detection.collects_to
        book["edition_kind"] = "trade"
    return book


def _entry(
    sitting_id: uuid.UUID,
    photo_id: uuid.UUID,
    row: dict,
    busy: dict[tuple, str],
    owned: set[tuple[str, str]],
    book: Detection | None = None,
) -> IntakeEntry:
    state, payload = _resolution(row, busy, owned)
    if book is not None:
        payload.update(_book_payload(book))
    return IntakeEntry(
        sitting_id=sitting_id,
        photo_id=photo_id,
        kind=row["media_type"],
        state=state,
        payload=payload,
        candidates=row["candidates"],
        chosen=row["match"],
    )


_CONFIDENCE_RANK = {
    Confidence.EXACT.value: 2,
    Confidence.PROBABLE.value: 1,
    Confidence.UNCERTAIN.value: 0,
}


def before_story(title: str) -> str | None:
    """A comic series title without a trailing ": <story>" ("Waterworld
    Children of Leviathan: Twilight of the Gods" -> "Waterworld Children of
    Leviathan"), or None when there is no story to take off."""
    head, colon, story = title.rpartition(":")
    head = head.strip()
    return head if colon and head and story.strip() else None


async def _without_story(
    watched: dict[ItemType, SourceAdapter],
    detections: list[Detection],
    rows: list[dict],
    indexes: set[int],
) -> None:
    """Comic books whose best match is not exact are searched again without
    a trailing story title; the retry replaces the row only when it is a
    match and more confident. The row keeps the title as read, so the busy
    lookup and the retry-from-payload keep working."""
    heads = []
    for detection, row in zip(detections, rows, strict=True):
        if detection.index not in indexes or detection.media_type is not ItemType.COMIC:
            continue
        if row["confidence"] == Confidence.EXACT.value:
            continue
        head = before_story(detection.title)
        if head:
            heads.append((row, replace(detection, title=head, index=len(heads))))
    if not heads:
        return
    again = await resolve_detections(watched, [head for _, head in heads])
    for (row, _), new in zip(heads, again, strict=True):
        if new["status"] == "matched" and (
            _CONFIDENCE_RANK[new["confidence"]] > _CONFIDENCE_RANK[row["confidence"]]
        ):
            row.update(
                status=new["status"],
                confidence=new["confidence"],
                reason=new["reason"],
                match=new["match"],
                candidates=new["candidates"],
            )


async def _resolve(
    session: AsyncSession,
    registry: dict[ItemType, SourceAdapter],
    detections: list[Detection],
    *,
    story_indexes: set[int] | None = None,
) -> tuple[list[dict], dict[tuple, str], set[tuple[str, str]]]:
    busy: dict[tuple, str] = {}
    watched = {
        media_type: _Watched(adapter, busy) for media_type, adapter in registry.items()
    }
    rows = await resolve_detections(watched, detections)
    if story_indexes:
        await _without_story(watched, detections, rows, story_indexes)
    return rows, busy, await _owned(session, rows)


async def retry_reading(
    session: AsyncSession,
    registry: dict[ItemType, SourceAdapter],
    sitting_id: uuid.UUID | None = None,
) -> int:
    """Match again the shelf entries left `reading` by a busy source, from
    their `payload.detected_*` fields: no model call. `sitting_id` limits
    it to one sitting (`read_next`); without it every shelf sitting's
    (the nightly). Returns how many entries left `reading`; one whose
    source is still busy stays as it is. Commits."""
    query = (
        select(
            IntakeEntry.id, IntakeEntry.kind, IntakeEntry.payload, IntakeSitting.kind
        )
        .join(IntakeSitting, IntakeSitting.id == IntakeEntry.sitting_id)
        .where(
            IntakeEntry.state == IntakeEntryState.READING,
            IntakeSitting.area == IntakeArea.SHELF,
        )
        .order_by(IntakeEntry.created_at, IntakeEntry.id)
    )
    if sitting_id is not None:
        query = query.where(IntakeEntry.sitting_id == sitting_id)
    waiting = (await session.execute(query)).all()
    ids: list[uuid.UUID] = []
    detections: list[Detection] = []
    story_indexes: set[int] = set()
    for entry_id, kind, payload, sitting_kind in waiting:
        payload = payload or {}
        title = payload.get("detected_title")
        try:
            media_type = ItemType(kind)
        except ValueError:
            continue
        if not title:
            continue
        ids.append(entry_id)
        if sitting_kind == COMIC_SITTING:
            story_indexes.add(len(detections))
        detections.append(
            Detection(
                index=len(detections),
                title=title,
                media_type=media_type,
                year=payload.get("detected_year"),
                platform=payload.get("detected_platform"),
            )
        )
    # No connection is held through the source calls.
    await session.commit()
    if not detections:
        return 0

    rows, busy, owned = await _resolve(
        session, registry, detections, story_indexes=story_indexes
    )
    # Re-read under lock: an entry changed or deleted meanwhile is left be.
    entries = {
        entry.id: entry
        for entry in (
            await session.scalars(
                select(IntakeEntry)
                .where(
                    IntakeEntry.id.in_(ids),
                    IntakeEntry.state == IntakeEntryState.READING,
                )
                .with_for_update()
            )
        ).all()
    }
    resolved = 0
    for row in rows:
        entry = entries.get(ids[row["index"]])
        if entry is None:
            continue
        state, payload = _resolution(row, busy, owned)
        if state is IntakeEntryState.READING:
            continue
        entry.state = state
        entry.payload = {**(entry.payload or {}), **payload}
        entry.candidates = row["candidates"]
        entry.chosen = row["match"]
        resolved += 1
    await session.commit()
    logger.info("intake retry: %d of %d reading entries matched", resolved, len(ids))
    return resolved


async def read_next(
    session: AsyncSession,
    sitting_id: uuid.UUID,
    provider: LLMProvider,
    budget: int,
    *,
    registry: dict[ItemType, SourceAdapter],
) -> ReadOutcome:
    """Read the sitting's oldest `uploaded` photo into entries.

    The photo is claimed first (`reading`, committed, `FOR UPDATE SKIP
    LOCKED`), so two readers never take the same one; then the model is
    called, then it is set `read`, `empty` or `failed`. A photo stranded
    in `reading` by a crash is put back by the nightly
    (`intake.nightly.reset_stale_reading`).

    `budget` is the model calls left today (`intake.budget.remaining`); at
    zero or below nothing is read or changed. `registry` is the source
    adapters the matches are resolved against. The sitting must exist.
    """
    sitting = await session.get(IntakeSitting, sitting_id)
    if sitting is None or sitting.area is not IntakeArea.SHELF:
        return ReadOutcome("idle")
    comic = sitting.kind == COMIC_SITTING
    # Cheap (no model call): a page left open recovers busy sources too.
    await retry_reading(session, registry, sitting_id)
    waiting = (
        select(IntakePhoto.id)
        .where(
            IntakePhoto.sitting_id == sitting_id,
            IntakePhoto.state == IntakePhotoState.UPLOADED,
        )
        .order_by(IntakePhoto.created_at, IntakePhoto.id)
        .limit(1)
    )
    if budget <= 0:
        found = await session.scalar(waiting)
        await session.commit()
        return ReadOutcome("waiting" if found is not None else "idle")

    # Claim the photo in one statement: a second reader skips the locked
    # row, and once this commits it is `reading`, out of everyone's queue.
    photo_id = await session.scalar(
        update(IntakePhoto)
        .where(
            IntakePhoto.id
            == waiting.with_for_update(skip_locked=True).scalar_subquery(),
            IntakePhoto.state == IntakePhotoState.UPLOADED,
        )
        .values(
            state=IntakePhotoState.READING,
            attempts=IntakePhoto.attempts + 1,
            updated_at=func.now(),
        )
        .returning(IntakePhoto.id)
    )
    # Done claiming: no connection is held through the model call.
    await session.commit()
    if photo_id is None:
        return ReadOutcome("idle")
    photo = await session.get(IntakePhoto, photo_id, populate_existing=True)
    image = Image("image/jpeg", photo.reading_jpeg)
    await session.commit()

    try:
        if comic:
            payload = await provider.complete_json(
                COMIC_EXTRACTION_PROMPT, COMIC_DETECTION_SCHEMA, [image]
            )
            detections = parse_books(payload)
        else:
            payload = await provider.complete_json(
                EXTRACTION_PROMPT, DETECTION_SCHEMA, [image]
            )
            detections = parse_detections(payload)
    except Exception as error:  # noqa: BLE001 -- one photo fails, not the sitting
        logger.warning("intake read of photo %s failed: %s", photo_id, error)
        photo = await session.get(IntakePhoto, photo_id, populate_existing=True)
        if photo is None:
            return ReadOutcome("idle")
        photo.state = IntakePhotoState.FAILED
        photo.error = str(error) or type(error).__name__
        await session.commit()
        return ReadOutcome("failed", photo)

    rows, busy, owned = await _resolve(
        session,
        registry,
        detections,
        story_indexes={d.index for d in detections} if comic else None,
    )
    # The photo may have been removed while the model was reading it: the
    # read is discarded, not written against a row that is gone.
    photo = await session.get(IntakePhoto, photo_id, populate_existing=True)
    if photo is None:
        await session.rollback()
        return ReadOutcome("idle")
    entries = [
        _entry(
            sitting_id,
            photo.id,
            row,
            busy,
            owned,
            detections[row["index"]] if comic else None,
        )
        for row in rows
    ]
    session.add_all(entries)
    photo.state = IntakePhotoState.READ if entries else IntakePhotoState.EMPTY
    photo.error = None
    photo.reading_jpeg = None
    await session.commit()
    logger.info(
        "intake read: photo %s, %d entries, %d busy",
        photo.id,
        len(entries),
        sum(1 for entry in entries if entry.state is IntakeEntryState.READING),
    )
    return ReadOutcome(photo.state.value, photo, entries)
