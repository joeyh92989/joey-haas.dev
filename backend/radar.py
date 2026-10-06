"""Radar: upcoming physical releases, ranked by the owner's taste. Pure.

The pool arrives as plain views (`radar_load.py` reads them); this module
decides each game's section, scores it against Play Next's profile, writes
its reasons and keeps the top of each section. Taste carries 90 of 100
points and IGDB hype 10 (owner decision, E8c spec §3), plus a bonus when a
pre-order window closes soon. No model call, no database.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

from physical_sources.collapse import Candidate, StoreLine
from picker import (
    PickerItem,
    _named,
    _overlap_reason,
    affinity,
    attribute_table,
    reference_weights,
    similarity,
)

SUGGESTED_CAP = 30
DATED_LATER_CAP = 20
DIGITAL_CAP = 10
# Taste-led: affinity and similarity are picker's 0-100 scales, hype is 0-1.
TASTE_WEIGHTS = {"affinity": 0.55, "similarity": 0.35, "hype": 10.0}
URGENCY_BONUS = 15
URGENCY_DAYS = 30
# Follows at which hype counts in full; IGDB's busiest upcoming games have a
# few hundred.
HYPE_SCALE = 150
MAX_REASONS = 3

KEY_CARD_FORMATS = frozenset({"game_key_card", "code_in_box"})
NEAR_PRECISIONS = frozenset({"day", "month"})
FORMAT_WORDS = {"game_card": "Full game on cartridge", "disc": "Full game on disc"}
# Mirrors sources.igdb.PLATFORM_NAMES (the authority), which this pure module
# cannot import: sources.igdb loads the models.
PLATFORM_WORDS = {130: "Nintendo Switch", 508: "Nintendo Switch 2", 4: "Nintendo 64"}
CURRENCY_SIGNS = {"USD": "$", "EUR": "€", "GBP": "£"}
DIGITAL_NOTE = "no physical edition announced"
SECTIONS = ("suggested", "dated_later", "digital")
CAPS = {
    "suggested": SUGGESTED_CAP,
    "dated_later": DATED_LATER_CAP,
    "digital": DIGITAL_CAP,
}


@dataclass(frozen=True)
class PoolGame:
    """One lane 1-2 candidate with the game data its score needs."""

    candidate: Candidate
    snapshot: dict
    hypes: int | None
    lane: str  # "preorder" | "dated"
    closes_at: date | None  # the soonest open pre-order window


@dataclass(frozen=True)
class Suggestion:
    """A scored game in one of Radar's sections, ready to store."""

    igdb_id: int
    platform_id: int
    title: str
    cover_url: str | None
    release_date: date | None
    release_precision: str | None
    section: str  # "suggested" | "dated_later" | "digital"
    lane: str  # "preorder" | "dated" | "digital"
    score: int
    reasons: tuple[str, ...]
    based_on: tuple[str, ...]
    physical_format: str | None
    format_source: str | None
    format_note: str | None
    listing_ids: tuple[str, ...]
    store_lines: tuple[dict, ...]  # admin-only display data
    hypes: int | None
    snapshot: dict
    # The candidate's release provenance; None for lane 3 (IGDB digital).
    release_source: str | None = None


def section_for(
    candidate: Candidate, lane: str, today: date, include_key_cards: bool
) -> str | None:
    """Where a lane 1-2 candidate goes, or None when it is not on Radar.

    An open pre-order is always Suggested; otherwise the game must come out
    after today, day or month precision being Suggested and year or quarter
    Dated later. A Game-Key Card or code in a box is off unless asked (D7).
    """
    if not include_key_cards and candidate.physical_format in KEY_CARD_FORMATS:
        return None
    upcoming = candidate.release_date is not None and candidate.release_date > today
    if lane != "preorder" and not upcoming:
        return None
    if lane == "preorder" or candidate.release_precision in NEAR_PRECISIONS:
        return "suggested"
    return "dated_later"


def _hype(hypes: int | None) -> float:
    return min(1.0, math.log1p(hypes or 0) / math.log1p(HYPE_SCALE))


def score_game(
    item: PickerItem,
    table: dict[tuple[str, str], float],
    references: list[PickerItem],
    weights: dict[str, float],
    hypes: int | None,
    closes_at: date | None,
    today: date,
) -> tuple[int, PickerItem | None]:
    """The game's score and the reference game it is most like, if any.

    With no references the taste terms are neutral for every game, so hype
    and date decide the order.
    """
    if references:
        near, similar_to = similarity(item, references, weights)
        taste = affinity(item, table)
    else:
        near, similar_to, taste = 0.0, None, 50.0
    value = (
        TASTE_WEIGHTS["affinity"] * taste
        + TASTE_WEIGHTS["similarity"] * near
        + TASTE_WEIGHTS["hype"] * _hype(hypes)
    )
    if closes_at is not None and today <= closes_at <= today + timedelta(
        days=URGENCY_DAYS
    ):
        value += URGENCY_BONUS
    return round(value), similar_to


def _strings(snapshot: dict, key: str) -> tuple[str, ...]:
    """As picker_routes reads a snapshot list: strings, empty entries dropped."""
    values = snapshot.get(key)
    if not isinstance(values, list):
        return ()
    return tuple(str(value) for value in values if value not in (None, ""))


def _picker_item(
    igdb_id: int, title: str, snapshot: dict, platform_id: int, released: date | None
) -> PickerItem:
    """A catalogue game as Play Next's scorer reads one."""
    return PickerItem(
        id=f"igdb:{igdb_id}",
        title=title,
        type="game",
        status="backlog",
        owned=False,
        rating=None,
        favorite=False,
        pinned=False,
        external_id=str(igdb_id),
        year=released.year if released else None,
        cover_url=None,
        platform_id=platform_id,
        platform=PLATFORM_WORDS.get(platform_id),
        creator=None,
        genres=_strings(snapshot, "genres"),
        themes=_strings(snapshot, "themes"),
        keywords=_strings(snapshot, "keywords"),
        game_modes=_strings(snapshot, "game_modes"),
        player_perspectives=_strings(snapshot, "player_perspectives"),
        similar_games=_strings(snapshot, "similar_games"),
        community_score=None,
        time_to_beat_hours=None,
        release_date=released,
        acquired_at=None,
        started_at=None,
    )


def _money(price, currency: str) -> str:
    sign = CURRENCY_SIGNS.get(currency)
    return f"{sign}{price}" if sign else f"{price} {currency}"


def _window_reason(lines: tuple[StoreLine, ...], today: date) -> str | None:
    open_lines = [
        line
        for line in lines
        if line.availability == "preorder"
        and line.preorder_closes_at is not None
        and line.preorder_closes_at >= today
    ]
    if not open_lines:
        return None
    line = min(open_lines, key=lambda entry: entry.preorder_closes_at)
    closes = line.preorder_closes_at
    reason = f"Pre-orders close {closes:%b} {closes.day} at {line.store}"
    return f"{reason} · {_money(line.price, line.currency)}" if line.price else reason


def _date_reason(
    platform_id: int, released: date | None, precision: str | None
) -> str | None:
    if released is None:
        return None
    platform = PLATFORM_WORDS.get(platform_id, "")
    when = f"{released:%b %Y}" if precision in NEAR_PRECISIONS else f"{released.year}"
    return f"{platform} · {when}" if platform else when


def _line_dict(line: StoreLine) -> dict:
    return {
        "store": line.store,
        "price": str(line.price) if line.price is not None else None,
        "currency": line.currency,
        "availability": line.availability,
        "preorder_closes_at": line.preorder_closes_at.isoformat()
        if line.preorder_closes_at
        else None,
        "url": line.url,
    }


def _taste_reasons(
    item: PickerItem,
    similar_to: PickerItem | None,
    references: list[PickerItem],
    weights: dict[str, float],
    table: dict[tuple[str, str], float],
) -> tuple[list[str], tuple[str, ...]]:
    """The similarity and shared-traits reasons, and the reference items
    behind them (similar game first)."""
    reasons: list[str] = []
    based_on: list[str] = []
    if similar_to is not None:
        reasons.append(f"IGDB lists it beside {_named(similar_to)}")
        based_on.append(similar_to.id)
    if references:
        overlap = _overlap_reason(item, references, weights, table)
        if overlap:
            reasons.append(overlap)
            # picker ends the sentence with the reference it chose; a
            # substring test would take "Pikmin" for "Pikmin 4 ♥".
            named = [
                ref for ref in references if overlap.endswith(f" with {_named(ref)}")
            ]
            if named:
                chosen = max(named, key=lambda ref: weights.get(ref.id, 0.0))
                if chosen.id not in based_on:
                    based_on.append(chosen.id)
    return reasons, tuple(based_on)


def build(
    pool: list[PoolGame],
    upcoming: list[dict],
    profile: list[PickerItem],
    excluded: set[int],
    today: date,
    include_key_cards: bool = False,
) -> list[Suggestion]:
    """Radar's sections, best first: Suggested, Dated later, Digital so far.

    `upcoming` holds lane-3 rows in `sources.igdb.parse_upcoming`'s shape; a
    game already in the pool, or in `excluded` (owned, watched, dismissed),
    is dropped from every lane.
    """
    weights = reference_weights(profile)
    references = [item for item in profile if item.id in weights]
    table = attribute_table(profile, weights) if references else {}
    found: list[Suggestion] = []

    # Lane 3 is for games with no physical edition on that platform, so any
    # pool candidate there suppresses it, on Radar or not (a key card left
    # out by the toggle is still a physical edition).
    pool_keys: set[tuple[int, int]] = set()
    for game in pool:
        candidate = game.candidate
        pool_keys.add((candidate.igdb_id, candidate.platform_id))
        if candidate.igdb_id in excluded:
            continue
        section = section_for(candidate, game.lane, today, include_key_cards)
        if section is None:
            continue
        item = _picker_item(
            candidate.igdb_id,
            candidate.title,
            game.snapshot,
            candidate.platform_id,
            candidate.release_date,
        )
        score, similar_to = score_game(
            item, table, references, weights, game.hypes, game.closes_at, today
        )
        reasons, based_on = _taste_reasons(item, similar_to, references, weights, table)
        for extra in (
            _window_reason(candidate.store_lines, today),
            FORMAT_WORDS.get(candidate.physical_format or "")
            if not candidate.format_note
            else candidate.format_note,
            _date_reason(
                candidate.platform_id,
                candidate.release_date,
                candidate.release_precision,
            ),
        ):
            if extra:
                reasons.append(extra)
        found.append(
            Suggestion(
                igdb_id=candidate.igdb_id,
                platform_id=candidate.platform_id,
                title=candidate.title,
                cover_url=candidate.cover_url,
                release_date=candidate.release_date,
                release_precision=candidate.release_precision,
                section=section,
                lane=game.lane,
                score=score,
                reasons=tuple(reasons[:MAX_REASONS]),
                based_on=based_on,
                physical_format=candidate.physical_format,
                format_source=candidate.format_source,
                format_note=candidate.format_note,
                listing_ids=candidate.listing_ids,
                store_lines=tuple(_line_dict(line) for line in candidate.store_lines),
                hypes=game.hypes,
                snapshot=game.snapshot,
                release_source=candidate.release_source,
            )
        )

    for row in upcoming:
        igdb_id = row["igdb_id"]
        if igdb_id in excluded or (igdb_id, row["platform_id"]) in pool_keys:
            continue
        released = (
            date.fromisoformat(row["release_date"]) if row.get("release_date") else None
        )
        item = _picker_item(
            igdb_id, row["title"], row["snapshot"], row["platform_id"], released
        )
        score, similar_to = score_game(
            item, table, references, weights, row.get("hypes"), None, today
        )
        reasons, based_on = _taste_reasons(item, similar_to, references, weights, table)
        for extra in (
            _date_reason(row["platform_id"], released, row.get("release_precision")),
            f"{row['hypes']} people waiting on IGDB" if row.get("hypes") else None,
        ):
            if extra:
                reasons.append(extra)
        found.append(
            Suggestion(
                igdb_id=igdb_id,
                platform_id=row["platform_id"],
                title=row["title"],
                cover_url=row.get("cover_url"),
                release_date=released,
                release_precision=row.get("release_precision"),
                section="digital",
                lane="digital",
                score=score,
                reasons=tuple(reasons[:MAX_REASONS]),
                based_on=based_on,
                physical_format=None,
                format_source=None,
                format_note=DIGITAL_NOTE,
                listing_ids=(),
                store_lines=(),
                hypes=row.get("hypes"),
                snapshot=row["snapshot"],
            )
        )

    ranked: list[Suggestion] = []
    for section in SECTIONS:
        rows = sorted(
            (s for s in found if s.section == section),
            key=lambda s: (-s.score, s.release_date or date.max, s.igdb_id),
        )
        ranked.extend(rows[: CAPS[section]])
    return ranked
