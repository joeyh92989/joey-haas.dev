---
status: planned
kind: refactor (delete or port legacy CSS, no visible change)
mode: auto
issue: "#536 group 536g2-rest, epic #519"
---

# Remove the old CSS, group G2: everything still left in `index.css`

## Problem
#536 ends with `index.css` deleted and Preflight on. Merged: A, B, C, D1 to D5b, E1 (#593), G1 (#594, the public pages). About 3,500 lines of `index.css` remain. This group is queue items 5 to 7: after it, `index.css` should be EMPTY (or hold only rules that must stay as plain CSS, moved to `src/styles/`), so the final PR can delete it. Done as SEPARATE COMMITS on one branch, one PR:

1. **Tour** (`/shelf/how`: Capture, Stop, StopIndex, ArchitectureFigure, LiveBox, Redacted; `.tour*`, `.arch*`, `.lane*`, `.lanes`, `.facts`, `.tour-bar`).
2. **Travel** (never migrated; shipped dark: `Lightbox`, `DrawnMap`, `PostcardCard`, `DaySection`, `TripCard`, `NeighbourStrip`, `.trip*`, `.lightbox*`, `.drawn-map*`, `.draft-badge`, `.prose a`/`.prose-list` if still present). Keep it as a feature: port, do not delete. No trip is published, so its pages are only reachable in dev (the draft trip shows in `vite dev`): prove with two vite dev servers, as E1 did for Trip, plus the unit tests.
3. **Leftovers:** `.cover*` (CoverWall/BookWall/SingleBookCard/CoverStrip, `.project-card .cover-strip`), `.item*` (`.item-card` and the Item page), StatePill, SpineHeader (`.spine*`), `.admin-error` (~80 call sites: introduce one shared class const), `.link-button`, `.btn*` stragglers (and the `.btn.sm` phone entry), RunBox `.run-*`, `.wx-*`, `.comic*`, `.playthroughs*`, `.edition*`, `.pull*`, `.play*`, `.picklist*`, `.changelog*`, `.tag*`, `.store*`, `.state*`, `.site*`, and anything else `own.cjs` still maps.

Inventory: `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/` and `.../d4/` (`own.cjs` rule-to-owner map, `rm.cjs`): re-run on current main after G1 merges. Rebuild with postcss from `frontend/node_modules` if missing.

## Scope
In: all remaining `index.css` rules and their components, class modules, tests that pinned removed rules.
Out: the Preflight shim in `src/styles/base.css`, `tokens.css`, deleting `index.css` (the final PR does it), `layer(legacy)`.

## My calls
- **No visible change.** Rule per rule: delete if the markup is already styled by utilities (leftover hook), else port to utilities in a class module (`cx` in eager code, `cn` in lazy; eager files may not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; mind `classCollisions.test.js`), then delete. Keep class NAMES that tests/e2e/print read. Generated markup that cannot take utilities moves to a file under `src/styles/`, wired like `post-body.css` (read G1/#594). Utilities beat the legacy layer: a legacy rule that used to lose needs `!` or removal. **Write every utility out whole: never `${PREFIX}utility` (Tailwind scans source text; `noSplitUtilities.test.js` guards it).** Tailwind `hover:` is wrapped in `(hover:hover)` (old rules also applied on touch: use `group-[:hover]`/`[@media(hover:none)]`); `max-[Npx]:` is strict `<` (use `[@media(max-width:Npx)]` where the old rule was inclusive); `font:` shorthand also resets line-height; logical `px/py` differ from `padding` in vertical writing modes. Reuse `chipClasses.js`.
- **Proof:** computed-style dump/diff (`frontend/e2e/tools/style-dump.mjs`, README), scenarios in `e2e/tools/scenarios/g2.mjs` (one import and one call line in `style-dump.mjs`), new fixtures in a new file. Capture a main build made FRESH from current origin/main (after G1 merged) first, own worktree and ports (other worktrees' previews run on 4180-4196, 4281-4426, 4511-4532, 4701-4707: never use or kill them). Diff after EACH commit; 0 differing records or each explained. Known flakes: /admin/jobs row-order, mid-transition captures, star-hover colour; the width-only select/label/placeholder differences in long dumps (G1 saw 321 scenarios, 0 on re-run): re-run any width-only scenario on BOTH builds side by side before calling it a flake, and say how many you re-ran. Cover each page in light and dark, desktop and phone, reduced motion, touch, with focus/hover/pressed states and long-content cases.
- Tests that pinned removed rules: move the assertion to the class string or delete if it only asserted the rule existed; never weaken a behavioural pin. Say each change in the PR.
- Run the full default-config Playwright run (single worker) and `npm test` on the FINAL build, not an earlier one.
- Visual baselines must NOT change; do not run the update workflow. Rebase on origin/main before every push.

## Tasks (Sonnet)
1. Read the docs, PRs #591 to #594; list the rules and users per commit.
2. Scenarios first; capture main; commit 1, diff; commit 2, diff; commit 3, diff. Push after each.
3. Update tests and docs naming removed rules.
4. Verify on the final build: lint, format, full `npm test`, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, dump diffs, default-config e2e single-worker. Do not open the PR.
If a commit grows past ~1,200 lines of CSS removed, stop at a clean boundary and report.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/`, `/shelf`, `/shelf/how`.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, PRs #582, #586, #591 to #594.
