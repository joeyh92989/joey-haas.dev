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
| short link (incl. g.co)                | CHECK   |
| known map host, nothing readable       | CHECK   |
| line over 300 characters               | CHECK   |
| resolve: one hit                       | READY   |
| resolve: one hit, already saved        | OWNED   |
| resolve: hit already a ready/owned line| IGNORED |
| resolve: several hits / none           | CHECK   |
| resolve: search failed (attempts < 2)  | READING |
| resolve: search failed twice           | CHECK   |
| pick                                   | READY / OWNED / IGNORED, as one hit |
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
import weakref
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from intake import place_kind
from intake.outing_dates import DateRead, read_date, split_outing_line
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
from models import IntakeArea, IntakeEntry, IntakeEntryState, IntakeSitting, Visit
from spot_sources import nominatim
from spot_sources.map_links import MAX_LINE_CHARS as MAX_SOURCE_LINE
from spot_sources.map_links import (
    LineRead,
    clean_line,
    clean_name,
    compare_key,
    read_line,
    split_lines,
)
from spot_sources.nominatim import SearchFailure

logger = logging.getLogger(__name__)

# 200 lines at the 2,000-character URL cap. The page's own guard
# (`MAX_PASTE_CHARS` in `frontend/src/components/places/pasteModel.js`) must match.
MAX_PASTE_CHARS = 400_000
MAX_ENTRIES = 300  # a sitting holds at most this many entries
MAX_SEARCH_TEXT = 200
MAX_CANDIDATES = 5
MAX_ATTEMPTS = 2  # a search that fails this often is left to the owner

NAME_NEEDED_NOTE = "This place needs a name. Type one, then mark it ready."
SHORT_LINK_NOTE = (
    "This short link could not be read, and the server never follows short links. "
    "Type the place's name, then look it up."
)
UNREADABLE_NOTE = "Could not read a place from this link. Type the name."
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
NO_OUTING = "This entry is not a past outing"
MAX_DATE_TEXT = 60  # stored date words are cut here; a date is far shorter


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
    # Past outings (story #350): each line is a place and a date. `city` is the
    # city of the new private places; it is read in outings mode only.
    outings: bool = False
    city: str | None = Field(default=None, max_length=100)


class PickIn(BaseModel):
    """The index of a stored candidate. Nothing else is read from the client."""

    index: int


def _line_key(line: str) -> str:
    """The duplicate key of a whole line. A line longer than the stored
    `source_line` is keyed by a hash, so the stored and the pasted side agree."""
    key = compare_key(line)
    if len(key) <= MAX_SOURCE_LINE:
        return key
    return "sha1:" + hashlib.sha1(key.encode()).hexdigest()


def _base_payload(line: str, city: str = DEFAULT_CITY) -> dict[str, Any]:
    """The owner's fields of a typed place (empty tags and blurb, private)."""
    payload = {
        **clean_fields({"city": city, "tags": [], "blurb": None, "is_public": False}),
        "source_line": line[:MAX_SOURCE_LINE],
    }
    if len(line) > MAX_SOURCE_LINE:
        payload["source_key"] = _line_key(line)
    return payload


def entry_for_line(
    line: str, read: LineRead, city: str = DEFAULT_CITY
) -> tuple[IntakeEntryState, dict[str, Any]]:
    """The state and payload of the entry one pasted line makes. Pure."""
    line = clean_line(line)
    payload = _base_payload(line, city)
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
    if read.kind == "unreadable_link":
        payload["name"] = f"Link from {read.host}"
        payload["note"] = UNREADABLE_NOTE
        return IntakeEntryState.CHECK, payload
    if read.kind == "too_long":
        payload["name"] = line[:MAX_SEARCH_TEXT].strip()
        payload["note"] = read.note or "This line is too long"
        return IntakeEntryState.CHECK, payload
    text = (read.name or line)[:MAX_SEARCH_TEXT].strip()
    payload.update(name=text, attempts=0)
    return IntakeEntryState.READING, payload


# The states whose entries the commit writes. A place the owner left out
# (CHECK, with `chosen` kept) does not block another line of the same place.
_WRITTEN_STATES = (IntakeEntryState.READY, IntakeEntryState.OWNED)


def _held_keys(held: list[IntakeEntry], *, names: bool = True) -> set[str]:
    """The keys of the lines already in the sitting. In outings mode `names` is
    False: a place's name is not a line there (the line is place plus date),
    so the same place on a second date is not a repeat."""
    keys: set[str] = set()
    for entry in held:
        payload = entry.payload or {}
        for field in (
            ("source_line", "name", "source_key")
            if names
            else (
                "source_line",
                "source_key",
            )
        ):
            value = payload.get(field)
            if isinstance(value, str) and value.strip():
                keys.add(compare_key(value))
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


def outing_payload(date_text: str | None, read: DateRead | None) -> dict[str, Any]:
    """What a pasted outing stores on its entry. The server re-reads
    `date_text` whenever it matters (a date fix, the commit): `visited_on` and
    `precision` here are what it read last, never what a client said."""
    return {
        "date_text": date_text[:MAX_DATE_TEXT] if date_text else None,
        "visited_on": read.visited_on.isoformat() if read else None,
        "precision": read.precision if read else None,
        "skip": False,
    }


def _mark_duplicate(
    outing: dict[str, Any], found: str | None, flag: str = "duplicate_of"
) -> dict[str, Any]:
    """`outing` with the repeat flag `flag` (`duplicate_of`: a stored visit,
    `repeat_of`: an earlier line of the sitting) brought up to date. A newly
    found repeat is skipped; one found again keeps the owner's choice (a
    re-save or a second look must not undo "Add anyway"); one that is gone
    takes back the skip it set."""
    marked = dict(outing)
    before = marked.get(flag)
    if found:
        marked[flag] = found
        if before != found:
            marked["skip"] = True
    elif before:
        marked.pop(flag, None)
        other = "repeat_of" if flag == "duplicate_of" else "duplicate_of"
        if not marked.get(other):  # still a repeat of the other kind: stay skipped
            marked["skip"] = False
    return marked


async def flag_duplicates(
    session: AsyncSession, payloads: list[dict[str, Any]]
) -> None:
    """Sets or clears `outing.duplicate_of` on each payload that has an outing:
    the id of a stored outing of the SAME spot with the same period start and
    precision. One query for all of them. A day inside a logged month is not a
    duplicate. Mutates the payloads (their `outing` is replaced by a copy)."""
    spot_ids: set[uuid.UUID] = set()
    for payload in payloads:
        outing, spot = payload.get("outing"), payload.get("owned_spot_id")
        if isinstance(outing, dict) and spot and outing.get("visited_on"):
            try:
                spot_ids.add(uuid.UUID(str(spot)))
            except ValueError:
                continue
    stored: dict[tuple[str, str, str], str] = {}
    if spot_ids:
        rows = await session.execute(
            select(Visit.id, Visit.spot_id, Visit.visited_on, Visit.precision)
            .where(Visit.spot_id.in_(spot_ids))
            .order_by(Visit.created_at, Visit.id)
        )
        for visit_id, spot_id, visited_on, precision in rows:
            # The oldest matching visit is the one named.
            stored.setdefault(
                (str(spot_id), visited_on.isoformat(), precision.value),
                str(visit_id),
            )
    for payload in payloads:
        outing = payload.get("outing")
        if not isinstance(outing, dict):
            continue
        key = (
            str(payload.get("owned_spot_id")),
            str(outing.get("visited_on")),
            str(outing.get("precision")),
        )
        payload["outing"] = _mark_duplicate(outing, stored.get(key))


def _identity(entry: IntakeEntry) -> str:
    """Which place an entry is, for repeats within the sitting: its saved spot,
    else its chosen OSM id, else its name (a line not looked up yet)."""
    payload = entry.payload or {}
    return str(
        payload.get("owned_spot_id")
        or (entry.chosen or {}).get("source_id")
        or compare_key(payload.get("name") or "")
    )


def flag_repeats(entries: list[IntakeEntry], held: list[IntakeEntry]) -> None:
    """Flags a line that repeats an earlier line of the sitting (same place,
    same period start and precision, however the date was spelled) as
    `outing.repeat_of = <that entry's id>` and skips it. `held` are the lines
    already in the sitting, `entries` the new ones in paste order; a skipped
    line is not an earlier line. Paste only: a place's identity can change at
    resolve, so the commit makes the final check (`commit.write_outings`)."""
    first: dict[tuple[str, str, str], str] = {}

    def key_of(entry: IntakeEntry, outing: dict[str, Any]):
        return (_identity(entry), str(outing["visited_on"]), str(outing["precision"]))

    for entry in sorted(held, key=lambda e: (e.created_at, str(e.id))):
        outing = (entry.payload or {}).get("outing")
        if isinstance(outing, dict) and outing.get("visited_on"):
            if not outing.get("skip"):
                first.setdefault(key_of(entry, outing), str(entry.id))
    for entry in entries:
        payload = dict(entry.payload or {})
        outing = payload.get("outing")
        if not isinstance(outing, dict) or not outing.get("visited_on"):
            continue
        found = first.get(key_of(entry, outing))
        outing = _mark_duplicate(outing, found, "repeat_of")
        payload["outing"] = outing
        entry.payload = payload
        if not outing.get("skip"):
            first.setdefault(key_of(entry, outing), str(entry.id))


async def edit_outing(
    session: AsyncSession,
    entry: IntakeEntry,
    *,
    date_text: str | None,
    set_date: bool,
    skip: bool | None,
) -> None:
    """The owner's two outing edits on a place entry: the date WORDS (re-read
    here, so `visited_on` and `precision` are the server's) and skip. A change
    to neither leaves the stored outing exactly as it was."""
    payload = dict(entry.payload or {})
    outing = payload.get("outing")
    if not isinstance(outing, dict):
        raise HTTPException(422, NO_OUTING)
    outing = dict(outing)
    if set_date:
        words = clean_line(date_text or "")[:MAX_DATE_TEXT] or None
        read = read_date(words, place_kind.owner_today())
        outing.update(outing_payload(words, read), skip=bool(outing.get("skip")))
    if skip is not None:
        outing["skip"] = skip
    payload["outing"] = outing
    await flag_duplicates(session, [payload])
    entry.payload = payload


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
    elif (
        source_id
        and "outing" not in payload
        and any(
            other.state in _WRITTEN_STATES
            and (other.chosen or {}).get("source_id") == source_id
            for other in others
        )
    ):
        entry.state = IntakeEntryState.IGNORED
        payload["note"] = SAME_PLACE_NOTE
    else:
        entry.state = IntakeEntryState.READY
    await flag_duplicates(session, [payload])
    entry.chosen = chosen
    entry.payload = payload


def _outing_entry(
    line: str, city: str, today: date
) -> tuple[str, IntakeEntryState, dict[str, Any]]:
    """The entry one pasted past outing makes: the place text goes through the
    same reading as a place line, the date words are read, and the stored
    `source_line` stays the WHOLE line, so the same place on two dates is two
    entries while a repeated line is still a repeat."""
    place_text, date_text, read = split_outing_line(clean_line(line), today)
    place_text = place_text or clean_line(line)
    state, payload = entry_for_line(place_text, read_line(place_text), city)
    whole = clean_line(line)
    payload["source_line"] = whole[:MAX_SOURCE_LINE]
    if len(whole) > MAX_SOURCE_LINE:
        payload["source_key"] = _line_key(whole)
    else:
        payload.pop("source_key", None)
    payload["outing"] = outing_payload(date_text, read)
    return line, state, payload


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
        city = DEFAULT_CITY
        if body.outings and body.city is not None:
            try:
                city = clean_fields({"city": body.city})["city"]
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
        today = place_kind.owner_today()
        split = split_lines(body.text)
        held = list(
            (
                await session.scalars(
                    select(IntakeEntry).where(IntakeEntry.sitting_id == sitting.id)
                )
            ).all()
        )
        known = _held_keys(held, names=not body.outings)
        duplicates = split.duplicates
        fresh: list[str] = []
        for line in split.lines:
            if _line_key(line) in known:
                duplicates += 1
            else:
                fresh.append(line)
        room = max(0, MAX_ENTRIES - len(held))
        over_limit = split.over_limit + max(0, len(fresh) - room)
        fresh = fresh[:room]

        if body.outings:
            made = [_outing_entry(line, city, today) for line in fresh]
        else:
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
        # `created_at` is set here (the transaction's time would be the same
        # for every row), one microsecond apart, and never before the
        # sitting's newest entry whatever the app and database clocks say.
        start = datetime.now(UTC)
        newest = max((e.created_at for e in held if e.created_at), default=None)
        if newest is not None and newest >= start:
            start = newest + timedelta(microseconds=1)
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
                    id=uuid.uuid4(),
                    sitting_id=sitting.id,
                    kind="place",
                    state=state,
                    payload=payload,
                    chosen=None,
                    created_at=start + timedelta(microseconds=index),
                )
            )
        if body.outings:
            await flag_duplicates(session, [entry.payload for entry in entries])
            flag_repeats(entries, held)
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
        if from_check:
            # A new search replaces any earlier position and choice, so a
            # search that finds several, none or fails cannot leave the old
            # place behind for a later "ready" to save under the new name.
            for stale in ("lat", "lng", "owned_spot_id"):
                payload.pop(stale, None)
            entry.chosen = None
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
        # Whatever the search found, the old "already logged" flag belonged to
        # the old place: read it again (a place no longer owned drops it).
        again = dict(entry.payload or {})
        if isinstance(again.get("outing"), dict):
            await flag_duplicates(session, [again])
            entry.payload = again
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
