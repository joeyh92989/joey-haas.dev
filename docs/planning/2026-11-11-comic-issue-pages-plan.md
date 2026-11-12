# Comic issue pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every issue and every collected edition of a comic series gets a cover on the public series page and a public page of its own, with its cover, facts and Comic Vine description.

**Architecture:** A new `comic_issues` table holds every Comic Vine issue of a series (number, cover, description), filled page by page by a budgeted sync job. Ownership stays where it is (range text on `items`) and is joined in when read, so the skip rules don't move. Three new public endpoints feed a cover wall on `/shelf/<id>/`, an issue page at `/shelf/<id>/<n>/` and an edition page at `/shelf/<id>/ed-<from>-<to>/`. An edition can optionally be linked by hand to its Comic Vine record.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic (applied by hand to Neon), pytest; React 19, react-router v8, Vitest + Testing Library; GitHub Actions nightly.

**Spec:** `docs/planning/2026-11-11-comic-issue-pages-design.md` (chosen mockup: `docs/planning/mockups/2026-11-11-comic-issue-pages/chosen.html`). Builds on the merged series display work (`2026-11-11-comic-series-display-design.md`, joeyh92989/joey-haas.dev#150).

## Decisions the spec left to Code

| Question | Decision | Why |
|---|---|---|
| Data shape | New `comic_issues` table, PK `(item_id, number)` | `/api/public/items/{id}` loads every public row in full (`public.py:691`). Every issue plus its description in `source_metadata` would add hundreds of KB to every public request. A table gives a stable key and lets the sync write page by page. |
| Issue numbers | Whole numbers 1–9999 only, as `comics.issue_number` already accepts | Ownership ranges are integers. `#0`, `#½` and `#1.MU` are not stored (Review Focus 1). |
| Fetching | `POST /api/comics/issues/sync?budget=N`: stalest series first, 1 request per 100 issues, the existing 1 s `Throttle` | Comic Vine allows 200 requests per resource per hour (https://comicvine.gamespot.com/api/). With the nightly budget at 120 and `refresh_all` using about one request per followed series, the `/issues` resource stays under that. New series also sync on create and on "Refresh from Comic Vine". |
| Description | Comic Vine HTML converted on the server into plain-text paragraphs (`list[str]`) | No Comic Vine markup ever reaches the DOM (Review Focus 3). |
| Images | `cover_url` = `medium_url` (wall, strip), `large_url` = `super_url` (page), both `loading="lazy"` except the page's main cover | Same key the series cover already uses. Task 1's probe records the real sizes. |
| Edition addresses | Slug `ed-<from>-<to>`, with `-2`, `-3` appended to later duplicates in stored order | Editions have no id (`comics.py:139`). A range-based slug survives reordering. |
| Edition cover and description | Optional `cv_id` on an edition, set from a Comic Vine issue search on the series edit page. The server then fetches and stores `cover_url`, `large_url` and `description`. Unlinked editions use the first collected issue's cover and the no-description line. | Joey chose this on 11 Nov 2026. Comic Vine has no field linking a trade to its issues. |
| Series with no issue rows | The public series page keeps today's `RunBox` cells | Series added through intake or the importer have no Comic Vine list until synced. They never show a blank wall. |
| Signed-in toggles on the series page | `RunBox mode="toggle"` on `/shelf/<id>/` is replaced by the wall. Toggling moves to the issue page; the admin series edit keeps its cells. | Spec: the box becomes a wall, and the issue page holds the owner controls. **Flag for review: this removes the quick-toggle from the public series page.** |
| Prerender | Heads for every issue and edition page, from a new snapshot file `comic-issues.json`. Slash form only, no `render.yaml` rule. | Same as `/shelf/<id>/` (CLAUDE.md, link previews; `spinePaths.js` `itemPath`). |

## Global Constraints

- Python 3.12 in the backend. Run the backend tests one at a time (shared local DB).
- Style with the existing tokens only: `--chart`, `--chart-2`, `--accent-soft`, `--accent-ink`, `--run-missing`, `--hatch`, `--surface`, `--sunken`, `--line`, `--line-strong`, `--text`, `--text-2`, `--text-3`, `--accent`. No raw hex, no new tokens.
- Skips never reach any public output: not the issue page's facts, not the strip, not a snapshot.
- Paths are always the slash form: `/shelf/<id>/<n>/` and `/shelf/<id>/ed-<from>-<to>/`.
- A wall run of `BUNDLE_MIN` (12) or more consecutive missing issues not covered by an edition folds into one stack. Held books never fold.
- Grid: `auto-fill` columns of at least 112px; three columns at 400px; no horizontal page scroll at 400px.
- Copy, verbatim from the spec:
  - wall card title: "Every book in the run"
  - stack: `#61–72 · 12 missing · Show covers`, then "Fold these back up"
  - no description: "Comic Vine has no description for this issue."
  - attribution: "Cover and description from Comic Vine"
  - owner box: "Only you see these buttons."
  - buttons: `I own this` / `Owned ✓`, `Read to here`, `Skip · private`, `Read to the end`, `Edit edition`
  - pills: "Read ✓", "Owned", "Missing", "Not out yet", "Skipped · private"
  - Held as: `Single issue`, `In <label> (<kind>)`, `In <label> (<kind>) and as a single, counted once`, `Not owned`
  - Read on editions: `All of it`, `To #n`, `Not yet`
- Accessible names: `"<Series> #<n>, <State>"` on every tile. A cover inside a named tile has `alt=""`. The tick badge sits inside the named tile, so it is `aria-hidden`; any standalone mark with an accessible name gets `role="img"` (CLAUDE.md).
- Nothing hover-only: hover reveals also show on `:focus-visible` / `:focus-within`, never through `display: none` (CLAUDE.md).
- Issue and edition pages have no snapshot of their own state. While the backend wakes they show the existing "Waking the server" state, as `/shelf/<id>/` does without a snapshot.
- Comic Vine: non-commercial use only, and every page that uses its data links back to it.

## Review Focus

1. **Non-whole Comic Vine numbers** (`#0`, `#½`, `#1.MU`, annuals): skipped by the sync, never a crash or a broken route. Test in Task 3.
2. **An owned issue Comic Vine doesn't list** (owned `1–54`, but Comic Vine has no #23): the wall still draws #23 with the placeholder cover, and its page renders with the no-description line. Tests in Tasks 2 and 5.
3. **Hostile or messy description HTML** (`<script>`, `<table>`, links, `<h4>` headings, empty `<p>`): becomes plain paragraphs with no markup. Test in Task 1.
4. **Two editions with the same range**, or overlapping ranges: unique slugs, and an issue is drawn once, inside the first edition that covers it (as `boxTiles` does). Tests in Tasks 2 and 4.
5. **An issue number past the run** (`/shelf/<id>/999/`) or a non-number (`/shelf/<id>/abc/`): a 404 page, not a crash. A dated issue past `released` shows as not out yet. Tests in Tasks 5 and 7.

## Milestones

```
Milestone 1 (auto): Tasks 1–2   (no schema)
STOP: carve-out review (DB migration)
Milestone 2 (auto after OK): Task 3
Milestone 3 (auto): Tasks 4–10
STOP: carve-out review (CI workflow change)
Milestone 4 (auto after OK): Task 11
Finish gate → PR
```

**Deploy order (in the PR body):** apply migration `0016` to Neon by hand **before** merging. `schema_check.py` refuses to boot a backend whose code is ahead of its database.

Parallel-safe: Tasks 1 and 2 (backend source vs frontend lib, no shared files). Everything else is sequential.

---

### Task 1: Comic Vine source: issue pages, issue detail, issue search, description cleaner

**Files:**
- Modify: `backend/sources/comicvine.py`
- Create: `backend/sources/cv_text.py`
- Create: `backend/scripts/probe_comicvine_issues.py` (one live call that records a fixture; README note in `backend/scripts/README.md`)
- Create: `backend/tests/fixtures/comicvine_issues_page.json`, `comicvine_issue_detail.json` (recorded by the probe, key-free)
- Test: `backend/tests/test_comicvine.py`, `backend/tests/test_cv_text.py`

**Interfaces:**
- Produces:
  - `ALL_ISSUES_FIELD_LIST = "id,issue_number,name,store_date,cover_date,image,volume,description"`
  - `ALL_ISSUES_PAGE = 100`
  - `ComicVineSource.fetch_issue_page(volume_id: str, offset: int) -> IssuePage`
  - `IssuePage(issues: list[CvIssue], total: int)`
  - `CvIssue(cv_id: int, number: int, name: str | None, store_date: date | None, cover_date: date | None, cover_url: str | None, large_url: str | None, description: list[str])`
  - `ComicVineSource.fetch_issue(cv_id: int) -> CvIssue | None` (edition link; the number may be any whole number, `None` when Comic Vine has none). Returns `None` on a 404 and raises on other errors.
  - `ComicVineSource.search_issues(query: str) -> list[CvIssueHit]`, where `CvIssueHit(cv_id: int, volume_name: str, number: str, name: str | None, thumb_url: str | None, year: int | None)`
  - `cv_text.paragraphs(html: str | None) -> list[str]`

- [ ] **Step 1:** Run the probe once (`COMICVINE_API_KEY` from `backend/.env`) against one volume and one trade issue. Save both bodies as fixtures with the key stripped, and record the `image` keys and pixel sizes in the probe's README. Confirm `filter=volume:<id>` and that `description` comes back on the list endpoint. If either is false, STOP (exhausted-research stop point).
- [ ] **Step 2: Write failing tests**
  - `test_fetch_issue_page_parses_whole_numbers_only`: from the fixture, `#0`, `#1.MU` and `#½` are absent, and each remaining issue has `cv_id`, `number`, `cover_url == image.medium_url` and `large_url == image.super_url`.
  - `test_fetch_issue_page_sends_offset_and_limit`: the request carries `offset=200`, `limit=100`, `filter=volume:<id>`, `sort=issue_number:asc` (or `id:asc` if the probe shows numbers sort as strings) and `field_list=ALL_ISSUES_FIELD_LIST`.
  - `test_fetch_issue_page_refuses_foreign_volume`: as the existing `_parse_issues` guard.
  - `test_fetch_issue_404_is_none`.
  - `test_search_issues_maps_hits`.
  - `test_paragraphs`:
    - `"<p>One</p><p></p><p>Two <a href='x'>link</a></p>"` → `["One", "Two link"]`
    - `"<script>x</script><p>A</p>"` → `["A"]`
    - `<h4>` headings become their own paragraph
    - tables are dropped
    - `None` → `[]`
    - entities are decoded (`&amp;` → `&`)
- [ ] **Step 3:** Run `cd backend && ./.venv/bin/pytest tests/test_comicvine.py tests/test_cv_text.py -v`. Expected: FAIL.
- [ ] **Step 4:** Implement. `paragraphs` uses stdlib `html.parser.HTMLParser`, collects text from block elements (`p`, `h1`–`h6`, `li`, `div`), skips `script`, `style` and `table` subtrees, and collapses whitespace. The existing `Throttle` and `_get` are reused; no new HTTP code.
- [ ] **Step 5:** Run the same pytest command. Expected: PASS.
- [ ] **Step 6:** Commit `feat(comicvine): page through a volume's issues with descriptions`.

### Task 2: Frontend wall model and paths (pure functions)

**Files:**
- Create: `frontend/src/lib/coverWall.js`
- Modify: `frontend/src/lib/spinePaths.js`
- Test: `frontend/src/lib/coverWall.test.js`, `frontend/src/lib/spinePaths.test.js`

**Interfaces:**
- Consumes: `runModel`, `BUNDLE_MIN` from `lib/comicRun.js`. The public issue list shape from Task 5 (`PublicWallIssue`, `PublicWallEdition`).
- Produces:
  - `issuePath(id, n) -> '/shelf/<id>/<n>/'` and `editionPath(id, slug) -> '/shelf/<id>/<slug>/'`.
  - `editionSlugs(editions) -> string[]`: `ed-<from>-<to>` with `-2`… on duplicates. The backend mirrors it in Task 4, and both are tested against the same cases.
  - `issueState({ n, owned: Set, readTo, released, nextDated, skipped?: Set }) -> 'read'|'owned'|'missing'|'not-out'|'skipped'`. `'skipped'` only when a `skipped` set is passed (signed in).
  - `wallTiles({ issues, editions, owned, readTo, released, nextIssue, skipped }, open: Set<string>) -> Tile[]`. Each `Tile` is one of:
    - `{kind:'book', slug, edition, cover_url, readTo}`
    - `{kind:'cover', n, cover_url, store_date, state}`
    - `{kind:'stack', key, from, to, count}`
    - `{kind:'not-out', n, store_date}`
  - `neighbours(tiles, n, each = 4) -> { list: Tile[], current: number }`: cover and not-out tiles only, books expanded to their issues.

- [ ] **Step 1: Write failing tests** (`coverWall.test.js`):
  - `draws each issue once`: edition `1–6` and owned `1–8` give tiles `book(ed-1-6), cover 7, cover 8`.
  - `folds 12 missing, not 11`: missing `61–72` gives one stack `{from:61,to:72,count:12}`. Missing `61–71` gives 11 cover tiles with state `missing`.
  - `opens a stack`: `open` holds the stack key, so 12 cover tiles follow a `{kind:'fold'}` tile.
  - `held never folds`: owned `1–300` gives 300 cover tiles.
  - `an owned issue with no Comic Vine row still gets a tile` with `cover_url: null` (Review Focus 2).
  - `not out yet`: exactly one `not-out` tile, for `nextIssue.number`, last.
  - `duplicate ranges`: two editions `1–6` give slugs `ed-1-6` and `ed-1-6-2`. Issues 1–6 are drawn once, inside the first (Review Focus 4).
  - `skips stay private`: without `skipped`, no tile has state `skipped`.
  - `neighbours`: issue 3 of 1–20 gives tiles 1–7 with `current` at index 2. A book `1–6` is expanded.
  - `spinePaths.test.js`: `issuePath(5, 58) === '/shelf/5/58/'`, `editionPath(5,'ed-1-6') === '/shelf/5/ed-1-6/'`.
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/lib/coverWall.test.js src/lib/spinePaths.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. `wallTiles` follows `boxTiles` (`comicRun.js:168`) for the order and bundling rules, emitting cover tiles instead of cells.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): cover wall model and issue paths`.

**STOP: carve-out review (DB migration). Show Joey Task 3's migration before writing it.**

### Task 3: `comic_issues` table, model, upsert

**Files:**
- Create: `backend/migrations/versions/0016_add_comic_issues.py`
- Modify: `backend/models.py`, `backend/migrations/README.md`
- Create: `backend/comic_issues.py` (storage helpers only)
- Test: `backend/tests/test_migrations.py` (existing diff and down/up run), `backend/tests/test_comic_issues_store.py`

**Interfaces:**
- Produces:
  - `ComicIssue` model with columns:
    - `item_id` int FK `items.id` `ON DELETE CASCADE`
    - `number` smallint
    - `cv_id` int
    - `name` text null
    - `store_date` date null
    - `cover_date` date null
    - `cover_url` text null
    - `large_url` text null
    - `description` JSONB `list[str]`, default `[]`
    - `fetched_on` date
    - PK `(item_id, number)`
  - `items.issues_synced_on` date null: the sync's "stalest first" key. Additive.
  - `async upsert_issues(session, item_id: int, issues: list[CvIssue], today: date) -> int`: inserts or updates on `(item_id, number)`; returns the number of rows written. The first `cv_id` wins on a duplicate number within one batch.
  - `async load_issues(session, item_id: int) -> list[ComicIssue]`, ordered by number.

- [ ] **Step 1: Write failing tests**:
  - `test_upsert_inserts_then_updates`: a second call with a new name updates in place, and the row count is unchanged.
  - `test_upsert_duplicate_number_keeps_first`.
  - `test_cascade_on_item_delete`.
  - `test_migrations.py` passes unchanged: the model and migration agree, and down/up is clean.
- [ ] **Step 2:** Run `./.venv/bin/pytest tests/test_comic_issues_store.py tests/test_migrations.py -v`. Expected: FAIL.
- [ ] **Step 3:** Write migration `0016` (additive; the downgrade drops the table and the column). Add the model and the helpers using `insert(...).on_conflict_do_update`.
- [ ] **Step 4:** Run the same command, then the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): comic_issues table`.

### Task 4: Sync job, edition link, edition validation

**Files:**
- Modify: `backend/comics.py` (`validate_editions`, `edition_slugs`), `backend/comics_routes.py`, `backend/items.py` (`JOB_ROUTES`)
- Modify: `backend/comic_issues.py`
- Test: `backend/tests/test_comic_issues_sync.py`, `backend/tests/test_comics.py`, `backend/tests/test_job_token.py`

**Interfaces:**
- Consumes: Task 1 `fetch_issue_page`, `fetch_issue`, `search_issues`. Task 3 `upsert_issues`.
- Produces:
  - `async sync_series(session, source, item: Item, budget: int, today: date) -> SyncResult(requests: int, written: int, complete: bool)`: pages from offset 0 until `offset >= total` or the budget runs out. Sets `issues_synced_on = today` only when complete.
  - `POST /api/comics/issues/sync?budget=120` (budget 1–190): series that are public, linked to Comic Vine and comic-typed, ordered `issues_synced_on NULLS FIRST, id`. Returns `{ok, series: [{id, requests, written, complete, error?}], requests}`. Uses `Depends(exclusive)` like `refresh_all`. Added to `JOB_ROUTES`.
  - `_create` and `refresh_one` call `sync_series(..., budget=10)` after their existing fetch. A failed sync is logged and does not fail the create.
  - `validate_editions` keeps an optional `cv_id` (positive int). It also passes through the server-written `cover_url`, `large_url` and `description` (list of str), dropping them when `cv_id` changes or is cleared.
  - `edition_slugs(editions: Sequence[dict]) -> list[str]`, the same rule as the frontend's.
  - `GET /api/comics/issues/search?q=` returns `list[CvIssueHit]` (admin).
  - `PUT /api/comics/{id}/editions/{slug}/link` with body `{cv_id: int | null}` (admin): fetches with `fetch_issue`, then stores `cv_id`, `cover_url`, `large_url` and `description` on that edition. `null` unlinks. A missing slug is 404; Comic Vine not finding the issue is 422.

- [ ] **Step 1: Write failing tests**:
  - `test_sync_pages_until_total` (fake source, `total` 250, so 3 requests, complete)
  - `test_sync_stops_at_budget_and_resumes_stalest_first`
  - `test_sync_skips_unlinked_and_private_series`
  - `test_sync_error_is_reported_per_series`
  - `test_create_syncs_issues`
  - `test_validate_editions_keeps_cv_id_and_drops_cover_on_relink`
  - `test_edition_slugs_duplicates`: same cases as Task 2
  - `test_link_edition_stores_cover_and_description`
  - `test_link_unknown_slug_404`
  - `test_job_token_routes` updated to include the sync route
- [ ] **Step 2:** Run `./.venv/bin/pytest tests/test_comic_issues_sync.py tests/test_comics.py tests/test_job_token.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Each series' writes commit on their own, and each row is re-read `FOR UPDATE` after its fetch, as `refresh_all` does. No lock is held across a Comic Vine request.
- [ ] **Step 4:** Run the same command, then the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): sync every issue of a series; link editions to Comic Vine`.

### Task 5: Public endpoints and leak pins

**Files:**
- Create: `backend/public_issues.py`
- Modify: `backend/public.py` (mount), `backend/tests/test_public.py` (`PUBLIC_MODELS`)
- Test: `backend/tests/test_public_issues.py`, `backend/tests/test_public_comics.py`

**Interfaces:**
- Consumes: Task 3 `load_issues`, `comics.owned_set`, `public_comics.series_of`, `edition_slugs`.
- Produces (all public, 404 for a non-public, non-comic or unknown item; each looks up one row by id, never loading every row):
  - `GET /api/public/items/{id}/issues` returns `PublicWall{series_title, publisher, issues: [PublicWallIssue{number, name, store_date, cover_url}], editions: [PublicWallEdition{slug, kind, label, from_issue, to_issue, cover_url}]}`. An edition's `cover_url` is its own, else the first collected issue's.
  - `GET /api/public/items/{id}/issues/{n}` returns `PublicIssuePage`:
    - `series_id`, `series_title`, `publisher`, `number`, `name`, `store_date`, `cover_date`, `cover_url`, `large_url`, `description: list[str]`
    - `state: 'read'|'owned'|'missing'|'not-out'`
    - `held_as: str`
    - `edition: {slug, label, kind} | None`
    - `released: int`, `ongoing: bool`
    - `neighbours: [PublicNeighbour{number, cover_url, state}]` (up to 4 each side, plus not-out)
    - `source_url: str` (the Comic Vine page, for attribution)
    - An `n` past both `released` and the next dated issue, or out of 1–9999, is 404. An `n` that is owned or `<= released` but has no row renders with nulls and `description: []`.
  - `GET /api/public/items/{id}/editions/{slug}` returns `PublicEditionPage`:
    - `series_id`, `series_title`, `publisher`, `slug`, `kind`, `label`, `from_issue`, `to_issue`, `cover_url`, `large_url`, `description`
    - `state`, `read: 'all'|'to'|'not-yet'`, `read_to: int | None`
    - `inside: [PublicNeighbour]`
    - `prev: {slug, label} | None` and `next: {slug?, label?, number?} | None` (after the last edition, `next` is the first issue after it)
    - `source_url: str | None`

- [ ] **Step 1: Write failing tests**:
  - `test_wall_lists_issues_and_editions_in_order`
  - `test_issue_page_states`: read, owned, missing, not-out
  - `test_issue_page_held_as`: all four strings verbatim
  - `test_issue_page_owned_without_cv_row` (Review Focus 2)
  - `test_issue_page_404s` (Review Focus 5): 999, 0, private item, non-comic
  - `test_edition_page_prev_next_and_inside`
  - `test_a_skip_changes_no_issue_body`: the issue page and wall bodies are byte-identical with and without a skip on that issue
  - `COMIC_FORBIDDEN` holds for the three new models
  - The new models are added to `PUBLIC_MODELS` with exact field-set pins
- [ ] **Step 2:** Run `./.venv/bin/pytest tests/test_public_issues.py tests/test_public_comics.py tests/test_public.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Missing and skipped are one state publicly (via `series_of`), as on the series page.
- [ ] **Step 4:** Run the same command, then the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(public): issue and edition endpoints`.

### Task 6: Cover tiles and the wall on the series page

**Files:**
- Create: `frontend/src/components/CoverTile.jsx`, `BookTile.jsx`, `StatePill.jsx`, `CoverWall.jsx` (+ `.test.jsx` each)
- Modify: `frontend/src/pages/Item.jsx` (the `ComicCards` run card), `frontend/src/index.css`
- Test: the component tests, `frontend/src/pages/Item.test.jsx`

**Interfaces:**
- Consumes: Task 2 `wallTiles`, `issuePath`, `editionPath`. Task 5 `GET /api/public/items/{id}/issues`. `CoverImage`.
- Produces:
  - `<CoverTile tile size="wall"|"strip"|"inside" series current? />`: a `Link` named `"<Series> #<n>, <State>"`; `CoverImage alt=""`; frame and tick per state. A not-out tile is a `div`, not a link.
  - `<BookTile tile series />` (stacked edge; caption `Vol. One · #1–6`; `read to n` when partly read).
  - `<StatePill state />`.
  - `<CoverWall wall detail series skipped? />`: card "Every book in the run", the tiles, the stack button (`aria-expanded`), the key pills.

- [ ] **Step 1: Write failing tests**:
  - The tile's accessible name is `"Saga #58, Missing"`, and its image has `alt=""`.
  - The stack button toggles `aria-expanded`, shows 12 tiles after the "Fold these back up" tile, and folds back.
  - The not-out tile is not a link.
  - `Item.test.jsx`: with issue rows, the wall renders and `RunBox` doesn't. With an empty `issues` list, `RunBox` renders as today. While signed in, no toggle cells appear on the series page.
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/components/CoverTile.test.jsx src/components/CoverWall.test.jsx src/components/BookTile.test.jsx src/components/StatePill.test.jsx src/pages/Item.test.jsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. CSS: `grid-template-columns: repeat(auto-fill, minmax(112px, 1fr))`, and `repeat(3, 1fr)` under 480px. Missing is a 1.5px dashed `--run-missing` frame plus `filter: grayscale(1)` and reduced opacity. Not-out uses `--hatch`. `:focus-visible` matches hover. Token names only.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): cover wall on the series page`.

### Task 7: Issue page

**Files:**
- Create: `frontend/src/pages/ComicIssue.jsx`, `frontend/src/components/NeighbourStrip.jsx`, `frontend/src/components/OwnerControls.jsx`, `frontend/src/lib/comicEdits.js` (+ tests)
- Modify: `frontend/src/App.jsx` (route `shelf/:id/:part` after `shelf/:id`, dispatching numeric → `ComicIssue`, `ed-…` → `ComicEdition`, anything else → NotFound), `frontend/src/pages/Item.jsx` (`toggleIssue` moves to `comicEdits.js`)
- Test: `ComicIssue.test.jsx`, `NeighbourStrip.test.jsx`, `comicEdits.test.js`

**Interfaces:**
- Consumes: Task 5 `GET /api/public/items/{id}/issues/{n}`. The signed-in state from `RootLayout`. `GET`/`PATCH /api/items/{id}` (as `toggleIssue` does today).
- Produces:
  - `comicEdits.toggleOwned(id, n) -> Promise<void>`, `setReadTo(id, n)`, `toggleSkip(id, n)`. These read the stored row, edit the range text with the existing helpers in `lib/comics.js`, and PATCH. Adding an owned issue drops its skip, as today.
  - `<NeighbourStrip list current series />`: an `<ol aria-label="Neighbouring issues">` with the current issue `aria-current="page"`, scrolled to centre on mount.

- [ ] **Step 1: Write failing tests**:
  - Breadcrumb Comics / series / `#58`.
  - The name shows only when present.
  - The Held as and Read facts.
  - A long description shows the first paragraph and "More".
  - An empty description shows "Comic Vine has no description for this issue."
  - The attribution link points to `source_url`.
  - Signed out: no "Only you see these buttons." box and no skip text anywhere.
  - Signed in: `I own this` calls `toggleOwned`. `Skip · private` shows only when not held.
  - For an issue held only through an edition, the button reads `I own this`.
  - `/shelf/5/abc/` renders NotFound (Review Focus 5).
  - The strip has the current issue marked and the not-out tile as a non-link.
  - `comicEdits.test.js` covers the range edits.
- [ ] **Step 2:** Run `npx vitest run src/pages/ComicIssue.test.jsx src/components/NeighbourStrip.test.jsx src/lib/comicEdits.test.js src/pages/Item.test.jsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Layout: a 300px cover column at desktop. At 400px the order is strip, then cover (62% width, centred), then text. The strip scrolls inside itself (`overflow-x: auto`); the page never scrolls sideways.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): issue pages`.

### Task 8: Edition page and the edition link picker

**Files:**
- Create: `frontend/src/pages/ComicEdition.jsx`, `frontend/src/components/EditionLinkPicker.jsx` (+ tests)
- Modify: `frontend/src/components/ComicRunEditor.jsx` (a "Link to Comic Vine" control per edition row)
- Test: `ComicEdition.test.jsx`, `EditionLinkPicker.test.jsx`, `ComicRunEditor.test.jsx`

**Interfaces:**
- Consumes: Task 5 `GET /api/public/items/{id}/editions/{slug}`. Task 4 `GET /api/comics/issues/search`, `PUT /api/comics/{id}/editions/{slug}/link`. Task 7 `comicEdits.setReadTo`.

- [ ] **Step 1: Write failing tests**:
  - Kicker `Trade paperback · collects #1–6` and title `Saga, Volume One`.
  - Read: `All of it` / `To #4` / `Not yet`.
  - The "Inside this book" tiles link to `/shelf/5/1/`…
  - After the last edition, next is the first issue after it.
  - An unlinked edition shows the first issue's cover and the no-description line.
  - Signed in: `Read to the end` calls `setReadTo(id, to)`, and `Edit edition` links to the series edit page.
  - Picker: typing searches, choosing a hit PUTs the `cv_id`, and Unlink PUTs `null`.
- [ ] **Step 2:** Run `npx vitest run src/pages/ComicEdition.test.jsx src/components/EditionLinkPicker.test.jsx src/components/ComicRunEditor.test.jsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(comics): edition pages and Comic Vine linking`.

### Task 9: Prerendered heads for issue and edition pages

**Files:**
- Create: `backend` route `GET /api/public/comic-issues` in `backend/public_issues.py`
- Modify: `frontend/scripts/fetch-snapshot.mjs` (adds `comic-issues.json`), `frontend/scripts/prerender-lib.mjs` (`publicRoutes` takes `comicIssues`), the prerender entry script, `backend/tests/test_public_issues.py`
- Test: `frontend/scripts/prerender-lib.test.mjs`

**Interfaces:**
- Produces:
  - `GET /api/public/comic-issues` returns `[{item_id, series_title, issues: [{number, name, cover_url}], editions: [{slug, label, cover_url}]}]`, for public series only, with no state fields at all (no ownership, no skips).
  - `publicRoutes({..., comicIssues})` adds `{path:'/shelf/<id>/<n>', slash:true}` with title `"<Series> #<n> · <spine name>"` and the cover as the image when it is `https://`, plus the same for editions.

- [ ] **Step 1: Write failing tests**: `publicRoutes` emits `/shelf/5/58` with `slash: true` and the cover image. A missing `comic-issues.json` gives no issue routes and no crash. The backend body carries no state or skip keys (added to `COMIC_FORBIDDEN`).
- [ ] **Step 2:** Run `npx vitest run scripts/prerender-lib.test.mjs` and `./.venv/bin/pytest tests/test_public_issues.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Then check: `cd frontend && VITE_DAILY_SALT=local npm run build` writes `dist/shelf/<id>/<n>/index.html` from a local snapshot.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit `feat(prerender): heads for issue and edition pages`.

### Task 10: Docs

**Files:** `CLAUDE.md` (comics section: the issue table, sync, routes, edition `cv_id`; the migration list gains `0016`), `backend/migrations/README.md`, `backend/README.md`, `frontend/README.md` (if it lists pages), `frontend/changelog.md`.

- [ ] **Step 1:** Update the docs to match the code. Replace CLAUDE.md's "there is no issue table" and "per followed series lives in `source_metadata.issues`" lines with the table, the sync and the deploy order (apply `0016`, merge, run the sync once by hand or wait for the nightly).
- [ ] **Step 2:** Add a changelog entry under the ship date's `## YYYY-MM-DD` heading: `- Every comic issue and collected edition now has a cover on its [series page](/shelf/comics) and a page of its own, with its Comic Vine description.`
- [ ] **Step 3:** Run the full suites: `cd backend && ./.venv/bin/pytest`, then `cd frontend && npm test && VITE_DAILY_SALT=local npm run build`. Expected: green, and the build's changelog parse passes.
- [ ] **Step 4:** Commit `docs: comic issue pages`.

**STOP: carve-out review (CI workflow change).**

### Task 11: Nightly sync step

**Files:** Modify `.github/workflows/nightly.yml`.

- [ ] **Step 1:** Add `call comic-issues 300 /api/comics/issues/sync?budget=120` directly after `call comics 600 /api/comics/refresh`, with a comment on the budget and the shared `/issues` limit. Update the header comment listing what the job writes, and CLAUDE.md's **Nightly order** paragraph (the issue sync runs right after the followed comics' refresh).
- [ ] **Step 2:** Run `actionlint .github/workflows/nightly.yml` if it is installed; otherwise check the YAML parses with `python -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/nightly.yml`. Expected: no errors.
- [ ] **Step 3:** Commit `chore(nightly): sync every comic's issues within a budget`.

---

## Environment test section

Local, before the PR:

1. Backend with a real `COMICVINE_API_KEY`: run `POST /api/comics/issues/sync?budget=5` with `JOB_TOKEN` against a dev copy holding one long series. Check that its `comic_issues` rows appear and that the response reports `complete: false` and then `true` across runs.
2. Frontend dev server: walk `/shelf/<id>/`, open a stack, open an issue, move along the strip, open an edition, link one edition from the edit page. Check at 1280px and 400px, in dark and light, against `chosen.html`, with no horizontal scroll at 400px.
3. Signed out, in a private window: no owner box and no skip text on any of the three pages.

After deploy (Joey applies `0016` to Neon first):

- Run `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
- `curl -s https://api.joey-haas.dev/api/public/items/<id>/issues | jq '.issues | length'` is non-zero after the first nightly.
- `curl -sI https://joey-haas.dev/shelf/<id>/1/` returns 200 with the issue's `og:title`.
