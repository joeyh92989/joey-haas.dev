"""ComicVine mapping, the required User-Agent, and in-body errors."""

import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceError, SourceNotConfigured, SourceRateLimited
from sources.comicvine import (
    ALL_ISSUES_FIELD_LIST,
    ALL_ISSUES_PAGE,
    CV_TAG_LIMIT,
    FIELD_LIST,
    SEARCH_LIMIT,
    USER_AGENT,
    VOLUME_FIELD_LIST,
    ComicVineSource,
    CvIssue,
    CvIssueHit,
    IssuePage,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _config(**overrides) -> Config:
    base = dict(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        comicvine_api_key="key",
    )
    return Config(**{**base, **overrides})


def _search_payload() -> dict:
    return json.loads((FIXTURES / "comicvine_search.json").read_text())


def _detail_payload() -> dict:
    return json.loads((FIXTURES / "comicvine_volume.json").read_text())


@pytest.mark.asyncio
async def test_search_without_a_key_names_the_variable():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await ComicVineSource(_config(comicvine_api_key=None)).search("Saga")
    assert "COMICVINE_API_KEY" in str(excinfo.value)


def test_search_payload_maps_onto_source_results():
    results = ComicVineSource(_config())._parse_search(_search_payload())

    assert results
    first = results[0]
    assert first.title
    assert first.external_id.isdigit()
    assert first.year is None or 1900 < first.year < 2100


def test_search_respects_the_documented_ceiling_of_ten():
    # ComicVine's own documentation says /search cannot exceed 10.
    assert SEARCH_LIMIT == 10
    results = ComicVineSource(_config())._parse_search(_search_payload())
    assert len(results) <= 10


def test_detail_maps_onto_a_source_detail():
    detail = ComicVineSource(_config())._parse_detail(_detail_payload())

    assert detail.title == "Saga"
    assert detail.year == 2012
    # At volume level the publisher is the closest thing to a creator; writers
    # and artists belong to issues, which are out of scope.
    assert detail.creator == "Image"
    assert detail.cover_url
    assert detail.source_metadata["issue_count"]
    assert detail.source_metadata["publisher"] == "Image"


def test_no_community_score_key_is_invented():
    # ComicVine exposes no community rating. A null key would imply the field
    # exists and is simply unknown for this row.
    detail = ComicVineSource(_config())._parse_detail(_detail_payload())
    assert "community_score" not in detail.source_metadata


def test_a_volume_with_no_image_or_publisher_still_maps():
    detail = ComicVineSource(_config())._parse_detail(
        {"results": {"id": 1, "name": "Bare", "start_year": None}}
    )
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {"error": "OK", "results": []}

    def json(self) -> dict:
        return self._payload


class _RecordingClient:
    def __init__(self, seen: list[dict], response: _FakeResponse):
        self._seen = seen
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def get(self, url, params=None, headers=None):
        self._seen.append({"url": url, "params": params, "headers": headers})
        return self._response


def _patch_http(monkeypatch, response: _FakeResponse) -> list[dict]:
    seen: list[dict] = []
    monkeypatch.setattr(
        "sources.comicvine.httpx2.AsyncClient",
        lambda **_: _RecordingClient(seen, response),
    )
    return seen


@pytest.mark.asyncio
async def test_a_custom_user_agent_is_always_sent(monkeypatch):
    # Verified against the live API: with a default client user agent
    # ComicVine answers 403 "Anonymous Bot or Scraper Blocked". This header is
    # required, not courteous, and their docs do not mention it.
    seen = _patch_http(monkeypatch, _FakeResponse(200))

    await ComicVineSource(_config()).search("Saga")

    assert seen[0]["headers"]["User-Agent"] == USER_AGENT
    assert "joey-haas.dev" in USER_AGENT


@pytest.mark.asyncio
async def test_search_never_asks_for_more_than_ten(monkeypatch):
    seen = _patch_http(monkeypatch, _FakeResponse(200))

    await ComicVineSource(_config()).search("Saga")

    assert seen[0]["params"]["limit"] <= 10
    assert seen[0]["params"]["resources"] == "volume"


@pytest.mark.asyncio
async def test_an_error_reported_inside_a_200_body_is_raised(monkeypatch):
    # ComicVine reports its own failures in the body with HTTP 200, so a
    # status check alone would treat an error as an empty result set.
    _patch_http(
        monkeypatch, _FakeResponse(200, {"error": "Invalid API Key", "results": []})
    )

    with pytest.raises(SourceError) as excinfo:
        await ComicVineSource(_config()).search("Saga")

    assert "Invalid API Key" in str(excinfo.value)


@pytest.mark.asyncio
async def test_a_420_is_reported_as_rate_limiting(monkeypatch):
    _patch_http(monkeypatch, _FakeResponse(420))

    with pytest.raises(SourceRateLimited):
        await ComicVineSource(_config()).search("Saga")


@pytest.mark.asyncio
async def test_a_403_explains_the_two_things_that_cause_it(monkeypatch):
    _patch_http(monkeypatch, _FakeResponse(403))

    with pytest.raises(SourceError) as excinfo:
        await ComicVineSource(_config()).search("Saga")

    message = str(excinfo.value)
    assert "key" in message and "User-Agent" in message


# --- The pull list's volume search and issue fetch ---------------------------
# Most /issues bodies here are hand-built in the shape ISSUE_FIELD_LIST asks
# for; the recorded ones (record_comicvine_fixtures.py) hold them to the live
# answer.


def _issue(number, store_date, volume_id=4363, **extra) -> dict:
    return {
        "id": 1000 + len(str(number)),
        "issue_number": number,
        "name": extra.get("name"),
        "store_date": store_date,
        "cover_date": extra.get("cover_date"),
        "image": {"medium_url": f"https://cv.example/{number}.jpg"},
        "volume": {"id": volume_id, "name": "Saga"},
    }


def test_volume_search_carries_publisher_and_issue_count():
    rows = ComicVineSource(_config())._parse_volumes(_search_payload())

    assert rows and len(rows) <= SEARCH_LIMIT
    raw = _search_payload()["results"][0]
    assert rows[0].external_id == str(raw["id"])
    assert rows[0].publisher == (raw.get("publisher") or {}).get("name")
    assert rows[0].issue_count == raw.get("count_of_issues")


@pytest.mark.parametrize(
    "fixture", ["comicvine_issues_ongoing.json", "comicvine_issues_ended.json"]
)
def test_recorded_issues_parse_newest_first_on_their_volume(fixture):
    recorded = json.loads((FIXTURES / fixture).read_text())
    volume_id = str(recorded["volume"]["id"])

    entries = ComicVineSource(_config())._parse_issues(recorded["issues"], volume_id)

    raw = recorded["issues"]["results"]
    assert len(entries) == len(raw) > 0
    assert [e["number"] for e in entries] == [r["issue_number"] for r in raw]
    dates = [e["store_date"] for e in entries if e["store_date"]]
    assert dates == sorted(dates, reverse=True)
    assert all(e["cover_url"] for e in entries)


def test_issues_map_onto_snapshot_entries():
    payload = {"results": [_issue("67", "2024-11-27", name="Chapter 67")]}

    (entry,) = ComicVineSource(_config())._parse_issues(payload, "4363")

    assert entry == {
        "number": "67",
        "name": "Chapter 67",
        "store_date": "2024-11-27",
        "cover_date": None,
        "cover_url": "https://cv.example/67.jpg",
    }


def test_an_issue_from_another_volume_refuses_the_whole_answer():
    # If the volume filter were ever ignored, the newest issues of every
    # series would come back; none of them may reach this row's snapshot.
    payload = {"results": [_issue("1", "2024-01-01"), _issue("9", "2024-01-01", 99)]}

    with pytest.raises(SourceError) as excinfo:
        ComicVineSource(_config())._parse_issues(payload, "4363")

    assert "volume filter" in str(excinfo.value)


@pytest.mark.asyncio
async def test_fetch_issues_makes_exactly_the_recorded_call(monkeypatch):
    seen = _patch_http(monkeypatch, _FakeResponse(200, {"error": "OK", "results": []}))

    assert await ComicVineSource(_config()).fetch_issues("4363") == []

    params = seen[0]["params"]
    assert seen[0]["url"].endswith("/issues/")
    assert params["filter"] == "volume:4363"
    assert params["sort"] == "store_date:desc"
    assert (
        params["field_list"]
        == "id,issue_number,name,store_date,cover_date,image,volume"
    )


@pytest.mark.asyncio
async def test_fetch_issues_refuses_a_non_numeric_volume_id():
    with pytest.raises(SourceError):
        await ComicVineSource(_config()).fetch_issues("4363,volume:1")


# --- The volume's tag lists (recommendation engine facets) --------------------


def test_detail_keeps_the_volume_tag_lists_by_name():
    payload = _detail_payload()
    row = payload["results"]
    detail = ComicVineSource(_config())._parse_detail(payload)
    metadata = detail.source_metadata
    assert metadata["concepts"] == [entry["name"] for entry in row["concepts"]]
    assert metadata["locations"] == [entry["name"] for entry in row["locations"]]
    assert len(row["characters"]) > CV_TAG_LIMIT
    assert metadata["characters"] == [
        entry["name"] for entry in row["characters"][:CV_TAG_LIMIT]
    ]
    # Saga lists no teams: an empty list leaves no key rather than [].
    assert not row.get("teams")
    assert "teams" not in metadata
    assert metadata["genres"] == []


@pytest.mark.asyncio
async def test_only_the_detail_call_asks_for_the_tag_lists(monkeypatch):
    seen = _patch_http(monkeypatch, _FakeResponse(200, _detail_payload()))
    await ComicVineSource(_config()).fetch("46568")
    assert seen[0]["params"]["field_list"] == VOLUME_FIELD_LIST

    seen = _patch_http(monkeypatch, _FakeResponse(200))
    await ComicVineSource(_config()).search("Saga")
    assert seen[0]["params"]["field_list"] == FIELD_LIST
    assert "characters" not in FIELD_LIST


# --- The all-issues pages and the issue detail --------------------------------


def _issues_page_fixture() -> dict:
    return json.loads((FIXTURES / "comicvine_issues_page.json").read_text())


def _issue_detail_fixture() -> dict:
    return json.loads((FIXTURES / "comicvine_issue_detail.json").read_text())


@pytest.mark.asyncio
async def test_fetch_issue_page_parses_whole_numbers_only(monkeypatch):
    recorded = _issues_page_fixture()
    volume_id = str(recorded["volume_id"])
    payload = recorded["issues"]
    # The recorded volume (Saga) has only whole numbers, so the numbers the
    # parser must drop are hand-made here, clearly not recorded: #0, #1.MU and
    # #½ copy a real row and change only the number.
    template = payload["results"][0]
    payload["results"] += [
        {**template, "id": 9_000_000 + i, "issue_number": number}
        for i, number in enumerate(["0", "1.MU", "\u00bd", "10000"])
    ]
    _patch_http(monkeypatch, _FakeResponse(200, payload))

    page = await ComicVineSource(_config()).fetch_issue_page(volume_id, 0)

    assert isinstance(page, IssuePage)
    assert page.total == payload["number_of_total_results"]
    raw = recorded["issues"]["results"][:15]
    assert [i.number for i in page.issues] == [int(r["issue_number"]) for r in raw]
    for issue, row in zip(page.issues, raw):
        assert isinstance(issue, CvIssue)
        assert issue.cv_id == row["id"]
        assert issue.cover_url == row["image"]["medium_url"]
        assert issue.large_url == row["image"]["super_url"]
    # Descriptions arrive as cleaned paragraphs, not markup.
    assert not any("<" in text for text in page.issues[0].description)
    assert page.issues[0].description[0].startswith("Y: THE LAST MAN writer")


@pytest.mark.asyncio
@pytest.mark.parametrize("total", [None, "x", -1])
async def test_fetch_issue_page_refuses_a_missing_total(monkeypatch, total):
    body = {"error": "OK", "results": []}
    if total is not None:
        body["number_of_total_results"] = total
    _patch_http(monkeypatch, _FakeResponse(200, body))

    with pytest.raises(SourceError):
        await ComicVineSource(_config()).fetch_issue_page("46568", 0)


@pytest.mark.asyncio
async def test_fetch_issue_page_sends_offset_and_limit(monkeypatch):
    seen = _patch_http(
        monkeypatch,
        _FakeResponse(
            200, {"error": "OK", "results": [], "number_of_total_results": 0}
        ),
    )

    page = await ComicVineSource(_config()).fetch_issue_page("46568", 200)

    assert page == IssuePage(issues=[], total=0)
    params = seen[0]["params"]
    assert seen[0]["url"].endswith("/issues/")
    assert params["offset"] == 200
    assert params["limit"] == ALL_ISSUES_PAGE == 100
    assert params["filter"] == "volume:46568"
    # Controller ruling: id order, stable under offset paging.
    assert params["sort"] == "id:asc"
    assert params["field_list"] == ALL_ISSUES_FIELD_LIST
    assert "description" in ALL_ISSUES_FIELD_LIST


@pytest.mark.asyncio
async def test_fetch_issue_page_refuses_foreign_volume(monkeypatch):
    payload = {
        "error": "OK",
        "number_of_total_results": 2,
        "results": [_issue("1", "2024-01-01"), _issue("9", "2024-01-01", 99)],
    }
    _patch_http(monkeypatch, _FakeResponse(200, payload))

    with pytest.raises(SourceError) as excinfo:
        await ComicVineSource(_config()).fetch_issue_page("4363", 0)

    assert "volume filter" in str(excinfo.value)


@pytest.mark.asyncio
async def test_fetch_issue_page_refuses_a_non_numeric_volume_or_bad_offset():
    source = ComicVineSource(_config())
    with pytest.raises(SourceError):
        await source.fetch_issue_page("4363,volume:1", 0)
    with pytest.raises(SourceError):
        await source.fetch_issue_page("4363", -1)


@pytest.mark.asyncio
async def test_fetch_issue_maps_the_recorded_detail(monkeypatch):
    seen = _patch_http(monkeypatch, _FakeResponse(200, _issue_detail_fixture()))

    issue = await ComicVineSource(_config()).fetch_issue(303557)

    assert seen[0]["url"].endswith("/issue/4000-303557/")
    assert seen[0]["params"]["field_list"] == ALL_ISSUES_FIELD_LIST
    assert issue.cv_id == 303557
    assert issue.number == 1
    assert issue.name == "Volume 1"
    assert issue.store_date.isoformat() == "2006-08-23"
    assert issue.cover_date.isoformat() == "2006-08-23"
    assert issue.cover_url and issue.cover_url.endswith(".jpg")
    assert issue.large_url and "scale_large" in issue.large_url
    assert issue.description[0] == "Chapter Titles"
    assert any("Normanni" in line for line in issue.description)


@pytest.mark.asyncio
async def test_fetch_issue_without_a_whole_number_keeps_it_as_none(monkeypatch):
    # An edition link may point at any issue; the number is whole or None.
    payload = _issue_detail_fixture()
    payload["results"]["issue_number"] = "\u00bd"
    _patch_http(monkeypatch, _FakeResponse(200, payload))

    issue = await ComicVineSource(_config()).fetch_issue(303557)

    assert issue is not None and issue.number is None


@pytest.mark.asyncio
async def test_fetch_issue_404_is_none(monkeypatch):
    # Comic Vine answers an unknown id with HTTP 200 and an in-body
    # "Object Not Found" (confirmed live); a real 404 means the same.
    body = {"error": "Object Not Found", "status_code": 101, "results": []}
    _patch_http(monkeypatch, _FakeResponse(200, body))
    assert await ComicVineSource(_config()).fetch_issue(999999999) is None

    _patch_http(monkeypatch, _FakeResponse(404))
    assert await ComicVineSource(_config()).fetch_issue(999999999) is None


@pytest.mark.asyncio
async def test_fetch_issue_raises_on_other_errors(monkeypatch):
    _patch_http(monkeypatch, _FakeResponse(500))
    with pytest.raises(SourceError):
        await ComicVineSource(_config()).fetch_issue(303557)

    _patch_http(monkeypatch, _FakeResponse(200, {"error": "Invalid API Key"}))
    with pytest.raises(SourceError):
        await ComicVineSource(_config()).fetch_issue(303557)


@pytest.mark.asyncio
async def test_search_issues_maps_hits(monkeypatch):
    payload = {
        "error": "OK",
        "results": [
            {
                "id": 303557,
                "issue_number": "1",
                "name": "Volume 1",
                "cover_date": "2006-08-23",
                "volume": {"id": 44141, "name": "Vinland Saga"},
                "image": {"thumb_url": "https://cv.example/t.jpg"},
            },
            {
                "id": 5,
                "issue_number": "12.1",
                "name": None,
                "cover_date": None,
                "volume": None,
                "image": None,
            },
        ],
    }
    seen = _patch_http(monkeypatch, _FakeResponse(200, payload))

    hits = await ComicVineSource(_config()).search_issues("Vinland Saga")

    params = seen[0]["params"]
    assert seen[0]["url"].endswith("/search/")
    assert params["resources"] == "issue" and params["query"] == "Vinland Saga"
    assert params["limit"] == SEARCH_LIMIT
    assert hits == [
        CvIssueHit(
            cv_id=303557,
            volume_name="Vinland Saga",
            number="1",
            name="Volume 1",
            thumb_url="https://cv.example/t.jpg",
            year=2006,
        ),
        CvIssueHit(
            cv_id=5, volume_name="", number="12.1", name=None, thumb_url=None, year=None
        ),
    ]
