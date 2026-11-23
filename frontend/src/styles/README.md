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
3. `../index.css`: empty since #536 group G3: every per-page rule is a utility
   on its component. The file stays, imported, until a later PR deletes it
   with `layer(legacy)`.
4. `post-body.css`: the rules for `.post-body` and the Shiki spans in it
   (#536 G1): markdown and the highlighter write that markup, so it cannot
   take utilities. It sits after `index.css`, where those rules were.
5. `print.css`: `@page` and `@media print`, last so paper wins.

Tailwind's Preflight sits in a `preflight` layer below all of these; the block
at the top of `base.css` hands its resets back with `revert` (a shim, removed
when Preflight moves to `base`, #536).

Tests that read the CSS as text use `src/testing/readCss.js`, which lists the
same files. A move that must change nothing is proved with `e2e/tools/`.

`utilities.css` is the one file imported unlayered (before Tailwind's utilities):
the classes many files share, written as Tailwind `@utility` rules (#536 G3):
`muted`, `kicker`, `btn` (with `.primary`, `.ghost`, `.danger`, `.sm`),
`link-button`, `sheet`, `chip-row`, `cover` and its parts, `empty-state` and
`admin-error`. They are the old rules, in the old order, but every selector is
wrapped in `:where()`: a rule with no specificity loses to any utility on the
same element, as the rule did when it sat in the lowest layer. Keep that when
adding to it: a bare selector would beat the caller's own utilities. Tailwind
emits an `@utility` only when its name is in the source, so a name built at
run time (`cover-${type}`) needs a literal somewhere (`CoverImage`'s `RATIO`).
