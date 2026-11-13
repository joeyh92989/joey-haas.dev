"""A comic sitting's reader: one entry per book with its issue number, the
comic prompt only for a comic sitting, the story-title retry. The provider
and the Comic Vine adapter are stubs; no model call is spent."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import update

from importer import COMIC_EXTRACTION_PROMPT, EXTRACTION_PROMPT
from intake.reader import before_story, retry_reading
from models import IntakeSitting, ItemType
from sources.base import SourceRateLimited, SourceResult
from tests.test_importer import StubSource
from tests.test_intake_reader import (
    CountingProvider,
    _entries,
    _read,
    _sitting,
)

pytestmark = pytest.mark.asyncio

RECORDED = json.loads(
    (Path(__file__).parent / "fixtures" / "comic_reader_answers.json").read_text()
)
WATERWORLD = SourceResult(
    external_id="4050-1",
    title="Waterworld: Children of Leviathan",
    year=1997,
    publisher="Acclaim Comics",
    issue_count=4,
)


class PromptProvider(CountingProvider):
    def __init__(self, *answers):
        super().__init__(*answers)
        self.prompts = []
        self.schemas = []

    async def complete_json(self, prompt, schema, images=None):
        self.prompts.append(prompt)
        self.schemas.append(schema)
        return await super().complete_json(prompt, schema, images)


def _comic_registry(*results):
    return {ItemType.COMIC: StubSource("comicvine", ItemType.COMIC, list(results))}


async def _make_comic(factory, sitting_id):
    async with factory() as session:
        await session.execute(
            update(IntakeSitting)
            .where(IntakeSitting.id == sitting_id)
            .values(kind="comic")
        )
        await session.commit()


async def test_four_waterworld_photos_are_four_entries_with_their_numbers(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(sessionmaker_for_test, photos=4)
    await _make_comic(sessionmaker_for_test, sitting_id)
    answers = [row["answer"] for row in RECORDED[4:8]]
    provider = PromptProvider(*answers)
    registry = _comic_registry(WATERWORLD)
    for _ in range(4):
        await _read(sessionmaker_for_test, sitting_id, provider, registry=registry)

    assert provider.calls == 4  # one request per photo, as before
    assert set(provider.prompts) == {COMIC_EXTRACTION_PROMPT}
    entries = await _entries(sessionmaker_for_test, sitting_id)
    assert len(entries) == 4
    assert [e.payload["issue_number"] for e in entries] == [1, 2, 3, 4]
    assert {e.payload["number_source"] for e in entries} == {"read"}
    assert {e.kind for e in entries} == {"comic"}
    assert {e.chosen["external_id"] for e in entries} == {"4050-1"}
    # the match carries the volume's issue count for the run check
    assert entries[0].chosen["issue_count"] == 4


async def test_two_books_in_one_photo_are_two_entries(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    book = {"series": "Waterworld", "issue_number_seen": True, "format": "single"}
    provider = PromptProvider(
        {"books": [{**book, "issue_number": "1"}, {**book, "issue_number": "2"}]}
    )
    await _read(
        sessionmaker_for_test,
        sitting_id,
        provider,
        registry=_comic_registry(WATERWORLD),
    )
    entries = await _entries(sessionmaker_for_test, sitting_id)
    assert sorted(e.payload["issue_number"] for e in entries) == [1, 2]


async def test_a_collected_book_defaults_to_a_trade_with_its_range(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    provider = PromptProvider(
        {
            "books": [
                {
                    "series": "Saga",
                    "issue_number_seen": False,
                    "format": "collected",
                    "volume_range": "1-6",
                }
            ]
        }
    )
    await _read(sessionmaker_for_test, sitting_id, provider, registry=_comic_registry())
    [entry] = await _entries(sessionmaker_for_test, sitting_id)
    assert entry.payload["format"] == "collected"
    assert entry.payload["edition_kind"] == "trade"
    assert (entry.payload["collects_from"], entry.payload["collects_to"]) == (1, 6)
    assert entry.payload["issue_number"] is None


async def test_a_mixed_sitting_keeps_the_shelf_prompt(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    provider = PromptProvider(
        {"detections": [{"title": "Waterworld", "media_type": "comic"}]}
    )
    await _read(
        sessionmaker_for_test,
        sitting_id,
        provider,
        registry=_comic_registry(WATERWORLD),
    )
    assert provider.prompts == [EXTRACTION_PROMPT]
    [entry] = await _entries(sessionmaker_for_test, sitting_id)
    assert "issue_number" not in entry.payload


async def test_a_trailing_story_title_is_searched_again_without_it(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    answer = RECORDED[7]["answer"]  # "...: Twilight of the Gods", "4 of 4"
    provider = PromptProvider(answer)
    source = StubSource("comicvine", ItemType.COMIC, [WATERWORLD])
    title = "Waterworld Children of Leviathan: Twilight of the Gods"

    async def search(query, year=None, platform=None):
        source.searches.append((query, year, platform))
        # The full title finds nothing close; the short one finds the series.
        return (
            [WATERWORLD]
            if query == "Waterworld Children of Leviathan"
            else [
                SourceResult(external_id="9", title="Twilight of the Gods", year=1990)
            ]
        )

    source.search = search
    await _read(
        sessionmaker_for_test, sitting_id, provider, registry={ItemType.COMIC: source}
    )
    assert [q for q, *_ in source.searches] == [
        title,
        "Waterworld Children of Leviathan",
    ]
    [entry] = await _entries(sessionmaker_for_test, sitting_id)
    assert entry.chosen["external_id"] == "4050-1"
    assert entry.payload["detected_title"] == title  # as read
    assert entry.payload["issue_number"] == 4


async def test_an_exact_match_is_not_searched_a_second_time(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    provider = PromptProvider(RECORDED[5]["answer"])
    registry = _comic_registry(WATERWORLD)
    await _read(sessionmaker_for_test, sitting_id, provider, registry=registry)
    assert len(registry[ItemType.COMIC].searches) == 1


async def test_a_busy_source_keeps_the_book_fields_when_it_is_retried(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    provider = PromptProvider(RECORDED[5]["answer"])
    busy = StubSource(
        "comicvine",
        ItemType.COMIC,
        raises=SourceRateLimited("comicvine", "rate limited"),
    )
    await _read(
        sessionmaker_for_test, sitting_id, provider, registry={ItemType.COMIC: busy}
    )
    [entry] = await _entries(sessionmaker_for_test, sitting_id)
    assert entry.state.value == "reading"
    async with sessionmaker_for_test() as session:
        await retry_reading(session, _comic_registry(WATERWORLD), sitting_id)
    [entry] = await _entries(sessionmaker_for_test, sitting_id)
    assert entry.state.value == "exact"
    assert entry.payload["issue_number"] == 2
    assert entry.payload["number_source"] == "read"


@pytest.mark.parametrize(
    ("title", "head"),
    [
        (
            "Waterworld Children of Leviathan: Twilight of the Gods",
            "Waterworld Children of Leviathan",
        ),
        ("Star Wars: Dark Empire: Book One", "Star Wars: Dark Empire"),
        ("Waterworld", None),
        ("Waterworld:", None),
        (": Story", None),
    ],
)
async def test_before_story(title, head):
    assert before_story(title) == head


async def test_four_books_of_one_series_are_one_search(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    book = {"series": "Waterworld: Children of Leviathan", "format": "single"}
    provider = PromptProvider(
        {
            "books": [
                {**book, "issue_number": str(n), "issue_number_seen": True}
                for n in (1, 2, 3, 4)
            ]
        }
    )
    registry = _comic_registry(WATERWORLD)
    await _read(sessionmaker_for_test, sitting_id, provider, registry=registry)
    assert len(registry[ItemType.COMIC].searches) == 1
    assert len(await _entries(sessionmaker_for_test, sitting_id)) == 4


async def test_a_busy_source_is_asked_once_for_a_series_of_books(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    await _make_comic(sessionmaker_for_test, sitting_id)
    book = {"series": "Waterworld", "format": "single", "issue_number_seen": True}
    provider = PromptProvider(
        {"books": [{**book, "issue_number": "1"}, {**book, "issue_number": "2"}]}
    )
    busy = StubSource(
        "comicvine", ItemType.COMIC, raises=SourceRateLimited("comicvine", "limit")
    )
    await _read(
        sessionmaker_for_test, sitting_id, provider, registry={ItemType.COMIC: busy}
    )
    assert len(busy.searches) == 1
    entries = await _entries(sessionmaker_for_test, sitting_id)
    assert {e.state.value for e in entries} == {"reading"}
