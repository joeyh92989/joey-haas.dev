# Frontend conventions

Moved from the root CLAUDE.md. Rules for `frontend/`; shared and deploy rules stay in the root file.

- **Design rules: `docs/design-system.md`.** Page types and their parts,
  the one component for each job (header, breadcrumb, card, figure, chip
  row, state pill, empty and error states), the two shelf widths, names,
  the public/admin twin rule and the feature status list. Any design step
  reads it before drawing; a design that needs a rule it lacks adds the
  rule there in the same PR, and a parked feature gets no design changes.
- Plain CSS in `frontend/src/index.css`. No CSS framework unless deliberately
  added. Design tokens are CSS variables declared twice: dark values on
  `:root` and light overrides under `[data-theme='light']`. Style with the
  tokens, never with raw hex — a literal color will be wrong in one theme.
- Type and spacing are tokens too: `font-size` is `--fs-*` (`--fs-56` for the
  display figure). Padding, margin and gap are a `--space-*` step (0.25 to 4rem) or
  their line carries `/* space-exception: <reason> */` (hairline offsets, drawn
  spines, relative units); `spaceScale.test.js` fails on any other literal, and
  `docs/planning/2026-11-15-spacing-snap-design.md` holds the snap map. Nothing renders under 12px
  except labels inside drawings that carry an accessible name elsewhere
  (intake demo spines, run-cell marks, map labels), listed by selector in
  `typeScale.test.js`. `typeScale.test.js` and `spaceScale.test.js` enforce it.
- `Sheet` is the one modal dialog shell: a native `<dialog>` opened with
  `showModal()`, focus moved in and back out, Escape and a backdrop press
  routed through `onClose`, and `canClose` to refuse a close (sync only). It
  does not lock page scroll. `NavSheet` is the same for nav menus. Don't
  hand-roll a dialog.
- Tile family: `CoverTile` (a comic cover; `tile.kind === 'book'` is a
  collected edition), `PosterCard` (a poster) and `StatTile` (a figure; its
  `children` take a composite value, `StatTiles figures` the item-page look).
  `CoverStrip`, `GarmentTile` and `AreaCard` are different jobs.
- Theming: dark is the brand default and is written into the markup as
  `<html data-theme="dark">`, so it survives a JavaScript failure. A pre-paint
  script in `frontend/index.html` switches to `localStorage('theme')` when one
  is stored; `RootLayout` owns the state after that and persists only what the
  visitor actually chooses. `prefers-color-scheme` is deliberately ignored.
  The accepted-value check exists in both the script and `RootLayout` — keep
  them in step.
- Fonts are self-hosted static `@fontsource` faces imported in
  `frontend/src/main.jsx`, latin only — never a Google Fonts `<link>`. Using a
  new weight in CSS means adding the matching import, or the browser silently
  falls back to a cut that is loaded.
- Blog code blocks are highlighted at build time in both palettes at once
  (`frontend/vite-plugin-markdown.js`): Shiki inlines the default theme's
  colors and emits everything else as `--shiki-light*` / `--shiki-dark*`
  custom properties, which `index.css` promotes. Adding a Shiki line
  transformer needs those overrides narrowed, or a line-level color gets
  overridden.
- The Shiki theme pair and `--code-bg` are chosen together, on measured
  contrast: every color either theme emits has to clear 4.5:1 on the
  background it actually sits on. Changing either means measuring again.
- TIL notes are markdown in `frontend/notes/`, compiled by the same plugin
  as posts and listed in full at `/til`, with `/til/:slug` for each. Posts
  and notes share their published rule (`lib/markdownEntries.js` in the app,
  `scripts/markdown-lib.mjs` in the build: drafts out, newest first), the
  date and tag row (`PostMeta`, `lib/formatDate.js`) and the feed writer.
  A note's headings start at `###`, since its title is the `h2` on `/til`;
  `dist/til/feed.xml` is written even when empty. The footer and Blog index
  link TIL only while a note is published (`hasNotes` is a prop on
  `SiteFooter`, so its tests need no content mock). Any test that imports
  `content/posts.js` or `content/notes.js`, directly or through a component,
  mocks it: Vitest has no markdown plugin.
- Trips are the third markdown collection: `frontend/trips/<slug>.md` in
  the grammar parsed by `scripts/trip-markdown.mjs` (README → Travel log),
  at `/travel` and `/travel/:slug`, under the same published rule. Day
  headings carry no dates (they derive from `date` and `precision`), and a
  published trip may not contain `TODO`. Photo originals stay in the
  gitignored `trips/<slug>/photos/` (GPS never reaches git); the WebPs
  `build-travel-images.mjs` writes to `public/travel/<slug>/` and
  `photos.json` are committed. Nav and footer show Travel only while a trip
  is published (`hasTrips`), and tests mock `content/trips.js` like posts.
  `DrawnMap` (`components/`, placed by `lib/mapFit.js`, drawings in
  `content/maps/`) is the one map component: Denver spots reuses it.
- The Games and Comics tabs and the Denver footer link hide while their page
  is empty (#125), decided at build time like `hasNotes`: `vite.config.js`
  reads `public/snapshot/{items,comics,spots}.json` (Games counts the games
  in the items snapshot) through `scripts/snapshot-presence.mjs` into
  `__SNAPSHOT_PRESENCE__`, which `lib/snapshotPresence.js` turns into
  `hasGames`, `hasComics` and `hasSpots`. Only a
  written, empty snapshot hides a link; dev, tests and a failed optional
  fetch keep both. No runtime request.
- The tracker shelf is one design system for the public Games and Comics
  pages (`/shelf/games`, `/shelf/comics`) and their admin twins
  (`/admin/shelf/games`, `/admin/shelf/comics`). `/shelf` and the old
  `/admin/collection` list path redirect client-side (`ShelfRedirect` keeps
  the query, `AdminListRedirect` the query and the pull list's prefill state);
  a comic is on exactly one list on each side. Its tokens (`--rating`, `--status-*`, `--overlay`,
  `--skeleton`, `--grid-gap`) live in both theme blocks like every other
  token, and the status colors were chosen on measured contrast: each clears
  3:1 against `--surface` in both themes (they are non-text marks, and the
  stacked bar's 2px gaps are `--surface`), and `--status-backlog` also clears
  3:1 against `--line`. Changing one means measuring again; the ratios are
  recorded beside the tokens in `index.css`.
- Tracker pages break out of the 45rem prose column via `page-wide` (72rem),
  which `RootLayout` applies to any path in its `WIDE_ROUTES` list or nested
  under one. Add a new public tracker route there, not in a page's own CSS.
  `/admin*` is not in it: `SHELL_ROUTES` drops the public masthead, footer
  and page frame, and `AdminLayout` (`layouts/`) checks the session once and
  renders every admin page inside `AdminShell` (area rail, the area's page
  list, phone tab bar). A new admin page is a child route of `AdminLayout`
  in `App.jsx`, a page in its area in `ADMIN_AREAS`
  (`components/adminAreas.js`) and in `ADMIN_ROUTES` (`prerender-lib.mjs`),
  and titles itself through `AdminPageHeader`. Admin pages build from
  `StatTile`, `Panel` and `JobStatusRow`; Home is one `AreaCard` per area.
  Home, About and Projects take the 1040px `page-content` measure through
  `CONTENT_ROUTES` (exact paths, a trailing slash ignored); every other page keeps the 45rem
  column unless it is in `WIDE_ROUTES` (72rem).
  `RootLayout` also passes `{ signedIn }` as outlet context, so a routed page
  reads the session instead of calling `/api/auth/me` again.
- Shelf components live in `frontend/src/components/`: `PosterCard`,
  `PosterGrid`, `FilterChips`, `SortControl`, `ShelfToolbar`, `Rating`,
  `QuickRate`, `ShelfCardActions`, and the pieces the public pages share:
  `ResultBar`, `CoverKey`, `ShowMore`, `JumpNav`, `CappedList` and
  `EmptyState` (the one empty state).
  `SortControl` is chips on a wide screen and a select on a phone unless it
  is given `select`, the public shelf's labeled select at every width.
  `FavoritesRow`, `StatusBar`, `RatingHistogram`, `FinishesStrip` and
  `OnCartridge` are exported from `components/ShelfOverview.jsx`; every shelf
  figure is a `StatTile`. A `FilterChips` group takes a `limit` (the rest sit
  behind More…). A card's admin controls are a sibling of its link, never
  nested inside it, and a private admin row always carries a Private tag.
- `FilterChips` hides a group with at most one chip to show and none
  pressed, on both shelves; a pressed chip always keeps its group.
- Nothing on the shelf is hover-only: anything revealed on hover is also
  revealed by `:focus-within`, with `opacity` or `clip-path` rather than
  `display: none` or `visibility: hidden`, which would make it unfocusable.
  Every non-text mark with an accessible name gets `role="img"`; an
  `aria-label` on a bare `span` is ignored by screen readers.
- Shelf preferences go through `readShelfPref` / `writeShelfPref` in
  `lib/shelf.js`, which survive a throwing `localStorage`. Keys are
  namespaced per page (`shelf.public.*`, `shelf.admin.*`) so the two shelves
  keep separate defaults, and page tests clear storage in `afterEach`.
- A wait on the API goes through `withDeadline` and `useElapsed`
  (`lib/waits.js`, `lib/useElapsed.js`); its words live in
  `content/status.js`.
- Anything viewport-dependent reads `useMediaQuery` from
  `lib/useMediaQuery.js`, never `matchMedia` directly: jsdom has no
  `matchMedia`, so the hook returns false there and tests stub it.
- Link previews and search titles come from `frontend/scripts/prerender.mjs`,
  which writes `dist/<route>/index.html` with its own head for every public
  route after `vite build` (copy from `src/content/`, items from the
  snapshot only). A new public page needs its row in `publicRoutes`
  (`prerender-lib.mjs`) or it previews as the site card, **and** a rewrite
  in `render.yaml` ahead of the `/*` catch-all: Render serves
  `dist/about/index.html` at `/about/` but not at `/about`, where the
  catch-all wins. Every published post, TIL note and trip needs its own rule too, and
  unpublishing one means removing it: there are no placeholder rules,
  because a rewrite to a file the build did not write serves an empty 200
  rather than the SPA. `prerender-lib.test.mjs` checks the rules match the
  pages exactly. `/shelf/:id`, `/shelf/year/:year` and
  `/shelf/journal/:month`, and the comic issue and volume pages
  (`/shelf/<id>/<n>`, `/shelf/<id>/<slug>` where the slug is `vol-<n>` or an
  old `ed-<from>-<to>`; `ComicVolume.jsx` serves both, and `App.jsx`'s
  `ShelfPart` accepts exactly those two shapes, the same ones
  `backend/analytics.py` allows; built from `volumes` in the optional
  `comic-issues.json` snapshot (the old `editions` array and the
  `/editions/<slug>` endpoint are gone), in the sitemap like items, no
  `/spine` mirror; the owner's write tools for a volume arrive with the
  admin page) stay on the catch-all, so their prerendered heads
  are served only at the slash form (`/shelf/<id>/`). Every link, canonical,
  `og:url`, sitemap entry and feed link uses that form, built by
  `src/lib/spinePaths.js`; never hand-write a shelf item, year or month path.
  Don't add a slash with a redirect rule: on Render it loops for any path
  without a file (tried on 2026-10-19).
  The tracker moved from `/spine` to `/shelf` (copy pass, 2026-10-22).
  Every `/spine*` and `/collection*` route redirects client-side to its
  `/shelf` page in `App.jsx` (`/spine` and `/collection` land on
  `/shelf/games`, and `/shelf` itself is a client redirect there that keeps
  `?q=`; its prerendered head is canonical on Games); `legacyRoutes` in `prerender-lib.mjs` writes
  heads at `/spine`, `/spine/next`, `/spine/how` and `/spine/<id>/`
  (canonical on `/shelf`), `render.yaml` keeps the three `/spine` rewrites
  after the `/shelf` ones, and the feed is written to both
  `dist/shelf/feed.xml` and `dist/spine/feed.xml`. Feed GUIDs stay on the
  `/spine` item URL (`LEGACY_PREFIX`): changing them reposts every entry.
  Code names (`spine.js`, `SpineHeader`, `spinePaths.js`) keep `spine`.
- Site search (README → Site search): `STATIC_PAGES` in
  `src/content/pages.js` is the one list of static pages, read by both the
  search dialog and `prerender-lib.mjs`; add a page there, never to a second
  list. `public/search-index.json` is a build output from
  `scripts/build-search-index.mjs`, gitignored like the snapshot, and only
  public data goes in it: it reads the snapshot and published posts, never
  the API.
- The Daily game (code name Shelfle), the daily puzzle at `/daily` (README →
  Daily puzzle), is public as "Daily game"; code names (`ShelfleBoard`, etc.)
  keep Shelfle, as `spine` code names do for /spine. It is
  client-only: `src/lib/daily.js` (pure: pool, Denver day, pick, grade,
  share) over the items snapshot, never the API. The salt reaches it as a
  parameter from `lib/dailyConfig.js`, the one reader of
  `VITE_DAILY_SALT`, so the module stays free of `import.meta`.
  `DAILY_EPOCH` is day 1 and never moves once shipped: moving it renumbers
  every day and changes every past answer. Streak and guesses go through
  `lib/dailyStorage.js` (`daily:v1`), which survives a throwing
  `localStorage`. The match cell (`--accent-ink` on `--status-active`) and
  the close ring (`--warn` on `--surface`) were chosen on measured
  contrast, recorded beside the rules in `index.css`.
- **Closet admin (epic #392).** Admin copy lives in `content/` (`seedIntake.js`,
  `linkIntake.js`, `closetProduct.js`, `adminCopy.js`), never inline in an
  `Admin*.jsx` file (`adminCopyScan.test.js`). Check has one card per way in:
  `SeedCheck` (file), `LinkCheck` (links), `GarmentCheck` (a photo the tagger
  gave up on); photos for file and link pieces are fetched by
  `lib/useSeedImages.js`, run once per sitting from `CheckStep`. Garment tiles
  and tables ask for the grid rendition (`imageUrl(garment, { size: 'thumb' })`);
  the edit page and Today's board use the full image. Today's lead outfit is
  `OutfitBoard` (one stack, real Swap and Build-around buttons per piece in
  reading order); a piece with no photo draws its `primary_hex`, else the
  `--gc-<family>` token for its colour family, else a neutral box. Those
  tokens are the one place raw colour values are allowed (a garment's colour
  is data, the same in both themes). Fixtures for new closet API bodies come
  from the backend's response shape.
