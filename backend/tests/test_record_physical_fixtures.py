"""The fixture recorder's paging helpers (the fetching itself is owner-run)."""

import asyncio
import importlib.util
import json
from pathlib import Path

import httpx2

SCRIPT = Path(__file__).parents[1] / "scripts" / "record_physical_fixtures.py"
spec = importlib.util.spec_from_file_location("record_physical_fixtures", SCRIPT)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)


def test_page_url_replaces_the_page_parameter():
    url = "https://a.test/collections/x/products.json?limit=250&page=1"
    assert recorder.page_url(url, 3) == (
        "https://a.test/collections/x/products.json?limit=250&page=3"
    )


def test_page_url_keeps_parameters_after_the_page():
    url = "https://a.test/wp-json/wc/store/v1/products?per_page=100&page=1&category=65"
    assert recorder.page_url(url, 2).endswith("&page=2&category=65")


def test_page_out_numbers_the_file():
    assert recorder.page_out("shopify/a/x.p1.json", 2) == "shopify/a/x.p2.json"


def test_a_short_page_is_the_last():
    assert recorder.is_last_page(249, 250)
    assert recorder.is_last_page(0, 250)
    assert not recorder.is_last_page(250, 250)


def _walk(tmp_path, monkeypatch, pages, first_count=2, size=2):
    """Runs record_more_pages against canned pages; returns (files, failures)."""
    monkeypatch.setattr(recorder, "FIXTURES", tmp_path)
    monkeypatch.setattr(recorder, "REQUEST_INTERVAL", 0)

    def handler(request):
        number = int(request.url.params["page"])
        body = pages(number)
        return httpx2.Response(200, json=body)

    async def run():
        async with httpx2.AsyncClient(
            transport=httpx2.MockTransport(handler)
        ) as client:
            rec = recorder.Recorder(client, [])
            await recorder.record_more_pages(
                rec,
                "https://a.test/collections/x/products.json?limit=2&page=1",
                "shopify/a/x.p1.json",
                first_count,
                size,
                recorder._shopify_products,
            )
            return rec.failures

    failures = asyncio.run(run())
    files = sorted(p.name for p in (tmp_path / "shopify" / "a").glob("*.json"))
    return files, failures


def test_the_walk_stops_at_a_short_page(tmp_path, monkeypatch):
    def pages(number):
        count = {2: 2, 3: 1}.get(number, 0)
        return {"products": [{"id": i, "images": [1, 2]} for i in range(count)]}

    files, failures = _walk(tmp_path, monkeypatch, pages)
    assert (files, failures) == (["x.p2.json", "x.p3.json"], [])
    written = json.loads((tmp_path / "shopify" / "a" / "x.p2.json").read_text())
    assert written["products"][0]["images"] == [1]


def test_a_short_first_page_walks_nothing(tmp_path, monkeypatch):
    files, _ = _walk(tmp_path, monkeypatch, lambda n: {"products": []}, first_count=1)
    assert files == []


def test_the_walk_stops_at_the_page_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(recorder, "MAX_RECORDED_PAGES", 4)
    full = {"products": [{"id": 1}, {"id": 2}]}
    files, failures = _walk(tmp_path, monkeypatch, lambda n: full)
    assert files == ["x.p2.json", "x.p3.json", "x.p4.json"]
    assert failures and "more than 4 pages" in failures[0]


def test_a_malformed_page_is_a_failure_not_a_crash(tmp_path, monkeypatch):
    files, failures = _walk(tmp_path, monkeypatch, lambda n: {"products": ["x"]})
    assert files == [] and "not an object" in failures[0]
    files, failures = _walk(tmp_path, monkeypatch, lambda n: [1, 2])
    assert files == [] and "no products list" in failures[0]


def test_a_malformed_first_page_is_a_failure_not_a_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(recorder, "FIXTURES", tmp_path)
    monkeypatch.setattr(recorder, "REQUEST_INTERVAL", 0)
    url = "https://a.test/collections/x/products.json?limit=250&page=1"
    monkeypatch.setitem(recorder.SOURCES, "a", [(url, "shopify/a/x.p1.json")])

    async def run():
        transport = httpx2.MockTransport(
            lambda request: httpx2.Response(200, json={"products": ["x"]})
        )
        async with httpx2.AsyncClient(transport=transport) as client:
            rec = recorder.Recorder(client, [])
            await recorder.record_shopify(rec, "a", all_pages=True)
            return rec.failures

    failures = asyncio.run(run())
    assert "not an object" in failures[0]
    assert not (tmp_path / "shopify" / "a" / "x.p1.json").exists()
