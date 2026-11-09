"""OpenStreetMap places near the anchors, through Overpass.

`build_query` and `parse` are pure, and are what the tests cover over a
recorded answer (`tests/fixtures/overpass_candidates.json`, written by
`scripts/record_spot_fixtures.py`). `fetch` is the one network call: it
takes the caller's client, so the module never builds one and the tests
pass a mock transport.

One query covers every anchor, an `around:` block per anchor per tag, so a
run is one request, not one per anchor; Overpass unions the blocks and
returns each place once even when two anchors both reach it.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass

import httpx2

from spot_sources.limits import (
    BACKOFF_SECONDS,
    BACKOFF_STATUSES,
    OVERPASS_URL,
    QUERY_TIMEOUT_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
    RETRIES,
)

# (OSM key, the values asked for). Museums are tagged tourism=museum far
# more often than amenity=museum, so both are asked for.
TAG_SET: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("amenity", ("cafe", "restaurant", "library", "museum")),
    ("leisure", ("park", "playground")),
    ("tourism", ("attraction", "museum")),
)

# The category a place is filed under: the first key in TAG_SET it carries
# a wanted value for, in this order.
CATEGORY_KEYS = tuple(key for key, _ in TAG_SET)

MAX_NAME = 200
MAX_DETAIL = 100


class OverpassError(RuntimeError):
    """Overpass did not answer usefully; the message is the owner's."""


@dataclass(frozen=True)
class Anchor:
    """Where to search from."""

    lat: float
    lng: float


@dataclass(frozen=True)
class CandidateRow:
    """One named place, as plain strings and numbers.

    `source_id` is OSM's own `node/123` form, so a way and a node with the
    same number stay apart. `detail` is the cuisine or similar, for the
    prompt only.
    """

    source_id: str
    name: str
    category: str
    lat: float
    lng: float
    detail: str | None = None


def build_query(
    anchors: Iterable[Anchor], radius_m: int, timeout: int = QUERY_TIMEOUT_SECONDS
) -> str:
    """One Overpass QL query for every wanted tag around every anchor."""
    anchors = list(anchors)
    if not anchors:
        raise ValueError("build_query needs at least one anchor")
    blocks = []
    for anchor in anchors:
        around = f"(around:{radius_m},{anchor.lat:.6f},{anchor.lng:.6f})"
        for key, values in TAG_SET:
            pattern = "|".join(values)
            blocks.append(f'  nwr["{key}"~"^({pattern})$"]["name"]{around};')
    body = "\n".join(blocks)
    return f"[out:json][timeout:{timeout}];\n(\n{body}\n);\nout center tags;"


def _category(tags: dict) -> str | None:
    for key, values in TAG_SET:
        if tags.get(key) in values:
            return tags[key]
    return None


def _position(element: dict) -> tuple[float, float] | None:
    # A node carries its own point; a way or relation its `center`.
    point = element if "lat" in element else element.get("center") or {}
    lat, lng = point.get("lat"), point.get("lon")
    if not isinstance(lat, int | float) or not isinstance(lng, int | float):
        return None
    return float(lat), float(lng)


def parse(payload: dict) -> list[CandidateRow]:
    """Named places with a position and a wanted category, in answer order.

    An element with no name, no position, an unwanted category or a
    `disused`/`abandoned` lifecycle tag is skipped, never an error: OSM is
    open data, and one odd row must not cost the run.
    """
    rows: list[CandidateRow] = []
    seen: set[str] = set()
    for element in payload.get("elements") or []:
        kind, number = element.get("type"), element.get("id")
        tags = element.get("tags") or {}
        name = (tags.get("name") or "").strip()
        if kind not in ("node", "way", "relation") or not isinstance(number, int):
            continue
        if not name or any(k.startswith(("disused:", "abandoned:")) for k in tags):
            continue
        category = _category(tags)
        position = _position(element)
        source_id = f"{kind}/{number}"
        if category is None or position is None or source_id in seen:
            continue
        seen.add(source_id)
        detail = tags.get("cuisine") or tags.get("sport") or None
        rows.append(
            CandidateRow(
                source_id=source_id,
                name=name[:MAX_NAME],
                category=category,
                lat=position[0],
                lng=position[1],
                detail=detail.replace(";", ", ")[:MAX_DETAIL] if detail else None,
            )
        )
    return rows


async def fetch(
    client: httpx2.AsyncClient,
    query: str,
    *,
    url: str = OVERPASS_URL,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> dict:
    """The answer to one query, waiting out a 429 or 406 once.

    Raises `OverpassError` for anything else: a timeout, another status,
    or a body that is not JSON.
    """
    for attempt in range(RETRIES + 1):
        try:
            response = await client.post(
                url, data={"data": query}, timeout=REQUEST_TIMEOUT_SECONDS
            )
        except httpx2.HTTPError as error:
            raise OverpassError(
                f"Overpass could not be reached ({type(error).__name__})"
            ) from error
        if response.status_code in BACKOFF_STATUSES and attempt < RETRIES:
            await sleep(BACKOFF_SECONDS)
            continue
        if response.status_code != 200:
            raise OverpassError(f"Overpass answered {response.status_code}")
        try:
            payload = response.json()
        except ValueError as error:
            raise OverpassError("Overpass's answer was not JSON") from error
        if not isinstance(payload, dict):
            raise OverpassError("Overpass's answer was not an object")
        # A query that ran out of time still answers 200, with a remark.
        remark = payload.get("remark") or ""
        if "runtime error" in remark.lower():
            raise OverpassError("Overpass ran out of time on the query")
        return payload
    raise AssertionError("unreachable: the last attempt returns or raises")
