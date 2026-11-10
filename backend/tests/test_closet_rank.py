"""closet_rank.py: the prompt, the indices and the top-up."""

from datetime import date, timedelta

import pytest

import closet
import closet_rank
from closet import Piece, Request

DAY = date(2026, 11, 10)
READ = closet.WeatherRead(66, 78, wet=False, snow=False, forecast=True)


def piece(id: str, category: str, **kw) -> Piece:
    kw.setdefault("name", f"{category} {id}")
    kw.setdefault("warmth", 2)
    kw.setdefault("formality", 2)
    return Piece(id=id, category=category, **kw)


PIECES = [
    piece("t1", "top", name="grey tee"),
    piece("t2", "top", name="navy oxford"),
    piece("t3", "top", name="white tee"),
    piece("b1", "bottom", name="jeans"),
    piece("b2", "bottom", name="chinos"),
    piece("s1", "shoes", name="sneakers"),
    piece("s2", "shoes", name="loafers"),
]


def found_for(request: Request | None = None):
    return closet.candidates(PIECES, request or Request(DAY, "weekend"), READ)


def index_of(found, id: str) -> int:
    return [p.id for _, p in closet_rank.numbered(found)].index(id)


def answer(found, *outfits) -> dict:
    return {
        "outfits": [
            {"indices": [index_of(found, i) for i in ids], "reason": reason}
            for ids, reason in outfits
        ]
    }


def ids(outfit) -> list[str]:
    return [p.id for _, p in outfit.pieces]


def test_numbering_is_slot_by_slot_and_skips_the_fixed_slot():
    found = found_for()
    assert [slot for slot, _ in closet_rank.numbered(found)] == ["top"] * 3 + [
        "bottom"
    ] * 2 + ["shoes"] * 2
    locked = found_for(Request(DAY, "weekend", lock="t2"))
    assert {slot for slot, _ in closet_rank.numbered(locked)} == {"bottom", "shoes"}


def test_a_good_answer_is_kept_in_order():
    found = found_for()
    got = closet_rank.validate(
        answer(
            found,
            (["t2", "b2", "s2"], "Crisp."),
            (["t1", "b1", "s1"], "Easy."),
        ),
        found,
    )
    assert [ids(o) for o in got] == [["t2", "b2", "s2"], ["t1", "b1", "s1"]]
    assert all(o.ranked_by == "model" for o in got)
    assert got[0].reason == "Crisp."


@pytest.mark.parametrize("bad", [99, -1, True, "2", None])
def test_foreign_indices_are_dropped(bad):
    found = found_for()
    payload = answer(found, (["t2", "b2", "s2"], "Crisp."))
    payload["outfits"][0]["indices"].insert(0, bad)
    got = closet_rank.validate(payload, found)
    assert ids(got[0]) == ["t2", "b2", "s2"]


def test_only_foreign_indices_or_no_reason_drop_the_outfit():
    found = found_for()
    payload = {
        "outfits": [
            {"indices": [99, 100], "reason": "Nothing real."},
            {"indices": [index_of(found, "t1")], "reason": "  "},
            {"indices": "0,1", "reason": "Not a list."},
            "not an outfit",
        ]
    }
    assert closet_rank.validate(payload, found) == []
    assert closet_rank.validate({"nope": []}, found) == []
    assert closet_rank.validate(None, found) == []


def test_a_second_piece_for_a_slot_is_dropped_and_an_empty_slot_filled():
    found = found_for()
    got = closet_rank.validate(answer(found, (["t2", "t1", "b2"], "Crisp.")), found)
    best_shoes = found.by_slot["shoes"][0].piece.id
    assert ids(got[0]) == ["t2", "b2", best_shoes]


def test_a_lock_is_honoured_whatever_the_answer_says():
    request = Request(DAY, "weekend", lock="t2")
    found = found_for(request)
    payload = {
        "outfits": [
            # A top index cannot be given: the slot is fixed, so not listed.
            {
                "indices": [index_of(found, "b1"), index_of(found, "s1")],
                "reason": "Works.",
            },
            {
                "indices": [index_of(found, "b2"), index_of(found, "s2")],
                "reason": "You locked the navy oxford. Smart.",
            },
        ]
    }
    got = closet_rank.validate(payload, found)
    assert [dict(o.pieces)["top"].id for o in got] == ["t2", "t2"]
    assert got[0].reason == "You locked the navy oxford. Works."
    assert got[1].reason == "You locked the navy oxford. Smart."


def test_a_transient_garment_is_in_every_outfit():
    shirt = Piece(id="photo", name="green shirt", category="top", transient=True)
    found = found_for(Request(DAY, "weekend", extra=shirt))
    got = closet_rank.validate(answer(found, (["b1", "s1"], "Green and denim.")), found)
    assert ids(got[0]) == ["photo", "b1", "s1"]
    assert got[0].reason.startswith("Built around the green shirt from your photo.")


def test_repeats_and_recent_outfits_are_dropped():
    found = found_for()
    recent = {frozenset({"t1", "b1", "s1"})}
    got = closet_rank.validate(
        answer(
            found,
            (["t1", "b1", "s1"], "Worn last week."),
            (["t2", "b2", "s2"], "Crisp."),
            (["t2", "b2", "s2"], "Crisp again."),
        ),
        found,
        recent,
    )
    assert [ids(o) for o in got] == [["t2", "b2", "s2"]]


def test_a_partial_answer_tops_up_from_the_template():
    found = found_for()
    payload = answer(found, (["t2", "b2", "s2"], "Crisp."))
    outfits, note = closet_rank.outcome(payload, None, found)
    assert len(outfits) == 3
    assert outfits[0].ranked_by == "model"
    assert [o.ranked_by for o in outfits[1:]] == ["template", "template"]
    assert len({o.key for o in outfits}) == 3
    assert note == "it chose 1; the template filled the rest"


def test_a_full_answer_has_no_note():
    found = found_for()
    payload = answer(
        found,
        (["t1", "b1", "s1"], "A."),
        (["t2", "b2", "s2"], "B."),
        (["t3", "b1", "s2"], "C."),
    )
    outfits, note = closet_rank.outcome(payload, None, found)
    assert [o.ranked_by for o in outfits] == ["model"] * 3 and note is None


def test_no_answer_is_the_template_with_the_calls_note():
    found = found_for()
    outfits, note = closet_rank.outcome(None, "Gemini's daily quota is used up", found)
    assert outfits == closet.template(found)
    assert note == "Gemini's daily quota is used up"


def test_an_answer_that_does_not_hold_up_is_the_template_with_a_note():
    found = found_for()
    outfits, note = closet_rank.outcome(
        {"outfits": [{"indices": [99], "reason": "x"}]}, None, found
    )
    assert outfits == closet.template(found)
    assert note == "The model's outfits did not hold up"


@pytest.mark.parametrize(
    "reasons, summary",
    [
        ([], None),
        ([None, "bogus"], None),
        (["too_warm"], "too warm"),
        (["too_warm", "tired", "too_warm"], "too warm (2), tired of it"),
        # Only the five most recent count.
        (["tired"] * 5 + ["too_cold"], "tired of it (5)"),
    ],
)
def test_summarise_not_this(reasons, summary):
    assert closet_rank.summarise_not_this(reasons) == summary


def test_the_prompt_carries_the_day_the_profile_and_the_numbers():
    request = Request(DAY, "office", bike=True, lock="t2")
    pieces = [
        *PIECES,
        piece(
            "b3",
            "bottom",
            name="grey trousers",
            formality=3,
            wears_30=2,
            last_worn=DAY - timedelta(days=4),
        ),
    ]
    found = closet.candidates(pieces, request, READ)
    prompt = closet_rank.build_prompt(
        found,
        request,
        READ,
        "Mild morning, mild afternoon.",
        {"style_words": ["minimal", "navy"], "dislikes": "logos", "coloring": None},
        ["too_warm", "too_warm"],
    )
    assert "morning low 66°F, afternoon high 78°F" in prompt
    assert "Occasion: office, riding a bike there." in prompt
    assert "Style: minimal, navy" in prompt and "Avoid: logos" in prompt
    assert "Colouring" not in prompt
    assert "Turned down lately: too warm (2)." in prompt
    assert "Already chosen for top (they chose it): navy oxford" in prompt
    assert "Slots to fill: mid, bottom, shoes." in prompt  # 61° on the bike
    assert "worn 2× in 30 days, last 4 days ago" in prompt
    for index, (slot, p) in enumerate(closet_rank.numbered(found)):
        assert f"{index}. {slot}: {p.name}" in prompt
