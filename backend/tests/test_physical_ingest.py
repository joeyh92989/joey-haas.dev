"""A Shopify walk run on the nightly runner, posted to the API.

The ingest route records one store's run exactly as a walk on Render would
(physical_routes.record_store), and takes only that store's own rows.
"""

import asyncio
from datetime import date

import httpx2
import pytest
from physical_support import client_for, serve_fixtures
from sqlalchemy import func, select

from models import CatalogueRun, StoreListing
from physical_sources import shopify, wire
from physical_sources.base import HostThrottle, PhysicalSourceError
from physical_sources.stores import STORES

pytestmark = pytest.mark.asyncio


async def walked(key: str, today: date | None = None) -> list:
    async with httpx2.AsyncClient(
        transport=httpx2.MockTransport(serve_fixtures())
    ) as client:
        products, errors = await shopify.list_products(
            STORES[key], client, None, HostThrottle(per_second=1000), today=today
        )
    assert errors == []
    return products


def body(products, errors=()) -> dict:
    return {
        "products": [wire.product_to_wire(p) for p in products],
        "errors": [wire.error_to_wire(e) for e in errors],
    }


async def live(factory, store: str) -> int:
    async with factory() as session:
        return await session.scalar(
            select(func.count())
            .select_from(StoreListing)
            .where(StoreListing.store == store, StoreListing.availability != "archived")
        )


async def test_an_ingest_writes_what_a_walk_here_writes(sessionmaker_for_test):
    products = await walked("super_rare")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/stores/super_rare/ingest", json=body(products)
        )
        assert response.status_code == 200
        run = response.json()
        assert (run["source"], run["ok"], run["errors"]) == ("super_rare", True, [])
        assert run["rows_seen"] == run["rows_changed"] == len(products)
        # The same store walked here finds nothing to change.
        refresh = await client.post(
            "/api/physical/refresh", json={"stores": ["super_rare"]}
        )
    (again,) = refresh.json()["runs"]
    assert (again["ok"], again["rows_seen"], again["rows_changed"]) == (
        True,
        len(products),
        0,
    )
    assert await live(sessionmaker_for_test, "super_rare") == len(products)


async def test_a_clean_ingest_archives_what_it_no_longer_saw(sessionmaker_for_test):
    products = await walked("nicalis")
    async with client_for(sessionmaker_for_test) as client:
        url = "/api/physical/stores/nicalis/ingest"
        await client.post(url, json=body(products))
        # An error keeps the unseen row live: its handle may have hidden it.
        failed = await client.post(
            url,
            json=body(products[1:], [PhysicalSourceError("handle new: HTTP 429")]),
        )
        assert failed.json()["rows_retired"] == 0
        assert await live(sessionmaker_for_test, "nicalis") == len(products)
        clean = await client.post(url, json=body(products[1:]))
        assert clean.json()["rows_retired"] == 1
        # A short run (under half the last) upserts and archives nothing.
        short = await client.post(url, json=body(products[1:3]))
        assert short.json()["short_run"] is True
        assert short.json()["rows_retired"] == 0
        empty = await client.post(url, json=body([]))
        assert empty.json()["ok"] is False
    assert await live(sessionmaker_for_test, "nicalis") == len(products) - 1


async def test_an_ingest_records_the_walks_errors(sessionmaker_for_test):
    products = await walked("nicalis")
    error = PhysicalSourceError("handle new: HTTP 429", "http_error")
    async with client_for(sessionmaker_for_test) as client:
        run = (
            await client.post(
                "/api/physical/stores/nicalis/ingest", json=body(products, [error])
            )
        ).json()
    assert run["ok"] is True
    assert run["errors"] == [{"code": "http_error", "detail": "handle new: HTTP 429"}]


async def test_html_skip_lists_the_pages_read_this_week(sessionmaker_for_test):
    products = await walked("limited_run")
    checked = sorted({p.handle for p in products if "html_checked_at" in p.raw})
    assert checked
    async with client_for(sessionmaker_for_test) as client:
        before = await client.get("/api/physical/stores/limited_run/html-skip")
        await client.post(
            "/api/physical/stores/limited_run/ingest", json=body(products)
        )
        after = await client.get("/api/physical/stores/limited_run/html-skip")
    assert before.json() == {"handles": []}
    assert after.json() == {"handles": checked}


def _changed(products, **changes) -> dict:
    sent = body(products)
    sent["products"][0].update(changes)
    return sent


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"store": "nicalis"}, "store is 'nicalis'"),
        ({"url": "https://evil.example/products/x"}, "url is not on the store's"),
        ({"url": "http://superraregames.com/products/x"}, "url is not on the"),
        ({"availability": "archived"}, "availability 'archived'"),
        ({"format_tier": "manual"}, "format_tier 'manual'"),
        ({"format_hint": "cassette"}, "format_hint 'cassette'"),
        ({"region": "USAAA"}, "region is longer than 4"),
        ({"platform_id": 40000}, "platform_id is out of range"),
        ({"price": "1000000"}, "price is out of range"),
        ({"price": "-1"}, "price is out of range"),
        ({"raw": {"body": "x" * 60_000}}, "raw is longer"),
        ({"is_game": "yes"}, "is_game is not a boolean"),
    ],
)
async def test_a_row_that_is_not_the_stores_own_is_422(
    sessionmaker_for_test, changes, detail
):
    products = await walked("super_rare")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/stores/super_rare/ingest", json=_changed(products, **changes)
        )
    assert response.status_code == 422
    assert detail in response.json()["detail"]
    assert await live(sessionmaker_for_test, "super_rare") == 0


@pytest.mark.parametrize("key", ["atari", "pixelheart"])
async def test_only_a_shopify_store_takes_an_ingest(sessionmaker_for_test, key):
    async with client_for(sessionmaker_for_test) as client:
        ingest = await client.post(
            f"/api/physical/stores/{key}/ingest", json={"products": [], "errors": []}
        )
        skip = await client.get(f"/api/physical/stores/{key}/html-skip")
    assert ingest.status_code == skip.status_code == 422


async def test_a_malformed_error_is_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/stores/nicalis/ingest",
            json={"products": [], "errors": [{"code": "x"}]},
        )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/physical/stores/nicalis/ingest"),
        ("get", "/api/physical/stores/nicalis/html-skip"),
    ],
)
async def test_both_routes_need_the_admin(sessionmaker_for_test, method, path):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await getattr(client, method)(path)).status_code == 401


async def test_an_ingest_during_a_refresh_is_409(sessionmaker_for_test):
    gate, entered = asyncio.Event(), asyncio.Event()
    handler = serve_fixtures(gate=gate, entered=entered)
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        first = asyncio.create_task(
            client.post("/api/physical/refresh", json={"stores": ["pixelheart"]})
        )
        await asyncio.wait_for(entered.wait(), timeout=10)
        second = await client.post(
            "/api/physical/stores/nicalis/ingest", json={"products": [], "errors": []}
        )
        gate.set()
        assert (await first).status_code == 200
    assert second.status_code == 409
    async with sessionmaker_for_test() as session:
        sources = (await session.scalars(select(CatalogueRun.source))).all()
    assert "nicalis" not in sources


async def test_refresh_by_adapter_walks_only_that_adapters_stores(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        runs = (
            await client.post("/api/physical/refresh", json={"adapter": "woocommerce"})
        ).json()["runs"]
    assert sorted(run["source"] for run in runs) == sorted(
        key for key, config in STORES.items() if config.adapter == "woocommerce"
    )


async def test_an_unknown_adapter_is_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"adapter": "magento"}
        )
    assert response.status_code == 422
