"""Writes the comic sitting's intake API bodies from the backend's own code.

Check's `adds`, `contents_preview` and `already_held` are built here by the
real `intake.volume_plan.book_plan` and `preview` (the functions the routes
call), then the whole sitting is validated through `SittingOut` and the commit
answer through `CommitOut`. A key the API never sends cannot be hand-invented
in the frontend's tests. Run from `backend/`:
`./.venv/bin/python scripts/export_intake_comic_fixtures.py`.
Writes `frontend/e2e/fixtures/api/intake-comic-*.json`. All data is invented.
"""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from intake.schemas import CommitOut, SittingOut
from intake.volume_plan import book_plan, preview

OUT = str(Path(__file__).resolve().parents[2] / "frontend/e2e/fixtures/api") + "/"
SAGA = "11111111-1111-1111-1111-111111111111"
VOL = "aaaaaaaa-0000-0000-0000-000000000002"
MATCH = dict(
    external_source="comicvine",
    external_id="4050-1",
    title="Saga",
    year=2012,
    publisher="Image",
    issue_count=66,
)


def entry(n, payload, *, matched=True, on_title=True, held=None, note=None):
    """One comic entry with the server-built fields `comic_adds_for` adds."""
    payload = {
        "detected_title": "Saga",
        "number_source": "none",
        "format": "single",
        **payload,
    }
    if note:
        payload["reprint_note"] = note
    row = {"title": payload["detected_title"]}
    if matched:
        row.update(external_source="comicvine", external_id="4050-1")
    item = SimpleNamespace(id=SAGA, title="Saga", source_metadata={}, year=2012)
    item = item if on_title else None
    book = payload["format"] == "collected"
    plan = book_plan(payload, row, item, MATCH if matched else None) if book else None
    shown = preview(payload, plan, item, held if book else None)
    return {
        "id": f"e{n}",
        "photo_id": f"p{n}",
        "kind": "comic",
        "state": "exact" if matched else "typed",
        "payload": payload,
        "candidates": [],
        "chosen": MATCH if matched else None,
        "garment_id": None,
        "on_shelf": None,
        "number_check": {"state": "in_run" if not book else "none", "run": 66},
        **shown,
    }


entries = [
    # a single issue
    entry(1, {"issue_number": 7, "number_source": "read"}),
    # a collected book on a title that exists, with contents, to be held twice
    entry(
        2,
        {
            "detected_title": "Saga Book Two",
            "format": "collected",
            "edition_kind": "hardcover",
            "collects_from": 7,
            "collects_to": 12,
            "line_number": 2,
        },
        held={"volume_id": VOL, "slug": "vol-2", "label": "Saga, Book Two"},
        note="Collects Saga #7-12 and Saga Annual 1",
    ),
    # a collected book that starts a new title, nothing read to list
    entry(
        3,
        {"detected_title": "Hidden Run", "format": "collected", "edition_kind": "ogn"},
        matched=False,
        on_title=False,
    ),
    # a collected book on an existing title with no range and no note
    entry(
        4,
        {
            "detected_title": "Saga Compendium",
            "format": "collected",
            "edition_kind": "compendium",
        },
    ),
]
sitting = SittingOut.model_validate(
    dict(
        id="s1",
        area="shelf",
        kind="comic",
        label="Box one",
        step="check",
        photos=[
            dict(id=e["photo_id"], state="read", filename=f"{e['id']}.jpg", error=None)
            for e in entries
        ],
        entries=entries,
    )
)

commit = CommitOut.model_validate(
    dict(
        series_new=[],
        added=3,
        already_owned=0,
        issues_added=0,
        series_grew=[],
        skipped_kept=0,
        photos_empty=0,
        photos_waiting=0,
        images_missing=0,
        file_import=None,
        refused=[],
        created=[SAGA],
        volumes_new=[
            dict(
                id=VOL,
                slug="vol-2",
                label="Saga Book Two",
                kind="hardcover",
                line_number=2,
                title="Saga",
                title_id=SAGA,
                title_created=False,
            ),
            dict(
                id="aaaaaaaa-0000-0000-0000-000000000009",
                slug="vol-1",
                label="Hidden Run",
                kind="ogn",
                line_number=None,
                title="Hidden Run",
                title_id="22222222-2222-2222-2222-222222222222",
                title_created=True,
            ),
        ],
        titles_created=[
            dict(id="22222222-2222-2222-2222-222222222222", title="Hidden Run")
        ],
    )
)


def w(name, model):
    open(OUT + name, "w").write(
        json.dumps(json.loads(model.model_dump_json()), indent=2) + "\n"
    )


w("intake-comic-sitting.json", sitting)
w("intake-comic-commit.json", commit)
