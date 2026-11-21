---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 slice 536d2-admin-shell, epic #519"
---

# Remove the old CSS, slice 536d2-admin-shell: the admin shell, Home, Jobs and Panel leftovers

## Problem
#536 ends with `index.css` deleted and Preflight on. Slice A moved tokens, base and print into `src/styles/`; slice B deleted the dead rules. What is left are class rules for pages the earlier stories migrated (most are now hooks that draw nothing, since utilities replaced them) and a few never-migrated groups. This slice: the admin shell, Home, Jobs and Panel leftovers. The inventory is in `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` (`rules.tsv`, `classes.tsv`, `refs.cjs`; line numbers drift: re-run on current main).

## Scope
In: the class rules for `AdminShell` (~247 lines), `AccountMenu` (~80, including `acct-in` and the `.acct-panel[hidden]` rules: with Preflight `[hidden]` is handled globally, but keep the behaviour), `AdminLayout`, `AdminPageHeader`, `Panel`, `AreaCard`, `JobStatusRow`, `JobsList`, `SwapSheet` leftovers, and the admin tab-bar and sheet rules; keep the `html:has(.admin-tabs)` scroll-padding rule (it is behaviour, port it to base.css or a utility on the layout if you can prove no change).
Out: other groups' rules; tokens, base and print (slice A, done); Preflight (slice C); deleting `index.css` (last slice).

## My calls
- **No visible change.** For each class rule in scope: if deleting it changes nothing the component draws (a leftover hook: the markup is already styled by utilities), delete it; if it still draws something, port the declarations to utilities on the component (using the shared class modules, `cx` in eager code, `cn` in lazy code, the class-collision rules) and then delete it. Keep the class NAME on the element when a test, e2e or script reads it as a hook (the inventory lists them: `classes.tsv` column for test-only references).
- **Proof:** the computed-style dump/diff tool from slice A (`frontend/e2e/tools/style-dump.mjs`, `style-diff.mjs`, README there): extend its scenario list with every route and state this group's components render (use the mocks the group's e2e specs already use), capture main, then diff after: 0 differing records or each difference explained and accepted in the PR. Also print emulation for any page with print rules. The visual baselines must not change (do NOT regenerate them).
- Tests that pinned the removed rules (`readCss()`-based tests: `shelfStyles`, `adminPolish`, `adminShellStyle`, `intakeStyles`, `closetStyle`, `adminShelfStyle`, `adminHomeStyle`, `detailStyles`, `denverSiteStyle`, `addStyle`, `typeScale`, `spaceScale`): when a rule goes, the assertion either moves to the utility class string on the component (assert the class is present) or is deleted if it only asserted the rule existed; never weaken a behavioural pin (tap target, ring, contrast, overflow stay in e2e). Say each change in the PR.
- Rules inside media/container wrappers: delete empty wrappers. Mixed selector lists: split, remove only this group's selectors.
- `index.css` is shared with other slices running at the same time: edit only your group's rules, rebase on origin/main before every push, resolve conflicts keeping both sides' deletions.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`. List the group's rules from the inventory re-run, with line ranges and the components that use each class.
2. Extend the dump scenarios, capture main's output first, then delete or port rule by rule, committing in small steps; diff after each commit.
3. Update the tests and docs that name the removed rules (including any `docs/design-system.md` or `frontend/CLAUDE.md` line citing them).
4. Verify: lint, format, full npm test once, build, check-entry-chunk, the dump diffs (screen, print where relevant), and the group's own e2e specs single-worker (the admin specs need `E2E_BACKEND_BIN=/Users/joey-haas/Developer/joey-haas.dev/backend/.venv/bin`, a free port; or the preview-only configs earlier slices used: say which). CI decides the visual baselines.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/` and one page from the group.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, the inventory scratch folder, slice A's `src/styles/README.md`.
