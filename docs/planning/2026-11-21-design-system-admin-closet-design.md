---
status: done
kind: UI (admin page bodies, slice 2 of #535)
mode: auto
issue: "#535, epic #519"
---

# Design system: admin Closet area (slice 2 of #535)

## Problem
Slice 1 moved the admin shell (#569). #535 says each area of `ADMIN_AREAS` migrates in its own PR. This slice is the Closet area: Today, Closet, Add, Review and Profile.

## Scope
In: `AdminCloset`, `AdminClosetToday`, `AdminClosetReview`, `AdminClosetProfile`, `AdminGarment`, and the components used only by them, on the #528 components and the patterns from the shell slice, Home and the prose/tools pages (record cards, `buttonVariants`, `cx`, `card-classes.js`, `badge-variants.js`, `Input`, `FilterChips`, `StatusMark`).
Out: other admin areas (Home/Jobs, Shelf, Denver, Site), public pages, the admin shell.

## My calls
- Behaviour, routes, ids, aria, focus targets, forms, copy and test hooks stay identical; only look and primitives change. `adminCopyScan.test.js` and the admin e2e suite must pass; no `window.confirm`.
- Fix the known finding: `/admin/closet/today` scrolls sideways 80 to 150px at 320 to 390 (`.admin-head`, `.today-weather`, `.chip-row` run past the edge; also on main). Zero horizontal overflow at 320, 390, 1280, 1440 on every Closet route, asserted in Playwright naming the offending element.
- Admin pages are lazy (check `App.jsx`); shared pieces other pages use (`FilterChips`, `StatTile`, `EmptyState`, `LoadState`, `PageHeader`, `AdminPageHeader`) must not change in ways that alter public pages: if one needs a change, make it additive and say so.
- Focus rings painted and pixel-tested (focused vs unfocused strip, both themes) for every new interactive element; no clipping `overflow` over a ring. Coloured text uses `-text` tokens; no opacity on text; contrast pairs in `contrast.test.js` for anything new.
- Legacy classes stay where other CSS, tests or other areas read them until #536; remove CSS only the Closet pages used.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `components/adminShellClasses.js`, the shell slice (`git log` #569), and an earlier slice's tests/e2e as the pattern. Inventory Closet hand-written card/chip/header/form CSS and who else uses each class.
2. Rebuild the five pages; tests first (run against old code and say which failed); Playwright overflow, ring pixel and axe (both themes) on every Closet route via `e2e/admin*.spec.js` conventions.
3. Verify: lint, format, targeted tests (full npm test once at the end), build, `npm run e2e:admin` if local Postgres is available (else CI's e2e-admin decides: say so); view ALL screenshots (each Closet page, 320/390/1280/1440, both themes, empty and filled states if the test data allows) and say how many. No baselines expected for admin; if any exist regenerate on CI (mine).

## Ship notes
No migration, secrets or render.yaml change. No changelog entry (admin only). Smoke: public pages untouched; `/admin` redirects as before.

## Sources
`docs/planning/2026-11-21-design-system-admin-shell-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
