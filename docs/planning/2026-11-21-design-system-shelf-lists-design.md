---
status: planned
kind: UI (page bodies, new alternative view)
mode: auto
issue: "#532, epic #519"
---

# Design system: shelf lists

## Problem
Games and Comics lists are the most personal pages. They still draw cards, filter chips, the search and the result bar with hand-written CSS, and the spike chose a second, alternative view: the spine view.

## Scope
Slice a (this PR): the **public** Games and Comics lists (`pages/Games.jsx`, `pages/Comics.jsx`, `PosterCard`, `PosterGrid`, `ShelfToolbar`, `ShelfOverview`, `FilterChips`, `ResultBar`, `CoverTile` and the CSS only they use) on the #528 components: each entry a Record card with a catalogue number and a status mark in a responsive grid, underline-tab filters, the new search; plus the **spine view**.
Slice b (next PR, own plan): the admin twins (`AdminCollection`, `AdminComics`, 1290 and 693 lines) on the same shared components. Issue #532 stays open until slice b merges.
Out: item and detail pages (#533), Stats, Denver, Daily, prose pages.

## Look
Mockups on disk only: `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-shelf.html` (cards, filters, grid) and `3b2-spine-shelf.html` (spine view). Spec: `docs/planning/2026-11-20-design-system-spike-design.md`. Tokens win over mockup literals.

## My calls
- **Behaviour preserved:** filters, sort, search, the result bar, the overview figures, URL/query state, snapshot reads, prerendered heads, ids, aria, test hooks and the Games/Comics routes stay exactly as today; only look and primitives change. The list makes no new API call.
- **Spine view:** an alternative view toggled from the toolbar (a `Tabs`-like pair "Cards / Spines", `aria-pressed` or tablist per what the toolbar already does), never the default, and the choice is kept only in the URL (`?view=spines`) so prerender and shares stay deterministic. Spines are upright labels on a rail (per 3b2): each is a link to the item with the title as its accessible name, status as text for screen readers (visually-hidden word, not colour alone), keyboard reachable in reading order with a painted focus ring, long titles wrap or clamp with the full title in the name and no clipping at 320 to 1440, and reduced-motion respected. Spines render from the same data as the cards.
- **Catalogue numbers:** stable per entry (sort order of the full shelf by id/added, not by the current filter) so a number never changes when filtering; `aria-hidden`, collections only.
- **Status mark** always with its word; `StatusMark` is filled only for live/finished per its rule.
- **Eager vs lazy:** check which of these are eager in `App.jsx`; eager files must not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; `scripts/check-entry-chunk.mjs` and the guard in `designConsistency.test.js` stay green; report entry size vs main.
- **Focus rings** on whole-card links are inset (`after:-outline-offset-2`) and pixel-tested focused vs unfocused in both themes; the spine rail's scroller must not clip rings (pixel test too).
- Coloured text uses `-text` tokens; no opacity on text; no sideways scroll at 320 to 1440 on `/shelf/games`, `/shelf/comics` and both views.
- Legacy classes stay where other CSS/tests/admin read them until #536; remove CSS only these pages used. The admin twins still use shared pieces: do not break them (run the admin tests and e2e:admin).

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, the two mockups, `Home.jsx`/the prose and tools pages as the pattern (record card, inset ring, overflow and ring pixel e2e). Inventory shelf CSS and who else uses each class (grep `frontend/src`, e2e, scripts).
2. Cards: `PosterCard`/`PosterGrid` to Record cards with number and status mark; filters on `FilterChips`/underline tabs; search on `Input`; `ResultBar`, `ShelfOverview` restyled.
3. Spine view with its keyboard, screen-reader and layout tests (vitest + Playwright incl. axe both themes).
4. Verify: lint, format, full npm test once, build with and without the fixture snapshot, check-entry-chunk, `npm run e2e` with the fixture snapshot and `npm run e2e:admin`; view ALL screenshots (Games and Comics, cards and spines, 320, 390, 1280, 1440, both themes, plus empty and filtered states) and say how many. Baselines regenerate on CI (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one plain bullet (the shelf looks new and has a spine view). Smoke: `/shelf/games`, `/shelf/comics` in both themes and `?view=spines`; smoke titles unchanged; the visual baselines for the shelf change.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
