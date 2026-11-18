"""The built-in intake kinds: garment_kind.py and shelf_kinds.py (#302).

Both register at import and are exercised mostly through the commit routes;
these pin their pure row builders directly.
"""

from intake import garment_kind, shelf_kinds
from intake.kinds import REGISTRY
from models import ItemType


def test_every_builtin_kind_is_registered():
    import intake.garment_kind  # noqa: F401
    import intake.shelf_kinds  # noqa: F401

    assert {"garment", "game", "movie", "comic", "boardgame"} <= set(REGISTRY)
    assert REGISTRY["garment"].has_details is False
    assert REGISTRY["boardgame"].ways_in == ("type",)


def test_a_garment_row_keeps_only_garment_fields():
    row = garment_kind.to_row({"payload": {"name": "Coat", "warmth": 4, "evil": "x"}})
    assert row == {"name": "Coat", "warmth": 4}
    assert garment_kind.to_row({}) == {}


def test_a_shelf_row_carries_the_match_the_fields_and_the_type():
    row = shelf_kinds._shelf_row(ItemType.GAME)(
        {
            "chosen": {"title": "Hades", "thumbnail_url": "http://c", "junk": 1},
            "payload": {"status": "backlog", "not_a_field": 2},
        }
    )
    assert row["title"] == "Hades"
    assert row["cover_url"] == "http://c"
    assert row["status"] == "backlog"
    assert "junk" not in row and "not_a_field" not in row
    assert row["type"] is ItemType.GAME
    assert row["owned_format"] == "physical"


def test_a_comic_single_brings_its_number_and_a_typed_value_wins():
    to_row = shelf_kinds._shelf_row(ItemType.COMIC)
    assert to_row({"payload": {"issue_number": 4}})["issues_owned"] == "4"
    typed = to_row({"payload": {"issue_number": 4, "issues_owned": "1-3"}})
    assert typed["issues_owned"] == "1-3"


def test_a_collected_comic_book_sets_its_default_shelf_format():
    base = {"format": "collected", "collects_from": 1, "collects_to": 6}
    for kind, shelf in (
        ("omnibus", "omnibus"),
        ("trade", "trades"),
        ("hardcover", "trades"),
        ("compendium", "trades"),
        ("ogn", "trades"),
    ):
        assert shelf_kinds._book_row({**base, "edition_kind": kind}) == {
            "shelf_format": shelf
        }
    # The book is a volume, written by the commit; it is no edition row.
    assert not hasattr(shelf_kinds, "book_edition")
