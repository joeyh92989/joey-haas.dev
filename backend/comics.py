"""Comics: issue ranges, runs, reading progress and the pull list.

Pure. A series is one row carrying the issues I own as range text ("1–54, 60")
and the collected editions that cover more; everything the shelf and the pull
list show is derived here from that text plus ComicVine's issue snapshot, so
every rule is tested on fixtures. This module is the only range parser: the
API validates with it and the frontend only expands what the API returns.

A week runs Wednesday to Tuesday (new comics day), in UTC days.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TYPE_CHECKING

MAX_ISSUE = 9999
MAX_EDITIONS = 50
EDITION_KIND_MAX = 20
EDITION_LABEL_MAX = 80

# The upcoming segment on an ongoing run: this share of released issues,
# never fewer than TAIL_MIN. The frontend's lanes draw the tail at a fixed
# width and ignore this length; it stays in `segments` for API stability.
TAIL_SHARE = 0.08
TAIL_MIN = 3

PULL_WEEKS = 4
WEEK_START = 2  # Wednesday, as date.weekday() counts

SORT_KEYS = ("next", "title", "publisher", "missing")


class RangeError(ValueError):
    """Range or edition text that cannot be stored; the message is the user's."""


# --- Ranges -----------------------------------------------------------------


def _whole(text: str) -> bool:
    # ASCII only: str.isdigit() also passes "²" (which int() refuses) and
    # Arabic-Indic digits (which int() reads as numbers).
    return text.isascii() and text.isdigit()


def _issue(text: str, whole: str) -> int:
    if not _whole(text):
        raise RangeError(f"{whole!r} is not an issue number or range")
    number = int(text)
    if number < 1:
        raise RangeError("issue numbers start at 1")
    if number > MAX_ISSUE:
        raise RangeError(f"issue numbers stop at {MAX_ISSUE}")
    return number


def merge(ranges: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    """Sorted, with overlapping and adjacent ranges joined."""
    merged: list[tuple[int, int]] = []
    for low, high in sorted(ranges):
        if merged and low <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], high))
        else:
            merged.append((low, high))
    return merged


def parse_ranges(text: str | None) -> list[tuple[int, int]]:
    """'1–54, 60, 62-64' as merged (low, high) pairs; blank is no issues.

    Accepts a hyphen or an en dash. Refuses a reversed range, a chain
    ("1-3-5"), zero, negatives and numbers past MAX_ISSUE.
    """
    if text is None or not text.strip():
        return []
    ranges = []
    for part in text.replace("–", "-").split(","):
        part = part.strip()
        if not part:
            raise RangeError("empty entry between commas")
        ends = [end.strip() for end in part.split("-")]
        if len(ends) == 1:
            number = _issue(ends[0], part)
            ranges.append((number, number))
        elif len(ends) == 2:
            low, high = _issue(ends[0], part), _issue(ends[1], part)
            if low > high:
                raise RangeError(f"{part!r} runs backwards")
            ranges.append((low, high))
        else:
            raise RangeError(f"{part!r} is not an issue number or range")
    return merge(ranges)


def format_ranges(ranges: Iterable[tuple[int, int]] | Iterable[int]) -> str:
    """The canonical text: '1–54, 60, 62–64'. Takes pairs or issue numbers."""
    items = list(ranges)
    pairs = [(n, n) if isinstance(n, int) else n for n in items]
    return ", ".join(
        str(low) if low == high else f"{low}–{high}" for low, high in merge(pairs)
    )


def canonical(text: str | None) -> str | None:
    """Validated, canonical range text for storage; None when blank."""
    return format_ranges(parse_ranges(text)) or None


def union(*texts: str | None) -> str | None:
    """The canonical union of range texts ("1", "3–4" -> "1, 3–4"); None
    when every one is blank. RangeError on a malformed one."""
    return format_ranges(r for text in texts for r in parse_ranges(text)) or None


def expand(ranges: Iterable[tuple[int, int]]) -> set[int]:
    return {number for low, high in ranges for number in range(low, high + 1)}


def issue_number(text: str | None) -> int | None:
    """An issue number as a count, or None for '½', '1.MU' and the like.

    Those are listed with the series but never enter ranges or counts.
    """
    if text is None:
        return None
    text = text.strip()
    if not _whole(text):
        return None
    number = int(text)
    return number if 1 <= number <= MAX_ISSUE else None


# --- Editions ---------------------------------------------------------------


URL_MAX = 2000


def edition_slugs(editions: Sequence[dict]) -> list[str]:
    """`ed-<from>-<to>`, with `-2`, `-3`... on a repeated range.

    The same rule as `editionSlugs` in frontend/src/lib/coverWall.js: the
    link route and the public pages name an edition by it.
    """
    seen: dict[str, int] = {}
    slugs = []
    for edition in editions or []:
        base = f"ed-{edition.get('from')}-{edition.get('to')}"
        seen[base] = seen.get(base, 0) + 1
        slugs.append(base if seen[base] == 1 else f"{base}-{seen[base]}")
    return slugs


def _server_keys(entry: dict) -> dict:
    """The server-written link keys of an edition entry, cleaned; absent or
    malformed ones are left out."""
    out: dict = {}
    for key in ("cover_url", "large_url"):
        value = entry.get(key)
        if isinstance(value, str) and value and len(value) <= URL_MAX:
            out[key] = value
    description = entry.get("description")
    if isinstance(description, list) and all(isinstance(p, str) for p in description):
        out["description"] = list(description)
    return out


def validate_editions(
    raw: object, current: Sequence[dict] | None = None, *, stored_rows: bool = False
) -> list[dict]:
    """Editions as stored: [{kind, label, from, to}] plus an optional
    Comic Vine link (`cv_id`, with the server-written `cover_url`,
    `large_url` and `description`), or RangeError.

    `current` is the stored editions. With it, an edition is matched to its
    stored twin by slug, so an ordinary edit that sends no link keys keeps the
    link (when slug, kind and label all match), and a `cv_id`
    that changed or was cleared drops the server-written keys with it: they
    describe the old issue. The server-written keys are never taken from the
    request, only from the stored twin. `stored_rows=True` is for reading the
    stored column itself, whose keys are kept as they are.
    """
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise RangeError("editions must be a list")
    if len(raw) > MAX_EDITIONS:
        raise RangeError(f"at most {MAX_EDITIONS} editions")
    editions: list[dict] = []
    sent_entries: list[dict] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise RangeError("each edition needs a kind, a label and a range")
        kind = str(entry.get("kind") or "").strip()
        label = str(entry.get("label") or "").strip()
        if not kind or len(kind) > EDITION_KIND_MAX:
            raise RangeError(f"edition kind must be 1-{EDITION_KIND_MAX} characters")
        if not label or len(label) > EDITION_LABEL_MAX:
            raise RangeError(f"edition label must be 1-{EDITION_LABEL_MAX} characters")
        low, high = entry.get("from"), entry.get("to")
        if not all(isinstance(n, int) and not isinstance(n, bool) for n in (low, high)):
            raise RangeError(f"{label}: collects needs two issue numbers")
        if not (1 <= low <= MAX_ISSUE and 1 <= high <= MAX_ISSUE):
            raise RangeError(f"{label}: issue numbers run 1 to {MAX_ISSUE}")
        if low > high:
            raise RangeError(f"{label}: collects #{low}–{high} runs backwards")
        cv_id = entry.get("cv_id")
        if cv_id is not None and (
            not isinstance(cv_id, int) or isinstance(cv_id, bool) or cv_id < 1
        ):
            raise RangeError(
                f"{label}: the Comic Vine issue id must be a positive whole number"
            )
        edition = {"kind": kind, "label": label, "from": low, "to": high}
        if cv_id is not None:
            edition["cv_id"] = cv_id
        editions.append(edition)
        sent_entries.append(entry)
    stored = dict(zip(edition_slugs(current or []), current or [], strict=True))
    slugs = edition_slugs(editions)
    for slug, edition, sent in zip(slugs, editions, sent_entries, strict=True):
        if stored_rows:
            # Reading what the server stored: its keys are its own.
            if edition.get("cv_id") is not None:
                edition.update(_server_keys(sent))
            continue
        twin = stored.get(slug)
        # Only the link route writes the server keys: a request never does.
        if "cv_id" not in sent:
            # No link sent: an ordinary edit keeps the stored link, but only
            # on the same edition (slug, kind and label), never on a range
            # that merely reuses a slug after a swap or a delete.
            if (
                twin
                and twin.get("cv_id") is not None
                and twin.get("kind") == edition["kind"]
                and twin.get("label") == edition["label"]
            ):
                edition["cv_id"] = twin["cv_id"]
                edition.update(_server_keys(twin))
        elif edition.get("cv_id") is None:
            continue  # cleared: no link, no server keys
        elif twin and twin.get("cv_id") == edition["cv_id"]:
            edition.update(_server_keys(twin))
    return editions


def edition_issues(editions: Sequence[dict] | None) -> set[int]:
    return expand((e["from"], e["to"]) for e in editions or [])


def owned_set(issues_owned: str | None, editions: Sequence[dict] | None) -> set[int]:
    """Every issue I own, loose or in a collected edition."""
    return expand(parse_ranges(issues_owned)) | edition_issues(editions)


# --- Writes ------------------------------------------------------------------

# The comic columns on items. Every write path passes them through
# apply_comic_fields, so they are stored only in canonical form.
COMIC_FIELDS = (
    "issues_owned",
    "issues_skipped",
    "editions",
    "read_to",
    "shelf_format",
    "following",
)
RANGE_LABELS = {"issues_owned": "Issues owned", "issues_skipped": "Issues skipped"}


def apply_comic_fields(
    changes: dict, is_comic: bool, current: dict | None = None
) -> dict:
    """`changes` with its comic fields canonicalised; RangeError otherwise.

    `changes` holds only the keys the request set. Keys this function does not
    govern pass through untouched. A non-comic row may carry only empty comic
    fields, so a game's create form sending `following: false` is not refused.

    `current` is the stored row's issues_owned, issues_skipped and editions
    (absent on a create): whichever of them the request leaves out is read
    from it, and the result may not skip an issue it holds (the pull list's
    Skip rule, so the item form cannot get round it).
    """
    sent = {key: changes[key] for key in COMIC_FIELDS if key in changes}
    if not sent:
        return changes
    empty = (None, False, "", [])
    if not is_comic and any(value not in empty for value in sent.values()):
        raise RangeError("Issues, editions and reading are for comics only.")
    result = dict(changes)
    for key, label in RANGE_LABELS.items():
        if key in result:
            try:
                result[key] = canonical(result[key])
            except RangeError as error:
                raise RangeError(f"{label}: {error}") from error
    if "editions" in result:
        result["editions"] = (
            validate_editions(result["editions"], (current or {}).get("editions"))
            or None
        )
    read_to = result.get("read_to")
    if read_to is not None and not (
        isinstance(read_to, int) and 1 <= read_to <= MAX_ISSUE
    ):
        raise RangeError(f"Read to runs 1 to {MAX_ISSUE}")
    if any(key in result for key in HELD_FIELDS):
        stored = {key: (current or {}).get(key) for key in HELD_FIELDS}
        merged = stored | {key: result[key] for key in HELD_FIELDS if key in result}
        check_skips(**merged, before=stored if current else None)
    return result


HELD_FIELDS = ("issues_owned", "issues_skipped", "editions")


def _clash(
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
) -> set[int]:
    return expand(parse_ranges(issues_skipped)) & owned_set(issues_owned, editions)


def check_skips(
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    before: dict | None = None,
) -> None:
    """RangeError naming the first skipped issue that is held, loose or in an
    edition: a skip is for an issue I chose not to buy.

    Only a clash the write introduces is refused. `before` is the stored
    row's three fields: a row saved before this rule, skipping an issue it
    now holds, still takes every other write rather than locking until it is
    cleaned up."""
    clash = _clash(issues_owned, issues_skipped, editions)
    if before is not None:
        clash -= _clash(**before)
    if clash:
        raise RangeError(f"#{min(clash)} is owned, so it can't be skipped")


# --- Marks on the issue row --------------------------------------------------

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from models import Item


@dataclass(frozen=True)
class Marks:
    owned: bool = False
    read: bool = False
    skipped: bool = False


def mark_plan(
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    read_to: int | None,
) -> dict[int, Marks]:
    """The marks every held or skipped number should carry, from the ranges.

    Owned is held loose or in an edition; read is owned and at or below
    `read_to` (read implies owned); skipped is in `issues_skipped` and not
    held (a skip stored before the rule that refuses one on a held issue
    loses to the ownership, as every reader already treats it). A number in
    none of them is absent: its row, if any, carries no marks.
    """
    owned = owned_set(issues_owned, editions)
    skipped = expand(parse_ranges(issues_skipped)) - owned
    plan = {
        n: Marks(owned=True, read=read_to is not None and n <= read_to) for n in owned
    }
    plan.update({n: Marks(skipped=True) for n in skipped})
    return plan


@dataclass(frozen=True)
class MarksResult:
    """What one `sync_marks` did: rows now carrying a mark, stub rows it
    inserted, and existing rows whose marks it changed."""

    rows_marked: int = 0
    stubs_added: int = 0
    rows_changed: int = 0

    def __add__(self, other: MarksResult) -> MarksResult:
        return MarksResult(
            self.rows_marked + other.rows_marked,
            self.stubs_added + other.stubs_added,
            self.rows_changed + other.rows_changed,
        )


async def sync_marks(session: AsyncSession, item: Item) -> MarksResult:
    """Sets the marks on a comic's issue rows from its ranges, editions and
    read_to: the one writer of `comic_issues.owned/read/skipped`.

    Inserts a stub (null `cv_id`, which `comic_issues.sync_series` fills when
    the issue arrives) for a held or skipped number with no row, and clears the
    marks of a row no longer held. Idempotent. Flushes, never commits: every
    comic write path calls it in its own transaction. Raises RangeError on
    malformed stored ranges. A row that is not a comic is left alone.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import defer

    from models import ComicIssue, ItemType

    if item.type != ItemType.COMIC:
        return MarksResult()
    plan = mark_plan(
        item.issues_owned, item.issues_skipped, item.editions, item.read_to
    )
    await session.flush()  # the item has its id, and its ranges are written
    rows = {
        row.number: row
        for row in await session.scalars(
            select(ComicIssue)
            .where(ComicIssue.item_id == item.id)
            .options(defer(ComicIssue.description))
        )
    }
    changed = 0
    for number, row in rows.items():
        want = plan.get(number, Marks())
        if (row.owned, row.read, row.skipped) != (want.owned, want.read, want.skipped):
            row.owned, row.read, row.skipped = want.owned, want.read, want.skipped
            changed += 1
    stubs = [n for n in plan if n not in rows]
    session.add_all(
        ComicIssue(
            item_id=item.id,
            number=n,
            owned=plan[n].owned,
            read=plan[n].read,
            skipped=plan[n].skipped,
        )
        for n in stubs
    )
    await session.flush()
    return MarksResult(len(plan), len(stubs), changed)


def mark_mismatches(
    rows: Iterable[tuple[int, bool, bool, bool]],
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    read_to: int | None,
) -> list[int]:
    """The numbers where the stored marks `rows` ((number, owned, read,
    skipped) of every row of the series) disagree with what the ranges say,
    worked out from `series_from_row` as the readers do rather than from
    `mark_plan`, so the two derivations check each other."""
    series = series_from_row(
        0, "", None, issues_owned, issues_skipped, editions, read_to, None, True, False
    )
    expected = {
        n: (True, read_to is not None and n <= read_to, False) for n in series.owned
    }
    expected.update({n: (False, False, True) for n in series.skipped - series.owned})
    stored = {n: (o, r, s) for n, o, r, s in rows if o or r or s}
    return sorted(
        n for n in expected.keys() | stored.keys() if expected.get(n) != stored.get(n)
    )


# --- Runs and reading -------------------------------------------------------


@dataclass(frozen=True)
class RunSummary:
    owned: int
    released: int
    missing: int
    # complete (ended, nothing missing), up_to_date (ongoing, nothing
    # missing) or gaps.
    state: str
    ongoing: bool
    # (kind, length) in issue order: owned, missing, then upcoming for the
    # ongoing tail. Lengths sum to released plus the tail.
    segments: list[tuple[str, int]]


def tail_length(released: int) -> int:
    return max(TAIL_MIN, math.ceil(released * TAIL_SHARE))


def run_summary(
    owned: set[int], skipped: set[int], released: int | None, ongoing: bool
) -> RunSummary:
    """Owned against released. A skipped issue is still a gap here: Skip only
    takes it off the pull list. Released unknown (never fetched) falls back to
    the highest issue owned, and an issue owned before its store date (Got it
    on the pull list) stretches the run to include it."""
    total = max(released or 0, max(owned, default=0))
    segments: list[tuple[str, int]] = []
    for number in range(1, total + 1):
        kind = "owned" if number in owned else "missing"
        if segments and segments[-1][0] == kind:
            segments[-1] = (kind, segments[-1][1] + 1)
        else:
            segments.append((kind, 1))
    if ongoing:
        segments.append(("upcoming", tail_length(total)))
    missing = sum(length for kind, length in segments if kind == "missing")
    if missing:
        state = "gaps"
    else:
        state = "up_to_date" if ongoing else "complete"
    return RunSummary(
        owned=len(owned),
        released=total,
        missing=missing,
        state=state,
        ongoing=ongoing,
        segments=segments,
    )


@dataclass(frozen=True)
class ReadState:
    read: int
    unread: int
    # Read to, as the owner set it; None is not started.
    read_to: int | None


def read_state(read_to: int | None, owned: set[int]) -> ReadState:
    """Read is every owned issue at or below the marker."""
    read = sum(1 for n in owned if read_to is not None and n <= read_to)
    return ReadState(read=read, unread=len(owned) - read, read_to=read_to)


def read_next(read_to: int | None, owned: set[int]) -> int | None:
    """The first held issue past the marker (not started reads from #1), or
    None when every held issue is read. Skips play no part: a skipped issue
    is never held."""
    return min((n for n in owned if n > (read_to or 0)), default=None)


def snapshot_released(metadata: dict | None) -> int | None:
    """Released issues from a row's snapshot: the issue fetch's count, else
    the volume's issue count, else unknown."""
    metadata = metadata or {}
    released = metadata.get("released")
    if released is None:
        released = metadata.get("issue_count")
    return released if isinstance(released, int) else None


def row_run(
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    read_to: int | None,
    metadata: dict | None,
) -> dict:
    """The admin read's run summary for one stored row."""
    owned = owned_set(issues_owned, editions)
    run = run_summary(
        owned,
        expand(parse_ranges(issues_skipped)),
        snapshot_released(metadata),
        bool((metadata or {}).get("ongoing")),
    )
    reading = read_state(read_to, owned)
    return {
        "owned": run.owned,
        "released": run.released,
        "missing": run.missing,
        "state": run.state,
        "ongoing": run.ongoing,
        "segments": [{"kind": kind, "length": n} for kind, n in run.segments],
        "owned_text": format_ranges(owned),
        "read": reading.read,
        "unread": reading.unread,
        "read_next": read_next(read_to, owned),
    }


# --- Series, stats and sort -------------------------------------------------


@dataclass(frozen=True)
class Issue:
    number: str
    store_date: date | None = None
    cover_date: date | None = None
    name: str | None = None
    cover_url: str | None = None

    @property
    def count(self) -> int | None:
        return issue_number(self.number)


@dataclass(frozen=True)
class ComicSeries:
    """One comic row as the shelf and the pull list see it."""

    id: int | str
    title: str
    publisher: str | None = None
    owned: frozenset[int] = frozenset()
    skipped: frozenset[int] = frozenset()
    released: int | None = None
    ongoing: bool = False
    read_to: int | None = None
    # On the shelf (a physical copy), as opposed to a want or a follow.
    on_shelf: bool = True
    following: bool = False
    issues: tuple[Issue, ...] = field(default_factory=tuple)

    def run(self) -> RunSummary:
        return run_summary(
            set(self.owned), set(self.skipped), self.released, self.ongoing
        )


def next_issue(series: ComicSeries, today: date) -> Issue | None:
    """The earliest counted issue dated today or later."""
    dated = [
        issue
        for issue in series.issues
        if issue.count is not None
        and issue.store_date is not None
        and issue.store_date >= today
    ]
    return min(dated, key=lambda i: (i.store_date, i.count), default=None)


@dataclass(frozen=True)
class ShelfFigures:
    series: int
    issues_owned: int
    missing: int
    # Whole percent of owned issues read; None with nothing owned.
    read_percent: int | None


def shelf_figures(series: Iterable[ComicSeries]) -> ShelfFigures:
    """The hero numbers, over series on the shelf only (wants excluded)."""
    shelf = [s for s in series if s.on_shelf]
    owned = sum(len(s.owned) for s in shelf)
    read = sum(read_state(s.read_to, set(s.owned)).read for s in shelf)
    return ShelfFigures(
        series=len(shelf),
        issues_owned=owned,
        missing=sum(s.run().missing for s in shelf),
        read_percent=round(100 * read / owned) if owned else None,
    )


def sort_series(
    series: Iterable[ComicSeries], key: str, today: date
) -> list[ComicSeries]:
    """Next issue (dated first, by date, then the rest by title), title,
    publisher (unknown last) or missing issues (most first)."""
    if key not in SORT_KEYS:
        raise ValueError(f"unknown sort {key!r}")

    def title(s: ComicSeries) -> tuple[str, int]:
        return (s.title.casefold(), s.id)

    rows = list(series)
    if key == "title":
        return sorted(rows, key=title)
    if key == "publisher":
        return sorted(
            rows,
            key=lambda s: (
                s.publisher is None,
                (s.publisher or "").casefold(),
                title(s),
            ),
        )
    if key == "missing":
        return sorted(rows, key=lambda s: (-s.run().missing, title(s)))

    def by_next(s: ComicSeries):
        upcoming = next_issue(s, today)
        if upcoming is None:
            return (1, date.max, title(s))
        return (0, upcoming.store_date, title(s))

    return sorted(rows, key=by_next)


# --- The issue snapshot -----------------------------------------------------

# An issue store-dated this recently, or in the future, makes a run ongoing.
ONGOING_DAYS = 120

# What comic_snapshot adds to source_metadata. A volume refresh replaces the
# rest of the metadata and must carry these over, or the pull list empties.
ISSUE_SNAPSHOT_KEYS = ("issues", "released", "ongoing", "fetched_on")


def _iso(text: object) -> date | None:
    try:
        return date.fromisoformat(str(text)[:10]) if text else None
    except ValueError:
        return None


def snapshot_issues(metadata: dict | None) -> tuple[Issue, ...]:
    """The snapshot's issue entries as Issues; unreadable dates are None."""
    return tuple(
        Issue(
            number=str(entry.get("number") or ""),
            store_date=_iso(entry.get("store_date")),
            cover_date=_iso(entry.get("cover_date")),
            name=entry.get("name"),
            cover_url=entry.get("cover_url"),
        )
        for entry in (metadata or {}).get("issues") or []
        if isinstance(entry, dict)
    )


def comic_snapshot(issue_count: int | None, issues: list[dict], today: date) -> dict:
    """The keys an issue fetch adds to a row's source_metadata.

    Released is the volume's issue count less the fetched issues store-dated
    after today and the fetched non-integer ones already out (Comic Vine
    counts a #0 or an annual "½" among the volume's issues; ranges never
    do), and never below the highest whole issue already out. Ongoing is an
    issue store-dated within ONGOING_DAYS or later. Non-integer issues are
    kept in the list but count for neither.
    """
    parsed = snapshot_issues({"issues": issues})
    future = sum(1 for i in parsed if i.store_date is not None and i.store_date > today)
    out = [
        i.count
        for i in parsed
        if i.count is not None and i.store_date is not None and i.store_date <= today
    ]
    uncounted = sum(
        1
        for i in parsed
        if i.count is None
        and i.number
        and (i.store_date is None or i.store_date <= today)
    )
    released = max((issue_count or 0) - future - uncounted, max(out, default=0)) or None
    recent = today - timedelta(days=ONGOING_DAYS)
    ongoing = any(i.store_date is not None and i.store_date >= recent for i in parsed)
    return {
        "issues": issues,
        "released": released,
        "ongoing": ongoing,
        "fetched_on": today.isoformat(),
    }


def series_from_row(
    id: int | str,
    title: str,
    publisher: str | None,
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    read_to: int | None,
    metadata: dict | None,
    on_shelf: bool,
    following: bool,
) -> ComicSeries:
    """A stored row's columns as a ComicSeries."""
    return ComicSeries(
        id=id,
        title=title,
        publisher=publisher,
        owned=frozenset(owned_set(issues_owned, editions)),
        skipped=frozenset(expand(parse_ranges(issues_skipped))),
        released=snapshot_released(metadata),
        ongoing=bool((metadata or {}).get("ongoing")),
        read_to=read_to,
        on_shelf=on_shelf,
        following=following,
        issues=snapshot_issues(metadata),
    )


# --- Pull list --------------------------------------------------------------


def week_of(day: date) -> date:
    """The Wednesday that starts day's week."""
    return day - timedelta(days=(day.weekday() - WEEK_START) % 7)


@dataclass(frozen=True)
class PullRow:
    series_id: int
    title: str
    publisher: str | None
    issue: Issue
    owned_text: str
    released: int | None


@dataclass(frozen=True)
class PullWeek:
    start: date
    this_week: bool
    rows: list[PullRow]


@dataclass(frozen=True)
class PullList:
    weeks: list[PullWeek]
    # Followed series whose next issue has a cover month but no store date.
    undated: list[ComicSeries]


def pull_weeks(
    series: Iterable[ComicSeries],
    today: date,
    weeks: int = PULL_WEEKS,
    *,
    public: bool = False,
) -> PullList:
    """Issues dated in this week and the next weeks-1, from followed series,
    neither owned nor skipped. Non-integer issues are left out: Got it could
    not record them.

    Public lists owned and skipped issues too: it reports what is out, and
    leaving them out would let a gap in the strip tell a private Skip."""
    first = week_of(today)
    end = first + timedelta(weeks=weeks)
    buckets: dict[date, list[PullRow]] = {
        first + timedelta(weeks=n): [] for n in range(weeks)
    }
    undated: list[ComicSeries] = []
    for s in series:
        if not s.following:
            continue
        dated_ahead = False
        month_only = False
        for issue in s.issues:
            number = issue.count
            if number is None:
                continue
            if not public and (number in s.owned or number in s.skipped):
                continue
            if issue.store_date is None:
                if issue.cover_date is not None and issue.cover_date >= first:
                    month_only = True
                continue
            if issue.store_date >= today:
                dated_ahead = True
            if first <= issue.store_date < end:
                buckets[week_of(issue.store_date)].append(
                    PullRow(
                        series_id=s.id,
                        title=s.title,
                        publisher=s.publisher,
                        issue=issue,
                        owned_text=format_ranges(s.owned),
                        released=s.released,
                    )
                )
        if month_only and not dated_ahead:
            undated.append(s)
    return PullList(
        weeks=[
            PullWeek(
                start=start,
                this_week=start == first,
                rows=sorted(
                    rows,
                    key=lambda r: (
                        r.issue.store_date,
                        r.title.casefold(),
                        r.issue.count,
                    ),
                ),
            )
            for start, rows in buckets.items()
        ],
        undated=sorted(undated, key=lambda s: s.title.casefold()),
    )
