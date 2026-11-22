---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 slice 536d5b-intake, epic #519"
---

# Remove the old CSS, slice D5b: the admin intake flow and the remaining Closet forms

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged so far: A (tokens/base/print), B (dead rules), C (Preflight below legacy with a `revert` shim), D1 (site shell), D2 (admin shell), D3 (Denver), D4a/b/c (shelf cards, overview/charts, toolbar), D5a (Closet tiles, Today, outfit board, review deck, sell sheet, Wrap up sheet, list view). Read PRs #582, #586 and #591 and `frontend/CLAUDE.md` as the pattern: rules become utilities in class modules, class names stay as hooks when tests/e2e read them. This slice is the rest of D5: everything under `components/intake/*`, `IntakeDemo`, `ConfidenceBadge` and the dynamically built classes (`conf-*`, `intake-meter-*`, `intake-shot-*`: keep the names, port the rules), `AddDrawer`, `MetadataPicker`, `ComicBooks`, `SeriesGrewRow`, `AddSection` leftovers, plus the remaining Closet forms (`GarmentForm`, `GarmentProductPanel`, `AdminClosetProfile`, `AdminGarment`, `.garment-attach*`, `.closet-week-day`, `.garment-form*`, `.garment-stepper`). About 1,500 lines. If it is too big, STOP at a clean boundary after about half, push, report what remains: do not stretch one PR.

Inventory and helpers: `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` (`rules.tsv`, `classes.tsv`, `refs.cjs`) and `.../scratchpad/d4/` (`own.cjs`, `rm.cjs`): re-run on current main (line numbers drift).

## Scope
In: the files above, their class modules (`addClasses.js`, `closetClasses.js`, `closetReviewClasses.js`, `wrapUpClasses.js`, `intake` helpers), tests that pinned removed rules (`intakeStyles.test.js`, `closetStyle.test.js`, `addStyle.test.jsx`).
Out: RunBox's `.run-*` rules (mixed with other groups: leave), other groups, tokens/base/print, the Preflight shim, deleting `index.css`.

## My calls
- **No visible change.** For each class rule: if deleting it changes nothing the component draws (a leftover hook), delete it; if it still draws something, port the declarations to utilities in the class module (`cx` in eager code, `cn` in lazy; the admin intake pages are lazy; `IntakeDemo` may be public: check `App.jsx`; mind `classCollisions.test.js`; a utility beats the legacy layer, so a legacy rule that used to lose to something needs `!` or removal: the dump catches it) and then delete it. Keep class NAMES that tests/e2e/print read.
- **Proof:** the computed-style dump/diff tool (`frontend/e2e/tools/style-dump.mjs`, README). To stop the scenario list conflicting between slices, put your NEW scenarios in a NEW file `frontend/e2e/tools/scenarios/d5b.mjs` (an exported function) and add only one import and one call line to `style-dump.mjs`. Capture a main build made FRESH from current origin/main first (own worktree, own ports; other worktrees' previews run on 4180-4196, 4281-4426, 4511-4532: never use or kill them), then diff after each commit. 0 differing records or each difference explained. Scope with `ONLY=` (a full run takes 15-25 minutes under load). Add the Closet sitting fixtures that D5a could not cover (Check, Seed, GarmentCheck, LinkCheck cards; `e2e/admin-add.fixtures.js` only has shelf sittings) so those states are in the dump: new fixtures live in a new file, not in the shared fixtures file.
- Touch devices: the old hover rules also applied on touch; a Tailwind `hover:` utility is wrapped in `(hover:hover)`: use `[@media(hover:none)]`/`group-[:hover]` equivalents where the old rule had no media wrapper (D5a fixed one such regression: read its commit).
- Tests that pinned removed rules: move the assertion to the class string or delete it if it only asserted the rule existed; never weaken a behavioural pin (tap target, ring, contrast, overflow stay in e2e). Say each change in the PR.
- `index.css` is shared: edit only your group's rules, rebase on origin/main before every push.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`, PR #591. List the group's rules (own.cjs) with ranges and users.
2. Fixtures + scenarios first; capture main; then delete/port family by family, committing and pushing after each family; diff after each.
3. Update tests and docs naming removed rules.
4. Verify: lint, format, full npm test once, build, check-entry-chunk, the dump diffs (screen dark/light x desktop/phone; reduced motion; touch where relevant), the group's e2e single-worker (admin specs: preview-only configs earlier slices used, mocks from `e2e/closet-mocks.js` and `e2e/admin-add.fixtures.js`). CI decides the visual baselines (must not change).

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/` and `/shelf/intake` if public.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, the inventory scratch folder, PRs #582, #586, #591.
