# Tracker Enhancement E7a — Shelf & Showcase — Implementation Plan

Spec: `docs/planning/2026-09-22-tracker-enhancement-design.md`, §4 and §9.
This plan covers **E7a only** (spec §11). E7b–E8c get their own plans once
this ships; each depends on what E7a's components turn out to look like.

**Goal:** Make `/collection` look like a tracker rather than a list — hero
numbers, a favorites row, a dense poster grid with stars under the covers,
chip filters and one sort, stats that hide when empty, an item page — and
give the admin shelf the same components with inline rate / favorite /
status / publish controls, so the 68 unrated games can be rated from the
shelf instead of 68 edit pages.

**Branch:** `tracker-shelf` (worktree at
`~/Developer/joey-haas.dev-worktrees/tracker-shelf`)

## Global constraints

- **No schema change.** Every field E7a reads already exists on `Item`.
  `platform`, `physical_format`, `pinned_at`, `release_date` and everything
  else in spec §5.2 is E7b; if a task seems to need one, the task is wrong.
- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- `public.py` stays an allowlist. Every public field is named by hand on the
  response model and a test pins each model's field set; the snapshot
  allowlists grow one key at a time; the leak tests are extended before a
  field is added. Never public: `notes`, `owned_format` (only the derived
  `wanted` boolean), `source_metadata`, `similar_games`, `external_source`,
  `external_id`, `is_public`, any row with `is_public = false`.
- `/{item_id}` routes are typed `uuid.UUID`. In `public.py` the new
  `/items/{item_id}` is declared last, after the literal `/items` and
  `/stats`, with a test that `/stats` still answers 200.
- Style with tokens from `index.css` only — never a raw hex in a component or
  an inline style, and new tokens are declared in **both** theme blocks.
  Contrast is measured, not eyeballed (Task 2).
- Fonts: no new weight without the matching `@fontsource` import in
  `main.jsx`.
- `localStorage` reads and writes go through the guarded helpers in
  `lib/shelf.js`; keys are namespaced per page (`shelf.public.*`,
  `shelf.admin.*`) so the two pages' defaults never collide; page test files
  call `localStorage.clear()` in `afterEach`.
- Nothing is hover-only. Anything revealed on hover is also revealed by
  `:focus-within`, which means it is revealed with `opacity`/`clip-path`,
  never `display: none` or `visibility: hidden` (a hidden control cannot
  receive focus). Every non-text mark carrying an accessible name has
  `role="img"` — `aria-label` on a bare `<span>` or `<div>` is ignored.
- `window.matchMedia` does not exist in jsdom: viewport-dependent rendering
  goes through `lib/useMediaQuery.js`, which returns `false` when it is
  absent, and tests stub the hook.
- Public pages other than `/collection*` make no API calls. The item page is
  under `/collection`, so it may.
- Run repo-native format + lint after every file change:
  `./.venv/bin/ruff format . && ./.venv/bin/ruff check .`,
  `npm run format && npm run lint`.
- Commits: conventional, ≤5 files, independently valid.

---

## Task 1 — Public API: item detail, new list fields, richer stats

**Files**
- Modify: `backend/public.py`
- Modify: `backend/tests/test_public.py`

**Interfaces produced**
- `PUBLIC_METADATA_FIELDS = ("genres", "community_score", "platforms")` for
  the list; `PUBLIC_DETAIL_METADATA_FIELDS = PUBLIC_METADATA_FIELDS +
  ("description", "community_votes")` for the detail. The similarity
  helper reads `similar_games` from the snapshot directly and never
  serializes it.
- `PublicItemOut` gains `platforms: list[str]` (`[]` when the snapshot has
  none — TMDB and Comic Vine rows), `created_at: datetime`, `wanted: bool`
  (`owned_format == NONE`; NULL is owned, spec §5.2).
- `PublicItemCard(id, type, title, cover_url)`.
- `PublicItemDetailOut(PublicItemOut)` adds `description: str | None`,
  `community_votes: int | None`, `times_completed: int`,
  `started_at: date | None`, `similar_in_collection: list[PublicItemCard]`.
- `GET /api/public/items/{item_id}` → `PublicItemDetailOut`; 404 for an
  unknown id **and** for a non-public one (a 403 would confirm a private
  row exists).
- `PublicStatsOut` gains `owned: int` (public rows with `wanted` false),
  `finished_this_year: int` (`finished_at` in the current UTC calendar
  year), `average_rating: float | None` (one decimal; null, not 0, when
  nothing is rated).

**Acceptance criteria**
- [ ] Two tests pin the models: `set(PublicItemOut.model_fields) == {...}`
      and the same for `PublicItemDetailOut`, listing every field by name.
      Adding a field means editing the test — that is the point.
- [ ] The list leak test asserts `notes`, `owned_format`, `source_metadata`,
      `description`, `similar_games`, `external_source`, `external_id`,
      `is_public` are absent; the detail leak test asserts the same set
      minus `description`.
- [ ] `similar_in_collection`: other public items whose snapshot
      `similar_games` contains this item's `external_id` or vice versa —
      both `external_source = igdb`, comparing `str(similar_id) ==
      external_id` because snapshot ids are ints and `external_id` is a
      string — plus public items sharing at least two genres; self
      excluded; capped at eight; rating desc then title. Computed in Python
      over one query of the public rows.
- [ ] `/stats` answers 200 after the uuid route is added (route-order
      test).
- [ ] `finished_this_year` is computed in SQL beside the existing
      aggregates; `owned` counts `owned_format IS DISTINCT FROM 'none'`.

**Steps**
1. Extend `_seed` with the rows the new tests need: an IGDB game with
   `external_source="igdb"`, `external_id`, `source_metadata.similar_games`
   and `platforms`; a second public IGDB game listed in the first's
   `similar_games`; a third sharing two genres with the first; a fourth
   sharing one; a wanted row (`owned_format=NONE`); a row with `started_at`
   and `times_completed`; a private row with an `external_id`.
2. Write the tests: model pins, leak sets, `wanted` derivation (none / NULL
   / physical), detail 200, detail 404 unknown, detail 404 private,
   similarity (link, reverse link, two genres, one genre is not enough, cap,
   self excluded), stats additions, route order.
3. Run — expect failure.
4. Add the constants, models, helpers, the detail route (last), the stats
   columns.
5. Tests to green; format; lint; full backend suite.
6. **Commit:** `feat(public): add item detail route and the fields the shelf needs`

---

## Task 2 — Design tokens, the wide layout, and the outlet context

**Files**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/layouts/RootLayout.jsx`
- Modify: `frontend/src/layouts/RootLayout.test.jsx`

**Interfaces produced**
- Tokens on `:root` and `[data-theme='light']`: `--rating` (= `--accent`),
  `--status-active` (= `--accent-2`), `--status-finished`,
  `--status-backlog`, `--status-abandoned`, `--overlay`, `--skeleton`,
  `--grid-gap: 1rem`.
- `.page.page-wide { max-width: 72rem }`, applied by `RootLayout` when the
  pathname starts with `/collection` or `/admin/collection`, or equals
  `/admin/play-next`, `/admin/discover`, `/admin/radar` (a `WIDE_ROUTES`
  list beside the existing `isHome` logic).
- `<Outlet context={{ signedIn: Boolean(signedIn) }} />` so routed pages
  can read the session state the layout already fetches, always as a
  boolean.

**Acceptance criteria**
- [ ] Every new token exists in both theme blocks; the CSS has no raw hex
      outside the two token blocks.
- [ ] Measured with a small Node script in the shell (not committed), per
      spec §4.2: each of the four status tokens clears **3:1 against
      `--surface`** in both themes, and `--status-backlog` also clears 3:1
      against `--border`. Record the ten ratios (four tokens × two themes
      against `--surface`, backlog × two themes against `--border`) in the
      commit message.
      This deliberately tightens §4.2's original "muted, low-contrast" note
      for abandoned — a mark that cannot be seen is not a mark.
- [ ] `RootLayout.test.jsx` proves `page-wide` is present on `/collection`
      and `/admin/collection/abc`, absent on `/about` and `/`; and, with a
      probe child route whose element renders
      `String(useOutletContext().signedIn)`, that the context reads `false`
      before and `true` after a mocked `/api/auth/me` resolves `ok`.
- [ ] Nothing else on the site moves: the prose column, header, nav and
      footer are unchanged on non-wide routes.

**Steps**
1. Extend `RootLayout.test.jsx` (class on wide/non-wide routes, outlet
   probe).
2. Run — expect failure.
3. Pick candidate values; measure; adjust until every pair clears.
4. Add the tokens and `.page-wide`; add `WIDE_ROUTES` and the outlet
   context.
5. Tests, build, format, lint.
6. **Commit:** `feat(shelf): add shelf tokens, a wide page layout, and the session outlet context`

---

## Task 3 — Pure helpers, `Stars`, `useMediaQuery`

**Files**
- Create: `frontend/src/lib/shelf.js`, `frontend/src/lib/shelf.test.js`
- Create: `frontend/src/lib/useMediaQuery.js`
- Create: `frontend/src/components/Stars.jsx`
- Modify: `frontend/src/pages/Collection.jsx` (import `Stars` instead of
  defining it; nothing else changes)

**Interfaces produced**
- `sortItems(items, key, direction, seed)` — keys `added` (`created_at`),
  `finished` (`finished_at`), `rating`, `year`, `title`, `random`. Pure and
  total: nulls last in every key and direction; `title` uses
  `localeCompare` with `numeric: true`; `random` is a mulberry32 shuffle
  over `seed` and ignores `direction`; never mutates its input.
- `countBy(items, field)`, `filterItems(items, value)` where `value = {
  type: string|null, status: string|null, wanted: boolean, unrated:
  boolean }` — `type` and `status` are single-select with `null` meaning
  all; `wanted` and `unrated` (finished-and-unrated, for the admin nudge)
  are independent toggles ANDed on top.
- `readShelfPref(key, fallback)` / `writeShelfPref(key, value)` — guarded
  storage; return the fallback when storage throws.
- `STATUS_LABEL = { backlog: 'Backlog', active: 'Playing', finished:
  'Finished', abandoned: 'Abandoned' }` and `STATUS_ORDER`.
- `useMediaQuery(query)` — `false` when `window.matchMedia` is undefined;
  subscribes otherwise.
- `<Stars rating />` — the exact markup `Collection.jsx` renders today.

**Acceptance criteria**
- [ ] `shelf.test.js` covers every sort key in both directions with nulls,
      a fixed seed reproducing the same shuffle twice and a different seed
      a different one, `filterItems` for each field alone and combined,
      `countBy`, and the storage helpers against a stubbed
      `localStorage` that throws.
- [ ] `Collection.test.jsx` passes unchanged after the `Stars` move.

**Steps**
1. Write `shelf.test.js`.
2. Run — expect failure.
3. Write the helpers, the hook, `Stars`; switch the import.
4. Tests, build, format, lint.
5. **Commit:** `feat(shelf): add the shelf helpers, Stars, and a jsdom-safe media query hook`

---

## Task 4 — `PosterCard` and `PosterGrid`

**Files**
- Create: `frontend/src/components/PosterCard.jsx`, `PosterCard.test.jsx`
- Create: `frontend/src/components/PosterGrid.jsx`, `PosterGrid.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces produced**
- `<PosterCard item to actions dimmed />` — the poster **and** the title are
  one `<Link to>`; `to` is supplied by the page (public: always
  `/collection/:id`; admin: the edit page for private items, Task 9).
  `actions` is an optional render prop whose output is a **sibling** of the
  link. Renders the status mark (top-left square in the status token,
  `role="img"` with the label from `STATUS_LABEL`; no mark for backlog),
  the favorite heart (top-right, `--rating`, `role="img"` "Favourite"),
  title (two-line clamp), `Stars`, then `year · creator` muted. `dimmed`
  sets `data-dimmed` (CSS: 45% opacity). On pointer devices, hover and
  focus-within lift the card and darken the poster with `--overlay`.
- `<PosterGrid items size renderCard />` — presentational only. CSS grid
  `repeat(auto-fill, minmax(var(--poster-min), 1fr))` with `gap:
  var(--grid-gap)`. `.poster-grid` declares `--poster-min: 8.5rem` itself
  (so the current `Collection.jsx` markup, which sets no `data-size`, keeps
  a valid grid through the Task 4 and 5 commits); `[data-size='compact']`
  overrides it to `6rem`; **under 34rem it is 6rem for both**, so 375px
  (21.4rem inner) fits three across.

**Acceptance criteria**
- [ ] `PosterCard`: the action button's closest `a` is `null`; the status
      mark is found by role `img` and name; no mark for backlog; heart only
      when `favorite`; `data-dimmed` when `dimmed`.
- [ ] `PosterGrid` renders `renderCard(item)` for every item and sets
      `data-size`; the media rule is CSS and is checked in the manual pass.
- [ ] `Stars` markup inside the card matches what `Collection.test.jsx`
      already asserts.

**Steps**
1. Write both test files.
2. Run — expect failure.
3. Build the components; add `.poster-card`, `.status-mark`, `.poster-grid`
   rules (replacing the current `.poster-grid` block) and the 34rem
   override.
4. Tests, build, format, lint.
5. **Commit:** `feat(shelf): add PosterCard and PosterGrid`

---

## Task 5 — `FilterChips` and `SortControl`

**Files**
- Create: `frontend/src/components/FilterChips.jsx`, `FilterChips.test.jsx`
- Create: `frontend/src/components/SortControl.jsx`, `SortControl.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces produced**
- `<FilterChips groups value onChange />` — `groups` is `[{ key: 'type',
  options: [{ value, label, count }] }, { key: 'status', … }]` plus
  standalone toggles (`Want`, and in admin `Finished, unrated`) passed as
  `toggles: [{ key: 'wanted', label, count }]`; `value` is the
  `filterItems` shape from Task 3; counts come from the unfiltered list.
  Each chip is a `<button aria-pressed>`; zero-count chips are hidden; rows
  wrap on desktop and scroll horizontally under 34rem (CSS only).
- `<SortControl value direction seed onChange onShuffle />` — options
  Recently added · Recently finished · Rating · Release year · Title ·
  Random, a direction toggle (hidden for Random), and an explicit
  **Shuffle** button shown when `value === 'random'` (a `<select>` fires no
  change on re-selecting the current option). Renders as a `<select>` when
  `useMediaQuery('(max-width: 34rem)')` is true, buttons otherwise; the
  Shuffle button exists in both variants.

**Acceptance criteria**
- [ ] Chips: hidden at zero, `aria-pressed` reflects `value`, clicking the
      pressed chip clears it (single-select with implicit All), toggles
      are independent.
- [ ] Sort: selecting Random hides direction and shows Shuffle; Shuffle
      calls `onShuffle`; with the hook stubbed to `true` the control is a
      `<select>` and still has Shuffle.

**Steps**
1. Write both test files (stub `useMediaQuery` via `vi.mock`).
2. Run — expect failure.
3. Build the components; add `.chip-row`, `.chip`, `.sort-control` rules.
4. Tests, build, format, lint.
5. **Commit:** `feat(shelf): add FilterChips and SortControl`

---

## Task 6 — Rebuild the public collection page

**Files**
- Create: `frontend/src/components/ShelfToolbar.jsx`, `ShelfToolbar.test.jsx`
- Modify: `frontend/src/pages/Collection.jsx`
- Modify: `frontend/src/pages/Collection.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces consumed**
- `GET /api/public/items`, `GET /api/public/stats` (Task 1); Tasks 3–5.

**Interfaces produced**
- `<ShelfToolbar filters sort size dim onChange … />` — one row composing
  `FilterChips`, `SortControl`, the size toggle (Comfortable / Compact) and
  the Dim finished toggle. The **page** owns the state and persistence:
  public keys `shelf.public.size` (default `comfortable`),
  `shelf.public.dim` (default off), sort/filter unpersisted, `seed` in
  state (initial `Date.now()`, replaced on Shuffle).

**Acceptance criteria**
- [ ] **Hero numbers** from stats: `owned · finished · finished this year`
      as large tabular numerals with small uppercase labels.
- [ ] **Favorites row**: up to four covers, rating desc then title; absent
      when no public item is a favorite.
- [ ] **Stats v2**, each block hidden when it has no data: a stacked status
      bar with segments in the order backlog · playing · finished ·
      abandoned, 2px `--surface` gaps, each segment `role="img"` named
      "Backlog: 50", and a legend (renders whenever `total > 0`); a ten-bar
      rating histogram in `--rating` with `average_rating` in large type
      beside it, each bar a focusable `role="img"` named "Rated 7: 3
      items" with the numeral shown on hover **and** focus; a twelve-month
      finishes strip in `--status-finished`, current month rightmost, with
      the year's total. The by-type and by-status lists and the "Recently
      finished" strip are removed — the chips, the bar, and the sort
      replace them.
- [ ] **Toolbar**: type chips, status chips, Want toggle (D1), sort with
      default Recently added desc, size and dim toggles; a card's `to` is
      `/collection/:id`.
- [ ] **Loading**: a skeleton grid of twelve `--skeleton` cards plus the
      existing "waking the server" line after two seconds. Error state
      unchanged.
- [ ] The TMDB attribution test passes verbatim; IGDB and Comic Vine lines
      stay.
- [ ] Existing tests are updated, not deleted: every behaviour they assert
      still has a test. `afterEach` adds `localStorage.clear()`.
- [ ] Empty collection: hero row, favorites, stats, toolbar do not render;
      "Nothing here yet." does.

**Steps**
1. Update `Collection.test.jsx` fixtures with the new fields; add tests for
   hero numbers, favorites present/absent, each stats block's rule and
   accessible names, chip counts and Want, sort order changes, Shuffle
   (assert the `seed` prop passed to `SortControl` changes — never that
   two shuffles of a small fixture differ, which is flaky), size and dim
   persistence (including a throwing storage), skeleton count, card
   links. Write `ShelfToolbar.test.jsx`.
2. Run — expect failure.
3. Rebuild the page on the components; add CSS for the hero row, favorites
   row, status bar, histogram (bars sized by custom properties as today),
   finishes strip, skeleton.
4. Tests, build, format, lint. Manual check at 375px: three posters across,
   chips scroll, sort is a select with Shuffle.
5. **Commit:** `feat(shelf): rebuild the public collection page on the shelf components`

---

## Task 7 — Public item page

**Files**
- Create: `frontend/src/pages/Item.jsx`, `Item.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Interfaces consumed**
- `GET /api/public/items/{id}` (Task 1); `useOutletContext()` (Task 2);
  `PosterCard`, `Stars`.

**Acceptance criteria**
- [ ] Route `collection/:id` in `App.jsx`, before `*`.
- [ ] `const { signedIn = false } = useOutletContext() ?? {}` — the page
      renders outside the layout without throwing.
- [ ] **Hero**: a 12–14rem band whose background is the item's own
      `cover_url`, blurred and dimmed with `--overlay` in CSS; the
      unblurred cover overlaps the band's bottom edge on the left; title,
      year, creator, and the status in words ("Finished · June 2026") on
      the right. No cover → `--surface` band and the `CoverImage`
      placeholder.
- [ ] **Chips**: genres, then the snapshot's other platforms in
      `--text-muted`. The copy's own platform chip and the format chip are
      E7b and are not stubbed.
- [ ] **Description**: when present, rendered with a six-line clamp class
      and a "More" / "Less" button that toggles the class — always shown
      when a description exists (overflow cannot be measured in jsdom, and
      a button that does nothing on a short description is harmless).
      Absent entirely when the snapshot has none.
- [ ] **Tiles**: Rating (stars + numeral, or "Not rated"); Community
      (`community_score` out of 100 and the vote count; hidden when null);
      Played (`times_completed`, `started_at` → `finished_at` when present).
      No time-to-beat tile (E7b).
- [ ] **More from this shelf**: up to eight `PosterCard`s from
      `similar_in_collection`; absent when empty.
- [ ] 404 from the API renders `NotFound`; the cold-start message pattern
      is reused.
- [ ] When `signedIn`, an "Edit" link to `/admin/collection/:id` in the
      hero; otherwise nothing, and no fetch of `/api/auth/me` from here.

**Steps**
1. Write `Item.test.jsx`, rendering the page inside `<MemoryRouter
   initialEntries={['/collection/<id>']}><Routes><Route element={<Outlet
   context={{ signedIn }} />}><Route path="/collection/:id" element={<Item
   />} /></Route></Routes></MemoryRouter>`: every block from a detail
   fixture, each block hidden when its data is absent, More/Less toggles
   the clamp class, 404 path, Edit link only when `signedIn`.
2. Run — expect failure.
3. Build the page; add the route; CSS for the hero band, overlap, tiles,
   clamp.
4. Tests, build, format, lint.
5. **Commit:** `feat(shelf): add the public item page`

---

## Task 8 — `statusTransition` and `QuickRate`

**Files**
- Create: `frontend/src/lib/statusTransition.js`, `statusTransition.test.js`
- Create: `frontend/src/components/QuickRate.jsx`, `QuickRate.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces produced**
- `statusTransition(item, nextStatus, today) -> patchBody` — pure. A prior
  finish is `item.finished_at != null || item.times_completed > 0` (the
  status alone cannot say: a replay arrives as `active → finished`).
  Choosing `finished`: `times_completed = priorFinish ? n + 1 : 1`,
  `finished_at = item.finished_at ?? today`, `status`. Any other status
  sends only `{ status }`. `today` is a local `YYYY-MM-DD` string (the
  column is a date).
- `<QuickRate value onChange />` — `role="radiogroup"` of ten
  `role="radio"` half-star targets with roving tabindex (one tab stop per
  card; arrows move, Space/Enter select), `aria-checked` on the current
  value, names "Rate n out of 10" — except the current value, named
  "Clear rating", which sends `null`.

**Acceptance criteria**
- [ ] `statusTransition.test.js`: first finish (`1`, today), replay after a
      revert (`n + 1`, existing `finished_at` preserved), a finish with
      `times_completed` set but no date (`n + 1`, today), other statuses
      send only `status`, input never mutated.
- [ ] `QuickRate.test.jsx`: click sets, clicking the current value clears,
      arrow keys move focus within one tab stop, Space selects, names as
      specified.

**Steps**
1. Write both test files.
2. Run — expect failure.
3. Build the helper and the component; CSS for `.quick-rate`.
4. Tests, build, format, lint.
5. **Commit:** `feat(shelf): add QuickRate and the finished-status transition`

---

## Task 9 — Admin shelf

**Files**
- Modify: `frontend/src/pages/AdminCollection.jsx`
- Modify: `frontend/src/pages/AdminCollection.test.jsx`
- Create: `frontend/src/components/ShelfCardActions.jsx`,
  `ShelfCardActions.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces consumed**
- `GET /api/items`, `PATCH /api/items/{id}` (existing; accepts `rating`,
  `favorite`, `status`, `finished_at`, `times_completed`, `is_public`);
  Tasks 3–6 components; Task 8.

**Interfaces produced**
- `<ShelfCardActions item onRate onFavorite onStatus onPublish />` —
  `QuickRate`, a favorite toggle, a status `<select>`, a publish checkbox.
  On pointer devices (`useMediaQuery('(hover: hover)')` true) the panel is
  revealed on hover and `:focus-within` with `opacity`; otherwise the card
  shows one "…" `<button aria-expanded>` that opens the same panel as a
  sheet below the card (`role="dialog"`, closes on Escape and on outside
  click). Rendered through `PosterCard`'s `actions` prop, so it is a
  sibling of the link.

**Acceptance criteria**
- [ ] A **Shelf / List** toggle above the collection, persisted under
      `shelf.admin.view`, **default Shelf**. List is the existing table,
      unchanged except that its status select goes through
      `statusTransition`. Every existing table test seeds
      `shelf.admin.view = 'list'` in a `beforeEach` (or clicks List) and the
      file's `afterEach` clears storage.
- [ ] Shelf view: hero numbers computed client-side from `/api/items`
      (owned, finished, finished this year); the favorites row **always**
      rendered, with empty slots and a "Pick your favorites" hint when
      fewer than four; `ShelfToolbar` with keys `shelf.admin.size` and
      `shelf.admin.dim` (**Dim finished on by default**) plus the
      `Finished, unrated` toggle; `PosterGrid` of `PosterCard`s whose `to`
      is `/collection/:id` when `is_public` and `/admin/collection/:id`
      otherwise — a private item must never link to a public 404.
- [ ] Every affordance follows the page's reload-not-optimistic rule: a
      failed PATCH reports an error and the card shows the server's state.
      Status changes PATCH `statusTransition(item, next, today)`.
- [ ] **Nudge**: when fewer than five items are rated or favorited, a
      dismissible line above the grid — "17 finished games have no rating.
      Rating them is what makes Play Next work." (count live) — whose chip
      sets the `unrated` toggle. Dismissal lasts the session (React state).
- [ ] Bulk publish/hide controls, the add form, the picker, and the import
      link remain available in both views.
- [ ] Touch layout checked at 375px: one "…" per card, the sheet holds
      `QuickRate` at full width.

**Steps**
1. Write `ShelfCardActions.test.jsx` (hover variant vs "…" variant via the
   stubbed hook; each callback's arguments; Escape closes the sheet).
2. Extend `AdminCollection.test.jsx`: `vi.mock` `useMediaQuery` to return
   `true` for `(hover: hover)` so cards render the hover panel (the sheet
   variant is covered in `ShelfCardActions.test.jsx`); then view toggle and
   persistence, default Shelf, each affordance's PATCH body including the
   transition body,
   failed PATCH keeps server state, private card links to the edit page,
   nudge shows under five and hides at five, nudge chip filters, table
   select sends the transition body (update the existing `{status}`
   assertion).
3. Run — expect failure.
4. Build `ShelfCardActions`, the shelf view, the view toggle; route the
   table's status change through the helper.
5. Tests, build, format, lint.
6. **Commit:** `feat(shelf): add the admin shelf with inline rate, favorite, status, and publish`

---

## Task 10 — Smoke checks and docs

**Files**
- Modify: `scripts/smoke.sh`
- Modify: `CLAUDE.md`

**Acceptance criteria**
- [ ] `GET /api/public/items/00000000-0000-0000-0000-000000000000` returns
      **404 with a JSON body**, proving the route exists and misses cleanly
      rather than 422 or 500.
- [ ] `GET /api/public/stats` body contains `"owned"` and
      `"average_rating"`.
- [ ] `/collection/00000000-0000-0000-0000-000000000000` returns 200 from
      the static host — the SPA rewrite serves the nested public route on
      deep link, which local dev cannot prove.
- [ ] `bash -n scripts/smoke.sh` passes.
- [ ] `CLAUDE.md`: the Conventions section gains the shelf design system
      (tokens and the measured-contrast rule, `page-wide` and
      `WIDE_ROUTES`, the shared components in `components/`, the
      no-hover-only and `role="img"` rules, the storage helpers and key
      namespaces, `useMediaQuery` for anything viewport-dependent); the TODO
      marks E7a done and points at the spec for E7b–E8c; the Media tracker
      section notes that finished-status changes go through
      `statusTransition` in both admin views.
- [ ] **Commit:** `docs(tracker): cover the shelf routes in smoke and docs`

---

## Automated environment tests

`scripts/smoke.sh` runs unauthenticated, so it proves the public routes
exist and behave on a miss; the admin shelf is covered by vitest only.

**Passing means:** full backend suite green, full frontend suite green,
`npm run build` clean, `ruff format --check` and `ruff check` clean, no raw
hex outside the token blocks (`grep -rnE '#[0-9a-fA-F]{3,8}\b' src --include='*.jsx'`
empty), and `./scripts/smoke.sh` green after deploy with no new errors in
the Render logs.

**Manual pass before the finish gate** — the part automation cannot reach:
open `/collection` in both themes and at 375px; confirm three posters
across, the status bar's four segments read as four distinct things, stars
are legible under the posters, the skeleton appears on a cold start, and
Random plus Shuffle reorders. Open an item page from a card. Sign in, open
`/admin/collection` (Shelf by default), rate three finished games from the
cards, favorite four, change one backlog game to finished and confirm its
`times_completed` is 1, then confirm `/collection` shows the favorites row
and a rating histogram with an average. On a phone or in device emulation,
confirm the "…" sheet opens and `QuickRate` is usable in it.

## Zones

```
Zone 1 (auto): tasks 1–10
CHECKPOINT — batch review + finish gate
```

One zone. No migration, no IaC or CI change, no env files, nothing
destructive, nothing in the deploy path beyond application code and the
smoke script.
