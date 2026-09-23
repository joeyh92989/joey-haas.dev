"""Play Next: three named picks from the owned backlog.

Pure. Items and events arrive as plain dataclasses and scored picks leave the
same way; nothing here touches a request or a database, so every rule is tested
on fixtures (the matching.py pattern). The only randomness is the jitter term,
drawn from a `random.Random` the caller passes in.

The profile is built from the owner's own games: favourites, ratings, finishes
and abandonments give each attribute (genre, theme, keyword, mode, perspective,
developer) a weight, and a candidate scores by how well its attributes match.
PICKER_WEIGHTS and MOOD_BUCKETS are the tuning points.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from statistics import mean

# Each term scores 0-100; the total is their weighted mean.
PICKER_WEIGHTS = {
    "affinity": 35,
    "similarity": 20,
    "quality": 15,
    "length_fit": 15,
    "waiting": 10,
    "jitter": 5,
}

# Hours, [low, high]; long has no upper edge.
TIME_WINDOWS: dict[str, tuple[float, float | None]] = {
    "quick": (0.0, 6.0),
    "evening": (6.0, 15.0),
    "long": (15.0, None),
}

BASE_WEIGHTS = {"favorite": 1.0, "finished": 0.3, "abandoned": -0.5}
FINISHED_FLOOR = 0.1

STALE_WINDOW = timedelta(days=14)
STALE_PENALTY = 15
STALE_CAP = 45

# Acquired dates carry information only once they spread this far; the import
# gave every game nearly the same one.
INFORMATIVE_SPREAD = timedelta(days=90)
WAITING_FULL_DAYS = 365
RELEASE_FULL_DAYS = 3650


@dataclass(frozen=True)
class PickerItem:
    """One item as Play Next sees it; the route builds these from rows."""

    id: str
    title: str
    type: str
    status: str
    owned: bool
    rating: int | None
    favorite: bool
    pinned: bool
    external_id: str | None
    year: int | None
    cover_url: str | None
    platform_id: int | None
    platform: str | None
    creator: str | None
    genres: tuple[str, ...]
    themes: tuple[str, ...]
    keywords: tuple[str, ...]
    game_modes: tuple[str, ...]
    player_perspectives: tuple[str, ...]
    similar_games: tuple[str, ...]
    community_score: float | None
    time_to_beat_hours: float | None
    release_date: date | None
    acquired_at: date | None
    started_at: date | None


@dataclass(frozen=True)
class PickerEvent:
    """A pick event: shown, skipped, never or pinned, with an aware time."""

    item_id: str
    action: str
    created_at: datetime


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _is_reference(item: PickerItem) -> bool:
    return (
        item.favorite
        or item.rating is not None
        or item.status in ("finished", "abandoned")
    )


def reference_weights(items: list[PickerItem]) -> dict[str, float]:
    """Each reference item's weight: how much it says about the owner's taste.

    Favourite 1.0, finished 0.3, abandoned -0.5 (a finished favourite 1.0),
    plus a rating adjustment measured from the collection's mean rating. A
    finished game never counts for less than 0.1: rating one you finished must
    never make it count for less than leaving it unrated.
    """
    references = [item for item in items if _is_reference(item)]
    ratings = [item.rating for item in references if item.rating is not None]
    average = mean(ratings) if ratings else None

    weights: dict[str, float] = {}
    for item in references:
        if item.favorite:
            weight = BASE_WEIGHTS["favorite"]
        elif item.status in ("finished", "abandoned"):
            weight = BASE_WEIGHTS[item.status]
        else:
            weight = 0.0
        if item.rating is not None and average is not None:
            if item.rating > average and average < 10:
                weight += (item.rating - average) / (10 - average)
            elif item.rating < average and average > 0:
                weight += (item.rating - average) / average
        if item.status == "finished":
            weight = max(weight, FINISHED_FLOOR)
        weights[item.id] = weight
    return weights


def attributes(item: PickerItem) -> set[tuple[str, str]]:
    """Everything a taste can attach to, as (kind, value) pairs."""
    pairs = {
        *(("genre", value) for value in item.genres),
        *(("theme", value) for value in item.themes),
        *(("keyword", value) for value in item.keywords),
        *(("mode", value) for value in item.game_modes),
        *(("perspective", value) for value in item.player_perspectives),
    }
    if item.creator:
        pairs.add(("creator", item.creator))
    return pairs


def attribute_table(
    items: list[PickerItem], weights: dict[str, float]
) -> dict[tuple[str, str], float]:
    """Each attribute's mean weight over the reference items carrying it."""
    carried: dict[tuple[str, str], list[float]] = {}
    for item in items:
        if item.id not in weights:
            continue
        for pair in attributes(item):
            carried.setdefault(pair, []).append(weights[item.id])
    return {pair: mean(values) for pair, values in carried.items()}


def affinity(item: PickerItem, table: dict[tuple[str, str], float]) -> float:
    """50 is neutral; an attribute the profile has never seen counts as 0."""
    pairs = attributes(item)
    if not pairs:
        return 50.0
    return _clamp(50 + 50 * mean(table.get(pair, 0.0) for pair in pairs))


def similarity(
    item: PickerItem, references: list[PickerItem], weights: dict[str, float]
) -> tuple[float, PickerItem | None]:
    """The best-weighted reference IGDB lists beside this one, either way.

    Returns the score and that reference, or (0, None). IGDB ids are compared
    as strings: the snapshot holds ints, external_id a string.
    """
    if not item.external_id:
        return 0.0, None
    best: tuple[float, PickerItem | None] = (0.0, None)
    for reference in references:
        if reference.id == item.id or not reference.external_id:
            continue
        linked = (
            item.external_id in reference.similar_games
            or reference.external_id in item.similar_games
        )
        weight = weights.get(reference.id, 0.0)
        if linked and weight > 0 and 100 * weight > best[0]:
            best = (_clamp(100 * weight), reference)
    return best


def quality(item: PickerItem) -> float:
    """The community score (already 0-100), or neutral."""
    if item.community_score is None:
        return 50.0
    return _clamp(item.community_score)


def length_fit(item: PickerItem, time: str) -> float:
    """100 inside the chosen window, falling to 0 at half its low edge and at
    twice its high edge. An unknown length is never held against a game."""
    hours = item.time_to_beat_hours
    if time == "any" or hours is None or time not in TIME_WINDOWS:
        return 100.0
    low, high = TIME_WINDOWS[time]
    if high is not None and hours > high:
        return _clamp(100 * (2 * high - hours) / high)
    if low > 0 and hours < low:
        return _clamp(100 * (hours - low / 2) / (low / 2))
    return 100.0


def acquired_dates_informative(items: list[PickerItem]) -> bool:
    """Whether acquired dates spread far enough to say anything."""
    dates = [item.acquired_at for item in items if item.acquired_at]
    return bool(dates) and max(dates) - min(dates) >= INFORMATIVE_SPREAD


def waiting(item: PickerItem, today: date, informative: bool) -> float:
    """How long the game has waited, 0-100.

    From the acquired date (the start date for a game in progress) when those
    dates mean something; otherwise from the release date, so the term is not
    a constant while every acquired date is the import day.
    """
    if informative:
        since = (
            item.started_at
            if item.status == "active" and item.started_at
            else item.acquired_at
        )
        full = WAITING_FULL_DAYS
    else:
        since, full = item.release_date, RELEASE_FULL_DAYS
    if since is None:
        return 0.0
    return _clamp(100 * (today - since).days / full)


def staleness(item_id: str, events: list[PickerEvent], now: datetime) -> float:
    """-15 per distinct UTC day the game was shown in the last two weeks.

    Days, not showings: an evening of rerolls counts once.
    """
    days = {
        event.created_at.astimezone(UTC).date()
        for event in events
        if event.item_id == item_id
        and event.action == "shown"
        and now - event.created_at <= STALE_WINDOW
    }
    return -float(min(STALE_PENALTY * len(days), STALE_CAP))
