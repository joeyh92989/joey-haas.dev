"""Writes the admin volume API fixtures from the backend's own response models.

Every body is validated through the real pydantic model and dumped from it, so
a key the API does not send cannot be hand-invented in the frontend's tests.
Run from `backend/`: `./.venv/bin/python scripts/export_admin_volume_fixtures.py`.
Writes `frontend/e2e/fixtures/api/admin-volume*.json`. All data is invented.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pydantic import TypeAdapter

from comics_schemas import (
    VolumeAdminOut,
    VolumeDeletePreviewOut,
    VolumeLinkOut,
    VolumeListItemOut,
    VolumeMoveOut,
    VolumeStateOut,
)

OUT = str(Path(__file__).resolve().parents[2] / "frontend/e2e/fixtures/api") + "/"
SERIES = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
VOL = "aaaaaaaa-0000-0000-0000-000000000002"


def view(**kw):
    base = dict(
        id=VOL,
        item_id=SERIES,
        slug="vol-2",
        position=1,
        label="Saga, Book Two",
        kind="hardcover",
        kind_raw=None,
        line_number=2,
        isbn="9781234567890",
        pages=320,
        description="Hazel grows up on the run.",
        cover_url="https://example.test/c.jpg",
        large_url=None,
        cv_id=None,
        owned=True,
        read=False,
        edited=True,
        created_at="2026-11-17T12:00:00+00:00",
        title=dict(id=SERIES, title="Saga", is_public=True),
        collects=[
            dict(
                id="cccccccc-0000-0000-0000-000000000001",
                position=0,
                series_name="Saga",
                issue_text="#7-12",
                source="migrated",
                link=dict(
                    item_id=SERIES,
                    title="Saga",
                    from_number=7,
                    to_number=12,
                    is_public=True,
                ),
            ),
            dict(
                id="cccccccc-0000-0000-0000-000000000002",
                position=1,
                series_name="Saga Special",
                issue_text="Annual 1",
                source="typed",
                link=None,
            ),
            dict(
                id="cccccccc-0000-0000-0000-000000000003",
                position=2,
                series_name="Hidden Run",
                issue_text="#1-2",
                source="photo",
                link=dict(
                    item_id=OTHER,
                    title="Hidden Run",
                    from_number=1,
                    to_number=2,
                    is_public=False,
                ),
            ),
        ],
        prev=dict(
            id="aaaaaaaa-0000-0000-0000-000000000001",
            slug="vol-1",
            label="Saga, Book One",
            line_number=1,
            owned=True,
        ),
        next=dict(
            id="aaaaaaaa-0000-0000-0000-000000000003",
            slug="vol-3",
            label="Saga, Book Three",
            line_number=3,
            owned=False,
        ),
        held_issues="7-12",
        held_count=6,
    )
    base.update(kw)
    return VolumeAdminOut.model_validate(base)


def w(name, model):
    open(OUT + name, "w").write(
        json.dumps(json.loads(model.model_dump_json()), indent=2) + "\n"
    )


w("admin-volume.json", view())
rows = [
    dict(
        id="aaaaaaaa-0000-0000-0000-000000000001",
        slug="vol-1",
        label="Saga, Book One",
        kind="hardcover",
        line_number=1,
        owned=True,
        read=True,
        edited=False,
        collects_count=2,
        cover_url="https://example.test/1.jpg",
    ),
    dict(
        id=VOL,
        slug="vol-2",
        label="Saga, Book Two",
        kind="hardcover",
        line_number=2,
        owned=True,
        read=False,
        edited=True,
        collects_count=3,
        cover_url=None,
    ),
    dict(
        id="aaaaaaaa-0000-0000-0000-000000000003",
        slug="vol-3",
        label="Saga, Book Three",
        kind="trade",
        line_number=3,
        owned=False,
        read=False,
        edited=True,
        collects_count=0,
        cover_url=None,
    ),
]
open(OUT + "admin-volumes.json", "w").write(
    json.dumps(
        json.loads(
            TypeAdapter(list[VolumeListItemOut]).dump_json(
                TypeAdapter(list[VolumeListItemOut]).validate_python(rows)
            )
        ),
        indent=2,
    )
    + "\n"
)
w(
    "admin-volume-delete-preview.json",
    VolumeDeletePreviewOut.model_validate(
        dict(
            label="Saga, Book Two",
            title="Saga",
            collects_count=3,
            issues_unheld=[dict(item_id=SERIES, title="Saga", numbers="7-12", count=6)],
            read_marks_lost=2,
        )
    ),
)
w(
    "admin-volume-state.json",
    VolumeStateOut.model_validate(
        dict(
            id=VOL,
            item_id=SERIES,
            slug="vol-2",
            label="Saga, Book Two",
            kind="hardcover",
            owned=True,
            read=True,
            comic_run=None,
            touched=[SERIES],
        )
    ),
)
w(
    "admin-volume-move.json",
    VolumeMoveOut.model_validate(
        dict(
            volume=json.loads(
                view(
                    item_id=OTHER,
                    slug="vol-3",
                    title=dict(id=OTHER, title="Hidden Run", is_public=False),
                ).model_dump_json()
            ),
            previous_slug="vol-2",
            slug_kept=False,
            touched=[SERIES, OTHER],
        )
    ),
)
w(
    "admin-volume-link.json",
    VolumeLinkOut.model_validate(
        dict(
            id=VOL,
            cv_id=4242,
            cover_url="https://example.test/cv.jpg",
            large_url="https://example.test/cv-large.jpg",
            description="From Comic Vine.",
            edited=True,
        )
    ),
)
