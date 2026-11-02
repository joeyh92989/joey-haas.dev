"""The ComicVine recorder's pure parts: picking the series, judging the filter."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parent.parent / "scripts" / "record_comicvine_fixtures.py"
spec = importlib.util.spec_from_file_location("record_comicvine_fixtures", SCRIPT)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)


def _row(volume_id, name="Saga", year="2012", publisher="Image Comics"):
    return {
        "id": volume_id,
        "name": name,
        "start_year": year,
        "publisher": {"name": publisher},
    }


def test_pick_volume_matches_title_year_and_publisher():
    results = [
        _row(1, year="1990"),
        _row(2, publisher="Dark Horse"),
        _row(3),
    ]
    assert recorder.pick_volume(results, "Saga", "Image", "2012")["id"] == 3


def test_pick_volume_finds_nothing_rather_than_a_near_match():
    results = [_row(1, name="Saga of the Swamp Thing")]
    assert recorder.pick_volume(results, "Saga", "Image", "2012") is None


def test_the_filter_holds_only_when_every_issue_is_the_volumes():
    own = {"results": [{"volume": {"id": 7}}, {"volume": {"id": 7}}]}
    mixed = {"results": [{"volume": {"id": 7}}, {"volume": {"id": 8}}]}
    assert recorder.filter_held(own, 7)
    assert not recorder.filter_held(mixed, 7)
    assert not recorder.filter_held({"results": []}, 7)


def test_the_recorded_call_is_the_adapters():
    params = recorder.issues_params(7)
    assert params["filter"] == "volume:7"
    assert params["sort"] == "store_date:desc"
    assert params["limit"] == recorder.ISSUE_FETCH_LIMIT
    assert params["field_list"] == recorder.ISSUE_FIELD_LIST
