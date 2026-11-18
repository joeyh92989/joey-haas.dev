"""The paste way for places (story #342): three admin routes.

`POST /sittings/{id}/paste` turns a pasted list into one entry per line with
no network call at all. `POST /entries/{id}/resolve` makes the one Nominatim
search for one entry. `POST /entries/{id}/pick` chooses one of the candidates
the server stored for a CHECK entry. Nothing here calls a model or touches
`intake/budget`, and a short link is only ever reported, never fetched.

Entry states (the line kind or outcome decides; the client never does):

| line / outcome                         | state   |
|----------------------------------------|---------|
| coordinates and a name                 | READY   |
| coordinates only (bare pair, no name)  | CHECK   |
| coordinates of a place already saved   | OWNED   |
| name, or a link with a name only       | READING |
| short link                             | CHECK   |
| line over 300 characters               | CHECK   |
| resolve: one hit                       | READY   |
| resolve: one hit, already saved        | OWNED   |
| resolve: hit already another line's    | IGNORED |
| resolve: several hits / none           | CHECK   |
| resolve: search failed (attempts < 2)  | READING |
| resolve: search failed twice           | CHECK   |
| pick                                   | READY / OWNED / IGNORED, as one hit |
"""

from __future__ import annotations

import asyncio
import logging
import uuid
import weakref
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from intake import place_kind
from intake.place_kind import (
    DEFAULT_CITY,
    clean_chosen,
    clean_fields,
    clean_position,
    flag_owned,
    owned_spot_id,
    row_for,
)
from intake.schemas import EntryOut, PasteOut, ResolveOut
from models import IntakeArea, IntakeEntry, IntakeEntryState, IntakeSitting
from spot_sources import nominatim
from spot_sources.map_links import (
    LineRead,
    clean_line,
    clean_name,
    read_line,
    split_lines,
)
from spot_sources.nominatim import SearchFailure

logger = logging.getLogger(__name__)

MAX_PASTE_CHARS = 80_000
MAX_ENTRIES = 300  # a sitting holds at most this many entries
MAX_SOURCE_LINE = 300
MAX_SEARCH_TEXT = 200
MAX_CANDIDATES = 5
MAX_ATTEMPTS = 2  # a search that fails this often is left to the owner

NAME_NEEDED_NOTE = "This place needs a name. Type one, then mark it ready."
SHORT_LINK_NOTE = (
    "This short link could not be read, and the server never follows short links. "
    "Type the place's name, then look it up."
)
OWNED_NOTE = "Already on your list"
SAME_PLACE_NOTE = "same place as another line"
NO_PLACE_NOTE = "No place found. Change the words and look again."
NO_ANSWER_NOTE = "The search did not answer."
BEING_LOOKED_UP = "This place is being looked up"
BUSY = "This place is busy. Try again in a moment."
BEING_SAVED = "The list is being saved. Try again in a moment."
NOT_A_PLACES_SITTING = "Paste works on a places sitting"
NOT_RESOLVABLE = "Only a place that is waiting or to check can be looked up"
NOT_PICKABLE = "Only a place to check with candidates can be picked"
NO_NAME = "This place has no name to look up yet"


# Lookups run at most this many at a time. The search shares one 1 s throttle
# and a 7 s deadline, so more waiting in it would make the later ones time out
# and burn their attempts; the rest queue here, before any row is locked.
MAX_LOOKUPS = 2
_slots: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _lookup_slots() -> asyncio.Semaphore:
    """The lookup semaphore of the running loop (one per loop, so tests that
    each run their own loop never share one)."""
    loop = asyncio.get_running_loop()
    if loop not in _slots:
        _slots[loop] = asyncio.Semaphore(MAX_LOOKUPS)
    return _slots[loop]


class PasteIn(BaseModel):
    """The pasted blob; one entry per line."""

    text: str = Field(max_length=MAX_PASTE_CHARS)


class PickIn(BaseModel):
    """The index of a stored candidate. Nothing else is read from the client."""

    index: int


def _key(text: str) -> str:
    """The comparison form of a line: inner whitespace and case ignored."""
    return " ".join(text.split()).casefold()


def _base_payload(line: str) -> dict[str, Any]:
    """The owner's fields of a typed place (empty tags and blurb, private)."""
    return {
        **clean_fields(
            {"city": DEFAULT_CITY, "tags": [], "blurb": None, "is_public": False}
        ),
        "source_line": line[:MAX_SOURCE_LINE],
    }


def entry_for_line(
    line: str, read: LineRead
) -> tuple[IntakeEntryState, dict[str, Any]]:
    """The state and payload of the entry one pasted line makes. Pure."""
    line = clean_line(line)
    payload = _base_payload(line)
    if read.kind == "coords" and read.lat is not None and read.lng is not None:
        payload.update(lat=read.lat, lng=read.lng)
        if read.name:
            payload["name"] = read.name
            return IntakeEntryState.READY, payload
        payload["name"] = f"Place at {read.lat:.5f}, {read.lng:.5f}"
        payload["note"] = NAME_NEEDED_NOTE
        return IntakeEntryState.CHECK, payload
    if read.kind == "short_link":
        payload["name"] = f"Short link from {read.host}"
        payload["note"] = SHORT_LINK_NOTE
        return IntakeEntryState.CHECK, payload
    if read.kind == "too_long":
        payload["name"] = line[:MAX_SEARCH_TEXT].strip()
        payload["note"] = read.note or "This line is too long"
        return IntakeEntryState.CHECK, payload
    text = (read.name or line)[:MAX_SEARCH_TEXT].strip()
    payload.update(name=text, attempts=0)
    return IntakeEntryState.READING, payload


def _held_keys(held: list[IntakeEntry]) -> set[str]:
    keys: set[str] = set()
    for entry in held:
        payload = entry.payload or {}
        for field in ("source_line", "name"):
            value = payload.get(field)
            if isinstance(value, str) and value.strip():
                keys.add(_key(value))
    return keys


def _is_lock_failure(error: DBAPIError) -> bool:
    """A NOWAIT lock that could not be taken (Postgres 55P03)."""
    orig = error.orig
    state = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    text = f"{type(orig).__name__} {orig}"
    return (
        state == "55P03"
        or "LockNotAvailable" in text
        or "could not obtain lock" in text
    )


async def claim_entry(
    session: AsyncSession, entry_id: uuid.UUID, busy: str = BEING_LOOKED_UP
) -> IntakeEntry:
    """The entry, its row locked so no second call works on it at once: a
    second concurrent call is a 409 (`busy`), not a second search. The lock is
    the claim, so a request that dies leaves nothing stale behind."""
    try:
        entry = await session.scalar(
            select(IntakeEntry)
            .where(IntakeEntry.id == entry_id)
            .with_for_update(nowait=True)
            .execution_options(populate_existing=True)
        )
    except DBAPIError as error:
        if _is_lock_failure(error):
            raise HTTPException(409, busy) from None
        raise
    if entry is None:
        raise HTTPException(404, "No such entry")
    return entry


# The sitting lock is never waited for: a commit takes the sitting and then
# the entries, a resolve holds an entry and then wants the sitting, and
# waiting would let the two deadlock. A few quick tries ride out another
# lookup's short hold; a commit's hold ends in a 409.
LOCK_TRIES = 5
LOCK_PAUSE = 0.1


async def lock_sitting(session: AsyncSession, sitting_id: uuid.UUID) -> None:
    """Take the sitting row `FOR UPDATE NOWAIT` (a savepoint per try, so the
    entry lock already held survives a miss); 409 when it stays held."""
    for attempt in range(LOCK_TRIES):
        try:
            async with session.begin_nested():
                await session.scalar(
                    select(IntakeSitting.id)
                    .where(IntakeSitting.id == sitting_id)
                    .with_for_update(nowait=True)
                )
            return
        except DBAPIError as error:
            if not _is_lock_failure(error):
                raise
        if attempt < LOCK_TRIES - 1:
            await asyncio.sleep(LOCK_PAUSE)
    raise HTTPException(409, BEING_SAVED)


async def _places_sitting(session: AsyncSession, entry: IntakeEntry) -> IntakeSitting:
    sitting = await session.get(IntakeSitting, entry.sitting_id)
    if (
        entry.kind != "place"
        or sitting is None
        or sitting.area is not IntakeArea.PLACES
    ):
        raise HTTPException(409, NOT_A_PLACES_SITTING)
    return sitting


async def _apply_choice(
    session: AsyncSession,
    entry: IntakeEntry,
    sitting_id: uuid.UUID,
    row: dict[str, Any],
) -> None:
    """Make `entry` the place of search row `row`, as the add route would:
    `chosen` and the position come from `clean_chosen`, the old candidates and
    note go. Saved already is OWNED; the same place as another line's is
    IGNORED; else READY. Raises ValueError when the row fails the checks."""
    part, chosen = clean_chosen(row)
    lat, lng = clean_position(part["lat"], part["lng"])
    payload = {
        key: value
        for key, value in (entry.payload or {}).items()
        if key not in ("candidates", "note", "owned_spot_id")
    }
    searched = clean_name((entry.payload or {}).get("name"))
    payload.update(name=part["name"], lat=lat, lng=lng)
    if searched:  # display only: what was typed, before the hit's name replaced it
        payload["searched_as"] = searched
    source_id = chosen["source_id"]
    owned = await owned_spot_id(
        session, source_id=source_id, name=part["name"], lat=lat, lng=lng
    )
    others = (
        await session.scalars(
            select(IntakeEntry).where(
                IntakeEntry.sitting_id == sitting_id, IntakeEntry.id != entry.id
            )
        )
    ).all()
    if owned:
        entry.state = IntakeEntryState.OWNED
        payload.update(owned_spot_id=owned, note=OWNED_NOTE)
    elif source_id and any(
        (other.chosen or {}).get("source_id") == source_id for other in others
    ):
        entry.state = IntakeEntryState.IGNORED
        payload["note"] = SAME_PLACE_NOTE
    else:
        entry.state = IntakeEntryState.READY
    entry.chosen = chosen
    entry.payload = payload


def register_paste_routes(
    router: APIRouter,
    get_session: Callable[..., Any],
    entries_json: Callable[[AsyncSession, list[IntakeEntry]], Awaitable[list[dict]]],
) -> None:
    """Adds the three routes to the intake router (admin only through it)."""

    @router.post("/sittings/{sitting_id}/paste", response_model=PasteOut)
    async def paste(
        sitting_id: uuid.UUID,
        body: PasteIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """One entry per pasted line, with no network call (see the module
        docstring for each line's state). The sitting row is locked first, so
        two pastes queue and the second sees the first's entries. Lines
        already in the sitting count as duplicates; a sitting holds at most
        300 entries, the rest count as `over_limit`."""
        sitting = await session.scalar(
            select(IntakeSitting)
            .where(IntakeSitting.id == sitting_id)
            .with_for_update()
        )
        if sitting is None:
            raise HTTPException(404, "No such sitting")
        if sitting.area is not IntakeArea.PLACES or sitting.kind not in (None, "place"):
            raise HTTPException(409, NOT_A_PLACES_SITTING)
        split = split_lines(body.text)
        held = list(
            (
                await session.scalars(
                    select(IntakeEntry).where(IntakeEntry.sitting_id == sitting.id)
                )
            ).all()
        )
        known = _held_keys(held)
        duplicates = split.duplicates
        fresh: list[str] = []
        for line in split.lines:
            if _key(line) in known:
                duplicates += 1
            else:
                fresh.append(line)
        room = max(0, MAX_ENTRIES - len(held))
        over_limit = split.over_limit + max(0, len(fresh) - room)
        fresh = fresh[:room]

        made = [(line, *entry_for_line(line, read_line(line))) for line in fresh]
        # Saved already? The database only; one pass over the spots.
        probes = [
            {
                "source_id": None,
                "title": payload["name"],
                "lat": payload["lat"],
                "lng": payload["lng"],
            }
            for _, state, payload in made
            if state in (IntakeEntryState.READY, IntakeEntryState.CHECK)
            and "lat" in payload
        ]
        await flag_owned(session, probes)
        owned = iter(probes)
        # `created_at` is the transaction's time for every row; spacing it
        # keeps the sitting's entries in the order they were pasted.
        start = datetime.now(UTC)
        entries: list[IntakeEntry] = []
        for index, (_, state, payload) in enumerate(made):
            if (
                state in (IntakeEntryState.READY, IntakeEntryState.CHECK)
                and "lat" in payload
            ):
                found = next(owned)["owned_spot_id"]
                if found:
                    state = IntakeEntryState.OWNED
                    payload = {**payload, "owned_spot_id": found, "note": OWNED_NOTE}
            entries.append(
                IntakeEntry(
                    sitting_id=sitting.id,
                    kind="place",
                    state=state,
                    payload=payload,
                    chosen=None,
                    created_at=start + timedelta(microseconds=index),
                )
            )
        session.add_all(entries)
        sitting.updated_at = func.now()
        await session.commit()
        shown = await entries_json(session, entries)
        return {
            "entries": shown,
            "added": len(entries),
            "blank": split.blank,
            "duplicates": duplicates,
            "over_limit": over_limit,
        }

    async def _remaining(session: AsyncSession, sitting_id: uuid.UUID) -> int:
        return int(
            await session.scalar(
                select(func.count())
                .select_from(IntakeEntry)
                .where(
                    IntakeEntry.sitting_id == sitting_id,
                    IntakeEntry.state == IntakeEntryState.READING,
                )
            )
            or 0
        )

    @router.post("/entries/{entry_id}/resolve", response_model=ResolveOut)
    async def resolve(
        entry_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        async with _lookup_slots():
            return await _resolve(entry_id, session)

    async def _resolve(entry_id: uuid.UUID, session: AsyncSession) -> dict[str, Any]:
        """One Nominatim search for one waiting or to-check place. The row is
        locked for the whole call (a second call is a 409), and what the entry
        becomes is decided from the server's own hit count. At most two lookups
        run at once (the rest wait before locking anything), so a page may fire
        them in parallel or one after another without a timeout burning an
        entry's attempts. A search that
        fails is not an error: the entry waits for another go, and after two
        failures it is left to check."""
        entry = await claim_entry(session, entry_id)
        sitting = await _places_sitting(session, entry)
        if entry.state not in (IntakeEntryState.READING, IntakeEntryState.CHECK):
            raise HTTPException(409, NOT_RESOLVABLE)
        payload = dict(entry.payload or {})
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise HTTPException(409, NO_NAME)
        from_check = entry.state is IntakeEntryState.CHECK
        attempts = 0 if from_check else int(payload.get("attempts") or 0)
        payload.pop("candidates", None)
        payload.pop("note", None)
        try:
            async with place_kind.http_client() as client:
                outcome = await nominatim.search(client, name)
        except Exception:  # the client never raises for a network problem
            logger.exception("place resolve: the search raised")
            outcome = SearchFailure(
                "http_error", "The place search could not be reached."
            )

        # Lock the sitting before reading its other entries, so two lookups
        # of the same place cannot both become READY.
        await lock_sitting(session, sitting.id)
        if isinstance(outcome, SearchFailure):
            attempts += 1
            payload["attempts"] = attempts
            if attempts >= MAX_ATTEMPTS:
                entry.state = IntakeEntryState.CHECK
                payload["note"] = NO_ANSWER_NOTE
            else:
                entry.state = IntakeEntryState.READING
                payload["note"] = outcome.message
            entry.payload = payload
        else:
            payload["attempts"] = attempts
            hits = outcome.hits
            if len(hits) == 1:
                entry.payload = payload
                try:
                    await _apply_choice(session, entry, sitting.id, row_for(hits[0]))
                except ValueError as error:
                    entry.state = IntakeEntryState.CHECK
                    entry.payload = {**payload, "note": str(error)}
            elif hits:
                rows = [row_for(hit) for hit in hits[:MAX_CANDIDATES]]
                flag_rows = [dict(row) for row in rows]
                await flag_owned(session, flag_rows)
                entry.state = IntakeEntryState.CHECK
                entry.payload = {
                    **payload,
                    "candidates": flag_rows,
                    "note": f"{len(hits)} places found",
                }
            else:
                entry.state = IntakeEntryState.CHECK
                entry.payload = {**payload, "note": NO_PLACE_NOTE}
        sitting.updated_at = func.now()
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return {**shown, "remaining": await _remaining(session, entry.sitting_id)}

    @router.post("/entries/{entry_id}/pick", response_model=EntryOut)
    async def pick(
        entry_id: uuid.UUID,
        body: PickIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Choose one of the candidates the server stored on a CHECK entry.
        The client sends only the index; `chosen` and the position are
        copied from the stored candidate and checked again."""
        entry = await claim_entry(session, entry_id)
        sitting = await _places_sitting(session, entry)
        candidates = (entry.payload or {}).get("candidates")
        if (
            entry.state is not IntakeEntryState.CHECK
            or not isinstance(candidates, list)
            or not candidates
        ):
            raise HTTPException(422, NOT_PICKABLE)
        if not 0 <= body.index < len(candidates) or not isinstance(
            candidates[body.index], dict
        ):
            raise HTTPException(422, "No such candidate")
        await lock_sitting(session, sitting.id)
        try:
            await _apply_choice(session, entry, sitting.id, candidates[body.index])
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        sitting.updated_at = func.now()
        await session.commit()
        [shown] = await entries_json(session, [entry])
        return shown
