"""Seed file to draft garments: the database half (issue #396).

`intake/seed_file.py` reads the file; this module decides what each row
becomes in a sitting, keeps the durable "not owned" list and holds the
photo a row points at until the sitting is committed (design D5, D7).

- A row marked `still_owned` no is skipped and counted.
- A row whose key is in `closet_settings["import.not_owned"]` (the answers
  Check's "Don't own this" gave, kept across sittings) is skipped and
  counted apart.
- A row already imported (same source and item number, or the same order
  line, in `garment_products`) is skipped and counted, which is also what
  makes uploading the same file again harmless.
- A row repeated in the file, or already in this sitting, is a duplicate.
- Every other row becomes one `typed` entry of the garment kind. Nothing
  reaches `garments` until the sitting is committed.

The counts are kept for Done in `intake_settings["file.<sitting id>"]`
until the commit reports them.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from closet_images import ClosetImageError, make_garment_image
from closet_routes import GarmentFields
from intake.kinds import REGISTRY
from intake.seed_file import (
    ParsedSeed,
    dup_key,
    entry_payload,
    row_dup_key,
    row_not_owned_key,
)
from intake.seed_image import ImageFetchError, fetch_image
from models import (
    ClosetSetting,
    GarmentProduct,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
)

NOT_OWNED_KEY = "import.not_owned"
# Photos fetched per request: the page asks again until none is pending.
IMAGE_BATCH = 4
# The payload keys only the server writes; a PATCH from the page keeps them.
SERVER_KEYS = ("seed", "image", "image_error")
COUNTS = (
    "added",
    "skipped_not_owned",
    "skipped_known_not_owned",
    "already_imported",
    "duplicates",
    "unreadable",
)


def summary_key(sitting_id: uuid.UUID) -> str:
    return f"file.{sitting_id}"


def keep_server_keys(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    """`new` with the server's own keys put back from `old`, so a Check edit
    can neither change the address a row fetches nor its photo's state."""
    kept = {key: old[key] for key in SERVER_KEYS if key in old}
    return {**{k: v for k, v in new.items() if k not in SERVER_KEYS}, **kept}


# --- the durable "not owned" list -------------------------------------------


async def not_owned_keys(session: AsyncSession) -> set[str]:
    row = await session.get(ClosetSetting, NOT_OWNED_KEY)
    return set((row.value or {}).get("keys", [])) if row else set()


async def add_not_owned(session: AsyncSession, keys: Iterable[str]) -> int:
    """Adds keys to the list (the seed of it, and Check's answers); returns
    how many were new. Does not commit."""
    row = await session.scalar(
        select(ClosetSetting)
        .where(ClosetSetting.key == NOT_OWNED_KEY)
        .with_for_update()
    )
    held = list((row.value or {}).get("keys", [])) if row else []
    fresh = [key for key in dict.fromkeys(keys) if key not in held]
    if fresh or row is None:
        value = {"keys": held + fresh}
        await session.execute(
            insert(ClosetSetting)
            .values(key=NOT_OWNED_KEY, value=value)
            .on_conflict_do_update(
                index_elements=[ClosetSetting.key], set_={"value": value}
            )
        )
    return len(fresh)


# --- what is already imported -----------------------------------------------


async def imported_keys(session: AsyncSession, sources: set[str]) -> set[str]:
    """The `dup_key` of every product already in `garment_products` for these
    sources. The colour and size are the snapshot's (the file's own words),
    since Check may have edited the garment's."""
    if not sources:
        return set()
    rows = await session.execute(
        select(
            GarmentProduct.source,
            GarmentProduct.order_ref,
            GarmentProduct.store_item_no,
            GarmentProduct.title,
            GarmentProduct.snapshot,
        ).where(GarmentProduct.source.in_(sources))
    )
    keys = set()
    for source, order_ref, item_no, title, snapshot in rows:
        snap = snapshot or {}
        keys.add(
            dup_key(
                source.value,
                order_ref,
                item_no,
                snap.get("name") or title,
                snap.get("color_name"),
                snap.get("size"),
            )
        )
    return keys


# --- the file into a sitting ------------------------------------------------


@dataclass
class FileImport:
    added: int = 0
    skipped_not_owned: int = 0
    skipped_known_not_owned: int = 0
    already_imported: int = 0
    duplicates: int = 0
    unreadable: int = 0
    problems: list[str] | None = None

    def counts(self) -> dict[str, int]:
        return {name: getattr(self, name) for name in COUNTS}


async def import_rows(
    session: AsyncSession, sitting_id: uuid.UUID, parsed: ParsedSeed
) -> FileImport:
    """Writes one `typed` garment entry per readable, new, owned row of
    `parsed`, counts the rest, and adds the counts to the sitting's summary.
    Does not commit."""
    result = FileImport(unreadable=parsed.unreadable, problems=list(parsed.problems))
    known_not_owned = await not_owned_keys(session)
    imported = await imported_keys(session, {row.source for row in parsed.rows})
    held_entries = await session.scalars(
        select(IntakeEntry).where(
            IntakeEntry.sitting_id == sitting_id,
            IntakeEntry.state != IntakeEntryState.IGNORED,
        )
    )
    seen = {
        (entry.payload or {}).get("seed", {}).get("key") for entry in held_entries
    } - {None}
    kind = REGISTRY["garment"]
    # One transaction gives every row the same `now()`; the entries are listed
    # by created_at, so each is stamped a microsecond after the last to keep
    # the file's order.
    stamp = datetime.now(UTC)
    for row in parsed.rows:
        if not row.still_owned:
            result.skipped_not_owned += 1
            continue
        if row_not_owned_key(row) in known_not_owned:
            result.skipped_known_not_owned += 1
            continue
        key = row_dup_key(row)
        if key in imported:
            result.already_imported += 1
            continue
        if key in seen:
            result.duplicates += 1
            continue
        payload = entry_payload(row)
        try:
            GarmentFields.model_validate(kind.to_row({"payload": payload}))
        except ValidationError as error:
            result.unreadable += 1
            if len(result.problems) < 5:
                field = str((error.errors()[0].get("loc") or ("a field",))[0])
                result.problems.append(f"Line {row.line}: {field} is too long")
            continue
        seen.add(key)
        session.add(
            IntakeEntry(
                sitting_id=sitting_id,
                kind="garment",
                state=IntakeEntryState.TYPED,
                payload=payload,
                created_at=stamp + timedelta(microseconds=result.added),
            )
        )
        result.added += 1
    await _add_summary(session, sitting_id, result.counts())
    return result


async def _add_summary(
    session: AsyncSession, sitting_id: uuid.UUID, counts: dict[str, int]
) -> None:
    key = summary_key(sitting_id)
    row = await session.scalar(
        select(IntakeSetting).where(IntakeSetting.key == key).with_for_update()
    )
    before = (row.value or {}) if row else {}
    value = {name: before.get(name, 0) + counts[name] for name in COUNTS}
    await session.execute(
        insert(IntakeSetting)
        .values(key=key, value=value)
        .on_conflict_do_update(
            index_elements=[IntakeSetting.key], set_={"value": value}
        )
    )


async def take_summary(
    session: AsyncSession, sitting_id: uuid.UUID
) -> dict[str, int] | None:
    """The sitting's file counts, removed as they are read (Done shows them
    once); None for a sitting no file was uploaded to."""
    row = await session.get(IntakeSetting, summary_key(sitting_id))
    if row is None:
        return None
    value = dict(row.value)
    await session.delete(row)
    return {name: int(value.get(name, 0)) for name in COUNTS}


async def drop_summary(session: AsyncSession, sitting_id: uuid.UUID) -> None:
    await session.execute(
        delete(IntakeSetting).where(IntakeSetting.key == summary_key(sitting_id))
    )


# --- the held photos --------------------------------------------------------


def _pending(entry: IntakeEntry) -> bool:
    payload = entry.payload or {}
    return (
        entry.state is not IntakeEntryState.IGNORED
        and payload.get("image") == "pending"
        and bool((payload.get("seed") or {}).get("image_url"))
    )


async def pending_entries(
    session: AsyncSession, sitting_id: uuid.UUID
) -> list[IntakeEntry]:
    entries = await session.scalars(
        select(IntakeEntry)
        .where(IntakeEntry.sitting_id == sitting_id)
        .order_by(IntakeEntry.created_at, IntakeEntry.id)
    )
    return [entry for entry in entries if _pending(entry)]


async def _fetch_one(url: str) -> tuple[Any, str | None]:
    """(the 800px photo, None), or (None, the owner's sentence)."""
    try:
        data = await fetch_image(url)
        return await asyncio.to_thread(make_garment_image, data), None
    except ImageFetchError as error:
        return None, str(error)
    except ClosetImageError as error:
        return None, str(error)


async def fetch_pending(
    session: AsyncSession, sitting_id: uuid.UUID, limit: int = IMAGE_BATCH
) -> tuple[list[IntakeEntry], int]:
    """Fetches the photos of up to `limit` entries whose photo is pending,
    each once: the photo is held on the sitting (an `intake_photos` row the
    entry points at) until the commit moves it to the garment, and a failure
    is recorded on the entry (`image` failed, `image_error`), never retried.
    Returns the entries changed and how many are still pending. Does not
    commit; the network waits are before any write, so a page edit made
    meanwhile is kept (only the server's own keys are written)."""
    batch = (await pending_entries(session, sitting_id))[:limit]
    urls = [(entry.payload["seed"]["image_url"]) for entry in batch]
    answers = await asyncio.gather(*(_fetch_one(url) for url in urls))
    changed = []
    for entry, (photo, error) in zip(batch, answers, strict=True):
        fresh = await session.scalar(
            select(IntakeEntry).where(IntakeEntry.id == entry.id).with_for_update()
        )
        if fresh is None or not _pending(fresh):
            continue  # removed or answered meanwhile
        payload = dict(fresh.payload)
        if photo is None:
            payload["image"] = "failed"
            payload["image_error"] = error
        else:
            row = IntakePhoto(
                sitting_id=sitting_id,
                state=IntakePhotoState.READ,
                filename="seed",
                thumb_webp=photo.webp,
                width=photo.width,
                height=photo.height,
            )
            session.add(row)
            await session.flush()
            fresh.photo_id = row.id
            payload["image"] = "held"
        fresh.payload = payload
        changed.append(fresh)
    left = len(await pending_entries(session, sitting_id))
    return changed, left
