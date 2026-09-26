# Tracker E7c — Physical Catalogue — Implementation Plan

Spec: `docs/planning/2026-09-23-tracker-e7c-design.md` (wins over the parent
`2026-09-22-tracker-enhancement-design.md` §5.4–§5.8 where they differ).
Revised 2026-09-24 with the spec: the registry is read through the Google
Sheets API, and Limited Run's closed-pre-order handles are not walked.
Revised 2026-09-25 from the recorded fixtures (Execution summary, at the
end): twelve stores, the registry's two details tabs, and the edition key.

**Goal:** Know which games exist physically, and as what, for games the owner
does not own: read the r/NSCollectors registry, the `switch2-tracker`
cross-check, all twelve boutique stores and IGDB's N64 catalogue into five
new tables; resolve every row to an IGDB id through a match cache; collapse a
game's editions into one honest format with a pure, shared rule; sync registry
formats onto owned items without ever touching what the owner recorded; and
give it all an admin page with manual refresh, a Needs match queue and a
disagreements list.

**Architecture:** `backend/physical_sources/` holds pure parsers (`registry`,
`tracker`, `shopify`, `woocommerce`, `format`, `parse`, `courtesy`,
`collapse`) that import nothing from FastAPI or SQLAlchemy and are tested on
recorded fixtures; `catalogue.py`, `resolve.py` and `sync.py` are the database
layer; `physical_routes.py` is the router. `STORES` in `stores.py` is data.
Migration `0005` adds `catalogue_games`, `physical_editions`,
`store_listings`, `catalogue_matches`, `catalogue_runs`. `formats.py` gains
the one sanctioned automated writer, `apply_registry_format`.

**Tech stack:** FastAPI, SQLAlchemy async, Alembic, Postgres 18, `httpx2`,
pytest against a real Postgres; React 19, react-router v8, Vitest + Testing
Library; plain CSS tokens.

**Branch:** `tracker-e7c` (worktree
`~/Developer/joey-haas.dev-worktrees/tracker-e7c`, cut from `origin/main` at
`93c8518`).

## Global constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Backend commands run from `backend/`; gate every commit on exit codes.
- `ruff format . && ruff check .` and `npm run format && npm run lint` after
  every file change; full `pytest`, `vitest`, `npm run build` before each
  commit.
- Commits: conventional, **five files or fewer**, independently valid. The
  owner's fixture commit (Task 1) is data-only and exempt, as the IGDB
  fixtures were.
- Migrations are additive (`backend/migrations/README.md`); `0005` creates
  tables and types only.
- **No parser before its fixture.** Every `parse_*` function is written
  against a file in `tests/fixtures/physical/` recorded by Task 1.
- Pure modules (`physical_sources/{base,limits,courtesy,format,parse,registry,
  tracker,shopify,woocommerce,stores,collapse}.py`, `formats.py`) import
  nothing from FastAPI or SQLAlchemy. Only `shopify.py`, `woocommerce.py`,
  `registry.py`, `tracker.py`, `courtesy.py` and `platform_policy.py` touch
  the network, and only in one `fetch`-shaped function each.
- Every external request: `USER_AGENT` from `limits.py`, the per-host
  `Throttle` at `REQUESTS_PER_SECOND = 2`, the courtesy check first.
- The registry is read through the Google Sheets API with
  `GOOGLE_SHEETS_API_KEY`, an optional `config.py` field never added to
  `_REQUIRED`; the CSV export URL appears nowhere in the code. A missing key
  records `sheets_not_configured` on the registry run and nothing else.
- Constants live in `physical_sources/limits.py`: `REQUESTS_PER_SECOND = 2`,
  `PAGE_SIZE_SHOPIFY = 250`, `PAGE_SIZE_WOO = 100`, `RESOLVE_LIMIT = 100`,
  `SNAPSHOT_MAX_AGE_DAYS = 30`, `HTML_RECHECK_DAYS = 7`, `SHORT_RUN_RATIO =
  0.5`, `NEEDS_ATTENTION_AFTER = 3`, `CATALOGUE_PLATFORMS = {508, 130, 4}`.
- `formats.py`: `CARTRIDGE_ONLY_PLATFORMS = frozenset({4, 130})`;
  `apply_registry_format` raises `CopyFieldError` for `manual`, `cart_id`,
  `photo` rows; `apply_copy_fields` accepts `edition_id` and never a
  registry cart ID.
- Enum names and values exactly as the spec §1 tables: `release_precision`,
  `listing_availability`, `match_confidence`, `match_decision`; the existing
  `physical_format` and `format_source` are reused, never altered.
- Nothing from the catalogue is public; the leak tests are extended before
  any route exists.
- CSS tokens only; nothing hover-only; named non-text marks `role="img"`;
  `useMediaQuery` for anything viewport-dependent.

## File map

| File | Tasks |
|---|---|
| `backend/scripts/record_physical_fixtures.py`, `backend/scripts/README.md`, `backend/tests/fixtures/physical/*` | 1 |
| `backend/models.py`, `backend/migrations/versions/0005_add_catalogue.py`, `backend/tests/test_migrations.py`, `backend/tests/test_schema_check.py` | 2 |
| `backend/physical_sources/__init__.py`, `base.py`, `limits.py`, `README.md` | 3 |
| `backend/physical_sources/courtesy.py`, `backend/tests/test_physical_courtesy.py` | 4 |
| `backend/physical_sources/format.py`, `backend/tests/test_physical_format.py` | 5 |
| `backend/physical_sources/parse.py`, `backend/tests/test_physical_parse.py` | 6 |
| `backend/physical_sources/registry.py`, `backend/tests/test_physical_registry.py`, `backend/config.py`, `backend/tests/test_config.py` | 7 |
| `backend/physical_sources/tracker.py`, `backend/tests/test_physical_tracker.py` | 8 |
| `backend/physical_sources/stores.py`, `shopify.py`, `backend/tests/test_physical_shopify.py` | 9, 10 |
| `backend/physical_sources/woocommerce.py`, `backend/tests/test_physical_woocommerce.py` | 11 |
| `backend/physical_sources/collapse.py`, `backend/tests/test_physical_collapse.py` | 12 |
| `backend/formats.py`, `backend/tests/test_formats.py` | 13 |
| `backend/physical_sources/catalogue.py`, `backend/tests/test_physical_catalogue.py` | 14 |
| `backend/physical_sources/resolve.py`, `platform_policy.py`, `backend/tests/test_physical_resolve.py` | 15 |
| `backend/physical_sources/sync.py`, `backend/tests/test_physical_sync.py` | 16 |
| `backend/physical_routes.py`, `backend/main.py`, `backend/tests/test_physical_routes.py` | 17 |
| `backend/physical_routes.py`, `backend/items.py`, `backend/tests/test_physical_matches.py`, `backend/tests/test_items_copy_fields.py` | 18 |
| `backend/tests/test_public.py`, `scripts/smoke.sh` | 19 |
| `frontend/src/pages/AdminCatalogue.jsx` (+ test), `frontend/src/App.jsx`, `frontend/src/layouts/RootLayout.jsx`, `frontend/src/index.css` | 20 |
| `frontend/src/pages/AdminCatalogue.jsx` (+ test), `frontend/src/lib/api.js`, `frontend/src/pages/Admin.jsx` | 21 |
| `frontend/src/pages/AdminItem.jsx` (+ test) | 22 |
| `CLAUDE.md`, `backend/sources/README.md`, `backend/physical_sources/README.md` | 23 |

---

## Zone 0 — fixtures and sheet access

### Task 1: The fixture recorder, run by the owner

**Files:** Create `backend/scripts/record_physical_fixtures.py`. Modify
`backend/scripts/README.md`. The owner's run creates
`backend/tests/fixtures/physical/` (data-only commit).

**Interfaces produced**

```python
# record_physical_fixtures.py — keyless for stores, tracker and robots;
# the registry part needs GOOGLE_SHEETS_API_KEY and --igdb needs the IGDB
# keys, both loaded the normal way (the credentials never leave the process)
SOURCES: dict[str, list[tuple[str, str]]]   # fixture name -> [(url, out_file)]
#   one entry per store handle in the spec §2 STORES table, e.g.
#   ("https://limitedrungames.com/collections/coming-soon/products.json?limit=250&page=1",
#    "shopify/limited_run/coming-soon.p1.json")
#   the sheet through the Sheets API -> "registry/properties.json" (the
#   sheets.properties response) and "registry/details.json",
#   "registry/summary.json", "registry/upcoming.json" (values responses,
#   the key stripped from nothing because it is a query parameter, never in
#   the body); the tracker -> "tracker/games.json" (then trimmed to 30 games
#   by --trim-tracker); each host's robots.txt -> "robots/<host>.txt"; one
#   Limited Run Switch 2 pre-order product page ->
#   "shopify/limited_run/product.html"; with --igdb, one N64 page ->
#   "igdb/n64_page1.json".
def record(names: list[str] | None, igdb: bool) -> None: ...
```

Response bodies only, never headers or URLs with the key. A 2 req/s sleep
between requests. Prints one line per file: name, status, bytes, and for a
Shopify page the product count and the distinct tag set; for a sheet tab the
header row it found by content and the row count. Exits non-zero on any
non-200 so a gone handle — or a sheet that refuses key access — is loud.

**Acceptance criteria**
- [ ] `python scripts/record_physical_fixtures.py --list` prints every
      planned fixture without fetching.
- [ ] The run writes ~36 files; the README section says how to re-record,
      that fixtures are re-recorded when a store's handles change, and how
      the Sheets key is created.
- [ ] The registry part returns 200 for all three tabs, confirming key
      access to the sheet. A 403 stops Zone 0: the fallback (an admin upload
      of hand-downloaded CSVs through the same parser) is designed and added
      to this plan before Task 7 starts.
- [ ] The owner reviews the printed drift against the spec §2 table and
      Open questions 2 and 5, and records any difference in this plan's
      summary before Task 9.
- [ ] **Commit (assistant):** `chore(tracker): add the physical fixture recorder`
- [ ] **Commit (owner):** `test(tracker): record physical source fixtures`

**CHECKPOINT — owner review (fixtures, drift, sheet access).**

---

## Zone 1 — migration

### Task 2: Migration `0005` and the catalogue models

**Files:** Modify `backend/models.py`, `backend/tests/test_migrations.py`,
`backend/tests/test_schema_check.py`. Create
`backend/migrations/versions/0005_add_catalogue.py`.

**Interfaces produced**

```python
class ReleasePrecision(str, enum.Enum): DAY = "day"; MONTH = "month"; QUARTER = "quarter"; YEAR = "year"
class ListingAvailability(str, enum.Enum): PREORDER = "preorder"; IN_STOCK = "in_stock"; SOLD_OUT = "sold_out"; ARCHIVED = "archived"
class MatchConfidence(str, enum.Enum): EXACT = "exact"; PROBABLE = "probable"; UNCERTAIN = "uncertain"; MANUAL = "manual"
class MatchDecision(str, enum.Enum): AUTO = "auto"; MANUAL = "manual"; IGNORED = "ignored"; PENDING = "pending"

class CatalogueGame(Base):      # "catalogue_games": igdb_id pk, title, cover_url, release_date, hypes, snapshot JSONB, fetched_at
class PhysicalEdition(Base):    # "physical_editions": spec §1 columns; UniqueConstraint(source, source_ref);
                                #   Index(igdb_id, platform_id); partial Index(platform_id, region) where retired_at is null
class StoreListing(Base):       # "store_listings": spec §1 columns; UniqueConstraint(store, variant_id);
                                #   Index(igdb_id, platform_id); Index(store, availability)
class CatalogueMatch(Base):     # "catalogue_matches": (title_normalized, platform_id) pk, igdb_id, match_confidence,
                                #   decided_by, candidates JSONB, decided_at
class CatalogueRun(Base):       # "catalogue_runs": spec §1 columns; Index(source, started_at desc)
```

Revision `0005` (down `0004`): the four new types created explicitly
(`create_type=False` pattern), five `op.create_table`s with the FKs
(`physical_editions.igdb_id` and `store_listings.igdb_id` → `catalogue_games`,
`ON DELETE SET NULL`), the indexes; downgrade drops indexes, tables (children
first), then the four types. The existing `physical_format` and
`format_source` types are reused and untouched.

**Acceptance criteria**
- [ ] The model-vs-migration diff and down/up cycle tests pass.
- [ ] New tests: upgrade to `0005` creates the five tables and four types;
      downgrade to `0004` removes them and leaves `physical_format`,
      `format_source`, `pick_action` in place; deleting a `catalogue_games`
      row nulls the FK on its editions and listings.
- [ ] `test_schema_check.py` head pin → `"0005"`.
- [ ] `physical_editions.is_physical` is nullable; a NULL round-trips.
- [ ] **Commit:** `feat(tracker): add migration 0005 with the catalogue tables`

**CHECKPOINT — owner review (migration).**

---

## Zone 2 — pure modules (fixtures in, dataclasses out)

### Task 3: Package skeleton, dataclasses, limits

**Files:** Create `backend/physical_sources/__init__.py`, `base.py`,
`limits.py`, `README.md`.

**Interfaces produced**

```python
# base.py
@dataclass(frozen=True)
class EditionRow:      # what a registry reader emits
    source: str; source_ref: str; title: str; platform_id: int; region: str
    is_physical: bool | None; physical_format: str | None; format_source: str | None
    cart_id: str | None; publisher: str | None; editions: str | None; ns1_compatible: bool | None
    release_date: date | None; release_precision: str | None

@dataclass(frozen=True)
class StoreProduct:    # one platform variant of a store product
    store: str; store_product_id: str; variant_id: str; handle: str; url: str; region: str
    title: str; title_normalized: str; edition_label: str | None
    platform_id: int | None; is_game: bool; collections_seen: tuple[str, ...]
    price: Decimal | None; currency: str; availability: str
    preorder_closes_at: date | None; release_date: date | None
    release_precision: str | None; release_text: str | None
    format_hint: str | None; format_tier: str | None; format_evidence: str | None
    image_url: str | None; raw: dict

class PhysicalSourceError(Exception): code: str; detail: str   # becomes a catalogue_runs.errors entry
```

`limits.py` holds the constants in Global constraints plus `USER_AGENT`.
`README.md` is a stub with the package's purpose and the "fixtures first" rule
(filled in Task 23).

**Acceptance criteria**
- [ ] `python -c "import physical_sources.base, physical_sources.limits"` succeeds
      with no FastAPI or SQLAlchemy import in the module graph (a test asserts
      `sys.modules` after import).
- [ ] **Commit:** `feat(tracker): scaffold physical_sources`

### Task 4: Courtesy — robots.txt *(parallel-safe with 5–8, 12, 13)*

**Files:** Create `backend/physical_sources/courtesy.py`,
`backend/tests/test_physical_courtesy.py`.

**Interfaces produced**

```python
def parse_robots(text: str) -> RobotFileParser: ...
def allowed(robots: RobotFileParser | None, url: str, user_agent: str = USER_AGENT) -> bool:
    """None (unreachable robots) is allowed; otherwise can_fetch under '*'."""
async def robots_for(host: str, client) -> RobotFileParser | None:
    """One GET of https://<host>/robots.txt; non-200 -> None, logged."""
```

**Acceptance criteria**
- [ ] Tests over `tests/fixtures/physical/robots/*.txt`: every store's JSON
      path is allowed; a synthetic `Disallow: /collections/` is refused; a
      missing file is allowed.
- [ ] **Commit:** `feat(tracker): add the robots.txt courtesy check`

### Task 5: The format classifier *(parallel-safe)*

**Files:** Create `backend/physical_sources/format.py`,
`backend/tests/test_physical_format.py`.

**Interfaces produced**

```python
@dataclass(frozen=True)
class Classification:
    format: str | None; tier: str | None; platform_override: int | None; evidence: str | None

FALSE_POSITIVES: tuple[re.Pattern, ...]
KEY_CARD_PHRASES: tuple[tuple[re.Pattern, str], ...]      # pattern -> format
FULL_CART_PHRASES: tuple[re.Pattern, ...]
UPGRADE_PACK = re.compile(r"includes the nintendo switch game and the nintendo switch 2 edition upgrade pack")

def classify(text: str, policy: str | None, platform_id: int | None) -> Classification: ...
```

Steps 1–6 exactly as spec §2 "Classifier".

**Acceptance criteria**
- [ ] One test per phrase in the research doc §2.3 and the spec's additions,
      each asserting format, tier and evidence.
- [ ] False positives: "download code for the soundtrack" alone → nothing;
      "code in the box for Bonus Game" alone → nothing; "Teeto Key" → nothing.
- [ ] The Fangamer phrase → `game_card`, `platform_override = 130`.
- [ ] Policy: `game_card` policy with no text → `store_policy`; platform 130
      with no text and no policy → `game_card` / `platform_policy`; platform
      508 with nothing → all None.
- [ ] Text with both a key-card phrase and a full-cart phrase → key card (step
      2 runs before 3).
- [ ] **Commit:** `feat(tracker): add the physical format classifier`

### Task 6: Dates, status, edition labels, title stripping *(parallel-safe)*

**Files:** Create `backend/physical_sources/parse.py`,
`backend/tests/test_physical_parse.py`.

**Interfaces produced**

```python
EDITION_LABEL = re.compile(r"\b(Standard|Collector'?s|Deluxe|Special|First|Limited|Exclusive|Retro|Premium)\b( Edition)?", re.I)

def parse_release(text: str) -> tuple[date | None, str | None, str | None]:
    """(release_date, precision, matched_text) from the spec's patterns; season -> quarter."""
def parse_preorder_close(text: str) -> date | None: ...
def strip_title(title: str, patterns: tuple[re.Pattern, ...]) -> str: ...
def edition_label(*texts: str) -> str | None: ...
def status_from(strategy: tuple[str, ...], product: dict, variant: dict, collections_seen: set[str]) -> str:
    """Walks 'collection:<h>=<status>', 'tag:<t>=<status>', 'title_prefix:<p>=<status>',
    'available' in order; returns preorder | in_stock | sold_out."""
def parse_ymd(text: str) -> date | None          # YYYY/MM/DD (sheet) and YYYY-MM-DD
def parse_loose_date(text: str) -> tuple[date | None, str | None]:
    """'Mon D, YYYY' -> day; 'Mon YYYY' / 'YYYY-MM' -> month; 'Qn YYYY' -> quarter; 'YYYY' -> year; TBA -> None."""
```

**Acceptance criteria**
- [ ] "PRE-ORDERS CLOSE ON SUNDAY, NOVEMBER 8, 2026, AT 11:59 PM EASTERN
      TIME." → 2026-11-08.
- [ ] "Shipping Q4 2026" → (2026-10-01, quarter); "Releasing Fall 2026!" →
      quarter; "EST 2026: Coming Soon" → year; "Release Date: November 19,
      2026" → day; "Estimated Ship Date: Dec 1 - Jan 31 2027" → month of the
      first date.
- [ ] `strip_title("Switch Limited Run #270: 9 Years of Shadows", LRG)` →
      "9 Years of Shadows"; "SW2#02: The Midnight Walk" → "The Midnight
      Walk"; "Terranigma: Foiled Standard Edition (Switch 2, PS5, Xbox)" →
      "Terranigma: Foiled" with `edition_label` "Standard".
- [ ] `status_from` with Limited Run's strategy: a `coming-soon` member with
      `available: false` → `preorder`; a vault member `available: true` →
      `in_stock`, `available: false` → `sold_out`.
- [ ] **Commit:** `feat(tracker): add date, status and title parsing`

### Task 7: The registry reader *(parallel-safe)*

**Files:** Create `backend/physical_sources/registry.py`,
`backend/tests/test_physical_registry.py`. Modify `backend/config.py`,
`backend/tests/test_config.py`.

**Interfaces produced**

```python
# config.py
google_sheets_api_key: str | None      # optional; never in _REQUIRED; logged as "sheets" in the
                                       # startup "metadata sources configured" line when set

# registry.py
SHEET_ID = "1LEIJUOanvkKq9kv1fSOnD40GdE1Jt5LzSYsg8yAPmb8"
TABS = {"details": 764784245, "upcoming_details": 238551450}     # gid per tab; no summary tabs
REQUIRED_DETAILS = ("Game Title", "Region", "Card Type")
OPTIONAL_DETAILS = ("Master Title", "Cart ID", "Publisher", "Editions", "Release Date")   # plus any header containing "NS1"
REGION_COLUMNS = ("USA", "KOR", "JPN", "EUR", "CHT", "AUS", "ASI")
CARD_TYPES: dict[str, tuple[bool | None, str | None]]   # case-folded card type -> (is_physical, format); "tbc" -> (None, None)

class SheetsNotConfigured(PhysicalSourceError): ...      # code "sheets_not_configured"
class SheetSchemaError(PhysicalSourceError): ...         # code "schema_missing_columns"

def tab_titles(properties: dict) -> dict[int, str]:      # pure: sheets.properties -> {gid: title}
def rows_from_values(payload: dict) -> list[list[str]]:  # pure: a values response -> padded rows
def locate_header(rows: list[list[str]], required: tuple[str, ...]) -> int: ...
def parse_details(rows: list[list[str]]) -> tuple[list[dict], list[str]]:   # rows, warnings; both tabs
def source_ref(title: str, region: str, publisher: str | None, card_type: str | None) -> str:
    """normalize_title(title) | REGION | normalize_title(publisher) | casefolded card type."""
def merge(details: list[dict], upcoming: list[dict]) -> list[EditionRow]:
    """One EditionRow per row of either tab; on a source_ref in both, Release Details wins."""
async def fetch_properties(client, key: str) -> dict     # GET /v4/spreadsheets/{id}?fields=sheets.properties
async def fetch_tab(client, key: str, title: str) -> dict   # GET /v4/spreadsheets/{id}/values/{title}
# the two fetches are the only network functions; the key travels as a query parameter and is
# never logged; a 403 or 404 becomes PhysicalSourceError("sheet_unavailable", status)
```

**Acceptance criteria**
- [ ] `tab_titles` maps the two known gids from the recorded
      `properties.json`; a missing gid raises `SheetSchemaError` naming it.
- [ ] `rows_from_values` pads ragged rows to the header's width (the API
      omits trailing empty cells).
- [ ] `locate_header` finds the header when it is not row 0 (the recorded
      Details tab) and raises `SheetSchemaError` when a required column is
      absent.
- [ ] Without `google_sheets_api_key`, `list_editions` raises
      `SheetsNotConfigured`; `test_config.py` shows the key is optional and
      `_REQUIRED` is unchanged.
- [ ] Every distinct `Card Type` value in the fixture maps to a
      `(is_physical, format)` pair or appears in warnings as
      `unknown_card_type:<value>` — the test prints the distinct set so a new
      value is seen.
- [ ] A row with `Cart ID` `LP-…` → `game_key_card`, cart ID kept; a malformed
      cart ID → NULL cart ID, format from `Card Type`.
- [ ] Dates: a row's `2026/11/19` → 2026-11-19, precision `day`; `TBA` or
      blank → NULL (synthetic rows for the looser forms).
- [ ] Upcoming Releases parses through `parse_details` (no `Master Title`
      column → a warning, not a failure); `TBC` and blank card types →
      `is_physical = None`, format None; a known card type → that format.
- [ ] `source_ref` is `title|REGION|publisher|card type`: WWE 2K25's EUR
      Game-Key Card and Code in a Box rows get distinct refs, as do Human
      Fall Flat 2's two EUR rows; every ref in both fixtures is unique within
      its tab.
- [ ] A ref present in both tabs (LEGO Batman USA/EUR, if still identical)
      yields one row, the Release Details one.
- [ ] **Commit:** `feat(tracker): read the NSCollectors registry through the Sheets API`

### Task 8: The `switch2-tracker` cross-check *(parallel-safe)*

**Files:** Create `backend/physical_sources/tracker.py`,
`backend/tests/test_physical_tracker.py`.

**Interfaces produced**

```python
FMT = {"c": "game_card", "k": "game_key_card", "b": "code_in_box"}      # "d" -> is_physical False; "?" -> skipped
def parse_games(payload: dict) -> list[EditionRow]:
    """Per-region formats{} -> one row per region; else game-level fmt -> region ALL."""
async def fetch_games(client) -> dict     # raw.githubusercontent.com; best-effort
```

**Acceptance criteria**
- [ ] Over the 30-game excerpt: WWE 2K25's `formats: {usa: "b", eur: "k",
      aus: "k"}` → three rows (USA code in box, EUR and AUS key card); a game with `fmt: "c"` and
      empty `formats` → one `ALL` row; `fmt: "d"` → `is_physical = False`;
      `fmt: "?"` → no row.
- [ ] `date` "Aug 27, 2026" → day; "2027" → year; "Q1 2027" → quarter; "TBA"
      → None.
- [ ] `source_ref` is title-keyed; the `id` field is never read.
- [ ] **Commit:** `feat(tracker): read the switch2-tracker cross-check`

### Task 9: `STORES` and the Shopify adapter

**Files:** Create `backend/physical_sources/stores.py`, `shopify.py`,
`backend/tests/test_physical_shopify.py`.

**Interfaces produced**

```python
# stores.py
@dataclass(frozen=True)
class StoreConfig:
    key: str; adapter: str; domain: str; currency: str; region: str
    collections: tuple[str, ...]                 # handles (Shopify) or category ids (WooCommerce)
    title_strip: tuple[re.Pattern, ...]
    platform: tuple[str, ...]                    # ordered: "option:Platform", "product_type", "title_regex:<re>", "sku_prefix:<p>=<id>", "tags"
    status: tuple[str, ...]                      # ordered, see parse.status_from
    game_filter: tuple[str, ...]                 # "product_type:Games", "tag:physical game", "not_tag:clubproducts", "not_product_type:Trading Cards", ...
    url_keep: re.Pattern | None
    format_policy: str | None                    # "game_card" for limited_run (unless distro)
    html_step: bool

STORES: dict[str, StoreConfig]                   # all twelve, transcribed from the spec §2 table (www. hosts where they redirect)

# shopify.py
def explode(product: dict, config: StoreConfig, collections_seen: set[str]) -> list[StoreProduct]:
    """Pure. One StoreProduct per platform variant; platform via config.platform strategy
    (option first; tags never when an option exists); classify() over title + body."""
def parse_page(payload: dict) -> list[dict]: ...
def parse_product_page(html: str) -> tuple[bool, str | None]:    # (key_card_seen, ship_text) — the Limited Run HTML step
async def list_products(config: StoreConfig, client, robots) -> tuple[list[StoreProduct], list[PhysicalSourceError]]:
    """Walks each handle until an empty page; empty first page -> error empty_collection for that handle."""
```

**Acceptance criteria**
- [ ] Every `STORES` entry has the spec §2 handles — Limited Run's five
      (`coming-soon`, `latest-releases`, `distro`, `the-lr-vault`,
      `in-stock-switch`), never `in-production` or `all-in-production`;
      `aksys_eu` uses `nintendo-switch™-1` percent-encoded when the URL is
      built.
- [ ] Limited Run fixture (`coming-soon`): Terranigma Foiled explodes into
      three variants; only the Switch 2 one has `platform_id` 508; its
      `availability` is `preorder` despite `available: false`;
      `preorder_closes_at` is 2026-11-08; `format_hint` is `game_card` /
      `store_policy` only when `distro` is absent from `collections_seen`
      (Terranigma is Distro → None until the HTML step or text says
      otherwise).
- [ ] `the-lr-vault` fixture: "Switch Limited Run #270: 9 Years of Shadows"
      → title "9 Years of Shadows", platform 130, `game_card` /
      `platform_policy` when no text, `in_stock` when available.
- [ ] Super Rare fixture: `Sw2#02` → title "The Midnight Walk", 508,
      `game_card` / `store_text` (evidence "Fully assembled Nintendo Switch 2
      game with cartridge"); `[Special Edition] SE#02` → the same title,
      format None (no phrase); the Trading Card Pack → `is_game = False`.
- [ ] iam8bit fixture: "UNBEATABLE - Breakout Edition (iam8bit Nintendo
      Switch 2 Exclusive…)" → 508, `preorder`, `sold_out` tag respected only when `available` is
      false; a Legacy Cartridge Collection product (Sonic 35th Anniversary) → `is_game` True with
      `platform_id` None (Needs match) or a platform outside
      `CATALOGUE_PLATFORMS` — either is acceptable; never 508 or 130.
- [ ] Strictly Limited fixture: "Shenmue III Enhanced - Special Edition
      (Nintendo Switch 2)" → 508, `game_card` / `store_text`; `available`
      wins over the `Sold Out` tag.
- [ ] `parse_product_page` on the recorded HTML reads the ship date from
      `selling_plan_groups` (`Date` 2027-01-12 → month precision; the plan
      name "Estimated ship date Jan 12 – 31, 2027" as `release_text`) and
      reports `key_card_seen` False for that page.
- [ ] **Commit:** `feat(tracker): add STORES and the Shopify adapter`

### Task 10: The remaining Shopify stores and the fixture-coverage test

**Files:** Modify `backend/physical_sources/stores.py`, `shopify.py`,
`backend/tests/test_physical_shopify.py`.

**Acceptance criteria**
- [ ] Premium Edition: "Alisa: Developer's Cut - Standard Edition (Pre-order)"
      → 130, `preorder` from collection membership, `edition_label`
      "Standard", `game_card` / `store_text` ("Physical Case and Game").
- [ ] Nicalis: option `Nintendo Switch™ 2` → 508; `Release Date: November 19,
      2026` → day precision; format None (says nothing).
- [ ] Aksys US: "PRE-ORDER: Bounty Sisters" → title "Bounty Sisters", 130 from
      SKU `SW-`, `preorder` from the title prefix.
- [ ] Aksys EU: a product from `nintendo-switch™-1` → 130; region `EUR`,
      currency `GBP`.
- [ ] Fangamer: "Hollow Knight: Silksong Standard Edition" with option
      `edition` → one variant per platform, 508 for "Nintendo Switch 2";
      Stardew Valley's upgrade-pack text → `game_card` with platform 130
      (the override applied).
- [ ] Coverage test: for every `STORES` entry and every handle, a fixture
      file exists and `explode` yields at least one `is_game` product with a
      platform in `CATALOGUE_PLATFORMS` — except handles the fixture run
      recorded as empty, which are listed in the test with the date.
- [ ] **Commit:** `feat(tracker): configure the remaining Shopify stores`

### Task 11: The WooCommerce adapter *(parallel-safe with 9–10 once 3 exists)*

**Files:** Create `backend/physical_sources/woocommerce.py`,
`backend/tests/test_physical_woocommerce.py`.

**Interfaces produced**

```python
def explode(product: dict, config: StoreConfig) -> list[StoreProduct]:
    """Pure. Price = prices.price / 10**currency_minor_unit; is_on_backorder -> preorder,
    is_in_stock -> in_stock else sold_out; attributes/name for the platform; url_keep filter."""
async def list_products(config: StoreConfig, client, robots) -> tuple[list[StoreProduct], list[PhysicalSourceError]]: ...
```

**Acceptance criteria**
- [ ] PixelHeart: the `/fr/` duplicate of "Rage of the Dragons Neo SWITCH
      [US]" is dropped by `url_keep`; price €44.90; platform 130 from the
      name (the fixture has no `Platform` attribute); `sold_out`; "on the same cartridge" →
      `game_card` / `store_text`, else `platform_policy`.
- [ ] GameFairy: "Switch Case and Cartridge" → `store_text`; USD.
- [ ] 1Print: "In Other Waters And Sky Racket (Nintendo Switch)" → one
      product, 130, `is_game` True (Needs match will Ignore it).
- [ ] **Commit:** `feat(tracker): add the WooCommerce adapter`

### Task 12: The collapse rule *(parallel-safe)*

**Files:** Create `backend/physical_sources/collapse.py`,
`backend/tests/test_physical_collapse.py`.

**Interfaces produced**

```python
TIER_ORDER = ("manual", "cart_id", "photo", "registry", "store_text", "store_policy", "platform_policy")
SOURCE_ORDER = ("nscollectors", "switch2tracker", "igdb_platform", "manual")

@dataclass(frozen=True)
class StoreLine:
    store: str; price: Decimal | None; currency: str; availability: str
    preorder_closes_at: date | None; url: str; listing_format: str | None; listing_id: str

@dataclass(frozen=True)
class Candidate:
    igdb_id: int; platform_id: int; title: str; cover_url: str | None
    release_date: date | None; release_precision: str | None
    physical_format: str | None; format_source: str | None; format_route: str | None
    format_note: str | None; region_of_answer: str; buyable: bool
    store_lines: tuple[StoreLine, ...]; listing_ids: tuple[str, ...]; edition_ids: tuple[str, ...]

def collapse(igdb_id, platform_id, editions: list[EditionView], listings: list[ListingView],
             game: GameView | None, home: str = HOME_REGION) -> Candidate: ...
def item_note(item: ItemView, editions: list[EditionView], home: str = HOME_REGION) -> RegistryNote:
    """agrees: bool | None, edition, note text — the same-edition tier rule."""
```

`EditionView`, `ListingView`, `GameView`, `ItemView` are plain dataclasses the
route layer builds from rows (the `picker.py` pattern).

**Acceptance criteria**
- [ ] Registry USA key card + Super Rare (EUR) full cart → home answer
      `game_key_card`, note "Full game on cartridge in EUR — Super Rare".
- [ ] Registry USA key card + Limited Run (USA) full cart at `store_text` →
      `game_card`, route "Limited Run"; with Limited Run at `store_policy` →
      still `game_card` (any full cart wins), route names the policy.
- [ ] Registry USA game card + Limited Run key card (HTML step) →
      `game_card`; the Limited Run store line carries `listing_format =
      game_key_card`.
- [ ] Only a EUR registry row → the EUR answer with `region_of_answer =
      "EUR"`.
- [ ] Only an unknown-format listing → format None, `buyable` true.
- [ ] `nscollectors` beats `switch2tracker` for the same region on a tie.
- [ ] `release_date`: home registry date wins over IGDB's; IGDB's used when
      no row has one.
- [ ] `item_note`: item `manual` game card vs registry key card → `agrees
      False`, note names the registry's cart ID; item `registry` vs registry
      → `agrees True`; no edition → `agrees None`, "Not in the registry".
- [ ] **Commit:** `feat(tracker): add the format collapse rule`

### Task 13: `formats.py` — the registry writer and `edition_id` *(parallel-safe)*

**Files:** Modify `backend/formats.py`, `backend/tests/test_formats.py`.

**Interfaces produced**

```python
CARTRIDGE_ONLY_PLATFORMS = frozenset({4, 130})
PROTECTED_SOURCES = frozenset({"manual", "cart_id", "photo"})

def apply_registry_format(row: Item, edition_format: str | None) -> dict:
    """{"physical_format", "format_source": "registry"} or {} when the edition has no format;
    raises CopyFieldError when row.format_source is protected."""
# apply_copy_fields: an `edition_id` key plus an `edition_format` resolved by the caller ->
# physical_format + format_source registry; 422 when the row has a cart_id; the registry's
# cart ID is never written.
```

**Acceptance criteria**
- [ ] `apply_registry_format` on a `manual` row raises; on a NULL-source row
      returns the registry format; on a `registry` row with a changed
      registry value returns the new one; with `edition_format None` returns
      `{}`.
- [ ] `apply_copy_fields({"edition_id": …, "edition_format": "game_card"},
      row)` → `format_source = registry`; with a `cart_id` on the row → 422
      naming the cart ID.
- [ ] Existing `test_formats.py` cases unchanged and green.
- [ ] **Commit:** `feat(tracker): add the registry format writer to formats.py`

---

## Zone 3 — persistence and routes

### Task 14: The catalogue database layer

**Files:** Create `backend/physical_sources/catalogue.py`,
`backend/tests/test_physical_catalogue.py`.

**Interfaces produced**

```python
async def start_run(session, source: str) -> CatalogueRun
async def finish_run(session, run, *, ok, rows_seen, rows_changed, rows_retired=0, items_synced=0,
                     unresolved_remaining=0, short_run=False, errors=()) -> None
async def previous_rows_seen(session, source) -> int | None
def is_short(seen: int, previous: int | None) -> bool          # pure: seen < previous * SHORT_RUN_RATIO
async def upsert_editions(session, rows: list[EditionRow], source: str, *, retire: bool) -> tuple[int, int]
    """(changed, retired). Upsert on (source, source_ref); un-retire reappearing rows;
    when retire, set retired_at on rows of this source not in `rows`."""
async def upsert_listings(session, products: list[StoreProduct], store: str, *, archive: bool) -> tuple[int, int]
async def latest_runs(session) -> dict[str, CatalogueRun]
async def consecutive_failures(session, source) -> int
```

**Acceptance criteria**
- [ ] Two runs with the same rows → second run `changed 0`; a row missing
      from a non-short run → `retired_at` set; present again → cleared.
- [ ] `retire=False` (short run) leaves absent rows live.
- [ ] Listings: a variant absent from a non-short run → `archived`; its
      `raw`, `igdb_id` and `format_hint` are kept.
- [ ] `first_seen_at` never changes on update; `last_seen_at` does — and
      `updated_at` on listings: `onupdate` does not fire for a Core
      `on_conflict_do_update`, so the upsert sets both in `set_` (review of
      Task 2).
- [ ] A run left with `ok IS NULL` (the process restarted mid-refresh) and
      older than 30 minutes counts as failed in `consecutive_failures` and
      reads as "interrupted" on the status page.
- [ ] **Commit:** `feat(tracker): add the catalogue persistence layer`

### Task 15: Resolution and the N64 ingest *(depends on 14)*

**Files:** Create `backend/physical_sources/resolve.py`, `platform_policy.py`,
`backend/tests/test_physical_resolve.py`.

**Interfaces produced**

```python
async def pending_keys(session, limit: int) -> list[tuple[str, int, int | None]]   # (title_normalized, platform_id, year)
async def resolve_batch(session, igdb: IgdbSource, limit: int = RESOLVE_LIMIT) -> ResolveResult
    """search + best_match per key; writes catalogue_matches; propagates igdb_id to editions and
    listings; fills catalogue_games (fetch_many, batches of 100, missing or older than 30 days).
    ResolveResult: resolved, pending, unresolved_remaining, errors."""
async def link_by_hand(session, igdb: IgdbSource, title_normalized, platform_id, igdb_id) -> None
async def ignore(session, title_normalized, platform_id) -> None
async def rekey_platform(session, title_normalized, old_platform_id, new_platform_id) -> int
async def ingest_platform(session, igdb: IgdbSource, platform_id: int) -> tuple[int, int, int]   # rows, with_cover, errors
```

Tests use a fake `IgdbSource` returning the recorded `igdb_search.json` /
`igdb_games_e7b.json` shapes; no network.

**Acceptance criteria**
- [ ] An exact match → `auto`, `igdb_id` copied onto both an edition and a
      listing sharing the key; an uncertain one → `pending` with three
      candidates and no `igdb_id`.
- [ ] A key with `platform_id` 0 is never searched.
- [ ] Keys whose platform is outside `CATALOGUE_PLATFORMS` are never
      searched.
- [ ] `catalogue_games` is filled once per id; a second batch does not
      refetch a fresh snapshot; a snapshot older than 30 days is refetched.
- [ ] Order (spec §3, forced by the 0005 foreign keys): games are filled from
      decided `catalogue_matches` ids first, then `igdb_id` is copied only
      where a `catalogue_games` row exists. A match whose game fetch was
      rate-limited leaves its rows unlinked without error, and the next
      resolve links them; an id IGDB does not return stays unlinked.
- [ ] `SourceNotConfigured` → `igdb_not_configured` error, nothing written;
      `SourceRateLimited` after two keys → two written, error recorded,
      `unresolved_remaining` correct.
- [ ] `ingest_platform(4)` writes `igdb_platform` editions with `region ALL`,
      `game_card` / `platform_policy`, `is_physical True`, `igdb_id` set
      directly, and games; `ingest_platform(130)` raises `ValueError`.
- [ ] **Commit:** `feat(tracker): resolve catalogue rows to IGDB`

### Task 16: Registry sync *(depends on 14; parallel-safe with 15)*

**Files:** Create `backend/physical_sources/sync.py`,
`backend/tests/test_physical_sync.py`.

**Interfaces produced**

```python
async def sync_items(session) -> int:
    """Owned games on KEY_CARD_PLATFORMS with external_source igdb and an unprotected
    format_source: find the edition (igdb_id + platform + region-or-home, nscollectors first);
    write apply_registry_format; returns the count written."""
async def disagreements(session) -> list[Disagreement]     # items whose protected format differs from the registry
```

**Acceptance criteria**
- [ ] A NULL-format Switch 2 item with a USA registry row → format written,
      `format_source registry`.
- [ ] A `manual` item never changes even when the registry disagrees; it
      appears in `disagreements()`.
- [ ] A `registry` item whose registry row changed → updated.
- [ ] An item with `region EUR` uses the EUR row; an item with region NULL
      uses USA.
- [ ] A `Digital` edition (`is_physical False`) writes nothing.
- [ ] A want-list item (`owned_format none`) is skipped.
- [ ] **Commit:** `feat(tracker): sync registry formats onto owned items`

### Task 17: Refresh, resolve and status routes *(depends on 15, 16)*

**Files:** Create `backend/physical_routes.py`,
`backend/tests/test_physical_routes.py`. Modify `backend/main.py`.

**Interfaces produced**

```python
def create_physical_router(session_factory, registry: SourceRegistry, http_client_factory) -> APIRouter
# POST /api/physical/refresh            {stores?: list[str]}        -> RefreshOut {runs: [RunOut], unresolved_remaining}
# POST /api/physical/refresh-registry                              -> RefreshOut (sheet, tracker, resolve batch, sync)
# POST /api/physical/refresh-platform   ?platform_id=4             -> RunOut; 422 otherwise
# POST /api/physical/resolve            ?limit=100                 -> ResolveOut
# GET  /api/physical/status                                        -> StatusOut {sources: [...], totals: {...}}
# 409 while another refresh runs (module-level asyncio.Lock); 422 unknown store key; all require_admin.
```

Tests inject a fake HTTP client that serves the fixtures by URL and a fake
IGDB adapter, so a full refresh runs end to end against the test Postgres.

**Acceptance criteria**
- [ ] `POST /refresh` with `{stores: ["super_rare"]}` walks the fixture,
      writes listings, records one run with `ok true`, returns
      `unresolved_remaining`.
- [ ] A store whose robots fixture disallows the path → run with
      `robots_disallowed`, no listings written, other stores unaffected.
- [ ] A handle whose fixture is `{"products": []}` → `empty_collection` on
      that run; the store's other handles still write.
- [ ] `POST /refresh-registry` → two runs (`nscollectors`, `switch2tracker`),
      editions written, `items_synced` reported; with no Sheets key the
      `nscollectors` run records `sheets_not_configured`, writes nothing,
      retires nothing, and the tracker run still proceeds.
- [ ] `POST /refresh-platform?platform_id=130` → 422.
- [ ] Every route → 401 unauthenticated; a second refresh during the first →
      409.
- [ ] `GET /status` reports `needs_attention` after three failed runs of one
      source.
- [ ] **Commit:** `feat(tracker): add the physical refresh and status routes`

### Task 18: Needs match, links, the registry note, disagreements *(depends on 17)*

**Files:** Modify `backend/physical_routes.py`, `backend/items.py`. Create
`backend/tests/test_physical_matches.py`. Modify
`backend/tests/test_items_copy_fields.py`.

**Interfaces produced**

```python
# GET  /api/physical/needs-match        ?limit&offset -> {keys: [{title_normalized, platform_id, title, sources, rows, candidates}], total}
# POST /api/physical/matches            {title_normalized, platform_id, igdb_id?} | {…, ignored: true} | {…, new_platform_id}
# GET  /api/physical/items/{id}/registry               -> {edition, agrees, note}
# GET  /api/physical/disagreements                     -> {items: [...]}
# PATCH /api/items/{id} accepts edition_id: the route loads the edition, passes edition_format
#   to apply_copy_fields; 404 for an unknown or retired edition.
```

**Acceptance criteria**
- [ ] Linking a pending key by hand marks it `manual`, fills
      `catalogue_games` and then copies the id to its rows (the foreign key
      needs the game row first); ignoring it removes it from
      `needs-match`; re-keying a platform-less key moves its rows and lists
      it under the new platform.
- [ ] `/items/{id}/registry` for a manual game-card item with a key-card
      registry row → `agrees false` and a note carrying the registry cart ID;
      for a Switch 1 item → 204 / `{edition: null}` (Switch 2 only).
- [ ] `PATCH /api/items/{id}` with `edition_id` → `format_source registry`,
      `cart_id` untouched; with a `cart_id` on the row → 422.
- [ ] All routes 401 unauthenticated.
- [ ] **Commit:** `feat(tracker): add needs-match, links and the registry note`

### Task 19: Public leak pins and smoke *(parallel-safe with 17–18)*

**Files:** Modify `backend/tests/test_public.py`, `scripts/smoke.sh`.

**Acceptance criteria**
- [ ] `test_public.py` asserts none of `store_listings`, `physical_editions`,
      `catalogue_`, `price`, `snapshot`, `format_route`, `listing_ids` appear
      in any public response model's field names or in a serialised public
      item, stats or detail.
- [ ] `smoke.sh`: `POST /api/physical/refresh`, `POST /api/physical/resolve`,
      `GET /api/physical/status` unauthenticated → 401; the leak grep adds
      the names above; `/admin/catalogue` deep link returns the SPA shell.
- [ ] **Commit:** `test(tracker): pin the catalogue out of the public API`

---

## Zone 4 — UI and docs

### Task 20: `/admin/catalogue` — status and refresh

**Files:** Create `frontend/src/pages/AdminCatalogue.jsx`,
`frontend/src/pages/AdminCatalogue.test.jsx`. Modify `frontend/src/App.jsx`,
`frontend/src/layouts/RootLayout.jsx` (`WIDE_ROUTES`),
`frontend/src/index.css`.

**Acceptance criteria**
- [ ] Route `admin/catalogue` renders a status table from `GET
      /api/physical/status`: one row per source with last refreshed, rows,
      state in words ("ok", "short run — nothing retired", "2 errors"), and a
      `role="img"` "needs attention" mark.
- [ ] **Refresh stores** (all, and a per-row Refresh), **Refresh registry**,
      **Refresh N64** call their routes and re-read status; **Resolve** loops
      `POST /resolve` while `unresolved_remaining > 0`, showing "142
      remaining…", and stops on a non-2xx with the message shown in words.
- [ ] 409 shows "A refresh is already running".
- [ ] Tokens only; the page reads `signedIn` from outlet context.
- [ ] **Commit:** `feat(tracker): add the admin catalogue page`

### Task 21: Needs match and disagreements *(depends on 20)*

**Files:** Modify `frontend/src/pages/AdminCatalogue.jsx`,
`AdminCatalogue.test.jsx`, `frontend/src/lib/api.js`,
`frontend/src/pages/Admin.jsx`.

**Acceptance criteria**
- [ ] **Needs match** lists pending keys with title, platform, sources and
      row count; each has a `MetadataPicker` (type game) pre-filled with the
      stored candidates, a platform select shown only for platform-less keys,
      and **Ignore**; a link or ignore removes the row without a full reload.
- [ ] **Registry disagreements** lists items with "yours" vs "registry" and a
      link to `/admin/collection/:id`; empty state is one line.
- [ ] `/admin` links to Catalogue.
- [ ] **Commit:** `feat(tracker): add needs-match and disagreements panels`

### Task 22: The registry line on the edit page *(parallel-safe with 20–21)*

**Files:** Modify `frontend/src/pages/AdminItem.jsx`,
`frontend/src/pages/AdminItem.test.jsx`.

**Acceptance criteria**
- [ ] For a Switch 2 item, under the format field: "Registry agrees: Game
      Card (USA)", or the disagreement note with **Use registry value**
      (PATCH with `edition_id`; the format select updates and the note
      becomes "agrees"), or "Not in the registry". Nothing for other
      platforms.
- [ ] A 422 from the PATCH is shown in words.
- [ ] **Commit:** `feat(tracker): show the registry note on the edit page`

### Task 23: Docs

**Files:** Modify `CLAUDE.md`, `backend/sources/README.md`. Fill
`backend/physical_sources/README.md`.

**Acceptance criteria**
- [ ] `CLAUDE.md`: the Media tracker section gains the catalogue package, the
      "fixtures first" rule for stores, the collapse rule in one paragraph,
      `apply_registry_format`, the `/admin/catalogue` deploy order; the TODO
      marks E7c done and retires E6 in favour of E8b.
- [ ] `physical_sources/README.md`: purpose, the interface, the `STORES`
      table (transcribed from the spec with the fixture date), the courtesy
      policy, how to add a store (config row + fixture + tests), how to
      re-record fixtures.
- [ ] `sources/README.md` points to it.
- [ ] **Commit:** `docs(tracker): document the physical catalogue`

**CHECKPOINT — batch review + finish gate.**

---

## Parallel-safe flags

- Zone 2: Tasks 4, 5, 6, 7, 8, 12, 13 are parallel-safe with each other once
  Task 3 exists (distinct files). Task 9 → 10 are sequential (shared files);
  Task 11 is parallel-safe with 9–10.
- Zone 3: Task 14 first; 15 and 16 in parallel after it; 17 after both; 18
  after 17; 19 any time after 2.
- Zone 4: 20 → 21 sequential; 22 parallel with them; 23 last.

## Automated environment tests

- **pytest** (real Postgres; CI never skips): migrations `0005` up/down and
  model diff; every pure module on its fixture; the fixture-coverage test
  (every `STORES` handle has a fixture that parses to a game on a tracked
  platform, or is listed as recorded-empty with its date); an import test
  that the pure modules pull in no FastAPI or SQLAlchemy; routes end to end
  through a fixture-serving fake client and a fake IGDB adapter.
- **vitest**: the catalogue page (status, refresh, the resolve loop, 409),
  the panels, the edit-page note.
- **`npm run build`, ruff, prettier/eslint, the raw-hex grep.**
- **`scripts/smoke.sh`** (Task 19) against production after deploy.
- **Passing means:** all of the above green; after the owner applies `0005`
  and merges, smoke green with no new Render log errors; in production,
  Refresh registry reports rows and no errors, Refresh stores reports
  twelve runs, Resolve loops to zero, Needs match shows the leftovers, and
  a Switch 2 item's edit page shows the registry line.

## Zones

```
Zone 0 (owner + auto): task 1 (fixture recorder; owner records; drift and sheet access)
CHECKPOINT — owner review
Zone 1 (auto): task 2 (migration 0005)
CHECKPOINT — owner review
Zone 2 (auto): tasks 3–13 (pure modules on fixtures)
Zone 3 (auto): tasks 14–19 (persistence, routes, leak pins)
Zone 4 (auto): tasks 20–23 (UI, docs)
CHECKPOINT — batch review + finish gate
```

## Deploy order (owner)

1. In the Google Cloud project that holds the admin OAuth client, enable the
   Google Sheets API and create an API key restricted to it; set
   `GOOGLE_SHEETS_API_KEY` in `backend/.env` and on Render. Link `.env` into
   the worktree. Run `record_physical_fixtures.py`, review the drift, commit
   the fixtures (Zone 0).
2. After the finish gate: apply `0005` to Neon (`alembic upgrade head`);
   merge; Render deploys.
3. `/admin/catalogue`: Refresh registry → Refresh stores → Resolve until 0 →
   work Needs match → Refresh N64 when wanted.
4. Smoke and logs.

## Execution summary

### Zone 0 — fixture runs, 2026-09-25

The owner's terminal run produced no output and no files, so the assistant
ran `record_physical_fixtures.py --igdb`. The first run exited 1 on Atari
alone; its drift led to four owner decisions (below), the recorder was
changed to match, and the second run exited 0 with 58 files: 11 MB on disk,
about 1.5 MB compressed. No fixture contains any credential value from
`backend/.env` (checked across every file of both runs).

**Sheet access: confirmed.** The Sheets API returned 200 for the properties
request and every tab with the key alone. The upload fallback is not needed.

**Owner decisions, 2026-09-25**

1. **Atari is dropped** from `STORES`: its `products.json` answers every
   client with a Cloudflare bot challenge (403, `cf-mitigated: challenge`,
   under the tracker's User-Agent and a plain one alike), and getting past
   bot detection is off the table. Twelve stores, not thirteen; nine Shopify.
2. **The `Upcoming Switch 2 Releases` tab** (gid `238551450`) is recorded;
   whether Task 7 reads it is settled at this checkpoint (see below).
3. **The Release Summary tab** (gid `558942722`) is **not read**: Release
   Details dates all 749 rows by region itself.
4. **Store fixtures keep only each product's first image**; the full
   galleries were 4.9 MB of the Shopify JSON and no parser reads them.

### Differences from the spec §2 table and the acceptance criteria

| Area | Spec / plan said | Recorded | Effect |
|---|---|---|---|
| Atari | `physical-games`, `physical-cartridges` | Cloudflare challenge, 403 | Dropped (decision 1). Task 10's Atari AC and the "thirteen" counts in Tasks 9, 17 and the env tests become twelve |
| Hosts | bare domains | `iam8bit.com`, `strictlylimitedgames.com`, `fangamer.com`, `pixelheart.eu` redirect to `www.`; Fangamer's bare-host `robots.txt` is 404 | `STORES` uses the `www.` hosts, so the courtesy check reads the right file |
| robots.txt | every store's JSON path allowed | every recorded path allowed; `raw.githubusercontent.com` has none (404 → allowed) | Task 4 AC holds |
| Release Details | "Details"; `Release Date` optional; dates from Summary | `Switch 2 Release Details`; header at row 3; every optional column present, plus `LP #` and `Verified By`; `Release Date` on all 749 rows, every one `YYYY/MM/DD` | Dates come from each row (decision 3); `parse_summary` and the Summary merge leave Task 7 |
| Card Type | Digital, blank and unknown values expected | Details: `Game Card` 289, `Game-Key Card` 432, `Code in a Box` 28, nothing else. Upcoming Releases: `Game-Key Card` 68, `Game Card` 52, `TBC` 64, blank 1 | No `is_physical = false` rows today; the Digital path is tested on synthetic rows. `TBC` is new vocabulary |
| Cart ID (Open question 2) | optional | present; Details 571 valid, 28 `N/A`; Upcoming Releases 1 of 185 filled | `N/A` and blank → NULL, as planned |
| NS1 column | "any header containing NS1" | `NS1 Compatible`, `Yes`/`No`, on both details tabs | As planned |
| Upcoming Releases tab | not in the spec | `Upcoming Switch 2 Releases`: the Details layout without `Master Title` (header at row 3), 185 rows, every one dated `YYYY/MM/DD`, all seven regions; covers **all 65** titles of the Upcoming Summary | Read through the same `parse_details`. The Upcoming Summary is then redundant too |
| Upcoming Summary | header by `Game Title` | `Upcoming Switch 2 Release Summary`, header at row 4, a junk row dated `1899/12/30` | Only needed if the Upcoming Releases tab is not read |
| **Edition identity** | `source_ref` = `normalize_title(Game Title)` + `\|` + region, unique per source | Not unique. Details: WWE 2K25 AUS and EUR each have a `Game-Key Card` row and a `Code in a Box` row (same publisher). Upcoming Releases: Trails in the Sky 2nd Chapter EUR (two publishers, two dates) and Human Fall Flat 2 EUR (Microids key card, Devolver `TBC`). Four title-region pairs sit in both tabs (LEGO Batman, Monopoly Star Wars, USA and EUR) | `UniqueConstraint(source, source_ref)` would reject the sheet. **Owner decision** before Task 2 (below) |
| Tracker | 910 games; `fmt`, `formats`, `date`, `id` | 916; adds `releases` (per-region dates), `editions`, `region`, `status`, `type`, `note`; `formats` values `c`/`k`/`b` | Excerpt covers every case. Task 8's `{usa: k, eur: c}` example becomes WWE 2K25's real `{usa: b, eur: k, aus: k}` |
| Limited Run counts | `coming-soon` 49, `distro` 27, `the-lr-vault` 20, `in-stock-switch` 44, `latest-releases` 10 | 5, 5, 63, 27, 10 | Terranigma's three editions are in both `coming-soon` and `distro`; no Switch 2 item in `latest-releases` today |
| Limited Run HTML step | `Estimated Ship Date: (.+)` theme text; `Game Key Card` | the page (Terranigma Foiled, a Distro title) has neither as theme text. The date is in the embedded `selling_plan_groups` JSON: plan name `🟣 Estimated ship date Jan 12 – 31, 2027`, option `Date` values `2027-01-12`, `2027-04-01` | Task 9's `parse_product_page` reads the selling-plan JSON (ISO date, month precision). `key_card_seen` is False on this page |
| Limited Run platform | option `Platform`; SKU `NS2-`/`NSW-` | option confirmed; one pre-order SKU is `2LRS006`; He-Man is `Default Title` with no platform anywhere | Option first, as planned; He-Man goes to Needs match |
| Super Rare | `SW2#02` → "The Midnight Walk" | `Sw2#02: The Midnight Walk` (mixed case, product_type `Switch 2`, "Fully assembled Nintendo Switch 2 game with cartridge"), beside `[Special Edition] SE#02: …` (Collector's Edition, no cartridge phrase) and `Sw2 TC#02 … Trading Card Pack` | `title_strip` case-insensitive and covering `[Special Edition] SE#`; no `Teeto Key` product today |
| iam8bit | "UNBEATABLE - Breakout Edition (Nintendo Switch 2)" | `UNBEATABLE - Breakout Edition (iam8bit Nintendo Switch 2 Exclusive…)`, `available: false`, tags `pre-order` and `sold-out`, "complete on cartridge", "Shipping Q4 2026"; the Legacy Cartridge example is now Sonic 35th Anniversary with a multi-wave ship text | Title regex matches `Nintendo Switch 2` inside the parentheses; `new` is a full page (250) |
| Strictly Limited | product_type; "full game on cartridge" | product_type `Nintendo Switch 2 Collector's Edition`; phrase `full physical cartridge`; `Sold Out` tag on an available item confirmed; `nintendo-switch` a full page (250) | As planned |
| Premium Edition | "Alisa … (Pre-order)" | option `Choose Your Version!` (edition, not platform); product_type `Nintendo Switch Games`; body `EST 2026: Coming Soon`, `Physical Case and Game` | Platform from product_type, as planned |
| Nicalis | option `Nintendo Switch™ 2`; `Release Date: November 19, 2026` | confirmed; others read `Release Date: Q3 2026` and `July 31st, 2018` | `parse_release` handles quarters and ordinal days |
| Aksys US (Open question 5) | `switch` unverified | `switch` answers, 87 products; `PRE-ORDER: Bounty Sisters`, SKU `SW-80` | Handle kept |
| Aksys EU | `nintendo-switch™-1` 61 | 53; product_type `Nintendo Switch`; GBP | Product_type is a usable platform signal |
| Fangamer | option `edition`; upgrade-pack phrase | confirmed on Silksong and Stardew Valley; Stardew carries `platform_Nintendo Switch` and `platform_Nintendo Switch 2` tags | The override to 130 matters, as planned |
| PixelHeart | attribute `Platform`; 5 items | no `Platform` attribute (`Marque`, `Section`, `Edition`); platform only from the name `SWITCH [US]`; `/en/` + `/fr/` duplicates confirmed; `4490`, minor unit 2 → €44.90; Rage of the Dragons out of stock, not on backorder; 32 products | Platform from the name |
| GameFairy / 1Print | 5 / 6 items | 21 / 17; 1Print bundle `In Other Waters And Sky Racket` confirmed | As planned |
| IGDB N64 (Open question 4) | measured on first run | 234 games with `total_rating_count >= 5`, all 234 with a cover | Coverage is complete at that threshold |

### Open for the owner at this checkpoint

1. **Read the Upcoming Releases tab?** Recommended: yes, through
   `parse_details`, and drop the Upcoming Summary as well — the tab covers
   every upcoming title with a date and, for 120 of 185 rows, a card type.
   `TBC` and blank then mean `is_physical = NULL` (announced, card type not
   listed yet), which is what the spec wanted from the Upcoming Summary.
   Where a title and region appear in both tabs, Release Details wins.
2. **Edition identity.** Recommended: `source_ref` = normalized title |
   region | normalized publisher | card type. It separates every duplicate
   recorded today; a card type changing from `TBC` retires the old row and
   adds the new one, which the retire/un-retire rules already handle. This
   changes spec §1 and Task 7's AC; the unique key itself (`source`,
   `source_ref`) and Task 2 are unaffected.

### Zones 2–4 — differences from the plan, 2026-09-25

Decided by the owner:

- **Purity.** The planned test could not pass: `formats.py` and `matching.py`
  imported `models`. `matching.py` now imports `SourceResult` only for type
  checking; the shared constants (`CART_ID_PATTERN`, `HOME_REGION`,
  `CARTRIDGE_ONLY_PLATFORMS`, the format words) live in
  `physical_sources/limits.py` and `formats.py` imports them. The test
  covers every pure `physical_sources` module and `matching`; `formats.py`
  still imports `models` and is left out.

Found while building, each recorded where it lives:

| Area | Plan / spec said | Built | Why |
|---|---|---|---|
| robots.txt | `urllib.robotparser`; unreachable file allowed | RFC 9309 matcher (longest match, Allow on a tie, `*`/`$`); 4xx allowed, 5xx or network failure skips the host | Shopify files open with `Allow: /`, which first-match reads as allowing everything; the RFC treats an unreachable file as a disallow |
| Commit `8a9309b` | every commit green | went in with one red test; fixed forward in `3cd806f` | a piped `tail` hid pytest's exit code; every later gate checks the exit status. Squashing is the owner's call |
| Platforms | `platform_id` or Needs match | `StoreProduct.platform_label`: retro platforms (SNES, Genesis…) keep a label and no id | no IGDB id outside `PLATFORM_NAMES` is verified in this codebase; a SNES cartridge is known, not unmatched |
| Fangamer Silksong (Task 10) | the "Nintendo Switch 2" variant is 508 | 130 | its text says the Nintendo Switch 2 Edition is the Switch game plus an upgrade pack: spec §2 step 2 |
| Limited Run vault #270 (Task 9) | `game_card` / `platform_policy` | `game_card` / `store_text` | its body says "region-free physical cart", and text comes before policy |
| iam8bit UNBEATABLE (Task 9) | `preorder` | `sold_out` | recorded unavailable with both a pre-order and a sold-out tag |
| Limited Run HTML step | `Estimated Ship Date:` theme text | the ship window from `selling_plan_groups` | where the date lives now |
| Prices | stored as given | a price above `numeric(8,2)` is None | Nicalis lists 1001 Spikes at $1,001,001.00, which failed the whole store's insert |
| `updated_at` | moves on change | moves only on change, explicitly | `last_seen_at` always issues an UPDATE, which the model's `onupdate` would stamp |
| Archive / retire | on a non-short run | on a clean run: something seen, not short, no failed handle | a broken collection hides stock; it does not prove it gone |
| Resolve | failed search retried | a key whose search fails goes to Needs match with no candidates | otherwise the Resolve loop could spin on it forever |
| N64 ingest | editions and games | also decides their title matches (`exact`) | so a store's N64 listing links without a search |
| Sync | the copy's edition | nothing is written when the copy's region offers two formats | WWE 2K25 EUR: a key card and a code in a box, and nothing on the copy says which |
| Item note | the edition | picked by cart ID, then format, then the first with a card type | same reason |
| `PATCH edition_id` | 404 unknown / retired, 422 over a cart ID | also 422 for an edition of another game or platform | a stale page must not adopt another game's format |
| Status totals | pending keys | `pending_keys` (Needs match) and `unresolved_keys` (never searched) | they are different queues |
| Needs match UI | `MetadataPicker` pre-filled with candidates | stored candidates as one-press links beside an unmodified picker | the picker has no initial-results prop; changing a shared component was out of scope |

Not verified live: the admin pages were checked by component tests only.
Booting the API needs Neon at `0005` (`schema_check` refuses otherwise) and
a Google sign-in. The deploy-order functional check covers it.

Environment note: a fresh install of `requirements-dev.txt` resolves
SQLAlchemy 2.1, which no longer installs `greenlet`; the async engine then
fails to import. It was installed into the worktree venv by hand, and a
separate task was offered to pin `sqlalchemy[asyncio]`. CI installs fresh,
so it may hit the same failure on this branch's PR.

### Finish gate — ultra review, 2026-09-25

Five parallel reviewers (plan alignment, correctness, security,
performance, tests and dead code) and one adversarial verifier: of 45
findings, 23 confirmed, 14 partly, 8 refuted or overstated. Every
confirmed and partly finding was fixed on the branch, except the decisions
below; each fix is its own commit after `5914d7a`.

| Fixed | Finding |
|---|---|
| `ed43e65` | **Security:** `httpx2` logged every request URL at INFO, so the Sheets key -- and, already on main, ComicVine's `api_key` and the Twitch client secret -- reached Render's logs in plain text |
| `90593bb` | One failed Limited Run product page aborted the whole refresh; walks had no page cap; malformed products failed a store |
| `d84d496` | A non-JSON Sheets answer or a malformed tracker game became a 500 |
| `5152d48` | The robots matcher backtracked exponentially on star-heavy patterns (108 s measured); the tag stripper was quadratic |
| `d295184` | Runs committed only at the end: an exception answered 500 and left no failed run; a restart left no trace; the stale rule could never fire. Also one query for the failure streaks, the no-platform total, and `/resolve` capped at 200 |
| `f96a7c6` | Two N64 games with one title (Bomberman 64: 3451 and 80368) crashed the ingest's match flush, and propagate overwrote one's id; an unknown IGDB id could be linked; unbounded stale refetches and per-row lookups |
| `df40b6e` | A platform set by hand in Needs match was undone by the next store refresh |
| `b92f7b9` | Long ship windows, impossible-date fallthrough, and "Nov." in a pre-order close date |
| `abbeb8b` | Needs match and disagreements never reloaded after a press; interrupted runs; the failure count was hover-only; the registry line ignored region, cart ID and link changes |
| `74e4e07` | A redirect off a store's site skipped robots.txt and the throttle |
| `bb01f4b`, `81eb14b` | Tests importing other test modules; a leak test that could not see a join; sync's never-erase behaviour unpinned |

Decisions recorded rather than changed:

- **Sync reads the sheet only, never `switch2-tracker`** (spec §5 said
  "nscollectors first"). The tracker is a cross-check with no cart IDs;
  writing an owner's copy from it would let the weaker source relabel. A
  game only the tracker lists shows in the collapse, not on the copy.
- **"complete on disc" is `disc`, not `game_card`** (spec step 3 listed both
  under full cartridges). A disc is not a cartridge; only a Switch or N64
  listing that says "disc" is affected, and none does.
- **The N64 ingest uses the IGDB adapter's own User-Agent and throttle**, as
  spec §3 has every IGDB call do; the courtesy rules are for scraped hosts.
  (Refuted as a finding by the verifier.)

**C9, decided by the owner 2026-09-25:** the sync takes physical copies
only (and copies with no owned format recorded), not digital or
subscription ones, which have no card -- a deviation from spec §5's
`owned_format IS DISTINCT FROM 'none'`. The owner also confirmed the whole
collection is full cartridges, so the deploy order bulk-sets every owned
Switch 2 copy's format before the first registry refresh; otherwise a blank
format would be filled with a retail box's Game-Key Card.

### Finish gate — re-verification of the fixes, 2026-09-25

An independent reviewer re-read `5914d7a..3a0159f`. Fixed:

| Fixed | Finding |
|---|---|
| `2e183e4` | A rollback in a later source expired earlier sources' run objects, and the registry-sync failure path read an expired id inside its own `except`. Routes now answer from `RunOut` snapshots and re-read rows by id. Re-keying is limited to keys with no platform |
| `90a1793` | A walk stopped by a repeated page still archived what it never reached (now `page_ignored`); WooCommerce's no-new-items check spanned categories; a product that failed to explode failed its store |
| `a9524e6` | The widened close phrase could read a date from the next sentence |

Kept as a trade-off: a listing whose store stops stating a platform keeps the
one on file (`catalogue.upsert_listings`). A platform set by hand in Needs match
is indistinguishable from one a store stated earlier and then dropped; keeping
it is preferred to returning the listing to Needs match on every refresh. A
store that restates a platform always wins.
