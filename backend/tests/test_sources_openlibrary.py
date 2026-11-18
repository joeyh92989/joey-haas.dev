"""Open Library: ISBN checks, the volume-number reader, mapping, and errors.

`openlibrary_saga.json` and `openlibrary_miss.json` are real responses
(recorded 2026-11-18 with curl for 9781607066019 and 9789999999995). The 429,
timeout and 5xx cases are hand-written fakes of the HTTP client, because Open
Library cannot be made to throttle on demand.
"""

import json
from pathlib import Path

import httpx2
import pytest

from sources import openlibrary
from sources.base import SourceError, SourceRateLimited, SourceUnavailable
from sources.openlibrary import (
    USER_AGENT,
    InvalidIsbn,
    _parse_book,
    lookup,
    normalize_isbn,
    parse_volume_number,
)

FIXTURES = Path(__file__).parent / "fixtures"
SAGA = "9781607066019"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class _Response:
    def __init__(self, status: int, body=None):
        self.status_code = status
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


def _patch_http(monkeypatch, response=None, error=None) -> list[dict]:
    seen: list[dict] = []

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, url, params=None, headers=None):
            seen.append({"url": url, "params": params, "headers": headers})
            if error:
                raise error
            return response

    monkeypatch.setattr("sources.openlibrary.httpx2.AsyncClient", lambda **_: Client())

    class NoWait:
        async def wait(self):
            return None

    monkeypatch.setattr(openlibrary, "_THROTTLE", NoWait())
    return seen


@pytest.mark.parametrize(
    "raw, expected",
    [
        (SAGA, SAGA),
        ("978-1-60706-601-9", SAGA),
        (" 978 1607066019 ", SAGA),
        ("1-60706-601-7", SAGA),  # the ISBN-10 of the same book
        ("0-8044-2957-X", "9780804429573"),  # X check digit
    ],
)
def test_normalize_accepts_and_converts(raw, expected):
    assert normalize_isbn(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "abc", "9781607066010", "1607066010", "123456789", "9771607066019", None],
)
def test_normalize_rejects(raw):
    with pytest.raises(InvalidIsbn):
        normalize_isbn(raw)


@pytest.mark.parametrize(
    "subtitle, number",
    [
        ("Volume One", 1),
        ("Vol. 2", 2),
        ("Vol 12", 12),
        ("Book Three", 3),
        ("volume 4: the war", 4),
        (None, None),
        ("", None),
        ("The Complete Collection", None),
        ("Volumetric", None),
        ("Book Nine Lives", None),
        ("A Book One Hundred Years Hence", None),
        ("Saga: Book Three", 3),
        ("Vol. 2.", 2),
    ],
)
def test_parse_volume_number(subtitle, number):
    assert parse_volume_number(subtitle) == number


def test_the_recorded_saga_answer_maps():
    book = _parse_book(SAGA, _fixture("openlibrary_saga.json"))
    assert book is not None
    assert (book.title, book.subtitle, book.volume_number) == ("Saga", "Volume One", 1)
    assert book.publisher == "Image Comics"
    assert (book.year, book.pages) == (2012, 160)
    assert book.cover_url == "https://covers.openlibrary.org/b/id/12679639-M.jpg"


def test_the_recorded_miss_is_none():
    assert _parse_book("9789999999995", _fixture("openlibrary_miss.json")) is None


@pytest.mark.asyncio
async def test_bad_checksum_makes_no_request(monkeypatch):
    seen = _patch_http(monkeypatch, _Response(200, {}))
    with pytest.raises(InvalidIsbn):
        await lookup("9781607066010")
    assert seen == []


@pytest.mark.asyncio
async def test_lookup_sends_the_isbn13_and_a_user_agent(monkeypatch):
    seen = _patch_http(monkeypatch, _Response(200, _fixture("openlibrary_saga.json")))
    book = await lookup("1-60706-601-7")
    assert book is not None and book.isbn == SAGA
    assert seen[0]["params"]["bibkeys"] == f"ISBN:{SAGA}"
    assert seen[0]["headers"]["User-Agent"] == USER_AGENT
    assert "joey-haas.dev" in USER_AGENT


@pytest.mark.asyncio
async def test_lookup_miss_is_none(monkeypatch):
    _patch_http(monkeypatch, _Response(200, {}))
    assert await lookup(SAGA) is None


@pytest.mark.asyncio
async def test_a_429_is_rate_limited(monkeypatch):
    _patch_http(monkeypatch, _Response(429))
    with pytest.raises(SourceRateLimited):
        await lookup(SAGA)


@pytest.mark.asyncio
async def test_5xx_and_timeouts_are_unavailable(monkeypatch):
    _patch_http(monkeypatch, _Response(503))
    with pytest.raises(SourceUnavailable):
        await lookup(SAGA)
    _patch_http(monkeypatch, error=httpx2.ReadTimeout("slow"))
    with pytest.raises(SourceUnavailable):
        await lookup(SAGA)


@pytest.mark.asyncio
async def test_other_4xx_and_non_json_are_source_errors(monkeypatch):
    _patch_http(monkeypatch, _Response(403))
    with pytest.raises(SourceError):
        await lookup(SAGA)
    _patch_http(monkeypatch, _Response(200, None))
    with pytest.raises(SourceError):
        await lookup(SAGA)


def test_isbn10_of():
    assert openlibrary.isbn10_of(SAGA) == "1607066017"
    assert openlibrary.isbn10_of("9780804429573") == "080442957X"
    assert openlibrary.isbn10_of("9791032300664") is None
