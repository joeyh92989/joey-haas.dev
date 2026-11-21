---
status: planned
kind: UI (page bodies)
mode: auto
issue: "#531, epic #519"
---

# Design system: prose pages

## Problem
Shell (#529) and Home (#530) are on the new look. About, Projects, Now, Colophon, Blog and TIL (index, post and tag pages) are reading pages that share one page type and still use hand-written card, header and chip CSS.

## Scope
In: `About`, `Projects`, `Now`, `Colophon`, `Blog` (index, post, tag), `TIL` bodies, rebuilt on the #528 components and the #530 patterns (`RecordCard`, `CatalogueNumber`, `Badge`, `Button`/`buttonVariants`, `Separator`), with Source Serif headings and the prose measure (45rem). `ContactLine` (shared with Home) gets the mockup's dot-separated links row if it can change without altering About's tests.
Out: Shelf, Stats, Denver, Daily, admin, the shell.

## Look
No prose-page mockup exists. Match Home (`frontend/src/pages/Home.jsx`) and the spike spec `docs/planning/2026-11-20-design-system-spike-design.md` ("The look", "Devices"); mockups for reference on disk: `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-home.html`. Tokens win.

## My calls
- Behaviour, routes, ids, heading levels, aria, prerendered heads, search entries and test hooks stay identical; only look and primitives change.
- Eager pages must not import Base UI, `cn` or `ui/card` (see the guard in `designConsistency.test.js` and `scripts/check-entry-chunk.mjs`); use `buttonVariants`, `cx` and `card-classes.js`. Add any new eager page file to the guard's list if it is imported directly by `App.jsx`.
- Blog code blocks keep their measured Shiki contrast in both themes (`--code-bg` and Shiki unchanged); keep the `typeScale`/`contrast` tests passing.
- Catalogue numbers only on collections (Projects, Blog and TIL lists), `aria-hidden`.
- Whole-card links: inset focus ring (`after:-outline-offset-2`), pixel-tested focused vs unfocused strip (lesson of #530); no `overflow-hidden` clipping a ring.
- Coloured text uses `-text` tokens; no opacity on text; no sideways scroll at 320 to 1440 on any of these routes (assert with Playwright, naming the offending element).
- Legacy classes stay where other CSS or tests read them until #536; remove CSS that only these pages used.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `Home.jsx` and its tests. Inventory each page's hand-written card/header/chip CSS.
2. Rebuild About, Projects, Now, Colophon; then Blog index/post/tag and TIL.
3. Tests first for each pinned behaviour (run against old code); contrast for any new pair; Playwright overflow, focus-ring pixel and a11y for every route.
4. Verify: lint, format, full npm test once, build, `npm run e2e` with the fixture snapshot; screenshots of each page at 320, 390, 1280, 1440 in both themes (view them all and say how many). Baselines regenerate on CI afterwards (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one plain bullet. Smoke: `/about`, `/projects`, `/now`, `/blog` in both themes; prerendered heads and smoke titles unchanged.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
