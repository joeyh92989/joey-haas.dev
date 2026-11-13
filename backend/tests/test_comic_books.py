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
