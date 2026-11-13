---
status: planned
kind: chore
mode: auto
---

# Type and spacing tokens; one component per job (design and plan)

Issues: #203, #204. Branch `chore/tokens-components`. Backlog: `2026-11-12-site-review-issues.md`.

## Problem

`index.css` has 411 `font-size` declarations over 36 values with no type tokens, 44 of them under
12px (plus 6 `font` shorthands), and ~1,016 padding/margin/gap literals with only `--grid-gap` and
`--radius` as tokens (#203). Six components hand-roll a `<dialog>` that `Sheet` already provides,
two cover tiles do one job, and labelled-figure cards come in several markups (#204).

## Scope and decisions (my call)

1. **Type scale tokens.** `--fs-12 … --fs-48` on the steps {12, 13, 14, 16, 18, 20, 24, 28, 32, 40,
   48} px (as rem), declared once on `:root` (theme-independent, like `--font-*`). Every
   `font-size` and `font` shorthand size maps to the nearest step; values within ±1px snap (95%
   of uses — at most a 1px change), the outliers are decided one by one in the task report.
   **Nothing under 12px** (#203's acceptance): sub-12 text moves to `--fs-12`, with layout
   adjusted where it was squeezed. Exempt, and listed: glyphs inside drawings that already carry
   an accessible name (intake demo spines, run cells' numbers, map labels inside the SVG drawing)
   — they are illustration, not reading text; the visible OSM attribution is not exempt.
2. **Spacing tokens, exact matches only.** `--space-1 … --space-8` = {0.25, 0.5, 0.75, 1, 1.5, 2,
   3, 4} rem; only declarations whose value is already exactly a step (in rem or px) are rewritten
   to tokens — no visual change. Off-scale values (0.35rem, 0.6rem, …) stay and are counted in the
   report for a later, visual pass. Snapping 1,000 spacings is a redesign, not a refactor.
3. **Dialogs on `Sheet`.** `Sheet` gains `ariaLabel` (alternative to `labelledBy`), an
   `initialFocus` ref/selector and a `variant` class; SearchDialog, Lightbox, MobileNavSheet,
   AdminShell's TabSheet and WrapUpSheet move onto it with behaviour kept (open/close, Escape,
   backdrop, focus return, busy no-op close). AddDrawer becomes `Sheet` when it is modal (its
   `sheet` prop) and keeps its inline drawer form otherwise; ShelfCardActions stays a non-modal
   popover (a different job). Sheets' headings follow the page outline (h2), ShareSheet and
   WrapUpSheet included.
4. **One cover tile.** `BookTile` folds into `CoverTile` as `kind="book"` (same frame and caption
   classes already). PosterCard (overlays, rating, actions), CoverStrip (decoration, no link) and
   GarmentTile (photo, 4:5) do different jobs and stay; the README/CLAUDE.md says so.
5. **One stat tile.** Item's four tiles render through `StatTile` (which accepts children for a
   composite value, e.g. Rating or the time-to-beat rows). AreaCard's figures and HeroNumbers are
   inline figure lines, not tiles, and stay.
6. **Proof of no regression:** a before/after visual comparison. Baseline screenshots from
   `main` (f311f0b), built with the real snapshot and `/api` aborted (deterministic), every static
   route + sampled detail pages, 393 and 1280, both themes; after each task, the same capture
   and a pixel diff (Playwright `toHaveScreenshot` against the main baseline, in a throwaway
   local spec). Expected diffs: Task 1's snapped sizes only; Tasks 2-4: none, except dialog
   internals (checked by opening each dialog in a scripted shot).

Changelog: one bullet (small text is at least 12px now). Docs: CLAUDE.md conventions gain the
token rule (type and spacing tokens; `Sheet` is the one dialog shell; the tile family).

## Sources

Research (this session): type values and lines, index.css :89-94, :87-88; dialog table
(Sheet.jsx:22-84, SearchDialog:140, Lightbox:96, MobileNavSheet:63, WrapUpSheet:105,
AdminShell:189-230, AddDrawer:92, ShelfCardActions:175); tiles (CoverTile.jsx:25, BookTile.jsx:26,
PosterCard.jsx:80, CoverStrip.jsx:18, GarmentTile.jsx:21); stats (StatTile.jsx:11, Item.jsx:210,
AreaCard.jsx:17, Collection.jsx:175); pinned-style tests shelfStyles.test.js:84-126,
intake/intakeStyles.test.js. CLAUDE.md: tokens both themes; measured contrast rules untouched.

## Smoke check

Visual diff report (per route/width/theme: changed or not, max pixel delta); unit, CI-mode e2e,
real-data a11y green; post-deploy smoke.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; Tasks 1 and 4 also CI-mode
e2e and real-data a11y. Before Task 1, capture the baseline from this branch's base commit.

### Task 1 — Type scale tokens, nothing under 12px (#203)
Files: `index.css`, the pinned style tests, `frontend/changelog.md`. Acceptance: every font size
is a token; no reading text under 12px (grep proof + the exemption list); visual diff shows only
≤1px size changes plus the sub-12 changes, each checked at 393.

### Task 2 — Spacing tokens for exact-step values (#203)
Files: `index.css`, pinned style tests. Acceptance: exact-step spacings use tokens; visual diff
zero; report counts the off-scale values left.

### Task 3 — Dialogs on Sheet (#204)
Files: `Sheet.jsx` (+ new `Sheet.test.jsx`), SearchDialog, Lightbox, MobileNavSheet, AdminShell,
WrapUpSheet, intake/AddDrawer, ShareSheet (heading), their tests. Acceptance: every modal dialog
renders through Sheet; behaviour tests (open, Escape, backdrop, focus return, busy close) pass;
scripted shots of each open dialog match the baseline.

### Task 4 — One cover tile, one stat tile; docs (#204)
Files: `CoverTile.jsx` (+ BookTile removed), CoverWall, `StatTile.jsx`, `Item.jsx`, tests, repo
CLAUDE.md. Acceptance: visual diff zero on comic series pages and item pages; docs name the
families and the rules.

## Ship notes

Frontend only. No migration, no env var.
