# Tracker E7b — Metadata Depth and the Copy Fields — Implementation Plan

Spec: `docs/planning/2026-09-23-tracker-e7b-design.md` (the spec wins over
the parent `2026-09-22-tracker-enhancement-design.md` where they differ).

**Goal:** Give every item a copy — platform, physical format, cart ID,
region, completeness, release and acquired dates — with the write rules
enforced in one server-side module; deepen the IGDB snapshot (themes,
keywords, ids, release status, time to beat); add a batched bulk refresh and
a bulk set; and show the result on the shelf, the item page and the admin
forms.

**Architecture:** Migration `0003` adds ten nullable `items` columns and
three enums, alone in its own zone. Every write path — PATCH, create, bulk
create, bulk set — passes its changes through the pure
`formats.apply_copy_fields`. The IGDB adapter gains a generic endpoint
parameter, `fetch_many`, and time to beat, parsed against fixtures the owner
records. The public API stays a hand-written allowlist.

**Tech stack:** FastAPI, SQLAlchemy async, Alembic, Postgres 18, pytest with
`httpx2`; React 19, react-router v8, Vitest + Testing Library; plain CSS
tokens.

**Branch:** `tracker-e7b` (worktree `~/Developer/joey-haas.dev-worktrees/tracker-e7b`).

## Global constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Backend commands run **from `backend/`** (`test_schema_check` resolves
  `migrations/` against the working directory). Gate every commit on exit
  codes, not on piped output.
- Run `./.venv/bin/ruff format . && ./.venv/bin/ruff check .` and
  `npm run format && npm run lint` after every file change.
- Before each commit: full `pytest`, full `vitest`, `npm run build`.
- Commits: conventional, ≤5 files, independently valid.
- `public.py` stays an allowlist; field-set pin tests change before fields.
  Never public: `notes`, `owned_format`, `source_metadata`, `similar_games`,
  `external_source`, `external_id`, `is_public`, `cart_id`, `format_source`,
  `region`, `acquired_at`, `pinned_at`.
- `platform`, `format_source` and `pinned_at` are never accepted from a
  request body.
- Tokens only in CSS; nothing hover-only; non-text marks with names are
  `role="img"`.
- Literal routes (`/bulk`, `/refresh-metadata/bulk`) are declared before
  `/{item_id}`.
- `release_status` 0 means released; never test it for truthiness.
- Time to beat is stored in hours to one decimal; absent when there is no
  data, never zero.

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `backend/migrations/versions/0003_add_copy_columns.py` | the migration | 1 |
| `backend/models.py` | columns, `PhysicalFormat`, `FormatSource`, `Completeness` | 1 |
| `backend/tests/test_migration_0003.py` | backfill and round trip | 1 |
| `backend/scripts/record_igdb_fixtures.py`, `backend/scripts/README.md` | owner-run fixture recorder | 2 |
| `backend/formats.py`, `backend/tests/test_formats.py` | copy-field write rules | 3 |
| `backend/sources/igdb.py` | `PLATFORM_NAMES`, N64, snapshot, `fetch_many`, time to beat | 3, 6 |
| `backend/items.py` | request/response models, rules wired, bulk set, bulk refresh | 4, 7 |
| `backend/tests/test_items_copy_fields.py` | write paths and bulk set | 4 |
| `backend/importer.py`, `frontend/src/pages/AdminImport.jsx` (+ tests) | platform on imports | 5 |
| `backend/tests/test_sources_igdb.py`, `backend/tests/fixtures/igdb_*` | parser against live fixtures | 6 |
| `backend/tests/test_items_refresh_bulk.py`, `backend/sources/README.md` | bulk refresh | 7 |
| `backend/public.py`, `backend/tests/test_public.py` | E7b public fields and stats | 8 |
| `frontend/src/components/PosterCard.jsx` (+ test), `frontend/src/index.css` | format mark, ribbon | 9 |
| `frontend/src/lib/shelf.js` (+ test), `frontend/src/pages/Collection.jsx` (+ test) | platform filter, On cartridge line | 10 |
| `frontend/src/pages/Item.jsx` (+ test) | copy chips, time-to-beat tile | 11 |
| `frontend/src/pages/AdminItem.jsx` (+ test), `frontend/src/components/ItemForm.jsx` | form fields | 12 |
| `frontend/src/pages/AdminCollection.jsx` (+ test) | selection, bulk set, refresh, platform chips | 13 |
| `scripts/smoke.sh`, `CLAUDE.md` | smoke and docs | 14 |

---

## Zone 1 — the migration

### Task 1: Migration `0003` and the models

**Files:** Create `backend/migrations/versions/0003_add_copy_columns.py`,
`backend/tests/test_migration_0003.py`. Modify `backend/models.py`.

**Interfaces produced**

```python
class PhysicalFormat(str, enum.Enum):
    GAME_CARD = "game_card"; GAME_KEY_CARD = "game_key_card"
    CODE_IN_BOX = "code_in_box"; DISC = "disc"

class FormatSource(str, enum.Enum):
    CART_ID = "cart_id"; PHOTO = "photo"; REGISTRY = "registry"
    STORE_TEXT = "store_text"; STORE_POLICY = "store_policy"
    PLATFORM_POLICY = "platform_policy"; MANUAL = "manual"

class Completeness(str, enum.Enum):
    LOOSE = "loose"; BOXED = "boxed"; CIB = "cib"; SEALED = "sealed"
```

`Item` gains `release_date: date | None`, `pinned_at: datetime | None`
(timestamptz), `acquired_at: date | None`, `platform_id: int | None`
(SmallInteger), `platform: str | None` (String(60)), `physical_format`,
`format_source`, `completeness` (Enum with `values_callable` as the existing
enums use; enum type names `physical_format`, `format_source`,
`completeness`), `cart_id: str | None` (String(20)), `region: str | None`
(String(4)). All nullable, no defaults.

**Migration shape** (the `0002` pattern: `postgresql.ENUM(..., create_type=False)`,
created explicitly in `upgrade`, dropped explicitly in `downgrade`):

```python
revision = "0003"; down_revision = "0002"

def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in (physical_format, format_source, completeness):
        enum_type.create(bind, checkfirst=True)
    op.add_column("items", sa.Column("release_date", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("items", sa.Column("acquired_at", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("platform_id", sa.SmallInteger(), nullable=True))
    op.add_column("items", sa.Column("platform", sa.String(length=60), nullable=True))
    op.add_column("items", sa.Column("physical_format", physical_format, nullable=True))
    op.add_column("items", sa.Column("format_source", format_source, nullable=True))
    op.add_column("items", sa.Column("cart_id", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("region", sa.String(length=4), nullable=True))
    op.add_column("items", sa.Column("completeness", completeness, nullable=True))
    # The collection was bulk-imported on one or two days, so created_at is
    # the best available proxy until the owner corrects it.
    op.execute("UPDATE items SET acquired_at = created_at::date")

def downgrade() -> None:
    for column in ("completeness", "region", "cart_id", "format_source",
                   "physical_format", "platform", "platform_id",
                   "acquired_at", "pinned_at", "release_date"):
        op.drop_column("items", column)
    bind = op.get_bind()
    for enum_type in (completeness, format_source, physical_format):
        enum_type.drop(bind, checkfirst=True)
```

**Acceptance criteria**
- [ ] The existing `test_upgrade_produces_the_schema_the_models_describe`
      and `test_downgrade_then_upgrade_is_clean` pass with the new head (they
      diff the migrated schema against `models.py`, so a column in one and
      not the other fails them).
- [ ] `test_migration_0003.py`: upgrading to `0002`, inserting a row with a
      known `created_at`, then upgrading to `0003` leaves `acquired_at` equal
      to that date; downgrading to `0002` removes the ten columns and the
      three types (`SELECT 1 FROM pg_type WHERE typname = …` is empty).
      Reuse the `_alembic` helper and `clean_database` fixture pattern from
      `test_migrations.py`.
- [ ] `test_schema_check.py` passes unchanged against head `0003`.

**Steps**
1. Write `test_migration_0003.py`; run from `backend/`; expect failure (no
   revision `0003`).
2. Add the enums and columns to `models.py`; write the revision.
3. `./.venv/bin/pytest -q` green; format; lint; frontend suite and build.
4. **Commit:** `feat(tracker): add migration 0003 with the copy columns`

**CHECKPOINT — owner reviews the migration before anything depends on it.**

---

## Zone 2 — everything else

### Task 2: The fixture recorder (owner runs it)

**Files:** Create `backend/scripts/record_igdb_fixtures.py`,
`backend/scripts/README.md`.

**Behaviour.** `python scripts/record_igdb_fixtures.py GAME_ID [GAME_ID ...]
--no-ttb-id ID` from `backend/`, using `.venv`. It builds `Config` the way
`main.py` does and an `IgdbSource`, then calls, through the adapter's own
token and throttle:

- `/v4/games` for the given ids with the Task 6 field list (the script holds
  its own copy of the new `FIELDS` string, since Task 6 has not run yet) →
  `tests/fixtures/igdb_games_e7b.json`
- `/v4/game_time_to_beats` `where game_id = (ids + no-ttb-id); fields
  game_id,hastily,normally,completely,count; limit 100;` →
  `tests/fixtures/igdb_time_to_beats.json`
- `/v4/platforms` `where slug = ("n64","switch-2","switch"); fields
  id,name,slug; limit 10;` → `tests/fixtures/igdb_platforms.json`

It writes response bodies only, pretty-printed, and prints the three paths
and row counts — never the token, client id or secret. It calls a private
helper that Task 6 generalises, so Task 2 adds `endpoint: str = "games"` to
`IgdbSource._query` (URL becomes `f"{API_ROOT}/{endpoint}"`, the log line
names the endpoint) — the only change to `igdb.py` here, covered by one new
test in `tests/test_sources_igdb.py` asserting the URL for a non-default
endpoint. That makes this task 4 files: the script, its README,
`sources/igdb.py`, `tests/test_sources_igdb.py`.

The README says what the script does and why (spec §2: the docs and
third-party code disagree on several fields), the exact command, that it
needs `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` in `backend/.env`, that it writes
bodies only, and that the output is committed as test fixtures.

**Acceptance criteria**
- [ ] `_query` with `endpoint="platforms"` posts to
      `https://api.igdb.com/v4/platforms`; the default is unchanged.
- [ ] The script has no network call at import, so the suite can import it;
      a test is not required beyond `python -m py_compile`.
- [ ] **Commit:** `feat(igdb): add an owner-run fixture recorder and a
      per-endpoint query`

**Owner action (not blocking Tasks 3–5):** pick one Switch 2, one Switch and
one N64 game from the collection and one obscure game id, run the command in
the README, and say when done. The assistant commits the three JSON files in
Task 6. **Task 6 does not start until they exist.**

### Task 3: `formats.py` — the write rules, pure

**Files:** Create `backend/formats.py`, `backend/tests/test_formats.py`.
Modify `backend/sources/igdb.py` (`PLATFORM_NAMES`, N64 keys).

**Interfaces produced**

```python
# sources/igdb.py
PLATFORM_NAMES: dict[int, str] = {
    508: "Nintendo Switch 2", 130: "Nintendo Switch", 4: "Nintendo 64",
    167: "PlayStation 5", 48: "PlayStation 4", 169: "Xbox Series X|S",
    49: "Xbox One", 6: "PC", 37: "Nintendo 3DS", 41: "Wii U",
}
# PLATFORM_IDS gains "nintendo 64": 4, "n64": 4

# formats.py
HOME_REGION = "USA"
KEY_CARD_PLATFORMS = frozenset({508})
CARTRIDGE_ERA_PLATFORMS = frozenset({4})
CART_ID_PATTERN = re.compile(r"^L[PBNA]-[A-Z0-9]{5}-[A-Z0-9]{3}-[0-9A-Z]$")

class CopyFieldError(ValueError):
    """A copy-field change the rules refuse; the message is shown as is."""

def apply_copy_fields(changes: dict, row: Item | None) -> dict:
    """Returns `changes` with platform and format_source derived.

    `changes` holds only the keys the request set (exclude_unset). `row` is
    the current row for a PATCH or bulk set, None for a create. Never mutates
    its arguments."""
```

**Rules, in this order** (spec §4):
1. `platform_id` present: `None` → sets `platform = None`; an id in
   `PLATFORM_NAMES` → sets `platform`; anything else → `CopyFieldError(
   "Unknown platform id 999.")`.
2. `cart_id` present and not `None`: strip, upper-case; fails
   `CART_ID_PATTERN` → `CopyFieldError("That cart ID does not look like
   LX-XXXXX-XXX-X.")`. Prefix `LP` → format `game_key_card`; `LB`/`LN` →
   `game_card`; `LA` with the effective platform (body `platform_id`, else
   row's) equal to 508 → `CopyFieldError("LA is a Switch 1 cartridge, so
   the platform looks wrong.")`, otherwise `game_card`. The third segment
   sets `region` unless `region` is in `changes`. `format_source =
   cart_id`.
3. Conflict: the effective cart ID (body's, else row's, ignoring a body
   `cart_id: None`) implies a format, and `physical_format` in `changes`
   differs → `CopyFieldError("The cart ID says Game-Key Card; clear the
   cart ID to record a different format.")` (name the implied format).
4. `physical_format` set, not `None`, and no effective cart ID →
   `format_source = manual`.
5. `physical_format: None` → `format_source = None`, `cart_id = None`.
   `cart_id: None` alone with an effective format → `format_source =
   manual`; with no format → `format_source = None`.
6. `region` present and not `None`: strip, upper-case, must be 2–4 letters,
   else `CopyFieldError("Region must be 2 to 4 letters, like USA.")`.
7. `completeness` passes through (validated by the enum).
8. `platform`, `format_source` in the input `changes` are discarded before
   the rules run.

**Acceptance criteria** (`test_formats.py`, no database; `row` built as an
unsaved `Item`)
- [ ] One test per rule above, including: each cart prefix; `LA` on 508
      refused, `LA` on 130 accepted as `game_card`; lower-case and padded
      input normalised; region from segment 3; body region beats segment;
      conflict refused with the implied format named; a body format equal to
      the implied one accepted; `physical_format: None` clears source and
      cart; `cart_id: None` downgrades the source to `manual`; unknown
      platform refused; `platform`/`format_source` in input discarded; inputs
      not mutated.
- [ ] `PLATFORM_NAMES` has a name for every value in `PLATFORM_IDS`
      (test in `test_formats.py`).
- [ ] **Commit:** `feat(tracker): add the copy-field write rules`

### Task 4: Wire the rules into every write path; bulk set

**Files:** Modify `backend/items.py`. Create
`backend/tests/test_items_copy_fields.py`.

**Interfaces produced**
- `ItemIn`, `ItemPatch` gain `platform_id: int | None`, `physical_format:
  PhysicalFormat | None`, `cart_id: str | None` (max 20), `region: str |
  None` (max 4), `completeness: Completeness | None`, `acquired_at: date |
  None`, `release_date: date | None`. Not `platform`, `format_source`,
  `pinned_at`.
- `ItemOut` gains all ten new columns (admin-only; this is not the public
  model).
- `CopyFieldError` → `HTTPException(422, detail=str(error))` via a helper
  `_copy_fields(changes, row)`.
- `BulkSetIn(ids: list[uuid.UUID] = Field(min_length=1, max_length=500),
  changes: BulkSetChanges)` where `BulkSetChanges` has `platform_id`,
  `physical_format`, `region`, `completeness` (all optional; at least one set
  → else 422). `BulkSetOut(updated: int)`.
- `PATCH /api/items/bulk` → `BulkSetOut`, declared before `/{item_id}`.

**Wiring**
- `create_item`: `values = _copy_fields(payload.model_dump(exclude_unset=
  True), None)` merged over the defaults; the favourites check stays first.
- `create_items_bulk`: each row's values pass `_copy_fields(values, None)`;
  one refusal fails the batch with 422 naming the row's title.
- `update_item`: `changes = _copy_fields(changes, item)` before `setattr`.
- `bulk_set`: loads the rows `WHERE id IN ids`, applies `_copy_fields(
  changes, row)` to each, collects `(title, message)` for every refusal; any
  refusal → 422 `{"detail": "Could not update: Title A (reason); Title B
  (reason)."}` and nothing is written; otherwise sets and commits once.
  Unknown ids are ignored; `updated` counts rows changed.

**Acceptance criteria** (`test_items_copy_fields.py`, real Postgres, the
`client_for` pattern from `test_items_favorites.py`)
- [ ] PATCH `platform_id: 508` stores `platform = "Nintendo Switch 2"`;
      a body `platform: "Anything"` is ignored.
- [ ] PATCH `cart_id: "lp-aac4b-usa-0"` stores `LP-AAC4B-USA-0`,
      `physical_format = game_key_card`, `format_source = cart_id`,
      `region = USA`.
- [ ] PATCH with a bad cart ID → 422 with the message; row unchanged.
- [ ] PATCH `physical_format: game_card` on a row with an `LP` cart → 422;
      on a row without a cart → `format_source = manual`.
- [ ] PATCH `physical_format: null` clears source and cart.
- [ ] POST create and POST bulk create apply the same rules (one case each).
- [ ] Bulk set platform on three rows → `{updated: 3}`, `platform` resolved.
- [ ] Bulk set `physical_format: game_card` where one row has an `LP` cart →
      422 naming that title; **no** row changed.
- [ ] Bulk set with no fields → 422; with 501 ids → 422; unauthenticated →
      401.
- [ ] `format_source`, `pinned_at` in a body are ignored on every path.
- [ ] **Commit:** `feat(items): apply the copy-field rules on every write
      and add bulk set`

### Task 5: Platform on imported rows

**Files:** Modify `backend/importer.py`, `backend/tests/test_importer.py`,
`frontend/src/pages/AdminImport.jsx`, `frontend/src/pages/AdminImport.test.jsx`.

**Behaviour.** Each detection row the importer returns gains
`platform_id: int | None = platform_id(detection.platform)` beside the
existing `detected_platform`. `AdminImport` includes `platform_id` in the
rows it commits to `POST /api/items/bulk` (Task 4 resolves `platform`). A
detected platform the map does not know stays `None` — never guessed.

**Acceptance criteria**
- [ ] Importer test: "Nintendo Switch 2" → 508, "N64" → 4, "Sega Saturn" →
      `None`.
- [ ] AdminImport test: the committed bulk body carries `platform_id` from
      the detection.
- [ ] **Commit:** `feat(importer): record the detected platform on imported
      rows`

### Task 6: The deeper IGDB snapshot (after the owner's fixture run)

**Files:** Modify `backend/sources/igdb.py`, `backend/tests/test_sources_igdb.py`.
Add `backend/tests/fixtures/igdb_games_e7b.json`,
`igdb_time_to_beats.json`, `igdb_platforms.json`.

**First step — read the fixtures and confirm:** N64's id is 4 and Switch 2's
is 508 in `igdb_platforms.json`; the shape of `game_status` on a live game
(object with `status` string, or id); that the obscure game is **absent**
from `igdb_time_to_beats.json`. Any difference changes the constants or
parser before code is written, and is recorded in the zone summary.

**Interfaces produced**
- `FIELDS` gains `themes.name,themes.id,keywords.name,game_modes.name,
  player_perspectives.name,genres.id,platforms.id,hypes,game_status.status`.
- `_parse_detail(row, time_to_beat: dict | None = None) -> SourceDetail`;
  `source_metadata` adds `themes`, `keywords` (first 10), `game_modes`,
  `player_perspectives`, `genre_ids`, `theme_ids`, `platform_ids`, `hypes`
  (only when an int), `release_status` (only when present; stored as
  returned), `first_release_date` (ISO date via a new `date_from_unix`),
  `time_to_beat` (only when given).
- `_time_to_beat(row: dict) -> dict | None` — `{hastily, normally,
  completely, count}` with each seconds value → `round(v / 3600, 1)`; keys
  whose value is missing or 0 are dropped; `None` if no duration remains.
- `async def _times_to_beat(self, ids: list[int]) -> dict[int, dict]` —
  one `game_time_to_beats` query for up to 100 ids, keyed by `game_id`.
- `fetch(external_id)` also calls `_times_to_beat([id])`.
- `async def fetch_many(self, external_ids: list[str]) -> list[SourceDetail]`
  — digits only (others skipped), batches of 100, each batch one `/games`
  query with `where id = (…); limit 100;` and one `_times_to_beat`; the
  throttle already spaces calls at 0.25 s.

**Acceptance criteria** (parser tests read the fixtures; network tests use
the existing fake-transport pattern in `test_sources_igdb.py`)
- [ ] Every new key is present for the Switch 2 fixture game; `keywords`
      has at most 10 entries.
- [ ] `release_status` of 0 is stored as 0 (not dropped); a game without
      `game_status` has no `release_status` key.
- [ ] `first_release_date` is the ISO date of the fixture's epoch.
- [ ] `time_to_beat` hours match the fixture's seconds / 3600 to one
      decimal; the obscure game has no `time_to_beat` key.
- [ ] `fetch_many` of 150 ids makes 2 `/games` and 2 `game_time_to_beats`
      requests with `limit 100;`; non-digit ids are skipped.
- [ ] `PLATFORM_IDS`/`PLATFORM_NAMES` values agree with
      `igdb_platforms.json`.
- [ ] **Commit:** `feat(igdb): deepen the snapshot with themes, ids, status
      and time to beat`

### Task 7: Bulk refresh, and release dates on every refresh

**Files:** Modify `backend/items.py`, `backend/sources/README.md`,
`backend/sources/tmdb.py`, `backend/tests/test_sources_tmdb.py`. Create
`backend/tests/test_items_refresh_bulk.py`.

**Interfaces produced**
- `_apply_detail(item, detail)` additionally sets `item.release_date` from
  `detail.source_metadata["first_release_date"]` (IGDB) or
  `["release_date"]` (TMDB) when present and parseable, overwriting — the
  spec's source-of-truth rule for linked rows.
- `_backfill_platform(item)` — only when `item.platform_id is None` and the
  snapshot's `platform_ids` has exactly one entry that is in
  `PLATFORM_NAMES`: sets `platform_id` and `platform`.
- `RefreshBulkOut(updated: int, skipped: int, failed: int)`.
- `POST /api/items/refresh-metadata/bulk?type=game` → `RefreshBulkOut`,
  declared before `/{item_id}`. Only `type=game` is accepted (422 otherwise).
  Loads IGDB-linked games, calls `adapter.fetch_many` per batch of 100 in a
  try/except per batch (`SourceError` → that batch's rows count as
  `failed`), applies `_apply_detail` and `_backfill_platform`, commits once.
  Linked rows the adapter returns nothing for count as `skipped`.
- `TmdbSource`'s snapshot does not carry `release_date` today (checked:
  `sources/tmdb.py` `_parse_detail` stores genres, description, scores,
  runtime and language only). Add `"release_date": payload.get("release_date")
  or None` to it, with a line in `test_sources_tmdb.py` asserting it from the
  existing `tmdb_movie.json` fixture.

**Acceptance criteria** (a fake adapter registered in the test, as
`test_items_metadata.py` does)
- [ ] Two linked games refreshed: snapshot, creator, cover and
      `release_date` updated; a single-platform game gains a platform; a
      multi-platform game does not; a game with an owner-set platform keeps
      it.
- [ ] Rating, status, favourite, notes, format, cart ID, region,
      completeness, visibility, `acquired_at`, `started_at`, `finished_at` are
      untouched (assert all on one row).
- [ ] A batch whose `fetch_many` raises counts its rows as `failed`; other
      batches still update.
- [ ] `type=movie` → 422; unauthenticated → 401; `/refresh-metadata/bulk`
      is not swallowed by `/{item_id}`.
- [ ] Single-item `POST /{id}/refresh-metadata` now sets `release_date`.
- [ ] `sources/README.md` documents `fetch_many`, time to beat and the
      fixture recorder.
- [ ] **Commit:** `feat(items): add a batched metadata refresh for games`

### Task 8: Public API — the E7b fields

**Files:** Modify `backend/public.py`, `backend/tests/test_public.py`.

**Interfaces produced**
- `PUBLIC_METADATA_FIELDS` gains `"time_to_beat"` (read to derive
  `time_to_beat_hours`, never serialised on the list);
  `PUBLIC_DETAIL_METADATA_FIELDS` gains `"themes"`.
- `PublicItemOut` gains `release_date: date | None`, `platform: str | None`,
  `physical_format: PhysicalFormat | None`, `completeness: Completeness |
  None`, `time_to_beat_hours: int | None` (`round(normally)` or None).
- `PublicItemDetailOut` gains `themes: list[str]`, `time_to_beat:
  PublicTimeToBeat | None` (`hastily`, `normally`, `completely`: `float |
  None`, `count: int | None`).
- `PublicStatsOut` gains `by_platform: dict[str, int]` and
  `by_format: dict[str, PublicFormatCounts]` keyed by `str(platform_id)` for
  `KEY_CARD_PLATFORMS` only; `PublicFormatCounts(game_card, game_key_card,
  code_in_box, unknown, total)`, over public rows with
  `owned_format IS DISTINCT FROM 'none'` and that `platform_id`. `disc`
  counts in `total` only. Computed in SQL beside the existing aggregates.

**Acceptance criteria**
- [ ] The two field-set pins are edited first, then fail, then pass.
- [ ] `NEVER_PUBLIC` gains `cart_id`, `format_source`, `region`,
      `acquired_at`, `pinned_at`; a seeded row carrying all five leaks none.
- [ ] `time_to_beat_hours` rounds 11.6 → 12 and is None without data.
- [ ] `by_format` for a seed of Switch 2 rows (2 card, 1 key card, 1 NULL,
      1 wanted, 1 private) is `{"508": {game_card: 2, game_key_card: 1,
      code_in_box: 0, unknown: 1, total: 4}}`; a Switch row is absent from
      it and present in `by_platform`.
- [ ] The empty-collection stats test gains `by_platform: {}`,
      `by_format: {}`.
- [ ] **Commit:** `feat(public): publish platform, format, release date and
      time to beat`

### Task 9: Format mark and Upcoming ribbon on `PosterCard`

**Files:** Modify `frontend/src/components/PosterCard.jsx`,
`PosterCard.test.jsx`, `frontend/src/index.css`.

**Interfaces produced**
- `PosterCard` reads `item.physical_format`, `item.platform_id` (admin rows)
  or `item.platform` (public rows), and `item.release_date`. A Switch 2 copy
  is `platform_id === 508 || platform === 'Nintendo Switch 2'`.
- Format mark (bottom-right of `.poster-art`, `--text-muted`, `role="img"`):
  `game_key_card` → "Game-Key Card" (key glyph); `code_in_box` → "Code in a
  box" (key glyph); Switch 2 with NULL format → "Format not recorded" ("?");
  otherwise nothing.
- Ribbon: `release_date` after today (local date via `localToday`) → a strip
  along the poster's bottom edge, text "Coming Mar 2027" (UTC month
  formatting, as `Item.jsx` does).

**Acceptance criteria**
- [ ] Mark present with the right name for each case; absent for a full
      cartridge and for a non-Switch-2 NULL.
- [ ] Ribbon for a future date, none for today, past or NULL (tests pin the
      date with `vi.useFakeTimers({ toFake: ['Date'] })`).
- [ ] CSS: `.format-mark`, `.upcoming-ribbon` from tokens only; the ribbon
      sits inside the poster and does not cover the status mark or heart.
- [ ] **Commit:** `feat(shelf): mark key-card copies and upcoming releases on
      the poster`

### Task 10: Platform chips and the "On cartridge" line (public)

**Files:** Modify `frontend/src/lib/shelf.js`, `shelf.test.js`,
`frontend/src/pages/Collection.jsx`, `Collection.test.jsx`.

**Interfaces produced**
- `NO_FILTER` gains `platform: null`; `filterItems` ANDs `item.platform ===
  value.platform` when set.
- `Collection` adds a Platform chip group from `countBy(items, 'platform')`
  (NULL excluded), rendered only when two or more platforms have items.
- `OnCartridge({ byFormat })` inside `Collection.jsx`: one line per key in
  `stats.by_format` where `game_card + game_key_card + code_in_box > 0`,
  "Nintendo Switch 2 · 61 on cartridge · 3 Game-Key Cards · 4 not recorded,
  of 68" (parts with a zero count omitted; the platform name from a
  `508: 'Nintendo Switch 2'` map beside the component).

**Acceptance criteria**
- [ ] `filterItems` platform alone and combined; `NO_FILTER` has `platform`.
- [ ] Chips hidden with one platform, shown with two; clicking filters.
- [ ] On-cartridge line text for a fixture; absent when every recorded count
      is 0 or `by_format` is empty.
- [ ] Existing fixtures gain the new fields; every existing test passes.
- [ ] **Commit:** `feat(shelf): filter by platform and show the on-cartridge
      line`

### Task 11: Item page — copy chips and time to beat

**Files:** Modify `frontend/src/pages/Item.jsx`, `Item.test.jsx`.

**Behaviour.** Chips: `platform` first (unmuted), genres, `themes` (muted),
other platforms from `platforms` excluding the copy's own (muted), then the
format chip — `game_card` "Full game on cartridge", `game_key_card`
"Game-Key Card", `code_in_box` "Code in a box", `disc` "Disc", NULL on
Switch 2 "Format not recorded", otherwise none — and completeness when set
(`loose` "Loose", `boxed` "Boxed", `cib` "Complete in box", `sealed`
"Sealed"). A "Time to beat" tile when `time_to_beat` has `normally` or
`completely`: "≈ 12 h" for normally, "· 18 h to complete" when both;
absent otherwise.

**Acceptance criteria**
- [ ] Chip order and muting for a fixture with every field; own platform not
      repeated among other platforms.
- [ ] Each format and completeness label; no format chip for a non-Switch-2
      NULL.
- [ ] Time-to-beat tile variants: both, normally only, none.
- [ ] **Commit:** `feat(shelf): show the copy's platform, format and time to
      beat on the item page`

### Task 12: Edit page and create form fields

**Files:** Modify `frontend/src/pages/AdminItem.jsx`, `AdminItem.test.jsx`,
`frontend/src/components/ItemForm.jsx`.

**Behaviour.**
- The option lists live as constants at the top of `ItemForm.jsx` and are
  exported for `AdminItem`: `PLATFORM_OPTIONS` (N64, Switch, Switch 2 first,
  then the rest of the server's `PLATFORM_NAMES` in the same order — the list
  is duplicated deliberately and a comment points at `sources/igdb.py`),
  `FORMAT_OPTIONS`, `COMPLETENESS_OPTIONS`.
- `AdminItem` `EDITABLE` gains `platform_id`, `physical_format`, `cart_id`,
  `region`, `acquired_at`, `release_date`, `completeness`. `release_date` is
  shown with a note that a refresh overwrites it on linked items (spec §3). Empty strings are sent as `null`
  (as the form already does for other fields). Completeness renders only
  when `platform_id` is 4. Region shows placeholder "USA". The 422 path
  already shows `detail` for 409; extend it to 422 so rule messages show in
  words.
- `ItemForm` (create) gains platform and format selects; the create body
  sends `platform_id`/`physical_format` or omits them.

**Acceptance criteria**
- [ ] Changing platform and format sends exactly those keys (the
      changed-fields rule).
- [ ] A 422 detail is shown in the alert and the form keeps its values.
- [ ] Completeness hidden for Switch, shown for N64.
- [ ] Create form sends `platform_id` as a number.
- [ ] **Commit:** `feat(admin): edit platform, format, cart ID and region`

### Task 13: List view — selection, bulk set, refresh; admin platform chips

**Files:** Modify `frontend/src/pages/AdminCollection.jsx`,
`AdminCollection.test.jsx`, `frontend/src/index.css`.

**Behaviour.**
- List view: a checkbox column (`aria-label="Select Title"`) and a
  select-all header checkbox; a Platform column. A bar above the table when
  one or more rows are selected: "N selected · Set platform [select] · Set
  format [select] · Apply". Apply sends one `PATCH /api/items/bulk` with the
  chosen field(s), then reloads and clears the selection; a 422 shows its
  detail in the sticky alert and keeps the selection.
- "Refresh game metadata" button beside the bulk publish controls, in both
  views: `POST /api/items/refresh-metadata/bulk?type=game`, busy state while
  running, then "Updated 60 · skipped 3 · failed 0" as a status line, then
  reload.
- Shelf view: the Platform chip group as on the public page (from the admin
  rows' `platform`).

**Acceptance criteria**
- [ ] Selecting two rows and applying a platform sends `{ids: [a, b],
      changes: {platform_id: 508}}`.
- [ ] Select-all selects every row; the bar shows the count.
- [ ] A 422 keeps the selection and shows the detail.
- [ ] Refresh shows the three counts and reloads.
- [ ] Admin platform chips filter the shelf.
- [ ] Existing list tests pass with the new columns.
- [ ] **Commit:** `feat(admin): bulk set platform and format, and refresh
      game metadata`

### Task 14: Smoke and docs

**Files:** Modify `scripts/smoke.sh`, `CLAUDE.md`.

**Acceptance criteria**
- [ ] Smoke: `GET /api/public/items` body contains `"platform"` and
      `"physical_format"`; stats contains `"by_format"`; the leak grep adds
      `cart_id|format_source|region|acquired_at|pinned_at`;
      `PATCH /api/items/bulk` and `POST /api/items/refresh-metadata/bulk?type=game`
      unauthenticated → 401. `bash -n` passes.
- [ ] `CLAUDE.md`: Media tracker gains migration `0003` and the deploy order
      (apply before merge; refresh once; bulk set), `formats.py` as the one
      place copy fields are decided, and the fixture recorder; the TODO marks
      E7b done and E8a next.
- [ ] **Commit:** `docs(tracker): cover E7b in smoke and docs`

---

## Parallel-safe flags

None. Tasks 9–11 touch disjoint files but share fixtures and CSS; executed
sequentially.

## Automated environment tests

`scripts/smoke.sh` exists and runs unauthenticated against production; Task
14 extends it. The admin paths (bulk set, refresh, edit) are covered by
pytest and vitest only.

**Passing means:** full backend suite green (from `backend/`), full frontend
suite green, `npm run build` clean, `ruff format --check` and `ruff check`
clean, prettier and eslint clean, no raw hex in `.jsx` outside existing test
strings and none in CSS outside the token blocks; after the owner applies
`0003` to Neon and merges, `./scripts/smoke.sh https://joey-haas.dev
https://api.joey-haas.dev` green and no new errors in the Render logs; the
owner's first "Refresh game metadata" press reports `failed: 0`.

**Manual pass (owner):** press Refresh once and read the counts; bulk-set
platform and format for the Switch 2 games in List view; confirm the "?"
mark disappears as formats are set and the On-cartridge line appears on
`/collection`; open a Switch 2 item page and see the format chip and time to
beat; enter one real cart ID on the edit page and confirm the format and
region fill.

## Zones

```
Zone 1 (auto): task 1 (migration 0003, models, migration tests)
CHECKPOINT — owner reviews the migration
Zone 2 (auto): tasks 2–14 (task 6 waits for the owner's fixture run)
CHECKPOINT — batch review + finish gate
```

Zone 1 is its own zone because it is a migration (the workflow's mandatory
carve-out). Zone 2 contains no infra, CI, env or destructive change; the
smoke script edit is application-level verification.

## Deploy order (owner, after the finish gate)

1. `cd backend && DATABASE_URL_DIRECT=… ./.venv/bin/alembic upgrade head`
   against Neon, as for `0002`.
2. Merge; Render deploys; `schema_check` confirms.
3. Press "Refresh game metadata" once.
4. Bulk-set platform and format in List view.
5. Smoke and logs.
