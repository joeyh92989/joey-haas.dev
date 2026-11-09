"""The recommendation engine: Play Next's picks and the public picks.

Pure. Items and events arrive as plain dataclasses and scored picks leave the
same way; nothing here touches a request or a database, so every rule is tested
on fixtures (the matching.py pattern). Admin jitter is drawn from a
`random.Random` the caller passes in; public jitter is seeded by the day.

One scorer (score_pool) runs over a strategy's pool (strategies.py, one per
media type) and the taste profile (taste.py: facets weighted by favourites,
ratings, finishes and the play record). Picks are kept diverse over their
leading facets (next_diverse). PICKER_WEIGHTS and MOOD_BUCKETS are the tuning
points.

The first half of this module (reference_weights, attribute_table, affinity,
_overlap_reason) is the older attribute profile, which Radar and Discover
still read; it moves to taste.py in a later change.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import cache
from itertools import combinations
from statistics import mean

from facets import FACET_MAP, facet_for, facet_label, facets_of

# The item dataclasses and size bands live in picker_items, a leaf module, so
# taste.py and strategies.py can import them while picker imports those two.
from picker_items import (  # noqa: F401 -- re-exported
    SIZE_BANDS,
    PickerEvent,
    PickerItem,
    PlayRecord,
)
from strategies import ADMIN, PUBLIC, Strategy, strategy_for
from taste import Profile, facet_profile, leading_facet, taste_weights
from taste import affinity as taste_affinity

# Each term scores 0-100; the total is their weighted mean.
PICKER_WEIGHTS = {
    "affinity": 35,
    "similarity": 20,
    "quality": 15,
    "length_fit": 15,
    "waiting": 10,
    "jitter": 5,
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


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _is_reference(item: PickerItem) -> bool:
    """A game that says something about taste. A paused one says nothing
    either way: it was set aside, neither finished nor given up on."""
    if item.status == "paused":
        return False
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
        # The open run's start, as _is_stalled reads it: a replay begun last
        # week has waited a week, not since the first run years ago.
        started = item.run_started_on or item.started_at
        since = started if item.status == "active" and started else item.acquired_at
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


# --- the engine: one scorer, diversity, slots ---------------------------------
#
# Play Next (admin) and the public picks run the same scorer over a strategy's
# pool (strategies.py) and the taste profile (taste.py). What differs between
# them is which terms count and where the jitter comes from (score_pool).

# The IGDB strings each mood was first written in, from the collection's own
# snapshots (spec §4): genres and themes as IGDB capitalises them, keywords
# lower-case. mood_facets maps them through facets.FACET_MAP, so a mood is a
# set of facets and reaches every medium the map bridges.
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

MOOD_KINDS = ("genres", "themes", "keywords")
_MAP_SOURCES = tuple(sorted({source for source, _kind, _value in FACET_MAP}))


@cache
def mood_facets(mood: str, item_type: str = "game") -> frozenset[str]:
    """The facets a mood stands for on one item type: every bucket string
    taken through the facet map as each source and kind would carry it. A
    string the map does not know stays type-scoped, as facets_of scopes it."""
    return frozenset(
        facet_for(item_type, source, kind, value)
        for value in MOOD_BUCKETS.get(mood, ())
        for source in _MAP_SOURCES
        for kind in MOOD_KINDS
    )


def _wanted_facets(moods: tuple[str, ...], item_type: str) -> frozenset[str]:
    return frozenset().union(*(mood_facets(mood, item_type) for mood in moods))


SKIP_WINDOW = timedelta(days=7)
STALLED_AFTER = timedelta(days=30)
# A reason says when its reference was finished while the finish is this fresh.
JUST_FINISHED_WINDOW = timedelta(days=60)

# short_and_sweet is retired (diversity replaced it) but kept for the shown
# events written before it was.
SLOT_LABELS = {
    "best_fit": "Best fit",
    "change_of_pace": "Change of pace",
    "short_and_sweet": "Short and sweet",
    "overdue_classic": "Overdue classic",
    "waited_longest": "Waited longest",
    "pick_it_back_up": "Pick it back up",
    "back_to_it": "Back to it",
}

# Which shared attributes the old overlap reason names first (Radar and
# Discover still use it): the most specific kind wins a tie.
REASON_KINDS = ("keyword", "theme", "genre", "creator")
MAX_REASONS = 3
# How many references a facet sentence names.
FACET_NAMES = 2
# What a reference of another type is called beside its title.
TYPE_SUFFIX = {
    "game": "the game",
    "comic": "the comic",
    "movie": "the film",
    "boardgame": "the board game",
}


@dataclass(frozen=True)
class PickRequest:
    """What the owner asked for: item type, size band, moods, platforms,
    rerolled ids."""

    size: str = "any"
    moods: tuple[str, ...] = ()
    platforms: tuple[int, ...] = ()
    exclude: tuple[str, ...] = ()
    type: str = "game"


@dataclass(frozen=True)
class Pick:
    """One card: its slot (None when no slot applies), the item, its score
    and why."""

    slot: str | None
    slot_label: str | None
    item: PickerItem
    score: float
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class PickResult:
    picks: tuple[Pick, ...]
    candidate_count: int
    profile_size: int


def candidates(
    items: list[PickerItem],
    events: list[PickerEvent],
    request: PickRequest,
    now: datetime,
    mode: str = ADMIN,
) -> list[PickerItem]:
    """The items of the request's type that its strategy's pool holds in this
    mode and the request allows.

    Out: anything marked never, anything skipped in the last week, and the
    reroll's earlier picks. Moods and platforms are hard filters; an item
    with no platform recorded passes any platform filter.
    """
    strategy = strategy_for(request.type)
    never = {event.item_id for event in events if event.action == "never"}
    skipped = {
        event.item_id
        for event in events
        if event.action == "skipped" and now - event.created_at <= SKIP_WINDOW
    }
    wanted = _wanted_facets(request.moods, request.type)
    return [
        item
        for item in items
        if item.type == strategy.type
        and strategy.pool(item, mode)
        and item.id not in never
        and item.id not in skipped
        and item.id not in request.exclude
        and (not request.moods or facets_of(item) & wanted)
        and (
            not request.platforms
            or item.platform_id is None
            or item.platform_id in request.platforms
        )
    ]


def fit(item: PickerItem, size: str, strategy: Strategy) -> float:
    """length_fit over any strategy's size and bands."""
    measured = strategy.size(item)
    if size == "any" or measured is None or size not in strategy.bands:
        return 100.0
    value = measured[1]
    low, high = strategy.bands[size]
    if high is not None and value > high:
        return _clamp(100 * (2 * high - value) / high)
    if low > 0 and value < low:
        return _clamp(100 * (value - low / 2) / (low / 2))
    return 100.0


# Which terms each caller counts. Public lanes leave out waiting (it reads
# the private acquired_at) and draw jitter from the day, so every visitor
# sees one list; Pick for me leaves jitter out too, so its table is stable.
ADMIN_TERMS = tuple(PICKER_WEIGHTS)
PUBLIC_TERMS = ("affinity", "similarity", "quality", "length_fit")
LANE_TERMS = (*PUBLIC_TERMS, "jitter")


@dataclass(frozen=True)
class Scored:
    item: PickerItem
    total: float
    terms: dict[str, float]
    similar_to: PickerItem | None
    leading: str | None


@dataclass(frozen=True)
class Taste:
    """Everything the scorer reads from the profile, built once."""

    weights: dict[str, float]
    profile: Profile
    references: list[PickerItem]


def build_taste(items: list[PickerItem], today: date | None) -> Taste:
    weights = taste_weights(items, today)
    return Taste(
        weights=weights,
        profile=facet_profile(items, weights),
        references=[item for item in items if item.id in weights],
    )


def day_jitter(today: date, item_id: str) -> float:
    """The public jitter: fixed for a day and an item, new the next day."""
    return random.Random(f"{today.isoformat()}:{item_id}").uniform(0, 100)


def score_pool(
    pool: list[PickerItem],
    taste: Taste,
    strategy: Strategy,
    size: str,
    today: date,
    *,
    terms: tuple[str, ...] = ADMIN_TERMS,
    rng: random.Random | None = None,
    informative: bool = False,
    events: list[PickerEvent] | None = None,
    now: datetime | None = None,
) -> list[Scored]:
    """Every pool item scored and ranked, best first (ties on title, id).

    The total is the weighted mean of `terms` (PICKER_WEIGHTS). Similarity is
    IGDB's list, so it counts for games only; quality is scaled by the
    strategy's extra terms (a comic run's completeness). Jitter comes from
    `rng` when given (admin), else from the day. Given `events` and `now`,
    staleness is added (admin only: it reads the owner's events).
    """
    total_weight = sum(PICKER_WEIGHTS[name] for name in terms)
    scored = []
    for item in pool:
        if item.type == "game" and "similarity" in terms:
            similar_score, similar_to = similarity(
                item, taste.references, taste.weights
            )
        else:
            similar_score, similar_to = 0.0, None
        values: dict[str, float] = {}
        for name in terms:
            if name == "affinity":
                values[name] = taste_affinity(item, taste.profile)
            elif name == "similarity":
                values[name] = similar_score
            elif name == "quality":
                factor = 1.0
                for term in strategy.extra_terms.values():
                    factor *= term(item)
                values[name] = quality(item) * factor
            elif name == "length_fit":
                values[name] = fit(item, size, strategy)
            elif name == "waiting":
                values[name] = waiting(item, today, informative)
            elif name == "jitter":
                values[name] = (
                    rng.uniform(0, 100)
                    if rng is not None
                    else day_jitter(today, item.id)
                )
        total = sum(PICKER_WEIGHTS[name] * values[name] for name in terms)
        total /= total_weight
        if events is not None and now is not None:
            total += staleness(item.id, events, now)
        scored.append(
            Scored(
                item=item,
                total=total,
                terms=values,
                similar_to=similar_to,
                leading=leading_facet(item, taste.profile),
            )
        )
    scored.sort(key=lambda entry: (-entry.total, entry.item.title, entry.item.id))
    return scored


def next_diverse(
    ordered: list[Scored],
    chosen: list[Scored],
    last_facets: frozenset[str],
) -> Scored | None:
    """The first entry of `ordered` that keeps the picks diverse.

    Rule 1: its leading facet is not already a pick's, and at most one pick
    leads with a facet the last finish carries. Rule 2 drops the last-finish
    limit, rule 3 the distinct-facet rule. An item with no leading facet is
    distinct from everything.
    """
    taken = {entry.item.id for entry in chosen}
    leads = {entry.leading for entry in chosen if entry.leading}
    echoes = sum(1 for entry in chosen if entry.leading in last_facets)

    def distinct(entry: Scored) -> bool:
        return entry.leading is None or entry.leading not in leads

    def fresh(entry: Scored) -> bool:
        return echoes < 1 or entry.leading not in last_facets

    rules = (
        lambda entry: distinct(entry) and fresh(entry),
        distinct,
        lambda entry: True,
    )
    for rule in rules:
        for entry in ordered:
            if entry.item.id not in taken and rule(entry):
                return entry
    return None


def diversify(
    ranked: list[Scored], count: int, last_facets: frozenset[str]
) -> list[Scored]:
    """Up to `count` picks: the best, then each next best that keeps them
    diverse (next_diverse)."""
    chosen: list[Scored] = []
    while len(chosen) < count:
        entry = next_diverse(ranked, chosen, last_facets)
        if entry is None:
            break
        chosen.append(entry)
    return chosen


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


def last_finish(items: list[PickerItem], item_type: str = "game") -> PickerItem | None:
    """The owned item of this type finished most recently, by its recorded
    finish date."""
    finished = [
        item
        for item in items
        if item.type == item_type
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
    """Names the liked game sharing the most with this one, and two of those.
    Radar's and Discover's reason; Play Next uses facet_reason."""

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


def facet_reason(item: PickerItem, leading: str | None, taste: Taste) -> str | None:
    """ "Post-apocalyptic, across my shelf: Dredge, Waterworld (the film)".

    Names up to FACET_NAMES references liked enough to count (positive
    weight) that carry the item's leading facet, best first; one of another
    type says which. Only titles: never the play record behind a weight.
    The caller's taste decides who can be named, so a public caller passes a
    public-only one.
    """
    if leading is None:
        return None
    carriers = sorted(
        (
            reference
            for reference in taste.references
            if reference.id != item.id
            and taste.weights.get(reference.id, 0.0) > 0
            and leading in facets_of(reference)
        ),
        key=lambda ref: (-taste.weights[ref.id], ref.title, ref.id),
    )[:FACET_NAMES]
    if not carriers:
        return None
    names = ", ".join(
        reference.title
        if reference.type == item.type
        else f"{reference.title} ({TYPE_SUFFIX.get(reference.type, reference.type)})"
        for reference in carriers
    )
    label = facet_label(leading)
    return f"{label[:1].upper()}{label[1:]}, across my shelf: {names}"


def _common_reasons(
    item: PickerItem,
    leading: str | None,
    similar_to: PickerItem | None,
    taste: Taste,
    today: date | None = None,
) -> list[str | None]:
    """The reasons every pick can carry: the facet sentence and IGDB's
    similarity. Size is the card's meta, not a reason."""
    return [
        facet_reason(item, leading, taste),
        f"IGDB lists it beside {_named(similar_to, today)}" if similar_to else None,
    ]


def _is_stalled(item: PickerItem, events: list[PickerEvent], now: datetime) -> bool:
    """In progress, started a month or more ago, and not touched since.

    The start is the open run's when known, so a replay begun yesterday is
    not stalled because the game was first started years ago.
    """
    started = item.run_started_on or item.started_at
    if item.status != "active" or started is None:
        return False
    if now.date() - started <= STALLED_AFTER:
        return False
    return not any(
        event.item_id == item.id
        and event.action in ("shown", "pinned")
        and now - event.created_at <= STALLED_AFTER
        for event in events
    )


def _paused_order(item: PickerItem) -> tuple:
    """Most journal time first (sunk cost is the honest reason), then the
    longest paused, then by title."""
    return (-item.journal_minutes, item.paused_on or date.max, item.title)


def paused_reason(item: PickerItem, today: date) -> str:
    """ "41 h in, paused since August"; hours left out when none are logged."""
    if item.paused_on is None:
        since = "paused"
    elif item.paused_on.year == today.year:
        since = f"paused since {item.paused_on:%B}"
    else:
        since = f"paused since {_month(item.paused_on)}"
    hours = item.journal_minutes // 60
    return f"{hours} h in, {since}" if hours else since[0].upper() + since[1:]


def public_reasons(
    item: PickerItem,
    profile: list[PickerItem],
    today: date | None = None,
    slot: str | None = None,
) -> tuple[str, ...]:
    """A pick's reasons for the public page (showcase spec, D).

    `profile` must hold public rows only: every item a reason can name is
    drawn from it, so a private one is never named. Of the slot reasons only
    Change of pace's is kept, and only against a public last finish -- "On the
    shelf since" is read from acquired_at, which is private; "Started in ...
    not touched since" reports activity; "Out since" means nothing without
    its slot.
    """
    taste = build_taste(profile, today)
    similar_to = (
        similarity(item, taste.references, taste.weights)[1]
        if item.type == "game"
        else None
    )
    leading = leading_facet(item, taste.profile)
    reasons = _common_reasons(item, leading, similar_to, taste, today)
    if slot == "change_of_pace":
        last = last_finish(profile, item.type)
        reasons.insert(0, change_of_pace_reason(item, last) if last else None)
    return tuple(reason for reason in reasons if reason)[:MAX_REASONS]


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


ADMIN_PICKS = 3


def _third_slot(
    ranked: list[Scored],
    chosen: list[Scored],
    last_facets: frozenset[str],
    strategy: Strategy,
    events: list[PickerEvent],
    now: datetime,
    informative: bool,
) -> tuple[str | None, Scored | None]:
    """The admin third pick: a slot's own candidates in the slot's own order,
    kept diverse where they can be; else the next diverse pick, unlabelled."""
    slots = strategy.slots(ADMIN)
    taken = {entry.item.id for entry in chosen}
    open_ = [entry for entry in ranked if entry.item.id not in taken]

    def take(slot: str, ordered: list[Scored]) -> tuple[str, Scored] | None:
        entry = next_diverse(ordered, chosen, last_facets) if ordered else None
        return (slot, entry) if entry else None

    found = None
    if "pick_it_back_up" in slots:
        paused = sorted(
            (e for e in open_ if e.item.status == "paused"),
            key=lambda e: _paused_order(e.item),
        )
        stalled = sorted(
            (e for e in open_ if _is_stalled(e.item, events, now)),
            key=lambda e: e.item.run_started_on or e.item.started_at,
        )
        found = take("pick_it_back_up", paused or stalled)
    if found is None and "back_to_it" in slots:
        found = take("back_to_it", [e for e in open_ if (e.item.issues_read or 0) > 0])
    if found is None and ("waited_longest" in slots or "overdue_classic" in slots):
        median = _median([entry.terms["affinity"] for entry in ranked])
        gated = [e for e in open_ if e.terms["affinity"] >= median]
        if informative and "waited_longest" in slots:
            waited = sorted(
                (e for e in gated if e.item.acquired_at),
                key=lambda e: (-e.terms["waiting"], e.item.title),
            )
            found = take("waited_longest", waited)
        elif not informative and "overdue_classic" in slots:
            released = sorted(
                (e for e in gated if e.item.release_date),
                key=lambda e: (e.item.release_date, e.item.title),
            )
            found = take("overdue_classic", released)
    if found is not None:
        return found
    return None, next_diverse(ranked, chosen, last_facets)


def _slot_reason(
    slot: str | None, item: PickerItem, last: PickerItem | None, today: date
) -> str | None:
    if slot == "change_of_pace" and last is not None:
        return change_of_pace_reason(item, last)
    if slot == "overdue_classic":
        return f"Out since {item.release_date.year}"
    if slot == "waited_longest":
        return f"On the shelf since {_month(item.acquired_at)}"
    if slot == "pick_it_back_up" and item.status == "paused":
        return paused_reason(item, today)
    if slot == "pick_it_back_up":
        return (
            f"Started in {_month(item.run_started_on or item.started_at)} "
            "and not touched since"
        )
    if slot == "back_to_it":
        return f"Read to issue {item.issues_read}"
    return None


def recommend(
    items: list[PickerItem],
    events: list[PickerEvent],
    request: PickRequest,
    now: datetime,
    rng: random.Random,
) -> PickResult:
    """Play Next: up to three picks of the request's type, each with reasons.

    One scorer (score_pool, every term, staleness on). The first pick is Best
    fit. The second is the next diverse pick (next_diverse), labelled Change
    of pace when it differs from the last finish in size band or genre, and
    unlabelled otherwise. The third is a slot's: a paused game (most journal
    time first) or a stalled one, Pick it back up; a comic run already
    started, Back to it; else, among items matching the profile at least as
    well as the median, the one waiting longest once acquired dates carry
    information, or the oldest release (Overdue classic). With none, the
    next diverse pick, unlabelled.
    """
    today = now.date()
    strategy = strategy_for(request.type)
    taste = build_taste(items, today)
    profile_size = sum(1 for item in items if item.favorite or item.rating is not None)
    pool = candidates(items, events, request, now)
    if not pool:
        return PickResult(picks=(), candidate_count=0, profile_size=profile_size)

    informative = acquired_dates_informative(
        [item for item in items if item.type == strategy.type and item.owned]
    )
    ranked = score_pool(
        pool,
        taste,
        strategy,
        request.size,
        today,
        rng=rng,
        informative=informative,
        events=events,
        now=now,
    )
    last = last_finish(items, strategy.type)
    last_facets = facets_of(last) if last else frozenset()
    slots = strategy.slots(ADMIN)

    chosen: list[tuple[str | None, Scored]] = [("best_fit", ranked[0])]
    second = next_diverse(ranked, [ranked[0]], last_facets)
    if second is not None:
        pace = (
            "change_of_pace" in slots
            and last is not None
            and change_of_pace_reason(second.item, last) is not None
        )
        chosen.append(("change_of_pace" if pace else None, second))
        slot, third = _third_slot(
            ranked,
            [entry for _slot, entry in chosen],
            last_facets,
            strategy,
            events,
            now,
            informative,
        )
        if third is not None:
            chosen.append((slot, third))

    picks = []
    for slot, entry in chosen[:ADMIN_PICKS]:
        item = entry.item
        reasons = _common_reasons(item, entry.leading, entry.similar_to, taste, today)
        reasons.insert(0, _slot_reason(slot, item, last, today))
        picks.append(
            Pick(
                slot=slot,
                slot_label=SLOT_LABELS[slot] if slot else None,
                item=item,
                score=round(entry.total, 1),
                reasons=tuple(reason for reason in reasons if reason)[:MAX_REASONS],
            )
        )
    return PickResult(
        picks=tuple(picks), candidate_count=len(pool), profile_size=profile_size
    )


# Pick for me (spec 2026-11-06-pick-for-me): the public spinner ranks on the
# terms that read only public data (PUBLIC_TERMS): waiting reads acquired_at,
# jitter would move the table, and staleness reads the owner's events.
PUBLIC_PICKS = 3
MAX_PUBLIC_MOODS = 2


@dataclass(frozen=True)
class PublicScore:
    """One game's place in one combination: its total and the terms behind it."""

    item_id: str
    score: float
    terms: dict[str, float]


@dataclass(frozen=True)
class PublicPickTable:
    """Every size and mood combination's top picks, and each picked game's
    public reasons, listed once."""

    combos: dict[str, tuple[PublicScore, ...]]
    reasons: dict[str, tuple[str, ...]]


def combo_key(size: str, moods: tuple[str, ...] | list[str]) -> str:
    """`<size>|<moods sorted, joined with +>`; `any|` is no filter at all.

    frontend/src/lib/pickForMe.js builds the same key; keep them in step.
    """
    return f"{size}|{'+'.join(sorted(moods))}"


def combo_keys() -> list[tuple[str, tuple[str, ...]]]:
    """Every (size, moods) the band offers: four sizes by up to two moods."""
    moods = sorted(MOOD_BUCKETS)
    mood_sets: list[tuple[str, ...]] = [()]
    for count in range(1, MAX_PUBLIC_MOODS + 1):
        mood_sets.extend(combinations(moods, count))
    return [(size, mood_set) for size in ("any", *SIZE_BANDS) for mood_set in mood_sets]


def public_pick_table(
    profile: list[PickerItem], pool: list[PickerItem], today: date
) -> PublicPickTable:
    """Pick for me's whole answer, deterministic for a given input.

    `profile` must hold public rows only, as for public_reasons; `pool` is the
    public candidates (the caller drops refused games). Moods are hard filters
    and size is the length-fit term, as in Play Next. Ties break on title,
    then id, so every visitor and every reload sees the same list.
    """
    strategy = strategy_for("game")
    taste = build_taste(profile, today)
    now = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    base = candidates(pool, [], PickRequest(), now, mode=PUBLIC)
    fixed = {
        entry.item.id: entry
        for entry in score_pool(base, taste, strategy, "any", today, terms=PUBLIC_TERMS)
    }
    total_weight = sum(PICKER_WEIGHTS[name] for name in PUBLIC_TERMS)
    combos: dict[str, tuple[PublicScore, ...]] = {}
    picked: dict[str, Scored] = {}
    for size, moods in combo_keys():
        wanted = _wanted_facets(moods, "game")
        scored = []
        for item in base:
            if moods and not facets_of(item) & wanted:
                continue
            terms = {**fixed[item.id].terms, "length_fit": fit(item, size, strategy)}
            total = sum(PICKER_WEIGHTS[name] * terms[name] for name in PUBLIC_TERMS)
            scored.append((round(total / total_weight, 1), item, terms))
        scored.sort(key=lambda entry: (-entry[0], entry[1].title, entry[1].id))
        top = scored[:PUBLIC_PICKS]
        combos[combo_key(size, moods)] = tuple(
            PublicScore(
                item_id=item.id,
                score=score,
                terms={name: round(value, 1) for name, value in terms.items()},
            )
            for score, item, terms in top
        )
        picked.update((item.id, fixed[item.id]) for _score, item, _terms in top)
    reasons = {
        item_id: tuple(
            reason
            for reason in _common_reasons(
                entry.item, entry.leading, entry.similar_to, taste, today
            )
            if reason
        )[:MAX_REASONS]
        for item_id, entry in picked.items()
    }
    return PublicPickTable(combos=combos, reasons=reasons)
