# Tracker E8c — Radar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Spec: `docs/planning/2026-09-27-tracker-e8c-radar-design.md`.

**Goal:** A taste-ranked list of upcoming physical releases and open
pre-orders from the catalogue (plus IGDB's upcoming digital-only games), at
`/admin/radar`, with Watch / Not interested / Skip, and the watched games on
a public "On the radar" strip on `/collection`.

**Architecture:** `backend/radar.py` is pure (sections, score, reasons,
caps) and reuses `picker.py`'s profile and `collapse()`; `backend/radar_load.py`
reads the catalogue, items and recommendations into plain views;
`backend/recommendations_routes.py` holds the admin routes. Migration
`0006` adds the shared `recommendations` table. `IgdbSource.upcoming()` is
lane 3. The public strip is frontend-only over `/api/public/items`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Postgres 18, `httpx2`,
pytest on a real Postgres; React 19, react-router v8, Vitest + Testing
Library; plain CSS tokens.

**Branch:** `tracker-e8c` (worktree
`~/Developer/joey-haas.dev-worktrees/tracker-e8c`, cut from `origin/main`
at `7b67889`).

## Global Constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Backend commands run from `backend/`; every commit gated on
  `./.venv/bin/ruff format . && ./.venv/bin/ruff check .` and
  `./.venv/bin/python -m pytest -q -W error::SyntaxWarning`, exit codes
  captured to a variable (zsh). Frontend commits gated on `npm test`,
  `npm run lint`, `npm run format:check`, `npm run build` from `frontend/`.
- `radar.py` is pure: no FastAPI, SQLAlchemy, `models` or `db` imports
  (extend `tests/test_physical_imports.py`'s purity check to it).
- Migrations are additive; `0006` is applied to Neon **before** merge.
- Nothing from `recommendations`, store prices or pre-order windows is
  public; `test_public.py` is extended before any route exists.
- All `/api/recommendations*` routes are admin-only.
- No model call; no scheduled job; generation never walks the stores.
- Tokens only in CSS; nothing hover-only; card actions are siblings of the
  card link; every non-text mark with an accessible name has `role="img"`.
- Commits ≤5 files; fixtures recorded by a script, never by hand; never
  print or commit a credential.

## Deviations from the spec (decided while planning)

- **The shared write lock.** `exclusive` is a closure inside
  `create_physical_router` (`physical_routes.py:291`). `main.py` now makes
  one `asyncio.Lock()` and passes it to both routers (`lock=` parameter,
  default a new lock so tests are unchanged). Generate answers 409 while a
  refresh runs, and the other way round.
- **Watch's 409.** `errorMessage` in `lib/api.js` maps every 409 to "A
  refresh is already running". The Radar page words its own 409 for Watch
  ("Already on your shelf") instead of changing the shared helper.
- **Duplicates on Watch.** `create_item` has no duplicate check; the watch
  route looks for an item with the same IGDB id first and answers 409.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `backend/tests/test_public.py` | recommendation leak names over public models, then responses | 1, 7 |
| `backend/sources/igdb.py` | `UPCOMING_FIELDS`, `parse_upcoming`, `IgdbSource.upcoming` | 2 |
| `backend/scripts/record_igdb_fixtures.py`, `scripts/README.md` | `--upcoming` recording | 2 |
| `backend/tests/fixtures/igdb_upcoming_release_dates.json` | recorded lane-3 page | 2 |
| `backend/tests/test_sources_igdb.py` | parse and query tests | 2 |
| `backend/radar.py` (new) | pure: views, sections, score, reasons, caps | 3 |
| `backend/tests/test_radar.py` (new) | pure tests | 3 |
| `backend/tests/test_physical_imports.py` | purity check includes `radar` | 3 |
| `backend/migrations/versions/0006_add_recommendations.py` (new) | the table and its types | 4 |
| `backend/models.py` | `RecommendationKind`, `ReasonSource`, `RecommendationStatus`, `Recommendation` | 4 |
| `backend/tests/test_migrations.py`, `tests/test_schema_check.py` | 0006 blocks; head "0006" | 4 |
| `backend/radar_load.py` (new) | DB → views: candidates, profile, exclusions, platforms, watching | 5 |
| `backend/tests/test_radar_load.py` (new) | loaders on real Postgres | 5 |
| `backend/recommendations_routes.py` (new) | generate, list, watching, watch, dismiss, skip | 6 |
| `backend/physical_routes.py`, `backend/main.py` | shared lock; mount router | 6 |
| `backend/tests/test_recommendations_routes.py` (new) | route tests | 6 |
| `scripts/smoke.sh` | 401s, leak grep, deep link | 7 |
| `frontend/src/pages/AdminRadar.jsx`, `.test.jsx` (new) | the admin page | 8 |
| `frontend/src/App.jsx`, `pages/Admin.jsx`, `index.css` | route, link, styles | 8 |
| `frontend/src/pages/Collection.jsx`, `Collection.test.jsx` | On the radar strip | 9 |
| `CLAUDE.md`, `backend/README.md`, this plan | docs, Execution summary | 10 |

---

## Zone 1 — pure pieces (no schema)

### Task 1: Pin recommendations out of the public API

**Parallel-safe:** yes.

**Files:** Modify `backend/tests/test_public.py`.

- [ ] **Step 1: Add the names and a model test** (beside `CATALOGUE_NAMES`)

```python
# E8c: suggestions, their reasons and the pre-order data behind them are
# never public; only an item the owner watched is (its `wanted` flag).
RECOMMENDATION_NAMES = (
    "recommendation",
    "batch_id",
    "based_on",
    "reason",
    "preorder",
    "store_line",
    "hypes",
    "lane",
)


def test_no_public_model_names_a_recommendation_field():
    for model in (PublicItemOut, PublicItemDetailOut, PublicStatsOut):
        names = _field_names(model)
        assert not {
            name for name in names for banned in RECOMMENDATION_NAMES if banned in name
        }, model.__name__
```

(`_field_names` already walks nested models; reuse it. If `reason`
matches an existing public field, name the clash in the commit and narrow
the entry to `reason_source`/`reasons`.)

- [ ] **Step 2: Run, gate, commit**

Run: `./.venv/bin/python -m pytest -q tests/test_public.py`
Expected: pass (nothing public carries these today; the test guards the
future).

```bash
git add backend/tests/test_public.py
git commit -m "test(tracker): pin Radar's suggestions out of the public API"
```

---

### Task 2: IGDB upcoming release dates (lane 3)

**Parallel-safe:** yes.

**Files:**
- Modify: `backend/sources/igdb.py`
- Modify: `backend/scripts/record_igdb_fixtures.py`, `backend/scripts/README.md`
- Create: `backend/tests/fixtures/igdb_upcoming_release_dates.json` (recorded)
- Test: `backend/tests/test_sources_igdb.py`

**Interfaces:**
- Produces:
  - `UPCOMING_FIELDS: str` (module constant, shared with the recorder).
  - `UPCOMING_GAME_TYPES = frozenset({0, 8, 9, 10, 11})`,
    `UPCOMING_EXCLUDED_STATUSES = frozenset({5, 35, 36})`,
    `UPCOMING_MIN_HYPES = 5`, `UPCOMING_PAGE = 500`, `UPCOMING_MAX_PAGES = 4`.
  - `def parse_upcoming(rows: list[dict], platform_ids: frozenset[int]) -> list[dict]`
    returning one dict per `(igdb_id, platform_id)`, earliest date wins:
    `{"igdb_id": int, "title": str, "cover_url": str | None,
    "platform_id": int, "release_date": str (ISO) | None,
    "release_precision": "day"|"month"|"quarter"|"year",
    "hypes": int, "snapshot": dict}` where `snapshot` has the keys
    `to_picker_item` reads: genres, themes, keywords, game_modes,
    player_perspectives, similar_games (list of int), hypes.
  - `async def IgdbSource.upcoming(self, platform_ids: Iterable[int], now: int) -> list[dict]`
    (`now` a Unix time, passed in so tests are deterministic).

- [ ] **Step 1: Record the fixture**

Add to the recorder a `--upcoming` flag that runs one query with
`UPCOMING_FIELDS` and writes `igdb_upcoming_release_dates.json`:

```python
UPCOMING_BODY = (
    UPCOMING_FIELDS
    + " where platform = (130,508) & date > {now}; sort date asc; limit 500;"
)
```

The recorder imports `UPCOMING_FIELDS` from `sources.igdb` (so they cannot
drift), posts to `/v4/release_dates`, writes the body with the existing
`_write`, and redacts failures with `_redact`. Run it once:

Run: `./.venv/bin/python scripts/record_igdb_fixtures.py --upcoming`
Expected: `wrote igdb_upcoming_release_dates.json` with 500 rows. Check the
file holds no credential: `grep -c "client" tests/fixtures/igdb_upcoming_release_dates.json`
prints 0. README: a paragraph on `--upcoming` (what, why, re-record when
`UPCOMING_FIELDS` changes).

- [ ] **Step 2: Failing tests** (`test_sources_igdb.py`)

```python
UPCOMING = json.loads((FIXTURES / "igdb_upcoming_release_dates.json").read_text())


def test_upcoming_keeps_one_row_per_game_and_platform():
    rows = parse_upcoming(UPCOMING, frozenset({130, 508}))
    keys = [(row["igdb_id"], row["platform_id"]) for row in rows]
    assert len(keys) == len(set(keys))
    assert {row["platform_id"] for row in rows} <= {130, 508}


def test_upcoming_drops_patches_cancellations_dlc_and_low_hype():
    rows = parse_upcoming(UPCOMING, frozenset({130, 508}))
    assert rows
    assert all(row["hypes"] >= UPCOMING_MIN_HYPES for row in rows)
    raw = {
        (r["game"]["id"], r["platform"]): r
        for r in UPCOMING
        if isinstance(r.get("game"), dict)
    }
    for row in rows:
        source = raw[(row["igdb_id"], row["platform_id"])]
        assert source.get("status") not in UPCOMING_EXCLUDED_STATUSES
        assert source["game"].get("game_type", 0) in UPCOMING_GAME_TYPES


def test_upcoming_precision_follows_date_format():
    synthetic = [
        {"date": 1830211200, "date_format": fmt, "platform": 508, "status": 6,
         "game": {"id": i, "name": f"G{i}", "hypes": 9, "game_type": 0}}
        for i, fmt in enumerate((0, 1, 2, 3, 6), 1)
    ]
    rows = parse_upcoming(synthetic, frozenset({508}))
    assert [row["release_precision"] for row in rows] == [
        "day", "month", "year", "quarter", "quarter",
    ]


def test_a_tbd_date_is_not_upcoming():
    row = {"date": None, "date_format": 7, "platform": 508, "status": None,
           "game": {"id": 1, "name": "G", "hypes": 9, "game_type": 0}}
    assert parse_upcoming([row], frozenset({508})) == []


async def test_upcoming_pages_until_a_short_page(monkeypatch):
    full = [dict(UPCOMING[0]) for _ in range(UPCOMING_PAGE)]
    _patch_http(monkeypatch, [_FakeResponse(200, full), _FakeResponse(200, UPCOMING[:3])])
    source = _source()  # the module's configured-source helper
    await source.upcoming([130, 508], now=1790000000)
    # two pages asked for, with offsets 0 and 500
```

Match `_patch_http`, `_FakeResponse` and the configured-source helper to
their real names in the module before running; assert the offsets from
whatever the patched client records.

- [ ] **Step 3: Implement**

```python
UPCOMING_FIELDS = (
    "fields date,date_format,platform,status,"
    "game.id,game.name,game.hypes,game.game_type,game.cover.image_id,"
    "game.genres.name,game.themes.name,game.keywords.name,"
    "game.game_modes.name,game.player_perspectives.name,game.similar_games;"
)
UPCOMING_GAME_TYPES = frozenset({0, 8, 9, 10, 11})  # main, remake, remaster, expanded, port
UPCOMING_EXCLUDED_STATUSES = frozenset({5, 35, 36})  # cancelled, two Switch 2 patch kinds
UPCOMING_MIN_HYPES = 5
UPCOMING_PAGE = 500
UPCOMING_MAX_PAGES = 4
_PRECISION = {0: "day", 1: "month", 2: "year", 3: "quarter", 4: "quarter",
              5: "quarter", 6: "quarter"}


def _names(values) -> list[str]:
    return [v["name"] for v in values or [] if isinstance(v, dict) and v.get("name")]


def parse_upcoming(rows: list[dict], platform_ids: frozenset[int]) -> list[dict]:
    """IGDB release dates on the owner's platforms as lane-3 rows.

    Per-platform dates, not `first_release_date`, which is the earliest date
    on any platform. Keeps main games, remakes, remasters, expanded games and
    ports with at least UPCOMING_MIN_HYPES follows; drops cancelled releases
    and Switch 2 patch releases, and a date IGDB calls TBD.
    """
    found: dict[tuple[int, int], dict] = {}
    for row in rows:
        game = row.get("game")
        if not isinstance(game, dict) or row.get("platform") not in platform_ids:
            continue
        precision = _PRECISION.get(row.get("date_format"))
        if precision is None or not isinstance(row.get("date"), int):
            continue
        if row.get("status") in UPCOMING_EXCLUDED_STATUSES:
            continue
        if game.get("game_type", 0) not in UPCOMING_GAME_TYPES:
            continue
        hypes = game.get("hypes") if isinstance(game.get("hypes"), int) else 0
        if hypes < UPCOMING_MIN_HYPES:
            continue
        key = (game["id"], row["platform"])
        released = date_from_unix(row["date"])
        if key in found and found[key]["release_date"] <= released:
            continue
        cover = (game.get("cover") or {}).get("image_id")
        found[key] = {
            "igdb_id": game["id"],
            "title": game.get("name") or "",
            "cover_url": _cover(cover) if cover else None,
            "platform_id": row["platform"],
            "release_date": released,
            "release_precision": precision,
            "hypes": hypes,
            "snapshot": {
                "genres": _names(game.get("genres")),
                "themes": _names(game.get("themes")),
                "keywords": _names(game.get("keywords"))[:10],
                "game_modes": _names(game.get("game_modes")),
                "player_perspectives": _names(game.get("player_perspectives")),
                "similar_games": [g for g in game.get("similar_games") or [] if isinstance(g, int)],
                "hypes": hypes,
            },
        }
    return sorted(found.values(), key=lambda r: (r["release_date"], r["igdb_id"]))
```

(`_cover` is whatever `_image_url` uses to build a cover URL from an
`image_id` with `COVER_SIZE`; factor a one-line helper if needed.)

```python
    async def upcoming(self, platform_ids: Iterable[int], now: int) -> list[dict]:
        """Lane 3: upcoming release dates on these platforms, paged."""
        ids = frozenset(platform_ids)
        where = f"where platform = ({','.join(map(str, sorted(ids)))}) & date > {now};"
        rows: list[dict] = []
        for page in range(UPCOMING_MAX_PAGES):
            body = (
                f"{UPCOMING_FIELDS} {where} sort date asc; "
                f"limit {UPCOMING_PAGE}; offset {page * UPCOMING_PAGE};"
            )
            batch = await self._query(body, endpoint="release_dates")
            rows.extend(batch)
            if len(batch) < UPCOMING_PAGE:
                break
        logger.info("igdb upcoming: %d release dates on %s", len(rows), sorted(ids))
        return parse_upcoming(rows, ids)
```

- [ ] **Step 4: Run, gate, commit** (5 files)

```bash
git add backend/sources/igdb.py backend/scripts/record_igdb_fixtures.py backend/scripts/README.md backend/tests/fixtures/igdb_upcoming_release_dates.json backend/tests/test_sources_igdb.py
git commit -m "feat(tracker): read IGDB's upcoming release dates for Radar"
```

---

### Task 3: `radar.py` — sections, score, reasons

**Parallel-safe:** yes (depends only on `picker.py`, `collapse.py`).

**Files:**
- Create: `backend/radar.py`, `backend/tests/test_radar.py`
- Modify: `backend/tests/test_physical_imports.py` (add `radar` to the pure
  modules it imports in a fresh interpreter)

**Interfaces:**
- Consumes: `picker.PickerItem`, `picker.reference_weights`,
  `picker.attribute_table`, `picker.affinity`, `picker.similarity`,
  `picker._named`, `picker._overlap_reason`;
  `physical_sources.collapse.Candidate`.
- Produces:

```python
SUGGESTED_CAP = 30
DATED_LATER_CAP = 20
DIGITAL_CAP = 10
TASTE_WEIGHTS = {"affinity": 0.55, "similarity": 0.35, "hype": 10.0}
URGENCY_BONUS = 15
URGENCY_DAYS = 30
HYPE_SCALE = 150

@dataclass(frozen=True)
class PoolGame:            # one lane 1–2 candidate with its game data
    candidate: Candidate
    snapshot: dict         # catalogue_games.snapshot
    hypes: int | None
    lane: str              # "preorder" | "dated"
    closes_at: date | None # soonest open pre-order window among its listings

@dataclass(frozen=True)
class Suggestion:
    igdb_id: int
    platform_id: int
    title: str
    cover_url: str | None
    release_date: date | None
    release_precision: str | None
    section: str           # "suggested" | "dated_later" | "digital"
    lane: str              # "preorder" | "dated" | "digital"
    score: int
    reasons: tuple[str, ...]
    based_on: tuple[str, ...]      # reference item ids
    physical_format: str | None
    format_source: str | None
    format_note: str | None
    listing_ids: tuple[str, ...]
    store_lines: tuple[dict, ...]  # admin-only display data
    hypes: int | None
    snapshot: dict

def section_for(candidate: Candidate, lane: str, today: date,
                include_key_cards: bool) -> str | None
def score_game(item: PickerItem, table, references, weights,
               hypes: int | None, closes_at: date | None,
               today: date) -> tuple[int, PickerItem | None]
def build(pool: list[PoolGame], upcoming: list[dict], profile: list[PickerItem],
          excluded: set[int], today: date, include_key_cards: bool = False
          ) -> list[Suggestion]
```

- [ ] **Step 1: Failing tests** (`test_radar.py`, pure, no database)

Build `Candidate` and `PickerItem` values with small helper functions at
the top of the test module (`_candidate(igdb_id, **fields)`,
`_game(id, **fields)` for a PickerItem with `owned=True, favorite=True,
genres=(...)`). Cases:

```python
TODAY = date(2026, 9, 27)

def test_a_future_day_date_is_suggested_and_a_year_date_is_dated_later():
    assert section_for(_candidate(1, release_date=date(2026, 12, 1), release_precision="day"), "dated", TODAY, False) == "suggested"
    assert section_for(_candidate(2, release_date=date(2027, 1, 1), release_precision="year"), "dated", TODAY, False) == "dated_later"

def test_a_past_date_is_not_on_radar_unless_it_is_a_preorder():
    past = _candidate(3, release_date=date(2026, 1, 1), release_precision="day")
    assert section_for(past, "dated", TODAY, False) is None
    assert section_for(past, "preorder", TODAY, False) == "suggested"

def test_key_cards_stay_off_unless_asked():
    card = _candidate(4, release_date=date(2026, 12, 1), release_precision="day", physical_format="game_key_card")
    assert section_for(card, "dated", TODAY, False) is None
    assert section_for(card, "dated", TODAY, True) == "suggested"

def test_taste_outweighs_hype():
    profile = [_game("a", genres=("Roguelike",), favorite=True)]
    liked = _pool(10, genres=("Roguelike",), hypes=5)
    hyped = _pool(11, genres=("Sport",), hypes=900)
    ranked = build([liked, hyped], [], profile, set(), TODAY)
    assert [s.igdb_id for s in ranked][:2] == [10, 11]

def test_a_closing_window_adds_urgency():
    profile = [_game("a", genres=("Roguelike",))]
    soon = _pool(12, genres=("Roguelike",), lane="preorder", closes_at=TODAY + timedelta(days=10))
    later = _pool(13, genres=("Roguelike",), lane="preorder", closes_at=TODAY + timedelta(days=90))
    by_id = {s.igdb_id: s.score for s in build([soon, later], [], profile, set(), TODAY)}
    assert by_id[12] - by_id[13] == URGENCY_BONUS

def test_excluded_games_never_appear_in_any_lane():
    ranked = build([_pool(14)], [_upcoming(14), _upcoming(15)], [], {14}, TODAY)
    assert {s.igdb_id for s in ranked} == {15}

def test_lane_three_drops_games_already_in_lanes_one_and_two():
    ranked = build([_pool(16)], [_upcoming(16)], [], set(), TODAY)
    assert [(s.igdb_id, s.section) for s in ranked] == [(16, "suggested")]

def test_caps_per_section():
    pool = [_pool(100 + i) for i in range(40)]
    upcoming = [_upcoming(200 + i) for i in range(15)]
    ranked = build(pool, upcoming, [], set(), TODAY)
    counts = Counter(s.section for s in ranked)
    assert counts["suggested"] == SUGGESTED_CAP and counts["digital"] == DIGITAL_CAP

def test_reasons_name_the_window_the_format_and_the_similar_game():
    profile = [_game("a", title="Dredge", external_id="500", favorite=True)]
    pool = _pool(17, similar_games=("500",), lane="preorder",
                 closes_at=date(2026, 11, 8), store_lines=({"store": "Limited Run", "price": "59.99", "currency": "USD", "preorder_closes_at": "2026-11-08"},),
                 physical_format="game_card")
    (s,) = build([pool], [], profile, set(), TODAY)
    assert s.reasons[0] == "IGDB lists it beside Dredge ♥"
    assert "Pre-orders close Nov 8 at Limited Run · $59.99" in s.reasons
    assert s.based_on == ("a",)

def test_an_empty_profile_orders_by_hype_then_date():
    ranked = build([_pool(18, hypes=3), _pool(19, hypes=300)], [], [], set(), TODAY)
    assert [s.igdb_id for s in ranked] == [19, 18]

def test_lane_three_rows_have_no_format_and_a_note():
    (s,) = build([], [_upcoming(20)], [], set(), TODAY)
    assert (s.section, s.physical_format, s.format_note) == ("digital", None, "no physical edition announced")
```

`_pool(igdb_id, genres=(), hypes=None, lane="dated", closes_at=None, similar_games=(), store_lines=(), physical_format="game_card")` builds a `PoolGame` with a `Candidate` dated `TODAY + 60 days`, day precision; `_upcoming(igdb_id)` builds a lane-3 dict in `parse_upcoming`'s shape, hypes 50.

- [ ] **Step 2: Run and see them fail** (`ModuleNotFoundError: radar`)

- [ ] **Step 3: Implement `radar.py`**

```python
"""Radar: upcoming physical releases, ranked by the owner's taste. Pure.

The pool arrives as plain views (radar_load.py reads them); this module
decides each game's section, scores it with Play Next's profile, writes its
reasons and keeps the top of each section. Taste carries 90 of 100 points
and IGDB hype 10 (owner decision), plus a bonus when a pre-order window
closes soon.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

from physical_sources.collapse import Candidate
from picker import (
    PickerItem,
    _named,
    _overlap_reason,
    affinity,
    attribute_table,
    reference_weights,
    similarity,
)

# (constants and dataclasses as in Interfaces)

KEY_CARD_FORMATS = frozenset({"game_key_card", "code_in_box"})
NEAR_PRECISIONS = frozenset({"day", "month"})
FORMAT_WORDS = {"game_card": "Full game on cartridge", "disc": "Full game on disc"}


def section_for(candidate, lane, today, include_key_cards):
    """Where a lane 1–2 candidate goes, or None when it is not on Radar."""
    if not include_key_cards and candidate.physical_format in KEY_CARD_FORMATS:
        return None
    upcoming = candidate.release_date is not None and candidate.release_date > today
    if lane != "preorder" and not upcoming:
        return None
    if lane == "preorder" or candidate.release_precision in NEAR_PRECISIONS:
        return "suggested"
    return "dated_later"


def _hype(hypes):
    return min(1.0, math.log1p(hypes or 0) / math.log1p(HYPE_SCALE))


def score_game(item, table, references, weights, hypes, closes_at, today):
    near, similar_to = similarity(item, references, weights) if references else (0.0, None)
    taste = affinity(item, table) if references else 50.0
    value = (
        TASTE_WEIGHTS["affinity"] * taste
        + TASTE_WEIGHTS["similarity"] * near
        + TASTE_WEIGHTS["hype"] * _hype(hypes)
    )
    if closes_at is not None and today <= closes_at <= today + timedelta(days=URGENCY_DAYS):
        value += URGENCY_BONUS
    return round(value), similar_to


def _picker_item(igdb_id, title, snapshot, platform_id, released):
    strings = lambda key: tuple(str(v) for v in snapshot.get(key) or [])  # noqa: E731
    return PickerItem(
        id=f"igdb:{igdb_id}", title=title, type="game", status="backlog",
        owned=False, rating=None, favorite=False, pinned=False,
        external_id=str(igdb_id), year=released.year if released else None,
        cover_url=None, platform_id=platform_id, platform=None, creator=None,
        genres=strings("genres"), themes=strings("themes"),
        keywords=strings("keywords"), game_modes=strings("game_modes"),
        player_perspectives=strings("player_perspectives"),
        similar_games=strings("similar_games"), community_score=None,
        time_to_beat_hours=None, release_date=released, acquired_at=None,
        started_at=None,
    )
```

`_window_reason(store_lines)` returns
`f"Pre-orders close {d:%b} {d.day} at {store} · ${price}"` for the soonest
line with a `preorder_closes_at` (price and currency: `$` for USD, `€` EUR,
`£` GBP, else the code). `_date_reason(platform_name, released, precision)`
returns `"Nintendo Switch 2 · Mar 2027"` (month or later precision) or
`"Nintendo Switch 2 · 2027"` (year, quarter). Reasons in order: similarity,
overlap (from `_overlap_reason`), window, format (`FORMAT_WORDS` or the
candidate's `format_note`), date, and for lane 3 `f"{hypes} people waiting
on IGDB"`; keep the first three. `based_on` is the similar reference's id
(or the overlap reference's).

`build(...)`:
1. `references` = profile items `reference_weights` gives a weight to;
   `weights = reference_weights(profile)`;
   `table = attribute_table(profile, weights)`.
2. For each `PoolGame` not in `excluded`: `section_for`; skip `None`;
   score; `Suggestion` from the candidate (store lines → dicts with ISO
   dates and prices as strings).
3. Lane-3 dicts whose `igdb_id` is not in `excluded` or in the pool's ids:
   section `digital`, `physical_format=None`,
   `format_note="no physical edition announced"`.
4. Sort each section by `(-score, release_date or date.max, igdb_id)`,
   keep `SUGGESTED_CAP`, `DATED_LATER_CAP`, `DIGITAL_CAP`; return them
   concatenated in that order. With an empty profile the taste terms are
   equal for every game, so hype and date decide.

- [ ] **Step 4: Run, gate, commit** (3 files)

```bash
git add backend/radar.py backend/tests/test_radar.py backend/tests/test_physical_imports.py
git commit -m "feat(tracker): rank Radar's pool by the owner's taste"
```

## CHECKPOINT — batch review before the migration

---

## Zone 2 — migration `0006`

### Task 4: The `recommendations` table

**Parallel-safe:** no.

**Files:**
- Create: `backend/migrations/versions/0006_add_recommendations.py`
- Modify: `backend/models.py`, `backend/tests/test_migrations.py`,
  `backend/tests/test_schema_check.py`

- [ ] **Step 1: Failing tests**

`test_schema_check.py:55`: `assert code_head_revision() == "0006"`.
`test_migrations.py`, beside the 0005 block:

```python
RECOMMENDATION_TYPES = {"recommendation_kind", "reason_source", "recommendation_status"}


def test_0006_adds_the_recommendations_table_and_types():
    _alembic("upgrade", "0006")
    assert "recommendations" in _tables()
    assert RECOMMENDATION_TYPES <= _types()


def test_0006_downgrade_removes_them_and_keeps_the_catalogue():
    _alembic("upgrade", "0006")
    _alembic("downgrade", "0005")
    assert "recommendations" not in _tables()
    assert not RECOMMENDATION_TYPES & _types()
    assert {"catalogue_games", "store_listings"} <= _tables()
    _alembic("upgrade", "head")
```

- [ ] **Step 2: Models** (`models.py`, after the catalogue models)

```python
class RecommendationKind(str, enum.Enum):
    DISCOVER = "discover"
    RADAR = "radar"


class ReasonSource(str, enum.Enum):
    MODEL = "model"
    TEMPLATE = "template"


class RecommendationStatus(str, enum.Enum):
    PENDING = "pending"
    WANTED = "wanted"
    DISMISSED = "dismissed"
    OWNED = "owned"
    SKIPPED = "skipped"


class Recommendation(Base):
    """A suggestion from Radar or Discover (spec E8c §1, parent §7.2)."""

    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint(
            "kind", "external_source", "external_id", "platform_id",
            name="ux_recommendations_game",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[RecommendationKind] = _enum_column(RecommendationKind, "recommendation_kind", nullable=False)
    type: Mapped[ItemType] = _enum_column(ItemType, "item_type", nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    year: Mapped[int | None] = mapped_column(SmallInteger)
    release_date: Mapped[date | None] = mapped_column(Date)
    external_source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(50), nullable=False)
    cover_url: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    reason_source: Mapped[ReasonSource] = _enum_column(ReasonSource, "reason_source", nullable=False)
    based_on: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    generated_at: Mapped[datetime] = _now_column()
    status: Mapped[RecommendationStatus] = _enum_column(RecommendationStatus, "recommendation_status", nullable=False)
    platform_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    platform: Mapped[str | None] = mapped_column(String(60))
    physical_format: Mapped[PhysicalFormat | None] = _enum_column(PhysicalFormat, "physical_format")
    format_source: Mapped[FormatSource | None] = _enum_column(FormatSource, "format_source")
    format_note: Mapped[str | None] = mapped_column(Text)
    listing_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    source_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
```

Match `item_type`'s real enum type name and the imports the module already
uses; `reason` holds the reasons joined with `"\n"` (one per line).

- [ ] **Step 3: Migration** (`0006_add_recommendations.py`, revision
  `"0006"`, down `"0005"`), following 0005's pattern exactly: the three new
  `postgresql.ENUM(..., create_type=False)` types in `NEW_TYPES`, created
  with `checkfirst=True` in `upgrade()` and dropped in reverse after the
  table in `downgrade()`; `item_type`, `physical_format` and
  `format_source` reused with `create_type=False`; the columns above; the
  unique constraint; an index `ix_recommendations_kind_status` on
  `(kind, status)`.

- [ ] **Step 4: Run, gate, commit** (4 files)

Run: `./.venv/bin/python -m pytest -q tests/test_migrations.py tests/test_schema_check.py`
then the full suite.

```bash
git add backend/migrations/versions/0006_add_recommendations.py backend/models.py backend/tests/test_migrations.py backend/tests/test_schema_check.py
git commit -m "feat(tracker): add migration 0006 with the recommendations table"
```

## CHECKPOINT — batch review of the migration

---

## Zone 3 — loading, routes, pages

### Task 5: `radar_load.py` — the database into views

**Parallel-safe:** no (needs Task 4).

**Files:** Create `backend/radar_load.py`, `backend/tests/test_radar_load.py`.

**Interfaces:**
- Consumes: `physical_sources.sync.edition_view(row) -> EditionView`,
  `collapse(...)`, `STORES[key].name`, `picker_routes.to_picker_item(item)`,
  `radar.PoolGame`.
- Produces:

```python
async def collection_platforms(session) -> tuple[int, ...]
async def load_pool(session, platform_ids: tuple[int, ...], today: date) -> list[PoolGame]
async def load_profile(session) -> list[PickerItem]
async def excluded_games(session) -> set[int]
async def watching(session, today: date) -> list[dict]
```

- `collection_platforms`: distinct `items.platform_id` in (130, 508) where
  `type = game`; `(130, 508)` when none.
- `load_pool`: linked (`igdb_id IS NOT NULL`) live editions
  (`retired_at IS NULL`, `is_physical IS DISTINCT FROM false`) and
  non-archived game listings on `platform_ids`; group by
  `(igdb_id, platform_id)`; keep groups with an open pre-order or a
  `release_date > today`; build `ListingView`s (store name from `STORES`)
  and a `GameView` from `catalogue_games`; `collapse()`; lane `preorder`
  when any listing is `preorder`, else `dated`; `closes_at` the soonest
  future `preorder_closes_at`; `snapshot`/`hypes` from `catalogue_games`.
- `load_profile`: every game item → `to_picker_item`.
- `excluded_games`: `int(external_id)` of items with
  `external_source = 'igdb'`, plus `int(external_id)` of recommendations of
  either kind with status `dismissed`, `wanted` or `owned`.
- `watching`: items with `owned_format = none` and (`release_date > today`
  or an open pre-order at a listing with `igdb_id = external_id::int` and
  the item's platform), soonest first, each as
  `{"item": {...id, title, cover_url, platform, release_date, physical_format},
  "preorder": {"store", "closes_at", "price", "currency", "url"} | None}`.

- [ ] **Step 1: Failing tests** (real Postgres, `sessionmaker_for_test`):
  seed a `CatalogueGame`, a dated edition, a pre-order listing and a past
  listing for three games; assert `load_pool` returns the two upcoming
  games with lanes `dated` and `preorder`, the pre-order's `closes_at`, the
  collapsed format and the snapshot; an unlinked listing is absent; a
  watched item and a dismissed recommendation both land in
  `excluded_games`; `watching` lists the watched item with its pre-order
  window; `collection_platforms` falls back to `(130, 508)`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Gate, commit** (2 files)

```bash
git add backend/radar_load.py backend/tests/test_radar_load.py
git commit -m "feat(tracker): load Radar's pool, profile and exclusions"
```

---

### Task 6: `/api/recommendations` routes and the shared lock

**Parallel-safe:** no.

**Files:**
- Create: `backend/recommendations_routes.py`,
  `backend/tests/test_recommendations_routes.py`
- Modify: `backend/physical_routes.py` (accept `lock: asyncio.Lock | None
  = None`; `exclusive` uses it), `backend/main.py` (one lock, mount router)

**Interfaces:**
- Produces: `create_recommendations_router(factory, igdb_factory, lock: asyncio.Lock) -> APIRouter`
  with prefix `/api/recommendations`, `dependencies=[Depends(require_admin)]`.
  `igdb_factory` returns the configured `IgdbSource` (the same one
  `create_physical_router` builds from `registry`).

| Route | Body / query | Answer |
|---|---|---|
| `POST /generate` | `{kind: "radar", platforms?: list[int], include_key_cards?: bool}` | `{batch_id, counts: {suggested, dated_later, digital}, digital_error: str | null}`; 409 during a refresh; 422 for `kind != "radar"` |
| `GET ""` | `?kind=radar` | `{generated_at, catalogue: {stores_at, registry_at}, sections: {suggested: [...], dated_later: [...], digital: [...]}}` each row `{id, title, cover_url, release_date, release_precision, platform, physical_format, format_note, reasons: list[str], score, status, store_lines, hypes}` |
| `GET /watching` | | `watching()` |
| `POST /{id}/watch` | | `{item_id}`; 404 unknown; 409 when an item with that IGDB id exists |
| `POST /{id}/dismiss`, `/{id}/skip` | | `{status}`; 404 unknown |

`generate`: under `lock`; `today = date.today()` (UTC);
`platforms = body.platforms or await collection_platforms(session)`; lane 3
via `igdb.upcoming(platforms, now=int(time.time()))` inside `try/except
SourceError` (its message becomes `digital_error`, lanes 1–2 still run);
`build(...)`; then in one transaction: delete the kind's `pending` rows;
for each suggestion upsert on the unique key — a new row or a `skipped`
row becomes `pending` with the new batch's data; `wanted`, `dismissed`,
`owned` rows are left alone. `reason = "\n".join(reasons)`,
`reason_source = template`, `based_on`, `source_metadata = {lane, section,
release_precision, hypes, store_lines, genres}`.

`watch`: 404 if missing; `select Item where external_source='igdb' and
external_id=row.external_id` → 409 "Already on your shelf"; else build an
`ItemIn` (type game, title, `external_source="igdb"`, `external_id`,
`platform_id`, `cover_url`, `release_date`, `owned_format="none"`, status
`backlog`, `is_public=True`, `source_metadata` from the matching
`catalogue_games.snapshot` or the row's), run it through the same
`_copy_fields`/`apply_copy_fields` path `create_item` uses, add the item,
then, when the row has a `physical_format`, `apply_registry_format(item,
row.physical_format.value)`; mark the row `wanted`; commit.

- [ ] **Step 1: Failing tests** (real Postgres, the physical fixture server
  from `physical_support.serve_fixtures` for any store data, and a fake
  IGDB whose `upcoming` returns two lane-3 dicts or raises `SourceError`):
  every route answers 401 unauthenticated (parametrized); generate writes
  rows in three sections and returns counts; a second generate keeps a
  `wanted` and a `dismissed` row and turns a `skipped` row back to
  `pending`; lane-3 failure → `digital_error` set and lanes 1–2 written;
  generate during a held lock → 409; watch creates a public backlog item
  with `owned_format` none and marks the row `wanted`; a second watch →
  409; dismiss then generate → the game never returns in either kind;
  `GET /watching` lists the watched item.
- [ ] **Step 2: Implement; main.py mounts
  `create_recommendations_router(session_factory, lambda: registry[ItemType.GAME], catalogue_lock)`
  and passes `lock=catalogue_lock` to `create_physical_router`.**
- [ ] **Step 3: Gate, commit** (4 files)

```bash
git add backend/recommendations_routes.py backend/tests/test_recommendations_routes.py backend/physical_routes.py backend/main.py
git commit -m "feat(tracker): add the Radar routes behind the catalogue's lock"
```

---

### Task 7: Leak checks with real rows, and smoke

**Parallel-safe:** no.

**Files:** Modify `backend/tests/test_public.py`, `scripts/smoke.sh`.

- [ ] **Step 1:** `test_no_public_response_carries_a_recommendation_key`:
  seed a public item, a `Recommendation` for the same game with reasons,
  store lines and a pre-order window, then GET `/api/public/items`,
  `/api/public/stats`, `/api/public/items/{id}`; assert no key contains a
  `RECOMMENDATION_NAMES` entry and no body contains the reason text or the
  store name.
- [ ] **Step 2:** `smoke.sh`: 401 checks for `GET /api/recommendations?kind=radar`,
  `POST /api/recommendations/generate`, `GET /api/recommendations/watching`;
  add `batch_id|based_on|reason_source|store_lines|hypes` to the public
  leak grep; `GET /admin/radar (deep link)` answers 200.
- [ ] **Step 3: Gate, commit** (2 files)

```bash
git add backend/tests/test_public.py scripts/smoke.sh
git commit -m "test(tracker): pin Radar rows out of public responses and smoke"
```

---

### Task 8: `/admin/radar`

**Parallel-safe:** yes with Task 9.

**Files:** Create `frontend/src/pages/AdminRadar.jsx`, `AdminRadar.test.jsx`;
modify `frontend/src/App.jsx` (route `admin/radar`), `pages/Admin.jsx` (a
`Radar` link after Catalogue), `index.css`.

- Module-level `async function fetchRadar()` and `fetchWatching()` return
  `{state: 'unauthorized'|'error'|'ready', ...}` (AdminCatalogue's
  pattern); a `useCallback` `apply`; the effect with `let live = true`.
- Header: **Generate** (POST, then refetch), a "Include Game-Key Cards"
  checkbox passed as `include_key_cards`, "Generated {relative}" and
  "Catalogue refreshed {relative} →" linking `/admin/catalogue`; a
  `digital_error` from the last generate shown in words.
- **Watching**, **Suggested** (grouped by month of `release_date`, rows with
  a pre-order window first within their month), **Dated later**, and a
  `<details>` **Digital so far**. Cards: `PosterGrid` + `PosterCard` with
  `actions` rendering Watch / Not interested / Skip buttons, reasons as a
  list under the card, the store line and window.
- A pressed action removes the card; Watch's 409 shows "Already on your
  shelf" (not `errorMessage`, which maps every 409 to the refresh text);
  other failures show `errorMessage(response)`.
- An empty profile shows "Ranked by anticipation: rate a few games to
  personalise".

Tests (Vitest, `stubApi` keyed by `` `${method} ${path}` ``, the
`Outlet context={{ signedIn }}` wrapper): renders the four sections from a
stubbed GET; Generate posts `include_key_cards` and refetches; Watch posts
and removes the card; Watch's 409 shows "Already on your shelf"; the
Digital so far section starts collapsed; signed out shows the sign-in
prompt AdminCatalogue shows.

Gate: `npm test && npm run lint && npm run format:check && npm run build`.

```bash
git add frontend/src/pages/AdminRadar.jsx frontend/src/pages/AdminRadar.test.jsx frontend/src/App.jsx frontend/src/pages/Admin.jsx frontend/src/index.css
git commit -m "feat(tracker): add the Radar admin page"
```

---

### Task 9: The public "On the radar" strip

**Parallel-safe:** yes with Task 8.

**Files:** Modify `frontend/src/pages/Collection.jsx`,
`frontend/src/pages/Collection.test.jsx`, `frontend/src/index.css`.

```jsx
function OnTheRadar({ items }) {
  const today = localToday()
  const coming = items
    .filter((item) => item.wanted && item.release_date && item.release_date > today)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
  if (!coming.length) return null
  return (
    <section className="on-the-radar" aria-label="On the radar">
      <h2>On the radar</h2>
      <PosterGrid
        items={coming}
        size="small"
        renderCard={(item) => <PosterCard item={item} to={`/collection/${item.id}`} />}
      />
    </section>
  )
}
```

Rendered right after `<UpNext items={items} />`. Use the module's existing
`localToday` (the PosterCard ribbon already uses one) and a `size` the grid
supports. Tests: the strip lists only wanted items with a future date,
soonest first; it is absent when there are none; it sits after Up next and
before Favourites in document order.

Gate: the frontend suite, lint, format, build.

```bash
git add frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx frontend/src/index.css
git commit -m "feat(tracker): show watched upcoming games on /collection"
```

---

### Task 10: Docs and the Execution summary

**Files:** `CLAUDE.md` (Current state: E8c done; Media tracker: Radar's
rules — regenerate only, taste-led, lane 3, `0006` before merge, the shared
lock, nothing public but watched items), `backend/README.md` (a Radar
section: `radar.py` pure, `radar_load.py`, the routes, the fixture), this
plan's Execution summary.

```bash
git add CLAUDE.md backend/README.md docs/planning/2026-09-27-tracker-e8c-radar-plan.md
git commit -m "docs(tracker): record E8c Radar"
```

## Commit boundaries

| # | Commit | Files |
|---|---|---|
| 1 | public leak names | 1 |
| 2 | IGDB upcoming + fixture | 5 |
| 3 | `radar.py` | 3 |
| 4 | migration 0006 | 4 |
| 5 | `radar_load.py` | 2 |
| 6 | routes + lock | 4 |
| 7 | leak rows + smoke | 2 |
| 8 | admin page | 5 |
| 9 | public strip | 3 |
| 10 | docs | 3 |

## Zones

```
Zone 1 (auto): tasks 1–3 (public pin, IGDB upcoming, radar.py)
CHECKPOINT — batch review before the migration
Zone 2 (auto): task 4 (migration 0006)
CHECKPOINT — batch review of the migration
Zone 3 (auto): tasks 5–10
CHECKPOINT — batch review + finish gate (ultra review)
```

## Automated environment tests

- **Smoke util:** exists, `scripts/smoke.sh`; Task 7 adds the Radar 401s,
  the leak grep names and the `/admin/radar` deep link. Passing: every
  check green.
- **Before merge:** the backend suite (real Postgres) and the frontend
  suite, lint, format, build.
- **Deploy order:** `alembic upgrade head` against Neon (applies `0006`),
  then merge; Render deploys.
- **After deploy, through the owner's signed-in session (the owner presses
  Generate; I read with GET only):** `GET /api/recommendations?kind=radar`
  has a non-empty Suggested section, every row has at least one reason, no
  row's game is an owned item, and lane 3 is present or its
  `digital_error` named; Watch one game → it is in `GET /watching` and on
  `/collection`'s strip; `smoke.sh` green; Render's logs (`&q=Traceback`,
  `&q=ERROR`) show nothing new.
