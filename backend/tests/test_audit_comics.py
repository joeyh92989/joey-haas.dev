"""scripts/audit_comics.py (#324): the report logic, and that it only reads."""

import importlib.util
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from models import ComicIssue, Item, ItemStatus, ItemType

SCRIPT = Path(__file__).parents[1] / "scripts" / "audit_comics.py"
spec = importlib.util.spec_from_file_location("audit_comics", SCRIPT)
audit = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = audit
spec.loader.exec_module(audit)

Row = audit.AuditRow


def _rows():
    return [
        Row("1", "Singles", is_public=True, issues_owned="1-5", read_to=3),
        Row(
            "2",
            "Trades",
            editions=[
                {"kind": "Trade", "label": "A", "from": 1, "to": 6},
                {"kind": "Trade", "label": "B", "from": 5, "to": 9},
                {"kind": "Compendium TPB", "label": "C", "from": 10, "to": 12},
            ],
        ),
        Row(
            "3",
            "Mixed",
            following=True,
            issues_owned="1",
            issues_skipped="2",
            editions=[
                {"kind": "hardcover", "label": "H", "from": 1, "to": 1, "cv_id": 9}
            ],
            stub_issues=2,
        ),
        Row("4", "Nothing"),
        Row("5", "Odd", editions=["junk", {"kind": "Trade", "from": 4, "to": 2}]),
    ]


def test_grid_counts_holdings_by_visibility():
    report = audit.analyse(_rows())
    assert report.rows == 5
    assert report.grid[("only singles", "public")] == 1
    assert report.grid[("only editions", "private")] == 2
    assert report.grid[("both", "following")] == 1
    assert report.grid[("neither", "private")] == 1


def test_kinds_are_counted_as_written_and_total_editions():
    report = audit.analyse(_rows())
    assert report.editions == 6
    assert report.kinds["Trade"] == 3
    assert report.kinds["Compendium TPB"] == 1
    assert report.kinds["hardcover"] == 1
    assert report.kinds["(not an object)"] == 1


def test_flags_overlap_links_skips_read_to_stubs():
    report = audit.analyse(_rows())
    assert report.overlapping == ["Trades"]
    assert report.linked == ["Mixed"]
    assert report.skips == ["Mixed"]
    assert report.read_to == ["Singles"]
    assert report.stubs == ["Mixed"]


def test_unmappable_entries_name_the_problem():
    report = audit.analyse(_rows())
    found = set(report.unmappable)
    assert ("Odd", "entry is not an object") in found
    assert ("Odd", "range runs backwards") in found
    assert ("Odd", "no label") in found
    assert not [t for t, _ in report.unmappable if t in ("Trades", "Mixed")]


def test_render_mentions_every_required_section():
    text = audit.render(audit.analyse(_rows()))
    for needle in (
        "only singles",
        "Edition entries",
        "'Compendium TPB': 1 (-> trade)",
        "overlapping editions (1): Trades",
        "cv_id (1): Mixed",
        "skips (1): Mixed",
        "read_to set (1): Singles",
        "stub comic_issues (1): Mixed",
        "cannot map cleanly",
    ):
        assert needle in text


def test_empty_database_renders():
    assert "Comic rows: 0" in audit.render(audit.analyse([]))


@pytest.mark.asyncio
async def test_load_reads_rows_and_changes_nothing(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = uuid.uuid4()
        session.add_all(
            [
                Item(
                    id=item_id,
                    type=ItemType.COMIC,
                    title="Saga",
                    status=ItemStatus.BACKLOG,
                    editions=[{"kind": "Trade", "label": "V1", "from": 1, "to": 6}],
                    read_to=2,
                ),
                Item(
                    type=ItemType.GAME, title="Not a comic", status=ItemStatus.BACKLOG
                ),
            ]
        )
        await session.flush()
        session.add(ComicIssue(item_id=item_id, number=7, owned=True))
        await session.commit()
    async with sessionmaker_for_test() as session:
        rows = await audit.load(session)
        text = await audit.build(session)
        assert [r.title for r in rows] == ["Saga"]
        assert rows[0].stub_issues == 1
        assert "Edition entries (comic_volumes rows to expect): 1" in text
        assert len((await session.execute(select(Item))).all()) == 2
