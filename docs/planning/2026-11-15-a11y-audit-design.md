---
status: done
kind: fix
mode: auto
---

# Accessibility audit fixes (#273, #274, #275, #276, #299)

- #273: underline `.post-body a` with the other running-text links.
- #274: Resume link label "Resume PDF" contains its visible text "PDF".
- #275: every `pre` (markdown plugin, tour code) is focusable and named; SpotMap's
  clear action moves from the `img` svg to a visible "Clear selection" button.
- #276 (part): at phone width the masthead controls, brand and jump links are 44px
  high. Shelf chips, sub-nav tabs and inline CTAs are left for a follow-up.
- #299: delete dead CSS (`.dashboard-two`, `.quick-actions`, `.intake-note`,
  `.item-facts`) and unused exports; `#000` mask stops become `--mask-opaque`.
  `#808080` in GarmentForm is a colour input's unset value, not a themed colour.
