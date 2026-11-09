"""Model CRUD smoke for the Closet tables (migration 0014).

The migration tests prove the schema; this proves the ORM mapping writes and
reads it: enum values, the bytea image, the JSONB defaults and the cascades.
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentDecision,
    GarmentImage,
    GarmentOutcome,
    GarmentStatus,
    GarmentTagSource,
    Outfit,
    OutfitGarment,
    OutfitPlan,
    OutfitSource,
    Wear,
)


@pytest.mark.asyncio
async def test_closet_rows_round_trip(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        garment = Garment()
        session.add(garment)
        await session.flush()
        assert garment.status is GarmentStatus.UNTAGGED
        assert garment.tag_attempts == 0
        session.add(
            GarmentImage(garment_id=garment.id, webp=b"RIFF", width=4, height=5)
        )

        garment.name = "Oxford, blue"
        garment.category = GarmentCategory.TOP
        garment.seasons = [3, 4, 5]
        garment.tag_source = GarmentTagSource.MANUAL
        garment.status = GarmentStatus.ACTIVE

        outfit = Outfit(
            worn_on=date(2026, 11, 9), occasion="office", source=OutfitSource.PLANNED
        )
        session.add(outfit)
        await session.flush()
        session.add(
            OutfitGarment(
                outfit_id=outfit.id, garment_id=garment.id, slot=GarmentCategory.TOP
            )
        )
        session.add(
            Wear(garment_id=garment.id, worn_on=date(2026, 11, 9), outfit_id=outfit.id)
        )
        session.add(
            OutfitPlan(
                day=date(2026, 11, 10), occasion="office", bike=False, body={"lead": []}
            )
        )
        session.add(ClosetProfile())
        session.add(
            GarmentDecision(
                garment_id=garment.id,
                outcome=GarmentOutcome.KEPT,
                decided_on=date(2026, 11, 9),
            )
        )
        session.add(ClosetSetting(key="tag.last_run", value={"state": "ok"}))
        await session.commit()

    async with sessionmaker_for_test() as session:
        stored = (await session.execute(select(Garment))).scalar_one()
        assert stored.category is GarmentCategory.TOP
        assert stored.seasons == [3, 4, 5]
        image = await session.get(GarmentImage, stored.id)
        assert (image.webp, image.width, image.height) == (b"RIFF", 4, 5)
        profile = await session.get(ClosetProfile, 1)
        assert (profile.repeat_top_days, profile.tag_budget) == (5, 5)

        await session.delete(stored)
        await session.commit()

    async with sessionmaker_for_test() as session:
        for model in (GarmentImage, Wear, OutfitGarment, GarmentDecision):
            count = await session.scalar(select(func.count()).select_from(model))
            assert count == 0, model.__name__
        assert await session.scalar(select(func.count()).select_from(Outfit)) == 1
