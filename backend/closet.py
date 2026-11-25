"""Today's outfit without a model: the weather read, the filter, the ranking.

Pure: no FastAPI or database (tests/test_physical_imports.py holds it to
that). The routes (`closet_today_routes.py`) load garments, wears and the
profile into the dataclasses below; this module decides what fits the day
and in what order, and `closet_rank.py` asks the model to choose among what
is left. When the model cannot answer, `template()` here is the plan.

- **Slots.** Top, bottom and shoes every day; an outer and a mid layer as
  the morning asks for them (`layer_slots`). A locked or transient garment
  adds its own slot when the day would not have one (a hat, a coat on a
  warm morning).
- **Season windows** are month sets on the garment (`seasons`); an empty
  set is all year. A month outside the window costs `WEIGHTS["season"]` in
  `score`; only shorts and linen under `LINEN_MIN_LOW_F` are cut.
- **Warmth.** The morning low (6 to 9 am) and the afternoon high (noon to
  6 pm) from the cached forecast, or the month's Denver normals when there
  is none. Layers are chosen for the morning, the top for the afternoon,
  the bottom for the day's middle: Denver's swing is the reason to layer.
  Riding makes the morning `BIKE_CHILL` degrees colder.
- **Formality** per occasion is a range with a target (`OCCASION_FORMALITY`);
  an untagged formality passes the range, but untagged pieces (warmth or
  formality missing) are the last relaxation step (below).
- **Minimum pool.** A slot with fewer than `MIN_POOL` eligible pieces relaxes
  one rule at a time, in `RELAX_STEPS` order, and stops at three: lift the
  formality band a step each side, lift the shorts and linen cut, allow
  untagged pieces. A step that added a piece is recorded in
  `Candidates.relaxed`; a slot still under three is in `Candidates.short`.
  The bike rule, the repeat rule and the fixed piece are never relaxed.
  `slot_pool` holds this for `candidates` and `slot_fallback` alike.
- **Distinct tops.** `template` gives each outfit a top of its own while the
  pool has one; a pool under `OUTFITS` shares (`top_pool`).
- **Bike** rules out dress shoes, long coats and wide or cuffed bottoms
  (`BIKE_EXCLUDES`, matched on name and subtype).
- **Repeat rules.** A top worn within `repeat_top_days` days is out (worn
  Monday with N = 5 comes back on Sunday); an outfit whose top, bottom and
  shoes were worn together within `repeat_outfit_weeks` weeks is skipped.
- **Ranking** without a model: warmth distance, formality distance, rest
  since last worn and wears this month (`WEIGHTS`), capped at
  `CANDIDATES_PER_SLOT` per slot, ties broken by name then id.
- **The cull** (Review, at the end): five data flags, each with the
  sentence the deck shows (`flags_for`): not worn though in season and
  owned for `UNWORN_MIN_WEEKS` weeks of the last year (a garment bought
  mid-season is not "never worn"); rarely worn beside its category's
  peers; out of season for the next three months, only while a season
  turn is open; a condition word in the owner's note; and a duplicate
  cluster (more than `DUPLICATE_MAX` alike), keeping the most-worn. Then
  the suggested outcome (`suggest`), the deck's order (`deck`), the turn
  in force (`current_turn`), its Pack all (`turn_members`) and the packed
  garments due back (`due_back`).

Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR C, task 12;
PR D, task 18).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

import weather

SLOT_ORDER = ("outer", "mid", "top", "bottom", "shoes", "accessory")
CORE_SLOTS = ("top", "bottom", "shoes")
CANDIDATES_PER_SLOT = 12
OUTFITS = 3  # the lead and two alternatives

OCCASIONS = ("office", "wfh", "date", "weekend", "travel", "event")
# (lowest, highest, target) on the 1 (lounge) to 5 (business) scale.
OCCASION_FORMALITY = {
    "office": (3, 5, 3),
    "wfh": (1, 3, 2),
    "date": (2, 4, 3),
    "weekend": (1, 3, 2),
    "travel": (1, 3, 2),
    "event": (3, 5, 4),
}

# The tuning points of the ranking without a model.
# "season" equals one warmth step: a month the piece is not tagged for
# costs as much as a garment one step too warm or too cold, so a piece
# that suits the day in every other way still ranks above a worse fit.
WEIGHTS = {"warmth": 2.0, "formality": 1.0, "rest": 0.5, "wears": 0.3, "season": 2.0}
LINEN_MIN_LOW_F = 50  # below this low, shorts and linen are out of the pool
MIN_POOL = 3  # a slot with fewer eligible pieces relaxes a rule, one at a time
# In the order tried; the plan body and the Today page use these names.
RELAX_STEPS = ("formality", "season", "untagged")
REST_CAP_DAYS = 28  # rest stops counting after four weeks
NEVER_WORN_REST = 4.0  # a garment never worn ranks as four weeks rested
SNOW_BOOT_BONUS = 3.0  # beats one warmth step

BIKE_CHILL = 5  # degrees: the morning ride's wind
SWING_LAYER = 20  # a swing this large wants a layer to take off
LAYER_RULES = (  # (morning below, layers)
    (35, ("outer", "mid")),
    (50, ("outer",)),
    (62, ("mid",)),
)
BIKE_EXCLUDES = {
    "shoes": ("oxford", "derby", "brogue", "loafer", "monk", "heel", "pump", "dress"),
    "bottom": ("wide", "flare", "cuff", "palazzo"),
    "outer": ("overcoat", "trench", "topcoat", "long coat"),
}
BIKE_MAX_SHOE_FORMALITY = 3

MORNING_HOURS = range(6, 10)
AFTERNOON_HOURS = range(12, 19)
STRIP_HOURS = (7, 9, 11, 13, 15, 18)  # the strip's six figures, 7a to 6p

# Denver's monthly normal low and high (°F), for a day with no forecast.
NORMALS = {
    1: (18, 45),
    2: (20, 46),
    3: (27, 54),
    4: (34, 61),
    5: (44, 71),
    6: (53, 82),
    7: (59, 89),
    8: (57, 87),
    9: (48, 79),
    10: (36, 65),
    11: (25, 52),
    12: (18, 44),
}


# --- the day ---------------------------------------------------------------


@dataclass(frozen=True)
class WeatherRead:
    """What the day asks of the clothes."""

    low: int  # the morning low
    high: int  # the afternoon high
    wet: bool
    snow: bool
    forecast: bool  # False: the month's normals stood in
    hours: tuple[tuple[str, int], ...] = ()  # (label, °F) for the strip

    @property
    def swing(self) -> int:
        return max(0, self.high - self.low)


def _local_hour(hour: weather.Hour) -> int:
    return hour.starts_at.astimezone(weather.DENVER_TZ).hour


def read_weather(hours: Iterable[weather.Hour], day: date) -> WeatherRead:
    """The morning low and afternoon high of Denver day `day`, from the
    cached hours, or the month's normals when the day has none."""
    today = [
        h for h in hours if h.starts_at.astimezone(weather.DENVER_TZ).date() == day
    ]
    if not today:
        low, high = NORMALS[day.month]
        return WeatherRead(low, high, wet=False, snow=False, forecast=False)
    morning = [h.temp_f for h in today if _local_hour(h) in MORNING_HOURS]
    afternoon = [h.temp_f for h in today if _local_hour(h) in AFTERNOON_HOURS]
    low = min(morning or [h.temp_f for h in today])
    high = max(afternoon or [h.temp_f for h in today])
    waking = [h for h in today if 7 <= _local_hour(h) <= 18]
    by_hour = {_local_hour(h): h.temp_f for h in today}
    return WeatherRead(
        low=low,
        high=max(high, low),
        wet=any(weather.is_wet(h) for h in waking),
        snow=any("snow" in (h.short or "").lower() for h in waking),
        forecast=True,
        hours=tuple(
            (weather.clock(at), by_hour[at]) for at in STRIP_HOURS if at in by_hour
        ),
    )


def _feel(temp: int) -> str:
    for below, word in ((32, "freezing"), (45, "cold"), (60, "cool"), (75, "mild")):
        if temp < below:
            return word
    return "warm" if temp < 85 else "hot"


def read_sentence(read: WeatherRead, bike: bool, month: str = "") -> str:
    """The strip's one sentence: "Cold ride in, mild ride home — layer for
    a 23° swing." """
    if not read.forecast:
        when = f"a typical {month} day" if month else "a typical day"
        return f"No forecast yet; dressed for {when}."
    start, end = ("ride in", "ride home") if bike else ("morning", "afternoon")
    low, high = _feel(read.low), _feel(read.high)
    text = f"{low.capitalize()} {start}, {high} {end}"
    if read.swing >= 15:
        text += f" — layer for a {read.swing}° swing"
    if read.snow:
        text += "; snow in the forecast"
    elif read.wet:
        text += "; rain likely"
    return text + "."


def warmth_for(temp_f: float) -> int:
    """The garment warmth (1 linen tee to 5 down parka) a temperature asks."""
    for at_least, warmth in ((80, 1), (68, 2), (55, 3), (40, 4)):
        if temp_f >= at_least:
            return warmth
    return 5


def layer_slots(read: WeatherRead, bike: bool) -> tuple[str, ...]:
    morning = read.low - (BIKE_CHILL if bike else 0)
    for below, layers in LAYER_RULES:
        if morning < below:
            return layers
    return ("mid",) if read.swing >= SWING_LAYER else ()


def targets(read: WeatherRead, bike: bool) -> dict[str, int]:
    """The warmth each slot should be."""
    morning = read.low - (BIKE_CHILL if bike else 0)
    layers = layer_slots(read, bike)
    return {
        "outer": warmth_for(morning),
        # Under a coat the mid works less hard.
        "mid": warmth_for(morning + (10 if "outer" in layers else 0)),
        "top": warmth_for(read.high),
        "bottom": warmth_for((read.low + read.high) / 2),
        "shoes": warmth_for(morning),
        "accessory": warmth_for(morning),
    }


# --- the garments ----------------------------------------------------------


@dataclass(frozen=True)
class Piece:
    """An active garment as the planner sees it. `transient` is a garment
    from a photo (Match this), not owned and never stored."""

    id: str
    name: str
    category: str
    subtype: str | None = None
    primary_color: str | None = None
    color_name: str | None = None
    primary_hex: str | None = None
    secondary_hex: str | None = None
    pattern: str | None = None
    material: str | None = None
    warmth: int | None = None
    formality: int | None = None
    seasons: tuple[int, ...] = ()
    last_worn: date | None = None
    wears_30: int = 0
    transient: bool = False


@dataclass(frozen=True)
class Request:
    """One plan's question."""

    day: date
    occasion: str
    bike: bool = False
    repeat_top_days: int = 5
    repeat_outfit_weeks: int = 3
    lock: str | None = None  # a garment id among the pieces
    extra: Piece | None = None  # the transient garment


@dataclass(frozen=True)
class Scored:
    piece: Piece
    score: float


@dataclass
class Candidates:
    """The filter's output: ranked candidates per slot, the slots the day
    needs, the fixed piece if any, and the footnote's counts."""

    slots: tuple[str, ...]
    by_slot: dict[str, list[Scored]]
    fixed: Piece | None = None
    active: int = 0
    fit: int = 0
    skipped_recent: int = 0
    targets: dict[str, int] = field(default_factory=dict)
    # slot -> the steps relaxed to fill it; absent means nothing relaxed.
    relaxed: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # slot -> its final pool size, for a slot still under MIN_POOL after
    # every step (a fixed slot is not listed).
    short: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Outfit:
    """An outfit: one piece per slot, in slot order."""

    pieces: tuple[tuple[str, Piece], ...]
    reason: str | None
    ranked_by: str  # "model" | "template"

    @property
    def key(self) -> frozenset[str]:
        return outfit_key(self.pieces)


def outfit_key(pieces: Iterable[tuple[str, Piece | str]]) -> frozenset[str]:
    """What makes two outfits the same: their top, bottom and shoes."""
    return frozenset(
        piece if isinstance(piece, str) else piece.id
        for slot, piece in pieces
        if slot in CORE_SLOTS
    )


def in_season(piece: Piece, month: int) -> bool:
    return not piece.seasons or month in piece.seasons


def fits_occasion(piece: Piece, occasion: str, widen: int = 0) -> bool:
    """Formality inside the occasion's band, `widen` steps further each
    side (clamped to the 1 to 5 scale)."""
    if piece.formality is None:
        return True
    low, high, _ = OCCASION_FORMALITY.get(occasion, (1, 5, 3))
    return max(low - widen, 1) <= piece.formality <= min(high + widen, 5)


def is_tagged(piece: Piece) -> bool:
    """Warmth and formality both set. Empty seasons is not missing: it
    means all year."""
    return piece.warmth is not None and piece.formality is not None


def clearly_out_of_season(piece: Piece, read: WeatherRead) -> bool:
    """Shorts and linen when the day's low is under `LINEN_MIN_LOW_F`.
    The one season rule left as a cut; the rest is `score`. Whole words:
    "short sleeve" and "shortstop" are not shorts."""
    if read.low >= LINEN_MIN_LOW_F:
        return False
    text = f"{_words(piece)} {(piece.material or '').lower()}"
    return bool({"shorts", "linen"} & set(re.findall(r"[a-z0-9]+", text)))


def eligible(
    piece: Piece,
    request: Request,
    read: WeatherRead,
    lifted: frozenset[str] = frozenset(),
) -> bool:
    """The rules every candidate passes, in `candidates` and `slot_fallback`
    alike (the repeat rule is applied by `slot_pool`). `lifted` holds the
    `RELAX_STEPS` already given up for a short slot: "season" lifts the
    shorts and linen cut, "formality" widens the band one step each side,
    "untagged" admits pieces missing warmth or formality. The bike rule is
    never lifted. A tagged season is a score, not a rule: see `score`."""
    return (
        ("season" in lifted or not clearly_out_of_season(piece, read))
        and fits_occasion(piece, request.occasion, 1 if "formality" in lifted else 0)
        and ("untagged" in lifted or is_tagged(piece))
        and (not request.bike or bike_ok(piece))
    )


def slot_pool(
    pieces: Sequence[Piece],
    slot: str,
    request: Request,
    read: WeatherRead,
    skip: str | None = None,
) -> tuple[list[Piece], tuple[str, ...]]:
    """One slot's eligible pieces and the steps relaxed to reach `MIN_POOL`,
    in order. Both `candidates` and `slot_fallback` come through here, so
    the Swap sheet cannot drift from the plan. A step is recorded only when
    it added a piece to the pool; a pool still under `MIN_POOL` is the
    caller's to report (`Candidates.short`). The repeat rule and `skip` (the fixed
    piece) are never relaxed."""
    lifted: frozenset[str] = frozenset()
    steps: list[str] = []

    def pool() -> list[Piece]:
        return [
            p
            for p in pieces
            if p.category == slot
            and p.id != skip
            and eligible(p, request, read, lifted)
            and not worn_recently(p, request.day, request.repeat_top_days)
        ]

    found = pool()
    for step in RELAX_STEPS:
        if len(found) >= MIN_POOL:
            break
        lifted |= {step}
        wider = pool()
        if len(wider) > len(found):
            steps.append(step)
        found = wider
    return found, tuple(steps)


def _words(piece: Piece) -> str:
    return f"{piece.name} {piece.subtype or ''}".lower()


def bike_ok(piece: Piece) -> bool:
    if piece.category == "shoes" and (piece.formality or 0) > BIKE_MAX_SHOE_FORMALITY:
        return False
    words = _words(piece)
    return not any(word in words for word in BIKE_EXCLUDES.get(piece.category, ()))


def worn_recently(piece: Piece, day: date, top_days: int) -> bool:
    """A top worn within `top_days` days before `day`. Today's own wear is
    not recent: it is the outfit already on, not a repeat of one."""
    if piece.category != "top" or piece.last_worn is None:
        return False
    return 0 < (day - piece.last_worn).days <= top_days


def score(piece: Piece, target: int, occasion: str, day: date, snow: bool) -> float:
    warmth_off = 1 if piece.warmth is None else abs(piece.warmth - target)
    formality_target = OCCASION_FORMALITY.get(occasion, (1, 5, 3))[2]
    formality_off = (
        1 if piece.formality is None else abs(piece.formality - formality_target)
    )
    if piece.last_worn is None:
        rest = NEVER_WORN_REST
    else:
        rest = min(max((day - piece.last_worn).days, 0), REST_CAP_DAYS) / 7
    total = (
        -WEIGHTS["warmth"] * warmth_off
        - WEIGHTS["formality"] * formality_off
        + WEIGHTS["rest"] * rest
        - WEIGHTS["wears"] * piece.wears_30
    )
    if not in_season(piece, day.month):
        total -= WEIGHTS["season"]
    if snow and piece.category == "shoes" and "boot" in _words(piece):
        total += SNOW_BOOT_BONUS
    return round(total, 3)


def candidates(
    pieces: Sequence[Piece], request: Request, read: WeatherRead
) -> Candidates:
    """Every active piece through the filter, ranked per slot.

    The fixed piece (the lock, else the transient garment) passes every
    rule: it is the owner's choice. It fills its slot and is not listed."""
    fixed = request.extra
    if request.lock is not None:
        fixed = next((p for p in pieces if p.id == request.lock), fixed)
    slots = list(layer_slots(read, request.bike)) + list(CORE_SLOTS)
    if fixed is not None and fixed.category not in slots:
        slots.append(fixed.category)
    slots = [slot for slot in SLOT_ORDER if slot in slots]
    goal = targets(read, request.bike)
    # The footnote counts what passes the rules before any slot relaxes
    # ("untagged" lifted, as it has always counted them); it is not the
    # pool sizes the planner ends up with.
    counted = frozenset({"untagged"})
    fit = skipped = 0
    for piece in pieces:
        if fixed is not None and piece.id == fixed.id:
            continue
        if not eligible(piece, request, read, counted):
            continue
        if worn_recently(piece, request.day, request.repeat_top_days):
            skipped += 1
            continue
        fit += 1
    by_slot: dict[str, list[Scored]] = {}
    relaxed: dict[str, tuple[str, ...]] = {}
    short: dict[str, int] = {}
    for slot in slots:
        kept, steps = slot_pool(
            pieces, slot, request, read, fixed.id if fixed else None
        )
        if fixed is not None and fixed.category == slot:
            steps = ()  # the owner's piece fills the slot: nothing to relax for
        elif len(kept) < MIN_POOL:
            short[slot] = len(kept)
        if steps:
            relaxed[slot] = steps
        found = [
            Scored(
                p,
                score(p, goal[slot], request.occasion, request.day, read.snow),
            )
            for p in kept
        ]
        # Every tagged piece outranks every untagged one: an untagged filler
        # scores as one step off with no season penalty, which would beat a
        # poor tagged fit. Untagged pieces only fill the count.
        found.sort(
            key=lambda s: (
                not is_tagged(s.piece),
                -s.score,
                s.piece.name.lower(),
                s.piece.id,
            )
        )
        by_slot[slot] = found[:CANDIDATES_PER_SLOT]
    return Candidates(
        slots=tuple(slots),
        by_slot=by_slot,
        fixed=fixed,
        active=sum(1 for p in pieces if not p.transient),
        fit=fit,
        skipped_recent=skipped,
        targets={slot: goal[slot] for slot in slots},
        relaxed=relaxed,
        short=short,
    )


def slot_fallback(
    pieces: Sequence[Piece], slot: str, request: Request, read: WeatherRead
) -> list[Scored]:
    """Swap a piece for a slot the day does not need (a layer on a warm
    day): the pieces that pass the same rules as `candidates`, the repeat
    rule and the relaxation included, least worn first and capped the same way."""
    kept, _ = slot_pool(pieces, slot, request, read)
    return sorted(
        (Scored(p, 0.0) for p in kept),
        key=lambda s: (s.piece.wears_30, s.piece.name),
    )[:CANDIDATES_PER_SLOT]


def recent_keys(
    outfits: Iterable[tuple[date, Iterable[tuple[str, str]]]],
    request: Request,
) -> set[frozenset[str]]:
    """The keys of outfits worn within `repeat_outfit_weeks` weeks before
    the day, from `(worn_on, [(slot, garment id)])`."""
    since = request.day - timedelta(weeks=request.repeat_outfit_weeks)
    return {
        outfit_key(slots)
        for worn_on, slots in outfits
        if since <= worn_on < request.day
    }


def fixed_reason(fixed: Piece | None) -> str | None:
    """How the reason opens when a piece was fixed by the owner."""
    if fixed is None:
        return None
    if fixed.transient:
        return f"Built around the {fixed.name} from your photo."
    return f"You locked the {fixed.name}."


def assemble(
    chosen: dict[str, Piece], found: Candidates, reason: str | None, ranked_by: str
) -> Outfit:
    """An outfit from a slot -> piece choice, the fixed piece in its slot."""
    if found.fixed is not None:
        chosen = {**chosen, found.fixed.category: found.fixed}
    return Outfit(
        pieces=tuple((slot, chosen[slot]) for slot in found.slots if slot in chosen),
        reason=reason,
        ranked_by=ranked_by,
    )


def template(
    found: Candidates,
    recent: set[frozenset[str]] = frozenset(),
    count: int = OUTFITS,
) -> list[Outfit]:
    """The deterministic outfits: the k-th candidate in every slot, for k =
    0, 1, 2…, skipping repeats of a recent outfit and of each other. When
    every combination is a repeat, the lead is the best one anyway: a plan
    always has a lead while there is anything to wear."""
    depth = max((len(c) for c in found.by_slot.values()), default=0)
    reason = fixed_reason(found.fixed)

    def nth(k: int) -> Outfit:
        chosen = {
            slot: found.by_slot[slot][min(k, len(found.by_slot[slot]) - 1)].piece
            for slot in found.slots
            if found.by_slot.get(slot)
        }
        return assemble(chosen, found, reason, "template")

    outfits: list[Outfit] = []
    seen: set[frozenset[str]] = set()
    used_tops: set[str] = set()
    # Tops first: the first pass gives each outfit a top of its own (outfit k
    # takes the k-th top while one is left); the second fills any gap, so a
    # short pool shares its tops and a plan still has `count` outfits.
    for distinct in (True, False):
        for k in range(depth):
            outfit = nth(k)
            top = dict(outfit.pieces).get("top")
            if not outfit.pieces or outfit.key in seen or outfit.key in recent:
                continue
            if distinct and top is not None and top.id in used_tops:
                continue
            seen.add(outfit.key)
            outfits.append(outfit)
            if top is not None:
                used_tops.add(top.id)
            if len(outfits) == count:
                break
        if len(outfits) == count:
            break
    if not outfits and depth:
        outfits.append(nth(0))
    if not outfits and found.fixed is not None:
        outfits.append(assemble({}, found, reason, "template"))
    return outfits


def top_pool(found: Candidates) -> int:
    """How many tops the plan chose from; zero when a top is fixed (the
    owner's piece is every outfit's top) or none fit."""
    if found.fixed is not None and found.fixed.category == "top":
        return 0
    return len(found.by_slot.get("top", ()))


def qualifier(piece: Piece, slot: str, day: date, bike: bool) -> str:
    """A tile's one short qualifier."""
    if piece.transient:
        return "not owned"
    if bike and slot in ("shoes", "bottom"):
        return "bike-safe"
    if slot in ("outer", "mid") and piece.warmth is not None:
        return f"warmth {piece.warmth}"
    if piece.last_worn is None:
        return "not worn yet"
    days = (day - piece.last_worn).days
    if days == 0:
        return "worn today"
    if days == 1:
        return "worn yesterday"
    return f"worn {piece.last_worn.day} {piece.last_worn:%b}"


# --- the cull (Review) -----------------------------------------------------
#
# Deterministic flags first, each with the sentence the deck shows, so the
# decision stays the owner's; the model's opinion (closet_opinion.py) is a
# second pass over what is flagged here and never a flag of its own.

YEAR_DAYS = 365
UNWORN_MIN_WEEKS = 8  # in season and owned this long before "never worn"
RARE_MAX_WEARS = 2
RARE_PEER_MIN = 6.0  # peers must average at least this many wears...
RARE_PEER_RATIO = 3.0  # ...and at least this many times this piece's
PACK_AHEAD_MONTHS = 3  # out of season for the next three months
DUPLICATE_MAX = 3  # more than this many alike is a cluster
CONDITION_WORDS = (
    "pilled",
    "pilling",
    "stain",
    "stretched",
    "torn",
    "tear",
    "hole",
    "frayed",
    "faded",
    "ripped",
    "shrunk",
    "worn out",
    "worn-out",
    "missing button",
    "broken zip",
)
MAX_NOTE_QUOTE = 80

# The flags in the order the deck lists them and ranks by.
FLAG_ORDER = ("unworn", "condition", "rare", "duplicate", "out_of_season")
CATEGORY_PLURAL = {
    "top": "tops",
    "mid": "mid layers",
    "outer": "outer layers",
    "bottom": "bottoms",
    "shoes": "pairs of shoes",
    "accessory": "accessories",
}
MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


@dataclass(frozen=True)
class Held:
    """A garment as the review sees it: what it is, since when it is owned
    (`acquired_on`, else the upload), and its wears in the last year."""

    id: str
    name: str
    category: str | None
    status: str  # GarmentStatus value
    primary_color: str | None = None
    formality: int | None = None
    seasons: tuple[int, ...] = ()
    notes: str | None = None
    owned_since: date | None = None
    wears_12mo: int = 0
    last_worn: date | None = None
    back_on: date | None = None


@dataclass(frozen=True)
class Flag:
    kind: str  # one of FLAG_ORDER
    sentence: str


@dataclass(frozen=True)
class Flagged:
    """One deck card: the flags, the suggested outcome and the month a
    Pack away would prefill (the first of it)."""

    held: Held
    flags: tuple[Flag, ...]
    suggested: str  # "keep" | "pack" | "sell" | "donate"
    back_on: date


@dataclass(frozen=True)
class Turn:
    """The season turn in force: the latest turn date on or before today."""

    name: str  # "spring" | "autumn"
    on: date


def _months_after(day: date, count: int) -> list[int]:
    return [(day.month - 1 + step) % 12 + 1 for step in range(count)]


def _first_of(month: int, after: date) -> date:
    """The first of `month` strictly after `after`'s month."""
    year = after.year if month > after.month else after.year + 1
    return date(year, month, 1)


def season_window(seasons: Iterable[int]) -> str:
    """Months as runs: "October to March", "all year" when empty."""
    months = sorted(set(seasons))
    if not months or len(months) == 12:
        return "all year"
    # Start the run after a gap, so a window across the new year reads whole.
    start = next(m for m in months if (m - 2) % 12 + 1 not in months)
    run = [(start - 1 + step) % 12 + 1 for step in range(12)]
    run = [m for m in run if m in months]
    if len(run) == 1:
        return MONTH_NAMES[run[0] - 1]
    return f"{MONTH_NAMES[run[0] - 1]} to {MONTH_NAMES[run[-1] - 1]}"


def weeks_in_season(held: Held, day: date) -> int:
    """Whole weeks of the last year in which the garment was both owned and
    in its season window: a piece bought in August has had no winter."""
    start = day - timedelta(days=YEAR_DAYS - 1)
    if held.owned_since and held.owned_since > start:
        start = held.owned_since
    days = 0
    current = start
    while current <= day:
        if not held.seasons or current.month in held.seasons:
            days += 1
        current += timedelta(days=1)
    return days // 7


def out_of_season(held: Held, day: date) -> bool:
    """Its window is closed for this month and the next two."""
    if not held.seasons:
        return False
    return not any(m in held.seasons for m in _months_after(day, PACK_AHEAD_MONTHS))


def bring_back(held: Held, day: date) -> date:
    """The first of the next month its window opens; three months on for a
    garment worn all year (Pack away still asks)."""
    if held.seasons:
        for month in _months_after(day, 13)[1:]:
            if month in held.seasons:
                return _first_of(month, day)
    month = (day.month - 1 + PACK_AHEAD_MONTHS) % 12 + 1
    return _first_of(month, day)


def _condition(notes: str | None) -> str | None:
    text = " ".join((notes or "").split())
    lower = text.lower()
    if not any(word in lower for word in CONDITION_WORDS):
        return None
    quote = text if len(text) <= MAX_NOTE_QUOTE else text[: MAX_NOTE_QUOTE - 1] + "…"
    return f"Your note says “{quote}”."


def _times(count: int) -> str:
    return {1: "once", 2: "twice"}.get(count, f"{count} times")


def duplicate_clusters(pieces: Sequence[Held]) -> list[list[Held]]:
    """Active garments sharing category, colour and formality, more than
    `DUPLICATE_MAX` of them, each most-worn first (the one to keep)."""
    groups: dict[tuple[str, str, int], list[Held]] = {}
    for held in pieces:
        if held.status != "active" or not held.category:
            continue
        if not held.primary_color or held.formality is None:
            continue
        key = (held.category, held.primary_color.strip().lower(), held.formality)
        groups.setdefault(key, []).append(held)

    def most_worn(held: Held) -> tuple:
        return (-held.wears_12mo, -(held.last_worn or date.min).toordinal(), held.id)

    return [
        sorted(group, key=most_worn)
        for group in groups.values()
        if len(group) > DUPLICATE_MAX
    ]


def flags_for(
    pieces: Sequence[Held], day: date, turn_open: bool = False
) -> dict[str, list[Flag]]:
    """Every active garment's flags by id, in `FLAG_ORDER`. Out of season
    counts only while a season turn is open: twice a year, not every day."""
    active = [h for h in pieces if h.status == "active" and h.category]
    weeks = {h.id: weeks_in_season(h, day) for h in active}
    seasoned = [h for h in active if weeks[h.id] >= UNWORN_MIN_WEEKS]
    found: dict[str, dict[str, Flag]] = {h.id: {} for h in active}

    for held in seasoned:
        if held.wears_12mo == 0:
            found[held.id]["unworn"] = Flag(
                "unworn",
                f"Not worn in the last twelve months, though it was in season "
                f"for {weeks[held.id]} weeks of them.",
            )
            continue
        if held.wears_12mo > RARE_MAX_WEARS:
            continue
        peers = [p for p in seasoned if p.category == held.category and p is not held]
        if not peers:
            continue
        average = sum(p.wears_12mo for p in peers) / len(peers)
        if average >= RARE_PEER_MIN and average >= RARE_PEER_RATIO * held.wears_12mo:
            plural = CATEGORY_PLURAL.get(held.category or "", "pieces")
            found[held.id]["rare"] = Flag(
                "rare",
                f"Worn {_times(held.wears_12mo)} in twelve months; your other "
                f"{plural} averaged {round(average)}.",
            )

    for held in active:
        sentence = _condition(held.notes)
        if sentence:
            found[held.id]["condition"] = Flag("condition", sentence)
        if turn_open and out_of_season(held, day):
            back = bring_back(held, day)
            found[held.id]["out_of_season"] = Flag(
                "out_of_season",
                f"Out of season until {MONTH_NAMES[back.month - 1]}: it is "
                f"worn {season_window(held.seasons)}.",
            )

    for cluster in duplicate_clusters(active):
        keep = cluster[0]
        plural = CATEGORY_PLURAL.get(keep.category or "", "pieces")
        colour = (keep.primary_color or "").strip().lower()
        for held in cluster[1:]:
            found[held.id]["duplicate"] = Flag(
                "duplicate",
                f"One of {len(cluster)} {colour} {plural} at formality "
                f"{keep.formality}; you wear the {keep.name} most.",
            )

    return {
        key: [flags[kind] for kind in FLAG_ORDER if kind in flags]
        for key, flags in found.items()
        if flags
    }


def suggest(flags: Sequence[Flag]) -> str:
    """The outcome the deck highlights. A stained or never-worn piece goes;
    an out-of-season piece alone is packed."""
    kinds = {flag.kind for flag in flags}
    if "condition" in kinds:
        return "donate"
    if "unworn" in kinds:
        return "sell"
    if kinds & {"rare", "duplicate"}:
        return "donate"
    if "out_of_season" in kinds:
        return "pack"
    return "keep"


def deck(
    pieces: Sequence[Held],
    day: date,
    turn_open: bool = False,
    kept_since: Iterable[str] = (),
) -> list[Flagged]:
    """The review deck: flagged active garments, most flags first, then by
    the strongest flag, then name. A garment kept since the current turn is
    left out until the next one."""
    skip = set(kept_since)
    flagged = flags_for(pieces, day, turn_open)
    cards = [
        Flagged(
            held=held,
            flags=tuple(flagged[held.id]),
            suggested=suggest(flagged[held.id]),
            back_on=bring_back(held, day),
        )
        for held in pieces
        if held.id in flagged and held.id not in skip
    ]
    cards.sort(
        key=lambda card: (
            -len(card.flags),
            FLAG_ORDER.index(card.flags[0].kind),
            card.held.name.lower(),
            card.held.id,
        )
    )
    return cards


def _turn_date(text: str, year: int) -> date:
    month, day = (int(part) for part in text.split("-"))
    return date(year, month, day)


def current_turn(day: date, spring: str, autumn: str) -> Turn:
    """The latest turn date on or before `day` ("MM-DD" each)."""
    options = [
        Turn("spring", _turn_date(spring, day.year)),
        Turn("autumn", _turn_date(autumn, day.year)),
        Turn("autumn", _turn_date(autumn, day.year - 1)),
    ]
    return max((t for t in options if t.on <= day), key=lambda t: t.on)


def next_turn(day: date, spring: str, autumn: str) -> Turn:
    """The first turn date after `day`."""
    options = [
        Turn("spring", _turn_date(spring, day.year)),
        Turn("autumn", _turn_date(autumn, day.year)),
        Turn("spring", _turn_date(spring, day.year + 1)),
    ]
    return min((t for t in options if t.on > day), key=lambda t: t.on)


def roughly(on: date) -> str:
    """ "late April": the empty deck's next turn."""
    part = "early" if on.day <= 10 else "mid" if on.day <= 20 else "late"
    return f"{part} {MONTH_NAMES[on.month - 1]}"


def turn_members(pieces: Sequence[Held], day: date) -> list[Held]:
    """The season turn's Pack all: active garments out of season now."""
    return [h for h in pieces if h.status == "active" and out_of_season(h, day)]


def due_back(pieces: Sequence[Held], day: date) -> list[Held]:
    """Packed garments whose bring-back month has come."""
    return [
        h
        for h in pieces
        if h.status == "packed" and h.back_on is not None and h.back_on <= day
    ]
