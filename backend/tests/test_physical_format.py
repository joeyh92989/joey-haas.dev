"""The format classifier, one test per phrase the stores actually use.

Phrases are from research §2.3 and the spec, in the words the stores wrote
them; the recorded fixtures confirm the ones still live.
"""

import json
import time
from pathlib import Path

import pytest

from physical_sources.format import NOTHING, classify, plain_text

FIXTURES = Path(__file__).parent / "fixtures" / "physical"

KEY_CARD = [
    (
        "Switch 2 Collector's Edition comes with Game Key Card*",
        "game_key_card",
        "Game Key Card",
    ),
    ("Includes a Game-Key Card for the full game.", "game_key_card", "Game-Key Card"),
    ("Nintendo Switch 2 GameKeyCard", "game_key_card", "GameKeyCard"),
    (
        "Full game download via internet required.",
        "game_key_card",
        "Full game download via internet required",
    ),
    ("PC version: Download code in a box.", "code_in_box", "Download code in a box"),
    ("Retail box, code-in-a-box edition.", "code_in_box", "code-in-a-box"),
]

FULL_CART = [
    ("Full game on cartridge (no download, no patch)", "Full game on cartridge"),
    ("Official full physical cartridge release", "full physical cartridge"),
    ("The NSW2 cartridge includes the full game.", "cartridge includes the full game"),
    ("It is a Game Card. It contains the entire game data", "is a Game Card"),
    ("the entire game data on cartridge", "entire game data on cartridge"),
    ("Full game included on cartridge", "Full game included on cartridge"),
    (
        "Switch and Switch 2 games come on a full game cartridge",
        "full game cartridge",
    ),
    (
        "- Fully assembled Nintendo Switch 2 game with cartridge - Interior art",
        "Fully assembled Nintendo Switch 2 game with cartridge",
    ),
    ("game on cartridge, ready to play out-of-the-box", "game on cartridge"),
    ("the entire game experience, complete on cartridge", "complete on cartridge"),
    ("region-free physical cart for Switch", "region-free physical cart"),
    ("Switch Case and Cartridge", "Switch Case and Cartridge"),
    ("Nintendo Switch Physical Case and Game", "Physical Case and Game"),
    ("Both games are on the same cartridge.", "on the same cartridge"),
    ("Metal Slug (Game Card)", "(Game Card)"),
]


@pytest.mark.parametrize(("text", "fmt", "evidence"), KEY_CARD)
def test_key_card_phrases(text, fmt, evidence):
    assert classify(text, None, 508) == (
        type(NOTHING)(fmt, "store_text", None, evidence)
    )


@pytest.mark.parametrize(("text", "evidence"), FULL_CART)
def test_full_cart_phrases(text, evidence):
    result = classify(text, None, 508)
    assert (result.format, result.tier, result.evidence) == (
        "game_card",
        "store_text",
        evidence,
    )


def test_complete_on_disc_is_a_disc():
    result = classify("complete on disc, no download", None, 167)
    assert (result.format, result.tier) == ("disc", "store_text")


@pytest.mark.parametrize(
    "text",
    [
        "Includes a download code for the original soundtrack.",
        "Includes a code in the box for Bonus Game",
        "Club members get a Teeto Key",
        "Comes with a Steam Key",
    ],
)
def test_false_positives_alone_say_nothing(text):
    assert classify(text, None, 508) == NOTHING


def test_a_false_positive_does_not_hide_a_real_phrase():
    text = "Includes a download code for the soundtrack. Full game on cartridge."
    assert classify(text, None, 508).format == "game_card"


def test_the_fangamer_upgrade_pack_is_a_switch_1_cartridge():
    text = (
        "Includes the Nintendo Switch game and the Nintendo Switch 2 Edition "
        "upgrade pack. Upgrade pack also available separately."
    )
    result = classify(text, None, 508)
    assert (result.format, result.tier, result.platform_override) == (
        "game_card",
        "store_text",
        130,
    )


def test_key_card_beats_full_cart_when_both_appear():
    text = "Full game on cartridge for PS5; Switch 2 edition is a Game Key Card."
    assert classify(text, None, 508).format == "game_key_card"


def test_store_policy_when_text_is_silent():
    assert classify("A lovely game.", "game_card", 508) == type(NOTHING)(
        "game_card", "store_policy", None, None
    )


def test_platform_policy_for_switch_1_and_n64():
    for platform in (130, 4):
        assert classify("", None, platform) == type(NOTHING)(
            "game_card", "platform_policy", None, None
        )


def test_switch_2_with_nothing_is_unknown():
    assert classify("A lovely game.", None, 508) == NOTHING
    assert classify("", None, None) == NOTHING


def test_html_is_read_as_text():
    body = (
        "<p>Fully assembled <strong>Nintendo Switch 2</strong> game with cartridge</p>"
    )
    assert plain_text(body) == "Fully assembled Nintendo Switch 2 game with cartridge"
    assert classify(body, None, 508).format == "game_card"


# --- On the recorded store bodies. --------------------------------------------


def _product(path: str, title_part: str) -> dict:
    products = json.loads((FIXTURES / path).read_text())["products"]
    return next(p for p in products if title_part in p["title"])


def test_super_rare_midnight_walk_body():
    product = _product("shopify/super_rare/switch-2.p1.json", "Sw2#02")
    result = classify(product["body_html"], None, 508)
    assert result.evidence == "Fully assembled Nintendo Switch 2 game with cartridge"


def test_strictly_limited_shenmue_body():
    product = _product(
        "shopify/strictly_limited/nintendo-switch-2.p1.json", "Shenmue III"
    )
    # The body says it twice; the more specific phrase is the evidence.
    assert "full physical cartridge" in product["body_html"]
    assert classify(product["body_html"], None, 508).evidence == (
        "cartridge includes the full game"
    )


def test_fangamer_stardew_body_is_the_upgrade_pack():
    product = _product("shopify/fangamer/video-games.p1.json", "Stardew")
    assert classify(product["body_html"], None, 508).platform_override == 130


def test_an_unclosed_tag_flood_is_read_in_linear_time():
    started = time.perf_counter()
    assert plain_text("<" * 100_000).startswith("<")
    assert time.perf_counter() - started < 0.5
