---
status: planned
kind: refactor (turn Preflight on in a layer below legacy, keep output)
mode: auto
issue: "#536 slice C, epic #519"
---

# Remove the old CSS, slice C: Preflight on, below the legacy layer

## Problem
#536 requires Tailwind's Preflight to be on. Preflight resets margins, list styles, image display, heading sizes, form-control fonts and colours, borders and `[hidden]`. Today pages silently rely on browser defaults for several of these (inventory section 3). If Preflight were placed in `base`, it would sit ABOVE the legacy layer and override legacy rules that set the same properties. Put it in a new layer BELOW legacy so it only changes properties the legacy sheet never sets; then re-declare what pages relied on, so output stays the same. The last #536 slice moves it to `base` with a one-line change.

## Scope
In: `frontend/src/tailwind.css` layer line and import (`@layer preflight, legacy, theme, base, components, utilities;` and `@import 'tailwindcss/preflight.css' layer(preflight);`), `src/styles/base.css` additions, `tailwindSetup.test.js` (assert Preflight present and ordered below legacy; keep the other guards), and the fallout fixes below.
Out: deleting legacy class rules (other slices), moving Preflight to `base` (final slice), page redesigns.

## My calls
- **Output must not change.** Prove with the computed-style dump/diff tool (`frontend/e2e/tools/style-dump.mjs`, `style-diff.mjs`, README): first run it on the branch with Preflight added and NO fixes to list every difference, grouped by element/property; then fix each difference by making the page's reliance explicit (not by editing legacy values): in `src/styles/base.css` (inside `@layer legacy`-equivalent position, or the right layer) or as utilities on the component. Final diff vs main must be 0 differing records (screen, print and reduced-motion), with the scenario list from slice A PLUS every route this slice's fixes touch: admin forms (AdminItem, ItemForm, AdminComic, GarmentProductPanel, PlayNext, CollectsEditor, AdminClosetProfile), Blog and TIL posts (Markdown lists, tables, code, images, blockquote), About, Colophon, Lightbox, SearchDialog and every native `<dialog>` (Sheet, MobileNavSheet), Trip pages, the Tour. Extend the scenarios using the mocks the specs use.
- Known reliance to fix (from the inventory; verify each, find the rest from the dump diff): `.post-body ul/ol` need `list-style: disc/decimal` (and `.changelog ul`, `.timeline-points`, `.tonight-reasons`); bare `h3` takes the UA 1.17em today (size explicit); bare form controls (52 inputs, 18 selects, 4 textareas, buttons, fieldsets) get UA fonts/backgrounds/borders; Preflight's `border:0 solid` strips UA borders from inputs/selects/textareas/fieldsets/buttons and native `<dialog>`; `[hidden]` becomes `display:none !important` (find elements whose class sets a display and rely on `hidden`: `.acct-panel` and others); `img/svg/video` become `display:block; vertical-align:middle; max-width:100%; height:auto` (inline icons beside text, images relying on attributes); `table {border-collapse}`; `::placeholder` colour/opacity; `textarea {resize:vertical}`; `html` line-height and font-family (top-layer dialogs inherit from html); `a {color/decoration inherit}` (our base `a` rule sits above in the same or later layer so it wins: confirm); `button` cursor.
- The shadcn components were built without Preflight: check that none breaks (they set their own borders/colours; Preflight's default `border-color: currentcolor` vs our `--line`: verify by the dump diff on pages with Cards, Inputs, Badges, Buttons).
- Do not change the cascade for legacy `!important` (CLAUDE.md note about layered `!important`): the universal reduced-motion rule stays in legacy.
- Contrast: `::placeholder` colour changes: measure placeholder contrast in both themes (add pairs to `contrast.test.js` if not pinned) and keep it >= 4.5 against the field background (it is currently the UA default; pick a token explicitly).

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `src/styles/README.md`, `e2e/tools/README.md`, `src/tailwind.css`, `src/tailwindSetup.test.js`, and the inventory scratch (`/private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/ea5467f8-c4e0-4212-967d-bd81baaa6f3d/scratchpad/inv536/`).
2. Extend the dump scenarios; capture main; add Preflight; list differences; fix reliance group by group in small commits, diffing after each.
3. Update `tailwindSetup.test.js` and docs (`frontend/CLAUDE.md` "Design system setup", `docs/design-system.md`).
4. Verify: lint, format, full npm test once, build, check-entry-chunk, dump diffs (0), a11y and the e2e specs for the touched pages single-worker (admin specs per earlier slices' preview-only configs or `E2E_BACKEND_BIN=...` and a free port), print emulation diff. CI decides the visual baselines (they must NOT change).

## Ship notes
No migration, secrets or render.yaml change. No changelog (no visible change). Smoke: `/`, a blog post, `/about`, search dialog open.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, the #536 inventory, Tailwind v4 Preflight (`node_modules/tailwindcss/preflight.css` is the source of truth for the pinned version).
