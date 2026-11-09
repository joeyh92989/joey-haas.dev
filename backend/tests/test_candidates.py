"""The spot finder's scoring layer: shortlist, prompt, validate, fallback."""

import json
from pathlib import Path

import pytest

import candidates
from candidates import (
    MAX_QUEUE,
    NOT_SCORED,
    SCORES_SCHEMA,
    ProfileSpot,
    Score,
    build_prompt,
    fallback,
    merge,
    prescore,
    queue,
    shortlist,
    tag_weights,
    validate,
)
from spot_sources.overpass import CandidateRow, parse
from spots import TAGS

FIXTURE = Path(__file__).parent / "fixtures" / "overpass_candidates.json"
PROFILE = [
    ProfileSpot("Huckleberry Roasters", ("coffee", "rainy-day"), visits=6),
    ProfileSpot("Commons Park", ("park", "kid-ok", "bike-friendly"), visits=3),
    ProfileSpot("Snooze", ("food",), visits=0),
]


def _row(n, name, category="cafe", detail=None):
    return CandidateRow(f"node/{n}", name, category, 39.75, -105.0, detail)


def _queued(n, name, category="cafe", miles=0.5, weights=None):
    return queue(_row(n, name, category), miles, "Union Station", weights or {})


# --- the profile and the pre-score ---------------------------------------------


def test_tag_weights_count_visits_and_scale_to_one():
    weights = tag_weights(PROFILE)
    assert weights["coffee"] == 1.0
    assert weights["park"] == pytest.approx(4 / 7)
    assert weights["food"] == pytest.approx(1 / 7)
    assert tag_weights([]) == {}


def test_prescore_rewards_used_tags_and_costs_distance():
    weights = tag_weights(PROFILE)
    near_cafe = prescore(("coffee", "rainy-day"), 0.5, weights)
    far_cafe = prescore(("coffee", "rainy-day"), 2.5, weights)
    restaurant = prescore(("food",), 0.5, weights)
    assert near_cafe > far_cafe
    assert near_cafe > restaurant
    assert prescore((), None, weights) == 0


def test_a_category_suggests_its_tags():
    assert _queued(1, "Cafe").suggested == ("coffee", "rainy-day")
    assert _queued(2, "Park", "park").suggested == ("park", "kid-ok")
    assert _queued(3, "Sight", "attraction").suggested == ()
    assert set().union(*candidates.CATEGORY_TAGS.values()) <= set(TAGS)


def test_the_distance_line_is_the_shared_one():
    assert _queued(1, "Cafe", miles=0.64).distance == (
        "0.6 mi from Union Station · on foot"
    )
    assert queue(_row(1, "Cafe"), None, None, {}).distance is None


# --- shortlist -----------------------------------------------------------------


def test_the_shortlist_takes_categories_in_turn():
    found = [_queued(n, f"Restaurant {n}", "restaurant") for n in range(10)]
    found += [_queued(100, "Cafe A"), _queued(101, "Cafe B")]
    found += [_queued(200, "Park", "park")]
    picked = shortlist(found, limit=6)
    assert [item.row.category for item in picked].count("restaurant") == 3
    assert {item.row.name for item in picked} >= {"Cafe A", "Cafe B", "Park"}


def test_the_shortlist_ranks_within_a_category_and_is_repeatable():
    weights = tag_weights(PROFILE)
    found = [
        _queued(1, "Far", miles=3.0, weights=weights),
        _queued(2, "Near", miles=0.2, weights=weights),
    ]
    assert [item.row.name for item in shortlist(found)] == ["Near", "Far"]
    assert shortlist(found) == shortlist(list(reversed(found)))


def test_the_recorded_answer_shortlists_to_the_cap_with_every_category():
    rows = parse(json.loads(FIXTURE.read_text()))
    found = [queue(row, 1.0, "Union Station", tag_weights(PROFILE)) for row in rows]
    picked = shortlist(found)
    assert len(picked) == MAX_QUEUE
    assert {item.row.category for item in picked} == {row.category for row in rows}
    assert len({item.row.source_id for item in picked}) == MAX_QUEUE


# --- the prompt ------------------------------------------------------------------


def test_the_prompt_names_only_the_profile_and_the_list():
    listed = [
        _queued(1, "Kaffe Landscap"),
        queue(_row(2, "Bruto", "restaurant", "mexican"), 1.4, "Union Station", {}),
    ]
    prompt = build_prompt(listed, PROFILE)
    assert prompt.startswith(candidates.INSTRUCTIONS)
    assert f"Allowed tags: {', '.join(TAGS)}" in prompt
    assert "- Huckleberry Roasters (coffee, rainy-day, 6 visits)" in prompt
    assert "- Snooze (food)" in prompt
    assert "[0] Kaffe Landscap — cafe · 0.5 mi from Union Station · on foot" in prompt
    assert "[1] Bruto — restaurant, mexican · 1.4 mi from Union Station · by bike" in (
        prompt
    )


def test_an_empty_profile_says_so():
    assert "They have not tagged any spots yet." in build_prompt([], [])


def test_untagged_spots_are_left_out_and_the_profile_is_capped():
    many = [ProfileSpot(f"Spot {n}", ("park",), visits=n) for n in range(40)]
    many.append(ProfileSpot("Bare", ()))
    prompt = build_prompt([], many)
    assert "Bare" not in prompt
    assert "Spot 39" in prompt and "Spot 9 " not in prompt
    assert prompt.count("\n- ") == candidates.PROFILE_SIZE


def test_the_schema_bounds_index_fit_and_tags():
    item = SCORES_SCHEMA["properties"]["scores"]["items"]["properties"]
    assert item["index"]["maximum"] == MAX_QUEUE - 1
    assert item["fit"] == {"type": "integer", "minimum": 0, "maximum": 100}
    assert item["tags"]["items"]["enum"] == list(TAGS)


# --- validate, fallback, merge -----------------------------------------------------


LISTED = [
    _queued(1, "Cafe"),
    _queued(2, "Park", "park"),
    _queued(3, "Sight", "attraction"),
]


def test_valid_scores_are_kept_by_index():
    payload = {
        "scores": [
            {
                "index": 1,
                "fit": 88,
                "reason": " Shady,\n kid-ok. ",
                "tags": ["kid-ok", "park"],
            },
            {"index": 0, "fit": 40, "reason": "Fine coffee.", "tags": ["coffee"]},
        ]
    }
    assert validate(payload, LISTED) == {
        1: Score(88, "Shady, kid-ok.", ("park", "kid-ok")),
        0: Score(40, "Fine coffee.", ("coffee",)),
    }


@pytest.mark.parametrize(
    "entry",
    [
        {"index": 3, "fit": 50, "reason": "Out of range", "tags": []},
        {"index": -1, "fit": 50, "reason": "Negative", "tags": []},
        {"index": True, "fit": 50, "reason": "A bool", "tags": []},
        {"index": "0", "fit": 50, "reason": "A string", "tags": []},
        {"index": 0, "fit": 101, "reason": "Too high", "tags": []},
        {"index": 0, "fit": None, "reason": "No fit", "tags": []},
        {"index": 0, "fit": 50, "reason": "   ", "tags": []},
        {"index": 0, "fit": 50},
        "not an object",
    ],
)
def test_a_bad_score_is_dropped(entry):
    assert validate({"scores": [entry]}, LISTED) == {}


def test_a_repeated_index_keeps_the_first():
    payload = {
        "scores": [
            {"index": 0, "fit": 70, "reason": "First", "tags": []},
            {"index": 0, "fit": 10, "reason": "Second", "tags": []},
        ]
    }
    assert validate(payload, LISTED)[0].reason == "First"


def test_tags_outside_the_vocabulary_are_dropped_and_none_left_suggests():
    payload = {
        "scores": [
            {"index": 0, "fit": 60, "reason": "Ok", "tags": ["wifi", "coffee", 3]},
            {"index": 1, "fit": 60, "reason": "Ok", "tags": ["dogs"]},
            {"index": 2, "fit": 60, "reason": "Ok", "tags": "park"},
        ]
    }
    scores = validate(payload, LISTED)
    assert scores[0].tags == ("coffee",)
    assert scores[1].tags == ("park", "kid-ok")
    assert scores[2].tags == ()


def test_a_long_reason_is_cut():
    payload = {"scores": [{"index": 0, "fit": 1, "reason": "x" * 400, "tags": []}]}
    assert len(validate(payload, LISTED)[0].reason) == candidates.MAX_REASON


@pytest.mark.parametrize("payload", [None, [], {}, {"scores": "no"}])
def test_an_unreadable_answer_is_no_scores(payload):
    assert validate(payload, LISTED) == {}


def test_the_fallback_leaves_fit_null():
    assert fallback(LISTED[1]) == Score(None, NOT_SCORED, ("park", "kid-ok"))


def test_merge_queues_everything_and_falls_back_per_place():
    scored = merge(LISTED, {1: Score(90, "Great", ("park",))})
    assert [entry.queued.row.name for entry in scored] == ["Cafe", "Park", "Sight"]
    assert [entry.score.fit for entry in scored] == [None, 90, None]
    assert scored[0].score.reason == NOT_SCORED
