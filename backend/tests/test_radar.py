"""Radar's sections, score and reasons: pure, no database."""

from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

from physical_sources.collapse import Candidate, StoreLine
from picker import PickerItem
from radar import (
    DIGITAL_CAP,
    SUGGESTED_CAP,
    URGENCY_BONUS,
    PoolGame,
    build,
    section_for,
)

TODAY = date(2026, 9, 27)


def _candidate(igdb_id, **fields) -> Candidate:
    values = {
        "igdb_id": igdb_id,
        "platform_id": 508,
        "title": f"Game {igdb_id}",
        "cover_url": None,
        "release_date": TODAY + timedelta(days=60),
        "release_precision": "day",
        "physical_format": "game_card",
        "format_source": "registry",
        "format_route": None,
        "format_note": None,
        "region_of_answer": "USA",
        "buyable": True,
        "store_lines": (),
        "listing_ids": (),
        "edition_ids": (),
        **fields,
    }
    return Candidate(**values)


def _pool(
    igdb_id,
    genres=(),
    hypes=None,
    lane="dated",
    closes_at=None,
    similar_games=(),
    **fields,
) -> PoolGame:
    return PoolGame(
        candidate=_candidate(igdb_id, **fields),
        snapshot={"genres": list(genres), "similar_games": list(similar_games)},
        hypes=hypes,
        lane=lane,
        closes_at=closes_at,
    )


def _game(
    item_id, genres=(), title=None, external_id=None, favorite=True
) -> PickerItem:
    return PickerItem(
        id=item_id,
        title=title or f"Owned {item_id}",
        type="game",
        status="finished",
        owned=True,
        rating=None,
        favorite=favorite,
        pinned=False,
        external_id=external_id,
        year=2020,
        cover_url=None,
        platform_id=130,
        platform="Nintendo Switch",
        creator=None,
        genres=tuple(genres),
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


def _upcoming(igdb_id, hypes=50, genres=()) -> dict:
    return {
        "igdb_id": igdb_id,
        "title": f"Digital {igdb_id}",
        "cover_url": None,
        "platform_id": 508,
        "release_date": (TODAY + timedelta(days=90)).isoformat(),
        "release_precision": "day",
        "hypes": hypes,
        "snapshot": {"genres": list(genres), "similar_games": [], "hypes": hypes},
    }


# --- Sections -------------------------------------------------------------------


def test_a_future_day_date_is_suggested_and_a_year_date_is_dated_later():
    soon = _candidate(1, release_date=date(2026, 12, 1), release_precision="day")
    later = _candidate(2, release_date=date(2027, 1, 1), release_precision="year")
    quarter = _candidate(3, release_date=date(2027, 4, 1), release_precision="quarter")
    assert section_for(soon, "dated", TODAY, False) == "suggested"
    assert section_for(later, "dated", TODAY, False) == "dated_later"
    assert section_for(quarter, "dated", TODAY, False) == "dated_later"


def test_a_past_date_is_not_on_radar_unless_it_is_a_preorder():
    past = _candidate(4, release_date=date(2026, 1, 1), release_precision="day")
    assert section_for(past, "dated", TODAY, False) is None
    assert section_for(past, "preorder", TODAY, False) == "suggested"


def test_key_cards_stay_off_unless_asked():
    card = _candidate(5, physical_format="game_key_card")
    code = _candidate(6, physical_format="code_in_box")
    assert section_for(card, "dated", TODAY, False) is None
    assert section_for(code, "dated", TODAY, False) is None
    assert section_for(card, "dated", TODAY, True) == "suggested"


# --- Score ----------------------------------------------------------------------


def test_taste_outweighs_hype():
    profile = [_game("a", genres=("Roguelike",))]
    liked = _pool(10, genres=("Roguelike",), hypes=5)
    hyped = _pool(11, genres=("Sport",), hypes=900)
    ranked = build([liked, hyped], [], profile, set(), TODAY)
    assert [s.igdb_id for s in ranked] == [10, 11]


def test_a_closing_window_adds_urgency():
    profile = [_game("a", genres=("Roguelike",))]
    soon = _pool(
        12, genres=("Roguelike",), lane="preorder", closes_at=TODAY + timedelta(days=10)
    )
    later = _pool(
        13, genres=("Roguelike",), lane="preorder", closes_at=TODAY + timedelta(days=90)
    )
    scores = {
        s.igdb_id: s.score for s in build([soon, later], [], profile, set(), TODAY)
    }
    assert scores[12] - scores[13] == URGENCY_BONUS


def test_an_empty_profile_orders_by_hype_then_date():
    quiet = _pool(18, hypes=3)
    loud = _pool(19, hypes=300)
    ranked = build([quiet, loud], [], [], set(), TODAY)
    assert [s.igdb_id for s in ranked] == [19, 18]


# --- Pool rules -----------------------------------------------------------------


def test_excluded_games_never_appear_in_any_lane():
    ranked = build([_pool(14)], [_upcoming(14), _upcoming(15)], [], {14}, TODAY)
    assert {s.igdb_id for s in ranked} == {15}


def test_lane_three_drops_games_already_in_lanes_one_and_two():
    ranked = build([_pool(16)], [_upcoming(16)], [], set(), TODAY)
    assert [(s.igdb_id, s.section) for s in ranked] == [(16, "suggested")]


def test_caps_per_section():
    pool = [_pool(100 + i) for i in range(40)]
    upcoming = [_upcoming(200 + i) for i in range(15)]
    counts = Counter(s.section for s in build(pool, upcoming, [], set(), TODAY))
    assert counts["suggested"] == SUGGESTED_CAP
    assert counts["digital"] == DIGITAL_CAP


def test_lane_three_rows_have_no_format_and_a_note():
    (s,) = build([], [_upcoming(20)], [], set(), TODAY)
    assert (s.section, s.lane, s.physical_format, s.format_note) == (
        "digital",
        "digital",
        None,
        "no physical edition announced",
    )
    assert "50 people waiting on IGDB" in s.reasons


# --- Reasons --------------------------------------------------------------------


def test_reasons_name_the_similar_game_the_window_and_the_format():
    profile = [_game("a", title="Dredge", external_id="500")]
    line = StoreLine(
        store="Limited Run",
        price=Decimal("59.99"),
        currency="USD",
        availability="preorder",
        preorder_closes_at=date(2026, 11, 8),
        url="https://example.test/x",
        listing_format="game_card",
        listing_id="l1",
    )
    pool = _pool(
        17,
        similar_games=(500,),
        lane="preorder",
        closes_at=date(2026, 11, 8),
        store_lines=(line,),
    )
    (s,) = build([pool], [], profile, set(), TODAY)
    assert s.reasons[0] == "IGDB lists it beside Dredge ♥"
    assert "Pre-orders close Nov 8 at Limited Run · $59.99" in s.reasons
    assert s.based_on == ("a",)
    assert s.store_lines == (
        {
            "store": "Limited Run",
            "price": "59.99",
            "currency": "USD",
            "availability": "preorder",
            "preorder_closes_at": "2026-11-08",
            "url": "https://example.test/x",
        },
    )


def test_at_most_three_reasons():
    profile = [_game("a", genres=("Roguelike",), external_id="500")]
    pool = _pool(21, genres=("Roguelike",), similar_games=(500,))
    (s,) = build([pool], [], profile, set(), TODAY)
    assert 1 <= len(s.reasons) <= 3


def test_based_on_names_the_reference_the_overlap_reason_names():
    """A substring match took "Pikmin" for "Pikmin 4 ♥"."""
    older = _game("pik", genres=("Puzzle", "Strategy"), title="Pikmin", favorite=False)
    newer = _game("pik4", genres=("Puzzle", "Strategy"), title="Pikmin 4")
    pool = _pool(30, genres=("Puzzle", "Strategy"))
    (s,) = build([pool], [], [older, newer], set(), TODAY)
    assert s.reasons[0].endswith("with Pikmin 4 ♥")
    assert s.based_on == ("pik4",)


def test_lane_three_honours_the_excluded_set_on_its_own():
    ranked = build([], [_upcoming(31), _upcoming(32)], [], {31}, TODAY)
    assert [s.igdb_id for s in ranked] == [32]


def test_a_pool_game_suppresses_lane_three_only_on_its_own_platform():
    old_switch = _pool(33, platform_id=130, release_date=date(2020, 1, 1))
    on_switch_2 = _upcoming(33)  # platform 508
    on_switch = dict(_upcoming(33), platform_id=130)
    ranked = build([old_switch], [on_switch_2, on_switch], [], set(), TODAY)
    assert [(s.igdb_id, s.platform_id, s.section) for s in ranked] == [
        (33, 508, "digital")
    ]


def test_a_key_card_left_out_still_counts_as_physical_for_lane_three():
    card = _pool(34, physical_format="game_key_card")
    ranked = build([card], [_upcoming(34)], [], set(), TODAY)
    assert ranked == []


def test_reasons_come_in_order_taste_window_format_date():
    profile = [_game("a", genres=("Roguelike",))]
    line = StoreLine(
        store="Super Rare",
        price=Decimal("39.99"),
        currency="GBP",
        availability="preorder",
        preorder_closes_at=TODAY + timedelta(days=20),
        url="https://example.test/y",
        listing_format="game_card",
        listing_id="l2",
    )
    pool = _pool(35, genres=("Roguelike",), lane="preorder", store_lines=(line,))
    (s,) = build([pool], [], profile, set(), TODAY)
    closes = TODAY + timedelta(days=20)
    assert s.reasons == (
        "Shares Roguelike with Owned a ♥",
        f"Pre-orders close {closes:%b} {closes.day} at Super Rare · £39.99",
        "Full game on cartridge",
    )


def test_the_date_reason_follows_precision():
    month = _pool(36, release_precision="month", release_date=date(2027, 3, 1))
    year = _pool(37, release_precision="year", release_date=date(2027, 1, 1))
    reasons = {s.igdb_id: s.reasons for s in build([month, year], [], [], set(), TODAY)}
    assert "Nintendo Switch 2 · Mar 2027" in reasons[36]
    assert "Nintendo Switch 2 · 2027" in reasons[37]
