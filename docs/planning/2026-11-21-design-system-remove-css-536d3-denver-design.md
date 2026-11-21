---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 slice 536d3-denver, epic #519"
---

# Remove the old CSS, slice 536d3-denver: Denver, spots and the map

## Problem
#536 ends with `index.css` deleted and Preflight on. Slice A moved tokens, base and print into `src/styles/`; slice B deleted the dead rules; D1 moved the site shell's rules onto utilities (merged: read PR #582 and its `frontend/CLAUDE.md` notes as the pattern). What is left are class rules for pages the earlier stories migrated (most are now hooks that draw nothing, since utilities replaced them) and a few never-migrated groups. This slice: Denver, spots and the map. The inventory is in `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` (`rules.tsv`, `classes.tsv`, `refs.cjs`; line numbers drift: re-run on current main).

## Scope
In: the class rules for `SpotMap` (~164 lines), `Denver.jsx` (~63), `SpotCard` (~53), `JumpNav` (~56), `SpotFinder`/`SpotForm` and the Weekend/Spots/Analytics admin leftovers that remain (check which are still referenced), and the related media wrappers. SpotMap is a bespoke map widget (markers, popups, controls): port with care; screenshot both themes and hover/focus states.
Out: other groups' rules; tokens, base and print (done); Preflight (slice C, in flight); deleting `index.css` (last slice).

## My calls
- **No visible change.** For each class rule in scope: if deleting it changes nothing the component draws (a leftover hook: the markup is already styled by utilities), delete it; if it still draws something, port the declarations to utilities on the component (shared class modules; `cx` in eager code, `cn` in lazy code; the class-collision rules in `classCollisions.test.js`) and then delete it. Keep the class NAME on the element when a test, e2e or script reads it as a hook (`classes.tsv`: test-only references).
- **Proof:** the computed-style dump/diff tool from slice A (`frontend/e2e/tools/style-dump.mjs`, `style-diff.mjs`, README; D1 extended it with more scenario kinds): extend the scenario list with every route and state this group's components render (use the mocks the group's e2e specs already use), capture main FIRST, then diff after each commit: 0 differing records or each difference explained and accepted in the PR. Include hover, focus (Tab), open/closed states, print emulation where the page has print rules, and reduced motion where the group has animation. List every scenario you could not cover.
- Tests that pinned the removed rules (`readCss()`-based tests): when a rule goes, move the assertion to the utility class string on the component, or delete it if it only asserted the rule existed; never weaken a behavioural pin (tap target, ring, contrast, overflow stay in e2e). Say each change in the PR.
- Rules inside media/container wrappers: delete empty wrappers. Mixed selector lists: split, remove only this group's selectors. `index.css` is shared with other slices running at the same time: edit only your group's rules, rebase on origin/main before every push, resolve conflicts keeping both sides' deletions.
- Eager code must not import `cn`, `ui/*` (except `*-variants.js`, `*-classes.js`) or Base UI (guards: `designConsistency.test.js`, `scripts/check-entry-chunk.mjs`); report entry chunk and built CSS size vs main.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`. List the group's rules from the inventory re-run, with line ranges and the components that use each class.
2. Extend the dump scenarios, capture main's output first, then delete or port rule by rule, committing in small steps; diff after each commit.
3. Update the tests and docs that name the removed rules.
4. Verify: lint, format, full npm test once, build, check-entry-chunk, the dump diffs, and the group's own e2e specs single-worker (admin specs: preview-only configs earlier slices used, or `E2E_BACKEND_BIN=/Users/joey-haas/Developer/joey-haas.dev/backend/.venv/bin` and a free port; say which). CI decides the visual baselines (must not change).

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/` and one page from the group.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, the inventory scratch folder, `src/styles/README.md`, PR #582.
