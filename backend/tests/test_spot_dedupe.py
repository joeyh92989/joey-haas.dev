"""One place, once: the finder's dedupe over a real answer and by hand."""

import json
from dataclasses import dataclass
from pathlib import Path

from spot_sources.dedupe import dedupe, metres_between, names_agree, same_place
from spot_sources.overpass import CandidateRow, parse

FIXTURE = Path(__file__).parent / "fixtures" / "overpass_candidates.json"


@dataclass
class Known:
    name: str
    lat: float
    lng: float


def _row(source_id, name, lat, lng, category="cafe"):
    return CandidateRow(source_id, name, category, lat, lng)


def test_names_agree_on_case_punctuation_and_containment():
    assert names_agree("Illegal Pete's", "illegal petes")
    assert names_agree("Union Station", "Denver Union Station")
    assert names_agree("Huckleberry Roasters", "Huckleberry Roaster")
    assert not names_agree("Bruto", "Brutto Bar & Grill Downtown")
    assert not names_agree("", "Anything")


def test_same_place_needs_both_closeness_and_a_name():
    a = _row("node/1", "Kaffe Landscap", 39.7500, -105.0000)
    near = _row("way/2", "Kaffe Landscap", 39.7503, -105.0000)  # ~33 m
    far = _row("node/3", "Kaffe Landscap", 39.7510, -105.0000)  # ~111 m
    other = _row("node/4", "Snooze", 39.7500, -105.0000)
    assert 30 < metres_between(a, near) < 36
    assert same_place(a, near)
    assert not same_place(a, far)
    assert not same_place(a, other)


def test_the_first_of_two_is_kept():
    first = _row("node/1", "Bruto", 39.75270, -104.99680)
    second = _row("node/2", "Bruto", 39.75280, -104.99690)
    assert dedupe([first, second]) == [first]


def test_a_chain_is_not_one_place():
    a = _row("node/1", "Starbucks", 39.7573, -104.9985)
    b = _row("node/2", "Starbucks", 39.7531, -105.0030)
    assert dedupe([a, b]) == [a, b]


def test_places_already_on_the_list_are_dropped():
    rows = [
        _row("node/1", "Commons Park", 39.7590, -105.0080, "park"),
        _row("node/2", "Snooze", 39.7530, -104.9990, "restaurant"),
    ]
    known = [Known("Commons Park", 39.7591, -105.0081)]
    assert [row.name for row in dedupe(rows, known)] == ["Snooze"]


def test_a_match_across_a_grid_line_is_still_found():
    # 39.7499999 and 39.7500001 fall in neighbouring 0.001° cells.
    a = _row("node/1", "Edge", 39.7499999, -105.0)
    b = _row("node/2", "Edge", 39.7500001, -105.0)
    assert dedupe([a, b]) == [a]


def test_the_recorded_answer_loses_only_its_real_duplicates():
    rows = parse(json.loads(FIXTURE.read_text()))
    kept = dedupe(rows)
    dropped = {row.source_id for row in rows} - {row.source_id for row in kept}
    # A café mapped as a node and as its building; two pins each for
    # Bruto and Illegal Pete's, tens of metres apart.
    assert dropped == {"way/812551276", "node/14291315948", "node/3218329786"}
    assert sum(row.name == "Starbucks" for row in kept) == 3
