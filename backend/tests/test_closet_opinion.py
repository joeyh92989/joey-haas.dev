"""The Sunday opinion's pure half: closet_opinion.py's prompt and validation."""

from datetime import date

import closet
import closet_opinion
from closet import Flag, Flagged, Held


def card(key: str, *sentences: str) -> Flagged:
    held = Held(
        id=key,
        name=key,
        category="top",
        status="active",
        primary_color="navy",
        formality=3,
        wears_12mo=1,
    )
    flags = [Flag("rare", s) for s in sentences] or [Flag("rare", "Worn once.")]
    return Flagged(held, flags, closet.suggest(flags), date(2026, 12, 1))


CARDS = [card("navy oxford", "Worn once in twelve months."), card("grey tee")]


def test_prompt_numbers_the_flagged_pieces_with_their_reasons():
    prompt = closet_opinion.build_prompt(
        CARDS,
        {"style_words": ["quiet", "tailored"], "dislikes": ["logos"]},
        [("top", 10), ("top", 4), ("shoes", 3)],
    )
    assert "Style: quiet, tailored" in prompt
    assert "Avoid: logos" in prompt
    assert "1 shoes worn 3 times in a year; 2 top worn 14 times in a year." in prompt
    assert (
        "0. navy oxford (top, navy, formality 3, worn 1 times in a year). "
        "Worn once in twelve months." in prompt
    )
    assert "1. grey tee (" in prompt


def test_validate_keeps_in_range_indices_once():
    payload = {
        "opinions": [
            {"index": 0, "opinion": "Opinion: The navy sits well with your colouring."},
            {"index": 0, "opinion": "A second view on the same piece."},
            {"index": 2, "opinion": "Out of range."},
            {"index": -1, "opinion": "Negative."},
            {"index": True, "opinion": "A bool is not a number."},
            {"index": 1, "opinion": "   "},
            "not an entry",
        ]
    }
    assert closet_opinion.validate(payload, CARDS) == {
        "navy oxford": "The navy sits well with your colouring."
    }


def test_validate_refuses_a_malformed_answer():
    assert closet_opinion.validate(None, CARDS) == {}
    assert closet_opinion.validate({"opinions": "no"}, CARDS) == {}
    assert closet_opinion.validate([], CARDS) == {}


def test_a_long_opinion_is_cut():
    text = closet_opinion.validate(
        {"opinions": [{"index": 1, "opinion": "word " * 100}]}, CARDS
    )["grey tee"]
    assert len(text) <= closet_opinion.MAX_OPINION
    assert text.endswith("…")


def test_batch_is_dated():
    assert closet_opinion.batch({"a": "b"}, date(2026, 11, 15)) == {
        "batch_on": "2026-11-15",
        "opinions": {"a": "b"},
    }
