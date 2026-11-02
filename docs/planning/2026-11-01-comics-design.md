---
status: planned
mockups: docs/planning/mockups/2026-11-01-comics/
chosen: chosen.html
---

# Comics on My Shelf: pull list, runs, and reporting (design)

Date: 2026-11-01 · Repo: joey-haas.dev · Builds on
`2026-09-01-media-tracker-barebones-design.md` (the `comic` type and the
ComicVine volume adapter in `backend/sources/comicvine.py`),
`2026-10-05-spine-next-design.md` (What's next and the nightly job) and
`2026-09-27-tracker-e8c-radar-design.md` (Radar and the Want flow). The
Ledger tokens from `2026-10-19-site-refresh-design.md` apply. Copy goes in
`content/spine.js`.

## Problem

My Shelf tracks games well and comics barely. The `comic` type exists, the
admin picker finds a ComicVine *volume* when I add one, and the public shelf
prints "Comic data from Comic Vine" in its attribution, but that is the whole
feature. Three things are missing:

1. **There is no way to find comics to buy.** Radar and Discover are games
   only. Nothing tells me which series I follow has an issue out this week,
   and nothing holds a comics want list that is more than a bare title.
2. **A series row can't say what I own.** One row per volume with a status
   and a rating can't answer "which issues of Saga do I have", "is this run
   complete", or "do I own this as trades or singles". That is the question
   a comic shelf exists to answer.
3. **The public shelf can't report on comics.** The hero numbers, stat cards
   and filters are built around cartridges and platforms. A comic in the grid
   today is a poster with no run, no publisher, and nothing to compare it to.

## Scope

**In**

- **Searching for comics to buy.** Search ComicVine for a series from the
  admin, then Follow it, Want it, or mark it Owned. A pull list of upcoming
  and just-released issues from the series I follow, with Got it / Skip.
- **Searching my own comics.** The shelf search and filters cover comics:
  publisher, run status (complete, in progress, ongoing), format (singles,
  trades, omnibus).
- **Owned issues and editions on a series row.** Issue ranges ("1–54") and
  collected editions ("Vol. 1–9", "Compendium One"), with where I have
  read to.
- **Public reporting on My Shelf.** Comics as part of the public tracker:
  series, issues owned, run completeness, publishers, reading progress,
  additions over time, and what's out this week from followed series.
- Attribution: ComicVine's required link wherever its data is shown, which
  the shelf already prints.

**Explicitly out**

- One row per issue. Issues are ranges on the series row (decided
  2026-11-01); a per-issue table is a later phase if the ranges prove too
  coarse.
- Prices, store stock, or any comics equivalent of the physical catalogue
  and store list. No comic-shop scraping.
- Grading, condition, variants, and signatures.
- Digital reading (no ComiXology/Kindle sync).
- Board games, films, and the BGG import: unchanged.
- Changes to the public/private data rules or the nightly schedule beyond
  adding the pull-list refresh to the existing job.

## Decisions so far (2026-11-01)

| # | Question | Decision |
|---|---|---|
| D1 | What does "search" mean? | **Both**: find comics to buy (ComicVine search, follow list, pull list) and search my own comics on the shelf. |
| D2 | Granularity | **Series rows carrying owned issues and collected editions**, not issue rows. |
| D3 | Where does reporting live? | **Public on My Shelf**, same standing as games. |

## Source facts the design depends on

- **ComicVine** (`comicvine.gamespot.com/api/documentation`): `/issues`
  carries `cover_date`, `store_date` ("The date the issue was first sold in
  stores."), `issue_number` and `volume`; filters take date ranges
  ("Date filters: &filter=field:start value|end value"); `limit` defaults to
  and cannot exceed 100; the docs publish no rate limit (the adapter already
  throttles to ~1 req/s and sends a custom User-Agent, which the API
  requires). Volumes carry `count_of_issues`, `publisher`, `start_year`.
  ComicVine has no collected-edition resource: a trade paperback is, when
  listed at all, another volume. So edition tracking is ours, not theirs.
- **Metron** (`metron.cloud`, client docs at `mokkari.readthedocs.io`): an
  alternative source with `store_date` range filters on issues
  (`store_date_range_after`/`_before`) and a `series_type`. Needs an
  account and API token; the client docs quote "at least 20 requests per
  minute" and 5,000/day. The site refuses automated fetches, so its terms
  for a public portfolio are **unverified**. Not in scope unless ComicVine's
  issue data turns out too thin; see Open questions.

## Design: direction B, "Longbox"

Chosen 2026-11-01 from three directions (`mockups/index.html`). The chosen
mockup is `mockups/2026-11-01-comics/chosen.html` (a copy of
`b-longbox.html`); it has Dark/Light and Desktop 1280/Phone 400 toggles and
one tab per screen. Figures in the mockups are placeholders.

### Screens

**1. `/shelf/comics`, "Comics"** — a fifth tracker tab, between Collection
and What's next (`spine.tabs.comics`). Top to bottom:

- The compact masthead and `SpineHeader` as on `/shelf`. The tagline
  changes once, in `content/spine.js`, to cover both: "A tracker for my
  physical game and comic collection: what I own, what I've finished, and
  what to play or read next." `projectsTagline` and `homeLine` follow suit
  (Code picks the shortest honest wording; the Projects card line should
  stay one line).
- **Hero numbers** (`HeroNumbers` reused): Series, Issues owned, Missing,
  Read %. Series counts owned comics only (want-list rows excluded, as
  `owned` does today). Issues owned is the sum of owned ranges. Missing is
  released-but-not-owned issues across owned series. Read % is issues read
  over issues owned.
- **Out this week** strip: the issues from followed series with a store
  date in the current Wednesday-to-Tuesday week, as cover thumbnails with
  "Series #n · publisher · date". Next week's dated issues follow on the
  same strip; a final "Later" tile lists followed series whose next issue
  has a month but no date. The strip hides entirely when nothing is dated
  within four weeks (no empty state, the heading just isn't there).
- **Four stat cards** in the existing `shelf-stats` grid: *Runs* (stacked
  bar: Complete / Up to date / Gaps, with the missing-issue total in the
  heading), *Reading* (the status bar relabelled: Reading, To read, Read,
  Dropped), *Publishers* (horizontal rows, sorted by count), *Added* (series
  added per month, last twelve months, from `acquired_at`).
- Search ("Search series"), one chip row: All · Following · Gaps · Unread
  on the shelf · Want, then Publisher chips (top three by count plus
  "More…" opening the rest). Sort: Next issue (default) · Title ·
  Publisher · Missing issues. A View toggle, Runs (default) · Covers; Covers
  is the existing `PosterGrid` with `RunBadge` on each card.
- **Series rows** (`SeriesRow`): cover thumb, title with a Following or
  Want pill, meta line (publisher · year, with an en dash after the year
  for ongoing series · shelf format and edition label · status dot and
  label, plus "read to #n" when the read marker trails what is owned), the
  **run bar**, and on the right the owned/total count (a `+` after the
  total for ongoing series) with the next issue and date, "Complete run",
  or "n missing".
- The run bar is proportional across released issues plus a hatched tail
  for ongoing series (max(3, 8 % of released) issues wide): owned segments
  in `--chart`, missing in `--line-strong`, not-out-yet as the hatch. It
  carries an `aria-label` ("54 of 72 issues owned, ongoing"); the chip
  legend above the list names the three fills once.
- Attribution footer unchanged; "Comic data from Comic Vine" is already
  there and is the required link.

**2. `/shelf/:id` for a comic** — the existing item page with comic
sections:

- Kicker "Comic · publisher · year[–ongoing]"; status and rating as today.
- Facts: Run ("11 of 14 issues so far" plus a Complete / Up to date / Gaps
  pill), Format (shelf format and edition labels), Read to ("#11", or "Not
  started"; "n on the shelf unread" when owned exceeds read), Next issue
  (when following and dated), Writer (from the ComicVine snapshot's
  `people` when present, else omitted).
- **Issues** card: one cell per issue number 1…released, plus one hatched
  cell for the next unreleased issue when dated. Cell states: read
  (`--chart` fill, `--accent-ink` number), owned (`--accent-soft` fill,
  `--chart-2` border), missing (outline only), not out yet (hatch). Legend
  under the grid. The heading's small text prints the owned ranges
  ("#1–11"). Cells are not interactive publicly; signed in, a cell click
  toggles owned (see Interactions).
- **Editions** card when any exist: kind (mono), label, "collects #a–b".
- About: ComicVine description, parsed inert as today, with the "From
  Comic Vine" link.

**3. `/shelf/next`** — a "Comics this week" section between Tonight and
"On my list", same rows as the pull list without the actions (public
rows: series, issue number, publisher, store date, "I own #a–b of n").
Comic wants join "On my list" with a "trade paperback" / "omnibus" meta
where known. Both come from `/api/public/next`, so the nightly snapshot
carries them.

**4. `/admin/pull-list`** (sidebar group Recommend, label "Pull list";
phone tab bar: under the Comics sheet):

- A ComicVine search box. Results: cover, name, publisher · start year ·
  issue count · "ended" or "ongoing", and three actions: **Follow** (adds
  the series to the follow list without a shelf row; it appears on the
  pull list), **Want** (creates a public want row, `owned_format = none`,
  exactly as Radar's Want does), **Own…** (opens the series form prefilled
  so the owned ranges can be entered).
- "Following n series · last refresh … · Edit the follow list".
- Weeks: one section per Wednesday for the next four weeks, "this week"
  marked. Rows: cover, "Series #n", "publisher · own #a–b of n". Actions:
  **Got it** (extends the owned range on the series row, creating the row
  as owned/To read if the series was only followed) and **Skip** (records
  the issue as skipped so it stops appearing; it stays a gap on the run
  bar). A row from an owned-but-not-followed series shows a quiet Follow.
- A note listing followed series whose next issue has no store date.

**5. `/admin/collection/:id` comic fields** (`ItemForm` for `type ===
'comic'`): Status (comic labels), Rating, Issues I own (ranges text,
validated), Collected editions (kind · label · collects a–b, one per
line), Read to, Format on the shelf (Singles / Trades / Omnibus), Follow
toggle, Refresh from Comic Vine. The hint under Issues shows ComicVine's
current issue count.

### Interactions

- Got it, Skip, Follow, Want and Own… respond in place with the row's
  state (Got it strikes the row through and updates the "own #a–b" text);
  errors use the existing toast/status pattern.
- Signed in on `/shelf/:id`, clicking an issue cell toggles owned → missing
  → owned; read state is set by "Read to" on the form, not by cells.
- The chip row and sort persist in the shelf prefs like the games shelf
  (`lib/shelf.js`).

### Responsive and theme

- At 400 px: hero numbers shrink (2 rem), the strip's thumbnails narrow to
  ~5.5 rem, the stat cards stack, the series row drops to two columns with
  the count and next-issue text under the run bar, and the masthead nav
  collapses as it does today. Pull-list and search-result action buttons
  wrap under the text.
- Both themes use the Ledger tokens only. The hatch is `--line-strong` on
  transparent; the owned/missing/hatch fills are non-text marks and must
  clear 3:1 against `--surface` in both themes (`--chart` and
  `--line-strong` are already measured; the hatch's stripe is
  `--line-strong`, so it inherits that).

### Accessibility

- Every run bar and issue grid has a text equivalent (`aria-label` on the
  bar; the ranges text in the Issues heading).
- Status is never colour alone: the dot always has its label.
- Chips, sort and the view toggle are buttons with `aria-pressed`; the tab
  is a `NavLink` like the others.
- The pull-list actions are real buttons with the issue in their
  accessible name ("Got it: Saga #73").

## Key decisions

- **A tab, not a switch or a mixed grid.** A (switch) made two shelves
  that must stay in step and a control that competes with the tabs. C
  (mixed grid) put On cartridge beside Publishers and mixed two card kinds
  in one grid; the game-first copy would have had to go. B keeps the games
  shelf exactly as it is and gives comics the shape their report needs.
- **Runs, not covers, are the default view.** The thing a comic shelf
  reports is gaps, and a poster grid cannot show them. Covers remain one
  toggle away.
- **Series rows with ranges, not issue rows.** Decided before the mockups
  (D2). The issue grid on the series page is rendered from the ranges plus
  ComicVine's count, so it costs no table.
- **Editions count as owned issues.** "Vol. 1–9 collects #1–54" marks
  1–54 owned; the shelf format says how. One run bar, whatever the
  binding.
- **Follow is separate from owning.** A followed series need not be on the
  shelf; a shelf row need not be followed (a complete run of an ended
  series has nothing to follow). Got it on a followed-only series creates
  the row.
- **ComicVine stays the only source.** The adapter, key and attribution
  exist; `/issues` with a `store_date` range is enough for the pull list.
  Metron is noted, not adopted.
- **Store dates are public, prices are not.** "Out this week" shows the
  issue and date, nothing about where to buy or for how much, keeping the
  existing public/private rule.

## Component inventory

**New**

- `SeriesRow` (the run-first list row) and `SeriesList`.
- `RunBar` (proportional owned / missing / not-out-yet bar; `aria-label`).
  Shared by `SeriesRow`, the Covers view's cards, and `RunBadge`.
- `RunBadge` (the "54/72+" corner badge on `PosterCard` for comics).
- `IssueGrid` (the per-issue cells on the series page; interactive when
  signed in).
- `OutThisWeek` (the public strip on `/shelf/comics`) and
  `ComicsThisWeek` (the section on What's next; same data, list layout).
- `RunsCard`, `PublishersCard`, `AddedCard` (stat cards; `ReadingCard` is
  `StatusBar` with comic labels).
- `PullList` page (`/admin/pull-list`) with `SeriesSearch` and `WeekList`.
- `ComicFields` inside `ItemForm`.

**Existing, changed**

- `SpineTabs` / `content/spine.js`: the Comics tab, the tagline, all new
  strings (status labels per type, run labels, section names, empty
  states, pull-list copy).
- `Item.jsx`: comic facts and the three comic cards.
- `Next.jsx`: the Comics this week section; wants with a format meta.
- `AdminShell`: the Pull list entry and the phone sheet.
- `PosterCard`: accepts a badge slot.
- `HeroNumbers`: already generic.

**Tokens used**: `--chart`, `--chart-2`, `--line-strong`, `--accent-soft`,
`--accent-ink`, the four `--status-*`, `--ok`, `--warn`, `--surface`,
`--sunken`. One new token, the hatch
(`repeating-linear-gradient(135deg, var(--line-strong) 0 2px, transparent 2px 6px)`),
to be named beside `--redact` in `index.css`.

## Acceptance criteria

1. `/shelf/comics` renders from the build-time snapshot first and then the
   API, like `/shelf`; it matches `chosen.html` (screen `/shelf/comics`)
   at 400 px and 1280 px in both themes.
2. The hero numbers, Runs, Reading, Publishers and Added cards agree with
   the rows: a test fixture with known ranges yields the expected Series,
   Issues owned, Missing and Read % values.
3. Every comic row shows a run bar whose segments sum to released issues
   (plus the tail for ongoing series) and whose `aria-label` states owned
   of total; a want-list row shows no bar.
4. Sort by Next issue puts dated series first in date order, then the rest
   by title; the chips Following, Gaps, Unread on the shelf and Want each
   filter to the expected fixture rows.
5. `/shelf/:id` for a comic matches the series screen of `chosen.html`:
   the Issues grid has one cell per released issue in the right state, and
   editions render when present.
6. `/shelf/next` shows "Comics this week" only when a followed series has
   a store date in the current week, and the rows carry no price or store.
7. `/admin/pull-list`: searching returns ComicVine volumes with Follow /
   Want / Own…; Got it on a week row extends the owned range (verified by
   re-reading the item) and strikes the row through; Skip removes the row
   on reload and leaves the gap.
8. The series form rejects malformed ranges ("1-3-5", "10–2") with a
   message and accepts "1–54, 60, 62–64"; editions' collected ranges mark
   those issues owned on the run bar.
9. No public response carries follow-list internals beyond what the strip
   needs (series, issue number, store date, publisher, cover); the public
   model test's field list is extended deliberately.
10. The nightly job refreshes the pull list within its existing run and
    the job-token route list test grows by exactly the new route.
11. The public attribution still prints the Comic Vine link on every page
    that shows ComicVine data, including `/shelf/next` and `/shelf/comics`.

## Open questions for Code

1. **Data shape for ranges and editions.** Columns on `items` (an
   `issues_owned` text in canonical range form plus `editions` JSONB and
   `read_to` smallint, `shelf_format` enum, `following` boolean) versus a
   small `comic_series` side table keyed by item. The columns are the
   cheaper migration and match the single-table decision; the side table
   is cleaner if `following` must exist without an item row (the Follow
   action). Recommendation: columns on `items`, and a followed-only series
   is an item row with `owned_format = none` and `is_public = false` that
   Got it promotes; check that this doesn't pollute the public want list
   (a Want is `is_public = true`, a Follow is not).
2. **ComicVine issue fetch.** Per followed series, `/issues` filtered by
   `volume:{id}` and a `store_date` range (this week minus one to plus
   four weeks), one request per series per night at the adapter's 1 req/s
   throttle. Confirm the filter accepts both keys together; fall back to
   `cover_date` ordering if `store_date` is sparse for a publisher.
   Snapshot the issue list (number, name, store_date, cover) on the item's
   `source_metadata` so the public strip never calls ComicVine.
3. **Skipped issues** need somewhere to live: a `comic_skips` list on the
   item (JSONB of issue numbers) is enough, mirroring how `pick_events`
   records never/skip for games without a new concept.
4. **Issue count drift.** ComicVine's `count_of_issues` grows; the run bar
   uses the snapshot's count, refreshed nightly for followed series and on
   "Refresh from Comic Vine" for the rest. Decide whether the public page
   should show "as of {date}" for unfollowed ongoing series.
5. **Performance.** The Comics page adds one public endpoint
   (`/api/public/comics`, rows plus stats) or extends `/api/public/items`
   with the comic fields; the snapshot script must cover whichever. The
   issue grid for a 144-issue run is 144 cells; fine, but cap cells at,
   say, 300 and fall back to the run bar plus ranges text beyond that.
6. **Metron** stays out unless ComicVine's store dates prove too thin for
   the pull list; if it is ever adopted, its terms for a public portfolio
   need reading first (its site refuses automated fetches).

---

# Plan (Code, 2026-11-01)

## Code survey: where the spec and the code disagree

Found while planning and checked against the code. Each one changes the plan
as noted.

| # | Spec says | Code says | Plan |
|---|---|---|---|
| S1 | Missing segments and the hatch use `--line-strong`, "already measured" for 3:1 | `index.css:25` marks it decorative, not held to 3:1. Measured on `--surface`: **1.73 dark, 1.66 light** | Add two tokens, `--run-missing` (outline and missing fill) and `--hatch` (its stripe), both built on the redaction stripe's mark colours, which measure **3.30 dark and 3.25 light**. Ratios are recorded beside them (task 8) |
| S2 | `HeroNumbers` is "already generic" | It takes `owned/finished/finishedThisYear` (`Collection.jsx:159`) | Refactor it to take `figures: {label, value}[]`; `/shelf` passes its three figures |
| S3 | Pull list goes "under the Comics sheet" on the phone | There is no such sheet. Recommend's items form the Picks sheet (`AdminShell.jsx:43`) | Pull list joins Recommend, so it lands in Picks automatically |
| S4 | `Item.jsx` has Facts, a Kicker and a "From Comic Vine" link | It is generic: no `FactsTable` or `Kicker`, no attribution footer | Add a comic branch that uses the existing `FactsTable`/`Kicker`, and add an attribution footer (Comic Vine) on comic pages |
| S5 | Comic wants join "On my list" | `next_load.load_next` selects `Item.type == GAME` only | Widen the wanted load to comics. Every game-only section stays game-only |
| S6 | Chip and sort prefs persist "like the games shelf" | `/shelf` persists only size and dim | Persist the comics chips, sort and view under `shelf.public.comics.*` |
| S7 | Search results show "ended" or "ongoing" | ComicVine volumes have no status field | Derive it: **ongoing** = an issue with a store date in the last 120 days or in the future. Unknown until a series has been fetched once, so search results show the issue count only |
| S8 | `/shelf/next` matches the mockup | `chosen.html` has no Next screen | Comics this week reuses the `NextRow` layout. No new visual |

## Answers to "Open questions for Code"

1. **Data shape: columns on `items`** (migration `0010`, additive):
   - `issues_owned`: text, canonical ranges.
   - `issues_skipped`: text, same form.
   - `editions`: JSONB, `[{kind, label, from, to}]`.
   - `read_to`: smallint.
   - `shelf_format`: new enum `comic_shelf_format` with values singles, trades, omnibus.
   - `following`: boolean, not null, default false.

   A followed-only series is a row with `owned_format = none` and `is_public = false`. Got it promotes it to `physical`, status backlog ("To read"). Public want lists already key on `is_public`, so a Follow never reaches them; a test pins that (task 7). One wrinkle: the admin shelf lists the row as a private want, and it shows a Following pill there.
2. **Issue fetch: one request per series**, `/issues/?filter=volume:{id}&sort=store_date:desc&limit=10` with its own `field_list`. That avoids depending on `volume` and a `store_date` range combining in one filter, which the docs don't confirm.
   - The ten latest issues cover the next four weeks of solicitations, the most recent release (for "ongoing"), and the released count. Released = `count_of_issues` minus the fetched issues dated after today.
   - Task 1 records the fixture live **before** any parsing code, so that the `volume` filter is confirmed against the real API.
   - Snapshot on `source_metadata.issues`: `[{number, name, store_date, cover_date, cover_url}]`, plus `released`, `ongoing` and `fetched_on`.
   - Non-integer issue numbers ("½", "1.MU") are listed but never enter ranges or counts.
3. **Skips** go in `issues_skipped`, in the same range text as owned, not JSONB. One parser handles both.
4. **Count drift:** the series page's Run fact adds "as of {Mon YYYY}" for a series that is not followed and is ongoing. The shelf row does not, because the row has no room for it and the series page carries it.
5. **Endpoints:**
   - `GET /api/public/comics` returns `{series, stats, this_week}`, with an optional `comics.json` snapshot.
   - The detail route gains `comic: PublicComicDetail | null`.
   - `/api/public/next` gains `comics_this_week`, kept **optional** in the frontend's `isNextBody` so older snapshots still validate.
   - The issue grid is capped at 300 cells. Beyond that it shows the run bar plus the ranges text.
   - The cache fingerprint already digests every `items` row, so the new columns are covered and no new table joins it.
6. **Metron** stays out.

**Other decisions this plan makes** (overrule any of them at the gate):

- **D4: A week is Wednesday to Tuesday, in UTC days**, matching the cache's day key and Tonight's UTC days.
- **D5: Only public series are shown publicly.** A followed series reaches "Out this week" and Comics this week only when its row is public, meaning owned and published, or a Want. Follow alone is private.
- **D6: A cell can't untoggle an issue an edition covers.** Clicking an issue cell edits `issues_owned` only. A cell owned through an edition is not toggleable, and its title says which edition covers it.
- **D7: Range validation is server-only.** `backend/comics.py` is the one parser. The form shows the API's 422 message, and the frontend only expands the canonical string the API returns.

## Tasks

Backend tests run one at a time (shared test DB, repo `CLAUDE.md`).

### Milestone 1 (auto): source and pure core

**T1. Record ComicVine issue fixtures.**
- **Files:** `backend/scripts/record_comicvine_fixtures.py` (new), `backend/tests/fixtures/comicvine_issues_ongoing.json`, `backend/tests/fixtures/comicvine_issues_ended.json`, `backend/scripts/README.md`.
- **What it does:** records the live `/issues/` answer for one ongoing series (Saga) and one ended series, using the call in Q2. The key comes from the main checkout's `.env`, never from logs. Read-only.
- **AC:**
  - Both fixtures are present.
  - The ongoing one has at least one issue dated after its `fetched_on`, or the gap is noted.
  - The answer shows that `filter=volume:` works.
  - If the filter is refused or ignored, **STOP**: exhausted-debugging milestone, because Q2 then needs a different call.

**T2. `backend/comics.py`, pure.**
- **Functions:**
  - `parse_ranges` / `format_ranges` (canonical "1–54, 60, 62–64", accepting both `-` and `–`; rejects "1-3-5", "10–2", 0 and negatives, and anything over 9999).
  - `owned_set(issues_owned, editions)`.
  - `run_summary(owned, skipped, released, ongoing)` returning owned, missing, state (complete / up_to_date / gaps) and the bar segments.
  - `read_state`.
  - `week_of(date)` (Wednesday start), and `pull_weeks(series, today)`.
  - `sort_series` (next issue, title, publisher, missing).
  - `validate_editions`.
- **Tests:** `tests/test_comics.py`. No FastAPI or SQLAlchemy in the import graph, so add `comics` to the purity test.
- **AC:** spec AC2's fixture figures (Series, Issues owned, Missing, Read %) computed from known ranges, and spec AC8's malformed and accepted strings.

**T3. Adapter `fetch_issues`.**
- **Files:** `sources/comicvine.py` (new method, own `field_list`, same throttle and User-Agent; update the module docstring, which says issue tracking is out of scope), `sources/README.md`, and `comics.comic_snapshot(volume_detail, issues, today)`.
- **Tests:** parse both T1 fixtures; released and ongoing derived as in Q2 and S7; non-integer numbers kept but uncounted.

**STOP: carve-out review (DB migration).**

### Milestone 2 (auto after review): schema

**T4. Migration `0010_add_comic_columns.py`.**
- **Files:** the migration and `models.py`. Create and drop the `comic_shelf_format` type explicitly (the README rule).
- **Tests:** `test_migrations.py` (schema diff plus a down/up cycle).
- **AC:** additive only, with `following` defaulting to false on the server.

### Milestone 3 (auto): features

**T5. Item writes.**
- **What changes:**
  - Create and PATCH in `items.py` accept the six comic fields, through `comics.apply_comic_fields` (canonicalises, 422 with the parser's message, and refuses them on non-comic types).
  - Add `POST /api/comics/{id}/refresh` ("Refresh from Comic Vine").
  - The admin item read returns the run summary.
- **Tests:** `test_items.py` and `test_comics_routes.py`.

**T6. Admin router `comics_routes.py`** (new, mounted in `main.py`; its own `asyncio.Lock` for refreshes, 409 when held, the catalogue's pattern).
- **Routes:**
  - `GET /api/comics/search?q=` (volumes with publisher, start year and issue count; `in_shelf` and `following` flags)
  - `POST /api/comics/follow` and `/unfollow` (by ComicVine id: creates the followed-only row in Q1, or sets the flag)
  - `POST /api/comics/want` (public want, `owned_format = none`, Radar's shape)
  - `GET /api/comics/pull-list` (four weeks, this week first, the undated note)
  - `POST /api/comics/{id}/issues/{n}/got` (adds `n` to `issues_owned` and promotes a followed-only row)
  - `POST /api/comics/{id}/issues/{n}/skip`
  - `POST /api/comics/refresh` (every followed series, one request each; returns `{ok, refreshed, errors}`)
- **Tests:** each route against fixture-patched ComicVine; spec AC7's "Got it extends the range" check, made by re-reading the item.

**T7. Public outputs.**
- **What changes:**
  - Add `GET /api/public/comics`, with `PublicComicRow` (`item_id`, title, publisher, year, cover, ongoing, following, wanted, `shelf_format`, the edition labels, owned and released counts, the segments, the run state, read status, `read_to`, and the next issue's number and date) and `PublicComicStats` (the hero numbers, runs, reading, publishers, and added per month for twelve months).
  - Add `this_week` rows (series, number, publisher, store date, cover, the "own #a–b of n" figures).
  - `PublicItemDetailOut.comic`: the canonical ranges, the editions, the issue numbers, `read_to`, and `as_of`.
  - Add `PublicNextOut.comics_this_week`.
  - `wanted` includes comic wants, with a `shelf_format` meta. Every other section stays game-only.
- **Rules:** only `is_public` rows, the Q1 and D5 rules; no price, store or `skipped` in any public body.
- **Tests:**
  - Extend `LIST_FIELDS`/`DETAIL_FIELDS`, `PUBLIC_MODELS`, the `PublicNextOut` field pin and a comics `FORBIDDEN` walk, each on purpose (spec AC9).
  - A private followed series appears in no public body.
  - Spec AC6: an empty `comics_this_week` when nothing is dated in the current week.

**T8. Tokens.**
- **Files:** `index.css`.
- **What changes:** add `--run-missing` and `--hatch` to both theme blocks beside `--redact` (S1). Record the measured ratios in comments, at least 3:1 on `--surface` in both themes.

**T9. Shared comic components.**
- **Files:** `lib/comics.js` (expands canonical ranges, plus the chip filters and sorts), and `RunBar` (`role="img"` plus an `aria-label`, "54 of 72 issues owned, ongoing"), `RunBadge`, `SeriesRow`, `SeriesList`, `IssueGrid` (300-cell cap, and D6). `PosterCard` gains a `badge` slot.
- **Tests:** spec AC3 (segments sum to released plus the tail; a want row has no bar), the `IssueGrid` cell states, axe.

**T10. `/shelf/comics` page.**
- **Files:**
  - `pages/Comics.jsx` and its test: snapshot then live through `useSnapshotThenLive('comics')`; `OutThisWeek`; `RunsCard`, `PublishersCard`, `AddedCard`, Reading through `StatusBar` with comic labels.
  - The `HeroNumbers` refactor (S2), plus its `/shelf` call site.
  - `comics.json`, added to `fetch-snapshot.mjs` `SNAPSHOTS` (optional) and `lib/snapshot.js` `SHAPES`.
  - A Comics `NavLink` in `SpineTabs`, after Collection.
  - Copy, taglines, comic status labels and attribution in `content/spine.js`.
  - The `App.jsx` route.
- **Tests:**
  - Spec AC4 (sort and chips over the fixture rows).
  - Tabs in `SpineHeader.test`.
  - Prefs (S6).

**T11. Series page.**
- **Files:** `Item.jsx` and its test.
- **What changes:** a comic branch with a kicker, facts (Run with its pill and "as of", Format, Read to, Next issue, Writer when present), an Issues card (`IssueGrid`; signed in, it toggles via PATCH), an Editions card, About with a "From Comic Vine" link, and an attribution footer.
- **Tests:** spec AC5.

**T12. What's next.**
- **Files:** `Next.jsx` and its test.
- **What changes:** a Comics this week section between Tonight and On my list, shown only when non-empty; comic wants carry their format meta; the footer adds Comic Vine whenever any comic row is shown; `isNextBody` keeps `comics_this_week` optional, mirrored in `fetch-snapshot.mjs`.
- **Tests:** spec AC6 and AC11.

**T13. Admin.**
- **Files:**
  - `pages/AdminPullList.jsx` and its test: `SeriesSearch`, `WeekList`; Got it and Skip in place, with a struck-through row; `role=status`/`alert` messages as in AdminRadar; accessible names such as "Got it: Saga #73".
  - `ComicFields` in `ItemForm.jsx`, with its test.
  - `AdminShell`: the Recommend row.
  - `App.jsx`: the child route.
  - `prerender-lib.mjs`: `ADMIN_ROUTES`.
- **What changes:** "Own…" opens the new-item form prefilled from the volume.
- **Tests:** spec AC7's and AC8's UI paths; the `ADMIN_ROUTES` test in `prerender-lib.test`.

**Parallel-safe:** T8 to T9 may run beside T5 to T7, because they touch different files and the frontend tests don't use the database. Everything else runs in order.

**STOP: carve-out review (auth/job-token, CI workflow, deploy path).**

### Milestone 4 (auto after review): wiring

**T14. Job route and nightly.**
- **Files:** `items.JOB_ROUTES`, `test_job_token.py`, `.github/workflows/nightly.yml`.
- **What changes:**
  - `JOB_ROUTES` gains `POST /api/comics/refresh`.
  - `test_job_token.py`: `EXPECTED` gains exactly that route (spec AC10), and the comics router joins `_real_app`.
  - `nightly.yml`: one `call comics 600 /api/comics/refresh` before the rollup, so the snapshot compare and deploy hook that follow pick it up.

**T15. Public route plumbing.**
- **Files:** `prerender-lib.mjs`, `render.yaml`, `scripts/smoke.sh`.
- **What changes:**
  - `prerender-lib.mjs`: `/shelf/comics` added to `publicRoutes`, with its head from `spine.js`.
  - `render.yaml`: the `/shelf/comics` rewrite, ahead of the catch-all.
  - `scripts/smoke.sh`: `/api/public/comics` gives 200 with `series`, and `/shelf/comics` serves its prerendered head.
- **Tests:** `prerender-lib.test` (the exact route and rewrite sets).

**T16. Documentation.**
- **Files:** the repo `CLAUDE.md` (a Comics bullet under Media tracker: data shape, the public rule D5, the deploy order, and the `--run-missing`/`--hatch` contrast rule), `backend/sources/README.md`, `backend/scripts/README.md`, the README tracker section.

**Then:** the finish gate, then the PR.

## Milestones

```
Milestone 1 (auto): T1–T3            (stops early if T1 shows the volume filter doesn't work)
STOP — carve-out review: migration 0010
Milestone 2 (auto): T4
Milestone 3 (auto): T5–T13
STOP — carve-out review: job token, nightly.yml, render.yaml, smoke
Milestone 4 (auto): T14–T16
Finish gate → PR
```

## Environment test

- **Local:**
  - Backend at :8000 and frontend at :5173, with the database migrated to `0010`. Follow Saga plus one ended series, then run the refresh and check the pull list, Got it and Skip.
  - Compare `/shelf/comics`, `/shelf/:id` (comic) and `/admin/pull-list` against `chosen.html` at 400 px and 1280 px, in dark and light, in the browser pane.
  - `npm run build`, `npm test`, `pytest`.
- **Deploy order:**
  1. Apply `0010` to Neon (`migrate_neon.py current`, then `upgrade`).
  2. Merge.
  3. Follow your series on `/admin/pull-list`.
  4. Run "Refresh followed" once, or wait for the nightly.
  5. `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
- **Smoke covers** `/api/public/comics`, the `/shelf/comics` head, and the rest of `/api/public/next` unchanged apart from `comics_this_week`.
