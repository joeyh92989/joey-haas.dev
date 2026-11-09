"""Play Next's plain inputs: an item, its play record, a pick event, size bands.

A leaf module with no imports from the engine, so picker.py, taste.py and
strategies.py can all read it without a cycle. picker re-exports every name,
so `from picker import PickerItem` keeps working.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

# How big a game is: hours to finish it (IGDB's "normally"), (low, high];
# long has no upper edge. A whole game's length, never a session's.
SIZE_BANDS: dict[str, tuple[float, float | None]] = {
    "short": (0.0, 6.0),
    "medium": (6.0, 15.0),
    "long": (15.0, None),
}


@dataclass(frozen=True)
class PlayRecord:
    """How much an item was actually played, from its runs and journal.

    `bounced` is a run that ended paused or abandoned after exactly one
    journal day. Weight only: no reason ever mentions any of it.
    """

    hours: float = 0.0
    sessions: int = 0
    finished_runs: int = 0
    runs: int = 0
    bounced: bool = False


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
    # The open run's pause date and the journal minutes logged in that run;
    # only a paused game carries them (picker_routes reads its playthroughs).
    paused_on: date | None = None
    journal_minutes: int = 0
    # The open run's own start: a replay's, where started_at is the first
    # run's. None outside Play Next, or when the run has no start date.
    run_started_on: date | None = None
    # The recommendation engine's inputs (taste.py, strategies.py). Defaulted
    # so Radar's catalogue items, which have none of them, still build.
    source: str | None = None
    # Every source tag as (snapshot key, string): facets.facets_of reads them.
    tags: tuple[tuple[str, str], ...] = ()
    issues_owned_count: int | None = None
    issues_read: int | None = None
    # First to last owned issue, inclusive: owned / span is the run's
    # completeness, which a gappy run is marked down for.
    issues_span: int | None = None
    runtime_minutes: float | None = None
    play: PlayRecord | None = None


@dataclass(frozen=True)
class PickerEvent:
    """A pick event: shown, skipped, never or pinned, with an aware time."""

    item_id: str
    action: str
    created_at: datetime
