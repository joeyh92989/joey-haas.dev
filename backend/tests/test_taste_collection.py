"""The engine on the real collection (recommendation engine spec, AC 5 and
AC 6, Task 12).

The fixture is the owner's collection as export_picker_fixture.py wrote it
on 2026-11-09, the day of the audit: titles, ids, covers, notes, platforms
and dates are gone, and every date is days before the export. Two rows
matter by name in the spec, and are found here by their shape, never by
key, so a re-export cannot silently point a test at another game:

- the audit's two-tag game: a backlog game whose only tags are the genres
  Puzzle and Adventure (AC 6);
- the Balan finish: the game finished on the export day, a platformer
  (AC 5).

Re-export when the engine needs newer data; never edit the fixture by hand.
"""

from __future__ import annotations

import json
import random
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import pytest

from facets import TAG_KINDS, facets_of
from picker import PickRequest, build_taste, diversify, recommend, score_pool
from picker_items import PickerItem, PlayRecord
from public_picks import build_public_sets, public_pool
from strategies import ADMIN, strategy_for

EXPORT = Path(__file__).parent / "fixtures" / "picker_collection.json"
# The export day: every *_days_ago in the fixture counts back from it.
EXPORT_DAY = date(2026, 11, 9)
NOW = datetime.combine(EXPORT_DAY, time(20), tzinfo=UTC)

pytestmark = pytest.mark.skipif(not EXPORT.exists(), reason="no collection export")


def _ago(days: int | None) -> date | None:
    return None if days is None else EXPORT_DAY - timedelta(days=days)


def _play(runs: list[dict]) -> PlayRecord | None:
    """picker_routes.play_record over the export's run dicts."""
    if not runs:
        return None
    return PlayRecord(
        hours=sum(run.get("journal_minutes", 0) for run in runs) / 60,
        sessions=sum(run.get("journal_days", 0) for run in runs),
        finished_runs=sum(1 for run in runs if run.get("outcome") == "finished"),
        runs=len(runs),
        bounced=any(
            run.get("journal_days", 0) == 1
            and (
                run.get("outcome") == "abandoned"
                or (run.get("outcome") is None and "paused_days_ago" in run)
            )
            for run in runs
        ),
    )


def to_item(entry: dict) -> PickerItem:
    tags = entry.get("tags", {})
    runs = entry.get("runs", [])
    finishes = [run["finished_days_ago"] for run in runs if "finished_days_ago" in run]
    starts = [run["started_days_ago"] for run in runs if "started_days_ago" in run]
    released = _ago(entry.get("released_days_ago"))
    return PickerItem(
        id=entry["key"],
        title=entry["key"],
        type=entry["type"],
        status=entry["status"],
        owned=entry.get("owned", False),
        rating=entry.get("rating"),
        favorite=entry.get("favorite", False),
        pinned=False,
        external_id=entry["key"],
        year=released.year if released else None,
        cover_url=None,
        platform_id=None,
        platform=None,
        creator=None,
        genres=tuple(tags.get("genres", ())),
        themes=tuple(tags.get("themes", ())),
        keywords=tuple(tags.get("keywords", ())),
        game_modes=tuple(tags.get("game_modes", ())),
        player_perspectives=tuple(tags.get("player_perspectives", ())),
        similar_games=tuple(entry.get("similar", ())),
        community_score=entry.get("community_score"),
        time_to_beat_hours=entry.get("time_to_beat_hours"),
        release_date=released,
        acquired_at=_ago(entry.get("acquired_days_ago")),
        started_at=_ago(max(starts)) if starts else None,
        finished_at=_ago(min(finishes)) if finishes else None,
        source=entry.get("source"),
        tags=tuple((kind, value) for kind in TAG_KINDS for value in tags.get(kind, ())),
        runtime_minutes=entry.get("runtime_minutes"),
        issues_owned_count=entry.get("issues_owned"),
        issues_read=entry.get("issues_read"),
        play=_play(runs),
    )


@pytest.fixture(scope="module")
def collection() -> list[PickerItem]:
    return [to_item(entry) for entry in json.loads(EXPORT.read_text())["items"]]


@pytest.fixture(scope="module")
def two_tag_game(collection) -> PickerItem:
    matches = [
        item
        for item in collection
        if item.status == "backlog"
        and set(item.tags) == {("genres", "Puzzle"), ("genres", "Adventure")}
    ]
    assert len(matches) == 1, "the audit's two-tag game is not in the export"
    return matches[0]


@pytest.fixture(scope="module")
def balan(collection) -> PickerItem:
    matches = [item for item in collection if item.finished_at == EXPORT_DAY]
    assert len(matches) == 1, "the export-day finish is not in the export"
    assert ("genres", "Platform") in matches[0].tags
    return matches[0]


def test_the_export_is_the_audited_collection(collection):
    games = [item for item in collection if item.type == "game"]
    assert len(games) == 107
    assert sum(1 for item in games if item.status == "finished") == 59


def test_a_two_tag_game_does_not_outrank_games_sharing_three_seen_facets(
    collection, two_tag_game
):
    """AC 6, as meant: the audit's top backlog game by the old affinity (two
    tags, no keywords, 94) no longer outranks a game that shares three or
    more facets the profile has seen, as well liked on average as its two.

    The criterion read literally ("below every game sharing three seen
    facets") fails on the real collection, and should: a game whose facets
    are ones I rated low (Arcade, fighting, a keyword from an abandoned game)
    belongs below a game made of two I like. What the audit caught was
    coverage, not taste: two tags read as a perfect match. Measured on the
    2026-11-09 export it moved from first to 34th of 46."""
    taste = build_taste(collection, EXPORT_DAY)
    pool = public_pool(collection, frozenset(), "game")
    ranked = score_pool(
        pool, taste, strategy_for("game"), "any", EXPORT_DAY, terms=("affinity",)
    )
    affinity = {entry.item.id: entry.terms["affinity"] for entry in ranked}

    def mean_weight(item: PickerItem) -> float:
        seen = taste.profile.seen(facets_of(item))
        return sum(taste.profile.weights[facet] for facet in seen) / len(seen)

    own = mean_weight(two_tag_game)
    rich = [
        item
        for item in pool
        if item.id != two_tag_game.id
        and len(taste.profile.seen(facets_of(item))) >= 3
        and mean_weight(item) >= own
    ]

    assert rich, "no backlog game shares three seen facets as well liked"
    outranked = [
        item.id for item in rich if affinity[item.id] <= affinity[two_tag_game.id]
    ]
    assert outranked == []
    # And it is no longer near the top of the pool.
    order = sorted(affinity, key=affinity.__getitem__, reverse=True)
    assert order.index(two_tag_game.id) >= len(order) // 2


def _leading_shape(picks, last_facets):
    leads = [pick.leading for pick in picks if pick.leading]
    echoes = sum(1 for pick in picks if pick.leading in last_facets)
    return leads, echoes


@pytest.mark.parametrize("seed", range(5))
def test_after_the_platformer_admin_picks_differ(collection, balan, seed):
    """AC 5 on the real collection, admin Play Next: at most one of the three
    picks leads with a facet of the platformer just finished, and no two
    picks lead with the same facet."""
    result = recommend(
        collection, [], PickRequest(type="game"), NOW, random.Random(seed)
    )
    taste = build_taste(collection, EXPORT_DAY)
    by_id = {
        entry.item.id: entry
        for entry in score_pool(
            [pick.item for pick in result.picks],
            taste,
            strategy_for("game"),
            "any",
            EXPORT_DAY,
        )
    }
    picks = [by_id[pick.item.id] for pick in result.picks]
    leads, echoes = _leading_shape(picks, facets_of(balan))

    assert len(picks) == 3
    assert echoes <= 1
    assert len(leads) == len(set(leads))


def test_after_the_platformer_the_public_picks_differ(collection, balan):
    """AC 5 on the live public set, with the whole collection public."""
    taste = build_taste(collection, EXPORT_DAY)
    picks = build_public_sets(collection, frozenset(), EXPORT_DAY)["game"]
    ranked = {
        entry.item.id: entry
        for entry in score_pool(
            [pick.item for pick in picks],
            taste,
            strategy_for("game"),
            "any",
            EXPORT_DAY,
        )
    }
    leads, echoes = _leading_shape(
        [ranked[pick.item.id] for pick in picks], facets_of(balan)
    )

    assert len(picks) == 3
    assert echoes <= 1
    assert len(leads) == len(set(leads))


def test_diversity_holds_down_the_whole_ranking(collection, balan):
    """The rule, not the luck of the top three: diversify over the full
    admin pool still keeps one echo of the last finish at most."""
    taste = build_taste(collection, EXPORT_DAY)
    pool = [
        item
        for item in collection
        if item.type == "game" and strategy_for("game").pool(item, ADMIN)
    ]
    ranked = score_pool(pool, taste, strategy_for("game"), "any", EXPORT_DAY)
    picks = diversify(ranked, 3, facets_of(balan))
    leads, echoes = _leading_shape(picks, facets_of(balan))

    assert echoes <= 1
    assert len(leads) == len(set(leads))
