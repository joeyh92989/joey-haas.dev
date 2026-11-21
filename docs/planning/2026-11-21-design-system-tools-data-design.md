---
status: done
kind: UI (page bodies)
mode: auto
issue: "#534, epic #519"
---

# Design system: tools and data pages

## Problem
Stats, Denver, Daily (Shelfle and its result) and Pick for me hold charts and tools that need measured colour, and still use hand-written card, chip and header CSS.

## Scope
In: `pages/Stats.jsx`, `pages/Denver.jsx`, `pages/Daily.jsx`, `components/PickForMe.jsx`, `PickList`, `DailyResult`, `BarList`, `BarRow`, `DayBars`, `ResultBar` and the CSS only they use, rebuilt on the #528 components and the #530/#531 patterns (`RecordCard`, `StatTile`, `Badge`, `buttonVariants`, `FilterChips`, `StatusMark`).
Out: admin, the shell, Shelf pages, prose pages.

## My calls
- **No shadcn Chart / recharts.** The criterion says "uses the shadcn Chart", but the site's charts are hand-built bars (`BarList`, `DayBars`, `ResultBar`); Chart is recharts, a new runtime dependency and a bundle cost for four bar rows and no behaviour gain. Keep the hand-built bars, restyle them on tokens, and measure: every chart fill/edge 3:1 against the card in both themes (add the pairs to `contrast.test.js`), chart labels in `-text` tokens. Record the amendment on issue #534 and in the PR.
- Behaviour, routes, ids, heading levels, aria, prerendered heads, daily-game logic and test hooks stay identical; only look and primitives change.
- **Daily game contrast rules** (match cell, close ring) must still hold, re-measured on the new tokens: keep or extend the existing tests; if a rule fails on the new palette, fix the colour under test and say which.
- Eager pages (check `App.jsx`) must not import `cn`, `ui/button`, `ui/card` or Base UI; use `buttonVariants`, `cx`, `card-classes.js`, `badge-variants.js`; add new eager files to the guard in `designConsistency.test.js`; `scripts/check-entry-chunk.mjs` stays green; report entry size vs main.
- Whole-card links get an inset ring pixel-tested (focused vs unfocused strip); no clipping `overflow` over a ring.
- Coloured text uses `-text` tokens; no opacity on text; no sideways scroll at 320 to 1440 on `/stats`, `/denver`, `/daily` and Pick for me (Playwright, naming the offending element).
- Legacy classes stay where other CSS or tests read them until #536; remove CSS used only by these pages.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `Home.jsx`, the #531 prose pages and their tests/e2e as the pattern. Inventory hand-written card/chip/header/chart CSS on these pages.
2. Stats (tiles, bars, day bars, changelog block); Denver; Daily and result; Pick for me.
3. Tests first (run against old code and say which failed); contrast pairs for charts and Daily cells in both themes; Playwright overflow, ring and axe on every route.
4. Verify: lint, format, full npm test once, build, check-entry-chunk, `npm run e2e` with the fixture snapshot; screenshots of each page at 320, 390, 1280, 1440 in both themes (view all, say how many). Baselines regenerate on CI afterwards (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one plain bullet. Smoke: `/stats`, `/denver`, `/daily` in both themes; smoke titles unchanged.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
