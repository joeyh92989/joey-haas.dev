---
status: planned
kind: UI (admin shell, first slice of #535)
mode: auto
issue: "#535, epic #519"
---

# Design system: admin shell (slice 1 of #535)

## Problem
Admin is the largest surface (22 page files). #535 says to split by area when it starts. This is slice 1: the shell every admin page sits in. Pages follow in later slices, one PR per area of `ADMIN_AREAS`:

- Home: Home, Jobs
- Shelf: Games, Comics, Add; Play next, Discover, Radar, Pull list; Sources, Store list
- Closet: Today, Closet, Add, Review, Profile
- Denver: Weekend, Spots
- Site: Analytics (Jobs is listed here as an alias of Home's)

## Scope
In: `AdminLayout`, `AdminShell`, `AccountMenu`, `AdminPageHeader`, the area rail, the phone tab bar and sheet, on the #528 components and tokens. Behaviour, routes, ids, aria, focus targets and tests stay; only the look and primitives change.
Out: page bodies; public pages; the public shell (#529, done).

## Look
Same 3b1 "Archive catalogue" look as the public shell. Mockups on disk: `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-shelf.html` for the quiet working-surface feel; the admin has no mockup of its own, so match the public shell's masthead and nav treatment from `frontend/src/components/` (MastNavLink, MoreMenu) and `docs/design-system.md`.

## My calls
- Use the existing `Button`, `Badge`, `Input`, `Tabs`, `Separator` and `button-variants.js` (eager shell code imports only the variants file, never Base UI, to keep the entry chunk down). Do not add clsx or tailwind-merge.
- Keep native dialogs and the current disclosure/menu markup, as in #529; do not adopt Sidebar or Data Table in this slice (no behaviour change). Note the reasoning in `frontend/CLAUDE.md`.
- `adminCopyScan.test.js` and the admin e2e suite must pass; no `window.confirm`.
- Focus rings: `focus-visible:outline-solid` beside `outline-2`; Playwright asserts `outlineStyle !== 'none'` on the account menu trigger, rail links and tab bar.
- No sideways scroll at 320 to 1440 on any admin route; right gutter equals left.
- Coloured text uses the `-text` tokens; no opacity on text.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `components/adminAreas.js`, `AdminShell.jsx`, `layouts/AdminLayout.jsx` and their tests.
2. Restyle shell, rail, account menu, tab bar and sheet. Tests first for each pinned behaviour.
3. Verify: lint, format, targeted tests, build, `npm run e2e:admin` (needs local Postgres, see README) or CI's `e2e-admin`, plus `npm run e2e`; screenshots of `/admin`, `/admin/jobs`, `/admin/shelf/games` at 1280 and 390 in both themes. Baselines (if any admin ones exist) regenerate on CI (mine).
4. List in the PR description the remaining areas and pages for the next slices.

## Findings for later slices (page bodies, not fixed here)
- `/admin/closet/today` scrolls sideways 80 to 150px at 320 to 390 on main too (`.admin-head`, `.today-weather`, `.chip-row`).
- The `/admin/jobs` table is wider than 320px.
- Jobs has a wide empty first column at 1280.
- Closet's five segments do not fit beside the account button at 320px; the row drops under the button (`.admin-phone-top` wraps), so nothing is clipped.

## Ship notes
No migration, secrets or render.yaml change. No changelog entry (admin only). Smoke: `/admin` redirects as before; public pages untouched.

## Sources
`docs/design-system.md`, `frontend/CLAUDE.md`, `docs/planning/2026-11-20-design-system-spike-design.md`.
