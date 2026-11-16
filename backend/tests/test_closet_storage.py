"""Closet product storage (#393): store colour, colour source, size, the
purchase date and the `garment_products` side table."""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from models import (
    Garment,
    GarmentColorSource,
    GarmentProduct,
    GarmentProductSource,
)
from tests.test_closet_routes import _garment, client_for

pytestmark = pytest.mark.asyncio


async def test_a_product_row_round_trips_and_cascades(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        garment = Garment(
            color_name="Burgundy", color_source=GarmentColorSource.VENDOR, size="M"
        )
        session.add(garment)
        await session.flush()
        session.add(
            GarmentProduct(
                garment_id=garment.id,
                source=GarmentProductSource.STITCHFIX,
                order_ref="SF-1",
                store_item_no="123",
                title="Oxford",
                price=Decimal("48.50"),
                snapshot={"sizes": ["M"]},
                fetched_at=datetime(2026, 11, 1, tzinfo=timezone.utc),
            )
        )
        await session.commit()
        product = (await session.scalars(select(GarmentProduct))).one()
        assert product.url is None
        assert product.price == Decimal("48.50")
        assert product.snapshot == {"sizes": ["M"]}
        await session.delete(garment)
        await session.commit()
        assert (await session.scalars(select(GarmentProduct))).all() == []


async def test_one_product_row_per_garment(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        garment = Garment()
        session.add(garment)
        await session.flush()
        for _ in range(2):
            session.add(
                GarmentProduct(garment_id=garment.id, source=GarmentProductSource.LINK)
            )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_a_hand_set_store_colour_is_manual(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        created = await client.post(
            "/api/closet/garments",
            json={"name": "Tee", "color_name": "  Heather Grey ", "size": " L "},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["color_name"] == "Heather Grey"
        assert body["color_source"] == "manual"
        assert body["size"] == "L"

        cleared = await client.patch(
            f"/api/closet/garments/{body['id']}", json={"color_name": None}
        )
        assert cleared.json()["color_name"] is None
        assert cleared.json()["color_source"] is None


async def test_a_patch_without_a_colour_leaves_the_source_alone(sessionmaker_for_test):
    row = await _garment(
        sessionmaker_for_test,
        color_name="Navy",
        color_source=GarmentColorSource.VENDOR,
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/closet/garments/{row.id}", json={"size": "32"}
        )
    body = response.json()
    assert (body["color_name"], body["color_source"], body["size"]) == (
        "Navy",
        "vendor",
        "32",
    )


async def test_a_purchase_date_writes_acquired_on(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/closet/garments", json={"purchased_on": "2026-03-04"}
        )
    assert response.status_code == 201
    assert response.json()["acquired_on"] == "2026-03-04"
    async with sessionmaker_for_test() as session:
        stored = (await session.scalars(select(Garment))).one()
        assert stored.acquired_on == date(2026, 3, 4)
