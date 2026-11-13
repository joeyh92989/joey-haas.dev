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
upload and commit, and the photographs are not kept beyond the request
(Starlette spools one over 1 MB to a temporary file until the request ends).
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import defaultdict
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from comics import MAX_ISSUE, RangeError, parse_ranges
from items import require_admin
from llm import Image, LLMError, LLMProvider
from matching import Confidence, best_match
from models import ItemType
from sources.base import SourceAdapter, SourceError, SourceResult
from sources.igdb import platform_id
from sources.registry import adapter_for

logger = logging.getLogger(__name__)

# What Gemini accepts. Anything else is rejected before a request is spent.
ACCEPTED_MEDIA_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
)

# A shelf is a handful of photographs, not an album. The cap exists because the
# whole batch travels inline in one request under a 20 MB ceiling.
MAX_PHOTOS = 20
# Per photo, checked as the upload is parsed, before it is handed on. A phone
# photo is 2-8 MB. Base64 adds a third, so 14 MB encodes to under Gemini's
# 20 MB inline limit with room left for the prompt; 15 MB would not.
MAX_PHOTO_BYTES = 14 * 1024 * 1024

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
                    # Free text, as printed. Two releases of a game can share
                    # a title exactly -- Star Fox in 1993 and 2026 -- and then
                    # the platform is the only thing that separates them.
                    "platform": {"type": "string"},
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
- Report the COMPLETE title as printed, including any subtitle, even where the
  subtitle is in smaller text than the main title. "Indiana Jones" is not
  enough if the case reads "Indiana Jones and the Great Circle" -- the short
  form matches the wrong work, or nothing at all.
- Do not include edition or platform wording in the title itself. "Nintendo
  Switch 2 Edition", "Ultimate Edition", "25th Anniversary Edition" and the
  like are not part of the title; report the platform separately below.
- Only report a title you can actually read. Do not guess at one that is
  blurred, turned away, or obscured, and do not infer a title from cover art
  alone.
- Report each work once, even if it appears in more than one photograph.
- For a boxed set or multi-disc series, report the series title once rather
  than each disc.
- Give the year only when it is printed on the item. Leave it out otherwise;
  a guessed year is worse than no year.
- Give the platform when the case says which system it is for, copied as
  printed: "Nintendo Switch 2", "Nintendo Switch", "PlayStation 5", "Xbox
  Series X|S". Leave it out for anything that is not a video game, and for a
  game whose case does not say.
- Classify each as one of: game (video game), movie (film or television),
  comic (comic or graphic novel), boardgame.
"""


COMIC_FORMATS = ("single", "collected", "unknown")

COMIC_DETECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "books": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "series": {"type": "string"},
                    "issue_number": {"type": "string"},
                    "issue_number_seen": {"type": "boolean"},
                    "format": {"type": "string", "enum": list(COMIC_FORMATS)},
                    "volume_range": {"type": "string"},
                    "publisher": {"type": "string"},
                },
                "required": ["series", "issue_number_seen", "format"],
            },
        }
    },
    "required": ["books"],
}

# The prompt a comic sitting sends instead of EXTRACTION_PROMPT, proved on
# eight of the owner's covers (docs/planning/2026-11-13-comics-book-design.md).
COMIC_EXTRACTION_PROMPT = """\
This photograph shows one or more physical comic books: single issues, or
collected editions (trade paperbacks, hardcovers, omnibuses).

Return one entry per physical book you can see, not one per series. Four
issues of one series are four entries.

For each book:
- series: the series title as printed, without the issue number.
- issue_number: the issue number printed on the cover (often near the
  logo, the price box or the barcode, after "#" or "No."). Give it exactly
  as printed ("1", "0", "1/2", "Annual 1"). Leave it out if you cannot read
  it; never guess from the art or from other books in the photo.
- issue_number_seen: true only if you read the number off this book.
- format: "single" for a stapled issue, "collected" for a trade paperback,
  hardcover or omnibus, "unknown" if you cannot tell (a spine only).
- volume_range: for a collected edition, the issues it collects if printed
  ("1-6"); otherwise leave it out.
- publisher: if printed.
"""

_ISSUE_NUMBER = re.compile(
    r"^(?:(?:no\.?|number|issue)\s*)?#?\s*(\d{1,5})\s*(?:of\s*\d+)?$", re.IGNORECASE
)


def normalise_issue_number(text: str | None) -> int | None:
    """An issue number as printed ("#4", "No. 4", "4 of 4", "4") as a whole
    number 1 to 9999, or None: "0", "1/2", "Annual 1" and blank are not
    numbers this site tracks (a typed number is the way to record one)."""
    found = _ISSUE_NUMBER.match((text or "").strip())
    if found is None:
        return None
    number = int(found.group(1))
    return number if 1 <= number <= MAX_ISSUE else None


@dataclass(frozen=True)
class Detection:
    """One title the model read off a photograph."""

    index: int
    title: str
    media_type: ItemType
    year: int | None
    platform: str | None = None
    # Only a comic sitting's books carry these (`parse_books`): the issue
    # number as a whole number, whether the model read it off the cover
    # (`read`) or not (`none`), and a collected edition's range.
    issue_number: int | None = None
    number_source: str = "none"
    format: str | None = None
    collects_from: int | None = None
    collects_to: int | None = None


def _candidate_json(source_name: str, result: SourceResult) -> dict:
    candidate = {
        "external_source": source_name,
        "external_id": result.external_id,
        "title": result.title,
        "year": result.year,
        "thumbnail_url": result.thumbnail_url,
    }
    # Present only when the source knows them (ComicVine), so other sources'
    # candidates are unchanged.
    if result.publisher:
        candidate["publisher"] = result.publisher
    if result.issue_count is not None:
        candidate["issue_count"] = result.issue_count
    return candidate


def _unresolved(detection: Detection, reason: str) -> dict:
    return {
        "index": detection.index,
        "detected_title": detection.title,
        "media_type": detection.media_type.value,
        "detected_year": detection.year,
        "detected_platform": detection.platform,
        # Committed with the row; the server resolves the display name. An
        # unrecognised platform stays None rather than being guessed.
        "platform_id": platform_id(detection.platform),
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
        platform = str(raw.get("platform") or "").strip() or None
        detections.append(
            Detection(
                index=len(detections),
                title=title,
                media_type=media_type,
                year=int(year) if isinstance(year, int) else None,
                platform=platform,
            )
        )
    return detections


def parse_books(payload: dict) -> list[Detection]:
    """Reads a comic sitting's model answer into one Detection per book,
    skipping anything unusable, and never merging two books of one series.

    A number counts as `read` only when the model says it saw it and it
    normalises to a whole number; a collected edition has no issue number,
    only the range it collects when printed. The model is the only source of
    the number: whether it can be trusted is decided later, against the
    series' run.
    """
    books: list[Detection] = []
    for raw in payload.get("books") or []:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("series") or "").strip()
        if not title:
            continue
        book_format = raw.get("format")
        if book_format not in COMIC_FORMATS:
            book_format = "unknown"
        number = None
        low = high = None
        if book_format == "collected":
            try:
                ranges = parse_ranges(str(raw.get("volume_range") or ""))
            except RangeError:
                ranges = []
            if len(ranges) == 1:
                low, high = ranges[0]
        elif raw.get("issue_number_seen") is True:
            number = normalise_issue_number(str(raw.get("issue_number") or ""))
        books.append(
            Detection(
                index=len(books),
                title=title,
                media_type=ItemType.COMIC,
                year=None,
                issue_number=number,
                number_source="read" if number is not None else "none",
                format=book_format,
                collects_from=low,
                collects_to=high,
            )
        )
    return books


async def _resolve_one(adapter: SourceAdapter, detection: Detection) -> dict:
    try:
        candidates = await adapter.search(
            detection.title, detection.year, detection.platform
        )
    except SourceError as error:
        return _unresolved(detection, str(error))

    match = best_match(detection.title, detection.year, candidates)
    return {
        "index": detection.index,
        "detected_title": detection.title,
        "media_type": detection.media_type.value,
        "detected_year": detection.year,
        "detected_platform": detection.platform,
        # Committed with the row; the server resolves the display name. An
        # unrecognised platform stays None rather than being guessed.
        "platform_id": platform_id(detection.platform),
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
            if upload.size is not None and upload.size > MAX_PHOTO_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"{upload.filename or 'file'} is "
                        f"{upload.size // (1024 * 1024)} MB; upload photos of "
                        f"at most {MAX_PHOTO_BYTES // (1024 * 1024)} MB"
                    ),
                )
            # Straight from the request into the provider payload, and not
            # kept: Render's free tier loses its disk on restart anyway, and
            # the photographs have no value once the titles are read.
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
