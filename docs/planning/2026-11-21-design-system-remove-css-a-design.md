---
status: planned
kind: refactor (CSS moves, no visible change)
mode: auto
issue: "#536 slice A, epic #519"
---

# Remove the old CSS, slice A: tokens, base, print and keyframes leave index.css

## Problem
#536 ends with `index.css` deleted and Preflight on. The inventory (scratch `inv536/`, summarised in this plan) found `index.css` is 12,190 lines of which only ~600 are not class rules: the two token blocks, the print block, 8 element rules, a reduced-motion block, `main:focus`, and 3 keyframes. Those cannot be deleted with the class rules; they must move to files Tailwind owns first, with no change to what the site draws.

## Scope
In: move out of `frontend/src/index.css` into new files under `frontend/src/styles/` (imported by `tailwind.css` so the cascade order is unchanged): `tokens.css` (`:root` L28-175, `[data-theme='light']` L177-249, in the same cascade position); `base.css` (the 8 element rules `*`, `body`, `h1,h2,h3`, `h1,h2`, `a`, `a:hover`, `section + section`, `footer`; `main:focus, main h1[tabindex='-1']:focus`; the universal reduced-motion block; and the shell/global class rules that style generated markup or the page frame: `.wrap`, `.page`, `.page-content`, `.page-wide`, `.site`, `.site-admin`, `.skip-link`, `.visually-hidden`, `.prose`); `print.css` (the `@media print` block and `@page`, plus the small `@media (max-width:600px)` after it if it belongs to print); keyframes `search-in`, `search-fade`, `acct-in` next to the rules that use them (or in base.css).
Out: deleting any class rule, turning Preflight on, changing any value, any page.

## My calls
- **Output must not change.** The built CSS' computed styles are what matter. Keep them unlayered or in `layer(legacy)` exactly as they are today (`@import './styles/tokens.css' layer(legacy)` etc., in the same order as their original position relative to the remaining index.css rules). If a block's position among the remaining rules affects the cascade (equal specificity, later wins), keep the order by splitting `index.css` imports (`index-a.css`/`index-b.css` or equivalent) rather than reordering; prove by diffing computed styles.
- Prove no change: (1) a script that, for the 9 visual-baseline pages x 2 themes x desktop+phone plus Stats, Now, Denver, Tour, Year, Closet Today, Admin Home, Admin Games, an item page and the search dialog open, dumps `getComputedStyle` of every element (a stable subset: color, background-color, font-*, margin, padding, border-*, display, width, line-height, text-decoration, outline) on the BUILT main and the BUILT branch and diffs them: must be empty; (2) `print` emulation (Playwright `emulateMedia({media:'print'})`) computed-style diff on About and one post; (3) the existing visual baselines pass unchanged on CI (do NOT regenerate baselines; a failing baseline means the move changed output).
- The tests that read `index.css` as text must keep passing against the new location(s): `contrast.test.js`, `typeScale.test.js`, `spaceScale.test.js`, `print.test.js`, `tailwindSetup.test.js` (legacy-token collision check must read the new tokens file), `shelfStyles.test.js`, `scripts/og-card.test.mjs`. Make them read through one helper (`src/testing/readCss.js` or similar) that concatenates the CSS files in cascade order, so later slices only change the helper. Do not weaken any assertion.
- The remaining class rules stay in `index.css`; add a header comment saying the file is being removed (#536) and where tokens/base/print live now.
- Update `frontend/CLAUDE.md` ("Design system setup", "Tokens and theme") and `docs/design-system.md` to name the new files; `tailwind.css` comments and `docs/learnings.md` if they cite index.css line numbers.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/tailwind.css`, `src/tailwindSetup.test.js`; produce the per-block line map from the current `index.css` (inventory scripts are in `/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/`: `inv.cjs`, `blocks.tsv`).
2. Write the computed-style dump script FIRST (commit it under `frontend/scripts/` or `e2e/tools/` with a README) and capture the main baseline output; then move blocks; diff must be empty.
3. Re-point the text-reading tests through the helper; run them.
4. Verify: lint, format, full npm test once, build, check-entry-chunk, targeted e2e (the baseline specs `e2e/visual*.spec.js` on this Mac fail by design per the spike doc: CI decides: say so), the style dump diff, print dump diff.

## Ship notes
No migration, secrets or render.yaml change. No changelog (no visitor-visible change). The visual baselines must NOT change (do not run the update workflow); CI's visual step is the check. Smoke: `/` in both themes and print view of an About page.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, inventory report (scratch `inv536/`), `frontend/CLAUDE.md`.
