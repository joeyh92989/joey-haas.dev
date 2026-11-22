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
4. `post-body.css`: the rules for `.post-body` and the Shiki spans in it
   (#536 G1): markdown and the highlighter write that markup, so it cannot
   take utilities. It sits after `index.css`, where those rules were.
5. `print.css`: `@page` and `@media print`, last so paper wins.

Tailwind's Preflight sits in a `preflight` layer below all of these; the block
at the top of `base.css` hands its resets back with `revert` (a shim, removed
when Preflight moves to `base`, #536).

Tests that read the CSS as text use `src/testing/readCss.js`, which lists the
same files. A move that must change nothing is proved with `e2e/tools/`.
