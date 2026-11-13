"""Comic intake's pure parts: the issue number's normaliser, the books read
from a model answer (recorded 13 Nov 2026 off Joey's covers), the run check
and the entry-edit validation. No model call, no database."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from importer import (
    COMIC_DETECTION_SCHEMA,
    COMIC_EXTRACTION_PROMPT,
    normalise_issue_number,
    parse_books,
)
from intake.comic_books import BookEditError, edit_book, number_check, run_size
from models import ItemType

RECORDED = json.loads(
    (Path(__file__).parent / "fixtures" / "comic_reader_answers.json").read_text()
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1 of 4", 1),
        ("4 of 4", 4),
        ("2", 2),
        ("#4", 4),
        ("# 4", 4),
        ("No. 4", 4),
        ("no 12", 12),
        ("Issue 7", 7),
        (" 9999 ", 9999),
        ("0", None),
        ("00", None),
        ("10000", None),
        ("½", None),
        ("1/2", None),
        ("Annual 1", None),
        ("Vol. 4", None),
        ("", None),
        (None, None),
        ("  ", None),
    ],
)
def test_normalise_issue_number(text, expected):
    assert normalise_issue_number(text) == expected


def test_the_recorded_answers_parse_to_the_books_on_the_covers():
    books = [parse_books(row["answer"])[0] for row in RECORDED]
    got = [(b.title, b.issue_number, b.number_source, b.format) for b in books]
    assert got == [
        ("Creepshow", None, "none", "collected"),
        ("STAR WARS TALES", 5, "read", "single"),
        ("Jurassic Park Raptors Attack", 1, "read", "single"),
        ("Zorro", None, "none", "single"),  # "0": not tracked
        ("WATERWORLD CHILDREN OF LEVIATHAN", 1, "read", "single"),
        ("Waterworld: Children of Leviathan", 2, "read", "single"),
        ("Waterworld: Children of Leviathan", 3, "read", "single"),
        ("Waterworld Children of Leviathan: Twilight of the Gods", 4, "read", "single"),
    ]
    assert all(b.media_type is ItemType.COMIC for b in books)


def test_a_number_the_model_did_not_see_is_not_kept():
    answer = {
        "books": [
            {
                "series": "X-Men",
                "issue_number": "12",
                "issue_number_seen": False,
                "format": "single",
            }
        ]
    }
    [book] = parse_books(answer)
    assert (book.issue_number, book.number_source) == (None, "none")


def test_a_collected_book_has_no_issue_number_but_may_collect_a_range():
    answer = {
        "books": [
            {
                "series": "Saga",
                "issue_number": "1",
                "issue_number_seen": True,
                "format": "collected",
                "volume_range": "1-6",
            },
            {
                "series": "Hellboy",
                "issue_number_seen": False,
                "format": "collected",
                "volume_range": "6-1",
            },
        ]
    }
    first, second = parse_books(answer)
    assert first.issue_number is None and first.number_source == "none"
    assert (first.collects_from, first.collects_to) == (1, 6)
    assert (second.collects_from, second.collects_to) == (None, None)


def test_two_books_of_one_series_stay_two_books():
    answer = {
        "books": [
            {
                "series": "Waterworld",
                "issue_number": "1",
                "issue_number_seen": True,
                "format": "single",
            },
            {
                "series": "Waterworld",
                "issue_number": "2",
                "issue_number_seen": True,
                "format": "single",
            },
        ]
    }
    assert [b.issue_number for b in parse_books(answer)] == [1, 2]
    assert [b.index for b in parse_books(answer)] == [0, 1]


def test_unusable_books_are_dropped_and_the_rest_kept():
    answer = {"books": [{"series": " "}, "junk", {"series": "Saga", "format": "odd"}]}
    [book] = parse_books(answer)
    assert (book.title, book.format) == ("Saga", "unknown")


def test_the_prompt_asks_for_one_entry_per_book_and_the_schema_requires_it():
    assert "one entry per physical book" in COMIC_EXTRACTION_PROMPT
    item = COMIC_DETECTION_SCHEMA["properties"]["books"]["items"]
    assert {"series", "issue_number", "issue_number_seen", "format"} <= set(
        item["properties"]
    )
    assert "series" in item["required"]


def _book(number, source="read"):
    return {"issue_number": number, "number_source": source}


def test_a_read_number_within_the_volumes_issues_is_in_the_run():
    chosen = {"issue_count": 4}
    assert number_check(_book(4), chosen) == {"state": "in_run", "run": 4}
    assert number_check(_book(1), chosen)["state"] == "in_run"


def test_a_read_number_past_the_volumes_issues_is_out_of_the_run():
    assert number_check(_book(5), {"issue_count": 4}) == {
        "state": "out_of_run",
        "run": 4,
    }


def test_a_read_number_with_no_known_run_is_only_read():
    assert number_check(_book(5), {"external_id": "1"}) == {
        "state": "read",
        "run": None,
    }
    assert number_check(_book(5), None)["state"] == "read"
    assert number_check(_book(5), {"issue_count": 0})["state"] == "read"


def test_a_typed_number_is_typed_whatever_the_run():
    assert number_check(_book(50, "typed"), {"issue_count": 4})["state"] == "typed"


def test_no_number_is_none():
    assert (
        number_check({"issue_number": None, "number_source": "none"}, {})["state"]
        == "none"
    )
    assert number_check({}, {"issue_count": 4})["state"] == "none"
    assert number_check(None, None)["state"] == "none"


def test_a_series_on_the_shelf_judges_by_its_own_issues():
    on_shelf = {"issue_max": 6, "released": None}
    assert run_size({"issue_count": 4}, on_shelf) == 6
    assert number_check(_book(6), {"issue_count": 4}, on_shelf)["state"] == "in_run"
    # nothing known on the shelf: the candidate's count still answers
    assert run_size({"issue_count": 4}, {"issue_max": None, "released": None}) == 4


def test_a_changed_number_is_typed_and_an_unchanged_one_keeps_its_source():
    old = _book(2)
    assert edit_book(old, {**old, "issue_number": 3}) == _book(3, "typed")
    assert edit_book(old, dict(old)) == old
    assert edit_book(old, {**old, "issue_number": None}) == _book(None, "none")
    # the client cannot claim a read
    assert edit_book(old, {"issue_number": 9, "number_source": "read"}) == _book(
        9, "typed"
    )


@pytest.mark.parametrize("bad", [0, -1, 10000, 1.5, True, "x", "1/2"])
def test_a_bad_number_is_refused(bad):
    with pytest.raises(BookEditError) as refused:
        edit_book(_book(1), {"issue_number": bad})
    assert refused.value.field == "issue_number"
    assert "1 to 9999" in str(refused.value) or "whole number" in str(refused.value)


def test_a_typed_digit_string_is_a_number():
    assert edit_book({}, {"issue_number": "7"})["issue_number"] == 7


def test_the_collected_range_needs_both_ends_in_order():
    ok = edit_book({}, {"collects_from": 1, "collects_to": 6})
    assert (ok["collects_from"], ok["collects_to"]) == (1, 6)
    assert edit_book({}, {"collects_from": 3, "collects_to": 3})["collects_to"] == 3
    cleared = edit_book({}, {"collects_from": None, "collects_to": ""})
    assert (cleared["collects_from"], cleared["collects_to"]) == (None, None)
    for body in (
        {"collects_from": 6, "collects_to": 1},
        {"collects_from": 1, "collects_to": None},
        {"collects_from": 0, "collects_to": 4},
    ):
        with pytest.raises(BookEditError):
            edit_book({}, body)


def test_format_and_edition_kind_take_only_their_values():
    assert edit_book({}, {"format": "collected", "edition_kind": "omnibus"})
    with pytest.raises(BookEditError):
        edit_book({}, {"format": "odd"})
    with pytest.raises(BookEditError):
        edit_book({}, {"edition_kind": "zine"})


def test_a_payload_without_book_fields_is_returned_as_it_came():
    payload = {"issues_owned": "1–4", "shelf_format": "singles"}
    assert edit_book(None, payload) == payload
