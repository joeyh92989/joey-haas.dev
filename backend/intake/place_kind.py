"""The places area's one kind: a place (story #340).

A place has no metadata source. Its search hook asks Nominatim
(`spot_sources/nominatim.py`) and turns hits into rows; typing the search
sends nothing, only submitting it does. A hit already on the list
(`flag_owned`) carries `owned_spot_id` and cannot be added again. How many
hits a search found decides the mark of the entry made from one:
`mark_for_count`. No model is involved anywhere.
"""

from __future__ import annotations

import logging
import math
import re
from collections.abc import Callable
from datetime import date, datetime
from typing import Any

import httpx2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import spots
from intake.kinds import FieldSpec, Kind, KindSearch, register
from intake.kinds import select as options
from models import CandidateSource, IntakeArea, IntakeEntryState, Spot
from public import OWNER_TZ
from spot_sources import nominatim
from spot_sources.dedupe import same_place
from spot_sources.map_links import clean_line
from spot_sources.nominatim import PlaceHit, SearchFailure

logger = logging.getLogger(__name__)

ATTRIBUTION = "Search by OpenStreetMap contributors"
DEFAULT_CITY = spots.DENVER
# Builds the client a search uses; tests swap it.
http_client: Callable[[], httpx2.AsyncClient] = httpx2.AsyncClient


def owner_today() -> date:
    """The owner's Denver day: the one clock read of the outing paste and its
    commit (the date rules themselves take `today` as an argument). A test
    freezes it by patching this function."""
    return datetime.now(OWNER_TZ).date()


def mark_for_count(count: int) -> IntakeEntryState:
    """Exactly one hit is READY; none or several need a look (CHECK)."""
    return IntakeEntryState.READY if count == 1 else IntakeEntryState.CHECK


def map_url(hit: PlaceHit) -> str:
    return f"https://www.openstreetmap.org/{hit.osm_type}/{hit.osm_id}"


SOURCE_ID = re.compile(r"(node|way|relation)/[0-9]+")
SOURCE_ID_MAX = 60  # Spot.source_id is String(60)
NAME_MAX, TEXT_MAX = 200, 200
BLURB_MAX, NEIGHBOURHOOD_MAX = 500, 100
# The fields an owner may edit on an entry; nothing else in a payload is theirs.
EDITABLE = ("name", "city", "tags", "blurb", "neighbourhood", "is_public")


def _number(value: Any, low: float, high: float, label: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, int | float)
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ValueError(f"A chosen place needs a {label} between {low:g} and {high:g}")
    return float(value)


def _clip(value: Any, limit: int) -> Any:
    """Text cut to `limit` characters; anything else is left for `_text` to
    refuse. For display-only fields, where a long value is not worth a 422."""
    return value[:limit] if isinstance(value, str) else value


def _text(value: Any, limit: int, label: str) -> str | None:
    """Text an owner or a search result gave, as a person can see it: control
    and invisible format characters (NUL included) removed, whitespace
    collapsed (`map_links.clean_line`). Empty after cleaning is None."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"The {label} must be text of at most {limit} characters")
    text = clean_line(value)
    if len(text) > limit:
        raise ValueError(f"The {label} must be text of at most {limit} characters")
    return text or None


def clean_name(value: Any) -> str:
    name = _text(value, NAME_MAX, "name")
    if not name:
        raise ValueError("A place needs a name")
    return name


def clean_position(lat: Any, lng: Any) -> tuple[float, float]:
    """A finite, in-range `(lat, lng)`; ValueError otherwise."""
    return (
        _number(lat, -90, 90, "latitude"),
        _number(lng, -180, 180, "longitude"),
    )


def check_source_id(source_id: Any) -> None:
    """Raises ValueError unless `source_id` looks like way/123 (the one rule
    for a chosen search result and for an outing's new place)."""
    if (
        not isinstance(source_id, str)
        or len(source_id) > SOURCE_ID_MAX
        or not SOURCE_ID.fullmatch(source_id)
    ):
        raise ValueError("A chosen place's source_id must look like way/123")


def clean_chosen(hit: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """`(payload part, chosen)` for a search result the client sent back.

    Everything is checked like a typed place; `map_url` and `attribution`
    are the server's, rebuilt from `source_id`, never taken from the client.
    A missing `source_id` is allowed (the name-and-distance rule is then the
    only duplicate check). Raises ValueError with a message fit to show.
    """
    name = clean_name(hit.get("title") if "title" in hit else hit.get("name"))
    lat = _number(hit.get("lat"), -90, 90, "latitude")
    lng = _number(hit.get("lng"), -180, 180, "longitude")
    source_id = hit.get("source_id")
    url = None
    if source_id is not None:
        check_source_id(source_id)
        url = f"https://www.openstreetmap.org/{source_id}"
    chosen = {
        "source": "osm",
        "source_id": source_id,
        "title": name,
        # Display-only (no spot column): a long address is cut, never refused.
        "address": _text(_clip(hit.get("address"), TEXT_MAX), TEXT_MAX, "address"),
        "lat": lat,
        "lng": lng,
        "category": _text(hit.get("category"), TEXT_MAX, "category"),
        "map_url": url,
        "attribution": ATTRIBUTION,
    }
    return {"name": name, "lat": lat, "lng": lng}, chosen


def clean_fields(values: dict[str, Any]) -> dict[str, Any]:
    """The owner-editable fields present in `values`, validated; anything
    else (lat, lng, source_id, map_url...) is left out. ValueError on a bad
    value."""
    out: dict[str, Any] = {}
    for key in EDITABLE:
        if key not in values:
            continue
        value = values[key]
        if key == "name":
            out[key] = clean_name(value)
        elif key == "city":
            # A lone omitted or blank city stays Denver (the page's "Another
            # city" field relies on it); anything else goes through the one
            # city rule.
            text = _text(value, spots.CITY_MAX, "city")
            out[key] = spots.normalize_city(text) if text else DEFAULT_CITY
        elif key == "blurb":
            out[key] = _text(value, BLURB_MAX, "blurb")
        elif key == "neighbourhood":
            out[key] = _text(value, NEIGHBOURHOOD_MAX, "neighbourhood")
        elif key == "is_public":
            if not isinstance(value, bool):
                raise ValueError("The public flag must be true or false")
            out[key] = value
        else:
            if not isinstance(value, list) or not all(
                isinstance(tag, str) for tag in value
            ):
                raise ValueError("Tags must be a list of text")
            out[key] = spots.canonical_tags(clean_line(tag) for tag in value)
    return out


def not_ready_reason(payload: dict[str, Any]) -> str | None:
    """Why a stored payload cannot be READY, else None: it needs a name and
    a finite, in-range position, checked here from what is stored."""
    try:
        clean_name(payload.get("name"))
    except ValueError:
        return "This place has no name yet"
    try:
        _number(payload.get("lat"), -90, 90, "latitude")
        _number(payload.get("lng"), -180, 180, "longitude")
    except ValueError:
        return "This place has no coordinates yet"
    return None


def edit_place(old: dict[str, Any], edit: dict[str, Any]) -> dict[str, Any]:
    """A Check edit of a place entry: only the owner's fields change, the
    server's keys (position, source) stay as they were."""
    return {**old, **clean_fields(edit)}


def humanize(text: str) -> str:
    """ "train_station" as "Train station"; empty stays empty."""
    words = text.replace("_", " ").strip()
    return words[:1].upper() + words[1:]


def specific_type(hit: PlaceHit) -> str:
    """The row's kind label: the hit's own type ("amphitheatre"), else its
    class ("railway"); a generic `yes` type falls back to the class."""
    kind = (hit.type or "").strip()
    if kind and kind.lower() != "yes":
        return humanize(kind)
    return humanize(hit.category or "")


def short_address(hit: PlaceHit) -> str:
    """ "1701 Wynkoop St, Denver": house number and road, then the town.
    A sparse address falls back to the display name without its first
    segment (the name) and its trailing country."""
    parts = hit.address or {}
    street = " ".join(
        str(parts[key]).strip() for key in ("house_number", "road") if parts.get(key)
    )
    town = next(
        (
            str(parts[key]).strip()
            for key in ("city", "town", "village", "hamlet", "suburb")
            if parts.get(key)
        ),
        "",
    )
    short = ", ".join(piece for piece in (street, town) if piece)
    if street or town:
        return short
    segments = [piece.strip() for piece in hit.display_name.split(",")]
    segments = segments[1:]
    if segments and segments[-1] in ("United States", "USA"):
        segments = segments[:-1]
    return ", ".join(piece for piece in segments if piece)


def row_for(hit: PlaceHit) -> dict[str, Any]:
    """A search result row. `external_source` and `external_id` and `title`
    keep the shape the add bar already reads."""
    return {
        "kind": "place",
        "external_source": "osm",
        "external_id": hit.source_id,
        "title": hit.name,
        "year": None,
        "thumbnail_url": None,
        "address": short_address(hit),
        "lat": hit.lat,
        "lng": hit.lng,
        "source_id": hit.source_id,
        "category": specific_type(hit),
        "map_url": map_url(hit),
        "owned_spot_id": None,
        "attribution": ATTRIBUTION,
    }


async def search(query: str) -> KindSearch:
    """Nominatim hits as rows; a failure becomes its own message."""
    async with http_client() as client:
        outcome = await nominatim.search(client, query)
    if isinstance(outcome, SearchFailure):
        return KindSearch(failure=outcome.message)
    return KindSearch(rows=[row_for(hit) for hit in outcome.hits])


class _Point:
    """Anything with a name and a position, for `same_place`."""

    def __init__(self, name: str, lat: float, lng: float) -> None:
        self.name, self.lat, self.lng = name, lat, lng


def match_owned(
    spots: list[Spot], *, source_id: str | None, name: str, lat: float, lng: float
) -> Spot | None:
    """The spot of `spots` this place already is (same OSM `source_id`, else
    the same name within `SAME_PLACE_METRES`): the rule of `owned_spot_id`
    over spots already loaded, so a loop loads them once."""
    if source_id:
        for spot in spots:
            if spot.source == CandidateSource.OSM and spot.source_id == source_id:
                return spot
    here = _Point(name, lat, lng)
    return next((spot for spot in spots if same_place(here, spot)), None)


async def owned_spot_id(
    session: AsyncSession, *, source_id: str | None, name: str, lat: float, lng: float
) -> str | None:
    """The id of the spot this place already is: the same OSM `source_id`,
    else the same name within `SAME_PLACE_METRES`."""
    if source_id:
        found = await session.scalar(
            select(Spot.id).where(
                Spot.source == CandidateSource.OSM, Spot.source_id == source_id
            )
        )
        if found:
            return str(found)
    here = _Point(name, lat, lng)
    for spot in (await session.execute(select(Spot))).scalars():
        if same_place(here, spot):
            return str(spot.id)
    return None


async def flag_owned(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    """Sets `owned_spot_id` on each place row already on the list."""
    if not rows:
        return
    by_source = {
        spot.source_id: spot
        for spot in (
            await session.scalars(
                select(Spot).where(
                    Spot.source == CandidateSource.OSM,
                    Spot.source_id.in_([row["source_id"] for row in rows]),
                )
            )
        )
    }
    others = list((await session.scalars(select(Spot))).all())
    for row in rows:
        spot = by_source.get(row["source_id"])
        if spot is None:
            here = _Point(row["title"], row["lat"], row["lng"])
            spot = next((other for other in others if same_place(here, other)), None)
        row["owned_spot_id"] = str(spot.id) if spot else None


def to_row(entry: dict[str, Any]) -> dict[str, Any]:
    """The spot fields an entry writes, from the same validators the commit
    uses (`clean_name`, `clean_position`, `clean_fields`, `clean_chosen`), so
    the two cannot drift. ValueError, fit to show, on a bad stored value."""
    payload = entry.get("payload") or {}
    chosen = entry.get("chosen") or {}
    name = clean_name(payload.get("name"))
    lat, lng = clean_position(payload.get("lat"), payload.get("lng"))
    owner = clean_fields({key: payload[key] for key in EDITABLE if key in payload})
    row = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "city": owner.get("city", DEFAULT_CITY),
        "neighbourhood": owner.get("neighbourhood"),
        "blurb": owner.get("blurb"),
        "tags": owner.get("tags", []),
        "is_public": owner.get("is_public", False),
    }
    if chosen:
        _, checked = clean_chosen({**chosen, "title": name, "lat": lat, "lng": lng})
        if checked["source_id"]:
            row["source"] = CandidateSource.OSM
            row["source_id"] = checked["source_id"]
    return row


register(
    Kind(
        key="place",
        area=IntakeArea.PLACES,
        label="Place",
        ways_in=("search", "type"),
        source=None,
        has_details=True,
        fields=(
            FieldSpec("name", "Name", "text", required=True),
            FieldSpec("city", "City", "select", options((DEFAULT_CITY,))),
            FieldSpec("tags", "Tags", "select", options(spots.TAGS)),
            FieldSpec("blurb", "Blurb", "text"),
            FieldSpec("is_public", "Public", "select", options(("false", "true"))),
        ),
        to_row=to_row,
        search=search,
    )
)
