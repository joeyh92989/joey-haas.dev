---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 slice 536d4b-overview-charts, epic #519"
---

# Remove the old CSS, slice 536d4b-overview-charts: shelf overview, charts and stat tiles

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged or in CI: slice A (tokens/base/print to `src/styles/`), B (dead rules), D1 (site shell, merged), D2 (admin shell, PR #584), D3 (Denver, PR #583), C (Preflight below legacy with a `revert` shim, PR #585), D4a (poster family, stars, card controls, PR #586). Read PRs #582 and #586 and `frontend/CLAUDE.md` as the pattern: rules become utilities in a class module (`components/shelf-classes.js` etc.), class names stay as hooks when tests/e2e read them. This slice: shelf overview, charts and stat tiles. The inventory is in `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` (`rules.tsv`, `classes.tsv`, `refs.cjs`); the D4a implementer's helper scripts are in `.../scratchpad/d4/` (`own.cjs` prints every rule with its owner files; `rm.cjs` removes named selectors from index.css and their comments): reuse them; line numbers drift: re-run on current main.

## Scope
In: `.favourites*`, `.favourite-*`, the shared h2 rule for `.favourites/.now-playing/.stat-card`, `.now-playing*`, `.shelf-stats`, `.stat-count`, `.status-bar/.status-segment/.status-swatch*`, `.stat-figure`, `.rating-bar(s)/.month-bar(s)/.bar-column/.bar-axis*`, `.stat-big*`, `.cartridge-platform`, `.stat-tile(s)*`, `.day-bar*`, `.bar-list*` and related media wrappers (about 450 lines, mostly near L1044-1170 and L3551-3575 on the D4a base). Public and admin share some (`Stats`, `StatTile`, `ShelfOverview`, admin Analytics, admin games Overview): dump both.
Out: other groups' rules; tokens, base, print (done); the Preflight shim (later slices); deleting `index.css` (last slice).

## My calls
- **No visible change.** For each class rule in scope: if deleting it changes nothing the component draws (a leftover hook), delete it; if it still draws something, port the declarations to utilities (shared class modules; `cx` in eager code, `cn` in lazy code; mind `classCollisions.test.js`; a utility beats the legacy layer, so a legacy rule that used to lose to something now needs `!` or removal: the dump catches it) and then delete it. Keep the class NAME on the element when a test, e2e or script reads it.
- **Proof:** the computed-style dump/diff tool (`frontend/e2e/tools/style-dump.mjs`, `style-diff.mjs`, README; extended by D1 to D4a): extend the scenario list with every route and state this group renders (use the mocks the group's e2e specs already use; hover, Tab focus, open/closed, empty/filled, touch where relevant, print/reduced-motion where the group has rules), capture main FIRST (own ports; previews of other worktrees run on 4180 to 4186 and 4291 to 4392: never use or kill them), then diff after each commit. 0 differing records or each difference explained and accepted in the PR. Note the dump takes 15 to 25 minutes on this machine under load: scope with `ONLY=` to your scenarios and plan commits around it. List every scenario you could not cover.
- Tests that pinned removed rules (`readCss()`-based tests): move the assertion to the class string on the component or delete it if it only asserted the rule existed; never weaken a behavioural pin (tap target, ring, contrast, overflow stay in e2e). Say each change in the PR.
- `index.css` is shared with other slices running at the same time: edit only your group's rules (mixed selector lists: split, remove only yours; delete empty media wrappers), rebase on origin/main before every push, resolve conflicts keeping both sides' deletions.
- Eager code must not import `cn`, `ui/*` (except `*-variants.js`, `*-classes.js`) or Base UI; report entry chunk and built CSS size vs main.
- If the group proves too big, STOP at a clean boundary after a third of it, push, report what remains: do not stretch one PR.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`. List the group's rules (re-run the owner script) with line ranges and users.
2. Extend the dump scenarios, capture main's output first, then delete or port rule by rule, committing in small steps; diff after each.
3. Update the tests and docs that name the removed rules.
4. Verify: lint, format, full npm test once, build, check-entry-chunk, the dump diffs, the group's own e2e specs single-worker (admin specs: preview-only configs earlier slices used, or `E2E_BACKEND_BIN=/Users/joey-haas/Developer/joey-haas.dev/backend/.venv/bin` and a free port: say which). CI decides the visual baselines (must not change).

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/` and one page from the group.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, the inventory scratch folder, `src/styles/README.md`, PRs #582 and #586.
