"""Dates, status, edition labels and titles, on the stores' own wording."""

import json
import re
import time
from datetime import date
from pathlib import Path

import pytest

from physical_sources.parse import (
    edition_fallbacks,
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
        # Decision: a key names the base game, so a named edition goes too.
        ("Cyberpunk 2077: Ultimate Edition", (), "Cyberpunk 2077"),
        (
            "Nintendo Switch 2 Edition Upgrade Pack",
            (),
            "Nintendo Switch 2 Edition Upgrade Pack",
        ),
        ("Deluxe  Edition", (), "Deluxe Edition"),
        # Platform words, regions, packaging editions and bundles (store keys).
        ("7th Sector (NSW)", (), "7th Sector"),
        ("7th Sector Special Limited Edition (NSW)", (), "7th Sector"),
        ("7'scarlet - Nintendo Switch™", (), "7'scarlet"),
        ("Jack Jeanne - Silver Edition - Nintendo Switch™", (), "Jack Jeanne"),
        ("Tin & Kuna - Various Platforms (PS4, NSW, XBOX)", (), "Tin & Kuna"),
        (
            "C.A.R.D.S. RPG: The Misty Battlefield  -Total Warfare Edition- "
            "(Various Platforms (PS4, NSW))",
            (),
            # "Total Warfare" is a named edition: it stays.
            "C.A.R.D.S. RPG: The Misty Battlefield -Total Warfare Edition",
        ),
        ("Just Shapes & Beats for Nintendo Switch™", (), "Just Shapes & Beats"),
        ("UFO 50 for Nintendo Switch™ Deluxe Edition", (), "UFO 50"),
        ("Bugsnax for PlayStation 5 and PlayStation 4", (), "Bugsnax"),
        ("Zombie Night Terror - Nintendo Switch", (), "Zombie Night Terror"),
        (
            "9 Years of Shadows Collector's Edition [PlayStation 5]",
            (),
            "9 Years of Shadows",
        ),
        (
            "Darius Extra Cozmic Bundle (NSW/SMD)",
            (),
            "Darius Extra Cozmic Bundle",  # no merch word: more than one game
        ),
        (
            "Tavern Talk Complete Edition - Limited Edition (Nintendo Switch)",
            (),
            "Tavern Talk",
        ),
        ("Lies of P: Complete Edition Marionette Bundle", (), "Lies of P"),
        (
            "Pocky & Rocky Reshrined Plushie Bundle (NSW)",
            (),
            "Pocky & Rocky Reshrined",
        ),
        (
            "Spirit Hunter: Death Mark II - Standard Edition (with Soundtrack CD)",
            (),
            "Spirit Hunter: Death Mark II",
        ),
        (
            "Atomicrops – Complete Edition Nintendo Switch First Press SE",
            (),
            "Atomicrops",
        ),
        ("Symphonia Nintendo Switch Limited to 1,000", (), "Symphonia"),
        (
            "Blue Prince (iam8bit Nintendo Switch 2 Exclusive Edition)",
            (),
            "Blue Prince",
        ),
        ("Minecraft for Nintendo Switch 2", (), "Minecraft"),
        (
            "Andro Dunos 2 Limited Edition Box SWITCH [EUR]",
            (re.compile(r"\s+SWITCH\b.*$", re.I),),  # PixelHeart's own strip
            "Andro Dunos 2",
        ),
        (
            "Popslinger - Extra Elite Edition [Nintendo Switch",
            (),
            "Popslinger",
        ),
        (
            "Yuppie Psycho: Executive Edition - Standard Cover (Nintendo Switch)",
            (),
            "Yuppie Psycho: Executive Edition",
        ),
        (
            "Code: Realize ~Future Blessings~ Day One Edition - Nintendo Switch™",
            (),
            "Code: Realize ~Future Blessings~",
        ),
        ("Rick Henderson (Extra Edition) [Nintendo Switch]", (), "Rick Henderson"),
        (
            "Two Point Museum: Explorer Edition",
            (),
            "Two Point Museum: Explorer Edition",
        ),
        (
            "Star Hunter DX & Space Moth: Lunar Edition Special Limited Edition (NSW)",
            (),
            "Star Hunter DX & Space Moth: Lunar Edition",
        ),
        # Review findings, 2026-09-26.
        ("A - Silver Edition B", (), "A B"),  # a space, never glued
        ("Foo + Character Cards", (), "Foo"),
        ("Blade (Switchblade)", (), "Blade (Switchblade)"),
        (
            "Bud Spencer & Terence Hill - Slaps And Beans 2 Special Edition",
            (),
            "Bud Spencer & Terence Hill - Slaps And Beans 2",
        ),
        ("Cannon Dancer - Osman Collector's Edition", (), "Cannon Dancer - Osman"),
        (
            "Asterix & Obelix - Slap them All! Ultra Collector's Edition (NSW)",
            (),
            "Asterix & Obelix - Slap them All!",
        ),
        (
            "Tales of Arise - Beyond the Dawn Edition",
            (),
            "Tales of Arise - Beyond the Dawn Edition",
        ),
        (
            "Irem Collection Volume 1 - 5 Collector's/Limited Edition Bundle "
            "(Nintendo Switch)",
            (),
            "Irem Collection Volume 1 - 5",
        ),
        ("Taito Milestones 1&2 Bundle", (), "Taito Milestones 1&2 Bundle"),
        ("Cotton Fantasy Yunomi Cup LE Bundle (NSW)", (), "Cotton Fantasy"),
        ("Cotton 16-Bit LE (NSW)", (), "Cotton 16-Bit"),
        ("Wonder Boy Collection Ultra Collector's (NSW)", (), "Wonder Boy Collection"),
        (
            "Ankora: Lost Days & Deiland: Pocket Planet Collector's Ed.",
            (),
            "Ankora: Lost Days & Deiland: Pocket Planet",
        ),
        (
            "The Ninja Saviors: Return of the Warriors (Nintendo Switch) - Preorder",
            (),
            "The Ninja Saviors: Return of the Warriors",
        ),
        ("Eagle Island Twist - Standard Release", (), "Eagle Island Twist"),
        (
            "The Binding of Isaac: Repentance Japanese Version",
            (),
            "The Binding of Isaac: Repentance",
        ),
        ("The Last Door Complete edition (EU)", (), "The Last Door"),
        ("Roboquest [PEGI]", (), "Roboquest"),
        ("ONLINE EXCLUSIVE EDTION: 7'scarlet", (), "7'scarlet"),
        (
            "ONLINE EXCLUSIVE: Dairoku: Agents of Sakuratani Online Exclusive Edition",
            (),
            "Dairoku: Agents of Sakuratani",
        ),
        (
            "The Binding of Isaac: Repentance (Japanese Version)",
            (),
            "The Binding of Isaac: Repentance",
        ),
        ("Eastward Exclusive Collector’s Edition", (), "Eastward"),
        (
            "Shadow of the Ninja - Reborn Collector's/Limited Edition",
            (),
            "Shadow of the Ninja - Reborn",
        ),
        # A named edition with no separator stays: IGDB often lists it as the
        # Switch game ("Elden Ring: Tarnished Edition").
        ("Elden Ring Tarnished Edition", (), "Elden Ring Tarnished Edition"),
        # What must not be cut: an edition name with no separator and no
        # packaging word, a platform word inside a name, a plain bracket.
        (
            "Yuppie Psycho Executive Edition - Elite Edition (Nintendo Switch)",
            (),
            "Yuppie Psycho Executive Edition",
        ),
        ("OFF Bad Human Edition for Nintendo Switch™", (), "OFF Bad Human Edition"),
        ("Everybody 1-2-Switch!", (), "Everybody 1-2-Switch!"),
        (
            "Rendering Ranger: R2 [Rewind] Standard Edition (Switch, PS5, PS4)",
            (),
            "Rendering Ranger: R2 [Rewind]",
        ),
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
    [
        " " * 50_000,
        " -" * 25_000,
        " :" * 25_000,
        "(" * 50_000,
        " (switch" * 6_000,
        " for" * 12_000,
        " Edition" * 8_000,
        " Bundle" * 8_000,
        " (NSW" * 10_000,
        " - Nintendo" * 6_000,
        " plush" * 8_000,
        " ce" * 16_000,
        " limited" * 6_000,
    ],
    ids=[
        "spaces",
        "dashes",
        "colons",
        "openers",
        "unclosed-platforms",
        "fors",
        "editions",
        "bundles",
        "unclosed-nsw",
        "dash-nintendo",
        "merch-plush",
        "merch-ce",
        "packaging-words",
    ],
)
def test_a_long_run_is_linear(run):
    """Third-party text: the title patterns backtracked for minutes on this."""
    started = time.perf_counter()
    stripped = game_title(f"Duskbloods{run}x")
    assert time.perf_counter() - started < 1
    assert stripped.startswith("Duskbloods") and stripped.endswith("x")


def test_only_a_platform_bracket_is_removed():
    assert strip_title("Blade (Switch) (Limited) [PS5]") == "Blade (Limited)"


def test_edition_fallbacks():
    assert edition_fallbacks("gex trilogy classic edition") == ["gex trilogy"]
    assert edition_fallbacks("GEX Trilogy Tail Time Edition") == [
        "gex trilogy tail",
        "gex trilogy",
    ]
    assert edition_fallbacks("Devil May Cry 5: Devil Hunter Edition") == [
        "devil may cry 5 devil",
        "devil may cry 5",
        "devil may cry",
    ]
    assert edition_fallbacks("OFF Bad Human Edition") == ["off bad"]
    assert edition_fallbacks("elden ring") == []
    assert edition_fallbacks("edition") == []
    assert edition_fallbacks("tarnished edition") == []


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
