---
status: done
kind: feature
mode: auto
---

# Projects and Colophon visuals (#289)

## Problem

Project cards are text plus a cover strip, and the Colophon describes a pipeline
(static site, API, Neon, nightly job, snapshot) in words only. #289 asks for a
hero image per project card, one architecture diagram, and a "what I'd do
differently" line per project. Joey writes the lines; this change builds the
visuals and an empty slot for them.

## Design

- **Diagram.** `ArchitectureFigure` on Colophon: an inline SVG in a `<figure>`,
  drawn with tokens in both themes, `role="img"` with an `aria-label`, and a
  visible numbered list in the `<figcaption>` saying the same in words. A
  column layout 360 units wide, so a phone shows it at about its drawn size and
  text stays at 12px or more. Every claim comes from the README, CLAUDE.md and
  `posts/how-spine-works.md`; no hosts, ids or secrets.
- **Heroes.** `scripts/project-heroes.mjs` shoots public pages with Playwright
  (My Shelf: `/shelf/games/`; This site: `/`) in both themes, at 1200 x 560, and
  writes WebP with sharp to `public/projects/<slug>-<theme>.webp`, each under
  80 KB. Public pages only, never admin; run against the live site, whose
  public data is already public. `content/projects.js` carries `hero`
  (`slug`, `alt`, `width`, `height`); `Projects` renders a dark and a light
  `<img loading="lazy">`, and CSS shows the one for the active theme.
- **Differently.** An optional `differently` string on a project, rendered as a
  labelled line only when set. Left unset: the lines are Joey's.
- Prerender and search are unchanged: no route is added, and Projects and
  Colophon keep their rows in `publicRoutes`.

## Contrast (measured, WCAG 2.x relative luminance)

Recorded beside the `.arch` rules in `index.css`; the figures are in the PR.

## Done when

Diagram and heroes render in both themes at 393 and 1280, tests and build are
green, the changelog has an entry.
