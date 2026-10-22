"""Store rows survive JSON exactly, and anything else is refused."""

import dataclasses
import json
from datetime import date
from decimal import Decimal

import httpx2
import pytest
from physical_support import serve_fixtures

from physical_sources import shopify, wire
from physical_sources.base import HostThrottle, PhysicalSourceError, StoreProduct
from physical_sources.stores import STORES

SHOPIFY = sorted(key for key, config in STORES.items() if config.adapter == "shopify")
TODAY = date(2026, 10, 22)


async def parsed(key: str) -> list[StoreProduct]:
    async with httpx2.AsyncClient(
        transport=httpx2.MockTransport(serve_fixtures())
    ) as client:
        products, errors = await shopify.list_products(
            STORES[key], client, None, HostThrottle(per_second=1000), today=TODAY
        )
    assert errors == []
    return products


def a_row(**changes) -> dict:
    row = wire.product_to_wire(
        StoreProduct(
            store="nicalis",
            store_product_id="1",
            variant_id="2",
            handle="cave-story",
            url="https://store.nicalis.com/products/cave-story",
            region="USA",
            title="Cave Story+",
            title_normalized="cave story",
            edition_label=None,
            platform_id=508,
            platform_label="Nintendo Switch 2",
            is_game=True,
            collections_seen=("new",),
            price=Decimal("39.99"),
            currency="USD",
            availability="in_stock",
            release_date=date(2026, 11, 1),
            release_precision="day",
            raw={"tags": ["switch"]},
        )
    )
    row.update(changes)
    return row


def test_every_field_is_decided():
    decided = wire._TEXT | wire._OPTIONAL_TEXT | wire._DATES | wire._OTHER
    assert decided == {field.name for field in dataclasses.fields(StoreProduct)}


@pytest.mark.asyncio
@pytest.mark.parametrize("key", SHOPIFY)
async def test_every_recorded_store_round_trips_through_json(key):
    products = await parsed(key)
    assert products
    body = json.loads(json.dumps([wire.product_to_wire(p) for p in products]))
    back = [wire.product_from_wire(row) for row in body]
    assert back == products
    # raw is compare=False on the dataclass, so it is checked on its own.
    assert [p.raw for p in back] == [p.raw for p in products]


def test_the_wire_shapes():
    row = a_row()
    assert row["price"] == "39.99"
    assert row["release_date"] == "2026-11-01"
    assert row["preorder_closes_at"] is None
    assert row["collections_seen"] == ["new"]
    assert wire.product_from_wire(row).price == Decimal("39.99")


@pytest.mark.parametrize(
    "changes",
    [
        {"title": None},
        {"title": 7},
        {"edition_label": 3},
        {"platform_id": True},
        {"platform_id": "508"},
        {"is_game": 1},
        {"collections_seen": "new"},
        {"collections_seen": [1]},
        {"price": 39.99},
        {"price": "lots"},
        {"price": "NaN"},
        {"price": "Infinity"},
        {"release_date": "2026-13-01"},
        {"release_date": 20261101},
        {"raw": []},
    ],
)
def test_a_wrong_type_is_refused(changes):
    with pytest.raises(ValueError):
        wire.product_from_wire(a_row(**changes))


def test_a_missing_or_extra_key_is_refused():
    row = a_row()
    del row["raw"]
    with pytest.raises(ValueError, match="missing \\['raw'\\]"):
        wire.product_from_wire(row)
    with pytest.raises(ValueError, match="extra \\['igdb_id'\\]"):
        wire.product_from_wire(a_row(igdb_id=1))
    with pytest.raises(ValueError):
        wire.product_from_wire(["not", "an", "object"])


def test_errors_round_trip_and_refuse_other_shapes():
    error = wire.error_from_wire(
        wire.error_to_wire(PhysicalSourceError("handle new: HTTP 429", "http_error"))
    )
    assert (error.code, error.detail) == ("http_error", "handle new: HTTP 429")
    for bad in ({"code": "x"}, {"code": 1, "detail": "d"}, {"code": "", "detail": ""}):
        with pytest.raises(ValueError):
            wire.error_from_wire(bad)
