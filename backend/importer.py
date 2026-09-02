"""Turning photographs of shelves into reviewable, resolvable rows.

The collection being tracked is physical -- discs, boxes, and comics on
shelves -- and there is no export to import from. Typing several hundred titles
into a web form is the kind of task that gets abandoned at item forty, so the
backfill path is a camera.

The vision model is asked for titles and nothing else: no tool access, no
candidate list, no matching. Resolution happens here, against the same source
adapters the picker uses. That makes the expensive nondeterministic step a pure
function of the image, and the entire resolution path testable with no model
calls at all.

Nothing is persisted by this module. The browser holds the detections between
upload and commit, and the photographs are never written to disk.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from items import require_admin
from llm import Image, LLMError, LLMProvider
from matching import Confidence, best_match
from models import ItemType
from sources.base import SourceAdapter, SourceError, SourceResult
from sources.registry import adapter_for

logger = logging.getLogger(__name__)

# What Gemini accepts. Anything else is rejected before a request is spent.
ACCEPTED_MEDIA_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
)

# A shelf is a handful of photographs, not an album. The cap exists because the
# whole batch travels inline in one request under a 20 MB ceiling.
MAX_PHOTOS = 20

MEDIA_TYPE_VALUES = [t.value for t in ItemType]

DETECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "detections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    # Constrained to the ItemType values so the result maps
                    # onto the column with no translation layer and no room
                    # for an invented fifth type.
                    "media_type": {"type": "string", "enum": MEDIA_TYPE_VALUES},
                    "year": {"type": "integer"},
                },
                "required": ["title", "media_type"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["detections"],
    "additionalProperties": False,
}

EXTRACTION_PROMPT = """\
These photographs show physical media on shelves: film and television discs,
video game cases, comics or graphic novels, and board game boxes.

Read every distinct title you can see on the spines, cases, and boxes. Return
one entry per distinct work.

Rules:
- Only report a title you can actually read. Do not guess at one that is
  blurred, turned away, or obscured, and do not infer a title from cover art
  alone.
- Report each work once, even if it appears in more than one photograph.
- For a boxed set or multi-disc series, report the series title once rather
  than each disc.
- Give the year only when it is printed on the item. Leave it out otherwise;
  a guessed year is worse than no year.
- Classify each as one of: game (video game), movie (film or television),
  comic (comic or graphic novel), boardgame.
"""


@dataclass(frozen=True)
class Detection:
    """One title the model read off a photograph."""

    index: int
    title: str
    media_type: ItemType
    year: int | None


def _candidate_json(source_name: str, result: SourceResult) -> dict:
    return {
        "external_source": source_name,
        "external_id": result.external_id,
        "title": result.title,
        "year": result.year,
        "thumbnail_url": result.thumbnail_url,
    }


def _unresolved(detection: Detection, reason: str) -> dict:
    return {
        "index": detection.index,
        "detected_title": detection.title,
        "media_type": detection.media_type.value,
        "detected_year": detection.year,
        "status": "unresolved",
        "confidence": Confidence.UNCERTAIN.value,
        "reason": reason,
        "match": None,
        "candidates": [],
    }


def parse_detections(payload: dict) -> list[Detection]:
    """Reads the model's output into Detections, skipping anything unusable.

    The schema is enforced provider-side, so this is a second line rather than
    the first. A single malformed entry is dropped instead of failing a batch
    that is otherwise fine -- losing one row off a shelf is recoverable, losing
    the shelf is not.
    """
    detections: list[Detection] = []
    for raw in payload.get("detections") or []:
        title = str(raw.get("title") or "").strip()
        if not title:
            continue
        try:
            media_type = ItemType(raw.get("media_type"))
        except ValueError:
            continue
        year = raw.get("year")
        detections.append(
            Detection(
                index=len(detections),
                title=title,
                media_type=media_type,
                year=int(year) if isinstance(year, int) else None,
            )
        )
    return detections


async def _resolve_one(adapter: SourceAdapter, detection: Detection) -> dict:
    try:
        candidates = await adapter.search(detection.title, detection.year)
    except SourceError as error:
        return _unresolved(detection, str(error))

    match = best_match(detection.title, detection.year, candidates)
    return {
        "index": detection.index,
        "detected_title": detection.title,
        "media_type": detection.media_type.value,
        "detected_year": detection.year,
        "status": "matched" if match.result else "unresolved",
        "confidence": match.confidence.value,
        "reason": None if match.result else "no candidates returned",
        "match": (
            _candidate_json(adapter.source_name, match.result) if match.result else None
        ),
        "candidates": [
            _candidate_json(adapter.source_name, candidate) for candidate in candidates
        ],
    }


async def resolve_group(
    registry: dict[ItemType, SourceAdapter],
    media_type: ItemType,
    detections: list[Detection],
) -> list[dict]:
    """Resolves every detection of one media type, serially.

    Serial within the group on purpose: the per-source Throttle lives in the
    adapter, and running a group concurrently would queue every call behind the
    same lock anyway while making the ordering harder to reason about. Groups
    run concurrently against each other, so a shelf of films is not slowed to
    board-game pace.

    A source that is missing or broken marks only its own detections
    unresolved. A 200-item import must not be lost because one API was down.
    """
    try:
        adapter = adapter_for(registry, media_type)
    except SourceError as error:
        return [_unresolved(detection, str(error)) for detection in detections]

    return [await _resolve_one(adapter, detection) for detection in detections]


async def resolve_detections(
    registry: dict[ItemType, SourceAdapter], detections: list[Detection]
) -> list[dict]:
    """Resolves every detection, grouped by source, preserving input order."""
    grouped: dict[ItemType, list[Detection]] = defaultdict(list)
    for detection in detections:
        grouped[detection.media_type].append(detection)

    groups = await asyncio.gather(
        *(
            resolve_group(registry, media_type, items)
            for media_type, items in grouped.items()
        )
    )

    rows = [row for group in groups for row in group]
    rows.sort(key=lambda row: row["index"])
    return rows


def create_import_router(
    registry: dict[ItemType, SourceAdapter],
    provider_factory,
) -> APIRouter:
    """Builds the photo import route.

    The provider is built per request through a factory rather than at import
    time, so an absent GEMINI_API_KEY is a 502 on this one route instead of a
    service that will not boot.
    """
    router = APIRouter(
        prefix="/api/import",
        tags=["import"],
        dependencies=[Depends(require_admin)],
    )

    @router.post("/photos")
    async def import_photos(photos: list[UploadFile] = File()) -> dict:
        """Reads titles off shelf photographs and resolves them to candidates."""
        if not photos:
            raise HTTPException(status_code=422, detail="No photos were uploaded")
        if len(photos) > MAX_PHOTOS:
            raise HTTPException(
                status_code=422,
                detail=f"Upload at most {MAX_PHOTOS} photos at a time",
            )

        images: list[Image] = []
        for upload in photos:
            if upload.content_type not in ACCEPTED_MEDIA_TYPES:
                raise HTTPException(
                    status_code=415,
                    detail=(
                        f"{upload.filename or 'file'} is {upload.content_type}; "
                        "upload JPEG, PNG, WebP, or HEIC images"
                    ),
                )
            # Straight from the request into the provider payload. Nothing is
            # written to disk: Render's free tier loses it on restart anyway,
            # and the photographs have no value once the titles are read.
            images.append(Image(upload.content_type, await upload.read()))

        try:
            provider: LLMProvider = provider_factory()
            payload = await provider.complete_json(
                EXTRACTION_PROMPT, DETECTION_SCHEMA, images
            )
        except LLMError as error:
            logger.warning("import extraction failed: %s", error)
            raise HTTPException(
                status_code=502, detail=f"Extraction failed, try again. ({error})"
            ) from error

        detections = parse_detections(payload)
        rows = await resolve_detections(registry, detections)

        # One line per batch, never one per detection: a 200-item import must
        # not flood the log sink.
        matched = sum(1 for row in rows if row["status"] == "matched")
        logger.info(
            "import: %d photos, %d detections, %d matched, %d unresolved",
            len(images),
            len(rows),
            matched,
            len(rows) - matched,
        )
        return {"detections": rows}

    return router
