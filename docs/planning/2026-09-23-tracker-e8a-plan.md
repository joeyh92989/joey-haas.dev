# Tracker E8a — Play Next — Implementation Plan

Spec: `docs/planning/2026-09-23-tracker-e8a-design.md` (wins over the parent
`2026-09-22-tracker-enhancement-design.md` §6 where they differ).

**Goal:** Pick three named games from the owned backlog with reasons, from pure
and tested scoring; let the owner pin one as Up next (shown publicly); and let
`schema_check` boot against a database that is ahead of the code.

**Architecture:** `backend/picker.py` is pure — plain dataclasses in, scored
picks out, jitter from an injected `random.Random`. `backend/picker_routes.py`
loads rows and events, calls it, and writes `shown` events at most once per
game per UTC day. Pins live in `items.py` because a pin changes the item.
Migration `0004` adds `pick_events`.

**Tech stack:** FastAPI, SQLAlchemy async, Alembic, Postgres 18, pytest with
`httpx2`; React 19, react-router v8, Vitest + Testing Library; plain CSS tokens.

**Branch:** `tracker-e8a` (worktree `~/Developer/joey-haas.dev-worktrees/tracker-e8a`).

## Global constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Backend commands run from `backend/`; gate every commit on exit codes.
- `ruff format . && ruff check .` and `npm run format && npm run lint` after
  every file change; full `pytest`, `vitest`, `npm run build` before each commit.
- Commits: conventional, ≤5 files, independently valid.
- Migrations are additive (the rule Task 1 writes down).
- `picker.py` imports nothing from FastAPI or SQLAlchemy.
- `PICKER_WEIGHTS = {"affinity": 35, "similarity": 20, "quality": 15,
  "length_fit": 15, "waiting": 10, "jitter": 5}`.
- Time windows: `quick (0, 6)`, `evening (6, 15)`, `long (15, None)` hours.
- Staleness: −15 per distinct UTC day with a `shown` event in the last 14 days,
  capped at −45. Skips exclude for 7 days. "Pick it back up" after 30 days.
  "Overdue classic" until acquired dates span 90 days.
- `MOOD_BUCKETS` strings are exactly the spec §4 table.
- Public allowlist: field-set pins change before fields; `pinned_at` never
  public, `pinned` (bool) is.
- CSS tokens only; nothing hover-only; named non-text marks `role="img"`.

## File map

| File | Tasks |
|---|---|
| `backend/schema_check.py`, `backend/tests/test_schema_check.py`, `backend/migrations/README.md` | 1 |
| `backend/models.py`, `backend/migrations/versions/0004_add_pick_events.py`, `backend/tests/test_migrations.py` | 2 |
| `backend/picker.py`, `backend/tests/test_picker.py` | 3, 4 |
| `backend/picker_routes.py`, `backend/tests/test_picker_routes.py`, `backend/main.py` | 5 |
| `backend/items.py`, `backend/tests/test_items_pin.py` | 6 |
| `backend/public.py`, `backend/tests/test_public.py` | 7 |
| `frontend/src/pages/PlayNext.jsx` (+ test), `frontend/src/App.jsx`, `frontend/src/pages/Admin.jsx`, `frontend/src/index.css` | 8 |
| `frontend/src/pages/AdminItem.jsx` (+ test), `frontend/src/pages/AdminCollection.jsx` | 9 |
| `frontend/src/pages/Collection.jsx` (+ test), `frontend/src/index.css` | 10 |
| `scripts/smoke.sh`, `CLAUDE.md` | 11 |

---

## Zone 1 — boot path

### Task 1: `schema_check` tolerates a database ahead of the code

**Files:** Modify `backend/schema_check.py`, `backend/tests/test_schema_check.py`.
Create `backend/migrations/README.md`.

**Interfaces produced**

```python
def known_revisions() -> set[str]:
    """Every revision id in migrations/versions (ScriptDirectory.walk_revisions)."""

def compare_revisions(
    database_revision: str | None, code_head: str | None, known: set[str]
) -> str | None:
    """None when current; a warning string when the database is ahead
    (its revision is not in `known`); raises SchemaMismatchError when it is
    empty or behind (a known revision other than head)."""
```

`verify_schema_is_current(config)` calls it with `known_revisions()` and logs
the warning at WARNING level via the module logger when one is returned.

**Acceptance criteria**
- [ ] Four tests: head → None; unknown `"0099"` → warning naming both
      revisions and "additive"; known non-head `"0001"` → raises with "Run:
      alembic upgrade head"; None → raises.
- [ ] Existing tests updated for the new signature; the head-pin test stays.
- [ ] `migrations/README.md`: how to create and apply a revision (the
      `alembic revision` / `upgrade head` commands against
      `DATABASE_URL_DIRECT`), the additive rule and why (older code must run
      against a newer schema during a deploy), and the deploy order (apply,
      then merge).
- [ ] **Commit:** `fix(schema): let the API boot against a database ahead of
      the code`

**CHECKPOINT — owner review (boot path).**

---

## Zone 2 — migration

### Task 2: Migration `0004` and the `PickEvent` model

**Files:** Modify `backend/models.py`, `backend/tests/test_migrations.py`.
Create `backend/migrations/versions/0004_add_pick_events.py`.

**Interfaces produced**

```python
class PickAction(str, enum.Enum):
    SHOWN = "shown"; SKIPPED = "skipped"; NEVER = "never"; PINNED = "pinned"

class PickEvent(Base):
    __tablename__ = "pick_events"
    __table_args__ = (Index("ix_pick_events_item_action_created",
                            "item_id", "action", "created_at"),)
    id: Mapped[uuid.UUID]            # UUID(as_uuid=True), pk, default uuid4
    item_id: Mapped[uuid.UUID]       # ForeignKey("items.id", ondelete="CASCADE"), not null
    action: Mapped[PickAction]       # Enum(name="pick_action", values_callable=...)
    created_at: Mapped[datetime]     # DateTime(timezone=True), server_default now()
```

Revision `0004` (down `0003`): `pick_action` created explicitly
(`create_type=False` pattern), `op.create_table("pick_events", …)` with the FK
`ondelete="CASCADE"`, the index; downgrade drops index, table, then type.

**Acceptance criteria**
- [ ] The existing model-vs-migration diff and down/up cycle tests pass.
- [ ] New tests in `test_migrations.py`: upgrade to `0004` creates
      `pick_events` and `pick_action`; downgrade to `0003` removes both;
      deleting an item deletes its events (insert via SQL, delete the item,
      count 0).
- [ ] `test_schema_check.py` head pin → `"0004"`.
- [ ] **Commit:** `feat(tracker): add migration 0004 with pick_events`

**CHECKPOINT — owner review (migration).**

---

## Zone 3 — Play Next

### Task 3: `picker.py` — profile, attribute table, terms

**Files:** Create `backend/picker.py`, `backend/tests/test_picker.py`.

**Interfaces produced**

```python
@dataclass(frozen=True)
class PickerItem:
    id: str
    title: str
    type: str                      # "game" etc.
    status: str                    # backlog | active | finished | abandoned
    owned: bool                    # owned_format IS DISTINCT FROM 'none'
    rating: int | None
    favorite: bool
    pinned: bool
    external_id: str | None        # IGDB id when external_source == "igdb"
    year: int | None
    cover_url: str | None
    platform_id: int | None
    platform: str | None
    creator: str | None
    genres: tuple[str, ...]
    themes: tuple[str, ...]
    keywords: tuple[str, ...]
    game_modes: tuple[str, ...]
    player_perspectives: tuple[str, ...]
    similar_games: tuple[str, ...] # IGDB ids as strings
    community_score: float | None
    time_to_beat_hours: float | None  # snapshot time_to_beat.normally
    release_date: date | None
    acquired_at: date | None
    started_at: date | None

@dataclass(frozen=True)
class PickerEvent:
    item_id: str
    action: str                    # shown | skipped | never | pinned
    created_at: datetime           # aware, UTC

PICKER_WEIGHTS: dict[str, int]    # Global constraints
TIME_WINDOWS = {"quick": (0.0, 6.0), "evening": (6.0, 15.0), "long": (15.0, None)}

def reference_weights(items: list[PickerItem]) -> dict[str, float]
def attributes(item: PickerItem) -> set[tuple[str, str]]   # ("genre","Puzzle"), ("creator","Supergiant Games")…
def attribute_table(items, weights) -> dict[tuple[str, str], float]
def affinity(item, table) -> float
def similarity(item, items_by_id, weights) -> tuple[float, PickerItem | None]
def quality(item) -> float
def length_fit(item, time: str) -> float
def acquired_dates_informative(items) -> bool             # span ≥ 90 days
def waiting(item, today: date, informative: bool) -> float
def staleness(item_id, events, now: datetime) -> float    # 0, -15, -30, -45
```

**Rules** (spec §3): reference items are favourite, rated, finished or
abandoned games; base 1.0 / 0.3 / −0.5 (finished favourite 1.0); rating
adjustment around the mean of rated games (`(r−m)/(10−m)` above, `(r−m)/m`
below, 0 at mean; skip when no ratings); finished floor 0.1. Affinity
`clamp(50 + 50 × mean_w, 0, 100)` over the candidate's attributes (absent → 0),
50 with none. Similarity: best `max(w, 0) × 100` over reference items linked
either way via `similar_games` / `external_id`. Quality: community score or
50. Length fit: 100 for `any` or unknown; 100 in window; linear to 0 at `lo/2`
and `2 × hi`; `quick`'s `lo` is 0 so only the upper edge applies. Waiting:
informative → days since `acquired_at` (`started_at` if active) / 365 × 100,
capped; else days since `release_date` / 3650 × 100, capped; unknown → 0.
Staleness: distinct UTC dates of `shown` in the last 14 days × 15, cap 45.

**Acceptance criteria** — `test_picker.py`, pure, with a fixture list of ~10
`PickerItem`s built in the test module:
- [ ] Weights: favourite, finished, abandoned, finished favourite; rating
      above and below a known mean; finished floor holds for a low rating.
- [ ] Attribute table means; affinity with shared, unknown and no
      attributes; creator counts as an attribute.
- [ ] Similarity both link directions, ids compared as strings, negative
      weights give 0.
- [ ] Length fit at the window edges, halfway points, `long` without an upper
      edge, unknown estimate → 100.
- [ ] Waiting in both modes; `acquired_dates_informative` at 89 and 90 days.
- [ ] Staleness: three shows on one day → −15; four distinct days → −45;
      a show 15 days ago → 0.
- [ ] **Commit:** `feat(picker): add the Play Next profile and scoring terms`

### Task 4: `picker.py` — candidates, moods, slots, reasons

**Files:** Modify `backend/picker.py`, `backend/tests/test_picker.py`.

**Interfaces produced**

```python
MOOD_BUCKETS: dict[str, frozenset[str]]   # spec §4, keys "cozy" … "chaotic"

@dataclass(frozen=True)
class PickRequest:
    time: str = "any"
    moods: tuple[str, ...] = ()
    platforms: tuple[int, ...] = ()
    exclude: tuple[str, ...] = ()

@dataclass(frozen=True)
class Pick:
    slot: str            # best_fit | short_and_sweet | overdue_classic | waited_longest | pick_it_back_up
    slot_label: str      # "Best fit" | "Short and sweet" | "Overdue classic" | "Waited longest" | "Pick it back up"
    item: PickerItem
    score: float
    reasons: tuple[str, ...]

@dataclass(frozen=True)
class PickResult:
    picks: tuple[Pick, ...]
    candidate_count: int
    profile_size: int    # rated or favourite games

def candidates(items, events, request, now) -> list[PickerItem]
def recommend(items, events, request, now: datetime, rng: random.Random) -> PickResult
```

**Rules** (spec §3, §5): candidates are owned games in backlog or active, not
pinned, no `never` event, no `skipped` in 7 days, not in `exclude`, passing
moods (any genre/theme/keyword in any selected bucket) and platforms (item
without a platform passes). Total = weighted mean of the six terms + staleness.
Slots in order, no repeats: best fit; short and sweet (`time_to_beat_hours` ≤
6, or ≤ the quick window when time is quick); third slot — "Pick it back up"
for the oldest `active` candidate with `started_at` > 30 days ago and no
`shown`/`pinned` in 30 days, else "Overdue classic" (oldest `release_date`
among affinity ≥ median) or, when acquired dates are informative, "Waited
longest" (highest waiting, same gate). Reasons per spec §5, 2–3 per pick:
overlap names the two highest-table shared attribute values (display values,
not kinds) and the reference item sharing most of them, "♥" if favourite,
", which you rated N" if rated; similarity; length ("About 8 h — fits an
evening", "About 4 h — a short one", "About 30 h — a long one"); age ("Out
since 2017" / "On the shelf since March 2026"); back up ("Started in June 2026
and not touched since").

**Acceptance criteria**
- [ ] Every string in `MOOD_BUCKETS` matches the spec table exactly (a test
      holds the table verbatim).
- [ ] Candidate exclusions each tested; moods OR across buckets; no-platform
      items pass a platform filter.
- [ ] `recommend` with a seeded rng is deterministic; different seeds can
      reorder near-ties; no game repeats across slots; short and sweet
      omitted when nothing qualifies; third slot variants (overdue classic,
      waited longest when informative, pick it back up).
- [ ] Reasons: overlap names the right reference item with ♥ / rating; an
      item with no overlap gets no overlap line; 2–3 reasons each.
- [ ] Empty candidates → `picks == ()`, `candidate_count == 0`;
      `profile_size` counts rated or favourite.
- [ ] **Commit:** `feat(picker): choose three named picks with reasons`

### Task 5: Picker routes

**Files:** Create `backend/picker_routes.py`, `backend/tests/test_picker_routes.py`.
Modify `backend/main.py`.

**Interfaces produced**
- `create_picker_router(factory) -> APIRouter`, prefix `/api/picker`,
  `dependencies=[Depends(require_admin)]`.
- `_to_picker_item(item: Item) -> PickerItem` (snapshot fields read
  defensively, as `public.py` does).
- `POST /next` body `PickNextIn(time: Literal["any","quick","evening","long"]
  = "any", moods: list[Literal[<six>]] = [], platforms: list[int] = [],
  exclude: list[uuid.UUID] = Field([], max_length=200))` →
  `PickNextOut(picks: list[PickOut], candidate_count, profile_size)`;
  `PickOut(slot, slot_label, score, reasons, item: PickItemOut(id, title, year,
  cover_url, type, platform, genres, time_to_beat_hours))`. Loads games and
  the last 30 days of events, calls `recommend(..., now=datetime.now(UTC),
  rng=random.Random())`, then inserts `shown` for each pick lacking a `shown`
  since UTC midnight; one commit.
- `POST /events` `PickEventIn(item_id: uuid.UUID, action:
  Literal["skipped","never"])` → 204; 404 for an unknown item.
- `DELETE /events/{item_id}/never` → 204 (idempotent).
- `main.py` includes the router beside the items router.

**Acceptance criteria** (real Postgres, the `client_for` pattern)
- [ ] `/next` returns up to three picks with reasons for a seeded shelf and
      writes one `shown` per pick; a second call the same day writes none for
      the same games.
- [ ] `never` and a recent `skipped` remove a game; `exclude` removes it;
      restoring `never` brings it back.
- [ ] Moods that match nothing → 200 `{picks: [], candidate_count: 0}`.
- [ ] Unknown mood/time → 422; unknown item on events → 404; all three
      routes → 401 unauthenticated.
- [ ] **Commit:** `feat(picker): add the Play Next routes`

### Task 6: Pin and unpin; `play_next_excluded`

**Files:** Modify `backend/items.py`. Create `backend/tests/test_items_pin.py`.

**Interfaces produced**
- `POST /api/items/{item_id}/pin` → `ItemOut`: 422 when `owned_format ==
  none`; otherwise, in one transaction, `UPDATE items SET pinned_at = NULL
  WHERE pinned_at IS NOT NULL AND id != item_id`, set `pinned_at = now()`,
  `status = active`, `started_at = started_at or today`, insert a `pinned`
  event.
- `DELETE /api/items/{item_id}/pin` → `ItemOut` with `pinned_at` cleared.
- `ItemOut.play_next_excluded: bool` — computed with one `EXISTS` subquery on
  `pick_events` where `action = never`; `list_items` and `get_item` populate
  it (a helper `_excluded_ids(session, ids) -> set[uuid.UUID]`).

**Acceptance criteria**
- [ ] Pin sets the four fields and the event; pinning a second item clears
      the first; unpin clears; `started_at` is kept when already set.
- [ ] Pinning a want-list item → 422; unknown id → 404; unauthenticated → 401.
- [ ] `play_next_excluded` true after a `never` event, false after restore.
- [ ] **Commit:** `feat(items): pin a game as Up next`

### Task 7: Public `pinned`

**Files:** Modify `backend/public.py`, `backend/tests/test_public.py`.

- `LIST_FIELDS` / `DETAIL_FIELDS` pins gain `"pinned"` first; `NEVER_PUBLIC`
  keeps `pinned_at`.
- `PublicItemOut.pinned: bool = item.pinned_at is not None`.

**Acceptance criteria**
- [ ] A pinned public item has `pinned: true`; others false; `pinned_at`
      absent.
- [ ] **Commit:** `feat(public): publish whether an item is Up next`

### Task 8: `/admin/play-next`

**Files:** Create `frontend/src/pages/PlayNext.jsx`, `PlayNext.test.jsx`.
Modify `frontend/src/App.jsx`, `frontend/src/pages/Admin.jsx`,
`frontend/src/index.css`.

**Behaviour** (spec §6): loads `/api/items` to find the pinned game (Up next
block with Unpin → `DELETE /api/items/:id/pin`); controls: Time chips
(single-select, default Any), mood chips (multi), platform chips from the
items' platforms (multi); posts `/api/picker/next` on load and on every control
change and Reroll. Cards (`.pick-card`): slot label, cover, title, year,
`≈ N h`, genre chips (first three), reasons list, buttons **Play this**
(`POST /api/items/:id/pin`, then reload both), **Not tonight** (`POST
/api/picker/events {skipped}`, add to exclude, re-request), **Never suggest**
(`{never}`, re-request). Reroll adds the current picks' ids to `exclude`.
Changing a control resets `exclude`. `candidate_count 0` with moods → message
+ **Try without moods**; without moods → "Nothing in the backlog right now".
`profile_size < 5` → nudge linking `/admin/collection`. Cold start message
after 3 s as other admin pages; 401 → "Not signed in" as AdminCollection.

**Acceptance criteria**
- [ ] Initial request body `{time: 'any', moods: [], platforms: [],
      exclude: []}`; chips change it; Reroll sends the shown ids in exclude.
- [ ] Each action's request and follow-up; Play this shows the game as Up
      next; Unpin removes it.
- [ ] Empty-with-moods path and Try without moods; nudge below 5.
- [ ] Route `admin/play-next` in `App.jsx`; `/admin` links to it.
- [ ] CSS `.pick-grid`, `.pick-card`, `.up-next` from tokens.
- [ ] **Commit:** `feat(admin): add the Play Next page`

### Task 9: Edit-page Restore and Pin; collection link

**Files:** Modify `frontend/src/pages/AdminItem.jsx`, `AdminItem.test.jsx`,
`frontend/src/pages/AdminCollection.jsx`.

- Edit page: when `item.play_next_excluded`, a line "Excluded from Play Next"
  with **Restore** (`DELETE /api/picker/events/:id/never`, then reload); a
  **Pin as Up next** / **Unpin** button by `pinned_at`.
- Admin collection: a "Play Next →" link beside "Import from photos →".

**Acceptance criteria**
- [ ] Restore visible only when excluded, sends the DELETE, reloads.
- [ ] Pin/Unpin send the right method and reflect the returned item.
- [ ] The collection page links to `/admin/play-next`.
- [ ] **Commit:** `feat(admin): restore excluded games and pin from the edit page`

### Task 10: Public Up next card

**Files:** Modify `frontend/src/pages/Collection.jsx`, `Collection.test.jsx`,
`frontend/src/index.css`.

- `UpNext({ items })`: the public item with `pinned`, rendered as a
  `section aria-label="Up next"` with its cover link to `/collection/:id`, the
  title and "Up next"; placed before the favourites row; nothing when none.

**Acceptance criteria**
- [ ] Card present for a pinned item with the right link; absent otherwise.
- [ ] Fixtures gain `pinned: false`; existing tests pass.
- [ ] **Commit:** `feat(shelf): show the Up next game on the collection`

### Task 11: Smoke and docs

**Files:** Modify `scripts/smoke.sh`, `CLAUDE.md`.

- Smoke: `POST /api/picker/next` unauthenticated → 401; public items body
  contains `"pinned"` (or is `[]`). `bash -n` passes.
- `CLAUDE.md`: the additive-migration rule and relaxed `schema_check` under
  Media tracker; `picker.py` (pure; `PICKER_WEIGHTS`, `MOOD_BUCKETS` as the
  tuning points; buckets use exact IGDB strings from the collection); the
  deploy note for `0004`; TODO marks E8a done, E7c next.
- **Commit:** `docs(tracker): cover Play Next in smoke and docs`

---

## Parallel-safe flags

None; tasks run in order (3–4 share files; 5 depends on 3–4; 8–10 on 5–7).

## Automated environment tests

`scripts/smoke.sh` extended in Task 11; admin paths covered by pytest and
vitest. **Passing means:** backend and frontend suites green, build clean,
ruff/prettier/eslint clean, no raw hex outside token blocks; after the owner
applies `0004` and merges, smoke green in production and no new Render log
errors; the owner opens `/admin/play-next`, gets picks with reasons, rerolls,
pins one, and sees it as Up next on `/collection`.

## Zones

```
Zone 1 (auto): task 1 (schema_check — boot path)
CHECKPOINT — owner review
Zone 2 (auto): task 2 (migration 0004)
CHECKPOINT — owner review
Zone 3 (auto): tasks 3–11
CHECKPOINT — batch review + finish gate
```

## Deploy order (owner)

1. Link `.env` into the worktree; apply `0004` to Neon; merge promptly (the
   live code is still strict this once).
2. Render deploys; smoke and logs.
3. `/admin/play-next`.
