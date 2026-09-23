"""Play Next scoring. Pure: plain dataclasses in, numbers out, no database."""

import random
from datetime import UTC, date, datetime, timedelta

import pytest

from picker import (
    MOOD_BUCKETS,
    PICKER_WEIGHTS,
    PickerEvent,
    PickerItem,
    PickRequest,
    acquired_dates_informative,
    affinity,
    attribute_table,
    attributes,
    candidates,
    length_fit,
    quality,
    recommend,
    reference_weights,
    similarity,
    staleness,
    waiting,
)

NOW = datetime(2026, 9, 23, 20, 0, tzinfo=UTC)
TODAY = NOW.date()


def item(id: str, **fields) -> PickerItem:
    base = dict(
        id=id,
        title=id.title(),
        type="game",
        status="backlog",
        owned=True,
        rating=None,
        favorite=False,
        pinned=False,
        external_id=None,
        year=None,
        cover_url=None,
        platform_id=None,
        platform=None,
        creator=None,
        genres=(),
        themes=(),
        keywords=(),
        game_modes=(),
        player_perspectives=(),
        similar_games=(),
        community_score=None,
        time_to_beat_hours=None,
        release_date=None,
        acquired_at=None,
        started_at=None,
    )
    return PickerItem(**{**base, **fields})


def shown(item_id: str, at: datetime) -> PickerEvent:
    return PickerEvent(item_id=item_id, action="shown", created_at=at)


def test_the_default_weights_are_the_spec_s():
    assert PICKER_WEIGHTS == {
        "affinity": 35,
        "similarity": 20,
        "quality": 15,
        "length_fit": 15,
        "waiting": 10,
        "jitter": 5,
    }


# --- reference weights ------------------------------------------------------


def test_base_weights_without_ratings():
    weights = reference_weights(
        [
            item("fav", favorite=True),
            item("done", status="finished"),
            item("quit", status="abandoned"),
            item("fav_done", favorite=True, status="finished"),
            item("waiting"),
        ]
    )
    assert weights == {"fav": 1.0, "done": 0.3, "quit": -0.5, "fav_done": 1.0}


def test_ratings_adjust_around_the_collection_mean():
    # Mean of 6, 8 and 4 is 6.
    weights = reference_weights(
        [
            item("mean", rating=6, status="finished"),
            item("high", rating=8, status="finished"),
            item("low", rating=4, status="abandoned"),
        ]
    )
    assert weights["mean"] == pytest.approx(0.3)
    # (8 - 6) / (10 - 6) = 0.5 on top of 0.3.
    assert weights["high"] == pytest.approx(0.8)
    # (4 - 6) / 6 = -1/3 on top of -0.5.
    assert weights["low"] == pytest.approx(-0.5 - 1 / 3)


def test_a_rated_backlog_game_counts_by_its_rating_alone():
    weights = reference_weights([item("a", rating=9), item("b", rating=5)])
    # Mean 7: a is (9 - 7) / 3 above, b is (5 - 7) / 7 below.
    assert weights["a"] == pytest.approx(2 / 3)
    assert weights["b"] == pytest.approx(-2 / 7)


def test_rating_a_finished_game_never_makes_it_count_for_less_than_0_1():
    weights = reference_weights(
        [item("hated", rating=1, status="finished"), item("loved", rating=10)]
    )
    assert weights["hated"] == pytest.approx(0.1)


# --- attributes and affinity ------------------------------------------------


def test_attributes_include_the_developer():
    game = item(
        "g",
        genres=("Puzzle",),
        themes=("Mystery",),
        keywords=("detective",),
        game_modes=("Single player",),
        player_perspectives=("First person",),
        creator="Mobius Digital",
    )
    assert attributes(game) == {
        ("genre", "Puzzle"),
        ("theme", "Mystery"),
        ("keyword", "detective"),
        ("mode", "Single player"),
        ("perspective", "First person"),
        ("creator", "Mobius Digital"),
    }


def test_the_attribute_table_is_the_mean_weight_of_its_carriers():
    items = [
        item("fav", favorite=True, genres=("Puzzle",)),
        item("done", status="finished", genres=("Puzzle", "Horror")),
    ]
    table = attribute_table(items, reference_weights(items))
    assert table[("genre", "Puzzle")] == pytest.approx(0.65)
    assert table[("genre", "Horror")] == pytest.approx(0.3)


def test_affinity_averages_the_candidate_s_attributes():
    table = {("genre", "Puzzle"): 0.6, ("genre", "Horror"): -0.2}
    # (0.6 + -0.2 + 0 for the unknown) / 3 = 0.1333; 50 + 50 * that.
    candidate = item("c", genres=("Puzzle", "Horror", "Unknown"))
    assert affinity(candidate, table) == pytest.approx(50 + 50 * 0.4 / 3)


def test_affinity_is_neutral_without_attributes_and_clamped():
    assert affinity(item("bare"), {}) == 50
    assert affinity(item("x", genres=("Great",)), {("genre", "Great"): 1.5}) == 100


# --- similarity and quality --------------------------------------------------


def test_similarity_follows_a_link_either_way():
    loved = item("loved", favorite=True, external_id="100", similar_games=("200",))
    forward = item("f", external_id="200")
    backward = item("b", external_id="300", similar_games=("100",))
    weights = reference_weights([loved])

    assert similarity(forward, [loved], weights) == (100.0, loved)
    assert similarity(backward, [loved], weights) == (100.0, loved)
    assert similarity(item("none", external_id="999"), [loved], weights) == (0.0, None)


def test_similarity_to_a_disliked_game_scores_nothing():
    disliked = item("d", status="abandoned", external_id="1", similar_games=("2",))
    candidate = item("c", external_id="2")
    score, _ = similarity(candidate, [disliked], reference_weights([disliked]))
    assert score == 0.0


def test_quality_is_the_community_score_or_neutral():
    assert quality(item("q", community_score=83.4)) == pytest.approx(83.4)
    assert quality(item("q")) == 50


# --- length ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("hours", "time", "expected"),
    [
        (None, "evening", 100),
        (40, "any", 100),
        (3, "quick", 100),
        (9, "quick", 50),  # halfway from 6 to 12
        (12, "quick", 0),
        (10, "evening", 100),
        (4.5, "evening", 50),  # halfway from 3 to 6
        (3, "evening", 0),
        (22.5, "evening", 50),  # halfway from 15 to 30
        (80, "long", 100),  # no upper edge
        (11.25, "long", 50),  # halfway from 7.5 to 15
    ],
)
def test_length_fit(hours, time, expected):
    assert length_fit(item("l", time_to_beat_hours=hours), time) == pytest.approx(
        expected
    )


# --- waiting and staleness --------------------------------------------------


def test_acquired_dates_carry_information_once_they_span_90_days():
    start = date(2026, 1, 1)
    spread_89 = [
        item("a", acquired_at=start),
        item("b", acquired_at=start + timedelta(days=89)),
    ]
    spread_90 = spread_89 + [item("c", acquired_at=start + timedelta(days=90))]
    assert acquired_dates_informative(spread_89) is False
    assert acquired_dates_informative(spread_90) is True


def test_waiting_uses_acquired_dates_when_they_mean_something():
    game = item("w", acquired_at=TODAY - timedelta(days=73))
    assert waiting(game, TODAY, informative=True) == pytest.approx(20)
    playing = item(
        "p",
        status="active",
        acquired_at=TODAY - timedelta(days=365),
        started_at=TODAY - timedelta(days=146),
    )
    assert waiting(playing, TODAY, informative=True) == pytest.approx(40)


def test_waiting_falls_back_to_release_age():
    game = item(
        "old",
        release_date=TODAY - timedelta(days=1825),
        acquired_at=TODAY,
    )
    assert waiting(game, TODAY, informative=False) == pytest.approx(50)
    assert waiting(item("unknown"), TODAY, informative=False) == 0
    future = item("soon", release_date=TODAY + timedelta(days=30))
    assert waiting(future, TODAY, informative=False) == 0


def test_staleness_counts_distinct_days_not_showings():
    same_day = [shown("g", NOW - timedelta(hours=h)) for h in (1, 2, 3)]
    assert staleness("g", same_day, NOW) == -15

    four_days = [shown("g", NOW - timedelta(days=d)) for d in (1, 2, 3, 4)]
    assert staleness("g", four_days, NOW) == -45

    assert staleness("g", [shown("g", NOW - timedelta(days=15))], NOW) == 0
    assert staleness("other", same_day, NOW) == 0


# --- moods -------------------------------------------------------------------

# The spec's table, verbatim: the strings are IGDB's, copied from the
# collection's own snapshots, and a typo would silently match nothing.
SPEC_BUCKETS = {
    "cozy": {"Simulator", "Kids", "Sandbox", "cute", "animal protagonist"},
    "story": {
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
    },
    "action": {
        "Shooter",
        "Fighting",
        "Hack and slash/Beat 'em up",
        "Racing",
        "fast paced",
        "metroidvania",
        "hand-to-hand combat",
    },
    "creepy": {
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
    },
    "brainy": {
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
    },
    "chaotic": {
        "Arcade",
        "Party",
        "Comedy",
        "roguelite",
        "roguelike",
        "dark humor",
        "funny",
    },
}


def test_the_mood_buckets_are_the_spec_s_exact_strings():
    assert {
        mood: set(strings) for mood, strings in MOOD_BUCKETS.items()
    } == SPEC_BUCKETS


# --- candidates --------------------------------------------------------------


def _ids(games):
    return {game.id for game in games}


def test_candidates_are_the_owned_backlog_and_games_in_progress():
    items = [
        item("backlog"),
        item("playing", status="active"),
        item("done", status="finished"),
        item("quit", status="abandoned"),
        item("wanted", owned=False),
        item("pinned", pinned=True),
        item("film", type="movie"),
    ]
    assert _ids(candidates(items, [], PickRequest(), NOW)) == {"backlog", "playing"}


def test_never_recent_skips_and_the_exclude_list_remove_games():
    items = [
        item("never"),
        item("skipped"),
        item("old_skip"),
        item("rerolled"),
        item("ok"),
    ]
    events = [
        PickerEvent("never", "never", NOW - timedelta(days=200)),
        PickerEvent("skipped", "skipped", NOW - timedelta(days=6)),
        PickerEvent("old_skip", "skipped", NOW - timedelta(days=8)),
    ]
    request = PickRequest(exclude=("rerolled",))
    assert _ids(candidates(items, events, request, NOW)) == {"old_skip", "ok"}


def test_moods_are_hard_filters_matched_across_genres_themes_and_keywords():
    items = [
        item("puzzle", genres=("Puzzle",)),
        item("horror", themes=("Horror",)),
        item("deck", keywords=("deck-building",)),
        item("racer", genres=("Racing",)),
    ]
    brainy = PickRequest(moods=("brainy",))
    assert _ids(candidates(items, [], brainy, NOW)) == {"puzzle", "deck"}
    # Several moods widen the filter: any of them.
    both = PickRequest(moods=("brainy", "creepy"))
    assert _ids(candidates(items, [], both, NOW)) == {"puzzle", "deck", "horror"}


def test_a_game_without_a_platform_passes_any_platform_filter():
    items = [item("s2", platform_id=508), item("s1", platform_id=130), item("unset")]
    request = PickRequest(platforms=(508,))
    assert _ids(candidates(items, [], request, NOW)) == {"s2", "unset"}


# --- recommend ---------------------------------------------------------------


def shelf() -> list[PickerItem]:
    """A small shelf: a profile of four games and six candidates."""
    return [
        item(
            "hades",
            title="Hades",
            status="finished",
            favorite=True,
            rating=10,
            external_id="100",
            similar_games=("200",),
            genres=("Role-playing (RPG)", "Indie"),
            keywords=("roguelike",),
            themes=("Action",),
        ),
        item(
            "inscryption",
            title="Inscryption",
            status="finished",
            rating=9,
            genres=("Puzzle", "Card & Board Game"),
            keywords=("deck-building",),
            themes=("Horror",),
        ),
        item("fifa", title="FIFA", status="abandoned", rating=2, genres=("Sport",)),
        item("mid", title="Mid", status="finished", rating=6, genres=("Racing",)),
        item(
            "dead_cells",
            title="Dead Cells",
            external_id="200",
            genres=("Indie", "Platform"),
            keywords=("roguelike",),
            time_to_beat_hours=18.0,
            community_score=88.0,
            release_date=date(2018, 8, 7),
        ),
        item(
            "slay",
            title="Slay the Spire",
            genres=("Card & Board Game", "Indie"),
            keywords=("deck-building",),
            time_to_beat_hours=4.0,
            community_score=90.0,
            release_date=date(2019, 1, 23),
        ),
        item(
            "old_puzzle",
            title="Old Puzzle",
            genres=("Puzzle",),
            themes=("Horror",),
            time_to_beat_hours=9.0,
            release_date=date(2003, 5, 1),
        ),
        item(
            "football",
            title="Football",
            genres=("Sport",),
            time_to_beat_hours=3.0,
            release_date=date(2024, 1, 1),
        ),
        item("unknown", title="Unknown", release_date=date(2020, 1, 1)),
        item("ok", title="Ok", genres=("Racing",), release_date=date(2022, 1, 1)),
    ]


def test_recommend_is_deterministic_for_a_seed():
    first = recommend(shelf(), [], PickRequest(), NOW, random.Random(7))
    again = recommend(shelf(), [], PickRequest(), NOW, random.Random(7))
    assert [p.item.id for p in first.picks] == [p.item.id for p in again.picks]


def test_three_named_slots_and_no_repeats():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))

    slots = [pick.slot for pick in result.picks]
    assert slots == ["best_fit", "short_and_sweet", "overdue_classic"]
    assert [pick.slot_label for pick in result.picks] == [
        "Best fit",
        "Short and sweet",
        "Overdue classic",
    ]
    assert len({pick.item.id for pick in result.picks}) == 3
    assert result.candidate_count == 6
    # Rated or favourite, not merely finished: Hades, Inscryption, FIFA, Mid.
    assert result.profile_size == 4


def test_best_fit_is_the_game_that_matches_the_profile():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))
    # Dead Cells shares roguelike and Indie with the favourite, and IGDB lists
    # it beside Hades.
    assert result.picks[0].item.id == "dead_cells"


def test_short_and_sweet_is_six_hours_or_less_and_omitted_without_one():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))
    short = next(p for p in result.picks if p.slot == "short_and_sweet")
    assert short.item.time_to_beat_hours <= 6

    long_only = [g for g in shelf() if g.id not in ("slay", "football")]
    slots = [
        p.slot
        for p in recommend(long_only, [], PickRequest(), NOW, random.Random(1)).picks
    ]
    assert "short_and_sweet" not in slots


def test_overdue_classic_is_the_oldest_release_among_good_matches():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))
    third = result.picks[2]
    assert third.item.id == "old_puzzle"
    assert "Out since 2003" in third.reasons


def test_the_third_slot_becomes_waited_longest_once_acquired_dates_spread():
    games = [
        game
        if game.id != "ok"
        else item(
            "ok",
            title="Ok",
            genres=("Puzzle",),
            themes=("Horror",),
            acquired_at=date(2025, 1, 1),
        )
        for game in shelf()
    ]
    games = [
        game
        if game.acquired_at
        else PickerItem(**{**game.__dict__, "acquired_at": date(2026, 9, 1)})
        for game in games
    ]
    third = recommend(games, [], PickRequest(), NOW, random.Random(1)).picks[2]
    assert third.slot == "waited_longest"
    assert third.item.id == "ok"
    assert "On the shelf since January 2025" in third.reasons


def test_a_stalled_game_in_progress_takes_the_third_slot():
    games = shelf() + [
        item(
            "stalled",
            title="Stalled",
            status="active",
            started_at=TODAY - timedelta(days=90),
        )
    ]
    third = recommend(games, [], PickRequest(), NOW, random.Random(1)).picks[2]
    assert third.slot == "pick_it_back_up"
    assert third.slot_label == "Pick it back up"
    assert any(reason.startswith("Started in June 2026") for reason in third.reasons)


def test_a_game_in_progress_recently_shown_is_not_stalled():
    stalled = item("stalled", status="active", started_at=TODAY - timedelta(days=90))
    events = [PickerEvent("stalled", "shown", NOW - timedelta(days=3))]
    third = recommend(shelf() + [stalled], events, PickRequest(), NOW, random.Random(1))
    assert third.picks[2].slot != "pick_it_back_up"


def test_reasons_name_the_game_they_come_from():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))
    best = result.picks[0]
    assert "Shares roguelike and Indie with Hades ♥" in best.reasons
    assert "IGDB lists it beside Hades ♥" in best.reasons
    assert "About 18 h — a long one" in best.reasons
    for pick in result.picks:
        assert 1 <= len(pick.reasons) <= 3


def test_a_rated_reference_is_named_with_its_rating():
    result = recommend(shelf(), [], PickRequest(), NOW, random.Random(1))
    short = next(p for p in result.picks if p.item.id == "slay")
    assert (
        "Shares deck-building and Card & Board Game with Inscryption, which you rated 9"
        in short.reasons
    )


def test_no_candidates_is_an_empty_result_not_an_error():
    result = recommend(shelf(), [], PickRequest(moods=("cozy",)), NOW, random.Random(1))
    assert result.picks == ()
    assert result.candidate_count == 0
    assert result.profile_size == 4
