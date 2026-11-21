# src/styles

The hand-written CSS that has left `src/index.css` (#536). `src/tailwind.css`
imports these into the `legacy` layer in this order, and the order is the
cascade, so do not reorder them:

1. `tokens.css`: the `:root` (dark) and `[data-theme='light']` palettes and
   the type, space and status scales.
2. `base.css`: element rules, the page frame (`.wrap`, `.site`, `.page`,
   `.prose`), `.skip-link`, `.visually-hidden`, the reduced-motion block, the
   search dialog's and account panel's keyframes, and the admin leftovers that
   are not one component's (the form-control defaults under `.admin-main`, the
   tab bar's `html:has(.admin-tabs)` scroll padding).
3. `../index.css`: the remaining per-page class rules, being removed.
4. `print.css`: `@page` and `@media print`, last so paper wins.

Tests that read the CSS as text use `src/testing/readCss.js`, which lists the
same files. A move that must change nothing is proved with `e2e/tools/`.
