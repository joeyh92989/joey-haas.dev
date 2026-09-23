"""Play Next scoring. Pure: plain dataclasses in, numbers out, no database."""

from datetime import UTC, date, datetime, timedelta

import pytest

from picker import (
    PICKER_WEIGHTS,
    PickerEvent,
    PickerItem,
    acquired_dates_informative,
    affinity,
    attribute_table,
    attributes,
    length_fit,
    quality,
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
