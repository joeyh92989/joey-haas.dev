"""The importer's pure parts: the extraction schema and detection parsing.

Separate from test_importer.py because that module marks everything async;
these need no event loop and no route.
"""

from importer import DETECTION_SCHEMA, parse_detections
from models import ItemType


def _detection(title, media_type, year=None):
    row = {"title": title, "media_type": media_type}
    if year is not None:
        row["year"] = year
    return row


def test_the_schema_constrains_media_type_to_the_item_types():
    node = DETECTION_SCHEMA["properties"]["detections"]["items"]
    assert set(node["properties"]["media_type"]["enum"]) == {t.value for t in ItemType}
    assert node["additionalProperties"] is False
    assert node["required"] == ["title", "media_type"]


def test_malformed_entries_are_skipped_rather_than_failing_the_batch():
    # The schema is enforced provider-side, so this is a second line rather
    # than the first. Losing one row off a shelf is recoverable; losing the
    # shelf is not.
    parsed = parse_detections(
        {
            "detections": [
                _detection("Dune", "movie", 2021),
                _detection("", "movie"),
                {"title": "No type"},
                {"title": "Bad type", "media_type": "vinyl"},
                _detection("Gloomhaven", "boardgame"),
            ]
        }
    )

    assert [d.title for d in parsed] == ["Dune", "Gloomhaven"]
    assert parsed[0].year == 2021
    assert parsed[1].year is None


def test_titles_are_stripped_and_indexed_in_order():
    parsed = parse_detections(
        {
            "detections": [
                _detection("  Arrival  ", "movie"),
                _detection("Saga", "comic"),
            ]
        }
    )
    assert parsed[0].title == "Arrival"
    assert [d.index for d in parsed] == [0, 1]


def test_a_non_integer_year_is_dropped_rather_than_coerced():
    # A guessed or malformed year is worse than no year: it would filter the
    # candidate list in matching.py and hide the right answer.
    parsed = parse_detections(
        {"detections": [{"title": "Dune", "media_type": "movie", "year": "twenty"}]}
    )
    assert parsed[0].year is None


def test_an_empty_payload_yields_no_detections():
    assert parse_detections({}) == []
    assert parse_detections({"detections": []}) == []
