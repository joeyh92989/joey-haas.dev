# E2E fixtures

Synthetic data so CI can build and browser-test one page of every dynamic
shelf route without a backend. Everything here is invented: titles, ids,
notes. Nothing comes from the real collection.

## snapshot/

A stand-in for `public/snapshot/`, which `scripts/fetch-snapshot.mjs` writes
on Render. The e2e job in `.github/workflows/ci.yml` copies these files to
`frontend/public/snapshot/` before `npm run build`. `fetch-snapshot.mjs` does
nothing without an API URL and leaves that folder alone, so the build
prerenders an item, a year, a month, an issue and an edition page, which
`e2e/dynamic.spec.js` then samples from `dist/sitemap.xml`.

To try it locally, copy the files in, build, then delete them again (the
folder is gitignored):

```sh
mkdir -p public/snapshot && cp e2e/fixtures/snapshot/*.json public/snapshot/
VITE_DAILY_SALT=ci npm run build && npm run e2e
```

- `items.json` has 32 items: one finished game (gives the year and month
  pages), one comic series, and 30 filler games. The prerender refuses a
  build when fewer than 30 games are eligible for the daily puzzle
  (`MIN_POOL` in `src/lib/daily.js`).
- `stats.json` carries the full shape `Games.jsx` reads, not just the
  fields the shape check requires.
- `comic-issues.json` feeds the issue and edition pages' heads.
- Shapes mirror `SNAPSHOTS` in `scripts/fetch-snapshot.mjs`.
  `scripts/fixture-snapshot.test.mjs` runs them through its validators, so
  drift fails `npm test`.

## api/

Responses for the two live endpoints the issue and edition pages call,
`/api/public/items/<id>/issues/<n>` and `.../editions/<slug>`. The spec
fulfils them with `page.route`. They mirror the shapes `ComicIssue.jsx` and
`ComicEdition.jsx` read, and must change with those endpoints. Their
series, issue and edition match `snapshot/comic-issues.json`.
