---
status: done
kind: refactor (finish the old-CSS removal: Preflight really on, no visible change)
mode: auto
issue: "#536 final slice 536h-preflight, epic #519"
---

# Remove the old CSS, final slice H: delete `index.css`, `layer(legacy)` and the Preflight shim

## Problem
Merged: A, B, C, D1 to D5b, E1 (#593), G1 to G3 (#594 to #596). `frontend/src/index.css` is EMPTY. What is left of #536:
1. `index.css` and `layer(legacy)` still exist: `tailwind.css` has `@layer preflight, legacy, theme, base, components, utilities;` and imports tokens/base/post-body/print into `legacy`.
2. Preflight is on **in name only**: it sits in a layer BELOW `legacy`, and about 110 lines in `src/styles/base.css` (the `:where(...) { prop: revert }` groups, "Preflight restatements") hand each reset back to the browser. Known reliance: `.post-body ul/ol` bullets, bare `h3`/`h4` size, about 52 bare inputs/selects/textareas, native `<dialog>` borders, `[hidden]` (Preflight's `display:none !important` in the lowest layer), `::placeholder` (already moved to `--text-3`, deliberate), tables, `img/svg` display, `html` font and line height, date inputs, `code/pre`.

End state: `@layer theme, base, components, utilities;`, Preflight imported into `base` (the standard Tailwind setup), no `index.css`, no `layer(legacy)`, no `revert` shim, and pages drawn exactly as before. This is the riskiest slice of the story: it gets a cold Opus review AND a real-data check (below), not only the dump.

## Scope
In: `src/tailwind.css`, `src/styles/{tokens,base,post-body,print,utilities}.css`, deleting `src/index.css`, `src/testing/readCss.js`, `src/tailwindSetup.test.js`, every test that reads the CSS as text, `frontend/CLAUDE.md`, root `CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`, the design doc (mark `status: done`), and whatever markup needs explicit styles once the shim goes.
Out: new features, new visual changes, the Travel feature, the Closet picker.

## My calls
- **Three groups of commits on one branch, one PR:**
  1. *Delete `index.css`.* Remove the file, its import in `tailwind.css`, its entry in `readCss.js` and `tailwindSetup.test.js`, and fix stale comments (`tailwind.css`'s header, "lowest layer" notes). No behaviour change; dump 0.
  2. *Layers.* Decide where `tokens.css`, `base.css`, `post-body.css`, `print.css` and `utilities.css` live once `legacy` is gone. Constraints: base.css has `* { margin:0; padding:0; box-sizing }` that must not beat utilities (so it cannot be unlayered; put it in `base`, after Preflight); element rules must still beat Preflight where they did before; `utilities.css` is `@utility` (no layer by itself); print rules must still win over screen utilities where they did; tokens are `:root` variables (any layer). Write down the cascade you chose in `src/styles/README.md` and in a test (`tailwindSetup.test.js`). Layer line becomes `@layer theme, base, components, utilities;`. Dump 0 after this commit, with the shim still in place.
  3. *Replace the shim, group by group, one commit per group,* in this order (each group = one `:where(...)` block of `revert` rules in `base.css`): lists/markers (`ul, ol, menu`; `.post-body` bullets), headings, form controls and borders (buttons, inputs, selects, textareas, `optgroup`, `::file-selector-button`, date inputs), tables, media (`img/svg/video/canvas`, `progress`), `hr`, `small/sub/sup`, `code/kbd/pre`, `html`, `dialog`, `[hidden]`, `::before/::after`. For each group: delete the shim block, run the dump, and every element that now differs shows exactly which page/state relied on the browser default. Fix with an explicit utility on the component or a small element rule in `base.css` that states the value Preflight removed (a hand-written rule that restates the BROWSER default is fine when the element is generated markup, e.g. `.post-body ul`; prefer utilities on components elsewhere). Then the final commit makes `tailwindcss/preflight.css` import `layer(base)` if not already, and the shim is gone entirely.
- **Delete** `[.admin-app-phone_&]:z-40` in `SHELF_SHEET` (`shelf-classes.js`): a dead utility noted earlier. Check first that nothing needs it.
- **Docs and tests rewritten, not just trimmed:** `frontend/CLAUDE.md` "Design system setup", root `CLAUDE.md` mentions of `index.css`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`, and sweep `grep -rn "index.css\|layer(legacy)\|legacy layer" frontend docs *.md` for leftovers. Mark the design doc `status: done`.
- **Follow-ups to record in the PR body, not fix:** prose links use the browser default focus ring while cards use the accent ring; `.replay-mark` on dimmed public cards fails axe contrast (pre-existing); StatTile Best-day detail clipped at 320 to 390; Quick-rate half-star targets 9px wide (WCAG 2.5.8); the shell's phone page links are 36px; JumpNav phone links; Admin spots table; `.tour-bar` track contrast; run lanes' 24px top margin; hovered `a.cover-tile`, Travel cards and map pins underline (global `a:hover`); global `@utility` classes (`btn`, `muted`, `kicker`...) could become per-site constants.
- **Lessons from earlier groups, all mandatory:** write every utility out whole (no `${PREFIX}utility`; `noSplitUtilities.test.js` guards class modules); a gradient or `background` shorthand variable needs `[background:var(--x)]`; Tailwind `hover:` is wrapped in `(hover:hover)`; `max-[Npx]:` is strict `<`; grep every `e2e/*.spec.js` and `*.test.*` for anything that reads the CSS or a selector you change.

## Proof (stronger than a normal slice)
1. Computed-style dump/diff (`frontend/e2e/tools/style-dump.mjs`, README), the FULL dump (all scenarios, all emulations), against a fresh main build, after each commit group and on the final build. 0 differing records or each explained; before calling a difference a flake, re-run it on BOTH builds side by side and say how many you re-ran. The dump reads only a fixed property list: ADD the properties Preflight touches that are missing from it (list-style-type, border-*-style/width/color, table border-collapse and spacing, `::marker`, `::placeholder`, `appearance`, `-webkit-tap-highlight-color`, `tab-size`, `display` of `[hidden]`, form-control `font-*`, `letter-spacing`, `text-transform`, `image` `vertical-align`, `dialog` borders and margins) and pseudo-elements `::before`, `::after`, `::marker`, `::placeholder`, `::file-selector-button` if the tool can read them; say which it cannot.
2. **Real-data check:** `SNAPSHOT_API_URL=https://api.joey-haas.dev` a11y run (`e2e/a11y.spec.js`, see CLAUDE.md "Known flaky tests": two `/now` link-in-text-block failures on production data are known) and screenshots of the main pages (Home, `/shelf` and a shelf list, an Item page, `/shelf/daily`, About, a blog post with a list and a code block, Stats, `/shelf/how`, Denver, the admin Closet and a Shelf add form) in light and dark at 393 and 1280, main vs this branch, compared by eye and by pixel diff; list what you checked. Real data has pages and states the fixtures do not (long titles, lists in posts, many covers, forms with real values).
3. Default-config Playwright single worker, `e2e:admin` locally (see README → Browser tests), full `npm test`, lint, format, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, all on the FINAL build. CI's visual baselines must not change (never run the update workflow).

## Tasks (Sonnet; the cold review is mine)
1. Read the docs, PRs #591 to #596, `src/styles/README.md`, `e2e/tools/README.md`, `frontend/CLAUDE.md` "Design system setup".
2. Capture main (fresh build) and extend the dump's property list first; confirm the dump is 0 on the unchanged branch.
3. Commit group 1, dump; group 2, dump; group 3 commit by commit, dump after each (scope with `ONLY=`, full dump at the end of each group).
4. Docs and tests; the real-data check; final verification. Do not open the PR.
If a group is too big, stop at a clean boundary and report what remains.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Smoke: `/`, `/shelf`, `/about`, a blog post, `/admin`. After the deploy: run the real-data a11y run against production and look at the live pages in light and dark on a phone width.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`, PRs #581, #585, #591 to #596.
