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
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TYPE_CHECKING

from comic_contents import normalize_name

MAX_ISSUE = 9999
MAX_BOOKS = 50
BOOK_KIND_MAX = 20
BOOK_LABEL_MAX = 80

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


# --- Collected books ----------------------------------------------------------


def volume_kind_from_edition(text: str | None) -> str:
    """The `comic_volumes.kind` an edition's free-text kind maps to.

    Trade, Hardcover and Omnibus (any case, surrounding space ignored) keep
    their meaning; anything else, `Compendium TPB` included, is `trade`. The
    original text is kept in `kind_raw`, so nothing is lost by the mapping.
    Migration 0021 inlines the same rule on purpose; this is the one the app
    uses.
    """
    kind = (text or "").strip().lower()
    return kind if kind in ("trade", "hardcover", "omnibus") else "trade"


def title_kind(volume_count: int, issue_count: int) -> str:
    """What a title is, derived from its contents (never stored):
    `run` (issues only, or nothing yet), `book_line` (two or more volumes, no
    issues), `single_book` (one volume, no issues) or `both` (volumes and
    issues). A stored kind would go stale the moment a row is added or
    deleted."""
    if volume_count <= 0:
        return "run"
    if issue_count > 0:
        return "both"
    return "book_line" if volume_count >= 2 else "single_book"


def loose_issue_count(issues_owned: str | None) -> int:
    """How many single issues a title holds loose (`items.issues_owned`);
    0 for text that does not parse."""
    try:
        return len(expand(parse_ranges(issues_owned)))
    except ValueError:
        return 0


def owned_line_numbers(line_numbers: Iterable[int | None]) -> list[int]:
    """The line numbers of a title's OWNED books, ascending and deduped;
    books with no number are left out. The shelf words them "Vol. 1, 2 and 4"
    and never print a line size, which is not stored."""
    return sorted({n for n in line_numbers if n is not None})


def title_shape(holds: Iterable[VolumeHold], issues_owned: str | None) -> dict:
    """What the admin shelf's card says about a title, from the row's own
    OWNED volumes and its loose issues: the same words as the public shelf
    (`kind`, `volumes_owned`, `volume_numbers`)."""
    own = [hold for hold in holds if hold.own and hold.owned]
    return {
        "kind": title_kind(len(own), loose_issue_count(issues_owned)),
        "volumes_owned": len(own),
        "volume_numbers": owned_line_numbers(hold.line_number for hold in own),
    }


# --- The title-sharing rule (#330) ------------------------------------------

# A collected book joins an existing series' title (shares its page) only when
# its title says the same name AND most of its contents come from that series.
# At least this share of the book's collected issues (by count) must belong to
# the series. 5 of 8 (62.5%) shares; 4 of 8 (50%) does not; 3 of 5 (60%) does.
SHARE_MIN_FRACTION = 0.6

# Words that only say which book or format it is, dropped from a book's title
# before it is compared with the series' name. Anywhere in the title.
FORMAT_WORDS = frozenset(
    {
        "vol", "vols", "volume", "volumes", "book", "books", "deluxe",
        "edition", "omnibus", "compendium", "hardcover", "tpb", "trade",
        "paperback", "hc",
    }
)  # fmt: skip
# Number words, numerals and roman numerals (one..twelve) are dropped only
# when they trail ("Saga Book Two", "Batman Vol. 3"), so "Year One" keeps its
# "Year": "batman year" is not "batman".
_NUMBER_WORDS = frozenset(
    "one two three four five six seven eight nine ten eleven twelve "
    "i ii iii iv v vi vii viii ix x xi xii".split()
)
_ISSUE_NUMBERS = re.compile(r"(\d+)(?:\s*[-\u2013\u2014]\s*(\d+))?")


def _title_words(text: object) -> list[str]:
    """`normalize_name` (case, `&`, a bracketed year, a leading "The"), then
    punctuation gone: an apostrophe joins its word ("Hell's" is "hells"), any
    other mark is a space."""
    plain = re.sub(r"['\u2019]", "", normalize_name(text))
    return re.sub(r"[\W_]+", " ", plain).split()


def title_core(text: object) -> str:
    """A book's title with its volume and format words removed (see
    `FORMAT_WORDS`) and trailing numbers and number words removed."""
    return title_stages(text)[-1]


def title_stages(text: object) -> list[str]:
    """The title with format words removed, then with each trailing number
    word or numeral removed in turn, so a series that itself ends in a number
    ("Batman 66") is still found."""
    words = [w for w in _title_words(text) if w not in FORMAT_WORDS]
    stages = [" ".join(words)]
    while words and (words[-1].isdigit() or words[-1] in _NUMBER_WORDS):
        words = words[:-1]
        stages.append(" ".join(words))
    return stages


def collect_issue_count(issue_text: object) -> int:
    """How many issues a collects entry names: each range counts its length
    (`#1-6` is 6), each lone number 1; an entry with no number counts as 1."""
    text = issue_text if isinstance(issue_text, str) else ""
    total = 0
    for low, high in _ISSUE_NUMBERS.findall(text):
        first = int(low)
        total += abs(int(high) - first) + 1 if high else 1
    return max(total, 1)


def shares_title(
    book_title: object,
    series_title: object,
    collects: Iterable[tuple[str, str]] | None = None,
) -> bool:
    """Does a collected book share the page of a series already on the shelf?

    True only when BOTH hold:

    (a) the book's title, with volume and format words removed (`FORMAT_WORDS`
        anywhere; number words, numerals and roman numerals when they trail),
        equals the series' title under `comic_contents.normalize_name` (case,
        `&`, a bracketed year, a leading "The"), punctuation ignored. "Saga
        Book Two", "Saga Compendium" and "Batman Vol. 3" share; "Batman: Year
        One" and "Saga: The Complete Collection" do not (their extra words are
        not on the list, so they are their own title). A title that is ONLY
        volume and format words ("Vol. 1", "HC", "Compendium One") has no name
        to contradict the match, so (a) holds vacuously and (b) decides.
    (b) when the contents are known, at least `SHARE_MIN_FRACTION` (60%) of the
        book's collected issues belong to that series. `collects` is the
        entries as `(series_name, issue_text)`; an entry counts for its range
        length (`collect_issue_count`, no number counts as 1) and belongs to
        the series when its name normalises the same. Empty or None contents
        (nothing known) leave (a) to decide alone.

    Otherwise the book is its own title. Pure; used by the intake commit and
    Check's preview so they cannot disagree (`intake/volume_plan.py`)."""
    series = " ".join(_title_words(series_title))
    if not series:
        return False
    stages = title_stages(book_title)
    # A title of only volume and format words ("Vol. 1", "HC") names nothing
    # that could contradict the match, so (a) holds and (b) decides.
    if stages[-1] and series not in stages:
        return False
    entries = [(name, text) for name, text in (collects or ())]
    if not entries:
        return True
    total = sum(collect_issue_count(text) for _, text in entries)
    mine = sum(
        collect_issue_count(text)
        for name, text in entries
        if " ".join(_title_words(name)) == series
    )
    return mine / total + 1e-9 >= SHARE_MIN_FRACTION


def edition_issues(editions: Sequence[dict] | None) -> set[int]:
    return expand((e["from"], e["to"]) for e in editions or [])


def owned_set(issues_owned: str | None, editions: Sequence[dict] | None) -> set[int]:
    """Every issue I own, loose or in a collected edition."""
    return expand(parse_ranges(issues_owned)) | edition_issues(editions)


@dataclass(frozen=True)
class VolumeHold:
    """One volume as the marks see it for ONE comic row (#326).

    `own` is whether the volume belongs to this row's title; `ranges` are only
    the collects linked to THIS row with both bounds set, so a text-only or
    other-series entry contributes nothing here. `held_ranges` turns the owned
    holds into the same `{from, to, label}` dicts the pure functions below
    always took for editions, which is why their signatures did not change.
    """

    volume_id: object
    slug: str
    label: str
    owned: bool
    read: bool
    own: bool
    ranges: tuple[tuple[int, int], ...] = ()
    # The book's number in its title's line (1..9999), if it has one.
    line_number: int | None = None
    # What the public editions list shows (`own_editions`): the mapped kind,
    # the free text it came from, and the book's own cover.
    kind: str = "trade"
    kind_raw: str | None = None
    cover_url: str | None = None


def held_ranges(holds: Iterable[VolumeHold] | None) -> list[dict]:
    """The `{from, to, label, slug}` entries of every OWNED volume's linked
    ranges the pure range functions take."""
    return [
        {"from": low, "to": high, "label": hold.label, "slug": hold.slug}
        for hold in holds or []
        if hold.owned
        for low, high in hold.ranges
    ]


def own_editions(holds: Iterable[VolumeHold] | None) -> list[dict]:
    """What the public `editions` fields list: one `{slug, kind, label, from,
    to, cover_url}` per linked range of every OWNED volume of this very title
    (a cross-title book is not an edition of it), in the holds' order (the
    volume position). `kind` is the free text the book came from (`kind_raw`,
    what `items.editions` held), else the mapped kind. A volume with no linked
    range here has no range to show and gives none."""
    return [
        {
            "slug": hold.slug,
            "kind": hold.kind_raw or hold.kind,
            "label": hold.label,
            "from": low,
            "to": high,
            "cover_url": hold.cover_url,
        }
        for hold in holds or []
        if hold.owned and hold.own
        for low, high in hold.ranges
    ]


def volume_reads(holds: Iterable[VolumeHold] | None) -> set[int]:
    """Issues covered by an owned volume marked read."""
    return expand(
        pair for hold in holds or [] if hold.owned and hold.read for pair in hold.ranges
    )


def holds_covering(holds: Iterable[VolumeHold] | None, number: int) -> list[dict]:
    """`{slug, label}` of every owned volume whose linked ranges cover the
    number, in the holds' order."""
    return [
        {"slug": hold.slug, "label": hold.label}
        for hold in holds or []
        if hold.owned and any(low <= number <= high for low, high in hold.ranges)
    ]


def volume_counts(
    holds: Iterable[VolumeHold] | None,
    read_numbers: Iterable[int],
    read_to: int | None = None,
) -> tuple[int, int]:
    """(owned, read) volumes of this row's own title, for `shown_status`.

    A volume is read when its flag says so, or when it links issues of this
    row and every one of them is read: by the marks (`read_numbers`) or at or
    below `read_to`. So a title whose issues were read through `read_to`
    before volumes carried a flag keeps its status."""
    read_set = set(read_numbers)
    owned = read = 0
    for hold in holds or []:
        if not (hold.owned and hold.own):
            continue
        owned += 1
        linked = expand(hold.ranges)
        covered = bool(linked) and all(
            n in read_set or (read_to is not None and n <= read_to) for n in linked
        )
        if hold.read or covered:
            read += 1
    return owned, read


async def issues_read_many(
    session: AsyncSession, item_ids: Iterable[object]
) -> dict[object, int]:
    """How many issues of each title carry a read mark, in one grouped query
    (every asked id is a key, 0 when none). The one definition of "issues
    read", the public stats' too: a mark is one (title, number), so an issue
    read as a single and through a volume counts once."""
    from sqlalchemy import func, select

    from models import ComicIssue

    ids = list(item_ids)
    counts = dict.fromkeys(ids, 0)
    if not ids:
        return counts
    rows = await session.execute(
        select(ComicIssue.item_id, func.count())
        .where(ComicIssue.item_id.in_(ids), ComicIssue.read.is_(True))
        .group_by(ComicIssue.item_id)
    )
    counts.update({item_id: n for item_id, n in rows})
    return counts


async def load_holds_many(
    session: AsyncSession, item_ids: Iterable[object]
) -> dict[object, list[VolumeHold]]:
    """`load_holds` for several rows in one query, keyed by item id (every
    asked id is a key, empty when it has no volumes)."""
    from sqlalchemy import or_, select

    from models import ComicVolume, ComicVolumeCollect

    ids = list(item_ids)
    out: dict[object, list[VolumeHold]] = {i: [] for i in ids}
    if not ids:
        return out
    rows = await session.execute(
        select(ComicVolume, ComicVolumeCollect)
        .outerjoin(ComicVolumeCollect, ComicVolumeCollect.volume_id == ComicVolume.id)
        .where(
            or_(
                ComicVolume.item_id.in_(ids),
                ComicVolumeCollect.item_id.in_(ids),
            )
        )
        .order_by(ComicVolume.position, ComicVolume.slug, ComicVolumeCollect.position)
    )
    wanted = set(ids)
    volumes: dict[object, ComicVolume] = {}
    ranges: dict[tuple[object, object], list[tuple[int, int]]] = {}
    for volume, collect in rows:
        volumes[volume.id] = volume
        if (
            collect is not None
            and collect.item_id in wanted
            and collect.from_number is not None
            and collect.to_number is not None
        ):
            ranges.setdefault((volume.id, collect.item_id), []).append(
                (collect.from_number, collect.to_number)
            )
    for volume in volumes.values():
        for item_id in wanted:
            mine = ranges.get((volume.id, item_id), [])
            if volume.item_id != item_id and not mine:
                continue
            out[item_id].append(
                VolumeHold(
                    volume_id=volume.id,
                    slug=volume.slug,
                    label=volume.label,
                    owned=volume.owned,
                    read=volume.read,
                    own=volume.item_id == item_id,
                    ranges=tuple(merge(mine)),
                    line_number=volume.line_number,
                    kind=volume.kind,
                    kind_raw=volume.kind_raw,
                    cover_url=volume.cover_url,
                )
            )
    return out


async def load_holds(session: AsyncSession, item_id: object) -> list[VolumeHold]:
    """Every volume that can hold issues of this row: its own, and any other
    title's volume with a collects entry linked to it. One query."""
    return (await load_holds_many(session, [item_id]))[item_id]


async def held_through(
    session: AsyncSession, item_id: object, number: int
) -> list[dict]:
    """`{slug, label}` of the owned volumes that cover issue `number` of this
    row (pure data; the issue page's "Also in" reads it, #332)."""
    return holds_covering(await load_holds(session, item_id), number)


# --- Writes ------------------------------------------------------------------

# The comic columns on items. Every write path passes them through
# apply_comic_fields, so they are stored only in canonical form.
COMIC_FIELDS = (
    "issues_owned",
    "issues_skipped",
    "read_to",
    "shelf_format",
    "following",
)
RANGE_LABELS = {"issues_owned": "Issues owned", "issues_skipped": "Issues skipped"}


def apply_comic_fields(
    changes: dict,
    is_comic: bool,
    current: dict | None = None,
    held: Sequence[dict] | None = None,
) -> dict:
    """`changes` with its comic fields canonicalised; RangeError otherwise.

    `changes` holds only the keys the request set. Keys this function does not
    govern pass through untouched. A non-comic row may carry only empty comic
    fields, so a game's create form sending `following: false` is not refused.

    `current` is the stored row's issues_owned and issues_skipped (absent on a
    create): whichever of them the request leaves out is read from it, and the
    result may not skip an issue it holds (the pull list's Skip rule, so the
    item form cannot get round it). `held` is the owned volumes' linked ranges
    (`held_ranges`), which count as held too.
    """
    sent = {key: changes[key] for key in COMIC_FIELDS if key in changes}
    if not sent:
        return changes
    empty = (None, False, "", [])
    if not is_comic and any(value not in empty for value in sent.values()):
        raise RangeError("Issues and reading are for comics only.")
    result = dict(changes)
    for key, label in RANGE_LABELS.items():
        if key in result:
            try:
                result[key] = canonical(result[key])
            except RangeError as error:
                raise RangeError(f"{label}: {error}") from error
    read_to = result.get("read_to")
    if read_to is not None and not (
        isinstance(read_to, int) and 1 <= read_to <= MAX_ISSUE
    ):
        raise RangeError(f"Read to runs 1 to {MAX_ISSUE}")
    if any(key in result for key in HELD_FIELDS):
        stored = {key: (current or {}).get(key) for key in HELD_FIELDS}
        merged = stored | {key: result[key] for key in HELD_FIELDS if key in result}
        check_skips(**merged, held=held, before=stored if current else None)
    return result


HELD_FIELDS = ("issues_owned", "issues_skipped")


def _clash(
    issues_owned: str | None,
    issues_skipped: str | None,
    held: Sequence[dict] | None,
) -> set[int]:
    return expand(parse_ranges(issues_skipped)) & owned_set(issues_owned, held)


def check_skips(
    issues_owned: str | None,
    issues_skipped: str | None,
    held: Sequence[dict] | None = None,
    before: dict | None = None,
) -> None:
    """RangeError naming the first skipped issue that is held, loose or in an
    owned volume (`held` is its `held_ranges`): a skip is for an issue I chose
    not to buy.

    Only a clash the write introduces is refused. `before` is the stored
    row's two fields: a row saved before this rule, skipping an issue it
    now holds, still takes every other write rather than locking until it is
    cleaned up."""
    clash = _clash(issues_owned, issues_skipped, held)
    if before is not None:
        clash -= _clash(**before, held=held)
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
    volume_read: Iterable[int] = (),
) -> dict[int, Marks]:
    """The marks every held or skipped number should carry, from the ranges.

    `editions` is the owned volumes' linked ranges (`held_ranges`; the same
    `{from, to}` shape the editions had). Owned is held loose or in an owned
    volume; read is owned and at or below `read_to` or covered by a read
    volume (`volume_read`) (read implies owned); skipped is in `issues_skipped` and not
    held (a skip stored before the rule that refuses one on a held issue
    loses to the ownership, as every reader already treats it). A number in
    none of them is absent: its row, if any, carries no marks.
    """
    owned = owned_set(issues_owned, editions)
    skipped = expand(parse_ranges(issues_skipped)) - owned
    volume_read = set(volume_read)
    plan = {
        n: Marks(
            owned=True, read=(read_to is not None and n <= read_to) or n in volume_read
        )
        for n in owned
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
    stubs_removed: int = 0

    def __add__(self, other: MarksResult) -> MarksResult:
        return MarksResult(
            self.rows_marked + other.rows_marked,
            self.stubs_added + other.stubs_added,
            self.rows_changed + other.rows_changed,
            self.stubs_removed + other.stubs_removed,
        )


# Rows per stub INSERT in sync_marks (5 binds each, far under asyncpg's 32767).
INSERT_CHUNK = 1000


async def sync_marks(
    session: AsyncSession,
    item: Item,
    *,
    from_read_to: bool = False,
    reads: set[int] | None = None,
) -> MarksResult:
    """Sets the marks on a comic's issue rows from its ranges, its owned
    volumes and read_to: the one writer of `comic_issues.owned/read/skipped`.

    Volumes are the source of what a book holds (#326): the owned volumes'
    linked collects ranges count as held, and a volume marked read marks its
    issues read.

    From 5c the marks are the record of what is read, one book at a time, so
    a write that does not say otherwise keeps every `read` mark of a row that
    stays owned (a newly held number reads as `read_to` says). Say otherwise
    with `from_read_to=True` (a write that set `read_to`: every owned issue up
    to it is read, those above are not) or `reads` (exactly these numbers are
    read, when owned: the mark route).

    Inserts a stub (null `cv_id`, which `comic_issues.sync_series` fills when
    the issue arrives) for a held or skipped number with no row, and clears the
    marks of a row no longer held, and deletes a stub that has no mark left
    (a row with a `cv_id` is never deleted). Idempotent. Flushes, never
    commits: every comic write path calls it in its own transaction. Raises
    RangeError on malformed stored ranges. A row that is not a comic has its
    marks cleared and its stubs removed.
    """
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy.orm import defer

    from models import ComicIssue, ItemType

    # A row that is not (or is no longer) a comic holds no marks: an empty
    # plan clears its rows and removes its stubs.
    await session.flush()  # the item has its id, and its ranges are written
    volume_read: set[int] = set()
    if item.type == ItemType.COMIC:
        holds = await load_holds(session, item.id)
        volume_read = volume_reads(holds)
        plan = mark_plan(
            item.issues_owned,
            item.issues_skipped,
            held_ranges(holds),
            item.read_to,
            volume_read,
        )
    else:
        plan = {}
    # Stubs go in with ON CONFLICT DO NOTHING: `sync_series` may have written
    # the same number since (a Comic Vine row wins), and the rows are read
    # back below, after the insert, so that row gets its marks too.
    if reads is not None:
        plan = {
            n: Marks(m.owned, m.owned and n in reads, m.skipped)
            for n, m in plan.items()
        }
    added = 0
    if plan:
        # In chunks: one multi-row INSERT of a big range (a hand-typed
        # #1-9999) would pass asyncpg's 32767 bind-parameter limit.
        entries = list(plan.items())
        for start in range(0, len(entries), INSERT_CHUNK):
            inserted = await session.execute(
                insert(ComicIssue)
                .values(
                    [
                        {
                            "item_id": item.id,
                            "number": n,
                            "owned": m.owned,
                            "read": m.read,
                            "skipped": m.skipped,
                        }
                        for n, m in entries[start : start + INSERT_CHUNK]
                    ]
                )
                .on_conflict_do_nothing(index_elements=["item_id", "number"])
                .returning(ComicIssue.number)
            )
            added += len(inserted.all())
    rows = await session.scalars(
        select(ComicIssue)
        .where(ComicIssue.item_id == item.id)
        .options(defer(ComicIssue.description))
        .execution_options(populate_existing=True)
    )
    changed = removed = 0
    for row in rows:
        want = plan.get(row.number)
        if want is None and row.cv_id is None:
            # Our own stub with nothing left to mark: never a Comic Vine row.
            await session.delete(row)
            removed += 1
            continue
        want = want or Marks()
        if reads is not None:
            want = Marks(want.owned, want.owned and row.number in reads, want.skipped)
        elif not from_read_to and want.owned and row.owned:
            want = Marks(True, row.read or row.number in volume_read, False)
        if (row.owned, row.read, row.skipped) != (want.owned, want.read, want.skipped):
            row.owned, row.read, row.skipped = want.owned, want.read, want.skipped
            changed += 1
    await session.flush()
    return MarksResult(len(plan), added, changed, removed)


def mark_mismatches(
    rows: Iterable[tuple[int, bool, bool, bool]],
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    read_to: int | None,
) -> list[int]:
    """The numbers where the stored marks `rows` ((number, owned, read,
    skipped) of every row of the series) disagree with what the ranges say
    (`editions` is the owned volumes' `held_ranges`),
    worked out from `series_from_row` as the readers do rather than from
    `mark_plan`, so the two derivations check each other."""
    series = series_from_row(
        0, "", None, issues_owned, issues_skipped, editions, read_to, None, True, False
    )
    # Read is per book from 5c, so only ownership and skips are compared,
    # and a read mark on a book that is not owned (a stray) is a mismatch.
    expected = {n: (True, False, False) for n in series.owned}
    expected.update({n: (False, True, False) for n in series.skipped - series.owned})
    stored = {n: (o, s, r and not o) for n, o, r, s in rows if o or r or s}
    return sorted(
        n for n in expected.keys() | stored.keys() if expected.get(n) != stored.get(n)
    )


# --- One book's mark (5c) ----------------------------------------------------

MARK_STATES = ("missing", "owned", "read")


class MarkRefused(Exception):
    """A tap the data can't take (the route answers 409)."""


@dataclass(frozen=True)
class MarkChange:
    issues_owned: str | None
    issues_skipped: str | None
    reads: frozenset[int]
    read_to: int | None


def read_to_of(owned: Iterable[int], reads: Iterable[int]) -> int | None:
    """The highest owned number with every owned issue up to it read, the
    meaning `read_to` always had for Read next and the run lanes; None when
    the first owned issue is unread."""
    read = set(reads)
    marker = None
    for n in sorted(owned):
        if n not in read:
            break
        marker = n
    return marker


def plan_mark(
    issues_owned: str | None,
    issues_skipped: str | None,
    editions: Sequence[dict] | None,
    reads: Iterable[int],
    number: int,
    state: str,
) -> MarkChange:
    """What one tap changes: the range text, the read set and the `read_to`
    kept in step from them. Owned adds the single (and clears a skip); read
    is owned plus read; missing removes the single and its read mark. A
    number held only in an owned volume (`editions` is its `held_ranges`) can't
    go missing from a cover; the refusal names the volume. A number held by a
    single and by a volume is one issue."""
    if state not in MARK_STATES:
        raise MarkRefused(f"State is one of {', '.join(MARK_STATES)}")
    singles = expand(parse_ranges(issues_owned))
    skipped = expand(parse_ranges(issues_skipped))
    in_edition = number in edition_issues(editions)
    read_set = set(reads)
    if state == "missing":
        if in_edition and number not in singles:
            holder = next(e for e in editions or [] if e["from"] <= number <= e["to"])
            where = holder.get("label") or holder.get("slug") or "a volume"
            raise MarkRefused(f"In {where}. Edit the volume to change it.")
        singles.discard(number)
        # Still held through an edition: it stays read if it was.
        if not in_edition:
            read_set.discard(number)
    else:
        if not in_edition:
            singles.add(number)
        skipped.discard(number)
        if state == "read":
            read_set.add(number)
        else:
            read_set.discard(number)
    held = singles | edition_issues(editions)
    read_set &= held
    return MarkChange(
        issues_owned=format_ranges(singles) or None,
        issues_skipped=format_ranges(skipped) or None,
        reads=frozenset(read_set),
        read_to=read_to_of(held, read_set),
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


def shown_status(
    stored: str,
    *,
    owned: int,
    read: int,
    released: int | None,
    ongoing: bool,
    missing: int,
    volumes_owned: int = 0,
    volumes_read: int = 0,
) -> tuple[str, bool]:
    """The status a comic page shows, derived from the issue marks (#277).

    Returns (status, caught_up). The stored status is the owner's override: any
    value but `backlog` is shown as it is. A backlog series with every owned
    issue read is `finished` when its run is complete (ended, nothing missing,
    issue count known) and otherwise stays `backlog` with caught_up true (the
    page says "Caught up"). No owned issues, or any unread one, is plain
    backlog. Pure: callers pass counts, and skips and stubs never enter
    (a skip is not owned; a stub is a held number and counts as owned).

    Owned volumes (#326, design call 5): a title whose only holdings are owned,
    unread volumes is unread (never caught up); it is caught up only when
    every owned volume is read as well as every owned issue. A title with no
    volumes (the defaults) behaves as before; one whose volumes are all read
    and that holds no issue is caught up like a run with every issue read.
    """
    if stored != "backlog" or volumes_read < volumes_owned:
        return stored, False
    if owned <= 0 and volumes_owned <= 0:
        return stored, False
    if read < owned:
        return stored, False
    if ongoing or missing > 0 or released is None:
        return "backlog", True
    return "finished", False


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
