---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 slice 536e1-chips, epic #519"
---

# Remove the old CSS, slice E1: the shared chip, result, disclosure and attribution rules

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged so far: A, B, C, D1 to D5b (PRs #580 to #592). Read #591 and #592, `frontend/CLAUDE.md` and `docs/design-system.md` as the pattern: rules become utilities in class modules, class names stay as hooks when tests/e2e/print read them. This slice is the first of the shared-rule leftovers: `.chip` (hover, focus-visible, `[aria-pressed]`, `[aria-current]`, `.chip-modifier`, `.trip-places .chip`, the phone tap-target entry, `.chip > .chip-count`), `.chip-count`, `.chip-list`, `.result` and `.result strong` (about 53 users), `.disclosure` (and `::after`, `[aria-expanded]`, focus ring), `.attribution` (and `.attribution a`, `.attribution p`). About 33 `.chip` users and 53 `.result` users: port per user, then delete. The `.chip-row` resets for `.ctl-row`, `.tag-picker` and `.pick-choices` stay with `closetStyle.test.js` and e2e pins.

Inventory and helpers: `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` (`rules.tsv`, `classes.tsv`, `refs.cjs`) and `.../scratchpad/d4/` (`own.cjs`, `rm.cjs`): re-run on current main (line numbers drift). If the scratchpad is gone, rebuild with postcss from `frontend/node_modules`.

## Scope
In: the rules above and every component that uses those classes (grep `chip`, `result`, `disclosure`, `attribution` in `frontend/src`), their class modules, tests that pinned removed rules.
Out: other groups, tokens/base/print, the Preflight shim, deleting `index.css`, RunBox `.run-*`.

## My calls
- **No visible change.** For each rule: if deleting it changes nothing drawn (a leftover hook), delete; else port to utilities in the user's class module (`cx` in eager code, `cn` in lazy; eager files may not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; mind `classCollisions.test.js`). Prefer one shared class string (a const in a small shared module, e.g. `src/components/chipClasses.js`) over copying the same utilities into 33 places, as long as each user keeps drawing the same. Utilities beat the legacy layer, so a legacy rule that used to lose to something needs `!` or removal: the dump catches it. Keep class NAMES tests/e2e/print read.
- Touch: the old hover rules also applied on touch; Tailwind `hover:` is wrapped in `(hover:hover)`: use `group-[:hover]` or `[@media(hover:none)]` equivalents where the old rule had no media wrapper. `max-[Npx]:` is strict `<`.
- **Proof:** computed-style dump/diff (`frontend/e2e/tools/style-dump.mjs`, README). Put NEW scenarios in `frontend/e2e/tools/scenarios/e1.mjs` (one import and one call line in `style-dump.mjs`), fixtures in a new file. Capture a main build made FRESH from current origin/main first (own worktree, own ports; other worktrees' previews run on 4180-4196, 4281-4426, 4511-4532: never use or kill them), diff after each commit. 0 differing records or each difference explained. Cover every page that shows a chip, result line, disclosure or attribution (public shelf pages, Tour, Travel, admin, Closet), pressed/focus/hover states, dark/light x desktop/phone, reduced motion, touch. Scope with `ONLY=`.
- Tests that pinned removed rules: move the assertion to the class string or delete it if it only asserted the rule existed; never weaken a behavioural pin (tap target, ring, contrast, overflow). Say each change in the PR.
- `index.css` is shared: edit only your group's rules, rebase on origin/main before every push. Visual baselines must NOT change; do not run the update workflow.

## Tasks (Sonnet)
1. Read the docs above, PRs #591/#592, list the group's rules and every user with ranges.
2. Scenarios first; capture main; then port/delete family by family (chip, result, disclosure, attribution), committing and pushing after each; diff after each.
3. Update tests and docs naming removed rules.
4. Verify: lint, format, full `npm test` once, build, `scripts/check-entry-chunk.mjs`, the dump diffs, the touched pages' e2e single-worker.
If it is too big, STOP at a clean boundary after about half, push, report what remains.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/`, `/shelf`.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, PRs #582, #586, #591, #592.
