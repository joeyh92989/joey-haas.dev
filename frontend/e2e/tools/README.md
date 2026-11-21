# e2e/tools

Not specs: nothing here runs in CI.

## style-dump.mjs and style-diff.mjs

Proof that a CSS move changed nothing (#536). `style-dump.mjs` opens the
public pages, four mocked admin pages and the opened search dialog in both
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

Run one at a time: it opens one browser and loads about 120 pages in series.
