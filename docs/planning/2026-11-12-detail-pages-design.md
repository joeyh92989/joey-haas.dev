---
status: done
kind: ui
mode: auto
---

# Detail pages: one header, one way back (design and plan)

Issues: #187, #184, #185, #198. Branch `feat/detail-pages`. Backlog:
`2026-11-12-site-review-issues.md`.

## Problem

Detail pages are built three ways and disagree on the way back (#187). The item page opens on an
empty grey slab with muddled chips (#184). Missing comic issues are invisible: the key swatch,
zero-owned runs and unowned issue pages (#185). Year in review is text-only and the month journal
has no index (#198). Evidence and code paths: the issues and the research notes below.

## Mockup and decision

Mockups: `docs/planning/mockups/2026-11-12-detail-pages/` (out of git). **Chosen:
`a-trail.html`** (auto mode, the designer's pick): one breadcrumb at the top of every detail page;
a page header's `h1` is sans 500 everywhere, the serif kept for Home's hero statement only (About,
How it works and Try the intake move to sans); the item hero removed rather than filled; every
page keeps its column and reading order. Rejected, kept in the folder: B (tab row on every shelf
page, blurred cover hero; leaves two header constructions) and C (About's two-column rail on
every page; relays out everything and breaks at 393). Full reasoning: the folder's `README.md`.

### Architecture decision
Options: A · one `PageHeader` + `Breadcrumb` used by every detail page · B · per-page fixes ·
C · a layout route wrapping detail pages. Chosen: A — the breadcrumb already exists
(`.comic-issue-crumbs`), so this is a rename plus one component, not a relayout. Gives up: pages
keep their own body layouts (C would have unified those too). Hard to undo: nothing.

## Solution (direction A)

- **`PageHeader`** (`components/`): `Breadcrumb`, optional `Kicker`, sans `h1`, optional lede.
  **`Breadcrumb`**: `.comic-issue-crumbs` renamed `.crumbs`, last item `aria-current="page"`, a
  `nav` with an accessible name. Used by item, comic issue, comic edition, month journal, blog
  post, TIL note and trip pages. Section pages (Collection, Comics, What's next, Year, How it
  works, Daily) keep `SpineHeader` + tabs as now. The blog post's and TIL note's top back link
  becomes the breadcrumb (Writing › title; TIL › title). Serif `h1` overrides go except
  `.hero-title`.
- **Item (#184):** remove `.item-hero` and `.item-head`'s `-6rem` margin; chips become a `dl` with
  two labelled groups, Genres (genres and themes) and Also on (platforms minus the owned one);
  the time-to-beat tile names its figures: Main story (IGDB `normally`) and To complete (IGDB
  `completely`).
- **Comics (#185):** the key's Missing swatch and missing cells use `border: 1.5px solid
  var(--run-missing)` (the key's box-shadow read `--lane-ground`, undefined outside `.lanes`);
  a series with zero owned issues draws its track (`lib/comicRun.js` `cardLines` stops returning
  `lanes:false` for an unowned released run; wants keep none); an unowned issue page shows the
  Comic Vine cover dimmed (`grayscale(1)`, opacity .45) with "Not owned" when there is one, else a
  no-cover placeholder (dashed `--run-missing` outline, issue number, "No cover"); series titles
  carry their volume year ("Creepshow (2024)"); the hero figures lead with what is owned.
- **Year and month (#198):** Year's finishes get cover thumbs (`cover_url` is already on the
  rows); the journal gets a `MonthIndex` (twelve cells; months with entries link; current month
  `aria-current`) built from data already on the page (finishes from the items snapshot, sessions
  from the diary read), above its existing previous/next links.
- **Contrast:** no new token. `--run-missing` measures 3.30/3.25 on `--surface`, 3.50/3.17 on
  `--bg` (dark/light); it is 3.07/2.92 on `--sunken`, so none of these marks may sit on `--sunken`.

New labels (marked `// copy: pending voice review` in content modules, plain and minimal until the
copy pass): Genres, Also on, Main story, To complete, No cover, Not owned. The post contents list
keeps PR #209's "On this page".

## Sources

Mockup README (above); research notes for this PR (Item.jsx:190-200, 703-760, 723; index.css
4528-4539, 7719-7722; lib/comicRun.js:369-376; ComicIssue.jsx:121-164; .comic-issue-crumbs
index.css:11663-11679; YearInReview.jsx:247-266; MonthInReview.jsx:63-111; SpineHeader.jsx;
serif overrides index.css:697-701, 921-925, 7061, 3300-3301, 8847-8849; backend/sources/igdb.py:137
and picker_items.py:13-14 for `normally`). CLAUDE.md: tokens both themes; comics run marks on
measured contrast; nothing hover-only; `RunLanes`/`RunBox` draw runs one way everywhere.

## Smoke check

Shots at 393 and 1280, dark and light, of item, comic issue (owned, unowned with cover, no
cover), comics list, year, month journal, blog post, TIL note, About, How it works — compared with
`a-trail.html`. e2e CI-mode and real-data a11y green. Post-deploy smoke.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; the last task also CI-mode
e2e and the real-data a11y run (learnings, 2026-11-12). Acceptance for every task includes
"matches `a-trail.html` at 393 and 1280".

### Task 1 — PageHeader, Breadcrumb, one h1 rule (#187)
Files: new `components/PageHeader.jsx`, `components/Breadcrumb.jsx` (+ tests), `index.css`
(`.crumbs`, serif overrides), `Item.jsx`, `ComicIssue.jsx`, `ComicEdition.jsx`, `MonthInReview.jsx`,
`BlogPost.jsx`, `TilNote.jsx`, `Trip.jsx`, `About.jsx`, `HowItWorks.jsx`, `IntakeDemo.jsx` (h1 face
only), page tests. Acceptance: every detail page has the breadcrumb and a sans `h1`; section pages
unchanged; Home's hero still serif.

### Task 2 — Item page (#184)
Files: `Item.jsx`, `content/spine.js` (labels), `index.css`, `Item.test.jsx`. Acceptance: no hero
slab; two labelled chip groups; time to beat labelled.

### Task 3 — Comics (#185)
Files: `lib/comicRun.js`, `components/RunLanes.jsx` (key), `SeriesRow.jsx`, `Comics.jsx`,
`ComicIssue.jsx`, `CoverImage.jsx`/`CoverTile.jsx` (no-cover state), `index.css`, tests.
Acceptance: Missing visible in the key and tracks in both themes; zero-owned series draw a track;
unowned issue page shows a dimmed cover or the placeholder; titles carry the year; hero leads with
owned.

### Task 4 — Year and journal (#198)
Files: `YearInReview.jsx`, `MonthInReview.jsx`, new `components/MonthIndex.jsx` (+ test),
`index.css`, tests, `frontend/changelog.md` (one bullet). Acceptance: covers on Year's finishes;
month index on the journal.

## Ship notes

Frontend only. No migration, no env var. New labels flagged for PR 3b's copy pass.
