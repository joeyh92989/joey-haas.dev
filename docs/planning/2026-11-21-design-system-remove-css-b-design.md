---
status: planned
kind: refactor (delete dead CSS)
mode: auto
issue: "#536 slice B, epic #519"
---

# Remove the old CSS, slice B: delete the dead rules

## Problem
The #536 inventory (scratch `inv536/`: `rules.tsv`, `classes.tsv`) found about 36 leaf rules (~160 lines) with no reference anywhere (src, e2e, scripts, .github, public), plus 2 test-only ones. Delete them first: zero-risk groundwork that shrinks `index.css` before the group-by-group slices.

## Scope
In: delete from `frontend/src/index.css`: `.empty-box` (rules ~L340-354, ~L6553, ~L6561), `.intake-demo-empty` (~L3406), `.play-next-empty` (~L3917, L3932, L4812), the `.tonight-split*` family (~L6112-6139), `.pick-empty` (~L8582), `.review-empty` (~L11189), `.comic-empty` (~L7974: a `comic-*-error` fragment exists: confirm with grep before deleting), `.inside-strip*` (~L11338-11344), and any other rule the inventory marks NONE and you can independently confirm dead (re-run `refs.cjs` on current main first: line numbers drift). Test-only: `.btn-file` (pinned by `intakeStyles.test.js` and `closetStyle.test.js`) and `.tour-pill-ok` (only `Capture.test.jsx`): delete if the component no longer uses the class; if a component still emits the class name as a hook, drop the rule only and re-point the test to assert the element renders (say which).
Out: any rule a component, test hook, dynamic class or generated markup still uses; tokens, base, print (slice A); Preflight.

## My calls
- Re-verify each candidate yourself before deleting: grep the exact class (and prefix fragments for dynamically built names: `conf-${...}`, `intake-meter-${...}`, `tour-pill${...}`, `cover-${type}`, `project-hero__img--${theme}`, `comic-*-error`, template literals with `${}`), the shadcn `data-slot`s, `public/`, `index.html`, prerender scripts (`frontend/scripts/*`) and `.github`. A class that is only emitted by markdown/rehype plugins (`.shiki`, `.post-body` children) is NOT dead.
- Leave a short comment-free diff: no reformatting of neighbours; delete empty `@media` wrappers left behind.
- Prove nothing changes: the built CSS minus the deleted selectors is identical (script: build before/after, strip comments/whitespace, diff the rule lists); the 9 visual baselines are untouched (do not regenerate); the style-reading tests pass.

## Tasks (Sonnet)
1. Re-run the inventory reference scan on current main (`inv536/refs.cjs`, `rules.tsv` as a starting point) and list each candidate with its evidence.
2. Delete; update only the tests that pinned a deleted rule (`intakeStyles.test.js`, `closetStyle.test.js`, `Capture.test.jsx`/shelfStyles if affected) without weakening anything else.
3. Verify: lint, format, full npm test once, build, check-entry-chunk, the before/after built-CSS rule diff, targeted e2e only if a deleted rule sat near a component you could not rule out.

## Ship notes
No migration, secrets or render.yaml change. No changelog. Baselines unchanged. Smoke: `/`.

## Sources
inventory report (scratch `inv536/`), `docs/planning/2026-11-20-design-system-spike-design.md`.
