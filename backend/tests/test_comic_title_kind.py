"""comics.title_kind and comics.volume_kind_from_edition: pure rules."""

import pytest

from comics import title_kind, volume_kind_from_edition


@pytest.mark.parametrize(
    ("volumes", "issues", "expected"),
    [
        (0, 12, "run"),
        (0, 0, "run"),
        (1, 0, "single_book"),
        (2, 0, "book_line"),
        (9, 0, "book_line"),
        (1, 3, "both"),
        (4, 1, "both"),
    ],
)
def test_title_kind_is_derived_from_contents(volumes, issues, expected):
    assert title_kind(volumes, issues) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Trade", "trade"),
        ("hardcover", "hardcover"),
        ("  OMNIBUS ", "omnibus"),
        ("Compendium TPB", "trade"),
        ("Deluxe", "trade"),
        ("", "trade"),
        (None, "trade"),
    ],
)
def test_volume_kind_from_edition(text, expected):
    assert volume_kind_from_edition(text) == expected
