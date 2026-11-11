"""Committing a sitting: its entries become items or garments (spec D8).

Shelf entries go through `items.commit_items`, the create path `/bulk` uses,
so a sitting writes the same rows the photo importer did (AC 6): the write
rules (`formats.py`, `comics.py`), duplicates skipped, playthroughs seeded,
new items private. Every row is checked first, so a refusal maps back to
its entry and nothing is written until it is fixed (all or nothing).

An entry's state decides what happens to it:

- exact, probable, ready, typed: written (`added`);
- owned: not written, counted once per title (`already_owned`);
- ignored: cleared, not counted;
- check, reading: kept in the sitting to come back to (`skipped_kept`).

A photo not yet read (uploaded, reading or failed) is kept too, and counted
as `photos_waiting`: committing mid-read never loses a photo. The sitting
goes once nothing is kept, and its photos with it. A commit that would
change nothing -- only kept entries, or no entries while photos still wait
-- is a 409 in intake's words, never a deletion.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from closet_routes import GarmentFields, apply_garment_fields
from comics import RangeError
from formats import CopyFieldError
from intake.kinds import REGISTRY, Kind
from items import ItemIn, RowRefused, _write_fields, commit_items
from models import (
    Garment,
    GarmentStatus,
    GarmentTagSource,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    ItemStatus,
)

S = IntakeEntryState
WRITTEN = frozenset({S.EXACT, S.PROBABLE, S.READY, S.TYPED})
KEPT = frozenset({S.CHECK, S.READING})
P = IntakePhotoState
WAITING_PHOTOS = frozenset({P.UPLOADED, P.READING, P.FAILED})

# Intake's own words for a 409 (spec: never the catalogue-lock wording).
SITTING_GONE = (
    "This sitting has already been added or discarded, perhaps on another device."
)
NOTHING_TO_ADD = (
    "Nothing in this sitting is ready to add yet; the rest is still to check."
)
PHOTOS_STILL_WAITING = (
    "Nothing in this sitting is ready to add yet; its photos are still being read."
)


class SittingGone(Exception):
    """The sitting was committed or discarded already (a second device)."""


class NothingToAdd(Exception):
    """Every entry left is still to check: a commit would change nothing."""

    detail = NOTHING_TO_ADD


class PhotosStillWaiting(NothingToAdd):
    """No entry to add yet while photos still wait to be read."""

    detail = PHOTOS_STILL_WAITING


@dataclass(frozen=True)
class Refusal:
    """A row the write rules refuse, mapped to its entry and, when one field
    alone is at fault, that field."""

    entry_id: uuid.UUID
    field: str | None
    message: str

    def as_json(self) -> dict[str, Any]:
        """The page's view: the entry's id as text."""
        return {
            "entry_id": str(self.entry_id),
            "field": self.field,
            "message": self.message,
        }


@dataclass
class SittingCommit:
    """What a commit did, as Done shows it (AC 8), and the new item ids."""

    added: int = 0
    already_owned: int = 0
    skipped_kept: int = 0
    photos_empty: int = 0
    photos_waiting: int = 0
    refused: list[Refusal] = field(default_factory=list)
    created: list[uuid.UUID] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        """The route's answer."""
        return {
            "added": self.added,
            "already_owned": self.already_owned,
            "skipped_kept": self.skipped_kept,
            "photos_empty": self.photos_empty,
            "photos_waiting": self.photos_waiting,
            "refused": [refusal.as_json() for refusal in self.refused],
        }


def shelf_row(kind: Kind, entry: IntakeEntry) -> dict[str, Any]:
    """The item an entry writes: the kind's row, with the defaults the
    photo importer sent (backlog; the detected title and year when no match
    gave one) and never public."""
    payload = entry.payload or {}
    row = kind.to_row({"chosen": entry.chosen, "payload": payload})
    if not row.get("title"):
        row["title"] = payload.get("detected_title")
    if row.get("year") is None and payload.get("detected_year") is not None:
        row["year"] = payload["detected_year"]
    row.setdefault("status", ItemStatus.BACKLOG.value)
    row["is_public"] = False
    return row


def _key(row: dict[str, Any]) -> tuple[str, str] | None:
    source, external_id = row.get("external_source"), row.get("external_id")
    return (source, str(external_id)) if source and external_id else None


def _validation_refusal(entry: IntakeEntry, error: ValidationError) -> Refusal:
    first = error.errors()[0]
    loc = first.get("loc") or ()
    return Refusal(entry.id, str(loc[0]) if loc else None, first["msg"])


def _faulty_field(item: ItemIn) -> str | None:
    """The one field the write rules refuse on its own, if there is one; a
    contradiction between two fields (a cart ID and a format) names none."""
    changes = item.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key in ("type", "title"):
            continue
        try:
            _write_fields({"type": item.type, "title": item.title, key: value}, None)
        except (CopyFieldError, RangeError):
            return key
    return None


def _shelf_item(kind: Kind, entry: IntakeEntry) -> ItemIn | Refusal:
    try:
        item = ItemIn.model_validate(shelf_row(kind, entry))
    except ValidationError as error:
        return _validation_refusal(entry, error)
    try:
        _write_fields(item.model_dump(exclude_unset=True), None)
    except (CopyFieldError, RangeError) as error:
        return Refusal(entry.id, _faulty_field(item), str(error))
    return item


def _typed_garment(kind: Kind, entry: IntakeEntry) -> Garment | Refusal:
    """A garment typed in by hand, as `POST /api/closet/garments` makes one."""
    try:
        fields = GarmentFields.model_validate(kind.to_row({"payload": entry.payload}))
    except ValidationError as error:
        return _validation_refusal(entry, error)
    row = Garment(
        status=GarmentStatus.UNTAGGED,
        seasons=[],
        tag_attempts=0,
        tag_source=GarmentTagSource.MANUAL,
    )
    try:
        apply_garment_fields(row, fields)
    except HTTPException as error:
        return Refusal(entry.id, None, str(error.detail))
    return row


async def commit_sitting(
    session: AsyncSession, sitting_id: uuid.UUID, *, today: date
) -> SittingCommit:
    """Writes the sitting's entries; see the module docstring. Does not
    commit: the caller commits, or rolls back when `refused` is not empty.

    The sitting row is locked first, so a second device committing at the
    same moment waits, then finds it gone (SittingGone). NothingToAdd when
    only entries still to check remain; PhotosStillWaiting when no entry is
    left to settle while photos still wait to be read.
    """
    sitting = await session.scalar(
        select(IntakeSitting).where(IntakeSitting.id == sitting_id).with_for_update()
    )
    if sitting is None:
        raise SittingGone
    entries = (
        await session.scalars(
            select(IntakeEntry)
            .where(IntakeEntry.sitting_id == sitting_id)
            .order_by(IntakeEntry.created_at, IntakeEntry.id)
        )
    ).all()
    kept = [entry for entry in entries if entry.state in KEPT]
    photos_waiting = await session.scalar(
        select(func.count())
        .select_from(IntakePhoto)
        .where(
            IntakePhoto.sitting_id == sitting_id,
            IntakePhoto.state.in_(WAITING_PHOTOS),
        )
    )
    if len(kept) == len(entries):
        if photos_waiting:
            raise PhotosStillWaiting
        if kept:
            raise NothingToAdd

    outcome = SittingCommit(skipped_kept=len(kept), photos_waiting=photos_waiting)
    outcome.photos_empty = await session.scalar(
        select(func.count())
        .select_from(IntakePhoto)
        .where(
            IntakePhoto.sitting_id == sitting_id,
            IntakePhoto.state == IntakePhotoState.EMPTY,
        )
    )

    # A title marked owned on two photos is one title already on the shelf.
    owned_keys: set[tuple[str, str]] = set()
    for entry in entries:
        if entry.state is not S.OWNED:
            continue
        kind = REGISTRY.get(entry.kind)
        key = _key(shelf_row(kind, entry)) if kind else None
        if key is None:
            outcome.already_owned += 1
        elif key not in owned_keys:
            owned_keys.add(key)
            outcome.already_owned += 1

    rows: list[ItemIn] = []
    row_entries: list[IntakeEntry] = []
    garments: list[Garment] = []
    seen: set[tuple[str, str]] = set()
    for entry in entries:
        if entry.state not in WRITTEN:
            continue
        kind = REGISTRY.get(entry.kind)
        if kind is None:
            outcome.refused.append(
                Refusal(entry.id, "kind", f"{entry.kind} is not a kind intake knows")
            )
            continue
        if kind.area is IntakeArea.CLOSET:
            if entry.garment_id is not None:
                outcome.added += 1  # made real on upload; nothing to flip
                continue
            made = _typed_garment(kind, entry)
            if isinstance(made, Refusal):
                outcome.refused.append(made)
            else:
                garments.append(made)
            continue
        made = _shelf_item(kind, entry)
        if isinstance(made, Refusal):
            outcome.refused.append(made)
            continue
        key = _key(made.model_dump())
        if key in owned_keys:
            continue  # counted once, as already owned
        if key is not None:
            if key in seen:
                continue  # the same title on a second photo: counted once
            seen.add(key)
        rows.append(made)
        row_entries.append(entry)

    if outcome.refused:
        return outcome

    try:
        result = await commit_items(session, rows, today=today)
    except RowRefused as refused:
        outcome.refused.append(
            Refusal(row_entries[refused.index].id, None, str(refused.error))
        )
        return outcome
    session.add_all(garments)
    outcome.created = result.created
    outcome.added += len(result.created) + len(garments)
    outcome.already_owned += result.existing

    if kept or photos_waiting:
        await session.execute(
            delete(IntakeEntry).where(
                IntakeEntry.sitting_id == sitting_id,
                IntakeEntry.state.not_in(KEPT),
            )
        )
    else:
        await session.delete(sitting)
    return outcome
