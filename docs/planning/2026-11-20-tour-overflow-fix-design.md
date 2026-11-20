---
status: done
kind: Feature/fix
mode: auto
---

# Tour overflow on narrow phones (#475, overflow part)

## Problem

Joey confirmed on a phone that `/shelf/how` scrolls sideways. The first fix
(`minmax(0, 1fr)` on the tour grid) did not hold. Measured with Playwright
(`isMobile`, so the layout viewport can widen as on a real phone):

- At 320px the page grew to 336px. The cause was the masthead, not the tour:
  brand, Search, the theme toggle and Menu need about 30px more than a 320px
  bar has, and their unbreakable words stretched the layout viewport.
- Below about 390px the `.tour-capture-table` was wider than its frame
  (`overflow: hidden`), so columns were cut off. Header cells were
  `nowrap` and pills never wrapped.
- `.tour-capture-url` was ellipsised, hiding text.

## Solution

- Masthead at 24rem and narrower: `--space-2` gaps and `--space-1` button
  inline padding, so the bar fits at 320px and below.
- Capture tables at 34rem and narrower: header cells and pills wrap, cells
  use `overflow-wrap: anywhere` and tighter inline padding, so the table fits
  its frame at every width and nothing is clipped. A word breaks only where a
  column is narrower than the word.
- Capture URL wraps instead of truncating.
- `e2e/tour-overflow.spec.js` (in `playwright.config.js`) loads `/shelf/how`
  as a phone at 320, 360 and 390 and asserts the document is no wider than
  the viewport and every capture table fits its figure and its scroller.
  Verified red on the old CSS, green on the new.

## Smoke check

Open `/shelf/how` on a phone (or 320px emulation with touch): no sideways
scroll of the page, every table column readable, the masthead shows brand,
Search, theme toggle and Menu on one row. Visual baselines for this page need
regenerating on CI.
