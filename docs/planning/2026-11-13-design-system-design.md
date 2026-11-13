---
status: done
kind: docs
mode: auto (Joey's stops from the shelf sweep run)
---

# Design rules file and feature status list

Shelf sweep queue, item 2. The file: `docs/design-system.md`.

## Problem

The 12 Nov site review found page headers built three ways (#187), more
than two widths on a page (#188), several "way back" patterns and
unlabelled chip rows (#189). The rules that exist are prose in CLAUDE.md,
so each design session decides them again.

## Scope

In: page types (list, detail, sub-detail ruled; tool and prose named), one
component per job, widths, names, the twin rule, the feature status list
over every route in `App.jsx`, and the gaps between the rules and the code
on 13 Nov. Out: a component library, Storybook, a token build step, a
gallery page, any code change.

## Decisions (my calls; the queue left these open)

- **Gaps are migrated per page, not in a sweep.** The file lists each gap
  with the queue item that next touches the page. Cheaper than a migration
  PR, and each fix gets designed in context.
- **Area band vs page header.** `SpineHeader` stays as the shelf's band
  (name, tagline, tabs) on list pages; every `h1` comes from `PageHeader`.
  Today `Collection.jsx` puts the page's `h1` in the band and five pages
  hand-roll theirs; both are listed as gaps.
- **List pages have no breadcrumb; detail pages have no tabs.** One way
  around per page type, which removes the double way back.
- **Area name: "My Shelf" publicly, "Shelf" in the admin rail.** The one
  sanctioned difference, because every admin area is a bare noun (Closet,
  Denver, Site) and `docs/voice.md` already settled "My Shelf" for the
  public tracker. Page names (Games, Comics) are identical on both sides.
- **The twin's path is the public path under `/admin`**
  (`/admin/shelf/games`). That answers item 3's open "rename
  `/admin/collection` or keep it": move it, with a client-side redirect.
- **A type appears only once it has rows** (tab, chip, admin page), which
  drops Film & TV and Board games from today's chip rows.
- **`EmptyState` is the one new component the rules name**, added in item 3
  where Games and Comics both need one; until then empty words stay inline.
- **Widths:** full (72rem) and reading (45rem) on shelf pages. The 1040px
  measure on Home, About and Projects is left alone until a landing-page
  rule exists, and no new page may use it.
- **Status words:** live, dark (built, hidden until it has content: Travel,
  Denver's public page), parked (BGG board games #14, TMDB in production
  #162).

## Sources

- `docs/planning/2026-11-12-shelf-design-sweep.md` §5–6,
  `2026-11-12-site-review-issues.md`, `2026-11-12-shelf-pages-design.md`
- `docs/voice.md` (one name per thing)
- `frontend/src/App.jsx`, `components/adminAreas.js`, `content/spine.js`,
  `layouts/RootLayout.jsx` (`WIDE_ROUTES`, `CONTENT_ROUTES`)
- Production snapshots, 13 Nov: `spots.json` is `[]`; no trip published

## Done when

- The file exists and CLAUDE.md points to it (Conventions, first bullet).
- The feature list covers every route in `App.jsx`.
- Item 3's design cites it (checked in item 3).

## Ship notes

Docs only, no migration. Changelog line added.
