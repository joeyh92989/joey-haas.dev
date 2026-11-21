---
status: done
kind: UI (admin page bodies, slice 3 of #535)
mode: auto
issue: "#535, epic #519"
---

# Design system: admin Denver and Site areas (slice 3 of #535)

## Problem
Slice 1 moved the admin shell (#569); slice 2 (Closet) is in flight. #535 says each area of `ADMIN_AREAS` migrates in its own PR. This slice is the two small areas: Denver (Weekend, Spots) and Site (Analytics).

## Scope
In: `AdminWeekend`, `AdminSpots`, `AdminAnalytics`, their tests, and components/CSS used only by them, on the #528 components and the patterns from the shell slice, Home, prose and tools pages (record cards, `buttonVariants`, `cx`, `card-classes.js`, `badge-variants.js`, `Input`, `FilterChips`, `StatusMark`, `StatTile`).
Out: Closet (slice 2, another worktree), Shelf and Home/Jobs areas, public pages, the shell.

## My calls
- Behaviour, routes, ids, aria, focus targets, forms, copy and test hooks stay identical; only look and primitives change. `adminCopyScan.test.js` and the admin e2e suite must pass; no `window.confirm`.
- `AdminAnalytics` uses the shared bars (`BarList`, `BarRow`, `DayBars`, `ResultBar`, `StatTile`) which PR #571 (tools and data pages) restyles at the same time: do not edit those shared files; rebase on origin/main after #571 merges, and use them as they are.
- Zero horizontal overflow at 320, 390, 1280, 1440 on every route in these areas, asserted in Playwright naming the offending element.
- Focus rings painted and pixel-tested (focused vs unfocused strip, both themes) for every new interactive element; no clipping `overflow` over a ring. Coloured text uses `-text` tokens; no opacity on text; contrast pairs in `contrast.test.js` for anything new.
- Legacy classes stay where other CSS, tests or other areas read them until #536; remove CSS only these pages used. `index.css` is shared with other branches: edit only rules these pages alone use and rebase before every push.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `components/adminShellClasses.js`, and the shell slice (PR #569) and its tests/e2e as the pattern. Inventory the pages' hand-written card/chip/header/form CSS and who else uses each class.
2. Rebuild the three pages; tests first (run against old code, say which failed); Playwright overflow, ring pixel and axe (both themes) per route.
3. Verify: lint, format, targeted tests (full npm test once at the end), build, `npm run e2e:admin` if local Postgres is available (else CI decides: say so); view ALL screenshots (each page, 320/390/1280/1440, both themes) and say how many.

## Ship notes
No migration, secrets or render.yaml change. No changelog entry (admin only). Smoke: public pages untouched; `/admin` redirects as before.

## Sources
`docs/planning/2026-11-21-design-system-admin-shell-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
