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
from collections.abc import Callable
from typing import Any

import httpx2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import spots
from intake.kinds import FieldSpec, Kind, KindSearch, register
from intake.kinds import select as options
from models import CandidateSource, IntakeArea, IntakeEntryState, Spot
from spot_sources import nominatim
from spot_sources.dedupe import same_place
from spot_sources.nominatim import PlaceHit, SearchFailure

logger = logging.getLogger(__name__)

ATTRIBUTION = "Search by OpenStreetMap contributors"
DEFAULT_CITY = "denver"
# Builds the client a search uses; tests swap it.
http_client: Callable[[], httpx2.AsyncClient] = httpx2.AsyncClient


def mark_for_count(count: int) -> IntakeEntryState:
    """Exactly one hit is READY; none or several need a look (CHECK)."""
    return IntakeEntryState.READY if count == 1 else IntakeEntryState.CHECK


def map_url(hit: PlaceHit) -> str:
    return f"https://www.openstreetmap.org/{hit.osm_type}/{hit.osm_id}"


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
        "address": hit.display_name,
        "lat": hit.lat,
        "lng": hit.lng,
        "source_id": hit.source_id,
        "category": hit.category,
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
    """The spot fields an entry writes (task 5's commit)."""
    payload = entry.get("payload") or {}
    chosen = entry.get("chosen") or {}
    row = {
        "name": payload.get("name"),
        "lat": payload.get("lat"),
        "lng": payload.get("lng"),
        "city": payload.get("city") or DEFAULT_CITY,
        "neighbourhood": payload.get("neighbourhood"),
        "blurb": payload.get("blurb"),
        "tags": payload.get("tags") or [],
        "is_public": bool(payload.get("is_public")),
    }
    if chosen.get("source_id"):
        row["source"] = CandidateSource.OSM
        row["source_id"] = chosen["source_id"]
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
