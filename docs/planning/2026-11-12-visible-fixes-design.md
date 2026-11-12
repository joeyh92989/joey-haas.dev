---
status: planned
kind: fix
mode: auto
---

# Visible fixes from the 12 Nov review (design and plan)

Issues: #179, #180, #182, #192, #193, #195, #200. Branch `fix/visible-fixes`. Backlog:
`2026-11-12-site-review-issues.md`. One doc for spec and plan: every fix is small and its
direction is set by its issue, so no mockups (my call: these change existing elements in place;
the review screenshots are the "before").

## Problem

Seven defects a visitor sees on production today (evidence in each issue, from
`npm run shots` on 12 Nov): a broken table row, a clipped chart, links told apart by colour only
(axe serious on 8 routes), wrapping tabs and an unmarked nav item, an off-screen input, a stats
page that repeats itself and shows raw ids, and six layout slips.

## Scope

In: the seven issues, plus (scope growth, my call) a check of a possible privacy leak the research
found while reading #195's code: `public_path_filter` (`backend/analytics_routes.py:226-240`)
gates `/shelf/<uuid>` by the item's visibility but may not gate comic issue and edition paths
(`/shelf/<uuid>/<n>`, `/shelf/<uuid>/ed-…`). If a private series' issue path can reach the public
Pages list, fix it with a test; if not, record why.

Out: anything in the other backlog PRs (failure states, IA, detail pages, shelf IA, refactors).

## Solution and decisions (my call)

1. **#182 Links in text are underlined.** Colour alone cannot pass (accent vs body text is about
   1.3:1 in both themes, computed from the tokens), so inline links in running text get an
   underline: `.prose`, `.prose-list`, `.changelog`, `.empty-box`, `.intake-demo-fine` links (the
   selectors axe flags), `text-underline-offset: 0.18em`, `text-decoration-thickness: 1px`,
   colour `currentColor`. Navigation, cards and buttons are untouched. All eight `#182` entries
   leave `e2e/known-a11y.js`.
2. **#179** `AgainTag` moves inside the title cell (the `Link` and the tag share one span), so a
   finish row has three cells everywhere it is used (Year in review, Month journal, Now).
3. **#180** Drop the phone `min-width: 30rem` on `.day-bars`; bars already flex. Axis labels drop
   to three on narrow screens through `useMediaQuery` if five collide (decide by screenshot). An
   e2e check asserts the chart box does not scroll at phone width.
4. **#195** All-time tiles show only once `live_since` is more than 30 days ago (the API already
   returns it). Pages list names its rows: item paths by title, year and month paths by their
   page title, from `/search-index.json` (already public, built from the snapshot), falling back
   to the path. DayBars gets a caption naming the peak day and its count.
5. **#192** Shelf tabs: one row on phone that scrolls sideways with an edge fade (no wrap), the
   active tab scrolled into view. The masthead marks My Shelf on `/daily` (it is a shelf tab and
   already in `WIDE_ROUTES`).
6. **#193** The guess input moves above the board, on both widths.
7. **#200** Intake spine type shrinks for long titles so none is clipped; comics hero figures
   2×2 on phone; How it works index 3×3; `.spine-project` links get the Projects link-row gap;
   the Projects card's cover strip gets its top margin back; the public shell is a full-height
   column so the footer sits at the bottom of short pages.

## Sources

Research report (paths and lines): `index.css:218-226` (links), `YearInReview.jsx:252-260`,
`index.css:6633-6635` (`min-width: 30rem`), `Stats.jsx:79-118`, `BarList.jsx:11`,
`RootLayout.jsx:74-82`, `SpineTabs.jsx`, `Daily.jsx:140-225`, `StopIndex.jsx`, `IntakeDemo.jsx:25-53`,
`Collection.jsx:659-668`, `index.css:1071-1073`, `RootLayout.jsx:219`.
Conventions: CLAUDE.md (tokens in both themes; nothing hover-only; `useMediaQuery`; new public
reads stay public-only).

## Smoke check

`npm run e2e` green with an empty known-a11y list; `npm run shots` (build with
`SNAPSHOT_API_URL=https://api.joey-haas.dev`) shows each fix at 393 and 1280 in both themes;
post-deploy `./scripts/smoke.sh`.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; tasks touching CSS also
`VITE_DAILY_SALT=local npm run build && npm run e2e`. Backend tests one run at a time.

### Task 1 — Inline links underlined (#182)
Files: `src/index.css`, `e2e/known-a11y.js`. Acceptance: axe `link-in-text-block` passes on all
routes in both themes with the known list empty; nav, cards, buttons unchanged.

### Task 2 — Finish rows keep three cells (#179)
Files: `YearInReview.jsx`, `MonthInReview.jsx`, `Now.jsx` (wherever `AgainTag` sits in a row),
`index.css`, tests. Acceptance: a replayed finish is one line with the tag beside the title; a
test asserts the tag is inside the title cell.

### Task 3 — Stats fits a phone and says what it shows (#180, #195)
Files: `DayBars.jsx`, `Stats.jsx`, `content/stats.js` (words), `index.css`, a small
`lib/pageTitles.js` (path → title from the search index), tests, `e2e/smoke.spec.js` (chart box
does not scroll on phone). Acceptance: at 393px the newest day and its label are visible; all-time
tiles hidden while `live_since` is under 30 days; item/year/month rows show titles; the peak is
labelled.

### Task 4 — Comic paths on the public Pages list (privacy check)
Files: `backend/analytics_routes.py`, `backend/tests/` (the public stats tests). Acceptance: a test
proves an issue or edition path of a private series never appears in `/api/public/site-stats`;
fixed if it did.

### Task 5 — Shelf tabs and the masthead (#192)
Files: `SpineTabs.jsx`, `RootLayout.jsx` and/or `SiteMast.jsx`, `index.css`, tests. Acceptance:
one tab row at 393px, scrollable, active tab visible; My Shelf marked on `/daily` (test).

### Task 6 — Shelfle input first (#193)
Files: `Daily.jsx`, `index.css`, `Daily.test.jsx`. Acceptance: the input precedes the board in the
DOM and is visible on first load at 393×851 and 1280×720.

### Task 7 — Layout slips (#200)
Files: `IntakeDemo.jsx`/`index.css`, `Comics.jsx`/`index.css`, `StopIndex` CSS, `Collection.jsx`
CSS, Projects CSS, the shell (`RootLayout.jsx` `.site`). Acceptance: each slip fixed in shots at
both widths; no page scrolls sideways. Add the changelog entry (`frontend/changelog.md`, today's
heading) naming the visible fixes in one or two bullets.

## Ship notes

No migration, no env var. Backend change only if Task 4 finds a leak (then the backend CI job and
the API deploy are part of this ship). Changelog: one entry for the visible fixes.
