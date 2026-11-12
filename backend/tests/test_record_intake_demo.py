"""The intake demo recorder (plan task 14): one shelf photo through the
reader's prompt and the matcher, written as the public demo's file.

The provider and the source are stubs fed from a provisional fixture
(`fixtures/intake_demo/provisional.json`), so no model call is spent; the
public `intake-demo.json` is only ever the recorder's real output.
"""

from __future__ import annotations

import importlib.util
import io
import json
from datetime import date
from pathlib import Path

import pytest
import pytest_asyncio
from PIL import Image as PILImage

from importer import DETECTION_SCHEMA, EXTRACTION_PROMPT
from models import Item, ItemStatus, ItemType
from sources.base import SourceResult, SourceUnavailable
from tests.test_importer import StubSource

SCRIPT = Path(__file__).parent.parent / "scripts" / "record_intake_demo.py"
spec = importlib.util.spec_from_file_location("record_intake_demo", SCRIPT)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)

FIXTURE = json.loads(
    (
        Path(__file__).parent / "fixtures" / "intake_demo" / "provisional.json"
    ).read_text()
)


def _photo() -> bytes:
    out = io.BytesIO()
    PILImage.new("RGB", (40, 30), "white").save(out, format="JPEG")
    return out.getvalue()


class FixtureProvider:
    def __init__(self, payload):
        self.payload = payload
        self.calls: list[tuple] = []

    async def complete_json(self, prompt, schema, images=None):
        self.calls.append((prompt, schema, images))
        return self.payload


class FixtureSource(StubSource):
    """Answers each query with the fixture's results for it."""

    def __init__(self, searches, raises_for=()):
        super().__init__("tmdb", ItemType.MOVIE)
        self._searches = searches
        self._raises_for = set(raises_for)

    async def search(self, query, year=None, platform=None):
        self.searches.append((query, year, platform))
        if query in self._raises_for:
            raise SourceUnavailable("tmdb", "tmdb is down")
        return [SourceResult(**row) for row in self._searches.get(query, [])]


class Clock:
    """Each reading 0.25 s after the last."""

    def __init__(self):
        self.now = 0.0

    def __call__(self):
        self.now += 0.25
        return self.now


@pytest_asyncio.fixture
async def session(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        yield session


async def _record(session, source=None, provider=None):
    provider = provider or FixtureProvider(FIXTURE["detections"])
    source = source or FixtureSource(FIXTURE["searches"])
    demo = await recorder.record(
        _photo(),
        provider,
        {ItemType.MOVIE: source},
        session=session,
        clock=Clock(),
        today=date(2026, 11, 10),
    )
    return demo, provider, source


@pytest.mark.asyncio
async def test_reads_with_the_readers_own_prompt_and_one_jpeg(session):
    _, provider, _ = await _record(session)
    assert len(provider.calls) == 1
    prompt, schema, images = provider.calls[0]
    assert prompt == EXTRACTION_PROMPT
    assert schema == DETECTION_SCHEMA
    assert [image.media_type for image in images] == ["image/jpeg"]


@pytest.mark.asyncio
async def test_matches_every_title_in_reading_order_with_the_matchers_confidence(
    session,
):
    demo, _, source = await _record(session)
    assert [query for query, _, _ in source.searches] == [
        "Arrival",
        "The Thing",
        "Alein",
        "Unreadable Smudge",
    ]
    rows = demo["titles"]
    assert [row["read"] for row in rows] == [
        "Arrival",
        "The Thing",
        "Alein",
        "Unreadable Smudge",
    ]
    assert [row["confidence"] for row in rows] == [
        "exact",
        "check",
        "probable",
        "check",
    ]
    assert rows[0]["match"] == {"title": "Arrival", "year": 2016}
    assert rows[2]["match"] == {"title": "Alien", "year": 1979}
    assert rows[3]["match"] is None
    assert rows[1]["candidates"] == [
        {"title": "The Thing", "year": 1982},
        {"title": "The Thing", "year": 2011},
    ]
    assert rows[0]["year"] == 2016 and rows[1]["year"] is None
    assert {row["kind"] for row in rows} == {"movie"}


@pytest.mark.asyncio
async def test_records_stage_timings_the_day_and_the_source_and_is_not_provisional(
    session,
):
    demo, _, _ = await _record(session)
    assert demo["provisional"] is False
    assert demo["recorded_on"] == "2026-11-10"
    assert demo["sources"] == ["tmdb"]
    # The clock ticks 0.25 s per reading: read is one gap, match one gap.
    assert demo["stages"] == {"read_ms": 250, "match_ms": 250}


@pytest.mark.asyncio
async def test_carries_no_ids_no_urls_and_no_image_bytes(session):
    demo, _, _ = await _record(session)
    text = json.dumps(demo)
    for leak in ("external_id", "329865", "thumbnail", "https://", "index"):
        assert leak not in text
    assert set(demo) == {
        "provisional",
        "recorded_on",
        "sources",
        "stages",
        "titles",
    }
    for row in demo["titles"]:
        assert set(row) == {"read", "year", "kind", "confidence", "match", "candidates"}


@pytest.mark.asyncio
async def test_refuses_a_run_where_a_source_could_not_answer(session):
    source = FixtureSource(FIXTURE["searches"], raises_for={"The Thing"})
    with pytest.raises(recorder.RecordingRefused, match="tmdb is down"):
        await _record(session, source=source)


@pytest.mark.asyncio
async def test_refuses_a_photo_where_nothing_was_read(session):
    with pytest.raises(recorder.RecordingRefused, match="no titles"):
        await _record(session, provider=FixtureProvider({"detections": []}))


def test_writes_the_file_sorted_and_newline_terminated(tmp_path):
    out = tmp_path / "intake-demo.json"
    recorder.write(
        {
            "provisional": False,
            "titles": [],
            "stages": {},
            "sources": [],
            "recorded_on": "x",
        },
        out,
    )
    text = out.read_text()
    assert text.endswith("}\n")
    assert json.loads(text)["provisional"] is False


def test_the_public_file_is_the_default_output():
    assert recorder.OUTPUT.parts[-4:] == (
        "frontend",
        "src",
        "content",
        "intake-demo.json",
    )


async def _run(session, out, *, yes):
    return await recorder.run(
        _photo(),
        FixtureProvider(FIXTURE["detections"]),
        {ItemType.MOVIE: FixtureSource(FIXTURE["searches"])},
        session,
        out=out,
        yes=yes,
        clock=Clock(),
        today=date(2026, 11, 10),
    )


async def _shelve_alien(session, *, is_public):
    session.add(
        Item(
            type=ItemType.MOVIE,
            title="Alien",
            status=ItemStatus.BACKLOG,
            external_source="tmdb",
            external_id="348",
            is_public=is_public,
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_without_yes_prints_every_public_string_and_writes_nothing(
    session, tmp_path, capsys
):
    out = tmp_path / "intake-demo.json"
    assert await _run(session, out, yes=False) == 0
    assert not out.exists()
    printed = capsys.readouterr().out
    # What was read, the matches' titles and the candidates' titles.
    for public in ("Arrival", "The Thing", "Alein", "Alien", "Unreadable Smudge"):
        assert public in printed
    assert "--yes" in printed


@pytest.mark.asyncio
async def test_a_match_on_a_private_item_is_refused_even_with_yes(
    session, tmp_path, capsys
):
    await _shelve_alien(session, is_public=False)
    out = tmp_path / "intake-demo.json"
    assert await _run(session, out, yes=True) == 1
    assert not out.exists()
    error = capsys.readouterr().err
    assert "private" in error and "Alien" in error


@pytest.mark.asyncio
async def test_a_match_on_a_public_item_writes(session, tmp_path):
    await _shelve_alien(session, is_public=True)
    out = tmp_path / "intake-demo.json"
    assert await _run(session, out, yes=True) == 0
    demo = json.loads(out.read_text())
    assert demo["titles"][2]["match"] == {"title": "Alien", "year": 1979}


def _demo() -> dict:
    def row(read, match, *alts):
        return {
            "read": read,
            "year": None,
            "kind": "game",
            "confidence": "exact",
            "match": {"title": match, "year": 2020},
            "candidates": [{"title": t, "year": 2020} for t in (match, *alts)],
        }

    return {
        "titles": [
            row("Hades", "Hades", "Hades II"),
            row("Panty Party パンティパーティー完全体", "Panty Party"),
        ]
    }


def test_trim_skips_a_title_by_its_read_or_match_text():
    trimmed = recorder.trim(_demo(), skip=["panty party"], alternatives=True)
    assert [row["read"] for row in trimmed["titles"]] == ["Hades"]


def test_trim_without_alternatives_keeps_only_the_match():
    trimmed = recorder.trim(_demo(), skip=[], alternatives=False)
    assert trimmed["titles"][0]["candidates"] == [{"title": "Hades", "year": 2020}]
    assert "Hades II" not in recorder.public_strings(trimmed)


def test_the_flags_parse():
    args = recorder.parse_args(
        ["shelf.jpg", "--skip", "Panty Party", "--no-alternatives"]
    )
    assert args.skip == ["Panty Party"]
    assert args.alternatives is False


def test_keep_spines_carries_labels_over_by_read_text(tmp_path):
    out = tmp_path / "intake-demo.json"
    out.write_text(
        json.dumps(
            {
                "titles": [
                    {
                        "read": "Borderlands Legendary Collection",
                        "spine": "Borderlands Legendary",
                    },
                    {"read": "Hades"},
                ]
            }
        )
    )
    fresh = {
        "titles": [{"read": "Hades"}, {"read": "Borderlands Legendary Collection"}]
    }
    kept = recorder.keep_spines(fresh, out)
    assert kept["titles"] == [
        {"read": "Hades"},
        {"read": "Borderlands Legendary Collection", "spine": "Borderlands Legendary"},
    ]


def test_keep_spines_without_an_existing_file_changes_nothing(tmp_path):
    fresh = {"titles": [{"read": "Hades"}]}
    assert recorder.keep_spines(fresh, tmp_path / "missing.json") == fresh
