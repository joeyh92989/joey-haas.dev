"""The closet seed file's parser and keys (intake/seed_file.py, #396).

Every row here is invented; the real file is purchase history and never
enters the repo."""

from __future__ import annotations

from decimal import Decimal

import pytest

from intake.seed_file import (
    MAX_ROWS,
    SeedFileError,
    dup_key,
    entry_payload,
    not_owned_key,
    parse_seed,
    row_dup_key,
)

HEADER = (
    "n,source,order_id,date,date_basis,brand,name,color_name,size,price_usd,"
    "category_hint,store_item_no,still_owned,image_url\n"
)


def line(**over) -> str:
    row = {
        "n": "1",
        "source": "stitchfix",
        "order_id": "ORD-1",
        "date": "2025-03-04",
        "date_basis": "order",
        "brand": "Acme",
        "name": "Test Tee",
        "color_name": "Burgundy",
        "size": "M",
        "price_usd": "$48.00",
        "category_hint": "top",
        "store_item_no": "",
        "still_owned": "yes",
        "image_url": "https://img.example.test/a.jpg",
    }
    row.update(over)
    return ",".join(f'"{value}"' for value in row.values()) + "\n"


def test_a_row_is_read_field_by_field():
    parsed = parse_seed(HEADER + line())
    (row,) = parsed.rows
    assert (row.source, row.order_id, row.brand, row.name) == (
        "stitchfix",
        "ORD-1",
        "Acme",
        "Test Tee",
    )
    assert (row.color_name, row.size, row.category) == ("Burgundy", "M", "top")
    assert row.price == Decimal("48.00")
    assert row.bought_on.isoformat() == "2025-03-04"
    assert row.store_item_no is None
    assert row.still_owned is True
    assert parsed.unreadable == 0


def test_a_bom_and_crlf_lines_are_fine():
    text = "﻿" + (HEADER + line()).replace("\n", "\r\n")
    assert len(parse_seed(text.encode("utf-8")).rows) == 1


def test_still_owned_no_is_read_as_not_owned():
    (row,) = parse_seed(HEADER + line(still_owned="no")).rows
    assert row.still_owned is False


def test_an_unknown_category_hint_is_none_and_a_known_one_is_kept():
    rows = parse_seed(
        HEADER + line(category_hint="hat") + line(n="2", category_hint="BOTTOM")
    ).rows
    assert [row.category for row in rows] == [None, "bottom"]


def test_a_bad_date_or_price_is_empty_not_fatal():
    (row,) = parse_seed(HEADER + line(date="soon", price_usd="free")).rows
    assert row.bought_on is None and row.price is None


@pytest.mark.parametrize(
    ("over", "word"),
    [
        ({"source": "amazon"}, "source"),
        ({"name": ""}, "no name"),
        ({"still_owned": "maybe"}, "still_owned"),
    ],
)
def test_an_unreadable_line_is_counted_and_worded(over, word):
    parsed = parse_seed(HEADER + line(**over) + line(n="2"))
    assert len(parsed.rows) == 1
    assert parsed.unreadable == 1
    assert "Line 2" in parsed.problems[0] and word in parsed.problems[0]


def test_only_five_problems_are_worded_but_all_are_counted():
    parsed = parse_seed(HEADER + line(name="") * 8)
    assert parsed.unreadable == 8 and len(parsed.problems) == 5


def test_a_file_without_the_needed_columns_is_refused():
    with pytest.raises(SeedFileError, match="source"):
        parse_seed("name,still_owned\nTee,yes\n")
    with pytest.raises(SeedFileError):
        parse_seed("")


def test_a_file_that_is_not_utf8_or_too_long_is_refused():
    with pytest.raises(SeedFileError, match="UTF-8"):
        parse_seed(b"\xff\xfe\x00bad")
    with pytest.raises(SeedFileError, match=str(MAX_ROWS)):
        parse_seed(HEADER + line() * (MAX_ROWS + 1))


def test_optional_columns_may_be_missing():
    parsed = parse_seed("source,name,still_owned\nduer,Shorts,yes\n")
    (row,) = parsed.rows
    assert row.source == "duer" and row.size is None and row.image_url is None


def test_blank_lines_are_skipped():
    assert len(parse_seed(HEADER + line() + ",,,,,,,,,,,,,\n").rows) == 1


def test_the_item_number_and_size_decide_when_the_store_gave_a_number():
    a = dup_key("stitchfix", "O1", "SKU-9", "Tee", "Red", "M")
    b = dup_key("stitchfix", "O2", " sku-9 ", "Other name", "Blue", " m ")
    assert a == b
    assert dup_key("duer", "O1", "SKU-9", "Tee", "Red", "M") != a
    # The same item in another size is another piece.
    assert dup_key("stitchfix", "O1", "SKU-9", "Tee", "Red", "L") != a


def test_a_stored_80_character_value_matches_the_full_one():
    full = "x" * 120
    assert dup_key("duer", full, None, "Tee", "Red", "M") == dup_key(
        "duer", full[:80], None, "Tee", "Red", "M"
    )
    assert dup_key("duer", "O", full, "Tee", "Red", "M") == dup_key(
        "duer", "O", full[:80], "Tee", "Red", "M"
    )


def test_without_an_item_number_the_order_line_decides():
    a = dup_key("duer", "O1", None, "Tee", "Red", "M")
    assert a == dup_key("duer", "o1", None, " tee ", "RED", "m")
    assert a != dup_key("duer", "O1", None, "Tee", "Red", "L")
    assert a != dup_key("duer", "O2", None, "Tee", "Red", "M")


def test_the_not_owned_key_follows_the_design():
    assert not_owned_key("stitchfix", "O1", "SKU", "Tee", "Red", "M") == (
        "stitchfix|o1|sku"
    )
    assert not_owned_key("duer", "O1", None, "Tee", "Red", "M") == "duer|o1|tee+red+m"
    # Two colours of one name in an order are two pieces.
    assert not_owned_key("duer", "O1", None, "Tee", "Blue", "M") != (
        not_owned_key("duer", "O1", None, "Tee", "Red", "M")
    )


def test_the_payload_carries_the_fields_check_shows_and_the_servers_own_record():
    (row,) = parse_seed(HEADER + line()).rows
    payload = entry_payload(row)
    assert payload["name"] == "Test Tee" and payload["color_name"] == "Burgundy"
    assert payload["primary_color"] == "red"
    assert payload["acquired_on"] == "2025-03-04"
    assert payload["category"] == "top"
    assert payload["image"] == "pending"
    assert payload["seed"]["key"] == row_dup_key(row)
    assert payload["seed"]["price_usd"] == "48.00"
    assert payload["seed"]["image_url"] == "https://img.example.test/a.jpg"


def test_a_colour_with_no_family_leaves_primary_color_out():
    (row,) = parse_seed(HEADER + line(color_name="TWILL", image_url="")).rows
    payload = entry_payload(row)
    assert "primary_color" not in payload and payload["image"] == "none"
