---
status: ready-for-plan
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
