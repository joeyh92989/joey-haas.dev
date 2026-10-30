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

# How big a game is: hours to finish it (IGDB's "normally"), (low, high];
# long has no upper edge. A whole game's length, never a session's.
SIZE_BANDS: dict[str, tuple[float, float | None]] = {
    "short": (0.0, 6.0),
    "medium": (6.0, 15.0),
    "long": (15.0, None),
}

BASE_WEIGHTS = {"favorite": 1.0, "finished": 0.3, "abandoned": -0.5}
FINISHED_FLOOR = 0.1

# A finish adds up to this much, halving every RECENCY_HALF_LIFE days: what I
# just finished says more about my taste now than what I finished years ago.
RECENCY_BONUS = 0.3
RECENCY_HALF_LIFE = 30

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
    finished_at: date | None = None


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


def recency_bonus(finished_at: date | None, today: date | None) -> float:
    """What a finish adds for being recent: RECENCY_BONUS on the day, half of
    it RECENCY_HALF_LIFE days later, next to nothing after a year."""
    if finished_at is None or today is None:
        return 0.0
    days = max(0, (today - finished_at).days)
    return RECENCY_BONUS * 0.5 ** (days / RECENCY_HALF_LIFE)


def reference_weights(
    items: list[PickerItem], today: date | None = None
) -> dict[str, float]:
    """Each reference item's weight: how much it says about the owner's taste.

    Favourite 1.0, finished 0.3, abandoned -0.5 (a finished favourite 1.0),
    plus a rating adjustment measured from the collection's mean rating. A
    finished game never counts for less than 0.1: rating one you finished must
    never make it count for less than leaving it unrated.

    Given `today`, a finished game also gets its recency bonus (Play Next).
    Without it the weights are the plain ones, which Radar and Discover use.
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
            weight += recency_bonus(item.finished_at, today)
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


def size_band(hours: float | None) -> str | None:
    """The SIZE_BANDS key a game's hours fall in, or None when unknown."""
    if hours is None:
        return None
    for band, (_low, high) in SIZE_BANDS.items():
        if high is None or hours <= high:
            return band
    return None


def length_fit(item: PickerItem, size: str) -> float:
    """100 inside the chosen band, falling to 0 at half its low edge and at
    twice its high edge. An unknown length is never held against a game."""
    hours = item.time_to_beat_hours
    if size == "any" or hours is None or size not in SIZE_BANDS:
        return 100.0
    low, high = SIZE_BANDS[size]
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
SHORT_HOURS = SIZE_BANDS["short"][1]
# A reason says when its reference was finished while the finish is this fresh.
JUST_FINISHED_WINDOW = timedelta(days=60)

SLOT_LABELS = {
    "best_fit": "Best fit",
    "change_of_pace": "Change of pace",
    "short_and_sweet": "Short and sweet",
    "overdue_classic": "Overdue classic",
    "waited_longest": "Waited longest",
    "pick_it_back_up": "Pick it back up",
}

# Which shared attributes a reason names first: the most specific kind wins a
# tie. Modes and perspectives are left out -- nearly every game is single
# player, which explains nothing.
REASON_KINDS = ("keyword", "theme", "genre", "creator")
MAX_REASONS = 3


@dataclass(frozen=True)
class PickRequest:
    """What the owner asked for: size band, moods, platforms, rerolled ids."""

    size: str = "any"
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


def _finished_when(finished_at: date | None, today: date | None) -> str | None:
    """ "this week", "last week" or "in August" for a finish in the window."""
    if finished_at is None or today is None:
        return None
    days = (today - finished_at).days
    if days < 0 or timedelta(days=days) > JUST_FINISHED_WINDOW:
        return None
    if days < 7:
        return "this week"
    if days < 14:
        return "last week"
    return f"in {finished_at.strftime('%B')}"


def _named(reference: PickerItem, today: date | None = None) -> str:
    """ "Hades ♥" for a favourite, "Celeste, which I rated 9" when rated, and
    "... and finished this week" when that finish is recent.

    First person everywhere (showcase spec, K9): the owner reads it in admin,
    and the public reads it on What's next (/api/public/next).
    """
    when = (
        _finished_when(reference.finished_at, today)
        if reference.status == "finished"
        else None
    )
    if reference.favorite:
        name = f"{reference.title} ♥"
        return f"{name}, which I finished {when}" if when else name
    if reference.rating is not None:
        rated = f"{reference.title}, which I rated {reference.rating}"
        return f"{rated} and finished {when}" if when else rated
    return f"{reference.title}, which I finished {when}" if when else reference.title


def last_finish(items: list[PickerItem]) -> PickerItem | None:
    """The owned game finished most recently, by its recorded finish date."""
    finished = [
        item
        for item in items
        if item.type == "game"
        and item.owned
        and item.status == "finished"
        and item.finished_at is not None
    ]
    return max(finished, key=lambda i: (i.finished_at, i.title), default=None)


def change_of_pace_reason(item: PickerItem, last: PickerItem) -> str | None:
    """How a game differs from the last finish: its size band first, then its
    genres. None when it differs in neither, or either is unknown."""
    band = size_band(item.time_to_beat_hours)
    last_band = size_band(last.time_to_beat_hours)
    if band and last_band and band != last_band:
        return (
            f"About {round(item.time_to_beat_hours)} h to finish, "
            f"after {round(last.time_to_beat_hours)} h of {last.title}"
        )
    if item.genres and last.genres and not set(item.genres) & set(last.genres):
        return (
            f"Something different from {last.title}: "
            f"{item.genres[0]}, not {last.genres[0]}"
        )
    return None


def _overlap_reason(
    item: PickerItem,
    references: list[PickerItem],
    weights: dict[str, float],
    table: dict[tuple[str, str], float],
    today: date | None = None,
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
    return f"Shares {names} with {_named(reference, today)}"


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


def _common_reasons(
    item: PickerItem,
    references: list[PickerItem],
    weights: dict[str, float],
    table: dict[tuple[str, str], float],
    similar_to: PickerItem | None,
    today: date | None = None,
) -> list[str | None]:
    """The reasons every pick can carry: overlap and IGDB similarity. Size is
    the card's meta, not a reason."""
    return [
        _overlap_reason(item, references, weights, table, today),
        f"IGDB lists it beside {_named(similar_to, today)}" if similar_to else None,
    ]


def public_reasons(
    item: PickerItem,
    profile: list[PickerItem],
    today: date | None = None,
    slot: str | None = None,
) -> tuple[str, ...]:
    """A pick's reasons for the public page (showcase spec, D).

    `profile` must hold public rows only: every game a reason can name is
    drawn from it, so a private game is never named. Of the slot reasons only
    Change of pace's is kept, and only against a public last finish -- "On the
    shelf since" is read from acquired_at, which is private; "Started in ...
    not touched since" reports activity; "Out since" means nothing without
    its slot.
    """
    weights = reference_weights(profile, today)
    references = [entry for entry in profile if entry.id in weights]
    table = attribute_table(profile, weights)
    _score, similar_to = similarity(item, references, weights)
    reasons = _common_reasons(item, references, weights, table, similar_to, today)
    if slot == "change_of_pace":
        last = last_finish(profile)
        reasons.insert(0, change_of_pace_reason(item, last) if last else None)
    return tuple(reason for reason in reasons if reason)[:MAX_REASONS]


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def recommend(
    items: list[PickerItem],
    events: list[PickerEvent],
    request: PickRequest,
    now: datetime,
    rng: random.Random,
) -> PickResult:
    """Three named picks, none repeated, each with its reasons.

    Best fit is the highest total. Change of pace is the best game, among
    those matching the profile at least as well as the median, that differs
    from the last finish in size band or genre; without a dated finish or
    such a game it is Short and sweet, the best game of six hours or less,
    left out when there is none. The third slot is a game in
    progress that has stalled, if any; otherwise the oldest release among the
    games that match the profile at least as well as the median ("Overdue
    classic"), or, once acquired dates carry information, the one that has
    waited longest.
    """
    today = now.date()
    weights = reference_weights(items, today)
    references = [item for item in items if item.id in weights]
    table = attribute_table(items, weights)
    profile_size = sum(1 for item in items if item.favorite or item.rating is not None)
    pool = candidates(items, events, request, now)
    if not pool:
        return PickResult(picks=(), candidate_count=0, profile_size=profile_size)

    informative = acquired_dates_informative(
        [item for item in items if item.type == "game" and item.owned]
    )
    total_weight = sum(PICKER_WEIGHTS.values())
    scored: dict[str, tuple[float, dict[str, float], PickerItem | None]] = {}
    for item in pool:
        similar_score, similar_to = similarity(item, references, weights)
        terms = {
            "affinity": affinity(item, table),
            "similarity": similar_score,
            "quality": quality(item),
            "length_fit": length_fit(item, request.size),
            "waiting": waiting(item, today, informative),
            "jitter": rng.uniform(0, 100),
        }
        total = sum(PICKER_WEIGHTS[name] * value for name, value in terms.items())
        total = total / total_weight + staleness(item.id, events, now)
        scored[item.id] = (total, terms, similar_to)

    ranked = sorted(pool, key=lambda item: (-scored[item.id][0], item.title))
    chosen: list[tuple[str, PickerItem]] = [("best_fit", ranked[0])]
    taken = {ranked[0].id}

    median = _median([scored[item.id][1]["affinity"] for item in pool])
    last = last_finish(items)
    pace = next(
        (
            item
            for item in ranked
            if last is not None
            and item.id not in taken
            and scored[item.id][1]["affinity"] >= median
            and change_of_pace_reason(item, last)
        ),
        None,
    )
    if pace is not None:
        chosen.append(("change_of_pace", pace))
        taken.add(pace.id)
    else:
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
        reasons = _common_reasons(item, references, weights, table, similar_to, today)
        if slot == "change_of_pace":
            reasons.insert(0, change_of_pace_reason(item, last))
        elif slot == "overdue_classic":
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
                reasons=tuple(reason for reason in reasons if reason)[:MAX_REASONS],
            )
        )
    return PickResult(
        picks=tuple(picks), candidate_count=len(pool), profile_size=profile_size
    )
