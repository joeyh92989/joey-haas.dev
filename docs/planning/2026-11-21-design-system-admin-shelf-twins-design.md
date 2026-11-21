---
status: planned
kind: UI (admin page bodies, slice b of #532)
mode: auto
issue: "#532 (slice b) and #535, epic #519"
---

# Design system: admin shelf twins (slice b of #532)

## Problem
Slice a (#572) moved the public Games and Comics lists and several shared pieces onto the new look, so the admin twins already show it partly (filter tabs, toolbar chips, the result bar). The admin lists still carry their own cards, rows and forms. #532 closes with this slice.

## Scope
In: `AdminCollection` (games, 1290 lines) and `AdminComics` (693 lines), plus `AdminComic`, `AdminComicVolume` if they share the list parts, and the components only they use, on the shared pieces from slice a (`PosterCard`/`PosterGrid`, `ShelfToolbar`, `FilterChips`, `ResultBar`, `ShelfOverview`) and the admin patterns (`adminShellClasses.js`; the Closet slice's `closetClasses.js` may not be merged yet: do not depend on it).
Out: Add, Sitting, Discover, Radar, Pull list, Sources, Store list, Item edit pages (a later Shelf slice of #535), public pages, the shell, the Closet, Denver and Site areas.

## My calls
- Behaviour, routes, ids, aria, focus targets, forms, copy, publish/hide actions, confirm patterns (`ShelfConfirm`/`ConfirmDelete`, no `window.confirm`) and test hooks stay identical; only look and primitives change. `adminCopyScan.test.js` and the admin e2e suite must pass.
- Public and admin twins share the components: prefer using the shared component with a prop over forking it. A change to a shared component must not alter public pages (the public shelf specs and baselines are the check; run `shelf-lists.spec.js`).
- Zero horizontal overflow at 320 to 1440 on `/admin/shelf/games` and `/admin/shelf/comics` with realistic data (long titles, many tags, unbroken names); 44px phone tap targets kept where they were (use `max-[700px]:min-h-11`); focus rings painted and pixel-tested including the controls inside sheets and menus once opened; contrast pairs in `contrast.test.js` for new states; pressed states not by colour alone.
- Lazy admin pages; the eager guard and `scripts/check-entry-chunk.mjs` stay green.
- Legacy classes stay where other areas read them until #536.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md` (Shelf lists section), PR #572 and PR #569 (admin shell) with their tests and e2e as patterns. Inventory the two pages' hand-written card/chip/header/form CSS and who else uses each class.
2. Rebuild the list parts of both pages; tests first (run against old code, say which failed); Playwright overflow, tap-target, ring pixel and axe (both themes) with mocked realistic data, plus `npm run e2e:admin` if local Postgres is free.
3. Verify: lint, format, targeted tests, full npm test once, build, check-entry-chunk; view ALL screenshots (each page, 320/390/1280/1440, both themes) and count them.

## Ship notes
No migration, secrets or render.yaml change. No changelog entry (admin only). PR text must say that `Refs #532` closes it with `Closes #532` here, and #535 stays open for later slices.

## Sources
`docs/planning/2026-11-21-design-system-shelf-lists-design.md`, `docs/planning/2026-11-21-design-system-admin-shell-design.md`, `docs/design-system.md`.
