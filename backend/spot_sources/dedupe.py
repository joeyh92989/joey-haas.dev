"""One place, once: duplicates in an answer, and places already on the list.

OSM often maps one place twice -- a café as a node and as the building way
around it, or a park as two overlapping areas -- and a place the owner has
already added should not come back as a find. Two places are the same when
they are within `SAME_PLACE_METRES` of each other and their names agree,
the `matching.py` precedent: names are normalised the same way and
compared by ratio, and one name containing the other also agrees ("Union
Station" and "Denver Union Station").

Pure: no network, no database.
"""

from __future__ import annotations

from collections.abc import Iterable
from difflib import SequenceMatcher
from typing import Protocol

from matching import normalize_title
from spot_sources.limits import SAME_NAME_RATIO, SAME_PLACE_METRES
from spot_sources.overpass import CandidateRow
from spots import haversine_miles

METRES_PER_MILE = 1609.344


class Place(Protocol):
    name: str
    lat: float
    lng: float


def metres_between(a: Place, b: Place) -> float:
    return haversine_miles((a.lat, a.lng), (b.lat, b.lng)) * METRES_PER_MILE


def names_agree(left: str, right: str) -> bool:
    a, b = normalize_title(left), normalize_title(right)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= SAME_NAME_RATIO


def same_place(a: Place, b: Place) -> bool:
    return metres_between(a, b) <= SAME_PLACE_METRES and names_agree(a.name, b.name)


# Grid cells of 0.001°: about 111 m north-south and 85 m east-west at
# Denver, both wider than SAME_PLACE_METRES, so a match is always in the
# place's own cell or a neighbour and a run compares locally, not n².
_CELL = 0.001


def _cell(place: Place) -> tuple[int, int]:
    return int(place.lat // _CELL), int(place.lng // _CELL)


def _near(grid: dict[tuple[int, int], list[Place]], place: Place) -> Iterable[Place]:
    row, col = _cell(place)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            yield from grid.get((row + dr, col + dc), ())


def dedupe(
    rows: Iterable[CandidateRow], known: Iterable[Place] = ()
) -> list[CandidateRow]:
    """`rows` with repeats and places already in `known` removed.

    The first of two duplicates is kept, so the answer's order decides,
    and that order is OSM's, which is stable between runs.
    """
    grid: dict[tuple[int, int], list[Place]] = {}
    for place in known:
        grid.setdefault(_cell(place), []).append(place)
    kept: list[CandidateRow] = []
    for row in rows:
        if any(same_place(row, other) for other in _near(grid, row)):
            continue
        kept.append(row)
        grid.setdefault(_cell(row), []).append(row)
    return kept
