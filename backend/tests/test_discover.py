"""Discover's pipeline: pure, no database, no model."""

from datetime import date, timedelta
from decimal import Decimal

from discover import (
    BUYABLE_BONUS,
    CANDIDATES,
    MAX_REASON,
    PICKS,
    PICKS_SCHEMA,
    PROFILE_SIZE,
    UNKNOWN_FORMAT_PENALTY,
    build_prompt,
    buyable,
    eligible,
    fallback,
    prescore,
    references,
    released,
    shortlist,
    validate,
)
from physical_sources.collapse import Candidate, StoreLine
from picker import PickerItem, attribute_table, reference_weights
from radar import PoolGame

TODAY = date(2026, 9, 27)


def _pool(igdb_id, released_on=date(2022, 5, 1), votes=100, score=75.0, **fields):
    genres = fields.pop("genres", ("Adventure",))
    candidate = Candidate(
        **{
            "igdb_id": igdb_id,
            "platform_id": 130,
            "title": f"Game {igdb_id}",
            "cover_url": None,
            "release_date": released_on,
            "release_precision": "day",
            "physical_format": "game_card",
            "format_source": "registry",
            "format_route": None,
            "format_note": None,
            "region_of_answer": "USA",
            "buyable": False,
            "store_lines": (),
            "listing_ids": (),
            "edition_ids": (),
            **fields,
        }
    )
    snapshot = {
        "genres": list(genres),
        "themes": [],
        "similar_games": [],
        "community_score": score,
        "community_votes": votes,
    }
    return PoolGame(
        candidate=candidate, snapshot=snapshot, hypes=None, lane="dated", closes_at=None
    )


def _owned(
    item_id, title=None, favorite=False, rating=None, status="finished", genres=()
):
    return PickerItem(
        id=item_id,
        title=title or f"Owned {item_id}",
        type="game",
        status=status,
        owned=True,
        rating=rating,
        favorite=favorite,
        pinned=False,
        external_id=None,
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


def _line(availability, closes=None):
    return StoreLine(
        store="Limited Run Games",
        price=Decimal("39.99"),
        currency="USD",
        availability=availability,
        preorder_closes_at=closes,
        url="https://example.test/x",
        listing_format="game_card",
        listing_id="l1",
    )


# --- Filter -------------------------------------------------------------------------


def test_released_keeps_the_past_and_the_undated_and_leaves_the_future_to_radar():
    assert released(_pool(1), TODAY, "any")
    assert released(_pool(2, released_on=None), TODAY, "any")
    assert released(_pool(3, released_on=TODAY), TODAY, "any")
    assert not released(_pool(4, released_on=TODAY + timedelta(days=1)), TODAY, "any")


def test_recent_keeps_three_years():
    assert released(_pool(5, released_on=date(2024, 1, 1)), TODAY, "recent")
    assert not released(_pool(6, released_on=date(2022, 1, 1)), TODAY, "recent")
    assert not released(_pool(7, released_on=None), TODAY, "recent")


def test_eligible_drops_excluded_and_key_cards_unless_asked_and_keeps_unknown():
    pool = [
        _pool(10),
        _pool(11, physical_format="game_key_card"),
        _pool(12, physical_format=None),
        _pool(13),
    ]
    ids = [g.candidate.igdb_id for g in eligible(pool, {13}, TODAY, "any", False)]
    assert ids == [10, 12]
    with_cards = eligible(pool, set(), TODAY, "any", True)
    assert 11 in [g.candidate.igdb_id for g in with_cards]


def test_buyable_means_in_stock_or_an_open_preorder():
    assert buyable(_pool(1, store_lines=(_line("in_stock"),)), TODAY)
    assert buyable(_pool(2, store_lines=(_line("preorder", TODAY),)), TODAY)
    assert buyable(_pool(3, store_lines=(_line("preorder"),)), TODAY)
    assert not buyable(
        _pool(4, store_lines=(_line("preorder", TODAY - timedelta(days=1)),)), TODAY
    )
    assert not buyable(_pool(5, store_lines=(_line("sold_out"),)), TODAY)
    assert not buyable(_pool(6), TODAY)


# --- Pre-score ----------------------------------------------------------------------


def _scores(pool, popularity="balanced", profile=()):
    return {
        c.game.candidate.igdb_id: c.score
        for c in prescore(pool, list(profile), popularity, TODAY)
    }


def test_popularity_follows_the_mode():
    pool = [_pool(20, votes=1500), _pool(21, votes=5)]
    safe = _scores(pool, "safe")
    deep = _scores(pool, "deep")
    balanced = _scores(pool, "balanced")
    assert safe[20] > safe[21]
    assert deep[21] > deep[20]
    assert balanced[20] == balanced[21]


def test_buyable_and_unknown_format_move_the_score_by_their_constants():
    plain = _scores([_pool(30)])[30]
    assert (
        _scores([_pool(31, store_lines=(_line("in_stock"),))])[31] - plain
        == BUYABLE_BONUS
    )
    assert (
        plain - _scores([_pool(32, physical_format=None)])[32] == UNKNOWN_FORMAT_PENALTY
    )


def test_taste_ranks_first():
    profile = [_owned("a", favorite=True, genres=("Roguelike",))]
    liked = _pool(40, genres=("Roguelike",))
    other = _pool(41, genres=("Sport",))
    ranked = prescore([other, liked], profile, "balanced", TODAY)
    assert [c.game.candidate.igdb_id for c in ranked] == [40, 41]


# --- Shortlist and prompt -------------------------------------------------------------


def _candidates(n):
    return prescore([_pool(100 + i, votes=i) for i in range(n)], [], "safe", TODAY)


def test_shortlist_keeps_twenty_in_a_seeded_shuffle():
    candidates = _candidates(30)
    first = shortlist(candidates, 7)
    assert len(first) == CANDIDATES
    assert {c.game.candidate.igdb_id for c in first} == {
        c.game.candidate.igdb_id for c in candidates[:CANDIDATES]
    }
    assert [c.game.candidate.igdb_id for c in shortlist(candidates, 7)] == [
        c.game.candidate.igdb_id for c in first
    ]
    assert [c.game.candidate.igdb_id for c in shortlist(candidates, 8)] != [
        c.game.candidate.igdb_id for c in first
    ]


def test_references_are_the_strongest_ten():
    profile = [_owned(f"f{i}", status="finished") for i in range(12)]
    profile.append(_owned("fav", favorite=True))
    profile.append(_owned("rated", rating=10))
    profile.append(_owned("backlog", status="backlog"))
    refs = references(profile)
    assert len(refs) == PROFILE_SIZE
    assert refs[0].id == "fav"
    assert "backlog" not in {r.id for r in refs}


def test_the_prompt_holds_only_the_shortlist_and_the_owners_games():
    pool = [_pool(200 + i) for i in range(25)]
    candidates = prescore(pool, [], "balanced", TODAY)
    short = shortlist(candidates, 1)
    refs = [_owned("h", title="Hades", favorite=True, rating=9)]
    prompt = build_prompt(short, refs, {("genre", "Roguelike"): 2.0})
    for index, candidate in enumerate(short):
        assert f"[{index}] {candidate.item.title}" in prompt
    assert "1. Hades ♥ (rated 9, finished)" in prompt
    left_out = {c.item.title for c in candidates} - {c.item.title for c in short}
    assert left_out and not any(f"] {title} " in prompt for title in left_out)
    assert "What they like most: Roguelike" in prompt


def test_the_schema_bounds_indices_and_the_owners_numbers():
    pick = PICKS_SCHEMA["properties"]["picks"]
    assert pick["maxItems"] == PICKS
    assert pick["items"]["properties"]["index"]["maximum"] == CANDIDATES - 1
    assert pick["items"]["properties"]["based_on"]["items"]["maximum"] == PROFILE_SIZE


# --- Validation and fallback ---------------------------------------------------------


def test_validate_keeps_good_picks_in_the_models_order():
    short = shortlist(_candidates(20), 3)
    refs = [_owned("a", title="Hades"), _owned("b", title="Dredge")]
    payload = {
        "picks": [
            {"index": 4, "reason": "Like Dredge, eerie and small.", "based_on": [2]},
            {"index": 0, "reason": "For Hades fans.", "based_on": [1, 9]},
            {"index": 4, "reason": "Repeat.", "based_on": [1]},
            {"index": 20, "reason": "Out of range.", "based_on": [1]},
            {"index": 1, "reason": "  ", "based_on": [1]},
            {"index": True, "reason": "A bool is not an index.", "based_on": []},
            "not a pick",
        ]
    }
    picks = validate(payload, short, refs)
    assert [p.candidate for p in picks] == [short[4], short[0]]
    assert picks[0].reasons[0] == "Like Dredge, eerie and small."
    assert picks[0].based_on == ("b",)
    assert picks[1].based_on == ("a",)  # 9 is not one of the owner's games
    assert all(p.ranked_by == "model" for p in picks)


def test_validate_caps_at_eight_and_survives_nonsense():
    short = shortlist(_candidates(20), 3)
    many = {"picks": [{"index": i, "reason": "x", "based_on": []} for i in range(12)]}
    assert len(validate(many, short, [])) == PICKS
    assert validate({}, short, []) == []
    assert validate({"picks": "no"}, short, []) == []
    assert validate([], short, []) == []


def test_validate_adds_the_window_and_format_after_the_reason():
    short = shortlist(
        prescore(
            [_pool(300, store_lines=(_line("preorder", TODAY + timedelta(days=9)),))],
            [],
            "balanced",
            TODAY,
        ),
        1,
    )
    (pick,) = validate(
        {"picks": [{"index": 0, "reason": "Yes.", "based_on": []}]}, short, [], TODAY
    )
    assert pick.reasons[0] == "Yes."
    assert any(reason.startswith("Pre-orders close") for reason in pick.reasons)
    assert "Full game on cartridge" in pick.reasons


def test_fallback_is_the_top_eight_with_template_reasons():
    profile = [_owned("a", title="Hades", favorite=True, genres=("Adventure",))]
    candidates = prescore(
        [_pool(400 + i) for i in range(12)], profile, "balanced", TODAY
    )
    picks = fallback(candidates, profile, TODAY)
    assert [p.candidate for p in picks] == candidates[:PICKS]
    assert all(p.ranked_by == "template" and p.reasons for p in picks)


def test_fallback_needs_no_profile():
    picks = fallback(_candidates(3), [], TODAY)
    assert len(picks) == 3 and all(p.reasons for p in picks)


def test_validate_survives_a_based_on_that_is_not_a_list():
    short = shortlist(_candidates(20), 3)
    refs = [_owned("a", title="Hades")]
    (pick,) = validate(
        {"picks": [{"index": 0, "reason": "Yes.", "based_on": 3}]}, short, refs
    )
    assert pick.based_on == ()


def test_validate_keeps_a_reason_to_one_capped_line_and_based_on_unique():
    short = shortlist(_candidates(20), 3)
    refs = [_owned("a", title="Hades")]
    long = "word " * 200
    picks = validate(
        {
            "picks": [
                {
                    "index": 0,
                    "reason": "Like Hades.\nPre-orders close tomorrow",
                    "based_on": [1, 1],
                },
                {"index": 1, "reason": long, "based_on": []},
            ]
        },
        short,
        refs,
    )
    assert picks[0].reasons == ("Like Hades. Pre-orders close tomorrow",)
    assert picks[0].based_on == ("a",)
    assert len(picks[1].reasons[0]) == MAX_REASON


def test_recent_keeps_the_day_three_years_back_and_survives_a_leap_day():
    assert released(_pool(8, released_on=date(2023, 9, 27)), TODAY, "recent")
    assert not released(_pool(9, released_on=date(2023, 9, 26)), TODAY, "recent")
    leap = date(2028, 2, 29)
    assert released(_pool(10, released_on=date(2025, 2, 28)), leap, "recent")
    assert not released(_pool(11, released_on=date(2025, 2, 27)), leap, "recent")


def test_the_prompt_names_only_liked_genres_and_five_at_most():
    profile = [
        _owned("fav", favorite=True, genres=("Platform", "Puzzle", "Indie")),
        _owned("fav2", favorite=True, genres=("Adventure", "RPG", "Arcade")),
        _owned("gave-up", status="abandoned", genres=("Shooter",)),
    ]
    table = attribute_table(profile, reference_weights(profile))
    prompt = build_prompt([], references(profile), table)
    liked = next(
        line for line in prompt.splitlines() if line.startswith("What they like")
    )
    assert "Shooter" not in liked
    assert len(liked.removeprefix("What they like most: ").split(", ")) == 5


def test_an_abandoned_games_genres_are_not_called_liked():
    profile = [
        _owned("fav", favorite=True, genres=("Platform",)),
        _owned("gave-up", status="abandoned", genres=("Shooter", "Strategy")),
    ]
    table = attribute_table(profile, reference_weights(profile))
    prompt = build_prompt([], references(profile), table)
    assert "What they like most: Platform\n" in prompt


def test_equal_scores_are_ordered_by_igdb_id():
    ranked = prescore([_pool(502), _pool(501)], [], "balanced", TODAY)
    assert [c.game.candidate.igdb_id for c in ranked] == [501, 502]


def test_a_boolean_community_score_is_ignored():
    game = _pool(600)
    flagged = _pool(601)
    flagged.snapshot["community_score"] = True
    game.snapshot["community_score"] = None
    first, second = prescore([game, flagged], [], "balanced", TODAY)
    assert first.item.community_score is None
    assert second.item.community_score is None
    assert first.score == second.score


def test_fallback_says_well_rated_when_nothing_else_applies():
    candidates = prescore([_pool(700, physical_format=None)], [], "balanced", TODAY)
    (pick,) = fallback(candidates, [], TODAY)
    assert pick.reasons == ("Well rated on IGDB",)


def test_fallback_keeps_three_reasons_at_most():
    profile = [
        _owned("a", title="Hades", favorite=True, genres=("Adventure",)),
        _owned("b", title="Dredge", favorite=True, genres=("Adventure",)),
    ]
    candidates = prescore(
        [
            _pool(
                800,
                store_lines=(_line("preorder", TODAY + timedelta(days=5)),),
                format_note="Includes an art book",
            )
        ],
        profile,
        "balanced",
        TODAY,
    )
    (pick,) = fallback(candidates, profile, TODAY)
    assert len(pick.reasons) == 3


# --- One pick per game ---------------------------------------------------------------


def _platforms(ranked):
    return [(c.game.candidate.igdb_id, c.game.candidate.platform_id) for c in ranked]


def test_a_game_on_two_platforms_is_one_candidate_the_better_scoring():
    switch = _pool(900, platform_id=130, store_lines=(_line("in_stock"),))
    switch_2 = _pool(900, platform_id=508)
    ranked = prescore([switch_2, switch, _pool(901)], [], "balanced", TODAY)
    assert _platforms(ranked) == [(900, 130), (901, 130)]


def test_a_tie_keeps_the_switch_2_edition():
    ranked = prescore(
        [_pool(910, platform_id=130), _pool(910, platform_id=508)],
        [],
        "balanced",
        TODAY,
    )
    assert _platforms(ranked) == [(910, 508)]


def test_the_fallback_never_names_a_game_twice():
    pool = [_pool(920 + i // 2, platform_id=(130, 508)[i % 2]) for i in range(16)]
    picks = fallback(prescore(pool, [], "balanced", TODAY), [], TODAY)
    ids = [p.candidate.game.candidate.igdb_id for p in picks]
    assert len(ids) == len(set(ids)) == PICKS
