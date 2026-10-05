"""What's next: pending Discover picks and Radar rows, sectioned as a store
visit reads them. Pure: no FastAPI, no SQLAlchemy (tests/test_physical_imports.py).

One sectioning authority for `/spine/next` (public=True) and
`/admin/store-list` (public=False), so the two pages cannot disagree about
a section except by one rule: in public mode only a registry date counts,
because a store's date is store data (Spine Next spec, K5, S4). The rules
were AdminStoreList.jsx's radarSection, buildList and periodEnd.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta

from picker import PickerItem, attribute_table, reference_weights, similarity
from radar import KEY_CARD_FORMATS, NEAR_PRECISIONS, _picker_item, _taste_reasons

PREORDER_DAYS = 90
NEW_DAYS = 30
LATER_CAP = 12
NOT_ON_CARTRIDGE_CAP = 12
FULL_CARTRIDGE = "game_card"
# Release sources whose date may be shown publicly. A store's date is store
# data; IGDB's first date is for any platform. "igdb_platform" joins this
# set only if E21 shows the registry leaves most rows undated (spec, B9).
PUBLIC_DATE_SOURCES = frozenset({"registry"})
SECTIONS = ("buy_now", "preorders", "later", "not_on_cartridge")


@dataclass(frozen=True)
class NextCandidate:
    """A pending suggestion, as sectioning reads it. `payload` is the
    caller's row, carried through untouched."""

    kind: str  # "discover" | "radar"
    igdb_id: str
    platform_id: int
    platform: str | None
    title: str
    physical_format: str | None
    lane: str | None  # Radar's "preorder" | "dated" | "digital"; None for Discover
    release_date: date | None
    release_precision: str | None
    release_source: str | None
    score: int
    rank: int | None = None  # Discover's batch order
    payload: object = None


@dataclass(frozen=True)
class NextEntry:
    """A candidate placed in a section, with what the page shows about it."""

    candidate: NextCandidate
    top_pick: bool
    new: bool
    date_shown: date | None


def period_end(released: date, precision: str | None) -> date:
    """The last day of a release's period. A month, quarter or year is stored
    as the period's first day, so a game dated that way is not out until the
    whole period has ended. No precision means a day."""
    if precision == "month":
        return released.replace(
            day=calendar.monthrange(released.year, released.month)[1]
        )
    if precision == "quarter":
        month = ((released.month - 1) // 3 + 1) * 3
        return date(released.year, month, calendar.monthrange(released.year, month)[1])
    if precision == "year":
        return date(released.year, 12, 31)
    return released


def _usable_date(candidate: NextCandidate, public: bool) -> date | None:
    """The date sectioning may use: any in admin mode, a public one in public."""
    if public and candidate.release_source not in PUBLIC_DATE_SOURCES:
        return None
    return candidate.release_date


def _released(when: date | None, precision: str | None, today: date) -> bool:
    return when is not None and period_end(when, precision) <= today


def _is_new(candidate: NextCandidate, today: date) -> bool:
    """A full cartridge out within the last NEW_DAYS, from any known date:
    a boolean leaks nothing a date would."""
    when = candidate.release_date
    return (
        candidate.physical_format == FULL_CARTRIDGE
        and _released(when, candidate.release_precision, today)
        and (today - when).days <= NEW_DAYS
    )


def _best_first(candidate: NextCandidate) -> tuple:
    return (
        candidate.rank if candidate.rank is not None else 99,
        -candidate.score,
        candidate.title,
        candidate.platform_id,
        candidate.igdb_id,
    )


def sections(
    candidates: list[NextCandidate], today: date, *, public: bool
) -> dict[str, list[NextEntry]]:
    """Discover picks and Radar rows as What's next's sections.

    Buy now: released Discover picks (top picks, batch order), then released
    full cartridges, best first. Pre-orders: day- or month-dated cartridges
    within PREORDER_DAYS, soonest first. Later: the rest of the dated
    cartridges, soonest first, then undated ones, capped. Not on cartridge:
    digital-only, Game-Key Card and code-in-a-box rows, best first, capped.
    One row per (game, platform), Discover first; an unreleased Discover
    pick and a row of unknown format are left out.
    """
    out: dict[str, list[NextEntry]] = {key: [] for key in SECTIONS}
    seen: set[tuple[str, int]] = set()
    dated_later: list[tuple[date, NextEntry]] = []
    undated: list[NextEntry] = []
    preorders: list[tuple[date, NextEntry]] = []

    for candidate in sorted(
        (c for c in candidates if c.kind == "discover"), key=_best_first
    ):
        key = (candidate.igdb_id, candidate.platform_id)
        if key in seen or not _released(
            candidate.release_date, candidate.release_precision, today
        ):
            continue
        seen.add(key)
        out["buy_now"].append(
            NextEntry(
                candidate,
                top_pick=True,
                new=_is_new(candidate, today),
                date_shown=None if public else candidate.release_date,
            )
        )

    for candidate in sorted(
        (c for c in candidates if c.kind == "radar"), key=_best_first
    ):
        key = (candidate.igdb_id, candidate.platform_id)
        if key in seen:
            continue
        if candidate.lane == "digital" or candidate.physical_format in KEY_CARD_FORMATS:
            seen.add(key)
            out["not_on_cartridge"].append(NextEntry(candidate, False, False, None))
            continue
        if candidate.physical_format != FULL_CARTRIDGE:
            continue
        seen.add(key)
        when = _usable_date(candidate, public)
        precision = candidate.release_precision
        if when is None:
            undated.append(NextEntry(candidate, False, False, None))
        elif _released(when, precision, today):
            out["buy_now"].append(
                NextEntry(candidate, False, _is_new(candidate, today), when)
            )
        elif (
            precision in NEAR_PRECISIONS or precision is None
        ) and when <= today + timedelta(days=PREORDER_DAYS):
            preorders.append((when, NextEntry(candidate, False, False, when)))
        else:
            dated_later.append((when, NextEntry(candidate, False, False, when)))

    out["preorders"] = [entry for _, entry in sorted(preorders, key=lambda p: p[0])]
    later = [entry for _, entry in sorted(dated_later, key=lambda p: p[0])] + undated
    out["later"] = later[:LATER_CAP]
    out["not_on_cartridge"] = out["not_on_cartridge"][:NOT_ON_CARTRIDGE_CAP]
    return out


MAX_PUBLIC_REASONS = 2
_SECOND_PERSON = re.compile(r"\b(you|your|yours)\b", re.IGNORECASE)


@dataclass(frozen=True)
class PublicTaste:
    """Play Next's profile built from public games only, plus what a public
    reason must not name. Every game a rebuilt reason can name is drawn from
    `references`, so a private game is never named (as picker.public_reasons)."""

    weights: dict[str, float]
    references: list[PickerItem]
    table: dict[tuple[str, str], float]
    public_ids: frozenset[str]
    private_titles: tuple[str, ...]
    shelf_genres: frozenset[str]


def public_taste(
    public_profile: list[PickerItem], private_titles: list[str]
) -> PublicTaste:
    """The public profile's weights, references and attribute table, with the
    private titles a reason must not name."""
    weights = reference_weights(public_profile)
    references = [item for item in public_profile if item.id in weights]
    return PublicTaste(
        weights=weights,
        references=references,
        table=attribute_table(public_profile, weights) if references else {},
        public_ids=frozenset(item.id for item in public_profile),
        private_titles=tuple(title for title in private_titles if title.strip()),
        shelf_genres=frozenset(g for item in public_profile for g in item.genres),
    )


def catalogue_item(
    igdb_id: str, title: str, snapshot: dict, platform_id: int, released: date | None
) -> PickerItem:
    """A pending suggestion as the scorer reads it, from its stored snapshot."""
    return _picker_item(igdb_id, title, snapshot or {}, platform_id, released)


def _names_private_game(text: str, taste: PublicTaste) -> bool:
    return any(
        re.search(rf"(?<!\w){re.escape(title)}(?!\w)", text, re.IGNORECASE)
        for title in taste.private_titles
    )


def _model_text_allowed(
    stored: list[str], based_on: list[str], taste: PublicTaste
) -> bool:
    """Discover's model text may be public when every game it cites is
    public, it names no private game it did not cite, and it is first person."""
    text = "\n".join(stored)
    return (
        bool(stored)
        and all(ref in taste.public_ids for ref in based_on)
        and not _names_private_game(text, taste)
        and not _SECOND_PERSON.search(text)
    )


def _rebuilt(item: PickerItem, taste: PublicTaste) -> list[str]:
    """Radar's similarity and shared-traits reasons over public games only:
    never the stored text, which holds store windows and prices."""
    if not taste.references:
        return []
    _score, similar_to = similarity(item, taste.references, taste.weights)
    reasons, _based_on = _taste_reasons(
        item, similar_to, taste.references, taste.weights, taste.table
    )
    return [reason for reason in reasons if not _SECOND_PERSON.search(reason)]


def _genre_line(item: PickerItem, taste: PublicTaste) -> str | None:
    shared = [genre for genre in item.genres if genre in taste.shelf_genres][:2]
    if not shared:
        return None
    return f"Shares {' and '.join(shared)} with games on my shelf"


def public_reasons_for(
    kind: str,
    stored: list[str],
    model_written: bool,
    based_on: list[str],
    item: PickerItem,
    taste: PublicTaste,
) -> list[str]:
    """At most two first-person reasons naming public games only (spec, B8):
    Discover's model text when it passes the gate, else reasons rebuilt over
    public games, else one genre line, else none."""
    if (
        kind == "discover"
        and model_written
        and _model_text_allowed(stored, based_on, taste)
    ):
        reasons = list(stored)
    else:
        reasons = _rebuilt(item, taste)
    if not reasons:
        line = _genre_line(item, taste)
        reasons = [line] if line else []
    return reasons[:MAX_PUBLIC_REASONS]
