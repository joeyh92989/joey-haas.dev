"""The pasted-line reader: map links, bare pairs, names, and the blob splitter."""

import ast
from pathlib import Path

import pytest

from spot_sources import map_links
from spot_sources.map_links import MAX_LINES, read_line, split_lines

LONG_PLACE = (
    "https://www.google.com/maps/place/Red+Rocks+Amphitheatre/@39.6654,-105.2057,17z"
    "/data=!3m1!4b1!4m6!3m5!1s0x876b8c1a:0x1!8m2!3d39.665!4d-105.2058!16zL20vMDIz"
)


def test_google_place_url_prefers_the_data_pin_over_the_centre():
    r = read_line(LONG_PLACE)
    assert r.kind == "coords"
    assert (r.lat, r.lng) == (39.665, -105.2058)
    assert r.name == "Red Rocks Amphitheatre"


def test_google_at_pair_with_zoom():
    r = read_line("https://www.google.com/maps/@39.665,-105.2058,17z")
    assert (r.kind, r.lat, r.lng, r.name) == ("coords", 39.665, -105.2058, None)


@pytest.mark.parametrize("param", ["q", "query", "ll"])
def test_google_query_pair(param):
    r = read_line(f"https://maps.google.com/?{param}=39.7392,-104.9903")
    assert (r.kind, r.lat, r.lng, r.name) == ("coords", 39.7392, -104.9903, None)


def test_google_q_name_only_is_a_name_link():
    r = read_line("https://www.google.com/maps?q=Red+Rocks+Amphitheatre")
    assert (r.kind, r.name) == ("name_link", "Red Rocks Amphitheatre")


def test_google_query_name_only():
    r = read_line("https://google.com/maps/search/?api=1&query=Union%20Station")
    assert (r.kind, r.name) == ("name_link", "Union Station")


def test_place_name_decoding_percent_and_plus():
    r = read_line(
        "https://www.google.com/maps/place/Caf%C3%A9+Mercato/@39.7,-105.0,15z"
    )
    assert r.name == "Café Mercato"


def test_place_name_ignores_trailing_path_pieces():
    r = read_line("https://www.google.com/maps/place/Union+Station/data=!4m2")
    assert (r.kind, r.name) == ("name_link", "Union Station")


def test_osm_map_fragment():
    r = read_line("https://www.openstreetmap.org/#map=17/39.7392/-104.9903")
    assert (r.kind, r.lat, r.lng) == ("coords", 39.7392, -104.9903)


def test_osm_mlat_mlon():
    r = read_line("https://openstreetmap.org/?mlat=39.7392&mlon=-104.9903#map=15/1/2")
    assert (r.kind, r.lat, r.lng) == ("coords", 39.7392, -104.9903)


def test_out_of_range_link_carries_no_coordinates():
    r = read_line("https://www.google.com/maps/@95.0,-105.2058,17z")
    assert r.kind == "name"
    r = read_line("https://www.openstreetmap.org/#map=17/39.7/-200.5")
    assert r.kind == "name"


def test_out_of_range_with_name_is_a_name_link():
    r = read_line("https://www.google.com/maps/place/Nowhere/@95.0,-105.0,17z")
    assert (r.kind, r.name) == ("name_link", "Nowhere")


def test_unknown_host_is_plain_text():
    line = "https://example.org/maps/place/Foo/@39.7,-104.9,17z"
    r = read_line(line)
    assert (r.kind, r.name) == ("name", line)


def test_non_http_scheme_is_plain_text():
    r = read_line("ftp://www.google.com/maps/@39.7,-104.9,17z")
    assert r.kind == "name"


@pytest.mark.parametrize(
    "url",
    [
        "https://maps.app.goo.gl/AbCdEf123",
        "https://goo.gl/maps/AbCdEf123",
        "https://goo.gl/AbCdEf123",
        "https://g.co/maps/AbCdEf",
    ],
)
def test_short_links_are_flagged_never_read(url):
    r = read_line(url)
    assert r.kind == "short_link"
    assert r.host in {"maps.app.goo.gl", "goo.gl", "g.co"}
    assert r.note


def test_g_co_without_maps_path_is_plain_text():
    assert read_line("https://g.co/kgs/abc").kind == "name"


@pytest.mark.parametrize("line", ["39.7392, -104.9903", "39.7392 -104.9903"])
def test_bare_pair(line):
    r = read_line(line)
    assert (r.kind, r.lat, r.lng, r.name) == ("coords", 39.7392, -104.9903, None)


def test_plain_name():
    r = read_line("  Union Station  ")
    assert (r.kind, r.name) == ("name", "Union Station")


def test_too_long_line():
    r = read_line("a" * 301)
    assert r.kind == "too_long"
    assert r.note
    assert read_line("a" * 300).kind == "name"


@pytest.mark.parametrize("line", ["", "   ", "\t "])
def test_empty(line):
    assert read_line(line).kind == "empty"


def test_name_cleaning_whitespace_controls_and_cut():
    r = read_line("https://www.google.com/maps/place/A%20%20B%0A%00C/@39.7,-104.9,15z")
    assert r.name == "A BC"
    r = read_line(
        "https://www.google.com/maps/place/" + "x" * 230 + "/@39.7,-104.9,15z"
    )
    assert len(r.name) == 200


def test_name_cleaning_to_empty_drops_the_name():
    r = read_line("https://www.google.com/maps/place/%20%20/@39.7,-104.9,15z")
    assert (r.kind, r.name) == ("coords", None)


def test_split_basic_counts_and_order():
    s = split_lines("A\n\n  \nB\na \n b\nC")
    assert s.lines == ["A", "B", "C"]
    assert s.blank == 2
    assert s.duplicates == 2
    assert s.over_limit == 0


def test_split_crlf():
    s = split_lines("A\r\nB\r\n\r\nA")
    assert (s.lines, s.blank, s.duplicates) == (["A", "B"], 1, 1)


def test_split_dedupe_ignores_inner_whitespace_and_case():
    s = split_lines("Red  Rocks\nred rocks")
    assert s.lines == ["Red  Rocks"]
    assert s.duplicates == 1


def test_split_cap():
    s = split_lines("\n".join(f"place {i}" for i in range(250)))
    assert len(s.lines) == MAX_LINES == 200
    assert s.over_limit == 50
    assert s.lines[0] == "place 0"


def test_module_is_pure():
    tree = ast.parse(Path(map_links.__file__).read_text())
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split(".")[0])
    banned = {
        "httpx",
        "requests",
        "urllib3",
        "socket",
        "fastapi",
        "sqlalchemy",
        "aiohttp",
        "http",
        "random",
        "time",
        "datetime",
    }
    assert not roots & banned
