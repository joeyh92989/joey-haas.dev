# e2e/tools

Not specs: nothing here runs in CI.

## style-dump.mjs and style-diff.mjs

Proof that a CSS move changed nothing (#536). `style-dump.mjs` opens the
public pages, the mocked admin pages (Home, Jobs, the shelf, the Closet and
its profile, review and garment pages, the signed-out and denied gates), the
opened search dialog, the account menu, the swap sheets, the phone's page
sheet and the shelf's action sheet in both
themes at desktop and phone width, plus print emulation (About, a post, Home)
and a reduced-motion pass, and writes `getComputedStyle` (about 60 properties,
plus `::before` / `::after` with content) for every element to a JSON file.
`style-diff.mjs` compares two such files and exits 1 on any difference.

```sh
# build a fixture-snapshot build of each side (e2e/fixtures/README.md), then
npm run preview -- --outDir <dist> --port 4180 &
node e2e/tools/style-dump.mjs http://localhost:4180 /tmp/before.json
# ... same for the changed build on another port ...
node e2e/tools/style-diff.mjs /tmp/before.json /tmp/after.json
```

Slice D4 (#536) added the shelf lists, tools and charts: `/shelf/games` and
`/shelf/comics` in cards and spines, searched, filtered, sorted, empty, with
Dim finished and Compact, the overview open, a card hovered and tabbed to;
`/stats` with data, the Daily game empty, mid-game, open list, finished and
the share sheet, `/shelf/next` with Pick for me before and after a choice, a
month and a year page, and the admin Games and Comics lists (mocks from
`admin-shelf.fixtures.js`) hovered, tabbed, dimmed, with a hovered star, and on
touch with the card's sheet open, plus `/admin/play-next`. `ONLY=d4` (a
regular expression on the scenario label) runs just those. A scenario that
fails to set up logs its label and is dumped as it stands, the same on both
sides.

Slice D4b (#536) added the shelf overview, charts and stat tiles (`ONLY=d4b`):
the public and admin Games and Comics overviews (closed, open, a rating or
month bar hovered and focused, a favourite and a Now playing card focused,
reduced motion, empty), an item and a series page, the year page, `/stats` in
both ranges, `/admin/analytics` in both ranges, `/admin/catalogue` and
`/admin/closet/review`. A scenario whose element the page does not draw logs
`absent: <selector>` and is dumped as it stands, the same on both sides.

Run one at a time: it opens one browser and loads about 120 pages in series.

`ONLY='<regex>'` records only the scenarios whose label matches (for example
`ONLY='admin|gate'`). `style-dump` takes a base URL, so two builds can be
served side by side: pick a port of your own (`vite preview --port <n>
--strictPort`), since other worktrees use 4173 and 4180 and up.

Scenario groups: `d5` (slice D5) covers every Closet route with filled data,
the Match, swap and sell sheets, the pack-away month, a garment's form and its
delete confirm, the add bar and its links panel, the admin add flow
(`/admin/collection/add`, a sitting, Check, Details, Done), Discover, Radar,
Pull list, the games page with the add results, the add drawer, the scanner
and the Wrap up sheet, and the public `/shelf/intake` replay, each in both
themes at desktop and phone width (`ONLY=' d5 '`). The Closet scenarios use
`closet-mocks.js`; the add ones `admin-add.fixtures.js`.

Slice D5b (#536) put its scenarios in `scenarios/d5b.mjs` (`ONLY=' d5b? '`;
`style-dump.mjs` has one import and one call line for it) and its sitting
answers in `e2e/admin-intake.fixtures.js`: a comic sitting at Check (a title to
ask about, books with their number marks, a collected book, series that
grow, the skim grid, typed books), Details (with the collected-book rows and
the ISBN field, and the scanner), and Shoot with every photo state; the
Closet's Check for garments, a seed file and pasted links; the item page's
relink picker (results, hover, focus), the games page's full add form, the
add page's kind tiles and the garment form and profile focused. A scenario's
`absent: <selector>` line says an element the group's rules style was not
drawn.

Slice E1 (#536) put its scenarios in `scenarios/e1.mjs` (`ONLY=' e1 '`;
`style-dump.mjs` has one import and one call line for it): the states the base
dump does not reach on the shared chip, result, disclosure and attribution
rules. A chip hovered (unpressed and pressed), on a touch screen as well (the
old `:hover` rule applied there and Tailwind's `hover:` does not), tabbed to;
the Show more pager, the direction chip, Pick for me's chips, the comic wall's
chips (its answers routed from `e2e/fixtures/api`), the Closet's Bike chip, the
Games charts disclosure open, hovered and tabbed to, and a footer link. The
Trip page's chips are on no published page, so they are not in the dump; compare
them with `vite` dev servers on `/travel/croatia-greece-2026` (a draft shows in
dev). A capped list's toggle needs more rows than the fixtures carry and logs
`absent`.

Group G1 (#536) put its scenarios in `scenarios/g1.mjs` (`ONLY=' g1a '`,
`' g1b '`, `' g1c '`; `style-dump.mjs` has one import and one call line for
it). `g1a`: What's next with every part drawn (a pinned lead, an unpinned one
and the Continue card's list, each signed out and as the owner, with a card
skipped to its toast, the capped rows opened, Not on cartridge opened, Pick
for me chosen), Play next (a pinned game, the nudge, the Continue cards, a
button hovered and tabbed to, on touch too), Radar's open Digital section,
Discover's Rate a few rows hovered, tabbed to and rated, the Pull list with an
answered issue and the store list. `g1b`: the Daily game's open list with an
option hovered and arrowed to, the full board, the finished game, the share
sheet's Copy, the journal's month index, the shelf footers' project line.
`g1c`: About, a post, a note, the Colophon and the 404 on paper, About's resume
link hovered and tabbed to. The signed-in answers are routed from the scenario
(`/api/auth/me*`, the pattern must end in `*` or the `?quiet=1` query misses
it); an element the page does not draw logs `absent: <selector>`.

Group G2 (#536) put its scenarios in `scenarios/g2.mjs` (`ONLY=' g2a '`,
`' g2b '`, `' g2c '`; `style-dump.mjs` has one import and one call line for it).
`PROPS` gained 33 properties (`fill`, `stroke`, `stroke-width`, the offsets,
`flex-grow/shrink/basis`, `grid-auto-flow`, `grid-template-rows`, the grid
lines, `overflow-wrap`, `object-fit`, `aspect-ratio`, `writing-mode`, and a few
more): a port to utilities can change those and the older list did not read
them (a `bg-(--redact)` that should have been `[background:var(--redact)]`
showed up as `background-image`). `VIEWPORTS` gained `w320`, `w544`, `w545`,
`w640`, `w641`, `w960`, `w961`: the edges of the Tour's (34rem, 60rem) and
Travel's (640px) breakpoints, which are inclusive. `open()` takes a `mock`
function for answers the scenario routes itself.

- `g2a`: the Tour (`/shelf/how`) with every live box answered, empty, on
  paper, reduced motion, its contents links hovered, tabbed to and pressed, a
  code link and the code block focused, at each edge width; the Colophon and
  Projects at the same widths and on paper.
- `g2b`: Travel (`/travel`, `/travel/croatia-greece-2026`: card, drawn map,
  pins hovered and focused with and without reduced motion, place chips,
  photos, the lightbox open, stepped, focused and at the phone edge). Travel is
  published nowhere, so its pages exist only in `vite` dev: serve the base
  commit and the changed one from two worktrees (`VITE_DAILY_SALT=local npx vite
  --port <n> --strictPort` in each `frontend/`, each with its own `npm ci`) and
  dump each with `ONLY=' g2b '`.
- `g2c`: the comic admin pages, the Book page, the item edit page and the
  collection table (all from `admin-data-mocks.js`), the public single-book
  card and volume page (from `fixtures/api`), the load state and Now.

Group G3 (#536) put its scenarios in `scenarios/g3.mjs` (`ONLY=' g3a '`,
`'g3b'`, `'g3c'`; `style-dump.mjs` has one import and one call line for it, and
the viewports `w700`, `w701`, `w980`, `w981`). `g3a`: the comics family: a long
run as its box (cells, a book, a bundle opened, hovered, tabbed to, the lanes
and key), the same run as a cover wall (tiles hovered and tabbed to, a book, a
stack opened and folded, the Missing filter), the owner's wall (each cover a
button, its number a link), a title with books, a book line, and an issue page
with a neighbour strip of every state. The run, wall and issue answers are built
in the scenario. `g3b`: Home's hero and actions, Projects' links, the shelf's
header and tabs (hover, current, focus, touch), and Home, the shelf,
What's next and the Daily game at the edge widths 320, 544, 545, 700, 701, 980
and 981. `g3c`: the item edit page (journal, playthroughs table, relink, status
control, registry line), the public item page signed in, the store list,
catalogue, Stats and its changelog, and Play next at the edges. The cover strip
and the item tile figures need favourites or ratings the fixture snapshot does
not carry: they log `absent`.

The #598 follow-ups put their scenarios in `scenarios/f598.mjs` (`ONLY=' f598'`;
`style-dump.mjs` has one import and two call lines, the second for the 320px
width). Besides the dump, each scenario prints a measurement on stderr as `M
<theme> <viewport> <label> <json>` (a link's outline, axe on a dimmed card,
a tile's clipped width, the star targets, the page links' height and text gap,
the code font, the date fields' height), the same on both sides, so the lines of
a before and an after build can be diffed. The Travel pages are not in it (no
trip is published): compare those in two dev servers as for `g2b`.

Slice H (#536: `index.css` deleted, Preflight moved into the `base` layer and the
`revert` shim removed). `PROPS` now lives in `props.mjs` (imported by the dump and
the diff; `style-diff.mjs` finds a field by name, so a property is appended, never
inserted). It gained 26 properties: `border-right/bottom/left-style`, the other
three corner radii, `border-spacing`, `list-style-position`, `list-style-image`,
`tab-size`, `-webkit-tap-highlight-color`, `font-feature-settings`,
`font-variation-settings`, `font-variant-caps`, `font-stretch`,
`text-decoration-style`, `text-decoration-thickness`, `min-height`, `max-height`,
`caret-color`, `color-scheme`, `accent-color`, `table-layout`, `text-size-adjust`,
`margin-inline-end`, `scroll-padding-bottom`. It also reads `::marker` on every
`display: list-item` element, `::file-selector-button` on file inputs and
`::backdrop` on a modal dialog, besides `::before`, `::after` and the placeholder.
What it cannot read: the date field's inner parts (`::-webkit-datetime-edit` and
the rest return the input's own values to `getComputedStyle`, so a change in them
shows only as the field's height: Preflight's removed the browser's 1px of padding,
which `WRAP_DATE` and `PACK_INPUT` now make up) and `:-moz-focusring` (Firefox).
`META=1` writes `<out>.meta.json` beside the dump: tag, input type, class and first
words of every element, keyed like the dump, to say which element a path in a diff is
(`style-diff.mjs` takes it as a third argument).

**Explained differences.** `style-diff.mjs` treats these as equal, because Preflight
changes the value and nothing is drawn differently; each is a line in `normalise()`:
a border with no width (style and colour); an outline with style `none`; `tab-size`
and `-webkit-tap-highlight-color` (Preflight's `html` values, kept on purpose: 4
instead of 8, and no grey flash on a tap); `appearance: button` against `auto` on a
button; `vertical-align` on anything that is not inline-level or a table cell;
`max-width: 100%` against `none` (the drawn width is its own field); `html`'s
`font-family` and `line-height` (body sets both); `box-sizing` on `::before` and
`::after` (a generated box whose size depends on it moves its own offsets or its
neighbours' widths, which are compared); a checkbox's, radio's, range's or colour field's text
properties and colours (it draws none; needs the `META=1` sidecar); a button, or
a comic cover tile's button and frame, with no text of its own (the map pin; the
label inside the tile sets its own font); a date, month or time field's top and
bottom padding (made up 1px, so its height is equal); a modal dialog's z-index
(the shelf action sheet's dead `z-40` is deleted, and the top layer ignores it);
and the size of an absolutely positioned generated box whose offsets are all 0
(it fills its parent either way).

Two things on the mocked admin pages and the quick-rate stars are not the build:
the `/admin` header's "last run" widths and `/admin/jobs` row order depend on
when the dump ran, and a star under the pointer after a click depends on timing.
A dump of main and one of a branch taken half an hour apart differ there; the
same pages dumped one after the other from both builds, three times, do not
(main against main also does, once, on the stars).
