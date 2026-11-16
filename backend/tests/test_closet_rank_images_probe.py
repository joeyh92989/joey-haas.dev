"""The ranker-images probe, offline: fake providers, never a real model."""

import importlib.util
import io
import sys
from datetime import date
from pathlib import Path

import pytest
from PIL import Image as PILImage

from llm import LLMError
from models import Garment, GarmentCategory, GarmentImage, GarmentStatus

SCRIPT = Path(__file__).parent.parent / "scripts" / "closet_rank_images_probe.py"
spec = importlib.util.spec_from_file_location("closet_rank_images_probe", SCRIPT)
probe = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = probe
spec.loader.exec_module(probe)

pytestmark = pytest.mark.asyncio


class Fake:
    def __init__(self, refuse_images=False):
        self.refuse_images = refuse_images
        self.calls = []

    async def complete_json(self, prompt, schema, images=None):
        self.calls.append((prompt, len(images or [])))
        if images and self.refuse_images:
            raise LLMError("payload refused")
        return {"outfits": []}


async def test_it_measures_each_provider_with_and_without_images(
    sessionmaker_for_test,
):
    out = io.BytesIO()
    PILImage.new("RGB", (800, 600), (9, 9, 9)).save(out, format="WEBP")
    async with sessionmaker_for_test() as session:
        for name, category in [("tee", "top"), ("jeans", "bottom"), ("shoe", "shoes")]:
            row = Garment(
                name=name,
                category=GarmentCategory(category),
                warmth=2,
                formality=2,
                seasons=[],
                status=GarmentStatus.ACTIVE,
                tag_attempts=0,
            )
            session.add(row)
            await session.flush()
            session.add(
                GarmentImage(
                    garment_id=row.id, webp=out.getvalue(), width=800, height=600
                )
            )
        await session.commit()
        ok, refusing = Fake(), Fake(refuse_images=True)
        report = await probe.measure(
            session,
            {"ok": ok, "refusing": refusing},
            date(2026, 11, 10),
            "weekend",
            False,
        )
    assert report["images_sent"] == 3
    done = report["providers"]["ok"]
    assert done["text_only"]["images"] == 0 and done["with_images"]["images"] == 3
    assert done["with_images"]["image_bytes"] > 0
    assert done["with_images"]["prompt_bytes"] > done["text_only"]["prompt_bytes"]
    assert done["with_images"]["usage"] is None
    bad = report["providers"]["refusing"]
    assert bad["text_only"]["ok"] and not bad["with_images"]["ok"]
    assert "payload refused" in bad["with_images"]["error"]


async def test_it_refuses_a_remote_database():
    with pytest.raises(SystemExit):
        probe._check_local("postgresql+asyncpg://u:p@db.neon.tech/x", False)
    probe._check_local("postgresql+asyncpg://u:p@localhost/stats_dev", False)
    probe._check_local("postgresql+asyncpg://localhost/stats_dev", False)
