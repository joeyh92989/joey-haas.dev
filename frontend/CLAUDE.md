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
  figure is a `StatTile`. The comics figures row is `ComicFigures`, shared by
  the public shelf and `AdminComics`; its book-first tiles (#333: Books owned,
  Volumes missing, Issues read) are left out of a body that lacks them, and
  Volumes missing is also left out at 0 with no book line. A `FilterChips` group takes a `limit` (the rest sit
  behind More…). A card's admin controls are a sibling of its link, never
  nested inside it, and a private admin row always carries a Private tag.
- `FilterChips` hides a group with at most one chip to show and none
  pressed, on both shelves; a pressed chip always keeps its group. A group
  given `total` (the list's size) also keeps a lone chip whose count is below
  it, since that chip narrows the list (History's Tag and Verdict).
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
  `/spine` mirror; the owner's write tools are the admin page below) stay on the catch-all, so their prerendered heads
  are served only at the slash form (`/shelf/<id>/`). Every link, canonical,
  The issue page's "Held" line (#332) reads `held_single` and `also_in` from
  `/api/public/items/<id>/issues/<n>` (`ComicIssue.jsx`, copy in `spine.comics.issue.alsoIn`): single only, "Also in: ..." or both, each book a link built by `volumePath(title_id, slug)`, a book of another title shown as "label (title)". Its fixtures (`e2e/fixtures/api/issue*.json`) come from `backend/scripts/export_public_comic_fixtures.py`.
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
  The post "How My Shelf works" moved from `/blog/how-spine-works` to
  `/blog/how-my-shelf-works` (#483): `render.yaml` redirects the old slug,
  `App.jsx` redirects it client-side, and `BLOG_GUIDS` in `markdown-lib.mjs`
  keeps its feed guid on the old URL.
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

- **The admin Book page (#334).** `/admin/shelf/comics/:id/:slug`
  (`AdminComicVolume.jsx`, keyed per `id/slug` in `App.jsx`) is the twin of
  the public Book page: breadcrumb Shelf / Comics / title / book, then the
  cover and name with the Comic Vine link (`EditionLinkPicker`, now
  `PUT /api/comics/volumes/{id}/link`), On the shelf (Owned and Read, each a
  `PATCH` that saves at once with a status line and Undo), Facts (one form,
  one `PUT`), Collects (`CollectsEditor.jsx`; every action writes the whole
  list through `PUT`, entries sent back by `id` so an untouched one keeps its
  source; reorder has Undo, Remove asks first; **Read from description**
  (`onParse`, `POST /volumes/{id}/contents/parse`, #327) and a toggled
  "Paste the reprint note" box fill the list on the server, which replaces
  only entries it read before: the page just shows the answer and one status
  line from `content/adminVolume.js` `collects.read`), the neighbouring books,
  Move to another title and Delete. The slug resolves through
  `GET /api/comics/{id}/volumes`, then the page reads
  `GET /api/comics/volumes/{id}`. Every call is in `lib/volumeEdits.js`
  (a refusal is a `VolumeError` whose `fields` come from a 422's `loc`:
  `collects.2.link.to_number`); the words are `content/adminVolume.js`. Delete
  is `ShelfConfirm` given a `source` (the volume's own delete preview and
  words), never `window.confirm`. A private target title carries a Private
  tag. The comic edit page's Editions panel is gone, and nothing in the UI
  reads or writes `items.editions` (the column was dropped in `0025`):
  its **Books** panel (`BooksPanel.jsx`) lists the title's books and adds
  one. Component tests build their bodies from
  `e2e/fixtures/api/admin-volume*.json`, which
  `backend/scripts/export_admin_volume_fixtures.py` writes from the real
  response models.
- **Intake speaks books (story #328).** A comic sitting's Check
  (`intake/ComicBooks.jsx`, words in `content/comicIntake.js`) shows what each
  entry commits from the server's own plan: `adds`, `title_will_be_created`,
  `contents_preview` and `already_held` (a warning, never a block; the label
  links to `/admin/shelf/comics/<title_id>/<slug>`). A collected book has the
  five-kind Format select (`edition_kind`) and a Number in the line
  (`line_number`), saved and refused like the other Check fields. Done
  (`DoneStep.jsx`) lists `volumes_new` and `titles_created`, and the typed
  books a series gained (`series_new[].books`, `series_grew[].books_added`); no intake text
  says "edition". Details' collected-books rows (`BookRows` in `ItemForm.jsx`,
  `bookRows`/`parseBookRows` in `lib/comics.js`) save as the payload's `books`
  and become volumes at commit; a comic that is itself a photographed book
  (`payload.format === 'collected'`) has none, and a sitting typed before the
  rename is read from `editions` and re-saved as `books`. Tests build bodies from `e2e/fixtures/api/intake-comic-*.json`,
  which `backend/scripts/export_intake_comic_fixtures.py` writes from the real
  `SittingOut`, `CommitOut` and `volume_plan` functions.
- **Title pages by kind (#330).** `Item.jsx`'s comic path reads the public
  block's `kind` (`lib/titleKind.js`: `run`, `book_line`, `single_book`,
  `both`; a body without one, as an older API or snapshot sends, is a `run`
  and draws exactly as before). A book line draws `BookWall` (`bookTiles`
  from the block's `slots` and owned `volumes`; `CoverTile` kinds `volume`
  and `vol-gap`), a single book `SingleBookCard`, and `both` draws Books and
  then Issues (the run card and `CoverWall` under "Issues" and "Every issue
  in the run"); only a run or `both` shows What's next and the run count, and
  only a run shows the old Editions card. The admin comic header says the kind
  in words (`kindWord`). Link previews read `kind` from the `comic-issues`
  rows (`comicLead` in `prerender-lib.mjs`). Component and e2e fixtures are
  `e2e/fixtures/api/public-comic-*.json`, which
  `backend/scripts/export_public_comic_fixtures.py` writes from the real
  `PublicItemDetailOut`; the e2e build has one fixture title of each kind.
- **Shelf cards by kind (#331).** `ComicCardRun` (public and admin cards, the
  twin rule) leads with the kind in words (`kindSummary` in `lib/comics.js`,
  words from `spine.comics.kinds`) and, for a title that holds books, which
  volumes are owned: `volumesOwnedText(numbers, volumesOwned, lineSize)`
  ("Vol. 1, 2 and 4", more than 8 numbers collapse runs of 3+ to "1 to 12";
  books with no number add ", and N books with no number", the owned count
  minus the numbered). The line's size is stored nowhere, so "of N" prints
  only when a caller passes `lineSize`; nothing does. Lanes and run text draw
  only for a `run` or `both`; a line of books or a single book draws no
  lanes and no slot pips (a pip row would imply a size). The Books chip is
  `kind` in `book_line`, `single_book`, `both`; Single issues is `run`,
  `both` (a row with no `kind` is a run). Both ride the shelf's one chip
  state (`shelf.public.comics.chip`, `shelf.admin.comics.chip`) and hide at
  a zero count unless pressed (`FilterChips`). The admin rows get `kind`,
  `volumes_owned` and `volume_numbers` from `ItemOut.comic_run`. The public
  shelf fixture is `e2e/fixtures/snapshot/comics.json`, written by the same
  exporter from the real `public_comics._row`; the Comics page tests import it.
- **How a book joins a title.** A collected book shares a series' title page
  only by the backend rule `comics.shares_title`: its title minus volume and
  format words equals the series' name, and at least 60% of its known
  contents (`SHARE_MIN_FRACTION`) are that series' issues; empty contents
  leave the name to decide. The frontend never decides it: Check's preview
  reads `adds` and `title_will_be_created` from the server. Rule and
  thresholds: `backend/comics.py` and `backend/CLAUDE.md` (Comics).
- **History (`/admin/history`, story #347).** `pages/AdminHistory.jsx` reads
  `GET /api/spots/outings` (newest first, with the year's counts) and groups
  it with `lib/outingGroups.js` (consecutive months; a year outing is its own
  group after that year's months; `whenWords` words each outing by precision,
  never a made-up day). Words in `content/outings.js` (`history`). The header
  count line is hidden while loading, failed or empty. The note renders as text, and the sheet's save or
  maybe-saved rereads the list.
  Filters (story #348) are client-side over the loaded rows, in
  `lib/historyFilters.js` (pure: parse, write, apply, options with counts,
  year counts). URL keys: `city` (a city key), `tag`, `verdict`
  (`loved|fine|not_again`), `kid=1`, `spot=<uuid>`, written with
  `replace`. A value that is not an existing choice is ignored and dropped on
  the next write; `spot` is kept as given (lower-cased), so a place with no
  outings shows "Place: this place" and an empty state. While any filter is on
  the header is recounted on the client from the year prefix of `visited_on`
  ("2026, filtered: ..."), and the result line counts every year. Tags come
  from `HistoryOutingOut.tags` (the spot's tags, vocabulary order, unknown ones
  left out). `/admin/spots` rows link to `?spot=` through `historyHrefForSpot`.
  Pattern: `docs/design-system.md` (Filters sheet).
- **Add a place (`/admin/places/add`, story #340).** `pages/PlacesAdd.jsx`,
  with `components/places/` (`PlaceResultRow.jsx`, `PlaceFields.jsx`) and its
  words in `content/placesAdd.js`. It sits in the Denver area beside Weekend
  and Spots (`components/adminAreas.js`; `areaOfPath` and `addPath` in
  `lib/intake.js` know the `places` area). Search runs on submit only, against
  `GET /api/intake/search?area=places`; Add posts to
  `/api/intake/sittings/{id}/places`. Rules that matter when editing:
  - **No sitting is kept between commits.** The server deletes a sitting
    whose entries are all written, so after a successful commit the page
    forgets the sitting and entry ids (`forgetSitting`) and the next Add makes
    a new one. A 404 from the sitting, entry or commit routes drops the ids,
    makes a fresh sitting and retries once (`retryGone`).
  - **A leftover sitting is deleted by the page.** When a commit answers
    `skipped_kept > 0` (entries kept in `check`), and when a 404 drops the
    sitting, `forgetSitting(true)` first sends `DELETE /api/intake/sittings/{id}`
    (best effort), since nothing lists a places sitting. A refusal shows
    `refused[0].message` when the 422 has one.
  - **A failed commit parks its entry back to `check`** (PATCH `state: check`,
    best effort; also when the PATCH to `ready` fails), so a READY leftover is never committed by a later save of
    another place. A typed place keeps its entry across the failure and a
    retry PATCHes it ready again instead of posting a second.
  - **In-flight `useRef` guards** (`inflight`, `sitting`) stop a double press
    from sending two requests; the disabled button alone is not relied on.
  - **The public toggle is off unless the city is Denver**, as the server
    requires (a public place elsewhere is a 422).
  - Read place keys on a search row as optional: shelf rows do not have them.
  - The page matches the chosen mockup, direction C (`c-inline.html`). The
    mockups are out of git; the record of the choice, the rejected directions
    and the screens and states is the Design section of
    `docs/planning/2026-11-17-place-kind-intake-design.md`.
- **The add bar on `/admin/spots` (story #341).** `components/places/SpotsAddBar.jsx`,
  placed by `pages/AdminSpots.jsx` above the table; its words are
  `placesAdd.bar` in `content/placesAdd.js`. It searches by name like
  `/admin/places/add` but saves with ONE call, `POST /api/intake/add`, so it
  keeps no sitting and none of that page's sitting lifecycle. After a save
  the page re-reads `GET /api/spots` (`rereadSpots`, awaited: a failed read
  shows `denver.admin.savedNotRefreshed` with Try again; a read that began
  before a per-row write landed is dropped and run once more, `writeSeq`).
  Two client-only marks: `newId` (the "New" pill, `denver.admin.newMark`) and
  `markedId` (the row tint, `is-marked`). A bar save sets both; "Show in
  table" sets only the tint, so an already-saved row is findable without a
  pill; a bar search (`onSearchStart`) or a by-hand save of a new spot clears
  both. `onShowInTable` clears a filter that hides the row, scrolls to it and
  focuses it, once per request. "Add by hand" opens `SpotForm` with the typed
  words in Name (`initialName`, new spots only) and gives focus back to the
  bar's name box when the form closes; it never replaces a form that is
  already open (it focuses that form). The bar gets the owner's cities from
  the loaded spots. Browser coverage is the
  two "spots add bar" cases in `e2e/admin.spec.js`: they stub only the
  browser's search answer, never Nominatim, and delete what they save.
- **City on `/admin/spots` (story #343).** `lib/cities.js` is the one city
  helper (`HOME_CITY`, `FALLBACK_CITIES`, `cityKey`, `cityLabel`,
  `spotCity`, `citiesFrom`, `cityCounts`); every importer reads it directly
  (`PlaceFields.jsx` no longer re-exports). `cityKey` also drops control and
  zero-width characters, like `normalize_city`. `SpotForm` has a City input with a `datalist` of the cities
  in use (Denver first; the `cities` prop), Denver by default, the saved city
  when editing. Public is disabled with `placesAdd.publicOnlyDenver` off
  Denver; the box keeps the state the owner set (retyping "Denver" does not
  unpublish) and is only forced off on save, when the city is not Denver
  (`is_public: isPublic && isHome`). In the table, the Public checkbox is
  disabled for a private row outside Denver (a legacy public one can still be
  unpublished). Saving a spot the active City filter hides resets the filter to
  All cities. A blank city reads as Denver on
  screen but is refused (`denver.form.cityRequired`) rather than sent. An edit
  sends `city` only when it changed (compared as the server keys it), a create
  always. The table's City filter (`denver.admin.cityFilter`, counts, Denver
  first) shows only while the loaded spots hold more than one city, is page
  state, and "Show in table" clears it with the text filter when either hides
  the row. A muted line under the name (`.spots-city`) names the city for every
  non-Denver row, and for Denver rows too under All cities when there is more
  than one city; never a column. The page mirrors the server: city lower-cased
  and at most 40 characters, a public spot only in Denver.
- **Want and been on `/admin/spots` (story #345).** A spot's state is derived on
  read by `lib/spotState.js` from `visit_count` (`spotState`: `want` for none,
  `been` for one or more, `null` for an anchor; `stateCounts`); no column, no
  route, no backend field. The "Show" select (All places, Want (n), Been (n)) sits
  beside the City filter, shows while the loaded spots hold at least one
  non-anchor (a pick whose places have all gone counts as All places, like the
  City filter), is page state, and a Want or Been pick hides anchors. Its counts
  are taken after the text and City filters, so they equal the rows under any
  combination. Each non-anchor row has a muted line under the name (`.spots-state`:
  "Want", or "Been"; "Been, <date>" only on a phone, where the Last visit column
  is hidden, so a screen reader hears the date once); never a column. Log a visit
  bumps `visit_count`, so a row leaves a Want pick live, by design. One helper,
  `revealRow`, serves every path that puts a row on the page (Show in table, a
  by-hand save, the add bar's save, a finder accept): when the text, City or
  state filter hides the row, all three clear. A finder candidate is not a spot
  and never appears here.
- **Log an outing (story #346).** `components/LogOutingSheet.jsx` (copy in
  `content/outings.js`, search and failure words reused from `placesAdd`) is one
  `Sheet` that picks a place and logs a visit in one `POST /api/spots/outings`.
  Typing in the place box only filters the saved spots (read once on open); the
  OpenStreetMap search runs on submit only, and Enter never saves. A result
  with `owned_spot_id` picks the saved spot (sends `spot_id`); a new one shows
  the private/City card and sends `place`. Verdict is required in the sheet,
  optional in the API; title and kid start empty and `kid_along` is sent only
  when toggled. Open state lives in the page: the `/admin/spots` header button
  rereads spots (`rereadSpots(id)`), the Weekend Visits panel button re-reads the
  plan. The per-row Log visit stays. Save and search run under `withDeadline`
  (`READ_DEADLINE_MS`; `call` takes an optional signal) with an `inflight` guard; a
  server 422 about the date or the title also shows beside that field. Styles are the `lo-*` block at the end of
  `index.css`.
- **The Paste way on `/admin/places/add` (story #342).** `PastePlaces.jsx`
  with `PasteRow.jsx`, `PasteGroup.jsx`, `PasteFixForm.jsx`, `pasteModel.js`
  (pure), the shared `call` in `placeApi.js` and the `paste` group of
  `content/placesAdd.js`; opened by the "Paste a list" button of `PlacesAdd.jsx`.
  Rules that matter when editing:
  - **Lookups run strictly one at a time.** The server allows two searches and
    queues the rest, but Nominatim is held to one a second, so the page keeps
    one resolve in flight (`inflight`) and waits between them; never start a
    second over it.
  - **Sitting lifecycle.** The sitting is kept while any entry is in `check` or
    `reading`; a save that writes everything deletes it on the server, so
    after a clean save the page must not reuse the id.
  - **Resume.** Opening the way reads the newest 5 non-empty `places`
    sittings (`RESUME_LOOK`) and offers the first that holds a pasted entry,
    which the page tells by `payload.source_line` (`isPasted`); the list cannot
    say. "Start a new list" deletes it after an inline confirm.
  - **Leave out** PATCHes the entry back to `check` (so a save never writes
    it); the "left out" mark itself is page state (`leftOut`), so after a
    reload the row is an ordinary row to check.
  - **A 404 from the commit** (another tab saved everything or discarded the
    list): the page drops the sitting id and its entries, says the list is gone
    and offers "Start a new list" (phase `gone`).
  - **Row shapes.** A link the server could not read is a `Link from <host>`
    check row (`kindOf` -> `unreadable`), drawn like the short-link row (Name
    field, Search); short-link, unreadable and too-long rows show the pasted
    link (`payload.source_line`, one line, ellipsis, full text in `title`).
    The ready row's button reads "Edit". Already-saved rows show
    `chosen.address` or `payload.address` when there is one, nothing else. The
    OpenStreetMap credit sits under the form of every state that shows a search
    outcome (pick, none, unusable, failed). A failed row is in To check, and a
    line that got no answer once opens "Not looked up yet"; the summary adds a
    plain notice when a row got no answer. The page's paste cap
    (`MAX_PASTE_CHARS`, 400,000) must match the server's. The review rows and
    buttons carry `scroll-margin-bottom` (tab bar plus Save bar, from
    variables in `index.css`) so Tab never leaves a row behind the bar.
  - Known gaps: closing the way discards unsaved Details edits;
    `SpotsAddBar.jsx` still has its own `call()` copy instead of `placeApi.js`.
  - Browser coverage: the two "paste a list" cases in `e2e/admin.spec.js` use
    the real backend, coordinate links and a short link (never Nominatim).
    They run in the `desktop` project only (the page offers the newest pasted
    list, and both projects share one database; no file lock), and case 1
    resizes the viewport to 400 px inside the test to check there is no sideways
    scroll.
