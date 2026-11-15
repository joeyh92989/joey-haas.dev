---
status: done
kind: feature
mode: auto
---

# Per-page Open Graph images (#294)

## Problem

Every post, TIL note and trip previews with the same `/og-card.png` and the same alt text.

## Design

`prerender.mjs` draws a 1200x630 PNG per published post, TIL note and trip that has no cover
photo, into `dist/og/<kind>/<slug>.png` (not git). Items keep their covers; home and static
pages keep the site card; a trip with a cover keeps its photo.

- **Text as outlines, not SVG `<text>`.** sharp's librsvg reads fonts through the host's
  fontconfig and ignores `fontfile` for web fonts (tried: the card came out in the system
  fallback). `scripts/og-card.mjs` reads the self-hosted `@fontsource` woff files with
  `opentype.js` (new pinned devDependency, pure JS, no native code), writes glyph paths into
  the SVG and rasterises with sharp (already a devDependency). Same output on every machine
  and exact widths for wrapping.
- **Look:** `--bg` ground, accent rule and site name (Inter 600), title in Source Serif 4 600
  at 68px, up to four lines then an ellipsis, kind and date in `--text-2` (Inter 500).
  `--text` 16.27, `--text-2` 9.06, `--accent` 7.15 on `--bg` (WCAG 4.5 asserted in tests).
- **Head:** `og:image` is the card, `og:image:alt` is "<title>, a post | a TIL note | a trip on
  joey-haas.dev", `twitter:card` stays `summary_large_image`.
- **Tolerant:** a failed drawing (or unreadable fonts) logs and the page falls back to
  `/og-card.png`; the build never fails.
- **Hosting:** `/og/*.png` are real files in `dist`; Render serves files before rewrites (as
  for `/assets/*` and `/travel/<slug>/*.webp`), so no `render.yaml` rule is needed or added.

## Out of scope

Shelf items, issue pages and static pages (unchanged); a light-theme card.
