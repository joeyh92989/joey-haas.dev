"""Metron: the reprint reader, the ISBN and type checks, mapping, and errors.

`metron_saga_tpb_issue.json`, `metron_saga_single_issue.json`,
`metron_issue_list_saga.json` and `metron_issue_list_miss.json` are REAL
responses (recorded 2026-11-18 with the owner's token read from the shell
environment; the token is in none of them). The 401, 429, 5xx and timeout cases
and the rate-limit headers are FAKES of the HTTP client, because Metron cannot
be made to refuse on demand.
"""

import json
from pathlib import Path

import httpx2
import pytest

from comic_contents import Entry
from sources.base import SourceError, SourceNotConfigured, SourceUnavailable
from sources.metron import (
    USER_AGENT,
    MetronClient,
    MetronRateLimited,
    MetronUnauthorized,
    entries_from_reprints,
    is_collected_type,
    isbn_matches,
    parse_reprint,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def _reprints(*lines: str) -> list[dict]:
    return [{"id": i, "issue": line} for i, line in enumerate(lines)]


def _saga(*numbers: int) -> list[dict]:
    return _reprints(*(f"Saga (2012) #{n}" for n in numbers))


# --- The pure reader -----------------------------------------------------------


def test_parse_reprint_reads_name_year_number():
    parsed = parse_reprint("Saga (2012) #1")
    assert (parsed.series_name, parsed.year, parsed.number) == ("Saga", 2012, 1)


def test_parse_reprint_keeps_a_type_suffix_in_the_name_and_a_odd_number_raw():
    assert parse_reprint("Saga TPB (2012) #1").series_name == "Saga TPB"
    odd = parse_reprint("X-Men (1991) #1AU")
    assert (odd.number, odd.raw_number) == (None, "1AU")


@pytest.mark.parametrize("text", ["Saga #1", "Saga Annual", "", None, 5])
def test_parse_reprint_refuses_other_shapes(text):
    assert parse_reprint(text) is None


def test_the_real_saga_trade_reads_as_one_range():
    issue = _fixture("metron_saga_tpb_issue.json")
    assert entries_from_reprints(issue["reprints"]) == [Entry("Saga", "#1-6", 2012)]


def test_six_listed_issues_merge_into_one_range():
    assert entries_from_reprints(_saga(3, 1, 2, 6, 5, 4))[0].issue_text == "#1-6"


def test_a_gap_makes_separate_pieces():
    assert entries_from_reprints(_saga(1, 2, 4))[0].issue_text == "#1-2, #4"


def test_a_repeated_issue_counts_once():
    assert entries_from_reprints(_saga(1, 1, 2))[0].issue_text == "#1-2"


def test_other_series_stay_separate_in_first_seen_order():
    entries = entries_from_reprints(
        _reprints("Saga (2012) #1", "Hellboy (1994) #3", "Saga (2012) #2")
    )
    assert entries == [Entry("Saga", "#1-2", 2012), Entry("Hellboy", "#3", 1994)]


def test_a_non_whole_number_is_kept_raw_beside_the_ranges():
    entries = entries_from_reprints(
        _reprints("X-Men (1991) #1", "X-Men (1991) #2", "X-Men (1991) #1AU")
    )
    assert entries == [Entry("X-Men", "#1-2, #1AU", 1991)]


def test_an_annual_is_its_own_series_entry():
    entries = entries_from_reprints(
        _reprints("Saga (2012) #1", "Saga Annual (2013) #1")
    )
    assert [e.series_name for e in entries] == ["Saga", "Saga Annual"]


def test_an_unparseable_line_is_kept_whole_never_dropped():
    entries = entries_from_reprints(_reprints("Saga (2012) #1", "Free Comic Day 2012"))
    assert entries[-1] == Entry("Free Comic Day 2012", "")


def test_a_long_gappy_list_splits_under_the_text_cap():
    entries = entries_from_reprints(_saga(*range(1, 400, 2)))
    assert len(entries) > 1
    assert all(len(e.issue_text) <= 200 for e in entries)


@pytest.mark.parametrize("value", [None, {}, "x", []])
def test_no_reprints_no_entries(value):
    assert entries_from_reprints(value) == []


def test_isbn_matches_across_forms_and_never_on_missing_or_bad():
    assert isbn_matches("1-60706-601-7", "9781607066019")
    assert isbn_matches("978-1-60706-601-9", "9781607066019")
    assert not isbn_matches(None, "9781607066019")
    assert not isbn_matches("9781607066019", "")
    assert not isbn_matches("9781607066010", "9781607066019")  # bad check digit
    assert not isbn_matches("9781607066019", "9781534300989")


def test_only_collected_types_pass():
    assert is_collected_type("Trade Paperback")
    assert is_collected_type("Hardcover")
    assert not is_collected_type("Single Issue")
    assert not is_collected_type("")
    assert not is_collected_type(None)


# --- The client, over a fake HTTP layer ------------------------------------------


class _Response:
    def __init__(self, status: int, body=None, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


def _patch_http(monkeypatch, responses=None, error=None) -> list[dict]:
    seen: list[dict] = []
    queue = list(responses or [])

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, url, params=None, headers=None):
            seen.append({"url": url, "params": params, "headers": headers})
            if error:
                raise error
            return queue.pop(0)

    monkeypatch.setattr("sources.metron.httpx2.AsyncClient", lambda **_: Client())
    return seen


def _client(slept=None, now=1000.0):
    async def sleep(seconds):
        if slept is not None:
            slept.append(seconds)

    client = MetronClient("test-token", clock=lambda: now, sleep=sleep)

    class NoWait:
        async def wait(self):
            return None

    client._throttle = NoWait()
    return client


@pytest.mark.asyncio
async def test_search_sends_filters_bearer_and_user_agent(monkeypatch):
    seen = _patch_http(
        monkeypatch, [_Response(200, _fixture("metron_issue_list_saga.json"))]
    )
    rows = await _client().search_issues("Saga", 1)
    assert seen[0]["url"] == "https://metron.cloud/api/issue/"
    assert seen[0]["params"] == {"series_name": "Saga", "number": "1"}
    assert seen[0]["headers"]["Authorization"] == "Bearer test-token"
    assert seen[0]["headers"]["User-Agent"] == USER_AGENT
    assert "joey-haas.dev" in USER_AGENT
    exact = [r for r in rows if r.series_name == "Saga"]
    assert [(r.id, r.issue) for r in exact] == [
        (7997, "Saga (2012) #1"),
        (52773, "Saga TPB (2012) #1"),
    ]
    assert len(rows) == 34  # substring matching: the caller must narrow it


@pytest.mark.asyncio
async def test_the_miss_is_an_empty_list(monkeypatch):
    _patch_http(monkeypatch, [_Response(200, _fixture("metron_issue_list_miss.json"))])
    assert await _client().search_issues("Zzqx Nonexistent Title") == []


@pytest.mark.asyncio
async def test_fetch_issue_maps_the_saga_trade(monkeypatch):
    seen = _patch_http(
        monkeypatch, [_Response(200, _fixture("metron_saga_tpb_issue.json"))]
    )
    issue = await _client().fetch_issue(52773)
    assert seen[0]["url"] == "https://metron.cloud/api/issue/52773/"
    assert (issue.isbn, issue.pages, issue.title) == (
        "9781607066019",
        160,
        "Volume One",
    )
    assert issue.series_type == "Trade Paperback"
    assert issue.resource_url == "https://metron.cloud/issue/saga-2012-1/"
    assert len(issue.reprints) == 6


@pytest.mark.asyncio
async def test_fetch_issue_404_is_none(monkeypatch):
    _patch_http(monkeypatch, [_Response(404)])
    assert await _client().fetch_issue(1) is None


@pytest.mark.asyncio
async def test_no_token_makes_no_request(monkeypatch):
    seen = _patch_http(monkeypatch, [])
    client = MetronClient(None)
    assert not client.configured()
    with pytest.raises(SourceNotConfigured):
        await client.search_issues("Saga")
    assert seen == []


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403])
async def test_a_refused_token_is_typed_and_the_message_has_no_token(
    monkeypatch, status
):
    _patch_http(monkeypatch, [_Response(status)])  # FAKE
    with pytest.raises(MetronUnauthorized) as caught:
        await _client().fetch_issue(1)
    assert "test-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_a_429_carries_the_wait_from_the_headers(monkeypatch):
    # FAKE: Metron cannot be made to throttle on demand.
    _patch_http(
        monkeypatch,
        [_Response(429, {}, {"X-RateLimit-Burst-Reset": "1030"})],
    )
    with pytest.raises(MetronRateLimited) as caught:
        await _client(now=1000.0).fetch_issue(1)
    assert caught.value.retry_after == 30.0
    assert "test-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_a_5xx_and_a_timeout_are_unavailable(monkeypatch):
    _patch_http(monkeypatch, [_Response(503)])  # FAKE
    with pytest.raises(SourceUnavailable):
        await _client().fetch_issue(1)
    _patch_http(monkeypatch, error=httpx2.ReadTimeout("slow"))  # FAKE
    with pytest.raises(SourceUnavailable) as caught:
        await _client().fetch_issue(1)
    assert "test-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_a_non_json_answer_is_a_source_error(monkeypatch):
    _patch_http(monkeypatch, [_Response(200, None)])  # FAKE
    with pytest.raises(SourceError):
        await _client().fetch_issue(1)


@pytest.mark.asyncio
async def test_a_spent_burst_window_waits_for_its_reset(monkeypatch):
    # FAKE headers (the real ones are burst 20 / sustained 5000, not hard-coded).
    spent = {"X-RateLimit-Burst-Remaining": "0", "X-RateLimit-Burst-Reset": "1004"}
    _patch_http(monkeypatch, [_Response(404, None, spent), _Response(404)])
    slept: list[float] = []
    client = _client(slept, now=1000.0)
    await client.fetch_issue(1)
    await client.fetch_issue(2)
    assert slept == [4.0]


@pytest.mark.asyncio
async def test_a_far_reset_stops_instead_of_sleeping(monkeypatch):
    spent = {"X-RateLimit-Burst-Remaining": "0", "X-RateLimit-Burst-Reset": "2000"}
    _patch_http(monkeypatch, [_Response(404, None, spent)])
    slept: list[float] = []
    client = _client(slept, now=1000.0)
    await client.fetch_issue(1)
    with pytest.raises(MetronRateLimited):
        await client.fetch_issue(2)
    assert slept == []
