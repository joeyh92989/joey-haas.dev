"""Audit the comic rows before the book-first migration (#324).

Read-only. Counts comic rows by what they hold (only singles, only editions,
both, neither) and by visibility; lists every distinct `editions[].kind` with
a count; and names the rows the migration (0021) needs care with: overlapping
editions, a Comic Vine link on an edition, skips, `read_to`, stub
`comic_issues` rows, and editions it cannot map cleanly.

Reads DATABASE_URL_DIRECT from the main checkout's backend/.env (worktrees
have none), the way export_picker_fixture.py does, and never prints it. It
runs only SELECTs.

    ./.venv/bin/python scripts/audit_comics.py
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

MAPPED_KINDS = {"trade", "hardcover", "omnibus"}
SMALLINT_MAX = 32767
HOLDINGS = ("only singles", "only editions", "both", "neither")
VISIBILITY = ("public", "private", "following")


@dataclass(frozen=True)
class AuditRow:
    """One comic `items` row, as far as the audit reads it."""

    id: str
    title: str
    is_public: bool = False
    following: bool = False
    issues_owned: str | None = None
    issues_skipped: str | None = None
    read_to: int | None = None
    editions: object = None
    stub_issues: int = 0


@dataclass
class Report:
    rows: int = 0
    # (holdings, visibility) -> count
    grid: Counter = field(default_factory=Counter)
    kinds: Counter = field(default_factory=Counter)
    editions: int = 0
    overlapping: list[str] = field(default_factory=list)
    linked: list[str] = field(default_factory=list)
    skips: list[str] = field(default_factory=list)
    read_to: list[str] = field(default_factory=list)
    stubs: list[str] = field(default_factory=list)
    unmappable: list[tuple[str, str]] = field(default_factory=list)


def visibility(row: AuditRow) -> str:
    """public wins; a private followed-only row is `following`; the rest are
    `private`."""
    if row.is_public:
        return "public"
    return "following" if row.following else "private"


def entries(row: AuditRow) -> list:
    """The editions as the migration reads them: one volume per entry of a
    JSON array, whatever it holds."""
    return list(row.editions) if isinstance(row.editions, list) else []


def holdings(row: AuditRow) -> str:
    singles = bool((row.issues_owned or "").strip())
    editions = bool(entries(row))
    if singles and editions:
        return "both"
    if singles:
        return "only singles"
    return "only editions" if editions else "neither"


def _int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def problems(edition: object) -> list[str]:
    """Why the migration cannot copy an entry cleanly (it still copies it, with
    a fallback; nothing is dropped)."""
    if not isinstance(edition, dict):
        return ["entry is not an object"]
    out = []
    kind = edition.get("kind")
    if not isinstance(kind, str) or not kind.strip():
        out.append("no kind")
    if not isinstance(edition.get("label"), str) or not edition["label"].strip():
        out.append("no label")
    low, high = edition.get("from"), edition.get("to")
    if not (_int(low) and _int(high)):
        out.append("from/to are not whole numbers")
    elif not (0 <= low <= SMALLINT_MAX and 0 <= high <= SMALLINT_MAX):
        out.append("from/to out of range")
    elif low > high:
        out.append("range runs backwards")
    cv_id = edition.get("cv_id")
    if cv_id is not None and not (_int(cv_id) and 0 < cv_id <= 2147483647):
        out.append("cv_id is not a usable number")
    return out


def overlaps(editions: list) -> bool:
    spans = []
    for edition in editions:
        if isinstance(edition, dict) and _int(edition.get("from")):
            high = edition.get("to")
            if _int(high):
                spans.append((edition["from"], high))
    spans.sort()
    return any(b[0] <= a[1] for a, b in zip(spans, spans[1:], strict=False))


def analyse(rows: list[AuditRow]) -> Report:
    report = Report()
    for row in rows:
        report.rows += 1
        report.grid[(holdings(row), visibility(row))] += 1
        mine = entries(row)
        report.editions += len(mine)
        for edition in mine:
            if isinstance(edition, dict):
                report.kinds[str(edition.get("kind"))] += 1
            else:
                report.kinds["(not an object)"] += 1
            for problem in problems(edition):
                report.unmappable.append((row.title, problem))
        if overlaps(mine):
            report.overlapping.append(row.title)
        if any(isinstance(e, dict) and e.get("cv_id") is not None for e in mine):
            report.linked.append(row.title)
        if (row.issues_skipped or "").strip():
            report.skips.append(row.title)
        if row.read_to is not None:
            report.read_to.append(row.title)
        if row.stub_issues:
            report.stubs.append(row.title)
    return report


def _names(titles: list[str]) -> str:
    return ", ".join(sorted(titles)) if titles else "none"


def render(report: Report) -> str:
    lines = [f"Comic rows: {report.rows}", "", "By what they hold and who sees them"]
    width = max(len(name) for name in HOLDINGS)
    lines.append(f"  {'':<{width}}  " + "  ".join(f"{v:>9}" for v in VISIBILITY))
    for name in HOLDINGS:
        counts = [report.grid[(name, v)] for v in VISIBILITY]
        lines.append(
            f"  {name:<{width}}  "
            + "  ".join(f"{c:>9}" for c in counts)
            + f"   = {sum(counts)}"
        )
    lines += ["", f"Edition entries (comic_volumes rows to expect): {report.editions}"]
    lines.append("Edition kinds (kind mapped to trade unless Trade/Hardcover/Omnibus):")
    if not report.kinds:
        lines.append("  none")
    for kind, count in sorted(report.kinds.items(), key=lambda kv: (-kv[1], kv[0])):
        mapped = "mapped as is" if kind.strip().lower() in MAPPED_KINDS else "-> trade"
        lines.append(f"  {kind!r}: {count} ({mapped})")
    lines += [
        "",
        f"Rows with overlapping editions ({len(report.overlapping)}): "
        + _names(report.overlapping),
        f"Rows with an edition cv_id ({len(report.linked)}): " + _names(report.linked),
        f"Rows with skips ({len(report.skips)}): " + _names(report.skips),
        f"Rows with read_to set ({len(report.read_to)}): " + _names(report.read_to),
        f"Rows with stub comic_issues ({len(report.stubs)}): " + _names(report.stubs),
        "",
        f"Editions the migration cannot map cleanly ({len(report.unmappable)}; "
        "each is still copied, with a fallback):",
    ]
    if not report.unmappable:
        lines.append("  none")
    lines += [f"  {title}: {problem}" for title, problem in report.unmappable]
    return "\n".join(lines)


async def load(session) -> list[AuditRow]:
    """Every comic row plus its stub `comic_issues` count. SELECTs only."""
    from sqlalchemy import func, select

    from models import ComicIssue, Item, ItemType

    stubs = dict(
        (
            await session.execute(
                select(ComicIssue.item_id, func.count())
                .where(ComicIssue.cv_id.is_(None))
                .group_by(ComicIssue.item_id)
            )
        ).all()
    )
    result = await session.execute(
        select(
            Item.id,
            Item.title,
            Item.is_public,
            Item.following,
            Item.issues_owned,
            Item.issues_skipped,
            Item.read_to,
            Item.editions,
        )
        .where(Item.type == ItemType.COMIC)
        .order_by(Item.title)
    )
    return [
        AuditRow(
            id=str(row.id),
            title=row.title,
            is_public=row.is_public,
            following=row.following,
            issues_owned=row.issues_owned,
            issues_skipped=row.issues_skipped,
            read_to=row.read_to,
            editions=row.editions,
            stub_issues=stubs.get(row.id, 0),
        )
        for row in result.all()
    ]


async def build(session) -> str:
    return render(analyse(await load(session)))


def _database_url() -> str:
    spec = importlib.util.spec_from_file_location(
        "migrate_neon", BACKEND / "scripts" / "migrate_neon.py"
    )
    migrate_neon = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migrate_neon)
    env = migrate_neon.main_checkout_env()
    url = migrate_neon.read_variable(env.read_text()) if env.exists() else None
    if not url:
        raise SystemExit(f"{migrate_neon.VARIABLE} is not set in {env}")
    return url


async def run() -> str:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from db import connect_args_for, normalize_async_url

    url = normalize_async_url(_database_url())
    engine = create_async_engine(url, connect_args=connect_args_for(url))
    try:
        async with async_sessionmaker(engine)() as session:
            # The audit only reads; a read-only transaction makes that a fact.
            await session.execute(text("SET TRANSACTION READ ONLY"))
            return await build(session)
    finally:
        await engine.dispose()


def main(argv: list[str]) -> int:
    argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_args(argv)
    print(asyncio.run(run()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
