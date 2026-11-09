"""One strategy per item type: what is in the pool, how big it is, its slots.

The engine (picker.recommend, public_picks) is the same for every type; what
differs is answered here, so a new medium is a new entry in STRATEGIES and
nothing else (tests/test_strategies.py holds the registry to every ItemType).

- `pool(item, mode)`: whether the item can be picked. `mode` is "admin" or
  "public". The public pool leaves out what is in hand (Active): a game being
  played leads Tonight as its Continue card. Events (never, skipped,
  rerolled) are the engine's, not the strategy's.
- `size(item)`: (unit, value), or None when unknown.
- `bands`: band -> (low, high] in that unit, high None for the open end.
- `extra_terms`: name -> factor 0-1 the engine multiplies quality by.
- `slots(mode)`: the slot keys the type may label, in pick order.

Pure: no database, no request.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from picker_items import SIZE_BANDS, PickerItem

ADMIN = "admin"
PUBLIC = "public"

Band = tuple[float, float | None]


@dataclass(frozen=True)
class Strategy:
    type: str
    verb: str
    pool: Callable[[PickerItem, str], bool]
    size: Callable[[PickerItem], tuple[str, float] | None]
    bands: Mapping[str, Band]
    slots: Callable[[str], tuple[str, ...]]
    extra_terms: Mapping[str, Callable[[PickerItem], float]] = field(
        default_factory=dict
    )

    def band(self, item: PickerItem) -> str | None:
        """The band the item's size falls in, or None when unknown."""
        measured = self.size(item)
        if measured is None:
            return None
        value = measured[1]
        for name, (_low, high) in self.bands.items():
            if high is None or value <= high:
                return name
        return None


def _statuses(mode: str) -> tuple[str, ...]:
    return ("backlog", "paused") if mode == PUBLIC else ("backlog", "active", "paused")


# --- Game ---------------------------------------------------------------------


def _game_pool(item: PickerItem, mode: str) -> bool:
    return item.owned and not item.pinned and item.status in _statuses(mode)


def _game_size(item: PickerItem) -> tuple[str, float] | None:
    hours = item.time_to_beat_hours
    return None if hours is None else ("hours", float(hours))


def _game_slots(mode: str) -> tuple[str, ...]:
    if mode == PUBLIC:
        return ("best_fit", "change_of_pace", "overdue_classic")
    # Admin's third slot is Overdue classic until acquired dates mean
    # something, then Waited longest; a stalled game takes Pick it back up.
    return (
        "best_fit",
        "change_of_pace",
        "overdue_classic",
        "waited_longest",
        "pick_it_back_up",
    )


GAME = Strategy(
    type="game",
    verb="Play",
    pool=_game_pool,
    size=_game_size,
    bands=SIZE_BANDS,
    slots=_game_slots,
)


# --- Comic --------------------------------------------------------------------

COMIC_BANDS: dict[str, Band] = {
    "short": (0.0, 4.0),
    "medium": (4.0, 12.0),
    "long": (12.0, None),
}


def issues_left(item: PickerItem) -> int | None:
    if item.issues_owned_count is None:
        return None
    return max(0, item.issues_owned_count - (item.issues_read or 0))


def _comic_pool(item: PickerItem, mode: str) -> bool:
    # Following a series alone is not owning it: owned is the copy.
    return (
        item.owned
        and not item.pinned
        and item.status in _statuses(mode)
        and bool(issues_left(item))
    )


def _comic_size(item: PickerItem) -> tuple[str, float] | None:
    left = issues_left(item)
    return None if left is None else ("issues", float(left))


def completeness(item: PickerItem) -> float:
    """Owned over the run's span, 0-1: a run with gaps is a worse read."""
    if not item.issues_owned_count or not item.issues_span:
        return 1.0
    return min(1.0, item.issues_owned_count / item.issues_span)


def _comic_slots(mode: str) -> tuple[str, ...]:
    # Back to it reports reading activity, so it is admin only.
    return ("best_fit",) if mode == PUBLIC else ("best_fit", "back_to_it")


COMIC = Strategy(
    type="comic",
    verb="Read",
    pool=_comic_pool,
    size=_comic_size,
    bands=COMIC_BANDS,
    slots=_comic_slots,
    extra_terms={"completeness": completeness},
)


# --- Movie --------------------------------------------------------------------

# Feature length: short up to 100 minutes, medium up to 140, long beyond
# (the plan's own numbers; the spec gives none).
MOVIE_BANDS: dict[str, Band] = {
    "short": (0.0, 100.0),
    "medium": (100.0, 140.0),
    "long": (140.0, None),
}


def _movie_pool(item: PickerItem, mode: str) -> bool:
    return item.owned and not item.pinned and item.status in _statuses(mode)


def _movie_size(item: PickerItem) -> tuple[str, float] | None:
    minutes = item.runtime_minutes
    return None if minutes is None else ("minutes", float(minutes))


MOVIE = Strategy(
    type="movie",
    verb="Watch",
    pool=_movie_pool,
    size=_movie_size,
    bands=MOVIE_BANDS,
    slots=lambda mode: ("best_fit",),
)


# --- Board game (a stub until BGG is back) --------------------------------------

BOARD_GAME = Strategy(
    type="boardgame",
    verb="Play",
    pool=lambda item, mode: False,
    size=lambda item: None,
    bands={},
    slots=lambda mode: (),
)


STRATEGIES: dict[str, Strategy] = {
    strategy.type: strategy for strategy in (GAME, COMIC, MOVIE, BOARD_GAME)
}


def strategy_for(item_type: str) -> Strategy:
    return STRATEGIES[item_type]
