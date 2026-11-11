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
from PIL import Image as PILImage

from importer import DETECTION_SCHEMA, EXTRACTION_PROMPT
from models import ItemType
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


async def _record(source=None, provider=None):
    provider = provider or FixtureProvider(FIXTURE["detections"])
    source = source or FixtureSource(FIXTURE["searches"])
    demo = await recorder.record(
        _photo(),
        provider,
        {ItemType.MOVIE: source},
        clock=Clock(),
        today=date(2026, 11, 10),
    )
    return demo, provider, source


@pytest.mark.asyncio
async def test_reads_with_the_readers_own_prompt_and_one_jpeg():
    _, provider, _ = await _record()
    assert len(provider.calls) == 1
    prompt, schema, images = provider.calls[0]
    assert prompt == EXTRACTION_PROMPT
    assert schema == DETECTION_SCHEMA
    assert [image.media_type for image in images] == ["image/jpeg"]


@pytest.mark.asyncio
async def test_matches_every_title_in_reading_order_with_the_matchers_confidence():
    demo, _, source = await _record()
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
async def test_records_stage_timings_the_day_and_the_source_and_is_not_provisional():
    demo, _, _ = await _record()
    assert demo["provisional"] is False
    assert demo["recorded_on"] == "2026-11-10"
    assert demo["sources"] == ["tmdb"]
    # The clock ticks 0.25 s per reading: read is one gap, match one gap.
    assert demo["stages"] == {"read_ms": 250, "match_ms": 250}


@pytest.mark.asyncio
async def test_carries_no_ids_no_urls_and_no_image_bytes():
    demo, _, _ = await _record()
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
async def test_refuses_a_run_where_a_source_could_not_answer():
    source = FixtureSource(FIXTURE["searches"], raises_for={"The Thing"})
    with pytest.raises(recorder.RecordingRefused, match="tmdb is down"):
        await _record(source=source)


@pytest.mark.asyncio
async def test_refuses_a_photo_where_nothing_was_read():
    with pytest.raises(recorder.RecordingRefused, match="no titles"):
        await _record(provider=FixtureProvider({"detections": []}))


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
