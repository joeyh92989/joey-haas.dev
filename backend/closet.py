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
  set is all year. A garment out of its window is never a candidate.
- **Warmth.** The morning low (6 to 9 am) and the afternoon high (noon to
  6 pm) from the cached forecast, or the month's Denver normals when there
  is none. Layers are chosen for the morning, the top for the afternoon,
  the bottom for the day's middle: Denver's swing is the reason to layer.
  Riding makes the morning `BIKE_CHILL` degrees colder.
- **Formality** per occasion is a range with a target (`OCCASION_FORMALITY`);
  an untagged formality passes and scores as one step off.
- **Bike** rules out dress shoes, long coats and wide or cuffed bottoms
  (`BIKE_EXCLUDES`, matched on name and subtype).
- **Repeat rules.** A top worn within `repeat_top_days` days is out (worn
  Monday with N = 5 comes back on Sunday); an outfit whose top, bottom and
  shoes were worn together within `repeat_outfit_weeks` weeks is skipped.
- **Ranking** without a model: warmth distance, formality distance, rest
  since last worn and wears this month (`WEIGHTS`), capped at
  `CANDIDATES_PER_SLOT` per slot, ties broken by name then id.

Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR C, task 12).
"""

from __future__ import annotations

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
WEIGHTS = {"warmth": 2.0, "formality": 1.0, "rest": 0.5, "wears": 0.3}
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


def fits_occasion(piece: Piece, occasion: str) -> bool:
    if piece.formality is None:
        return True
    low, high, _ = OCCASION_FORMALITY.get(occasion, (1, 5, 3))
    return low <= piece.formality <= high


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
    month = request.day.month
    by_slot: dict[str, list[Scored]] = {slot: [] for slot in slots}
    fit = skipped = 0
    for piece in pieces:
        if fixed is not None and piece.id == fixed.id:
            continue
        if not (
            in_season(piece, month)
            and fits_occasion(piece, request.occasion)
            and (not request.bike or bike_ok(piece))
        ):
            continue
        if worn_recently(piece, request.day, request.repeat_top_days):
            skipped += 1
            continue
        fit += 1
        if piece.category in by_slot:
            by_slot[piece.category].append(
                Scored(
                    piece,
                    score(
                        piece,
                        goal[piece.category],
                        request.occasion,
                        request.day,
                        read.snow,
                    ),
                )
            )
    for slot, found in by_slot.items():
        found.sort(key=lambda s: (-s.score, s.piece.name.lower(), s.piece.id))
        by_slot[slot] = found[:CANDIDATES_PER_SLOT]
    return Candidates(
        slots=tuple(slots),
        by_slot=by_slot,
        fixed=fixed,
        active=sum(1 for p in pieces if not p.transient),
        fit=fit,
        skipped_recent=skipped,
        targets={slot: goal[slot] for slot in slots},
    )


def slot_fallback(pieces: Sequence[Piece], slot: str, request: Request) -> list[Scored]:
    """Swap a piece for a slot the day does not need (a layer on a warm
    day): the pieces that pass the same rules as `candidates`, the repeat
    rule included, least worn first and capped the same way."""
    month = request.day.month
    return sorted(
        (
            Scored(p, 0.0)
            for p in pieces
            if p.category == slot
            and in_season(p, month)
            and fits_occasion(p, request.occasion)
            and (not request.bike or bike_ok(p))
            and not worn_recently(p, request.day, request.repeat_top_days)
        ),
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
    for k in range(depth):
        outfit = nth(k)
        if not outfit.pieces or outfit.key in seen or outfit.key in recent:
            continue
        seen.add(outfit.key)
        outfits.append(outfit)
        if len(outfits) == count:
            break
    if not outfits and depth:
        outfits.append(nth(0))
    if not outfits and found.fixed is not None:
        outfits.append(assemble({}, found, reason, "template"))
    return outfits


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
