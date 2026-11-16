"""closet_colors.colour_family: a store's colour wording to a plain family (D3)."""

import subprocess
import sys

import pytest

from closet_colors import FAMILIES, colour_family


@pytest.mark.parametrize(
    ("store", "family"),
    [
        ("Burgundy", "red"),
        ("Maroon", "red"),
        ("Marsala", "red"),
        ("Green", "green"),
        ("Light Green", "green"),
        ("Olive", "green"),
        ("Army Green", "green"),
        ("MILITARY GREEN", "green"),
        ("Mint", "green"),
        ("Forest Night", "green"),
        ("Vetiver", "green"),
        ("Beige", "beige"),
        ("SAND", "beige"),
        ("Tan", "tan"),
        ("Khaki", "tan"),
        ("Grey", "grey"),
        ("Gull", "grey"),
        ("Forged Iron", "grey"),
        ("Navy", "navy"),
        ("Blue", "blue"),
        ("Light Blue", "blue"),
        ("Stone Wash", "blue"),
        ("Galactic", "blue"),
        ("Brown", "brown"),
        ("Red", "red"),
        ("Black", "black"),
        ("White", "white"),
        ("Off-White", "white"),
        ("off white", "white"),
        ("Gold", "yellow"),
        ("Burnt Orange", "orange"),
        ("Orange", "orange"),
        ("Purple", "purple"),
        ("Flamingo", "pink"),
    ],
)
def test_store_wording_maps_to_a_family(store, family):
    assert colour_family(store) == family


@pytest.mark.parametrize(
    "store",
    [
        "TWILL",  # a weave, not a colour
        "Tan Geo Print",  # a print has no one family: the owner decides
        "Navy Stripe",
        "Blue/Grey",  # two families disagree
        "",
        None,
        "   ",
        "Sparkle",
    ],
)
def test_what_is_not_one_colour_is_left_to_the_owner(store):
    assert colour_family(store) is None


def test_longest_match_wins_over_a_word_inside_it():
    # "orange" alone is orange, but "burnt orange" is one phrase also orange;
    # "stone wash" must not read "stone" (beige) first.
    assert colour_family("Stone Wash") == "blue"
    assert colour_family("Stone") == "beige"


def test_the_same_family_twice_is_still_one_answer():
    assert colour_family("Olive Green") == "green"


def test_every_answer_is_in_the_vocabulary():
    for word in ("Burgundy", "Gull", "Galactic", "Flamingo", "Khaki"):
        assert colour_family(word) in FAMILIES


def test_the_module_is_pure():
    code = (
        "import sys, closet_colors; "
        "bad = [m for m in ('fastapi', 'sqlalchemy', 'models', 'db') "
        "if m in sys.modules]; print(','.join(bad))"
    )
    out = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert out.stdout.strip() == ""
