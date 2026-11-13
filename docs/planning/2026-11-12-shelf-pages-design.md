---
status: planned
kind: ui
mode: auto
---

# Shelf pages: covers first, a shorter What's next, one width and one rating (design and plan)

Issues: #188, #189, #190, #191, #197. Branch `feat/shelf-pages`. Backlog:
`2026-11-12-site-review-issues.md`. Follows #210 (detail pages: breadcrumb, sans `h1`).

## Problem

`/shelf` starts its covers ~1,425px down (five phone screens; ~13,000 CSS px tall on a phone)
behind blocks that How it works already covers (#190). Its controls are four unlabelled pill rows,
a different sort control on phone, no result count or clear, and an unexplained cover key (#189).
What's next is 6,535px with eight sections, "Top pick" on every store row, Tonight's pick repeated
in Pick for me and an empty section (#191). Widths jump within pages (#188). My rating is written
five ways and single-series charts use four colours (#197).

## Mockup and decision

Mockups: `docs/planning/mockups/2026-11-12-shelf-pages/` (out of git). **Chosen:
`a-covers-first.html`** (auto mode, the designer's pick, reasons in the folder's README): labelled
chip rows directly above the grid with a result count, Clear filters and a one-line cover key;
Favorites and charts move below the grid under Overview; What's next gets jump links, capped lists
and one Top-pick treatment; two widths only (72rem page, 45rem reading); my rating is "★ 8"
everywhere, the community score stays "42 / 100"; single-series charts in `--chart`. Rejected,
kept in the folder: B (filter rail: five-per-row grid, a separate phone filter panel, three widths
on What's next) and C (toolbar menus: hides options and counts, single-choice status).

### Architecture decision
Options: A · component changes within the existing pages (the mockup's list) · B · a new shelf
layout route · C · server-side paging. Chosen: A — every change is a component the pages already
use, the grid is ~120 items (client paging is enough). Hard to undo: nothing. One backend change:
`PUBLIC_PICKS` 3 → 4 in `picker.py`, so Pick for me still shows three after leaving out Tonight's
lead (public output gains one row per combo; the key contract `pick-for-me-keys.json` is unchanged).

## Solution (direction A; components per the mockup README)

- **Collection (#190, #189):** `HeroNumbers` becomes one totals line with the Tonight and Shelfle
  links and the search field; `FeatureStrip` and `StatusStrip` leave the page (How it works
  already holds that content: StopIndex, Stop 2's counts) for one line pointing there; Favorites
  and the four charts move below the grid under "Overview" (a disclosure at 393; one baseline at
  1280). `FilterChips` gets a visible label per group (Show, Status, Platform); `SortControl` is
  the labelled select at every width with worded directions; View shares the Sort row (Comfortable
  and Compact not offered at 393). New `ResultBar` ("59 of 119 titles" + Clear filters, only while
  filtered), `CoverKey` (beside the count; also above the month journal's rows), and `ShowMore` in
  `PosterGrid` (opt-in prop; whole rows: columns × 4 desktop, × 6 phone; resets on filter change).
- **What's next (#191):** `JumpNav` (sticky "On this page" row; one scrolling line at 393; empty
  sections get no heading and no link); `CappedList` over `NextRow` lists (6 rows desktop, 4 phone,
  "Show all N"); store lists two columns at 1280; "Top pick" only on the first three rows of In
  stores now (display cap; data unchanged — How it works reads `top_pick`); Pick for me shows
  nothing until a length or mood is chosen, leaves out Tonight's lead and says so; Tonight two
  columns at 1280; `JustFinishedChip` two text runs (side by side at 1280, stacked at 393), no pill.
- **Widths (#188):** the 72rem page and the 45rem reading width (`.page`'s measure) only; What's
  next sections and Year in review follow it (Year two columns at 1280); Daily's board takes the
  reading width with the right column unused rule from the README.
- **Ratings and charts (#197):** a `Rating` component ("★ 8", `role="img"`, name "8 out of 10")
  replaces `Stars` wherever my rating shows (cards, item tile, Just finished, Now, Year rows);
  community stays "NN / 100" without a star; the ratings histogram, finishes-by-month and DayBars
  use `--chart` (6.73 dark / 6.09 light on `--surface`); amber (`--rating`) stays for the star and
  the favorite heart. No new token.

New strings are in the README's list; each lands in a content module marked
`// copy: pending voice review` for PR 3b.

## Sources

Mockup README; research notes for this PR (Collection.jsx render order 484-616 and state 388-476;
FilterChips.jsx:32-38,79; SortControl.jsx:13-88; PosterGrid.jsx:14-21; HowItWorks StopIndex :230
and withCounts 57-73; Next.jsx 641-709; next_list.py:117-135; PickForMe.jsx:75-79; picker.py:1009,
1078-1080; JustFinishedChip.jsx + index.css 5927-5966; widths index.css 198-216, 5819-5822,
5919-5921; ratings Stars.jsx, Item.jsx:213-231, Now.jsx:153, YearInReview.jsx; charts index.css
2214-2274, 4323-4408; tokens 39-142). CLAUDE.md: shelf design system and measured status
tokens; nothing hover-only; shelf prefs via readShelfPref; page-wide routes; Pick for me's
fingerprint and key contract.

## Smoke check

Shots at 393 and 1280, dark and light, of /shelf, /shelf/next, /shelf/year/2026, /daily, an item
page and /now, against `a-covers-first.html`; /shelf covers start within the first screen at 1280
and the second at 393. e2e CI-mode, real-data a11y; backend suite. Post-deploy smoke.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; the last task also CI-mode
e2e and the real-data a11y run; Task 2 also the backend suite. Every task's acceptance includes
"matches `a-covers-first.html` at 393 and 1280".

### Task 1 — Collection: covers first, labelled controls (#190, #189)
Files: `Collection.jsx`, `ShelfToolbar.jsx`, `FilterChips.jsx`, `SortControl.jsx`, `PosterGrid.jsx`,
new `ResultBar.jsx`, `CoverKey.jsx`, `ShowMore.jsx` (+ tests), `content/spine.js`, `index.css`,
tests of the shared consumers (Comics, Next, Travel, AdminCloset, AdminClosetToday, AdminCollection
use SortControl/FilterChips/PosterGrid — their behaviour must hold). Acceptance: the mockup's
Collection page; covers within the first screen at 1280, second at 393.

### Task 2 — What's next (#191)
Files: `Next.jsx`, new `JumpNav.jsx`, `CappedList.jsx` (+ tests), `PickForMe.jsx`, `NextRow.jsx`,
`JustFinishedChip.jsx`, `content/spine.js`, `index.css`, `backend/picker.py` (`PUBLIC_PICKS` = 4)
and its tests (`test_picker_public_table.py`, `test_public_pick_for_me.py`). Acceptance: the
mockup's What's next; Pick for me never repeats Tonight's lead and shows three.

### Task 3 — Widths, ratings and chart colours (#188, #197)
Files: `index.css`, new `Rating.jsx` (+ test) replacing `Stars` for my rating (PosterCard, Item,
JustFinishedChip, Now, YearInReview), `YearInReview.jsx` layout, `Daily.jsx` width, charts' CSS,
tests; `frontend/changelog.md` (one short bullet). Acceptance: two widths on every tracker page;
"★ N" everywhere my rating shows; single-series charts in `--chart`.

## Ship notes

No migration, no env var. One backend change (`PUBLIC_PICKS`), so the API deploys too; the
public Pick for me cache refreshes on the deploy restart.
