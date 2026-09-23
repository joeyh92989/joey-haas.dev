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

import random
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


# --- choosing the three picks ----------------------------------------------

# Exact IGDB strings, from the collection's own snapshots (spec §4): genres and
# themes as IGDB capitalises them, keywords lower-case. A game matches a mood
# when any of its genres, themes or keywords is in the bucket.
MOOD_BUCKETS: dict[str, frozenset[str]] = {
    "cozy": frozenset({"Simulator", "Kids", "Sandbox", "cute", "animal protagonist"}),
    "story": frozenset(
        {
            "Visual Novel",
            "Point-and-click",
            "Drama",
            "Mystery",
            "Romance",
            "story rich",
            "story driven",
            "choices matter",
            "multiple endings",
            "emotional",
            "love story",
        }
    ),
    "action": frozenset(
        {
            "Shooter",
            "Fighting",
            "Hack and slash/Beat 'em up",
            "Racing",
            "fast paced",
            "metroidvania",
            "hand-to-hand combat",
        }
    ),
    "creepy": frozenset(
        {
            "Horror",
            "Thriller",
            "Survival",
            "psychological horror",
            "survival horror",
            "cosmic horror",
            "zombies",
            "supernatural",
            "dark fantasy",
            "gore",
        }
    ),
    "brainy": frozenset(
        {
            "Puzzle",
            "Strategy",
            "Turn-based strategy (TBS)",
            "Real Time Strategy (RTS)",
            "Tactical",
            "Card & Board Game",
            "deck-building",
            "roguelike deckbuilder",
            "detective",
            "investigation",
            "murder mystery",
            "block puzzle",
        }
    ),
    "chaotic": frozenset(
        {"Arcade", "Party", "Comedy", "roguelite", "roguelike", "dark humor", "funny"}
    ),
}

SKIP_WINDOW = timedelta(days=7)
STALLED_AFTER = timedelta(days=30)
SHORT_HOURS = 6.0

SLOT_LABELS = {
    "best_fit": "Best fit",
    "short_and_sweet": "Short and sweet",
    "overdue_classic": "Overdue classic",
    "waited_longest": "Waited longest",
    "pick_it_back_up": "Pick it back up",
}

# Which shared attributes a reason names first: the most specific kind wins a
# tie. Modes and perspectives are left out -- nearly every game is single
# player, which explains nothing.
REASON_KINDS = ("keyword", "theme", "genre", "creator")


@dataclass(frozen=True)
class PickRequest:
    """What the owner asked for: time window, moods, platforms, rerolled ids."""

    time: str = "any"
    moods: tuple[str, ...] = ()
    platforms: tuple[int, ...] = ()
    exclude: tuple[str, ...] = ()


@dataclass(frozen=True)
class Pick:
    """One card: its slot, the game, its score and why."""

    slot: str
    slot_label: str
    item: PickerItem
    score: float
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class PickResult:
    picks: tuple[Pick, ...]
    candidate_count: int
    profile_size: int


def _mood_strings(item: PickerItem) -> set[str]:
    return {*item.genres, *item.themes, *item.keywords}


def candidates(
    items: list[PickerItem],
    events: list[PickerEvent],
    request: PickRequest,
    now: datetime,
) -> list[PickerItem]:
    """The owned games in the backlog or in progress that the request allows.

    Out: the pinned game, anything marked never, anything skipped in the last
    week, and the reroll's earlier picks. Moods and platforms are hard filters;
    a game with no platform recorded passes any platform filter.
    """
    never = {event.item_id for event in events if event.action == "never"}
    skipped = {
        event.item_id
        for event in events
        if event.action == "skipped" and now - event.created_at <= SKIP_WINDOW
    }
    wanted_strings = set().union(
        *(MOOD_BUCKETS[mood] for mood in request.moods if mood in MOOD_BUCKETS)
    )
    return [
        item
        for item in items
        if item.type == "game"
        and item.owned
        and item.status in ("backlog", "active")
        and not item.pinned
        and item.id not in never
        and item.id not in skipped
        and item.id not in request.exclude
        and (not request.moods or _mood_strings(item) & wanted_strings)
        and (
            not request.platforms
            or item.platform_id is None
            or item.platform_id in request.platforms
        )
    ]


def _month(value: date) -> str:
    return value.strftime("%B %Y")


def _named(reference: PickerItem) -> str:
    """ "Hades ♥" for a favourite, "Celeste, which you rated 9" when rated."""
    if reference.favorite:
        return f"{reference.title} ♥"
    if reference.rating is not None:
        return f"{reference.title}, which you rated {reference.rating}"
    return reference.title


def _overlap_reason(
    item: PickerItem,
    references: list[PickerItem],
    weights: dict[str, float],
    table: dict[tuple[str, str], float],
) -> str | None:
    """Names the liked game sharing the most with this one, and two of those."""

    def shown_pairs(game: PickerItem) -> set[tuple[str, str]]:
        return {pair for pair in attributes(game) if pair[0] in REASON_KINDS}

    mine = shown_pairs(item)
    best: tuple[int, float, PickerItem] | None = None
    for reference in references:
        weight = weights.get(reference.id, 0.0)
        if reference.id == item.id or weight <= 0:
            continue
        shared = mine & shown_pairs(reference)
        if shared and (best is None or (len(shared), weight) > best[:2]):
            best = (len(shared), weight, reference)
    if best is None:
        return None
    reference = best[2]
    shared = sorted(
        mine & shown_pairs(reference),
        key=lambda pair: (
            -table.get(pair, 0.0),
            REASON_KINDS.index(pair[0]),
            pair[1].casefold(),
        ),
    )
    names = " and ".join(value for _, value in shared[:2])
    return f"Shares {names} with {_named(reference)}"


def _length_reason(item: PickerItem) -> str | None:
    hours = item.time_to_beat_hours
    if hours is None:
        return None
    rounded = max(1, round(hours))
    if hours <= SHORT_HOURS:
        return f"About {rounded} h — a short one"
    if hours <= TIME_WINDOWS["evening"][1]:
        return f"About {rounded} h — fits an evening"
    return f"About {rounded} h — a long one"


def _is_stalled(item: PickerItem, events: list[PickerEvent], now: datetime) -> bool:
    """In progress, started a month or more ago, and not touched since."""
    if item.status != "active" or item.started_at is None:
        return False
    if now.date() - item.started_at <= STALLED_AFTER:
        return False
    return not any(
        event.item_id == item.id
        and event.action in ("shown", "pinned")
        and now - event.created_at <= STALLED_AFTER
        for event in events
    )


def recommend(
    items: list[PickerItem],
    events: list[PickerEvent],
    request: PickRequest,
    now: datetime,
    rng: random.Random,
) -> PickResult:
    """Three named picks, none repeated, each with its reasons.

    Best fit is the highest total. Short and sweet is the best game of six
    hours or less, left out when there is none. The third slot is a game in
    progress that has stalled, if any; otherwise the oldest release among the
    games that match the profile at least as well as the median ("Overdue
    classic"), or, once acquired dates carry information, the one that has
    waited longest.
    """
    weights = reference_weights(items)
    references = [item for item in items if item.id in weights]
    table = attribute_table(items, weights)
    profile_size = sum(1 for item in items if item.favorite or item.rating is not None)
    pool = candidates(items, events, request, now)
    if not pool:
        return PickResult(picks=(), candidate_count=0, profile_size=profile_size)

    informative = acquired_dates_informative(
        [item for item in items if item.type == "game" and item.owned]
    )
    today = now.date()
    total_weight = sum(PICKER_WEIGHTS.values())
    scored: dict[str, tuple[float, dict[str, float], PickerItem | None]] = {}
    for item in pool:
        similar_score, similar_to = similarity(item, references, weights)
        terms = {
            "affinity": affinity(item, table),
            "similarity": similar_score,
            "quality": quality(item),
            "length_fit": length_fit(item, request.time),
            "waiting": waiting(item, today, informative),
            "jitter": rng.uniform(0, 100),
        }
        total = sum(PICKER_WEIGHTS[name] * value for name, value in terms.items())
        total = total / total_weight + staleness(item.id, events, now)
        scored[item.id] = (total, terms, similar_to)

    ranked = sorted(pool, key=lambda item: (-scored[item.id][0], item.title))
    chosen: list[tuple[str, PickerItem]] = [("best_fit", ranked[0])]
    taken = {ranked[0].id}

    short = next(
        (
            item
            for item in ranked
            if item.id not in taken
            and item.time_to_beat_hours is not None
            and item.time_to_beat_hours <= SHORT_HOURS
        ),
        None,
    )
    if short is not None:
        chosen.append(("short_and_sweet", short))
        taken.add(short.id)

    stalled = sorted(
        (i for i in pool if i.id not in taken and _is_stalled(i, events, now)),
        key=lambda item: item.started_at,
    )
    if stalled:
        chosen.append(("pick_it_back_up", stalled[0]))
    else:
        affinities = sorted(scored[item.id][1]["affinity"] for item in pool)
        middle = len(affinities) // 2
        median = (
            affinities[middle]
            if len(affinities) % 2
            else (affinities[middle - 1] + affinities[middle]) / 2
        )
        gated = [
            item
            for item in pool
            if item.id not in taken and scored[item.id][1]["affinity"] >= median
        ]
        if informative:
            waited = [item for item in gated if item.acquired_at]
            if waited:
                chosen.append(
                    (
                        "waited_longest",
                        max(
                            waited, key=lambda i: (scored[i.id][1]["waiting"], i.title)
                        ),
                    )
                )
        else:
            released = [item for item in gated if item.release_date]
            if released:
                chosen.append(
                    (
                        "overdue_classic",
                        min(released, key=lambda i: (i.release_date, i.title)),
                    )
                )

    picks = []
    for slot, item in chosen:
        total, _terms, similar_to = scored[item.id]
        reasons = [
            _overlap_reason(item, references, weights, table),
            f"IGDB lists it beside {_named(similar_to)}" if similar_to else None,
            _length_reason(item),
        ]
        if slot == "overdue_classic":
            reasons.insert(0, f"Out since {item.release_date.year}")
        elif slot == "waited_longest":
            reasons.insert(0, f"On the shelf since {_month(item.acquired_at)}")
        elif slot == "pick_it_back_up":
            reasons.insert(
                0, f"Started in {_month(item.started_at)} and not touched since"
            )
        picks.append(
            Pick(
                slot=slot,
                slot_label=SLOT_LABELS[slot],
                item=item,
                score=round(total, 1),
                reasons=tuple(reason for reason in reasons if reason)[:3],
            )
        )
    return PickResult(
        picks=tuple(picks), candidate_count=len(pool), profile_size=profile_size
    )
