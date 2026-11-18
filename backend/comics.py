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


def held_ranges(holds: Iterable[VolumeHold] | None) -> list[dict]:
    """The `{from, to, label, slug}` entries of every OWNED volume's linked
    ranges: what `items.editions` used to give the readers."""
    return [
        {"from": low, "to": high, "label": hold.label, "slug": hold.slug}
        for hold in holds or []
        if hold.owned
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


SMALLINT_MAX = 32767


def _bound(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 <= value <= SMALLINT_MAX else None


def _edition_base(slug: str) -> str:
    """`ed-1-3` for `ed-1-3` and `ed-1-3-2`."""
    parts = slug.split("-")
    return "-".join(parts[:3])


def _match_volumes(wanted, slugs, existing, text) -> dict:
    """Which existing edition-origin volume stands for which edition (index
    to volume), so owned and read follow the book, not its slug: a range
    change renames the slug and a removed duplicate shifts the `-2` ones.

    In order: the same range with the same label, then the same slug, then the
    same Comic Vine issue, then (when the leftovers pair up one to one) by
    position. An edition left without a volume is new; a volume left without
    an edition is deleted."""
    claimed: dict[int, object] = {}
    free = dict(existing)  # slug -> volume

    def take(index: int, volume) -> None:
        claimed[index] = volume
        free.pop(volume.slug, None)

    def label_of(edition) -> str | None:
        return text(edition.get("label"))

    def cv_of(edition) -> int | None:
        cv_id = edition.get("cv_id")
        return cv_id if isinstance(cv_id, int) and not isinstance(cv_id, bool) else None

    for i, edition in enumerate(wanted):
        same = [
            v
            for v in free.values()
            if _edition_base(v.slug) == _edition_base(slugs[i])
            and v.label == (label_of(edition) or None)
        ]
        if same:
            take(i, same[0])
    for i, slug in enumerate(slugs):
        if i not in claimed and slug in free:
            take(i, free[slug])
    for i, edition in enumerate(wanted):
        cv_id = cv_of(edition)
        if i in claimed or cv_id is None:
            continue
        match = next((v for v in free.values() if v.cv_id == cv_id), None)
        if match is not None:
            take(i, match)
    left = [i for i in range(len(wanted)) if i not in claimed]
    if left and len(left) == len(free):
        for i, volume in zip(left, sorted(free.values(), key=lambda v: v.position)):
            take(i, volume)
    return claimed


async def sync_volumes_from_editions(session: AsyncSession, item: Item) -> None:
    """Compat shim (design call 6): keeps the row's EDITION-ORIGIN volumes
    (slug `ed-*`) in step with `items.editions`, which stays written as a
    mirror until the destructive drop.

    Matches each edition to its volume (`_match_volumes`: same range and label,
    then slug, then Comic Vine issue, then by position when the leftovers pair
    up, so a range change keeps `owned` and `read`) and upserts: label, kind
    (`volume_kind_from_edition`, the raw text in `kind_raw`), covers,
    description, cv_id, position, and the one `migrated` collects entry (the
    title, `#from-to`, linked to this row). A new volume
    starts owned and unread; an existing one keeps its `owned` and `read`, so
    a volume marked on the volume route stays marked. Volumes whose edition is
    gone are deleted. A volume with any other slug (`vol-*`, made by hand or
    intake) is never touched, and neither is a volume with `edited` true (#334:
    the admin changed it by hand): no field written, no reposition, no delete
    when its edition vanishes, and its edition (still in `items.editions`) does
    not make a second volume under the same slug. Idempotent, writes only what
    differs, flushes, never commits. A row that is not a comic has none.
    """
    import uuid

    from sqlalchemy import select

    from models import ComicVolume, ComicVolumeCollect, ItemType

    await session.flush()  # the item has its id
    wanted = item.editions if item.type == ItemType.COMIC else None
    wanted = (
        [e for e in wanted if isinstance(e, dict)] if isinstance(wanted, list) else []
    )
    every = list(
        await session.scalars(
            select(ComicVolume).where(
                ComicVolume.item_id == item.id, ComicVolume.slug.startswith("ed-")
            )
        )
    )
    # An edited volume is the admin's: it is matched to nothing, and its slug
    # is reserved so no edition makes a second volume under it.
    fixed = {v.slug: v for v in every if v.edited}
    existing = {v.slug: v for v in every if not v.edited}
    collects: dict[object, list[ComicVolumeCollect]] = {}
    if existing:
        for collect in await session.scalars(
            select(ComicVolumeCollect)
            .where(ComicVolumeCollect.volume_id.in_([v.id for v in existing.values()]))
            .order_by(ComicVolumeCollect.position)
        ):
            collects.setdefault(collect.volume_id, []).append(collect)

    def text(value: object) -> str | None:
        return (value.strip() or None) if isinstance(value, str) else None

    slugs = edition_slugs(wanted)
    assigned = _match_volumes(wanted, slugs, existing, text)
    skip = {i for i, slug in enumerate(slugs) if i not in assigned and slug in fixed}
    for i in [
        i for i, v in assigned.items() if slugs[i] in fixed and v.slug != slugs[i]
    ]:
        skip.add(i)  # its slug is an edited volume's: leave this one as it is
    protected = {assigned.pop(i).id for i in list(assigned) if i in skip}
    # Two volumes may swap slugs: park every rename first, so the unique
    # (item, slug) index is never hit mid-flush.
    renamed = [
        (volume, slugs[i]) for i, volume in assigned.items() if volume.slug != slugs[i]
    ]
    for volume, _ in renamed:
        volume.slug = f"tmp-{volume.id}"
    if renamed:
        await session.flush()
    for volume, slug in renamed:
        volume.slug = slug
    for position, (slug, edition) in enumerate(zip(slugs, wanted, strict=True)):
        if position in skip:
            continue
        raw = edition.get("kind")
        raw = raw if isinstance(raw, str) and raw else None
        low, high = _bound(edition.get("from")), _bound(edition.get("to"))
        if low is None or high is None:
            low = high = None
            issue_text = text(edition.get("label")) or item.title
        elif low == high:
            issue_text = f"#{low}"
        else:
            issue_text = f"#{low}-{high}"
        description = edition.get("description")
        if isinstance(description, list):
            description = "\n\n".join(p for p in description if isinstance(p, str))
        cv_id = edition.get("cv_id")
        fields = {
            "position": position,
            "label": text(edition.get("label")) or item.title,
            "kind": volume_kind_from_edition(raw),
            "kind_raw": raw,
            "description": (description if isinstance(description, str) else None)
            or None,
            "cover_url": text(edition.get("cover_url")),
            "large_url": text(edition.get("large_url")),
            "cv_id": cv_id
            if isinstance(cv_id, int) and not isinstance(cv_id, bool)
            else None,
        }
        volume = assigned.get(position)
        if volume is None:
            volume = ComicVolume(
                id=uuid.uuid4(),
                item_id=item.id,
                slug=slug,
                owned=True,
                read=False,
                **fields,
            )
            session.add(volume)
            await session.flush()
        else:
            for key, value in fields.items():
                if getattr(volume, key) != value:
                    setattr(volume, key, value)
        link = {
            "series_name": item.title,
            "issue_text": issue_text,
            "item_id": item.id,
            "from_number": low,
            "to_number": high,
        }
        rows = collects.get(volume.id, [])
        mine = next((c for c in rows if c.source == "migrated"), None)
        if mine is None and not rows:
            session.add(
                ComicVolumeCollect(
                    id=uuid.uuid4(),
                    volume_id=volume.id,
                    position=0,
                    source="migrated",
                    **link,
                )
            )
        elif mine is not None:
            for key, value in link.items():
                if getattr(mine, key) != value:
                    setattr(mine, key, value)
    kept = {v.id for v in assigned.values()} | protected
    for volume in existing.values():
        if volume.id in kept:
            continue
        for collect in collects.get(volume.id, []):
            session.expunge(collect)  # the volume's delete cascades in the database
        await session.delete(volume)
    await session.flush()


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

    Volumes are the source of what a book holds (#326): first the compat shim
    brings the row's edition-origin volumes in step with `items.editions`
    (`sync_volumes_from_editions`; every writer of editions ends here, so none
    needs its own call), then the owned volumes' linked collects ranges count
    as held, and a volume marked read marks its issues read.

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
    await sync_volumes_from_editions(session, item)
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
