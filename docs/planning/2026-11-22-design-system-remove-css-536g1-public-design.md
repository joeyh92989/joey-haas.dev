---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 group 536g1-public, epic #519"
---

# Remove the old CSS, group G1: the public pages that still use `index.css`

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged: A, B, C, D1 to D5b, E1 (#593). Read PRs #591, #592 and #593, `frontend/CLAUDE.md` and `docs/design-system.md` as the pattern. This group is queue items 2 to 4, done as SEPARATE COMMITS on one branch and merged as one PR (fewer CI and deploy waits; each commit is proven alone by the dump):

1. **Play Next, Pick, Next, rate-a-few:** `.play-next-*`, `.up-next*`, `.pick-*`, `.shelf-nudge`, `.size-pill`, `.rate-a-few*`, `.next-*`, `.tonight*`, `.radar-*`, `.discover-*` (and `.rec-genres`, which E1 left).
2. **Daily game and the rest of the shelf:** ShelfleBoard, GuessCombobox, DailyResult, ShareSheet, Year/Month index, `.item-chips`/`.item-chip`, `.shelf-sheet .comic-actions`, `.shelf-actions-danger`, `.spine-project`.
3. **Static pages:** About, prose (`prose-classes.js`), `.post-body` plus Shiki (generated markup cannot take utilities: keep those rules, move them to `src/styles/` if they stay), Colophon, NotFound, `.timeline*`, the print rules that name them.

Inventory: `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` and `.../d4/` (`own.cjs` rule-to-owner map, `rm.cjs`): re-run on current main. Rebuild with postcss from `frontend/node_modules` if missing.

## Scope
In: the rules above, their components and class modules, tests that pinned removed rules.
Out: Tour, Travel, `.admin-error`, `.btn*`, RunBox, the Preflight shim, deleting `index.css`.

## My calls
- **No visible change.** Rule per rule: delete if the markup is already styled by utilities (leftover hook), else port to utilities in a class module (`cx` in eager code, `cn` in lazy; eager files may not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; mind `classCollisions.test.js`), then delete. Keep class NAMES that tests/e2e/print read. Utilities beat the legacy layer: a legacy rule that used to lose needs `!` or removal. Tailwind `hover:` is wrapped in `(hover:hover)` (old rules also applied on touch: use `group-[:hover]` or `[@media(hover:none)]`); `max-[Npx]:` is strict `<` (use `[@media(max-width:Npx)]` where the old rule was inclusive); `font:` shorthand also resets line-height; logical `px/py` differ from `padding` in vertical writing modes. Use the shared `chipClasses.js`.
- **Proof:** computed-style dump/diff (`frontend/e2e/tools/style-dump.mjs`, README), scenarios in `e2e/tools/scenarios/g1.mjs` (one import and one call line in `style-dump.mjs`), new fixtures in a new file. Capture a main build made FRESH from current origin/main first (own worktree and ports; other worktrees' previews run on 4180-4196, 4281-4426, 4511-4532: never use or kill them). Diff after EACH commit; 0 differing records or each explained. Mid-transition captures and the /admin/jobs row-order swap are known flakes: rerun alone on both builds. Cover each page in light and dark, desktop and phone, reduced motion, touch, with focus/hover/pressed states and long-content cases.
- Tests that pinned removed rules: move the assertion to the class string or delete if it only asserted the rule existed; never weaken a behavioural pin. Say each change in the PR.
- `index.css` is shared: edit only this group's rules; rebase on origin/main before every push. Visual baselines must NOT change; do not run the update workflow.

## Tasks (Sonnet)
1. Read the docs and PRs above; list the rules and users per commit.
2. Scenarios first; capture main; then commit 1, diff; commit 2, diff; commit 3, diff. Push after each.
3. Update tests and docs naming removed rules.
4. Verify: lint, format, full `npm test` once, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, dump diffs, the touched pages' e2e single-worker (default config). Do not open the PR.
If a commit grows past ~1,200 lines of CSS removed, stop at a clean boundary and report.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/`, `/shelf`, `/about`, `/shelf/daily`.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, PRs #582, #586, #591, #592, #593.
