"""#334: the compat shim never touches a volume with edited=true."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from models import ComicVolume, Item
from tests.test_comic_volume_marks import ed, make, resync, volumes

pytestmark = pytest.mark.asyncio


async def edit(factory, item_id, slug="ed-1-6", **fields):
    async with factory() as session:
        volume = await session.scalar(
            select(ComicVolume).where(
                ComicVolume.item_id == item_id, ComicVolume.slug == slug
            )
        )
        volume.edited = True
        for key, value in fields.items():
            setattr(volume, key, value)
        await session.commit()


async def test_shim_leaves_an_edited_volume_unchanged(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6, "Trade")])
    await edit(factory, item_id, label="My label", kind="ogn", position=7)
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Renamed", 1, 6, "Hardcover", description=["x"])]
        await session.commit()
    await resync(factory, item_id)
    (volume,) = await volumes(factory, item_id)
    assert (volume.label, volume.kind, volume.position) == ("My label", "ogn", 7)
    assert volume.description is None


async def test_shim_never_deletes_an_edited_volume_whose_edition_vanished(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6), ed("Vol 2", 7, 12)])
    await edit(factory, item_id, slug="ed-7-12")
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Vol 1", 1, 6)]
        await session.commit()
    await resync(factory, item_id)
    assert [v.slug for v in await volumes(factory, item_id)] == ["ed-1-6", "ed-7-12"]


async def test_shim_still_deletes_an_unedited_volume_whose_edition_vanished(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6), ed("Vol 2", 7, 12)])
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Vol 1", 1, 6)]
        await session.commit()
    await resync(factory, item_id)
    assert [v.slug for v in await volumes(factory, item_id)] == ["ed-1-6"]


async def test_an_edited_volume_does_not_block_or_duplicate_its_edition(
    sessionmaker_for_test,
):
    """The edition stays in items.editions: the shim must not try to create a
    second `ed-1-6` (the unique slug) and must still follow the others."""
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6)])
    await edit(factory, item_id)
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Vol 1", 1, 6), ed("Vol 2", 7, 12)]
        await session.commit()
    await resync(factory, item_id)
    await resync(factory, item_id)
    assert [v.slug for v in await volumes(factory, item_id)] == ["ed-1-6", "ed-7-12"]


async def test_unedited_volumes_still_follow_the_editions(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6)])
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Renamed", 1, 6)]
        await session.commit()
    await resync(factory, item_id)
    (volume,) = await volumes(factory, item_id)
    assert volume.label == "Renamed"
