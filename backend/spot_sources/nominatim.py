"""Place search through Nominatim, OpenStreetMap's public geocoder.

`parse_results` is pure and is what the tests cover over recorded answers
(`tests/fixtures/nominatim_*.json`). `search` is the one network call: it
takes the caller's client, so the module never builds one, and it never
raises for a network or HTTP problem; it returns a `SearchFailure` the
caller can show. Policy and the reasons for these choices:
`spot_sources/README.md`, "Nominatim".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

import httpx2

from sources.base import Throttle
from spot_sources.limits import NOMINATIM_USER_AGENT

logger = logging.getLogger(__name__)

SEARCH_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_TIMEOUT_SECONDS = 6.0
RESULT_LIMIT = 5
# Denver, as a boost only (never bounded=1): left, top, right, bottom as
# lng/lat pairs.
DENVER_VIEWBOX = "-105.35,39.95,-104.60,39.55"
# Policy maximum is 1 request per second; a little over it.
_throttle = Throttle(1.1)

FailureReason = Literal["timeout", "http_error", "bad_response", "empty_query"]


@dataclass(frozen=True)
class PlaceHit:
    """One place Nominatim found."""

    name: str
    display_name: str
    lat: float
    lng: float
    osm_type: str
    osm_id: int
    source_id: str  # f"{osm_type}/{osm_id}", the form the finder stores
    category: str
    type: str
    address: dict = field(default_factory=dict, hash=False)


@dataclass(frozen=True)
class SearchOk:
    """A search that got an answer; `hits` may be empty."""

    hits: list[PlaceHit]
    ok: Literal[True] = True


@dataclass(frozen=True)
class SearchFailure:
    """A search that did not get an answer; `message` is fit to show."""

    reason: FailureReason
    message: str
    ok: Literal[False] = False


SearchResult = SearchOk | SearchFailure


def parse_results(raw: list[dict]) -> list[PlaceHit]:
    """The hits in a `format=jsonv2` answer.

    A row without lat, lon, osm_type or osm_id is skipped, not an error.
    """
    hits: list[PlaceHit] = []
    for row in raw:
        try:
            lat = float(row["lat"])
            lng = float(row["lon"])
            osm_type = str(row["osm_type"])
            osm_id = int(row["osm_id"])
        except (KeyError, TypeError, ValueError):
            continue
        display_name = row.get("display_name") or ""
        name = row.get("name") or display_name.split(",")[0].strip()
        hits.append(
            PlaceHit(
                name=name,
                display_name=display_name,
                lat=lat,
                lng=lng,
                osm_type=osm_type,
                osm_id=osm_id,
                source_id=f"{osm_type}/{osm_id}",
                category=row.get("category") or "",
                type=row.get("type") or "",
                address=row.get("address") or {},
            )
        )
    return hits


async def search(client: httpx2.AsyncClient, query: str) -> SearchResult:
    """Search Nominatim for `query`, at most one request a second.

    An empty query makes no request. Network and HTTP problems come back as
    a `SearchFailure`, never as an exception.
    """
    query = query.strip()
    if not query:
        return SearchFailure("empty_query", "Type a place to search for.")
    await _throttle.wait()
    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": "1",
        "limit": str(RESULT_LIMIT),
        "countrycodes": "us",
        "viewbox": DENVER_VIEWBOX,
    }
    try:
        response = await client.get(
            SEARCH_URL,
            params=params,
            headers={"User-Agent": NOMINATIM_USER_AGENT},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx2.TimeoutException:
        logger.warning("nominatim search %r: timed out", query)
        return SearchFailure("timeout", "The place search took too long.")
    except httpx2.HTTPError as error:
        logger.warning("nominatim search %r: %s", query, type(error).__name__)
        return SearchFailure("http_error", "The place search could not be reached.")
    if response.status_code != 200:
        logger.warning("nominatim search %r: status %s", query, response.status_code)
        return SearchFailure(
            "http_error", f"The place search answered {response.status_code}."
        )
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if not isinstance(payload, list):
        logger.warning("nominatim search %r: unreadable answer", query)
        return SearchFailure(
            "bad_response", "The place search's answer was unreadable."
        )
    hits = parse_results([row for row in payload if isinstance(row, dict)])
    logger.info("nominatim search %r: status 200, %d hits", query, len(hits))
    return SearchOk(hits)
