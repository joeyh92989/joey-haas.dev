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

Run one at a time: it opens one browser and loads about 120 pages in series.

`ONLY='<regex>'` records only the scenarios whose label matches (for example
`ONLY='admin|gate'`). `style-dump` takes a base URL, so two builds can be
served side by side: pick a port of your own (`vite preview --port <n>
--strictPort`), since other worktrees use 4173 and 4180 and up.
