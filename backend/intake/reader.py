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
- **Already on the shelf.** An exact or probable match whose
  `(external_source, external_id)` is already an item -- the commit's
  duplicate rule -- is `owned`; an uncertain one stays `check`.
- **Closet sittings read nothing here.** Their photos are garments from the
  moment they are uploaded, and the Closet's tag queue tags them.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from importer import (
    DETECTION_SCHEMA,
    EXTRACTION_PROMPT,
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
    can still be told apart from a real miss."""

    adapter: SourceAdapter
    busy: dict[tuple, str]

    @property
    def source_name(self) -> str:
        return self.adapter.source_name

    def configured(self) -> bool:
        return self.adapter.configured()

    async def search(self, query, year=None, platform=None):
        try:
            return await self.adapter.search(query, year, platform)
        except (SourceRateLimited, SourceUnavailable):
            self.busy[(query, year, platform)] = self.adapter.source_name
            raise


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


def _entry(
    sitting_id: uuid.UUID,
    photo_id: uuid.UUID,
    row: dict,
    busy: dict[tuple, str],
    owned: set[tuple[str, str]],
) -> IntakeEntry:
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
        state = IntakeEntryState.READING
        payload["reason"] = f"{source} is busy, will retry"
    else:
        state = CONFIDENCE_STATES[row["confidence"]]
        # Only a trusted match is called owned: an uncertain one may point
        # at the owned item by nothing more than being the nearest title.
        key = (match["external_source"], match["external_id"]) if match else None
        if state is not IntakeEntryState.CHECK and key in owned:
            state = IntakeEntryState.OWNED
    return IntakeEntry(
        sitting_id=sitting_id,
        photo_id=photo_id,
        kind=row["media_type"],
        state=state,
        payload=payload,
        candidates=row["candidates"],
        chosen=match,
    )


async def read_next(
    session: AsyncSession,
    sitting_id: uuid.UUID,
    provider: LLMProvider,
    budget: int,
    *,
    registry: dict[ItemType, SourceAdapter],
) -> ReadOutcome:
    """Read the sitting's oldest `uploaded` photo into entries.

    `budget` is the model calls left today (`intake.budget.remaining`); at
    zero or below nothing is read or changed. `registry` is the source
    adapters the matches are resolved against. The sitting must exist.
    """
    sitting = await session.get(IntakeSitting, sitting_id)
    if sitting is None or sitting.area is not IntakeArea.SHELF:
        return ReadOutcome("idle")
    photo = await session.scalar(
        select(IntakePhoto)
        .where(
            IntakePhoto.sitting_id == sitting_id,
            IntakePhoto.state == IntakePhotoState.UPLOADED,
        )
        .order_by(IntakePhoto.created_at, IntakePhoto.id)
        .limit(1)
    )
    if photo is None:
        return ReadOutcome("idle")
    if budget <= 0:
        return ReadOutcome("waiting")

    image = Image("image/jpeg", photo.reading_jpeg)
    photo.attempts += 1
    # Done reading: no connection is held through the model call.
    await session.commit()

    try:
        payload = await provider.complete_json(
            EXTRACTION_PROMPT, DETECTION_SCHEMA, [image]
        )
        detections = parse_detections(payload)
    except Exception as error:  # noqa: BLE001 -- one photo fails, not the sitting
        logger.warning("intake read of photo %s failed: %s", photo.id, error)
        photo.state = IntakePhotoState.FAILED
        photo.error = str(error) or type(error).__name__
        await session.commit()
        return ReadOutcome("failed", photo)

    busy: dict[tuple, str] = {}
    watched = {
        media_type: _Watched(adapter, busy) for media_type, adapter in registry.items()
    }
    rows = await resolve_detections(watched, detections)
    owned = await _owned(session, rows)
    entries = [_entry(sitting_id, photo.id, row, busy, owned) for row in rows]
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
