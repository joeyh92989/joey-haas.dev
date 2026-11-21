---
status: planned
kind: UI (admin page bodies, slice of #535)
mode: auto
issue: "#535, epic #519"
---

# Design system: admin Home and Jobs area, plus AdminPageHeader

## Problem
The admin shell (#569), Closet (#573), Denver and Site, and the admin shelf lists (#575) are on the new look. #535 migrates each area in its own PR. This slice: admin Home and Jobs area, plus AdminPageHeader.

## Scope
In: `Admin.jsx` (the area cards and Today's swap sheet `SwapSheet`, shared with the Closet), `AdminJobs`, `AdminPageHeader` (used by every admin page: its markup, ids and props stay identical; only its look changes), and the `StatTile`/`Panel`/`JobStatusRow`/`AreaCard` families the shell slice left untouched, their tests, and components/CSS used only by them, on the shared pieces and patterns from the earlier admin slices (`adminShellClasses.js`, `closetClasses.js`, `ui/field-classes.js`, `adminShelfClasses.js`, `buttonVariants`, `cn` for lazy code, `Input`, `StatusMark`, `FilterChips`).
Out: every other admin area and page, public pages, the shell. Known findings to fix here: `/admin/jobs` table wider than 320 inside its scroller, wide empty first column at 1280. Other implementers work at the same time on the Shelf pages: do not touch their files.

## My calls
- Behaviour, routes, ids, aria, focus targets, forms, copy and test hooks stay identical; only look and primitives change. `adminCopyScan.test.js`, the admin unit tests and the admin e2e suite must pass; no `window.confirm`.
- **Class-collision rule (found in #533 review):** never join `buttonVariants(...)` / `badgeVariants(...)` output with other classes through `cx` or a template when both set the same colour/padding property: use `cn` (lazy admin pages may import it) or a dedicated string; `src/classCollisions.test.js` scans all of src. Measure every pressed/checked/armed/disabled state's real text-vs-fill contrast in the BUILT CSS (Playwright computed styles, both themes, >= 4.5); pressed states not by colour alone.
- Migrated controls lose the legacy `.chip`/`.btn.sm` 44px phone min-height: restore with `max-[700px]:min-h-11` and assert tap targets at 390 (both prior slices regressed this).
- Painted focus rings pixel-tested (focused vs unfocused strip, both themes, 390 and 1280) for EVERY control including those inside opened sheets, menus, forms and armed states; no clipping overflow over a ring (scrollers: padding or scroll-px).
- Zero horizontal overflow at 320, 390, 1280, 1440 with REALISTIC data (long names, 60-char unbroken names, many tags, 3-digit counts), named offender on failure.
- Admin pages are lazy; keep the designConsistency guard and `scripts/check-entry-chunk.mjs` green. Shared components used by other pages: additive props only; run the public shelf spec if you touch one.
- Legacy classes stay where other areas read them until #536; remove CSS only these pages used. index.css is shared: edit only your rules and rebase before every push.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, and the earlier admin slices (PRs #569, #573, #575) with tests/e2e as patterns. Inventory hand-written card/chip/header/form CSS on these pages and who else uses each class.
2. Rebuild the pages; tests first (run against old code, say which failed); Playwright overflow, tap-target, ring pixel (incl. opened states), computed-contrast and axe (both themes) with realistic mocked data; `npm run e2e:admin` if local Postgres and a free port are available.
3. Verify: lint, format, targeted tests, full npm test once at the end, build, check-entry-chunk; view ALL screenshots (each page, 320/390/1280/1440, both themes, opened states) and count them.

## Ship notes
No migration, secrets or render.yaml change. No changelog entry (admin only). Issue #535 stays open until its last slice.

## Sources
`docs/planning/2026-11-21-design-system-admin-shell-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
