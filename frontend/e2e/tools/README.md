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
