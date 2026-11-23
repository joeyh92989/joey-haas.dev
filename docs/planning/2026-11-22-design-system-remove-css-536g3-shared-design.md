---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 group 536g3-shared, epic #519"
---

# Remove the old CSS, group G3: the last ~1,900 lines of `index.css`

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged: A, B, C, D1 to D5b, E1 (#593), G1 (#594), G2 (#595). About 1,900 lines of `index.css` remain, mostly rules shared across many files and data-attribute state families. This group must leave `index.css` EMPTY (or only rules that cannot be utilities, moved into `src/styles/`), so the next PR can delete it. Done as SEPARATE COMMITS on one branch, one PR, in this order (the order G2's implementer suggested):

1. **Comics family:** `.run-*` (RunBox), `.lane*`, `.cover-tile*`, `.cover-stack`, `.comic-card*`, `.series-pill`, `.state-pill`, `.neighbour-strip`.
2. **Shared primitives:** `.btn*` (and the `.btn.sm` phone entry), `.chip-row` (and its `.ctl-row`, `.tag-picker`, `.pick-choices` resets: the tag-picker and pick resets are already pinned on class strings, `.ctl-row` remains), `.muted`, `.kicker`, `.sheet`, `.spine-*`, `.facts`, `.hero*`, `.progress`, `.empty-state`, `.cover*` (careful: `cover-${type}` is built at run time and the inventory's DEAD list is wrong for it: keep what is live), `.link-button`, `.route-error`.
3. **Admin and stats pages:** `.playthroughs*`, `.play-journal*`, `.store-*`, `.item-detail*`, `.item-relink`, `.item-attribution`, `.site-stats*`, `.changelog*`, `.picklist`/`.picks-h`, `.again-tag`.
4. **`.admin-error`** (about 80 call sites: one shared class const in a small module, then replace) and anything else `own.cjs` still maps. End state: `wc -l src/index.css` is 0 (or the file holds only what you moved out, and say so).

Inventory: `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` and `.../d4/` (`own.cjs`, `rm.cjs`): re-run on current main after G2 merges. Rebuild with postcss from `frontend/node_modules` if missing.

## Scope
In: all remaining `index.css` rules, their components, class modules, tests that pinned removed rules.
Out: the Preflight shim in `src/styles/base.css`, `tokens.css`, deleting `index.css` and `layer(legacy)` (a later PR does it).

## My calls
- **No visible change.** Rule per rule: delete if the markup is already styled by utilities (a leftover hook), else port to utilities in a class module (`cx` in eager code, `cn` in lazy; eager files may not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; mind `classCollisions.test.js`), then delete. A rule shared by many files becomes one exported const in a class module. Keep class NAMES that tests/e2e/print read. Generated or data-attribute-driven markup that cannot take utilities moves to a file under `src/styles/`, wired like `post-body.css`. A utility beats the legacy layer: a legacy rule that used to lose needs `!` or removal.
- **Lessons that bit earlier groups, all mandatory:** (1) write every utility out whole, never `${PREFIX}utility` (`noSplitUtilities.test.js` guards class modules); (2) a gradient or `background` shorthand variable needs `[background:var(--x)]`, not `bg-(--x)` (`--redact`, `--hatch`); (3) check `justify-content`/`justify-self` and other less common properties survive your converter; (4) `text-decoration: none` that always lost to the global `a:hover` underline is dead: keep what was drawn; (5) `hover:` is wrapped in `(hover:hover)`, `max-[Npx]:` is strict `<` (use `[@media(max-width:Npx)]` where the old rule was inclusive), `font:` shorthand resets line-height, logical `px/py` differ from `padding` in vertical writing modes; (6) grep every `e2e/*.spec.js` and `*.test.*` for each selector you delete (G1 and G2 each had a test pinning a deleted selector that only CI's `e2e:admin` caught).
- **Proof:** computed-style dump/diff (`frontend/e2e/tools/style-dump.mjs`, README), scenarios in `e2e/tools/scenarios/g3.mjs` (one import and one call line in `style-dump.mjs`), new fixtures in a new file. Capture a main build made FRESH from current origin/main (after G2 merged) first, own worktree and ports (other worktrees' previews run on 4180-4196, 4281-4426, 4511-4532, 4701-4707: never use or kill them). Diff after EACH commit; 0 differing records or each explained. Before calling a difference a flake, re-run that scenario on BOTH builds side by side and say how many you re-ran. Because shared primitives (`.btn`, `.muted`, `.kicker`, `.hero`) touch nearly every page, run the FULL base dump (all ~1,600 scenarios) at the end of commit 2 and at the final build, not only your own scenarios.
- Tests that pinned removed rules: move the assertion to the class string or delete if it only asserted the rule existed; never weaken a behavioural pin. Say each change in the PR.
- Run on the FINAL build: full `npm test`, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, default-config Playwright single worker, AND `e2e:admin` locally (needs local Postgres, `E2E_BACKEND_BIN` at the main checkout's venv; README → Browser tests).
- Visual baselines must NOT change; do not run the update workflow. Rebase on origin/main before every push.

## Tasks (Sonnet)
1. Read the docs and PRs #591 to #595; list the rules and users per commit.
2. Scenarios first; capture main; commit 1, diff; commit 2, diff (full dump); commit 3, diff; commit 4, diff. Push after each.
3. Update tests and docs naming removed rules.
4. Verify on the final build as above. Do not open the PR.
If a commit grows past ~1,200 CSS lines removed, stop at a clean boundary and report.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/`, `/shelf`, `/shelf/how`, `/admin`.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, PRs #582, #586, #591 to #595.
