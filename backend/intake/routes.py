"""Intake's admin routes, under /api/intake (spec D2, D11).

A sitting is a server-side draft: every photo, entry and step lives in
Postgres, so the phone that shot the shelf and the laptop that checks it
see the same thing (AC 3). Nothing here reaches the collection; committing
does (`intake/commit.py`).
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import intake.garment_kind  # noqa: F401  (registers the closet's kind)
import intake.place_kind  # noqa: F401  (registers the places' kind)
import intake.shelf_kinds  # noqa: F401  (registers the shelf's kinds)
import spots
from closet_images import make_garment_image, make_reading_copy, make_thumbnail
from closet_routes import add_garment_photo, check_media_type, convert_upload
from config import Config
from intake.budget import budget_state
from intake.comic_books import BookEditError, edit_book, number_check
from intake.commit import (
    SITTING_GONE,
    NothingToAdd,
    SittingGone,
    comic_adds_for,
    commit_one,
    commit_sitting,
    series_on_shelf_for,
    spot_answer,
)
from intake.kinds import REGISTRY, describe
from intake.link_import import (
    MAX_LINKS,
    ChoiceRefused,
    EntryGone,
    TooManyLinks,
    choose_colour,
    import_links,
    is_link,
    merge_edit,
)
from intake.nightly import LAST_RUN_KEY, run_nightly
from intake.place_kind import (
    DEFAULT_CITY,
    clean_chosen,
    clean_fields,
    clean_name,
    edit_place,
    mark_for_count,
    not_ready_reason,
    owned_spot_id,
)
from intake.reader import read_next
from intake.schemas import (
    AddOut,
    BudgetOut,
    CommitOut,
    CommitRefusedOut,
    EntryOut,
    FileImportOut,
    KindOut,
    LinksOut,
    NightlySummaryOut,
    PhotoOut,
    ReadNextOut,
    RefusedOut,
    SearchOut,
    SeedImagesOut,
    SittingOut,
    SittingSummaryOut,
    StatusBody,
)
from intake.search import search_area
from intake.seed_file import MAX_FILE_BYTES, SeedFileError, parse_seed
from intake.seed_import import (
    add_not_owned,
    drop_summary,
    fetch_pending,
    import_rows,
    keep_server_keys,
)
from items import _enrich, require_admin
from llm import LLMError, LLMProvider
from models import (
    Garment,
    GarmentStatus,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
    IntakeSitting,
    Item,
)

PHOTO_LIMIT = 200
PHOTO_LIMIT_DETAIL = (
    f"This sitting already holds {PHOTO_LIMIT} photos; commit it or start another"
)


class SittingCreate(BaseModel):
    """A new sitting: its area, and optionally one kind for the whole shelf."""

    area: IntakeArea
    kind: str | None = Field(default=None, max_length=40)
    label: str | None = Field(default=None, max_length=120)


class SittingPatch(BaseModel):
    """The page's step and the sitting's label; last write wins."""

    step: str | None = Field(default=None, max_length=20)
    label: str | None = Field(default=None, max_length=120)


class EntryCreate(BaseModel):
    """A typed entry, or one chosen from search: `chosen` is a search
    result as `GET /search` answers it (Shoot's "Search instead")."""

    kind: str = Field(max_length=40)
    payload: dict[str, Any] = Field(default_factory=dict)
    chosen: dict[str, Any] | None = None


class PlaceEntryIn(BaseModel):
    """A place entry for a places sitting. From search: `chosen` is the
    result row and `result_count` how many results that search returned
    (one is READY, else CHECK). Typed: `name` and `coords`."""

    chosen: dict[str, Any] | None = None
    result_count: int = Field(default=0, ge=0, le=100)
    name: str | None = Field(default=None, max_length=200)
    coords: str | None = Field(default=None, max_length=500)
    city: str = Field(default=DEFAULT_CITY, max_length=40)
    neighbourhood: str | None = Field(default=None, max_length=100)
    blurb: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=len(spots.TAGS) * 2)
    is_public: bool = False


PLACE_OWNED = "That place is already on your list"
PLACE_IN_SITTING = "That place is already in this visit"
PLACE_KIND_REQUIRED = "A places sitting needs a kind"


class CommitIn(BaseModel):
    """The owner's local day, for the playthroughs a commit seeds (as the
    status route takes it); the server's day when left out."""

    today: date | None = None


class AddIn(BaseModel):
    """One thing from the add bar: a kind, the chosen search result (none
    when kept as typed) and the kind's fields."""

    kind: str = Field(max_length=40)
    chosen: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    today: date | None = None


CHOSEN_REFUSED = "A chosen result needs its external_source and external_id"

NOT_FROM_A_FILE = "Only a piece from a seed file can be marked not owned"
TOO_MANY_LINKS = f"Paste at most {MAX_LINKS} links at a time"

TAG_AGAIN_REFUSED = "Only a piece the tagger gave up on can be tagged again"


class LinksIn(BaseModel):
    """Pasted product addresses, one per item (the page splits lines)."""

    urls: list[str] = Field(min_length=1, max_length=MAX_LINKS)


class ChooseIn(BaseModel):
    """A colour among the entry's own candidates, by `external_id`."""

    external_id: str = Field(min_length=1, max_length=200)


class EntryPatch(BaseModel):
    """A partial edit of an entry; fields left out are kept."""

    payload: dict[str, Any] | None = None
    state: IntakeEntryState | None = None
    chosen: dict[str, Any] | None = None


def photo_json(photo: IntakePhoto) -> dict[str, Any]:
    """The page's view of a photo. The image is its own route."""
    return {
        "id": str(photo.id),
        "state": photo.state.value,
        "filename": photo.filename,
        "error": photo.error,
    }


def entry_json(
    entry: IntakeEntry,
    on_shelf: dict[str, Any] | None = None,
    adds: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The page's view of an entry. `on_shelf` is the comic series the
    entry would add issues to, as it stands now (`series_on_shelf_for`),
    else null. A comic also carries `number_check`, the mark under its
    issue number, decided from the payload and the match
    (`intake.comic_books.number_check`), never stored. `adds` is the comic's
    preview (`comic_adds_for`: `adds`, `title_will_be_created` and, for a
    collected book, `contents_preview`), merged in as it is."""
    shown = {
        "id": str(entry.id),
        "photo_id": str(entry.photo_id) if entry.photo_id else None,
        "kind": entry.kind,
        "state": entry.state.value,
        "payload": entry.payload,
        "candidates": entry.candidates,
        "chosen": entry.chosen,
        "garment_id": str(entry.garment_id) if entry.garment_id else None,
        "on_shelf": on_shelf,
    }
    if entry.kind == "comic":
        shown["number_check"] = number_check(entry.payload, entry.chosen, on_shelf)
        shown.update(adds or {})
    return shown


async def entries_json(
    session: AsyncSession, entries: list[IntakeEntry]
) -> list[dict[str, Any]]:
    """Entries as the page sees them, each comic marked with the series
    already on the shelf it matches."""
    shelf = await series_on_shelf_for(session, entries)
    adds = await comic_adds_for(session, entries)
    return [
        entry_json(entry, shelf.get(entry.id), adds.get(entry.id)) for entry in entries
    ]


def _check_kind(area: IntakeArea, kind: str | None) -> None:
    if kind is None:
        return
    registered = REGISTRY.get(kind)
    if registered is None or registered.area is not area:
        raise HTTPException(422, f"{kind} is not a {area.value} kind")


PHOTO_BEING_READ = "This photo is being read; try again in a moment."


def create_intake_router(
    session_factory: async_sessionmaker[AsyncSession],
    registry: dict,
    *,
    config: Config,
    provider_factory: Callable[[], LLMProvider] | None = None,
) -> APIRouter:
    """The intake router. Every route is admin only. `provider_factory`
    builds the model per read, so a missing key fails the read, never the
    boot."""
    router = APIRouter(
        prefix="/api/intake",
        tags=["intake"],
        dependencies=[Depends(require_admin)],
    )
    # One nightly run at a time; a second is a 409, as the closet's jobs are.
    nightly_lock = asyncio.Lock()

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def _sitting_or_404(session: AsyncSession, sitting_id: uuid.UUID):
        sitting = await session.get(IntakeSitting, sitting_id)
        if sitting is None:
            raise HTTPException(404, "No such sitting")
        return sitting

    async def _sitting_json(session: AsyncSession, sitting: IntakeSitting) -> dict:
        photos = (
            await session.scalars(
                select(IntakePhoto)
                .where(IntakePhoto.sitting_id == sitting.id)
                .order_by(IntakePhoto.created_at, IntakePhoto.id)
            )
        ).all()
        entries = (
            await session.scalars(
                select(IntakeEntry)
                .where(IntakeEntry.sitting_id == sitting.id)
                .order_by(IntakeEntry.created_at, IntakeEntry.id)
            )
        ).all()
        return {
            "id": str(sitting.id),
            "area": sitting.area.value,
            "kind": sitting.kind,
            "label": sitting.label,
            "step": sitting.step,
            "photos": [photo_json(photo) for photo in photos],
            "entries": await entries_json(session, list(entries)),
        }

    @router.get("/kinds", response_model=list[KindOut])
    async def list_kinds() -> list[dict[str, Any]]:
        """Every registered kind, with its fields and source state."""
        return [describe(kind, registry) for kind in REGISTRY.values()]

    @router.get("/search", response_model=SearchOut)
    async def search(
        area: IntakeArea,
        query: str = Query(min_length=1, max_length=200),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The add bar's search: every source of the area's kinds at once,
        each with its state, owned results marked (`intake/search.py`)."""
        return await search_area(session, registry, area, query.strip() or query)

    @router.post(
        "/add",
        response_model=AddOut,
        responses={422: {"model": RefusedOut}},
    )
    async def add_one(body: AddIn, session: AsyncSession = Depends(get_session)) -> Any:
        """Add one thing from the add bar through the commit service. 201
        with the new id; 200 when it was already on the shelf, with
        `issues_added` counting the issues an owned comic series gained and
        `series_grew` reporting that series on its own; 422 with
        `refused` (and the first message as `detail`) when the write rules
        refuse it, writing nothing."""
        today = body.today or date.today()
        outcome = await commit_one(
            session, body.kind, chosen=body.chosen, payload=body.payload, today=today
        )
        if outcome.refused:
            await session.rollback()
            refused = [refusal.as_json() for refusal in outcome.refused]
            return JSONResponse(
                status_code=422,
                content={"detail": refused[0]["message"], "refused": refused},
            )
        await session.commit()
        await _enrich(session, registry, outcome.created)
        return JSONResponse(
            status_code=201 if outcome.added else 200,
            content={
                "added": outcome.added,
                "already_owned": outcome.already_owned,
                "issues_added": outcome.issues_added,
                "series_grew": [grew.as_json() for grew in outcome.series_grew],
                "volumes_new": outcome.volumes_new,
                "titles_created": outcome.titles_created,
                **spot_answer(outcome.spots_new, outcome.spots_owned),
                "created": [str(i) for i in outcome.created],
                "garment_id": str(outcome.garment_id) if outcome.garment_id else None,
            },
        )

    @router.post("/sittings", status_code=201, response_model=SittingOut)
    async def create_sitting(
        body: SittingCreate, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Start a sitting. A kind must belong to the area; none is a mixed shelf."""
        _check_kind(body.area, body.kind)
        if body.area is IntakeArea.PLACES and body.kind is None:
            raise HTTPException(422, PLACE_KIND_REQUIRED)
        sitting = IntakeSitting(area=body.area, kind=body.kind, label=body.label)
        session.add(sitting)
        await session.commit()
        return await _sitting_json(session, sitting)

    @router.get("/sittings", response_model=list[SittingSummaryOut])
    async def list_sittings(
        area: IntakeArea, session: AsyncSession = Depends(get_session)
    ) -> list[dict[str, Any]]:
        """The area's open sittings, newest first: photo count, photos still
        waiting to be read, and entries per state."""
        photo_count = (
            select(func.count())
            .where(IntakePhoto.sitting_id == IntakeSitting.id)
            .scalar_subquery()
        )
        rows = (
            await session.execute(
                select(IntakeSitting, photo_count)
                .where(IntakeSitting.area == area)
                .order_by(IntakeSitting.updated_at.desc(), IntakeSitting.id)
            )
        ).all()
        ids = [sitting.id for sitting, _ in rows]
        # Two grouped counts for the whole list: the Add page's meter
        # (ready, to check, still reading) without opening each sitting.
        entry_counts: dict[uuid.UUID, dict[str, int]] = {
            sitting_id: {state.value: 0 for state in IntakeEntryState}
            for sitting_id in ids
        }
        waiting: dict[uuid.UUID, int] = dict.fromkeys(ids, 0)
        if ids:
            for sitting_id, state, count in (
                await session.execute(
                    select(IntakeEntry.sitting_id, IntakeEntry.state, func.count())
                    .where(IntakeEntry.sitting_id.in_(ids))
                    .group_by(IntakeEntry.sitting_id, IntakeEntry.state)
                )
            ).all():
                entry_counts[sitting_id][state.value] = count
            for sitting_id, count in (
                await session.execute(
                    select(IntakePhoto.sitting_id, func.count())
                    .where(
                        IntakePhoto.sitting_id.in_(ids),
                        IntakePhoto.state.in_(
                            [IntakePhotoState.UPLOADED, IntakePhotoState.READING]
                        ),
                    )
                    .group_by(IntakePhoto.sitting_id)
                )
            ).all():
                waiting[sitting_id] = count
        return [
            {
                "id": str(sitting.id),
                "area": sitting.area.value,
                "kind": sitting.kind,
                "label": sitting.label,
                "step": sitting.step,
                "photos": count,
                "photos_waiting": waiting[sitting.id],
                "entries": entry_counts[sitting.id],
                "created_at": sitting.created_at,
                "updated_at": sitting.updated_at,
            }
            for sitting, count in rows
        ]

    @router.get("/sittings/{sitting_id}", response_model=SittingOut)
    async def get_sitting(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """One sitting with its photos and entries."""
        return await _sitting_json(session, await _sitting_or_404(session, sitting_id))

    @router.patch("/sittings/{sitting_id}", response_model=SittingOut)
    async def patch_sitting(
        sitting_id: uuid.UUID,
        body: SittingPatch,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Move the sitting's step or rename it."""
        sitting = await _sitting_or_404(session, sitting_id)
        for field in body.model_fields_set:
            setattr(sitting, field, getattr(body, field))
        await session.commit()
        return await _sitting_json(session, sitting)

    # A 204 has no body, so there is nothing to model.
    @router.delete("/sittings/{sitting_id}", status_code=204, response_model=None)
    async def delete_sitting(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """Discard a sitting. Garments its photos made stay in the tag queue."""
        sitting = await _sitting_or_404(session, sitting_id)
        await drop_summary(session, sitting.id)
        await session.delete(sitting)
        await session.commit()
        return Response(status_code=204)

    @router.post(
        "/sittings/{sitting_id}/photos", status_code=201, response_model=PhotoOut
    )
    async def upload_photo(
        sitting_id: uuid.UUID,
        photo: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Add one photo. A shelf photo waits to be read; a closet photo
        becomes an untagged garment at once, as the closet's own intake does."""
        sitting = await _sitting_or_404(session, sitting_id)
        held = await session.scalar(
            select(func.count()).where(IntakePhoto.sitting_id == sitting.id)
        )
        if held >= PHOTO_LIMIT:
            await photo.close()
            raise HTTPException(409, PHOTO_LIMIT_DETAIL)
        check_media_type(photo)
        filename = (photo.filename or "")[:255] or None
        if sitting.area is IntakeArea.SHELF:
            reading, thumb = await convert_upload(
                photo, make_reading_copy, make_thumbnail
            )
            row = IntakePhoto(
                sitting_id=sitting.id,
                filename=filename,
                reading_jpeg=reading,
                thumb_webp=thumb.webp,
                width=thumb.width,
                height=thumb.height,
            )
            session.add(row)
        elif sitting.area is IntakeArea.CLOSET:
            (thumb,) = await convert_upload(photo, make_garment_image)
            garment = await add_garment_photo(session, thumb, datetime.now(UTC))
            row = IntakePhoto(
                sitting_id=sitting.id,
                state=IntakePhotoState.READ,
                filename=filename,
                thumb_webp=thumb.webp,
                width=thumb.width,
                height=thumb.height,
            )
            session.add(row)
            await session.flush()
            session.add(
                IntakeEntry(
                    sitting_id=sitting.id,
                    photo_id=row.id,
                    kind="garment",
                    state=IntakeEntryState.READY,
                    garment_id=garment.id,
                )
            )
        else:
            await photo.close()
            raise HTTPException(409, f"A {sitting.area.value} sitting takes no photos.")
        await session.commit()
        return photo_json(row)

    # A 204 has no body, so there is nothing to model.
    @router.delete(
        "/sittings/{sitting_id}/photos/{photo_id}", status_code=204, response_model=None
    )
    async def delete_photo(
        sitting_id: uuid.UUID,
        photo_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Remove one photo from an unfinished sitting, with every entry read
        from it. A closet photo takes its piece along, tagged or not, as
        Check's Remove this photo does. A sitting already added or discarded,
        as from a second device, is a 409, and so is a photo being read right
        now (`reading` in the database); a photo of another sitting is a 404."""
        sitting = await session.get(IntakeSitting, sitting_id)
        if sitting is None:
            raise HTTPException(409, SITTING_GONE)
        # Locked, so a reader finishing at this moment waits for the delete
        # (or the delete sees the state it left).
        photo = await session.scalar(
            select(IntakePhoto).where(IntakePhoto.id == photo_id).with_for_update()
        )
        if photo is None or photo.sitting_id != sitting.id:
            raise HTTPException(404, "No such photo")
        if photo.state is IntakePhotoState.READING:
            raise HTTPException(409, PHOTO_BEING_READ)
        entries = (
            await session.scalars(
                select(IntakeEntry).where(IntakeEntry.photo_id == photo.id)
            )
        ).all()
        garment_ids = [e.garment_id for e in entries if e.garment_id is not None]
        garments = (
            {
                g.id: g
                for g in await session.scalars(
                    select(Garment).where(Garment.id.in_(garment_ids))
                )
            }
            if garment_ids
            else {}
        )
        for entry in entries:
            garment = garments.get(entry.garment_id)
            # A piece's entry goes with it, by cascade.
            await session.delete(garment if garment is not None else entry)
        sitting.updated_at = func.now()
        await session.delete(photo)
        await session.commit()
        return Response(status_code=204)

    @router.post("/sittings/{sitting_id}/read-next", response_model=ReadNextOut)
    async def read_next_photo(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Read the sitting's oldest waiting photo. `status` is `read`,
        `empty`, `failed`, `waiting` (today's budget is spent) or `idle`
        (nothing waiting)."""
        await _sitting_or_404(session, sitting_id)
        state = await budget_state(session, config)
        budget = state["remaining"] if state["enforced"] else 1
        if provider_factory is None:
            raise HTTPException(502, "No model is configured")
        try:
            provider = provider_factory()
        except LLMError as error:
            raise HTTPException(502, f"No model is configured: {error}") from error
        outcome = await read_next(
            session, sitting_id, provider, budget, registry=registry
        )
        return {
            "status": outcome.status,
            "photo": photo_json(outcome.photo) if outcome.photo else None,
            "entries": await entries_json(session, list(outcome.entries)),
        }

    @router.post(
        "/sittings/{sitting_id}/file", status_code=201, response_model=FileImportOut
    )
    async def upload_file(
        sitting_id: uuid.UUID,
        file: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The closet's "From a file": a seed CSV (`intake/seed_file.py`)
        becomes one draft garment entry per piece still owned and not
        already known, and the sitting moves to Check. Nothing reaches the
        closet until the sitting is committed. The skipped rows are counted,
        not listed (Done shows the counts). 413 over the size limit, 422 for
        a file that cannot be read as a seed file, 409 for a shelf sitting."""
        sitting = await _sitting_or_404(session, sitting_id)
        if sitting.area is not IntakeArea.CLOSET or sitting.kind not in (
            None,
            "garment",
        ):
            await file.close()
            raise HTTPException(409, "A file can only be added to a closet sitting")
        try:
            data = await file.read(MAX_FILE_BYTES + 1)
        finally:
            await file.close()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                413, f"That file is too large: at most {MAX_FILE_BYTES // 1024} KB"
            )
        try:
            parsed = parse_seed(data)
        except SeedFileError as error:
            raise HTTPException(422, str(error)) from error
        result = await import_rows(session, sitting.id, parsed)
        sitting.step = "check"
        sitting.updated_at = func.now()
        await session.commit()
        return {**result.counts(), "problems": result.problems or []}

    @router.post(
        "/sittings/{sitting_id}/links", status_code=201, response_model=LinksOut
    )
    async def add_links(
        sitting_id: uuid.UUID,
        body: LinksIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The closet's "From links": each product address becomes one draft
        garment entry (`intake/link_import.py`), read from the store's own
        product JSON or page, with no model call. A store that refuses, or a
        page with no product, leaves the entry kept as typed with the reason
        in `payload.link.message`; the sitting never fails for it. Nothing
        reaches the closet until the sitting is committed. 409 for a shelf
        sitting, 422 when nothing pasted was an address."""
        sitting = await _sitting_or_404(session, sitting_id)
        if sitting.area is not IntakeArea.CLOSET or sitting.kind not in (
            None,
            "garment",
        ):
            raise HTTPException(409, "Links can only be added to a closet sitting")
        try:
            result = await import_links(session, sitting.id, body.urls)
        except TooManyLinks as refused:
            raise HTTPException(422, str(refused)) from None
        if not result.entries and result.duplicates == 0:
            raise HTTPException(422, "Paste product addresses that start with https://")
        sitting.step = "check"
        sitting.updated_at = func.now()
        await session.commit()
        return {
            "entries": await entries_json(session, result.entries),
            **result.counts(),
        }

    @router.post("/entries/{entry_id}/choose", response_model=EntryOut)
    async def choose(
        entry_id: uuid.UUID,
        body: ChooseIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Check's colour radio for a pasted link: the entry takes the chosen
        colour's name, family, price and photo (the photo is fetched again).
        Only a colour the link itself offered can be chosen (422)."""
        entry = await session.scalar(
            select(IntakeEntry).where(IntakeEntry.id == entry_id).with_for_update()
        )
        if entry is None:
            raise HTTPException(404, "No such entry")
        try:
            await choose_colour(session, entry, body.external_id)
        except EntryGone as gone:
            raise HTTPException(409, str(gone)) from None
        except ChoiceRefused as refused:
            raise HTTPException(422, str(refused)) from None
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown

    @router.post("/sittings/{sitting_id}/seed-images", response_model=SeedImagesOut)
    async def fetch_seed_images(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Fetch the photos of the next few file pieces (once each; the page
        asks again until `pending` is 0). A photo that cannot be fetched is
        recorded on its entry (`image` failed, with `image_error`) and the
        piece goes on without one."""
        await _sitting_or_404(session, sitting_id)
        changed, pending = await fetch_pending(session, sitting_id)
        await session.commit()
        return {"entries": await entries_json(session, changed), "pending": pending}

    @router.post(
        "/sittings/{sitting_id}/entries", status_code=201, response_model=EntryOut
    )
    async def add_entry(
        sitting_id: uuid.UUID,
        body: EntryCreate,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Add a typed entry, or one chosen from search. A chosen result is
        `ready` (a person picked it), or `owned` when its
        `(external_source, external_id)` is already an item, the commit's
        duplicate rule, as the reader marks a trusted match."""
        sitting = await _sitting_or_404(session, sitting_id)
        _check_kind(sitting.area, body.kind)
        if sitting.area is IntakeArea.PLACES:
            raise HTTPException(
                422, "Add a place with POST /sittings/{id}/places, not here"
            )
        state = IntakeEntryState.TYPED
        if body.chosen is not None:
            source = body.chosen.get("external_source")
            external_id = body.chosen.get("external_id")
            if not isinstance(source, str) or not isinstance(external_id, str):
                raise HTTPException(422, CHOSEN_REFUSED)
            owned = await session.scalar(
                select(Item.id)
                .where(Item.external_source == source, Item.external_id == external_id)
                .limit(1)
            )
            state = IntakeEntryState.OWNED if owned else IntakeEntryState.READY
        entry = IntakeEntry(
            sitting_id=sitting.id,
            kind=body.kind,
            state=state,
            # The server's own keys are never a client's to set.
            payload=keep_server_keys({}, body.payload)
            if body.kind == "garment"
            else body.payload,
            chosen=body.chosen,
        )
        session.add(entry)
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown

    @router.post(
        "/sittings/{sitting_id}/places", status_code=201, response_model=EntryOut
    )
    async def add_place(
        sitting_id: uuid.UUID,
        body: PlaceEntryIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Add a place to a places sitting: a chosen search result (its mark
        from the count of results, `mark_for_count`) or one typed by hand
        (READY; coordinates that do not parse are a 422). 409 when the place is
        already a spot or already in this sitting, 422 for a bad tag or a
        result that fails the checks of `clean_chosen`.

        `result_count` is the client's and the mark is a hint for the page,
        not a trust boundary: the route is admin-only and the commit
        validates the entry again. Position, `map_url`, attribution and
        owned-ness are the server's: whatever the client sent for them is
        ignored. The sitting row is locked first, so two presses of Add
        queue and the second sees the first's entry."""
        locked = await session.scalar(
            select(IntakeSitting)
            .where(IntakeSitting.id == sitting_id)
            .with_for_update()
        )
        if locked is None:
            raise HTTPException(404, "No such sitting")
        sitting = locked
        if sitting.area is not IntakeArea.PLACES:
            raise HTTPException(409, "A place can only be added to a places sitting")
        chosen: dict[str, Any] | None = None
        source_id: str | None = None
        try:
            payload: dict[str, Any] = clean_fields(
                {
                    "city": body.city,
                    "tags": body.tags,
                    "blurb": body.blurb,
                    "neighbourhood": body.neighbourhood,
                    "is_public": body.is_public,
                }
            )
            if body.chosen is not None:
                part, chosen = clean_chosen(body.chosen)
                payload.update(part)
                source_id = chosen["source_id"]
                state = mark_for_count(body.result_count)
            else:
                payload["name"] = clean_name(body.name)
                lat, lng = spots.parse_coords(body.coords or "")
                payload.update(lat=lat, lng=lng)
                state = IntakeEntryState.READY
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        if "lat" in payload and await owned_spot_id(
            session,
            source_id=source_id,
            name=payload["name"],
            lat=payload["lat"],
            lng=payload["lng"],
        ):
            raise HTTPException(409, PLACE_OWNED)
        held = (
            await session.scalars(
                select(IntakeEntry).where(IntakeEntry.sitting_id == sitting.id)
            )
        ).all()
        if source_id and any(
            (entry.chosen or {}).get("source_id") == source_id for entry in held
        ):
            raise HTTPException(409, PLACE_IN_SITTING)
        entry = IntakeEntry(
            sitting_id=sitting.id,
            kind="place",
            state=state,
            payload=payload,
            chosen=chosen,
        )
        session.add(entry)
        sitting.updated_at = func.now()
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown

    @router.post(
        "/sittings/{sitting_id}/commit",
        response_model=CommitOut,
        response_model_exclude_unset=True,
        responses={422: {"model": CommitRefusedOut}},
    )
    async def commit(
        sitting_id: uuid.UUID,
        body: CommitIn | None = None,
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        """Add the sitting's entries to the collection, all or nothing
        (`intake/commit.py`). A refused row answers 422 with the same shape,
        `refused` naming each entry, and writes nothing. A sitting already
        committed or discarded, as from a second device, is a 409."""
        today = body.today if body and body.today else date.today()
        try:
            outcome = await commit_sitting(session, sitting_id, today=today)
        except SittingGone:
            raise HTTPException(409, SITTING_GONE) from None
        except NothingToAdd as refused:
            raise HTTPException(409, refused.detail) from None
        if outcome.refused:
            await session.rollback()
            outcome.spots_new, outcome.spots_owned = [], []  # nothing was written
            count = len(outcome.refused)
            return JSONResponse(
                status_code=422,
                content={
                    **outcome.as_json(),
                    "added": 0,
                    "already_owned": 0,
                    "series_grew": [],
                    "series_new": [],
                    "skipped_kept": 0,
                    "photos_empty": 0,
                    "photos_waiting": 0,
                    "detail": f"{count} to fix before anything is added",
                },
            )
        await session.commit()
        # As /bulk does: covers, creators and snapshots after the commit,
        # best effort, so a slow or failing source never undoes the add.
        await _enrich(session, registry, outcome.created)
        # The new items' ids, for Done's "Publish these N".
        return {**outcome.as_json(), "created": [str(i) for i in outcome.created]}

    @router.patch("/entries/{entry_id}", response_model=EntryOut)
    async def patch_entry(
        entry_id: uuid.UUID,
        body: EntryPatch,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Edit an entry in place. Fields left out are kept; last write wins."""
        entry = await session.get(IntakeEntry, entry_id)
        if entry is None:
            raise HTTPException(404, "No such entry")
        want_state: IntakeEntryState | None = None
        for field in body.model_fields_set:
            value = getattr(body, field)
            if field == "state" and value is None:
                continue
            if entry.kind == "place":
                # The server's: only the owner's fields of the payload edit.
                if field == "payload" and value is not None:
                    try:
                        value = edit_place(entry.payload or {}, value)
                    except ValueError as error:
                        raise HTTPException(422, str(error)) from error
                elif field == "state":
                    # Checked after the loop, against the payload as edited.
                    if value not in (IntakeEntryState.READY, IntakeEntryState.CHECK):
                        raise HTTPException(
                            422, "A place can only be marked ready or to check"
                        )
                    want_state = value
                    continue
                elif field == "chosen":
                    continue
            if field == "payload" and value is not None and entry.kind == "garment":
                value = (
                    merge_edit(entry.payload or {}, value)
                    if is_link(entry)
                    else keep_server_keys(entry.payload or {}, value)
                )
            if field == "payload" and entry.kind == "comic" and value is not None:
                try:
                    value = edit_book(entry.payload, value)
                except BookEditError as error:
                    raise HTTPException(
                        422, {"message": str(error), "field": error.field}
                    ) from error
            setattr(entry, field, value)
        if want_state is not None:
            # The owner pressing Save is the confirmation; READY still needs
            # a name and a position, read from the stored payload.
            reason = not_ready_reason(entry.payload or {})
            if want_state is IntakeEntryState.READY and reason:
                raise HTTPException(422, reason)
            entry.state = want_state
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown

    @router.post("/entries/{entry_id}/not-owned", response_model=EntryOut)
    async def not_owned(
        entry_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Check's "Don't own this": the file piece leaves the sitting, and
        its key joins `closet_settings["import.not_owned"]`, so no later file
        asks about it again (design D7). 409 for an entry no file made."""
        entry = await session.get(IntakeEntry, entry_id)
        if entry is None:
            raise HTTPException(404, "No such entry")
        seed = (entry.payload or {}).get("seed")
        if not seed or not seed.get("not_owned_key"):
            raise HTTPException(409, NOT_FROM_A_FILE)
        await add_not_owned(session, [seed["not_owned_key"]])
        payload = {
            k: v for k, v in entry.payload.items() if k not in ("unticked", "was")
        }
        entry.state = IntakeEntryState.IGNORED
        entry.payload = payload
        if entry.photo_id is not None:
            photo = await session.get(IntakePhoto, entry.photo_id)
            entry.photo_id = None
            if photo is not None:
                await session.delete(photo)
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown

    @router.post("/entries/{entry_id}/tag-again", response_model=EntryOut)
    async def tag_again(
        entry_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Clothes Check's Tag again: a piece the tag queue gave up on goes
        back in it with its attempts reset; Tag now or the nightly takes it."""
        entry = await session.get(IntakeEntry, entry_id)
        if entry is None or entry.garment_id is None:
            raise HTTPException(404, "No such piece")
        garment = await session.get(Garment, entry.garment_id)
        if (
            garment is None
            or garment.status is not GarmentStatus.UNTAGGED
            or garment.tag_source is not None
        ):
            raise HTTPException(409, TAG_AGAIN_REFUSED)
        garment.tag_attempts = 0
        await session.commit()
        return entry_json(entry)

    @router.post("/photos/{photo_id}/retry", response_model=PhotoOut)
    async def retry_photo(
        photo_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Put a failed photo back in the reading queue."""
        photo = await session.get(IntakePhoto, photo_id)
        if photo is None:
            raise HTTPException(404, "No such photo")
        if photo.state is not IntakePhotoState.FAILED:
            raise HTTPException(409, "Only a photo that failed to read can be retried")
        photo.state = IntakePhotoState.UPLOADED
        photo.error = None
        await session.commit()
        return photo_json(photo)

    # Image bytes, not JSON.
    @router.get("/photos/{photo_id}/image", response_model=None)
    async def photo_image(
        photo_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """The photo's thumbnail."""
        photo = await session.get(IntakePhoto, photo_id)
        if photo is None:
            raise HTTPException(404, "No such photo")
        return Response(
            photo.thumb_webp,
            media_type="image/webp",
            headers={"Cache-Control": "private, max-age=86400"},
        )

    @router.get("/counts", response_model=dict[str, int])
    async def counts(session: AsyncSession = Depends(get_session)) -> dict[str, int]:
        """Entries left to check or confirm (`check` and `probable`), per area
        (the rail's badges)."""
        rows = (
            await session.execute(
                select(IntakeSitting.area, func.count())
                .join(IntakeEntry, IntakeEntry.sitting_id == IntakeSitting.id)
                .where(
                    IntakeEntry.state.in_(
                        (IntakeEntryState.CHECK, IntakeEntryState.PROBABLE)
                    )
                )
                .group_by(IntakeSitting.area)
            )
        ).all()
        found = {area.value: count for area, count in rows}
        return {area.value: found.get(area.value, 0) for area in IntakeArea}

    @router.get("/budget", response_model=BudgetOut)
    async def budget(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """What is left of today's free reads, and when it resets."""
        return await budget_state(session, config)

    @router.post("/jobs/nightly", response_model=NightlySummaryOut)
    async def nightly(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly step (job token): expire sittings untouched for 30
        days, then read waiting shelf photos while the budget lasts. Its
        summary is stored as `nightly.last_run` whatever happened."""
        if nightly_lock.locked():
            raise HTTPException(409, "The intake nightly is already running")
        async with nightly_lock:
            return await run_nightly(session, config, provider_factory, registry)

    @router.get("/status", response_model=StatusBody)
    async def status(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly's last run summary, null before its first run."""
        row = await session.get(IntakeSetting, LAST_RUN_KEY)
        return {LAST_RUN_KEY: row.value if row is not None else None}

    return router
