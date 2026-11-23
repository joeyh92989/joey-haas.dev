# src/styles

The site's hand-written CSS (#536 moved every per-page rule out of the old
`src/index.css`, which is deleted). `src/tailwind.css` imports it, and the
order below is the cascade, so do not reorder it.

## The cascade

```css
@layer theme, base, components, utilities;
@import 'tailwindcss/preflight.css' layer(base.preflight);
@import './styles/tokens.css' layer(base);
@import './styles/base.css' layer(base);
@import './styles/post-body.css' layer(base);
@import './styles/print.css' layer(base);
@import './styles/utilities.css'; /* @utility: Tailwind lifts it into `utilities` */
```

Lowest to highest:

1. `theme`: Tailwind's variables (only the ones some CSS uses).
2. `base.preflight`: Tailwind's Preflight, a sublayer of `base`.
3. `base`: the files below, in order. A rule written directly in a layer beats
   a sublayer's whatever the specificity, so these rules beat Preflight
   without a specificity fight: `a { color }` over Preflight's `a { color:
   inherit }`, and the admin form-control defaults (zero-specificity `:where()`
   rules) over Preflight's `button, input { font: inherit }`. Preflight in
   plain `base` would let its element rules beat a `:where()` rule. Do not
   flatten it.
4. `utilities`: every Tailwind utility and the `@utility` classes below. A
   utility beats everything in `base`. The old `* { margin: 0; padding: 0;
   box-sizing: border-box }` rule is gone: Preflight's own `*` reset does it, and
   a bare `*` rule in `base.css` (let alone unlayered, where it beat every
   utility in the spike) would be a second copy.
5. Unlayered, above all: the shadcn token `:root` block and the `@theme`
   redeclarations in `tailwind.css` (variables only), and `tw-animate-css` and
   `shadcn/tailwind.css`, imported unlayered (`@property` blocks and one
   unused `.shimmer` rule).

Reversed `!important`: in a lower layer it wins. Preflight's `[hidden]
{ display: none !important }` is in the lowest of the `base` layers, so a
component must not put `hidden` on an element it means to show. The
reduced-motion block in `base.css` is `!important` in `base`, so it beats an
`!important` utility.

## The files

1. `tokens.css`: the `:root` (dark) and `[data-theme='light']` palettes and
   the type, space and status scales.
2. `base.css`: element rules, the page frame (`.wrap`, `.site`, `.page`,
   `.prose`), `.skip-link`, `.visually-hidden`, the reduced-motion block, the
   search dialog's and account panel's keyframes, and the admin leftovers that
   are not one component's (the form-control defaults under `.admin-main`, the
   tab bar's `html:has(.admin-tabs)` scroll padding), and the restatements of
   what Preflight removes that markup nobody writes cannot set itself.
3. `post-body.css`: the rules for `.post-body` and the Shiki spans in it
   (#536 G1): markdown and the highlighter write that markup, so it cannot
   take utilities.
4. `print.css`: `@page` and `@media print`, last so paper wins over the rules
   above it in `base` (it still loses to a screen utility on the same element,
   as it always did).

Tests that read the CSS as text use `src/testing/readCss.js`, which lists the
same files, and `src/tailwindSetup.test.js` pins the layer line and the import
order. A move that must change nothing is proved with `e2e/tools/`.

`utilities.css` is the one file imported without a layer (before Tailwind's utilities):
the classes many files share, written as Tailwind `@utility` rules (#536 G3):
`muted`, `kicker`, `btn` (with `.primary`, `.ghost`, `.danger`, `.sm`),
`link-button`, `sheet`, `chip-row`, `cover` and its parts, `empty-state` and
`admin-error`. They are the old rules, in the old order, but every selector is
wrapped in `:where()`: a rule with no specificity loses to any utility on the
same element, as the old rule did when it sat in the lowest layer. Keep that when
adding to it: a bare selector would beat the caller's own utilities. Tailwind
emits an `@utility` only when its name is in the source, so a name built at
run time (`cover-${type}`) needs a literal somewhere (`CoverImage`'s `RATIO`).
