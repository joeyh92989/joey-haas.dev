"""Dates, status, edition labels and titles, on the stores' own wording."""

import json
import re
import time
from datetime import date
from pathlib import Path

import pytest

from physical_sources.parse import (
    edition_label,
    find_date,
    game_title,
    parse_loose_date,
    parse_preorder_close,
    parse_release,
    parse_ymd,
    status_from,
    strip_title,
)

FIXTURES = Path(__file__).parent / "fixtures" / "physical"
LRG_STRIP = (re.compile(r"^(Switch|PS5|PS4|Xbox) Limited Run #\d+: ", re.I),)
SUPER_RARE_STRIP = (
    re.compile(r"^\[Special Edition\]\s*", re.I),
    re.compile(r"^(?:Sw2|SRG|SE|SW)#\d+:\s*", re.I),
)
LRG_STATUS = (
    "collection:coming-soon=preorder",
    "collection:latest-releases=preorder",
    "available",
)


def _products(path: str) -> list[dict]:
    return json.loads((FIXTURES / path).read_text())["products"]


# --- Release dates -------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected", "precision"),
    [
        ("Shipping Q4 2026", date(2026, 10, 1), "quarter"),
        ("Releasing Fall 2026!", date(2026, 10, 1), "quarter"),
        ("Releasing Spring 2027", date(2027, 4, 1), "quarter"),
        ("Release Date EST 2026: Coming Soon", date(2026, 1, 1), "year"),
        ("EST 2026: Coming Soon", date(2026, 1, 1), "year"),
        ("Release Date: November 19, 2026", date(2026, 11, 19), "day"),
        ("Release Date:  Q3 2026  Developer: Nicalis", date(2026, 7, 1), "quarter"),
        ("Release Date:     July 31st, 2018", date(2018, 7, 31), "day"),
        ("Estimated Ship Date: Dec 1 - Jan 31 2027", date(2026, 12, 1), "month"),
        ("🟣 Estimated ship date Jan 12 – 31, 2027", date(2027, 1, 1), "month"),
    ],
)
def test_parse_release(text, expected, precision):
    value, found_precision, phrase = parse_release(text)
    assert (value, found_precision) == (expected, precision)
    assert phrase


def test_a_yearless_shipping_wave_is_not_dated_from_a_later_sentence():
    # iam8bit's Legacy Cartridge text, verbatim shape from the fixture.
    text = "Wave 1 - Shipping Q3 Wave 2 - Shipping Q4 Remaining Orders - Q1 2027"
    assert parse_release(text) == (None, None, None)


def test_no_anchor_no_date():
    assert parse_release("A lovely game from 2019.") == (None, None, None)


def test_preorder_close_from_the_limited_run_body():
    body = next(
        p["body_html"]
        for p in _products("shopify/limited_run/coming-soon.p1.json")
        if p["title"].startswith("Terranigma: Foiled")
    )
    assert parse_preorder_close(body) == date(2026, 11, 8)


def test_preorder_close_exact_text():
    text = "PRE-ORDERS CLOSE ON SUNDAY, NOVEMBER 8, 2026, AT 11:59 PM EASTERN TIME."
    assert parse_preorder_close(text) == date(2026, 11, 8)
    assert parse_preorder_close("No deadline here.") is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Aug 27, 2026", (date(2026, 8, 27), "day")),
        ("Dec 9, 2025", (date(2025, 12, 9), "day")),
        ("2027", (date(2027, 1, 1), "year")),
        ("Q1 2027", (date(2027, 1, 1), "quarter")),
        ("Q4 2026", (date(2026, 10, 1), "quarter")),
        ("Nov 2026", (date(2026, 11, 1), "month")),
        ("2026-11", (date(2026, 11, 1), "month")),
        ("2026/11/19", (date(2026, 11, 19), "day")),
        ("TBA", (None, None)),
        ("", (None, None)),
        (None, (None, None)),
    ],
)
def test_parse_loose_date(text, expected):
    assert parse_loose_date(text) == expected


def test_parse_ymd():
    assert parse_ymd("2026/09/18") == date(2026, 9, 18)
    assert parse_ymd("2026-09-18") == date(2026, 9, 18)
    assert parse_ymd("1899/12/30") == date(1899, 12, 30)
    assert parse_ymd("Sep 18, 2026") is None
    assert parse_ymd("2026/02/30") is None
    assert parse_ymd("") is None


def test_find_date_takes_the_earliest_phrase():
    assert find_date("Nov 2026, then 2027")[:2] == (date(2026, 11, 1), "month")


# --- Titles and edition labels -----------------------------------------------------


@pytest.mark.parametrize(
    ("title", "patterns", "expected"),
    [
        (
            "Switch Limited Run #270: 9 Years of Shadows",
            LRG_STRIP,
            "9 Years of Shadows",
        ),
        ("Sw2#02: The Midnight Walk", SUPER_RARE_STRIP, "The Midnight Walk"),
        ("SW2#02: The Midnight Walk", SUPER_RARE_STRIP, "The Midnight Walk"),
        (
            "[Special Edition] SE#02: The Midnight Walk",
            SUPER_RARE_STRIP,
            "The Midnight Walk",
        ),
        (
            "Terranigma: Foiled Standard Edition (Switch 2, PS5, Xbox)",
            (),
            "Terranigma: Foiled",
        ),
        (
            "Alisa: Developer's Cut - Standard Edition (Pre-order)",
            (),
            "Alisa: Developer's Cut",
        ),
        ("R-Type DX - Collector’s Edition (GBC)", (), "R-Type DX"),
        ("Hollow Knight: Silksong Standard Edition", (), "Hollow Knight: Silksong"),
        ("Absolum - Nintendo Switch 2 Edition", (), "Absolum"),
        ("Cast n Chill – Nintendo Switch 2 Edition", (), "Cast n Chill"),
        ("Culdcept Begins -Nintendo Switch 2 Edition- ", (), "Culdcept Begins"),
        ("Dark Auction Nintendo Switch 2 Edition", (), "Dark Auction"),
        (
            "Kirby and the Forgotten Land Nintendo Switch 2 Edition"
            " + Star-Crossed World",
            (),
            "Kirby and the Forgotten Land",
        ),
        (
            "A-Train Hajimaru Kankou Keikaku - Nintendo Switch 2 Edition"
            " - Guidebook Pack",
            (),
            "A-Train Hajimaru Kankou Keikaku",
        ),
        ("Hades II Nintendo Switch™ 2 Edition", (), "Hades II"),
        ("Cyberpunk 2077: Ultimate Edition", (), "Cyberpunk 2077: Ultimate Edition"),
        (
            "Nintendo Switch 2 Edition Upgrade Pack",
            (),
            "Nintendo Switch 2 Edition Upgrade Pack",
        ),
        ("Deluxe  Edition", (), "Deluxe Edition"),
    ],
)
def test_strip_title(title, patterns, expected):
    assert strip_title(title, patterns) == expected


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Duskbloods, The", "The Duskbloods"),
        (
            "Adventures of Elliot: The Millennium Tales, The ",
            "The Adventures of Elliot: The Millennium Tales",
        ),
        (
            "Legend of Zelda: Breath of the Wild Nintendo Switch 2 Edition, The",
            "The Legend of Zelda: Breath of the Wild",
        ),
        (
            "Legend of Heroes: Trails from Zero / The Legend of Heroes: Trails to"
            " Azure - Deluxe Edition, The",
            "The Legend of Heroes: Trails from Zero / The Legend of Heroes: Trails"
            " to Azure",
        ),
        ("Hat in Time, A", "A Hat in Time"),
        ("Duskbloods, The - Nintendo Switch 2 Edition", "The Duskbloods"),
        ("Absolum - Nintendo Switch 2 Edition", "Absolum"),
        ("Mario Kart World", "Mario Kart World"),
        ("Order Up!!", "Order Up!!"),
    ],
)
def test_game_title(title, expected):
    assert game_title(title) == expected


@pytest.mark.parametrize(
    "run",
    [" " * 50_000, " -" * 25_000, " :" * 25_000],
    ids=["spaces", "dashes", "colons"],
)
def test_a_long_whitespace_run_is_linear(run):
    """Third-party text: the phrase patterns backtracked for minutes on this."""
    started = time.perf_counter()
    stripped = game_title(f"Duskbloods{run}x")
    assert time.perf_counter() - started < 1
    assert stripped.startswith("Duskbloods") and stripped.endswith("x")


def test_edition_label():
    title = "Terranigma: Foiled Standard Edition (Switch 2, PS5, Xbox)"
    assert edition_label(title) == "Standard"
    assert edition_label("R-Type DX - Collector’s Edition (GBC)") == "Collector's"
    assert edition_label("Order Up!!", "Standard") == "Standard"
    assert edition_label("Order Up!!", None) is None


# --- Status ------------------------------------------------------------------------


def _lrg(handle: str, title_start: str) -> dict:
    return next(
        p
        for p in _products(f"shopify/limited_run/{handle}.p1.json")
        if p["title"].startswith(title_start)
    )


def test_coming_soon_is_preorder_even_when_unavailable():
    product = _lrg("coming-soon", "Terranigma: Foiled")
    variant = product["variants"][0]
    assert variant["available"] is False
    assert status_from(LRG_STATUS, product, variant, {"coming-soon"}) == "preorder"


def test_vault_follows_availability():
    product = _lrg("the-lr-vault", "Switch Limited Run #270")
    variant = product["variants"][0]
    assert status_from(LRG_STATUS, product, variant, {"the-lr-vault"}) == "in_stock"
    unavailable = {**variant, "available": False}
    assert status_from(LRG_STATUS, product, unavailable, {"the-lr-vault"}) == "sold_out"


def test_a_sold_out_tag_counts_only_on_an_unavailable_variant():
    strategy = (
        "tag_if_unavailable:Sold Out=sold_out",
        "tag:pre-order=preorder",
        "available",
    )
    product = {"title": "Thing", "tags": ["Sold Out", "pre-order"]}
    assert status_from(strategy, product, {"available": True}, ()) == "preorder"
    assert status_from(strategy, product, {"available": False}, ()) == "sold_out"


def test_title_prefix_tag_prefix_and_title_contains():
    assert (
        status_from(
            ("title_prefix:PRE-ORDER: =preorder", "available"),
            {"title": "PRE-ORDER: Bounty Sisters"},
            {"available": True},
            (),
        )
        == "preorder"
    )
    assert (
        status_from(
            ("tag_prefix:__pre-order=preorder", "available"),
            {"title": "X", "tags": ["__pre-order::2026-12"]},
            {"available": True},
            (),
        )
        == "preorder"
    )
    assert (
        status_from(
            ("title_contains:(pre-order)=preorder", "available"),
            {"title": "Alisa - Standard Edition (Pre-order)"},
            {"available": True},
            (),
        )
        == "preorder"
    )


def test_no_step_matches_falls_back_to_availability():
    assert status_from((), {"title": "X"}, {"available": False}, ()) == "sold_out"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "Estimated Ship Date: September 15th - October 31st, 2026",
            (date(2026, 9, 1), "month"),
        ),
        (
            "Release Date: December 1st - January 31st, 2027",
            (date(2026, 12, 1), "month"),
        ),
    ],
)
def test_long_ship_windows(text, expected):
    assert parse_release(text)[:2] == expected


def test_an_impossible_date_gives_way_to_the_next():
    assert find_date("2025-26 then March 3, 2026")[:2] == (date(2025, 1, 1), "year")


def test_a_preorder_close_with_an_abbreviated_month():
    assert parse_preorder_close("Pre-orders close Nov. 8, 2026.") == date(2026, 11, 8)


@pytest.mark.parametrize(
    "text",
    [
        "Pre-orders close soon. Ships November 8, 2026.",
        "Pre-orders close when stock runs out. Release date: December 1, 2026",
        "Pre-orders close at the end of the month. Estimated ship date: March 3, 2027",
    ],
)
def test_a_date_in_the_next_sentence_is_not_the_close(text):
    assert parse_preorder_close(text) is None
