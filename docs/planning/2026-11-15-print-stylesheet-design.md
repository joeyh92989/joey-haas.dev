---
status: planned
kind: UI
mode: auto
---
# Print stylesheet (#292)

## Problem
`index.css` has no `@media print`. Printing About (a recruiter's likely move) gives the dark theme, nav and footer.

## Scope
In: one `@media print` block in `frontend/src/index.css`; About link URLs shown in print. Out: new components, per-page print layouts for shelf or admin pages.

## Solution
- Re-declare the light token values inside `@media print` on `:root` / `[data-theme]` (reuse the light block's values, no raw hex outside the token declarations), so a dark-theme visitor prints light.
- Hide masthead/nav, search, theme toggle, footer, skip link and other interactive chrome (`display: none` is fine in print).
- `a[href^='http']::after { content: ' (' attr(href) ')' }` scoped to About's content (and posts' prose), not nav or buttons. Internal links stay plain.
- `break-inside: avoid` on cards/headings where cheap. Page margins via `@page`.
- Respect the repo rules: tokens only, `--fs-*` for font sizes, `--space-*` for spacing (spaceScale.test.js / typeScale.test.js enforce).

## Decisions
My call: no new test file beyond a small unit test that the print block exists and hides the named chrome; real verification is a Playwright `page.emulateMedia({media:'print'})` screenshot check of /, /about, a post, in a throwaway script (not committed).

## Acceptance
Print emulation of Home, About and a post: light colours, no nav/footer/search/toggle, About link URLs visible. `npm test` incl. typeScale/spaceScale green. `VITE_DAILY_SALT=local npm run build` passes.

## Ship notes
No migration. Frontend only. Changelog entry: not needed (not a shipped feature page) unless trivial; skip.
