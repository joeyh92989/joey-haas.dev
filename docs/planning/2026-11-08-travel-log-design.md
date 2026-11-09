---
status: ready-for-plan
mockups: docs/planning/mockups/2026-11-08-travel-log/
chosen: a-journal.html
---

# Travel log: public trip pages with a map, days and photos (design)

Date: 2026-11-08 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-08-travel-log/` (`index.html` links them;
`a-journal.html` is the direction below). Shares the drawn-map component
with `2026-11-08-denver-spots-design.md`. The Ledger tokens from
`2026-10-19-site-refresh-design.md` apply; the markdown pipeline is the
one posts and TIL notes use (`frontend/vite-plugin-markdown.js` compiles
both collections to JS modules at build; `scripts/markdown-lib.mjs`
exports `readPublished(dir)`, `rssFeed` and `writeFeed`;
`prerender-lib.mjs` lists the routes).

## Problem

The site shows work (resume, projects, the shelf) and almost nothing of the
person. Two trips in autumn 2026 (Croatia and Greece in September: Dubrovnik,
Naxos, Athens; Tokyo in October) produced photos, notes and an itinerary
that live in a phone and a chat history. A travelogue is the most human page
a portfolio can carry, and it is a different data shape from anything on the
site today: places, dates and images rather than catalog records.

## Scope

In:

- A **Travel** top-level nav item, a `/travel` index and one page per trip
  at `/travel/<slug>`, written after the fact (travelogue first, decided
  2026-11-08; no planning mode).
- Trip content as **markdown with frontmatter** under `frontend/trips/`,
  compiled by the existing Vite markdown plugin alongside posts and notes,
  with the same published rule (drafts out, newest first) and prerendered
  heads.
- A **drawn route map**: the shared inline-SVG map component from the
  Denver spots design, fed stops from the trip's frontmatter. No tiles,
  no runtime fetch.
- **Photos in-repo** for v1: originals stay out of git; the build writes
  resized WebP (two sizes) from a source folder, strips EXIF, and the page
  references the build output. A stated threshold moves hosting to an
  object store later (Key decisions).
- Day sections with a kicker, title, place, prose and one- or two-up
  photo groups; **postcard cards** (text only) for days with no photo
  worth keeping; a **place chip row** that jumps to the first day in that
  place; a **lightbox**.
- Trip cards on the index; a "Travel" line in the footer and sitemap;
  `render.yaml` rewrites per published trip, like posts.
- Content for the two 2026 trips (authoring is the owner's; the spec
  covers the format and the pipeline).

Out, explicitly:

- Planning mode, bookings, offline view, live itinerary, comments,
  per-photo pages, anything that calls the API. The page renders fully
  while the backend sleeps.
- Live map tiles or a build-time raster map (rejected; see Key decisions).
- An object store, CDN or image service in this phase.
- A travel RSS feed (open question; cheap but not required).
- Any photo of the kid without an explicit per-photo opt-in
  (`publish: true` on that image). The default is not published.
- Home changes beyond a possible "Latest trip" line (open question).

## Design

Direction: **a-journal.html** — A (Journal), borrowing C's text-only
postcard cards for days without a photo, and C's place filter chips as
A's chip row (filter on the index, jump links on a trip page). See the
mockup's `/travel index`, `Trip page` and `Lightbox` states at 1280 and
400, both themes.

### `/travel` index

- Page title **Travel** in the `h1` style the Blog index uses; a one-line
  lede.
- A list of **trip cards**, newest first, each: cover photo (3:2, the
  trip's `cover` image), title, kicker *Sept 2026 · 12 days*, the places
  as a muted line (*Dubrovnik · Naxos · Athens*), and a photo count. The
  whole card is one link to the trip page.
- Place chips above the list (every place across trips, hidden when only
  one trip exists) filter the cards, FilterChips style, pressed state
  kept in the URL hash so a shared link lands filtered.
- Empty state (no published trip): the index is not linked from the nav
  or footer, mirroring how TIL hides until a note is published.

### Trip page

In the site's 45rem prose column (not `WIDE_ROUTES`). Top to bottom:

1. Kicker *Travel · Sept 2026* linking back to the index.
2. **Title** in `--font-display` (the serif the Home hero and About title
   use; this is the one new place it appears, by design: a trip title is
   a headline, not a tab).
3. Lede: one or two sentences from frontmatter `summary`.
4. **Facts row** (the `FactsTable` pattern, four cells, wrapping to two
   columns at 400px): Dates · Places · Days · Photos.
5. **Route map**: the shared drawn-map SVG, 16:9 on desktop and 4:3 on a
   phone, land in `--sunken`, sea in `--accent-soft`, the route as a
   dashed `--text-3` line, stops as numbered `--accent` pins with mono
   labels. A caption below the map says plainly *Drawn route, not a live
   map* and lists the stops with their numbers. The map does not pan or
   zoom; pins are links to that place's first day.
6. **Place chips**: one chip per place in visit order, each a jump link
   to the first day in that place; the current place is pressed while
   its days are in view (IntersectionObserver, optional).
7. **Days**, each a `section` with: kicker *Day 2 · Sat 13 Sept* (a range
   for grouped days, *Day 8–9 · Fri–Sat 19–20 Sept*), `h3` title with the
   place after a middle dot (*The walls · Dubrovnik*), prose, then a
   **photo group**: one photo full width, or two side by side (stacked on
   a phone). Each photo carries a short caption on the image's bottom
   edge, over `--overlay`, in `--text` at 0.8125rem.
8. **Postcard cards** for days with no photo: the same section chrome,
   the prose set in a bordered `--surface` card with a stamp-corner
   kicker, so a photo-less day still has an object on the page and the
   rhythm holds.
9. **Prev / next trip** links at the foot, like blog posts.

### Lightbox

A `dialog` (`showModal`) opened by any photo: the image at its large
size, the caption and the day beneath, previous / next buttons across
the trip's photos, a close button, Escape closes, arrow keys move. The
backdrop is `--overlay`. Focus moves to the dialog on open and returns
to the photo that opened it on close; the page behind is `inert`. On a
phone the image fits the width and the caption sits below it; swipe is a
nice-to-have, not required.

### Photos

- Source: `frontend/trips/<slug>/photos/` holds the originals as the
  owner exports them; the folder is gitignored except for a manifest the
  build reads (open question on how the originals travel to the build:
  committed resized output vs. built from a local source).
- The build writes `public/travel/<slug>/<name>-800.webp` and
  `-1600.webp`, strips EXIF (GPS above all), and emits width and height
  so the page reserves space (no layout shift). The page uses
  `<img srcset>` with the two sizes and `loading="lazy"` below the first
  group.
- Alt text is required per image in the markdown; the build fails on a
  photo without one (the same posture as the changelog parser).
- A photo marked `kid: true` in the manifest is skipped unless it also
  carries `publish: true`; nothing about the person appears in the
  output.

### Authoring format

One file per trip, `frontend/trips/<slug>.md`, frontmatter then days as
`##` headings. The plugin treats a `##` heading as a day, so headings
inside a day start at `###` (as TIL notes start at `###` under their
`h2`). Sample:

```markdown
---
title: Croatia & Greece
slug: croatia-greece-2026
summary: Twelve days, three places, one ferry that left on time.
start: 2026-09-12
end: 2026-09-23
cover: walls-afternoon
places:
  - { name: Dubrovnik, lat: 42.6507, lon: 18.0944 }
  - { name: Naxos, lat: 37.1036, lon: 25.3767 }
  - { name: Athens, lat: 37.9838, lon: 23.7275 }
published: true
---

## Day 1 · Arrive · Dubrovnik
Landed late and walked the Stradun at midnight when it was finally empty.

## Day 2 · The walls · Dubrovnik
Two kilometres around the top of the old town…

![City walls, late afternoon](walls-afternoon "Limestone street polished to glass, people on the wall above")
![Lokrum from Minčeta](lokrum-from-minceta)

## Day 8–9 · Slow days · Naxos
Repeat of the good parts.
```

- The day heading's three parts are split on the middle dot: day label,
  title, place. The place must match one in `places`.
- An image line references a manifest name, not a path; the alt is the
  square-bracket text; the optional quoted title is the caption (the alt
  is used when the caption is absent). Two consecutive image lines form a
  two-up group.
- A day with no image line renders as a postcard card.
- `places` lat/lon feed the drawn map's pin placement (projected onto the
  trip's hand-drawn coastline; the coastline itself is per-trip SVG kept
  beside the markdown, open question on authoring).

### Responsive and theme

- 400px: facts row two columns, map 4:3, two-up groups stack, chips
  scroll horizontally, lightbox image fits width.
- 1280px: as the mockup, 45rem column; the map and photo groups stay
  inside the column (no breakout), which keeps the page a post, not a
  gallery.
- Both themes use existing tokens: `--sunken` / `--accent-soft` for the
  map, `--overlay` captions and backdrop, `--accent` pins, `--text-3`
  route. No new tokens; no new contrast measurement, since every text
  token sits on `--surface`, `--sunken` or `--overlay` as elsewhere
  (captions on `--overlay` reuse the format-mark measurement from the
  shelf).

### Accessibility

- Every photo has alt text (build-enforced); captions are visible text,
  not the alt.
- The map SVG has `role="img"` and an `aria-label` naming the stops in
  order; the stop list in the caption is the text alternative, so the
  drawing carries no information on its own.
- Chips are links with `aria-current` when pressed; day sections are
  labelled by their `h3`.
- Lightbox: `dialog`, focus trapped by `showModal`, Escape and arrows
  handled, focus returned to the opener, prev/next have names
  ("Next photo, 3 of 12").
- Nothing is colour-only; the dashed route is a shape distinction.

## Key decisions

- **Journal, not Atlas.** The site's voice is prose (blog, TIL); a trip
  told in order reads like the rest. Atlas's sticky live map was the best
  first impression and the only direction where the map is navigation,
  but it made the map-tile decision load-bearing for the travel page when
  the decision belongs to Denver spots. Spots chose the drawn map; the
  travel page adopts the same component and gives up pan/zoom knowingly.
- **Drawn SVG map, no tiles.** Honours the repo's no-runtime-third-party
  rule, works while the backend sleeps, themes itself with tokens, no key,
  no attribution line, no OSM tile-policy exposure. The cost is honest:
  not geographically exact and the coastline is hand-authored per trip.
  A build-time raster image was the fallback and lost on theming (one
  image can't be right in both themes) and on blur at phone DPR.
- **Postcards' text cards and chips, not its grid.** C's masonry told the
  trip out of order and tripled the image count, which would have forced
  object-store hosting before anything shipped. Its two good ideas (a
  card for a photo-less day, place chips) cost nothing in A.
- **Photos in-repo for v1, with a threshold.** A journal trip is a dozen
  photos; two sizes of WebP at ~1600px is a few MB per trip, defensible
  in the static build. Move to an object store (Cloudflare R2 or
  Backblaze B2; not chosen here) when the built `public/travel/` passes
  ~50 MB or a third trip lands, whichever first. The markdown references
  manifest names, not paths, so the move changes the build, not the
  content.
- **Serif display for the trip title.** The one addition to where
  `--font-display` appears; a trip title is editorial, the same register
  as the Home hero. The face is already loaded (`main.jsx`), so no new
  weight.
- **Rejected: planning/binder mode.** Different data (bookings, times,
  auth) and a different audience; the markdown format carries dates and
  places so a later binder could grow from it without a rewrite.

## Component inventory

Existing, changed:

- `vite-plugin-markdown.js` / `scripts/markdown-lib.mjs`: a third
  collection (`trips`) with the day/photo grammar above; the published
  rule and date formatting shared with posts and notes
  (`lib/markdownEntries.js`).
- `prerender-lib.mjs` `publicRoutes` and `render.yaml`: `/travel` and one
  rewrite per published trip, as per-post rules exist today; sitemap
  entries.
- `RootLayout` nav and `SiteFooter`: Travel link, shown only while a
  trip is published (`hasTrips`, like `hasNotes`).
- `FactsTable`: reused for the facts row.
- `FilterChips`: reused for place chips (index filter and trip jump
  links).
- `content/`: a `trips.js` module exporting the compiled trips, as
  `posts.js` and `notes.js` do; tests that import it mock it.

New:

- `pages/Travel.jsx` (index) and `pages/Trip.jsx`.
- `TripCard`.
- `DaySection`, `PhotoGroup`, `PostcardCard`.
- `Lightbox` (dialog).
- `DrawnMap` — the shared inline-SVG map component specified in the Denver
  spots design, taking a coastline asset and stop coordinates; the travel
  page is its second consumer.
- Build step: `scripts/build-travel-images.mjs` (resize to 800/1600 WebP,
  strip EXIF, write the manifest with dimensions; fail on missing alt or a
  `kid: true` photo without `publish: true`).

Tokens used: `--font-display`, `--sunken`, `--accent-soft`, `--accent`,
`--text*`, `--overlay`, `--surface`, `--line`, `--radius`. No new tokens.

## Acceptance criteria

- [ ] `/travel` lists published trips newest first with cover, title,
      dates, places and photo count; a draft trip is absent and, with no
      published trip, Travel is absent from nav and footer.
- [ ] `/travel/<slug>` renders fully with the backend asleep; no request
      leaves the site's origin except the analytics beacon.
- [ ] The trip page shows title (serif), lede, facts row, drawn map with
      caption listing the stops, place chips, day sections with kicker /
      title / place / prose / photo group, postcard cards for photo-less
      days, and prev/next trip links.
- [ ] Place chips jump to the first day in that place; map pins do the
      same.
- [ ] Lightbox opens from any photo, traps focus, closes on Escape,
      moves with arrow keys, returns focus to the opener.
- [ ] Build fails on a photo without alt text, or a `kid: true` photo
      without `publish: true`; output images carry no EXIF (checked by a
      test reading the WebP metadata).
- [ ] Output images exist at 800 and 1600 widths; the page sets width and
      height and lazy-loads below the first group; CLS is 0 on the trip
      page in Lighthouse.
- [ ] Prerendered head and `render.yaml` rewrite exist for `/travel` and
      each published trip; sitemap lists them.
- [ ] Matches `a-journal.html` at 400px and 1280px in both themes for the
      index, trip page and lightbox states.
- [ ] `frontend/changelog.md` entry.

## Open questions for Code

- **Image pipeline input.** Either commit the resized WebP output (simple,
  repo grows ~3 MB per trip, deterministic builds) or commit originals
  outside git and build from a local folder (Render's build has no access
  to the owner's machine, so output would still have to be committed or
  fetched). Recommend: run `build-travel-images.mjs` locally, commit the
  output and the manifest; the Render build only compiles markdown.
- **Build time.** Resizing a dozen photos with `sharp` is seconds; if it
  runs on Render instead, confirm it stays inside the free build minutes
  and that `sharp`'s native binary installs there.
- **Coastline authoring.** The mockup's SVG is a sketch; the Naxos/Athens
  placement is approximate. Draw each trip's coastline from real
  coordinates (Natural Earth or an OSM coastline extract, simplified
  offline to a few hundred points, projected with a simple equirectangular
  fit to the trip's bounding box) and commit the path string beside the
  markdown. The projection code is shared with the Denver `DrawnMap`.
- **Feeds and sitemap.** A trip is a rare event; a travel RSS feed is
  cheap through the existing feed writer but not required. The sitemap
  entries are required.
- **Day grouping.** `Day 8–9` is parsed from the heading; confirm the
  grammar (`·` separators, en dash ranges) and fail the build on a heading
  that doesn't parse, as the changelog parser does.
- **Search index.** `build-search-index.mjs` should include trips (title,
  summary, day titles) alongside posts and notes, since ⌘K search is
  already shipped or in flight.
- **Home line.** Whether Home gets a "Latest trip" line next to the
  facts table; cheap, but adds a third content module to Home's reads.
