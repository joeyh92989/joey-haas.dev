"""Committing a sitting: its entries become items or garments (spec D8).

Shelf entries go through `items.commit_items`, the create path `/bulk` uses,
so a sitting writes the same rows the photo importer did (AC 6): the write
rules (`formats.py`, `comics.py`), duplicates skipped, playthroughs seeded,
new items private. Every row is checked first, so a refusal maps back to
its entry and nothing is written until it is fixed (all or nothing).

An entry's state decides what happens to it:

- exact, ready, typed: written (`added`);
- owned: not written, counted once per title (`already_owned`);
- ignored: cleared, not counted;
- check, probable (not yet confirmed), reading: kept in the sitting to come
  back to (`skipped_kept`).

A comic is one row per series, so its entries (written or owned) are never
dropped as repeats: their issues are joined into one new row, or added to
the series already on the shelf by Got it's rule (`issues_added`). The
issues a series gains are the typed ones its editions did not hold before
this commit, so they are written loose as typed, in a sitting and in the
add bar alike. A series gaining neither issues nor an edition is
`already_owned`; one gaining only an edition is grown. Each series already
on the shelf is also reported on its own (`series_grew`): the issues it
gained, the ones it held already, the editions it gained, and its run before
and after, for Done's "Series that grew".

A photo not yet read (uploaded, reading or failed) is kept too, and counted
as `photos_waiting`: committing mid-read never loses a photo. The sitting
goes once nothing is kept, and its photos with it. A commit that would
change nothing -- only kept entries, or no entries while photos still wait
-- is a 409 in intake's words, never a deletion.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, func, select, text, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from closet_routes import GarmentFields, apply_garment_fields
from comics import (
    RangeError,
    edition_issues,
    expand,
    format_ranges,
    held_ranges,
    load_holds,
    load_holds_many,
    owned_set,
    parse_ranges,
    row_run,
    sync_marks,
    union,
    validate_editions,
)
from comics_routes import got_issues
from formats import CopyFieldError
from intake.kinds import REGISTRY, Kind
from intake.link_import import entry_key as link_key
from intake.link_import import is_link
from intake.place_kind import (
    DEFAULT_CITY,
    EDITABLE,
    clean_chosen,
    clean_fields,
    clean_name,
    clean_position,
    owned_spot_id,
)
from intake.seed_import import imported_keys, take_summary
from intake.volume_plan import (
    VolumePlan,
    already_held,
    book_plan,
    existing_volumes,
    find_manual_titles,
    is_book,
    preview,
    title_key,
    unshared_series,
    write_volume,
)
from items import ItemIn, RowRefused, _write_fields, commit_items
from models import (
    CandidateSource,
    ComicIssue,
    ComicShelfFormat,
    ComicVolume,
    Garment,
    GarmentColorSource,
    GarmentImage,
    GarmentProduct,
    GarmentProductSource,
    GarmentStatus,
    GarmentTagSource,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
    Spot,
)
from spots_routes import build_spot

S = IntakeEntryState
WRITTEN = frozenset({S.EXACT, S.READY, S.TYPED})
KEPT = frozenset({S.CHECK, S.PROBABLE, S.READING})
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


def _run_of(item: Item, held: list[dict]) -> dict[str, Any]:
    """The row's run; `held` is its owned volumes' `held_ranges`."""
    return row_run(
        item.issues_owned,
        item.issues_skipped,
        held,
        item.read_to,
        item.source_metadata,
    )


@dataclass
class SeriesGrew:
    """One series already on the shelf that a commit wrote issues to: the
    issues it gained and those it held already (loose or in an edition),
    against its run before the write. Made before the write; `after` is
    filled in once Got it's rule has run."""

    item: Item
    before: dict[str, Any]
    added: list[int]
    already: list[int]
    editions_added: list[dict] = field(default_factory=list)
    after_owned_text: str = ""

    @classmethod
    async def before_write(
        cls, session: AsyncSession, item: Item, issues: set[int]
    ) -> SeriesGrew:
        """The run is the owned volumes' (what the shim has synced by now,
        which is the row as it stood before this write)."""
        ranges = held_ranges(await load_holds(session, item.id))
        held = owned_set(item.issues_owned, ranges)
        return cls(
            item=item,
            before=_run_of(item, ranges),
            added=sorted(issues - held),
            already=sorted(issues & held),
        )

    async def after_write(self, session: AsyncSession) -> None:
        """Called after `sync_marks`, so the volumes carry what was written."""
        ranges = held_ranges(await load_holds(session, self.item.id))
        self.after_owned_text = format_ranges(owned_set(self.item.issues_owned, ranges))

    def as_json(self) -> dict[str, Any]:
        return {
            "item_id": str(self.item.id),
            "title": self.item.title,
            "is_public": self.item.is_public,
            "cover_url": self.item.cover_url,
            "before": {
                "owned": self.before["owned"],
                "released": self.before["released"],
            },
            "ongoing": self.before["ongoing"],
            "added": self.added,
            "already": self.already,
            "editions_added": self.editions_added,
            "after_owned_text": self.after_owned_text,
        }


# Held for the length of a transaction by every place commit (a sitting's or
# the add bar's), so two of them take turns. Arbitrary; distinct from
# migration_lock.MIGRATION_LOCK_KEY.
PLACE_COMMIT_LOCK_KEY = 7_243_000_002
PLACE_NOT_DENVER = "Only a Denver place can be public"


async def lock_place_commits(session: AsyncSession) -> None:
    """Takes the transaction-scoped advisory lock for place commits. A second
    commit blocks here until the first commits or rolls back, then its owned
    check (a new statement under READ COMMITTED) sees the first's spots."""
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:key)"), {"key": PLACE_COMMIT_LOCK_KEY}
    )


def spot_answer(new: list[dict[str, str]], owned: list[dict[str, str]]) -> dict:
    """The place keys of an answer: absent when no place was involved."""
    if not (new or owned):
        return {}
    return {"spots_new": new, "spots_owned": owned}


@dataclass
class PlaceWrite:
    """What writing place entries did: the spots made and the ones already
    owned as `{id, name}`, or the refusals that stopped it."""

    new: list[dict[str, str]] = field(default_factory=list)
    owned: list[dict[str, str]] = field(default_factory=list)
    refused: list["Refusal"] = field(default_factory=list)


def _place_fields(entry: IntakeEntry) -> dict[str, Any] | "Refusal":
    """The spot an entry writes, checked again from what is stored: the
    entry is untrusted, so the add-time validators run here too. A refusal
    names the entry and, when one field is at fault, that field."""
    payload = entry.payload or {}
    try:
        name = clean_name(payload.get("name"))
    except ValueError as error:
        return Refusal(entry.id, "name", str(error))
    try:
        lat, lng = clean_position(payload.get("lat"), payload.get("lng"))
    except ValueError as error:
        return Refusal(entry.id, "coords", str(error))
    try:
        owner = clean_fields({key: payload[key] for key in EDITABLE if key in payload})
    except ValueError as error:
        return Refusal(entry.id, None, str(error))
    source_id = None
    if entry.chosen:
        # The validated name and position win over whatever `chosen` carries.
        hit = {**entry.chosen, "title": name, "lat": lat, "lng": lng}
        try:
            _, chosen = clean_chosen(hit)
        except ValueError as error:
            return Refusal(entry.id, "source_id", str(error))
        source_id = chosen["source_id"]
    city = owner.get("city", DEFAULT_CITY)
    is_public = owner.get("is_public", False)
    if is_public and city.lower() != DEFAULT_CITY:
        return Refusal(entry.id, "is_public", PLACE_NOT_DENVER)
    return {
        "name": name,
        "lat": lat,
        "lng": lng,
        "city": city,
        "neighbourhood": owner.get("neighbourhood"),
        "blurb": owner.get("blurb"),
        "tags": owner.get("tags", []),
        "is_public": is_public,
        "source": CandidateSource.OSM if source_id else None,
        "source_id": source_id,
    }


async def write_places(session: AsyncSession, entries: list[IntakeEntry]) -> PlaceWrite:
    """Writes each place entry as one private spot (public only for a Denver
    place that asks), through the by-hand route's `build_spot`. Every entry is
    checked first; nothing is locked or written while one is refused. Then,
    under the place-commit lock, a place already owned (same OSM source_id,
    else the same name within `SAME_PLACE_METRES`, counting the spots this
    loop just wrote) is reported, not written again. Does not commit."""
    result = PlaceWrite()
    made: list[tuple[IntakeEntry, dict[str, Any]]] = []
    for entry in entries:
        fields = _place_fields(entry)
        if isinstance(fields, Refusal):
            result.refused.append(fields)
        else:
            made.append((entry, fields))
    if result.refused or not made:
        return result
    await lock_place_commits(session)
    for entry, fields in made:
        owned = await owned_spot_id(
            session,
            source_id=fields["source_id"],
            name=fields["name"],
            lat=fields["lat"],
            lng=fields["lng"],
        )
        if owned:
            spot = await session.get(Spot, uuid.UUID(owned))
            result.owned.append({"id": owned, "name": spot.name if spot else ""})
            continue
        try:
            spot = await build_spot(session, **fields)
        except ValueError as error:
            result.refused.append(Refusal(entry.id, None, str(error)))
            return result
        session.add(spot)
        try:
            await session.flush()
        except IntegrityError:
            result.refused.append(
                Refusal(entry.id, None, "Another spot took that name; try again")
            )
            return result
        result.new.append({"id": str(spot.id), "name": spot.name})
    return result


@dataclass
class SittingCommit:
    """What a commit did, as Done shows it (AC 8), and the new item ids."""

    added: int = 0
    already_owned: int = 0
    issues_added: int = 0
    skipped_kept: int = 0
    photos_empty: int = 0
    photos_waiting: int = 0
    # Seed-file pieces written without a photograph (never fetched, or the
    # fetch failed), and the file's own counts for Done (None: no file).
    images_missing: int = 0
    file_import: dict[str, int] | None = None
    refused: list[Refusal] = field(default_factory=list)
    created: list[uuid.UUID] = field(default_factory=list)
    series_grew: list[SeriesGrew] = field(default_factory=list)
    # Comic series this commit created that brought issues or editions:
    # {title, cover_url, issues, editions}, for Done's "adds #1-4" lines.
    series_new: list[dict[str, Any]] = field(default_factory=list)
    # Volumes this commit wrote (a collected book is a volume), and the
    # titles it made to hold them (a book with no series on the shelf).
    volumes_new: list[dict[str, Any]] = field(default_factory=list)
    titles_created: list[dict[str, Any]] = field(default_factory=list)
    # Places: the private spots made, and the ones already owned ({id, name}).
    spots_new: list[dict[str, str]] = field(default_factory=list)
    spots_owned: list[dict[str, str]] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        """The route's answer. `spots_new` and `spots_owned` appear only when
        a place was written or found owned, so a shelf or closet commit's
        answer is exactly what it was."""
        return {
            **spot_answer(self.spots_new, self.spots_owned),
            "series_new": self.series_new,
            "volumes_new": self.volumes_new,
            "titles_created": self.titles_created,
            "added": self.added,
            "already_owned": self.already_owned,
            "issues_added": self.issues_added,
            "series_grew": [grew.as_json() for grew in self.series_grew],
            "skipped_kept": self.skipped_kept,
            "photos_empty": self.photos_empty,
            "photos_waiting": self.photos_waiting,
            "images_missing": self.images_missing,
            "file_import": self.file_import,
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
    if kind.source is ItemType.COMIC and row.get("shelf_format") not in {
        collected.value for collected in _COLLECTED
    }:
        # Editions are only for collected formats: a row switched back to
        # singles keeps none, and is not refused for ones it no longer shows.
        row.pop("editions", None)
    return row


def _key(row: dict[str, Any]) -> tuple[str, str] | None:
    source, external_id = row.get("external_source"), row.get("external_id")
    return (source, str(external_id)) if source and external_id else None


def _placed(kind: Kind | None, entry: IntakeEntry) -> IntakeEntry:
    """The entry as it is placed (#330). A collected book that matched a
    series but does not share its title (`volume_plan.unshared_series`) is
    placed as though it had no match: a transient copy (same id, so its
    volume is still once per entry) whose `chosen` carries only the series'
    name, so its row has the book's own title and no external id and it goes
    to its own manual title. Every other entry is returned as it is. The one
    place the commit, the add bar and Check's preview decide this, so they
    cannot disagree."""
    if not (_is_comic(kind) and is_book(entry.payload) and entry.chosen):
        return entry
    payload = entry.payload or {}
    series = unshared_series(payload, shelf_row(kind, entry), entry.chosen)
    if series is None:
        return entry
    return IntakeEntry(
        id=entry.id,
        kind=entry.kind,
        state=entry.state,
        payload=payload,
        chosen={"series_title": series},
    )


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


def is_seed(entry: IntakeEntry) -> bool:
    """A draft made from a seed file row: the server's `seed` record."""
    return bool((entry.payload or {}).get("seed"))


def _text(value: Any, limit: int) -> str | None:
    """A string cut to `limit`, or None; anything else is not text."""
    return value[:limit] if isinstance(value, str) and value else None


def _seed_record(entry: IntakeEntry) -> tuple[dict[str, Any], str] | str:
    """The entry's seed record and its source, or the sentence for why the
    record is unusable (an entry written by something other than the file
    import). Never raises: a damaged record refuses its own entry."""
    seed = (entry.payload or {}).get("seed")
    if not isinstance(seed, dict):
        return "This piece's file record is damaged; remove it and import again"
    valid = {source.value for source in GarmentProductSource}
    source = seed.get("source")
    if source not in valid:
        return "This piece's file record names no known store"
    for key in ("order_id", "store_item_no", "price_usd", "key"):
        if seed.get(key) is not None and not isinstance(seed[key], str):
            return f"This piece's file record has a bad {key}"
    return seed, source


def _unchosen_colour(entry: IntakeEntry) -> Refusal | None:
    """A refusal for a pasted link that offers several colours and has none
    chosen: which colour was bought is not a guess."""
    row = ((entry.payload or {}).get("seed") or {}).get("row") or {}
    if len(entry.candidates or []) > 1 and not row.get("chosen"):
        return Refusal(entry.id, "color_name", "Choose this piece's colour first")
    return None


def _fetched_at(seed: dict[str, Any], now: datetime) -> datetime:
    """When a pasted link's store was read (the seed record says), else now."""
    try:
        read = datetime.fromisoformat(seed["fetched_at"])
    except (KeyError, TypeError, ValueError):
        return now
    return read if read.tzinfo else read.replace(tzinfo=UTC)


@dataclass
class SeedGarment:
    """What a seed entry writes: the garment, its product row and, when the
    entry holds one, its photo."""

    garment: Garment
    product: GarmentProduct
    image: GarmentImage | None
    photo_id: uuid.UUID | None = None


def _seed_garment(
    kind: Kind, entry: IntakeEntry, photo: Any | None, now: datetime
) -> SeedGarment | Refusal:
    """A garment from a seed file row (design D5, D6): written at commit,
    never at upload. It is `untagged` with no tag source, so the tag queue
    takes it for warmth, formality and seasons, while its store colour,
    brand and size are the vendor's (`color_source` vendor)."""
    payload = entry.payload or {}
    record = _seed_record(entry)
    if isinstance(record, str):
        return Refusal(entry.id, None, record)
    seed, source = record
    price = None
    if seed.get("price_usd"):
        try:
            price = Decimal(seed["price_usd"]).quantize(Decimal("0.01"))
        except ArithmeticError:
            price = None
        if price is None or not 0 <= price <= Decimal("999999.99"):
            return Refusal(entry.id, None, "This piece's file record has a bad price")
    try:
        fields = GarmentFields.model_validate(kind.to_row({"payload": payload}))
    except ValidationError as error:
        return _validation_refusal(entry, error)
    row = Garment(
        id=uuid.uuid4(),
        status=GarmentStatus.UNTAGGED,
        seasons=[],
        tag_attempts=0,
    )
    try:
        apply_garment_fields(row, fields)
    except HTTPException as error:
        return Refusal(entry.id, None, str(error.detail))
    # apply_garment_fields saves like a hand edit: an untagged piece goes
    # active and a colour becomes `manual`. A seed piece is neither.
    row.status = GarmentStatus.UNTAGGED
    row.tag_source = None
    row.color_source = GarmentColorSource.VENDOR if row.color_name else None
    snapshot = seed.get("row") if isinstance(seed.get("row"), dict) else {}
    if payload.get("link"):
        # The size is the piece's own: the stored row rebuilds the same key.
        snapshot = {**snapshot, "size": payload.get("size")}
    named = snapshot.get("name") or snapshot.get("title")
    product = GarmentProduct(
        garment_id=row.id,
        source=GarmentProductSource(source),
        order_ref=_text(seed.get("order_id"), 80),
        store_item_no=_text(seed.get("store_item_no"), 80),
        url=_text(seed.get("url"), 2000),
        title=named if isinstance(named, str) else row.name,
        price=price,
        snapshot=snapshot,
        fetched_at=_fetched_at(seed, now),
    )
    image = (
        GarmentImage(
            garment_id=row.id,
            webp=photo.thumb_webp,
            width=photo.width,
            height=photo.height,
        )
        if photo is not None
        else None
    )
    return SeedGarment(row, product, image, entry.photo_id)


def _is_comic(kind: Kind | None) -> bool:
    return kind is not None and kind.source is ItemType.COMIC


@dataclass
class _Series:
    """One comic series in a sitting: the first written entry's row (None
    when every entry was marked owned), every entry's issue ranges, and the
    shelf format and collected editions Details set (the first entry that has
    each)."""

    row: ItemIn | None = None
    entry: IntakeEntry | None = None
    issues: list[str | None] = field(default_factory=list)
    shelf_format: ComicShelfFormat | None = None
    # (entry, editions) of each entry that carries some, in commit order.
    editions: list[tuple[IntakeEntry, list[dict]]] = field(default_factory=list)
    # True when `shelf_format` is only what a collected book implies, not
    # something Details set: it never overrides a series' own format.
    shelf_derived: bool = False
    # (entry, row) of each collected book, owned or not: each is a volume.
    books: list[tuple[IntakeEntry, ItemIn]] = field(default_factory=list)
    # The books whose volume is not written yet, with what each would be.
    fresh: list[tuple[IntakeEntry, ItemIn, VolumePlan]] = field(default_factory=list)


@dataclass
class _Loose:
    """Collected books with no series match that share one title (by name,
    `title_key`): an existing title with no external id and that name is
    reused (the oldest); otherwise one is made with the detected name and no
    external id. Each book is a volume on it."""

    row: ItemIn
    entry: IntakeEntry
    books: list[tuple[IntakeEntry, ItemIn]] = field(default_factory=list)
    fresh: list[tuple[IntakeEntry, ItemIn, VolumePlan]] = field(default_factory=list)
    # The title the books go on: an existing one of the same name (reused),
    # or the one made for them just before the volumes are written.
    item: Item | None = None


_COLLECTED = (ComicShelfFormat.TRADES, ComicShelfFormat.OMNIBUS)


def _entry_editions(made: ItemIn) -> list[dict]:
    """The editions an entry's row brings: only a trades or omnibus row, so a
    row switched back to singles writes none left over."""
    return list(made.editions or []) if made.shelf_format in _COLLECTED else []


def _clear_skips(item: Item, editions: list[dict]) -> None:
    """An edition that now covers a skipped issue takes it out of the
    skipped ones (Got it's rule), canonicalised through comics.py."""
    skipped = expand(parse_ranges(item.issues_skipped))
    covered = skipped & edition_issues(editions)
    if covered:
        item.issues_skipped = format_ranges(skipped - covered) or None


def _editions_gained(held: list[dict] | None, merged: list[dict] | None) -> list[dict]:
    """The editions `merged` has that `held` lacks (by kind, label and range)."""
    keys = ("kind", "label", "from", "to")
    had = {tuple(edition.get(key) for key in keys) for edition in held or []}
    return [
        edition
        for edition in merged or []
        if tuple(edition.get(key) for key in keys) not in had
    ]


def _merged_editions(held: list[dict] | None, added: list[dict]) -> list[dict] | None:
    """`held` plus the `added` ones it lacks (an identical kind, label and
    range is not added twice), canonical. Raises RangeError."""

    def core(edition: dict) -> tuple:
        return tuple(edition.get(key) for key in ("kind", "label", "from", "to"))

    merged = list(held or [])
    seen = {core(edition) for edition in merged}
    for edition in added:
        if core(edition) not in seen:
            seen.add(core(edition))
            merged.append(edition)
    return validate_editions(merged, held) or None


def _volume_json(volume: ComicVolume, title: Item, created: bool) -> dict[str, Any]:
    """One new volume as the commit's answer lists it."""
    return {
        "id": str(volume.id),
        "slug": volume.slug,
        "label": volume.label,
        "kind": volume.kind,
        "line_number": volume.line_number,
        "title": title.title,
        "title_id": str(title.id),
        "title_created": created,
    }


async def _write_volumes(
    session: AsyncSession,
    title: Item,
    fresh: list[tuple[IntakeEntry, ItemIn, VolumePlan]],
    *,
    title_created: bool,
    volumes_new: list[dict[str, Any]],
    titles_created: list[dict[str, Any]],
) -> int:
    """Writes each fresh book as a volume on `title` (locked by the caller,
    or new). A range a book links to its own title takes those issues out of
    the title's skipped ones, as an edition did (Got it's rule). Returns how
    many volumes were made; one written by a second writer meanwhile is not
    counted again."""
    made = 0
    for entry, _, plan in fresh:
        volume, created = await write_volume(session, title, entry.id, plan)
        if not created:
            continue
        made += 1
        volumes_new.append(_volume_json(volume, title, title_created))
        _clear_skips(
            title,
            [{"from": c.link[0], "to": c.link[1]} for c in plan.collects if c.link],
        )
    if made and title_created:
        titles_created.append({"id": str(title.id), "title": title.title})
    return made


async def _series_on_shelf(
    session: AsyncSession, series: dict[tuple[str, str], _Series]
) -> dict[tuple[str, str], Item]:
    """The sitting's series already in `items`, locked for the write."""
    if not series:
        return {}
    found = await session.scalars(
        select(Item)
        .where(tuple_(Item.external_source, Item.external_id).in_(list(series)))
        .order_by(Item.id)  # locks are taken in one order, whoever commits
        .with_for_update()
    )
    return {(item.external_source, item.external_id): item for item in found}


async def series_on_shelf_for(
    session: AsyncSession, entries: list[IntakeEntry]
) -> dict[uuid.UUID, dict[str, Any]]:
    """Each comic entry whose series is already on the shelf, by the
    commit's own key, with that series' run as it stands now, so Check can
    say what the entry adds before anything is written. Entries without a
    match, or not comics, are left out."""
    keys: dict[uuid.UUID, tuple[str, str]] = {}
    for entry in entries:
        kind = REGISTRY.get(entry.kind)
        if not _is_comic(kind):
            continue
        key = _key(shelf_row(kind, _placed(kind, entry)))
        if key is not None:
            keys[entry.id] = key
    if not keys:
        return {}
    found = await session.scalars(
        select(Item).where(
            tuple_(Item.external_source, Item.external_id).in_(set(keys.values()))
        )
    )
    items = {(item.external_source, item.external_id): item for item in found}
    # The highest issue the synced issue rows know, for Check's run check.
    issue_max = dict(
        (
            await session.execute(
                select(ComicIssue.item_id, func.max(ComicIssue.number))
                .where(
                    ComicIssue.item_id.in_([item.id for item in items.values()]),
                    ComicIssue.cv_id.is_not(None),  # a stub is no synced issue
                )
                .group_by(ComicIssue.item_id)
            )
        ).all()
    )
    holds = await load_holds_many(session, [item.id for item in items.values()])
    shelf: dict[uuid.UUID, dict[str, Any]] = {}
    for entry_id, key in keys.items():
        item = items.get(key)
        if item is None:
            continue
        run = _run_of(item, held_ranges(holds[item.id]))
        shelf[entry_id] = {
            "item_id": str(item.id),
            "title": item.title,
            "cover_url": item.cover_url,
            "owned": run["owned"],
            "owned_text": run["owned_text"],
            "released": run["released"],
            "ongoing": run["ongoing"],
            "issue_max": issue_max.get(item.id),
        }
    return shelf


async def comic_adds_for(
    session: AsyncSession, entries: list[IntakeEntry]
) -> dict[uuid.UUID, dict[str, Any]]:
    """What each comic entry adds, for Check, before anything is written:
    `adds` (a volume, or an issue), `title_will_be_created` and, for a
    collected book, `contents_preview`. The volume is planned by the same
    function the commit plans it with (`volume_plan.book_plan`), from the
    same row and title, so the preview is what the commit writes. Reads only
    the shelf: no model, no network."""
    rows: dict[uuid.UUID, tuple[IntakeEntry, dict[str, Any]]] = {}
    for entry in entries:
        kind = REGISTRY.get(entry.kind)
        if not _is_comic(kind):
            continue
        entry = _placed(kind, entry)
        made = _shelf_item(kind, entry)
        rows[entry.id] = (
            entry,
            shelf_row(kind, entry) if isinstance(made, Refusal) else made.model_dump(),
        )
    if not rows:
        return {}
    keys = {k for _, row in rows.values() if (k := _key(row)) is not None}
    on_shelf = {}
    if keys:
        found = await session.scalars(
            select(Item).where(tuple_(Item.external_source, Item.external_id).in_(keys))
        )
        on_shelf = {(item.external_source, item.external_id): item for item in found}
    # A book with no match goes on the title of its name, when one exists.
    manual = await find_manual_titles(
        session,
        [
            row["title"]
            for entry, row in rows.values()
            if _key(row) is None and is_book(entry.payload)
        ],
    )
    shown: dict[uuid.UUID, dict[str, Any]] = {}
    for entry_id, (entry, row) in rows.items():
        payload = entry.payload or {}
        key = _key(row)
        book = is_book(payload)
        if key is not None:
            item = on_shelf.get(key)
        else:
            item = manual.get(title_key(row["title"])) if book else None
        plan = book_plan(payload, row, item, entry.chosen) if book else None
        held = await already_held(session, item, plan, payload) if plan else None
        shown[entry_id] = preview(payload, plan, item, held)
    return shown


def _with_issues(row: ItemIn, issues: set[int]) -> ItemIn:
    """The first entry's row carrying the series' joined issues."""
    fields = row.model_dump(exclude_unset=True)
    fields["issues_owned"] = format_ranges(issues) or None
    return ItemIn.model_validate(fields)


async def _made_titles(
    session: AsyncSession,
    series: dict[tuple[str, str], _Series],
    on_shelf: dict[tuple[str, str], Item],
) -> list[tuple[Item, list]]:
    """The series this commit made that hold new volumes, with those books
    (found by their key, which also finds one a second writer made first)."""
    wanted = [k for k, f in series.items() if f.fresh and k not in on_shelf]
    found: list[tuple[Item, list]] = []
    if wanted:
        items = await session.scalars(
            select(Item)
            .where(tuple_(Item.external_source, Item.external_id).in_(wanted))
            .order_by(Item.id)
            .with_for_update()
        )
        by_key = {(i.external_source, i.external_id): i for i in items}
        found += [(by_key[k], series[k].fresh) for k in wanted if k in by_key]
    return found


@dataclass
class SingleAdd:
    """What one add bar commit did: the counts, the new item ids, the new
    garment's id, or the refusals that kept it from writing."""

    added: int = 0
    already_owned: int = 0
    issues_added: int = 0
    created: list[uuid.UUID] = field(default_factory=list)
    garment_id: uuid.UUID | None = None
    refused: list[Refusal] = field(default_factory=list)
    series_grew: list[SeriesGrew] = field(default_factory=list)
    volumes_new: list[dict[str, Any]] = field(default_factory=list)
    titles_created: list[dict[str, Any]] = field(default_factory=list)
    spots_new: list[dict[str, str]] = field(default_factory=list)
    spots_owned: list[dict[str, str]] = field(default_factory=list)


async def commit_one(
    session: AsyncSession,
    kind_key: str,
    *,
    chosen: dict[str, Any] | None,
    payload: dict[str, Any],
    today: date,
    entry_id: uuid.UUID | None = None,
) -> SingleAdd:
    """Adds one thing from the add bar through the sitting's own row
    builders and `items.commit_items`, so a single add writes the row a
    sitting would (AC 6): a chosen match, or a row kept as typed (no
    `chosen`). A comic series already on the shelf gains the typed issues
    by Got it's rule, as in a sitting (`issues_added`, and `series_grew`
    for its own report); one gaining nothing is `already_owned`. A collected
    book is a volume on its title (made when the match is not on the shelf or
    there is none), once per `entry_id`: the same id again writes no second
    volume. Does not commit; the caller rolls back on a refusal."""
    outcome = SingleAdd()
    kind = REGISTRY.get(kind_key)
    # A transient entry, never added to the session: the builders read it.
    entry = IntakeEntry(
        id=entry_id or uuid.uuid4(),
        kind=kind_key,
        state=S.READY,
        payload=payload,
        chosen=chosen,
    )
    if kind is None:
        outcome.refused.append(
            Refusal(entry.id, "kind", f"{kind_key} is not a kind intake knows")
        )
        return outcome
    if kind.area is IntakeArea.CLOSET:
        made = _typed_garment(kind, entry)
        if isinstance(made, Refusal):
            outcome.refused.append(made)
            return outcome
        session.add(made)
        await session.flush()
        outcome.garment_id = made.id
        outcome.added = 1
        return outcome
    if kind.area is IntakeArea.PLACES:
        written = await write_places(session, [entry])
        outcome.refused.extend(written.refused)
        outcome.spots_new, outcome.spots_owned = written.new, written.owned
        outcome.added = len(written.new)
        outcome.already_owned = len(written.owned)
        return outcome
    entry = _placed(kind, entry)  # an unshared book has no series match
    chosen = entry.chosen
    made = _shelf_item(kind, entry)
    if isinstance(made, Refusal):
        outcome.refused.append(made)
        return outcome
    key = _key(made.model_dump())
    book = _is_comic(kind) and is_book(payload)
    if book and entry.id in await existing_volumes(session, [entry.id]):
        outcome.already_owned = 1  # this book's volume is written already
        return outcome
    if book and key is None:
        # No series match: the book goes on the title of its name when there
        # is one (made by hand, or for an earlier book), else on a new one.
        reuse = (await find_manual_titles(session, [made.title], lock=True)).get(
            title_key(made.title)
        )
        if reuse is not None:
            plan = book_plan(payload, made.model_dump(), reuse, chosen)
            wrote = await _write_volumes(
                session,
                reuse,
                [(entry, made, plan)],
                title_created=False,
                volumes_new=outcome.volumes_new,
                titles_created=outcome.titles_created,
            )
            if wrote:
                await sync_marks(session, reuse)
            else:
                outcome.already_owned = 1
            return outcome
    if key is not None and _is_comic(kind):
        on_shelf = (await _series_on_shelf(session, {key: _Series()})).get(key)
        if on_shelf is not None:
            issues = expand(parse_ranges(made.issues_owned))
            grew = await SeriesGrew.before_write(session, on_shelf, issues)
            gained = issues - owned_set(
                on_shelf.issues_owned,
                held_ranges(await load_holds(session, on_shelf.id)),
            )
            added = _entry_editions(made)
            merged = on_shelf.editions
            if added:
                try:
                    merged = _merged_editions(on_shelf.editions, added)
                except RangeError as error:
                    outcome.refused.append(Refusal(entry.id, "editions", str(error)))
                    return outcome
            grew.editions_added = _editions_gained(on_shelf.editions, merged)
            on_shelf.editions = merged
            _clear_skips(on_shelf, grew.editions_added)
            if made.shelf_format is not None:
                on_shelf.shelf_format = made.shelf_format
            wrote = 0
            if book:
                plan = book_plan(payload, made.model_dump(), on_shelf, chosen)
                wrote = await _write_volumes(
                    session,
                    on_shelf,
                    [(entry, made, plan)],
                    title_created=False,
                    volumes_new=outcome.volumes_new,
                    titles_created=outcome.titles_created,
                )
            if gained:
                outcome.issues_added = await got_issues(
                    session, on_shelf, gained, today
                )
            elif not grew.editions_added and not wrote:
                outcome.already_owned = 1
            await sync_marks(session, on_shelf)
            await grew.after_write(session)
            outcome.series_grew.append(grew)
            return outcome
    if made.editions and not _entry_editions(made):
        made = made.model_copy(update={"editions": None})
    try:
        result = await commit_items(session, [made], today=today)
    except RowRefused as refused:
        outcome.refused.append(Refusal(entry.id, None, str(refused.error)))
        return outcome
    outcome.created = result.created
    outcome.added = len(result.created)
    outcome.already_owned = result.existing + result.duplicates
    if book:
        # The title is the row just made, or the one a second writer made
        # first (a matched series is found by its key).
        title = None
        if result.created:
            title = await session.get(Item, result.created[0])
        elif key is not None:
            title = await session.scalar(
                select(Item).where(
                    Item.external_source == key[0], Item.external_id == key[1]
                )
            )
        if title is not None:
            plan = book_plan(payload, made.model_dump(), None, chosen)
            if await _write_volumes(
                session,
                title,
                [(entry, made, plan)],
                title_created=bool(result.created),
                volumes_new=outcome.volumes_new,
                titles_created=outcome.titles_created,
            ):
                await sync_marks(session, title)
    return outcome


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
    # A comic series is settled with the sitting's other issues of it below.
    owned_keys: set[tuple[str, str]] = set()
    for entry in entries:
        if entry.state is not S.OWNED:
            continue
        kind = REGISTRY.get(entry.kind)
        key = _key(shelf_row(kind, _placed(kind, entry))) if kind else None
        if key is not None and _is_comic(kind):
            continue
        if key is None:
            outcome.already_owned += 1
        elif key not in owned_keys:
            owned_keys.add(key)
            outcome.already_owned += 1

    rows: list[ItemIn] = []
    row_entries: list[IntakeEntry] = []
    garments: list[Garment] = []
    seeds: list[SeedGarment] = []
    # Held photos of the sitting's seed entries, and the pieces already
    # imported since the file was read (another sitting committed first).
    seed_photos = {
        photo.id: photo
        for photo in (
            await session.execute(
                select(
                    IntakePhoto.id,
                    IntakePhoto.thumb_webp,
                    IntakePhoto.width,
                    IntakePhoto.height,
                ).where(
                    IntakePhoto.id.in_(
                        [
                            entry.photo_id
                            for entry in entries
                            if is_seed(entry) and entry.photo_id
                        ]
                    )
                )
            )
        ).all()
    }
    seed_sources = {
        record[1]
        for entry in entries
        if is_seed(entry)
        and entry.state in WRITTEN
        and not isinstance(record := _seed_record(entry), str)
    }
    imported = await imported_keys(session, seed_sources)
    seed_seen: set[str] = set()
    place_entries: list[IntakeEntry] = []
    now = datetime.now(UTC)
    seen: set[tuple[str, str]] = set()
    series: dict[tuple[str, str], _Series] = {}
    unmatched: dict[str, _Loose] = {}
    for entry in entries:
        kind = REGISTRY.get(entry.kind)
        owned_comic = entry.state is S.OWNED and _is_comic(kind)
        if entry.state not in WRITTEN and not owned_comic:
            continue
        if kind is None:
            outcome.refused.append(
                Refusal(entry.id, "kind", f"{entry.kind} is not a kind intake knows")
            )
            continue
        if kind.area is IntakeArea.PLACES:
            place_entries.append(entry)
            continue
        if kind.area is IntakeArea.CLOSET:
            if entry.garment_id is not None:
                outcome.added += 1  # made real on upload; nothing to flip
                continue
            if is_seed(entry):
                record = _seed_record(entry)
                seed_key = None if isinstance(record, str) else record[0].get("key")
                if is_link(entry):
                    unchosen = _unchosen_colour(entry)
                    if unchosen is not None:
                        outcome.refused.append(unchosen)
                        continue
                    # The size is part of the key, and Check may have changed it.
                    seed_key = link_key(entry.payload)
                if seed_key is not None and (
                    seed_key in imported or seed_key in seed_seen
                ):
                    outcome.already_owned += 1  # imported since it was read
                    continue
                seed_seen.add(seed_key)
                made = _seed_garment(kind, entry, seed_photos.get(entry.photo_id), now)
                if isinstance(made, Refusal):
                    outcome.refused.append(made)
                else:
                    seeds.append(made)
                    if made.image is None:
                        outcome.images_missing += 1
                continue
            made = _typed_garment(kind, entry)
            if isinstance(made, Refusal):
                outcome.refused.append(made)
            else:
                garments.append(made)
            continue
        entry = _placed(kind, entry)  # an unshared book has no series match
        made = _shelf_item(kind, entry)
        if isinstance(made, Refusal):
            outcome.refused.append(made)
            continue
        key = _key(made.model_dump())
        if key is not None and _is_comic(kind):
            # Every photo of one series is one row: its issues are joined.
            found = series.setdefault(key, _Series())
            found.issues.append(made.issues_owned)
            if found.shelf_format is None and not owned_comic:
                found.shelf_format = made.shelf_format
                found.shelf_derived = (
                    made.shelf_format is not None
                    and "shelf_format" not in (entry.payload or {})
                )
            if not owned_comic and (added := _entry_editions(made)):
                found.editions.append((entry, added))
            if is_book(entry.payload):
                found.books.append((entry, made))
            if found.row is None and not owned_comic:
                found.row, found.entry = made, entry
            continue
        if key is None and _is_comic(kind) and is_book(entry.payload):
            # A collected book with no series match is a title of its own;
            # books of one name share it (a line).
            if owned_comic:
                continue  # marked owned: counted above, nothing to write
            loose = unmatched.setdefault(title_key(made.title), _Loose(made, entry))
            loose.books.append((entry, made))
            continue
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

    on_shelf = await _series_on_shelf(session, series)
    # A collected book is a volume of its own, one per intake entry: the same
    # issues in two books are two books. An entry whose volume exists (a
    # second commit of it) writes nothing more.
    written = await existing_volumes(
        session,
        [e.id for f in series.values() for e, _ in f.books]
        + [e.id for loose in unmatched.values() for e, _ in loose.books],
    )

    def plan_books(books, item):
        return [
            (e, made, book_plan(e.payload or {}, made.model_dump(), item, e.chosen))
            for e, made in books
            if e.id not in written
        ]

    reused = await find_manual_titles(
        session, [loose.row.title for loose in unmatched.values()], lock=True
    )
    for name, loose in unmatched.items():
        loose.item = reused.get(name)
        loose.fresh = plan_books(loose.books, loose.item)
        if not loose.fresh:
            outcome.already_owned += 1
            continue
        # Every book's Details editions go on the one title.
        brought = [e for _, made, _ in loose.fresh for e in _entry_editions(made)]
        if not brought:
            continue
        try:
            merged = _merged_editions(
                loose.item.editions if loose.item is not None else None, brought
            )
        except RangeError as error:
            outcome.refused.append(
                Refusal(loose.fresh[0][0].id, "editions", str(error))
            )
            continue
        if loose.item is not None:
            _clear_skips(loose.item, _editions_gained(loose.item.editions, merged))
            loose.item.editions = merged
        else:
            loose.row = loose.row.model_copy(update={"editions": merged})
    # Settle every series' editions first: a refusal anywhere leaves every
    # item untouched, whether or not the caller rolls back.
    plans: list[tuple[_Series, Item | None, set[int], list[dict] | None]] = []
    for key, found in series.items():
        item = on_shelf.get(key)
        found.fresh = plan_books(found.books, item)
        merged = item.editions if item is not None else None
        # The editions Details set (a typed `editions` list), not a book:
        # a collected book is a volume (above), never an edition.
        brought = [e for _, eds in found.editions for e in eds]
        if brought:
            try:
                merged = _merged_editions(merged, brought)
            except RangeError as error:
                outcome.refused.append(
                    Refusal(found.editions[0][0].id, "editions", str(error))
                )
                continue
        issues = expand(parse_ranges(union(*found.issues)))
        plans.append((found, item, issues, merged))
    if outcome.refused:
        return outcome

    gains: list[tuple[Item, set[int]]] = []
    for found, item, issues, merged in plans:
        if item is None and found.row is None and found.fresh:
            # Every other entry was marked owned and the series has gone
            # since: its book makes it.
            found.entry, found.row = found.fresh[0][0], found.fresh[0][1]
        if item is not None:
            grew = await SeriesGrew.before_write(session, item, issues)
            # What the typed issues add is judged against the editions the
            # row had, so they are written loose exactly as typed (as in
            # `commit_one`).
            gained = issues - owned_set(
                item.issues_owned, held_ranges(await load_holds(session, item.id))
            )
            grew.editions_added = _editions_gained(item.editions, merged)
            item.editions = merged
            _clear_skips(item, grew.editions_added)
            outcome.series_grew.append(grew)
            # What Details set wins; what a collected book implies only
            # fills a format the series has not got.
            if found.shelf_format is not None and (
                not found.shelf_derived or item.shelf_format is None
            ):
                item.shelf_format = found.shelf_format
            if gained:
                gains.append((item, gained))
            elif not grew.editions_added and not found.fresh:
                outcome.already_owned += 1
        elif found.row is None:
            # Marked owned, but the row has gone since: written as before,
            # which is not at all.
            outcome.already_owned += 1
        else:
            new_row = _with_issues(found.row, issues)
            if found.shelf_format is not None:
                # The first entry that has one, as for an existing series.
                new_row = new_row.model_copy(
                    update={"shelf_format": found.shelf_format}
                )
            new_row = new_row.model_copy(update={"editions": merged})
            if issues or merged or found.fresh:
                outcome.series_new.append(
                    {
                        "title": new_row.title,
                        "external_source": new_row.external_source,
                        "external_id": new_row.external_id,
                        "cover_url": new_row.cover_url,
                        "issues": sorted(issues),
                        "editions": merged or [],
                        "volumes": [
                            {"label": p.label, "kind": p.kind}
                            for _, _, p in found.fresh
                        ],
                    }
                )
            rows.append(new_row)
            row_entries.append(found.entry)

    if outcome.refused:
        return outcome
    if place_entries:
        placed = await write_places(session, place_entries)
        outcome.refused.extend(placed.refused)
        if outcome.refused:
            return outcome
        outcome.spots_new, outcome.spots_owned = placed.new, placed.owned
        outcome.already_owned += len(placed.owned)
    # A title for each group of books with no title to reuse, made one by
    # one so each is known by the id it was given, never by its name.
    loose_made: list[uuid.UUID] = []
    for loose in unmatched.values():
        if loose.fresh and loose.item is None:
            try:
                one = await commit_items(session, [loose.row], today=today)
            except RowRefused as refused:
                outcome.refused.append(
                    Refusal(loose.entry.id, None, str(refused.error))
                )
                return outcome
            loose_made += one.created
            loose.item = await session.get(Item, one.created[0])
    try:
        result = await commit_items(session, rows, today=today)
    except RowRefused as refused:
        outcome.refused.append(
            Refusal(row_entries[refused.index].id, None, str(refused.error))
        )
        return outcome
    session.add_all(garments)
    if seeds:
        session.add_all([made.garment for made in seeds])
        await session.flush()  # the garments exist before their products
        session.add_all([made.product for made in seeds])
        session.add_all([made.image for made in seeds if made.image is not None])
        # The held photos have moved to the garments.
        await session.execute(
            delete(IntakePhoto).where(
                IntakePhoto.id.in_(
                    [made.photo_id for made in seeds if made.photo_id is not None]
                )
            )
        )
    outcome.file_import = await take_summary(session, sitting_id)
    for item, gained in gains:
        outcome.issues_added += await got_issues(session, item, gained, today)
    # The volumes go on titles now all exist: the shelf's own (locked above),
    # the series just made, and the titles made for books with no match.
    made_ids = set(result.created) | set(loose_made)
    synced = {item.id: item for _, item, _, _ in plans if item is not None}
    new_titles = await _made_titles(session, series, on_shelf)
    new_titles += [
        (loose.item, loose.fresh)
        for loose in unmatched.values()
        if loose.fresh and loose.item is not None
    ]
    targets: list[tuple[Item, list]] = [
        (item, found.fresh)
        for key, found in series.items()
        if found.fresh and (item := on_shelf.get(key)) is not None
    ]
    targets += new_titles
    for item, fresh in sorted(targets, key=lambda t: str(t[0].id)):
        if await _write_volumes(
            session,
            item,
            fresh,
            title_created=item.id in made_ids,
            volumes_new=outcome.volumes_new,
            titles_created=outcome.titles_created,
        ):
            synced[item.id] = item
    for item_id in sorted(synced, key=str):
        await sync_marks(session, synced[item_id])
    for grew in outcome.series_grew:
        await grew.after_write(session)
    outcome.created = [*result.created, *loose_made]
    outcome.added += (
        len(outcome.created) + len(garments) + len(seeds) + len(outcome.spots_new)
    )
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
