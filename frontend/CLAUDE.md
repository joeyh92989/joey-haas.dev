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
- Tracker pages break out of the 45rem prose column via `page-wide` (75rem, 1200px),
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
  The shell's controls (rail and tab-bar area links, page links, segments, the
  account trigger and its rows, the sign-in link) are the Button look from
  `components/adminShellClasses.js`, built on `ui/button-variants.js`: that
  file carries the focus ring and marks the current area or page through
  `aria-current` (a foreground border and a card fill, never color alone).
  Eager shell files import only the variants, not Base UI or `cn` (#535). The
  shell keeps its native `<dialog>` sheet and the account disclosure as plain
  markup, and does not adopt shadcn's Sidebar or a Data Table: both would
  change behaviour (focus targets, `aria-current`, the disclosure's Escape and
  Tab-out rules) that the tests pin, for no change a visitor sees.
  The Closet pages (#535, slice 2) take the same looks from
  `components/closetClasses.js` (`btn()`, `chipBtn`, `closetCard`, `field`,
  `textarea`, the ring and pressed marks) and a text field's look from
  `ui/field-classes.js`, which `ui/input.jsx` shares. They carry the phone's 44px
  targets (#276) as `max-[700px]:min-h-11` themselves, since the legacy `.chip`
  and `.btn.sm` media rule no longer reaches them, and a label over a hidden file
  input takes `FILE_PICK` for its ring (the legacy `.btn-file:focus-within` sits
  in a lower layer than the button look's `outline-none`).
  Admin Home, Jobs and the page header (#535, slice 5) take theirs from
  `components/adminHomeClasses.js` (`PRIMARY`, `PLAIN`, `LINK`, `LINK_BUTTON`,
  the panel, area card, job row and Jobs table strings, and the swap sheet's):
  44px phone targets, a disabled button in the page colours with a dashed
  outline (`CALM`, never the look's 55% opacity), and a stacked Jobs table on a
  phone. `SwapSheet` is shared with Closet Today.
  The Shelf add and recommend pages (#535, slice c: Add, sittings, Discover,
  Radar, Pull list) take theirs from `components/addClasses.js` (`ibtn()` for
  intake rows, 44px up to 900px; `bigBtn()`, `BIG_PRESSED`, `headBtn()`,
  `TILE`, `BOX`, `INTAKE_FIELD`, `NUM_FIELD`): a destructive confirm is
  `ibtn('danger')` everywhere, and the legacy `.btn` and `.chip` are gone from
  these pages. `adminShelfClasses.js` holds the admin shelf twins' strings.
  The Denver and Site pages (#535, slice 3: Weekend, Spots, Analytics) take them
  from `components/denverSiteClasses.js` (`btn()`, `chipBtn`, `tagBtn`, `pill`,
  `field`, `checkbox`, and `box`, which is `closetCard`), with the same 44px
  targets, and a titled card from `components/SectionCard.jsx` (Card look, `mt-0`
  against the global `section + section` gap, no `overflow`). Utilities sit above
  `index.css`, so a width, border colour or margin the legacy sheet used to set
  on those controls is said on the element (`w-24!`, `border-(color:--ok)!`).
  The Spots table folds Last visit under the name below 1440px and the tags and
  actions under it on a phone, so no action is ever half-scrolled out of its
  wrapper; `e2e/denver-site-ring.js` presses real Tab to prove it.
  Home, About and Projects take the 75rem `page-content` measure through
  `CONTENT_ROUTES` (exact paths, a trailing slash ignored); every other page keeps the 45rem
  column unless it is in `WIDE_ROUTES` (75rem).
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

## Design system setup (#526)

Tailwind v4 and shadcn/ui (Base UI flavour, JavaScript) run beside the
hand-written `src/index.css`. `main.jsx` imports `src/tailwind.css`, which pulls
everything in. No page should change until it is migrated (epic #519).
`src/tailwindSetup.test.js` guards the points below. Verified against `main` by
comparing computed styles of 8 routes in both themes: the only difference is
`background-position` on elements with no background image.

**Layers.** `@layer legacy, theme, base, components, utilities;` and
`@import './index.css' layer(legacy);`. Unlayered CSS always beats layered CSS,
and `index.css` has an unlayered `* { padding: 0 }`; unlayered it would beat
every Tailwind utility (cards and buttons lost their padding in the spike).
Layered into `legacy`, the lowest layer, every utility wins and old pages still
render from their own rules. Delete the layer when the last page moves.

**Preflight is off.** `tailwindcss/theme.css` and `utilities.css` are
imported into layers; `tw-animate-css` and `shadcn/tailwind.css` are imported
*unlayered* (they add `@property` blocks and one `.shimmer` reduced-motion rule
that nothing uses, and a `properties` layer below `legacy`). Preflight is a
reset; it would shift every unmigrated page. A comment in `tailwind.css`
carries the plain `@import "tailwindcss";` text only because the shadcn CLI
refuses to run without it.

**A legacy token with a Tailwind theme name gets replaced.** Tailwind writes
its default theme variable into the `theme` layer, above `legacy`, the moment
any CSS uses it. `--font-sans`, `--font-mono` and `--radius` collide with
`index.css` `:root`: unfixed, every page lost Inter and JetBrains Mono. They
are redeclared in the `@theme` block in `tailwind.css` with the site's values
(keep the two in step). `tailwindSetup.test.js` fails on any new collision.

**Also true while legacy exists.** (a) Tailwind scans the source and emits
utilities for ordinary words (`.hidden`, `.block`, `.grid`, `.table`,
`.container`, `.border`, `.transition`), which sit above `legacy`: do not give
a legacy class one of those names. (b) Layers reverse `!important`: legacy
`!important` declarations beat `!`-utilities. (c) Browser floor: Tailwind v4's
(Safari 16.4, Chrome 111, Firefox 128); `@layer` is required, and the
`min-height:100vh` fallback before `100dvh` is no longer emitted. Accepted.
`shadcn` and `tw-animate-css` are dev dependencies (build-time CSS only), so
the CLI's tree stays out of the production audit gate.

**Four findings from the spike (#520)**

1. Layer the old stylesheet (above).
2. Strip the generated base. The preset writes `@layer base { * {
   border-color } body { background } html { font } }`, which restyles every
   old page; it is not in `tailwind.css`. Its tokens are not copied in
   either: the shadcn semantic tokens are declared once on `:root` in
   `tailwind.css` as aliases of the site's (see "Tokens and theme"), and
   shadcn's `--accent` is held in `--sh-accent`. There is no scope class.
   Re-check `git diff src/tailwind.css` after every `shadcn add` or `init`.
3. Links as buttons. A Base UI `Button` rendered as a link
   (`render={<Link />}`) needs `nativeButton={false}`, or it logs a warning.
   Old `a { color }` needs a one-line `inherit` in the base layer while legacy
   styles exist. Applies when #528 builds the button.
4. Lint. Generated files import an unused `React`. `eslint.config.js` has an
   override for `src/components/ui/**` that ignores `React` in `no-unused-vars`
   only; the rest of the folder is still linted. Run `npm run format` on a
   generated file (it is not written in the repo's Prettier style).

**Add a component.** `cd frontend && npx shadcn add <name>`, then `npm run
format`, `npm run lint`, and check `git diff src/tailwind.css` is empty. Aliases
are in `components.json` (`@/components/ui`, `@/lib/utils`). `@` maps to `src/`
in `vite.config.js` and `jsconfig.json`.

**The components are ours (#528).** `src/components/ui/` (Button, Badge, Input,
Tabs, Separator, Card) was generated, then restyled in place for the Archive
look: flat, 1px outlines, radius 4 to 6px, no shadow, no opacity on text (a disabled control is exempt: Button, Input and
Tabs use `disabled:opacity-55`), a
`chip` button variant for `FilterChips`. Running `shadcn add` again on one of
them overwrites the look. `RecordCard`, `CatalogueNumber` and `StatusMark` sit
on top in `src/components/` and are eager-safe (they join classes with `cx`, below; `RecordCard` takes Card's shell from `ui/card-classes.js`, shared with `ui/card.jsx`); the rules for using them are in
`docs/design-system.md` → One of each. Tailwind utilities beat the legacy
layer, so a rebuilt component keeps its legacy class names (tests and other
CSS read them) and sets only the properties it means to change: leave
`min-height` to the legacy phone rules. A component sets its own `display`
(`Button` is `inline-flex`), so a legacy `display` rule on that element loses.

**The shell (#529).** The masthead, More, the phone sheet and Search use the
shadcn button's look but not its component: they import `buttonVariants` (and
`mastButton`, the bar's size) from `components/ui/button-variants.js`, cva
only, and put the classes on a plain `<button>` or `<a>`, because the Base UI
`Button` and `cn` add 34.6KB raw to the entry chunk, which loads on every page
(`designConsistency.test.js` holds the eager shell files to it). `ui/badge-variants.js` is the same split for the badge (#531): eager pages draw tags, chips and the draft mark with `badgeVariants` (`TagList`, `DraftBadge`), never `Badge`. `shadcn add badge` regenerates `badge.jsx` with its own copy of the cva: re-point it at `badge-variants.js` afterwards, or the two looks drift. The guard bans any `components/ui/*` import from an eager file except the `*-variants.js` and `*-classes.js` ones. `Button` keeps
`variant="quiet"` (the masthead control) and `nav` (a nav trigger); `nav` and
`link` take `size="bare"` (no height or padding of their own), which `Button`
picks by itself. Tailwind sorts same-property utilities by name, not by
order in the class string, so a variant's class never overrides a size's: put
a value on one side only (this is why `border-transparent` sits on `ghost` and
`link`, not on the base). Search is `React.lazy` in `RootLayout`: fetched on
idle and on pointer or focus of the Search button, mounted on first open, and a
failed fetch is caught by `SearchBoundary`, which renders nothing, resets the
lazy import and lets the next open fetch again. It takes `Button` and `Input`
(16px, `md:text-base`). A legacy `display` rule loses to a component's own, so
Menu hides at 961px and up with `min-[961px]:hidden`, and Resume under 1101px
with `max-[1100px]:hidden`, not `.mast-menu` CSS; the 44px phone target is
`max-[700px]:min-h-11`, and on a phone the theme toggle reads Light or Dark
(its `aria-label` stays whole) so the bar fits 320px with equal gutters.

Search stays on the native dialog and its own combobox and listbox; the story's
"search uses shadcn `Command`" is deliberately not met. The native `<dialog>`
(`Sheet`) already gives the focus trap, the inert page, Escape and focus
return, and the hand-built combobox/listbox keeps the roles, ids and
`aria-activedescendant` flow the tests and the a11y run pin; cmdk would add
a dependency without improving any of them. For the same reason the nav sheets
stay native and More stays a disclosure (no `Dialog` or `DropdownMenu`). The
link-preview card (`scripts/og-card.mjs`), the favicon and the opaque
`apple-touch-icon.png` are the light tokens; `og-card.test.mjs` reads them from
`index.css`.

**`cn`.** The class-name helper is shadcn's own `cn` package
(github.com/shadcn-ui/cn, maintainer shadcn, a clsx + tailwind-merge drop-in,
pinned in `package.json`). shadcn 4.x generates `import { cn } from "cn"`, so
the repo depends on it directly; `src/lib/utils.js` re-exports it for
hand-written code. One source of `cn`: do not add `clsx` or `tailwind-merge`.

**`cx`, for eager code (#530).** `cn` is tailwind-merge: about 30KB raw in the
entry chunk if any eager file imports it. Eager files (the shell, `Home`, the
pages `App.jsx` imports directly, `RecordCard`, `CatalogueNumber`,
`StatusMark`) join classes with `cx` from `lib/cx.js`, a plain join that merges
nothing, so a component using it must not need one class to beat another: put
each property on one side only (this is why `ui/card-classes.js` splits Card's
shell from its spacing, and why `button-variants.js` has no base background).
Lazy `components/ui` code keeps `cn`. `designConsistency.test.js` forbids `cn`,
`ui/button`, `ui/card` and Base UI imports in the eager files, and
`scripts/check-entry-chunk.mjs` (a CI step after the build) fails if the built
entry chunk contains the tailwind-merge tables.

## Tokens and theme (#527)

The look is "Archive catalogue" (`docs/planning/2026-11-20-design-system-spike-design.md`):
warm paper in light, graphite in dark, one accent, serif headings. The legacy
tokens in `index.css` were repointed, not renamed, so every old page changed at
once (`--bg` is the page, `--surface` the card, `--text` ink).

| Token | Light | Dark |
|---|---|---|
| `--bg` page / `--surface` card | `#f1ede6` / `#fcfbf9` | `#4e4e4d` / `#5a5a59` |
| `--text` ink / `--text-2`, `--text-3` muted | `#231f1a` / `#57534d` | `#f5f4f1` / `#dad9d5` |
| `--line`, `--line-strong` (outlines, page rules) | `#8c8579` | `#a6a5a2` |
| `--line-card` (rules inside cards) | `#8c8579` | `#b0afac` |
| `--accent` / `--accent-ink` | `#a8321f` / `#ffffff` | `#f7a391` / `#2b2b2a` |
| `--highlight` / `--highlight-ink` | `#f3dc6b` / `#231f1a` | `#ffd84a` / `#2b2b2a` |

- **Accent as text.** `--accent` is a fill, edge or underline colour (a 3:1
  mark). Anything set as text uses `--accent-text`; coloured text for status
  uses `--ok-text` and `--warn-text` (the badge colour). Dark `--accent` is
  3.49 on the card, so the text tokens are lighter there. Fills, borders and
  outlines keep the plain tokens. A new `color: var(--accent)` is wrong.
- **`--line` vs `--line-card`.** `--line` outlines and page rules; `--line-card`
  is for rules inside cards. `--line-card` is defined but unused until the card
  components land (#528). `--line` is a mid grey now: never put text on it, and
  meter tracks are `--sunken`.
- **Three places.** The palette is written in `:root` (dark), `[data-theme='light']`
  and the `@media print` copy near the end of `index.css` (print is light). Change
  all three; `src/contrast.test.js` asserts that print equals light for every
  token both declare, and checks every text, mark and line pair in both themes
  at WCAG 4.5 (text) and 3 (marks). Data colours were moved in lightness only.
  `--hatch-stripe` is the comic "upcoming" stripe, separate from `--run-missing`.
- **Headings** (h1 to h3, `--font-display`) are Source Serif 4 at 500, the only
  weight installed; a serif at 600 or 700 would be synthesised.
  `typeScale.test.js` fails any weight above 500 on a heading selector or beside
  `--font-display`. Body is Inter, labels JetBrains Mono.
- **No opacity on text.** Fading text with `opacity` blends it under 4.5:1
  (`.chip-count`, `.pick-hint`, `.shelfle-hint` did). Disabled controls are exempt.
- **shadcn.** `tailwind.css` aliases `--background`, `--primary` and the rest to
  these tokens, and `@theme inline` exposes them (`--color-accent-text` gives
  `text-accent-text`). shadcn's `--accent` is `--sh-accent` (`--color-accent`);
  its `--chart-1..5` are not declared because `--chart-2` is a legacy token.
