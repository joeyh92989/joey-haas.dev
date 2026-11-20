"""spots.py: pure, no database."""

from dataclasses import dataclass

import pytest

import spots

UNION_STATION = (39.7530, -105.0001)
CIVIC_CENTER = (39.7392, -104.9903)


@dataclass(frozen=True)
class Anchor:
    name: str
    lat: float
    lng: float


# --- tags ---------------------------------------------------------------------


def test_tags_come_back_in_vocabulary_order_without_repeats():
    assert spots.canonical_tags(["Food", " coffee", "food", ""]) == ["coffee", "food"]


def test_an_unknown_tag_is_refused_by_name():
    with pytest.raises(ValueError, match="'brunch'"):
        spots.canonical_tags(["coffee", "brunch"])


OLD_SIX = ["coffee", "park", "food", "kid-ok", "rainy-day", "bike-friendly"]
NEW_FOURTEEN = [
    "cinema", "theatre", "ice-cream", "brewery", "zoo", "aquarium", "mini-golf",
    "bowling", "arcade", "climbing", "ice-rink", "pool", "nature-reserve",
    "trailhead",
]  # fmt: skip


def test_the_vocabulary_is_the_old_six_then_the_new_fourteen_in_order():
    assert list(spots.TAGS) == OLD_SIX + NEW_FOURTEEN
    assert len(spots.TAGS) == 20


@pytest.mark.parametrize("tag", NEW_FOURTEEN)
def test_every_new_tag_is_accepted(tag):
    assert spots.canonical_tags([tag.upper()]) == [tag]


def test_new_tags_sort_after_the_old_six_whatever_the_input_order():
    assert spots.canonical_tags(["trailhead", "cinema", "coffee"]) == [
        "coffee",
        "cinema",
        "trailhead",
    ]


def test_an_unknown_tag_is_still_refused_among_new_ones():
    with pytest.raises(ValueError, match="'brunch'.*cinema"):
        spots.canonical_tags(["zoo", "brunch"])


def test_no_tags_is_allowed():
    assert spots.canonical_tags([]) == []


# --- slugs --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Union Station", "union-station"),
        ("Café Max", "cafe-max"),
        ("  Sloan's Lake!! ", "sloan-s-lake"),
        ("Tattered Cover — Colfax", "tattered-cover-colfax"),
    ],
)
def test_slugify(name, slug):
    assert spots.slugify(name) == slug


def test_a_name_with_nothing_to_slug_is_refused():
    with pytest.raises(ValueError):
        spots.slugify("—")


def test_unique_slug_suffixes_until_free():
    assert spots.unique_slug("Union Station", []) == "union-station"
    taken = {"union-station", "union-station-2"}
    assert spots.unique_slug("Union Station", taken) == "union-station-3"


def test_unique_slug_stays_within_the_column():
    name = "a" * 300
    slug = spots.unique_slug(name, {"a" * spots.SLUG_MAX})
    assert len(slug) <= spots.SLUG_MAX
    assert slug.endswith("-2")


# --- coordinates --------------------------------------------------------------


@pytest.mark.parametrize(
    "pasted",
    [
        "39.75, -104.99",
        "39.75,-104.99",
        "39.75 -104.99",
        " 39.75°, -104.99° ",
        "https://www.google.com/maps/place/Somewhere/@39.75,-104.99,15z/data=x",
    ],
)
def test_parse_coords_accepts_what_maps_apps_paste(pasted):
    assert spots.parse_coords(pasted) == (39.75, -104.99)


def test_a_place_url_gives_the_pin_not_the_map_centre():
    pasted = (
        "https://www.google.com/maps/place/Corvus+Coffee/@39.7101,-104.9902,17z"
        "/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d39.70984!4d-104.98761!16s%2Fg"
    )
    assert spots.parse_coords(pasted) == (39.70984, -104.98761)


def test_reversed_pair_is_named():
    with pytest.raises(ValueError, match="reversed"):
        spots.parse_coords("-104.99, 39.75")


@pytest.mark.parametrize("pasted", ["", "Denver", "39.75", "39.75, -104.99, 5"])
def test_unreadable_coordinates_are_refused(pasted):
    with pytest.raises(ValueError, match="latitude, longitude"):
        spots.parse_coords(pasted)


def test_out_of_range_coordinates_are_refused():
    with pytest.raises(ValueError, match="Latitude"):
        spots.parse_coords("95, 100")
    with pytest.raises(ValueError, match="Longitude"):
        spots.parse_coords("39.75, -190")


# --- distance -----------------------------------------------------------------


def test_haversine_matches_a_known_distance():
    # Union Station to the Civic Center: 0.0138° of latitude (0.95 mi) and
    # 0.0098° of longitude (0.52 mi at 39.7°N), so about 1.09 miles.
    assert spots.haversine_miles(UNION_STATION, CIVIC_CENTER) == pytest.approx(
        1.09, abs=0.01
    )
    assert spots.haversine_miles(UNION_STATION, UNION_STATION) == 0


@pytest.mark.parametrize(
    ("miles", "mode"),
    [
        (0.0, "walk"),
        (0.99, "walk"),
        (1.0, "bike"),
        (2.99, "bike"),
        (3.0, "drive or bus"),
    ],
)
def test_distance_bands(miles, mode):
    assert spots.distance_mode(miles) == mode


def test_distance_line_wording():
    assert spots.distance_line(0.63, "Union Station") == (
        "0.6 mi from Union Station · on foot"
    )
    assert spots.distance_line(1.4, "Home") == "1.4 mi from Home · by bike"
    assert spots.distance_line(7.25, "Home") == "7.2 mi from Home · drive or bus"


def test_nearest_anchor_picks_the_closest():
    home = Anchor("Home", *CIVIC_CENTER)
    office = Anchor("Office", *UNION_STATION)
    near = spots.nearest_anchor((39.7525, -105.0), [home, office])
    assert near is not None
    assert near.anchor is office
    assert near.miles < 0.1


def test_no_anchors_means_no_nearest():
    assert spots.nearest_anchor(CIVIC_CENTER, []) is None


# --- cities -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Denver", "denver"),
        (" DENVER ", "denver"),
        ("denver", "denver"),
        ("Den  ver", "den ver"),
        ("a" * 40, "a" * 40),
        ("  " + "A" * 40 + "  ", "a" * 40),
        ("Den\x00ver", "denver"),
        ("Den​ver", "denver"),
        ("Fort Collins", "fort collins"),
    ],
)
def test_normalize_city(raw, expected):
    assert spots.normalize_city(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "\x00", "​ ​"])
def test_a_blank_city_is_refused(raw):
    with pytest.raises(ValueError, match="A city is required."):
        spots.normalize_city(raw)


@pytest.mark.parametrize("raw", ["a" * 41, "x" * 100_000])
def test_a_long_city_is_refused(raw):
    with pytest.raises(ValueError, match="A city is at most 40 characters."):
        spots.normalize_city(raw)


def test_a_public_place_has_to_be_in_denver():
    spots.check_public_city("Denver", True)
    spots.check_public_city("boulder", False)
    with pytest.raises(ValueError, match="A public place has to be in Denver."):
        spots.check_public_city("boulder", True)
