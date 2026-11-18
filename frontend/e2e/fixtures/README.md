# E2E fixtures

Synthetic data so CI can build and browser-test one page of every dynamic
shelf route without a backend. Everything here is invented: titles, ids,
notes. Nothing comes from the real collection.

## snapshot/

A stand-in for `public/snapshot/`, which `scripts/fetch-snapshot.mjs` writes
on Render. The e2e job in `.github/workflows/ci.yml` copies these files to
`frontend/public/snapshot/` before `npm run build`. `fetch-snapshot.mjs` does
nothing without an API URL and leaves that folder alone, so the build
prerenders an item, a year, a month, an issue and a volume page, which
`e2e/dynamic.spec.js` then samples from `dist/sitemap.xml`.

To try it locally, copy the files in, build, then delete them again (the
folder is gitignored):

```sh
mkdir -p public/snapshot && cp e2e/fixtures/snapshot/*.json public/snapshot/
VITE_DAILY_SALT=ci npm run build && npm run e2e
```

- `items.json` has 35 items, each with a few `tags` (the Games page's tag
  chips read them): one finished game (gives the year and month
  pages), four comic titles (a run, a line of books, a single book and a title
  of both: `Paper Moons`, `Lantern Tales`, `Salt Road`, `Harbor Lights`), and 30
  filler games. The prerender refuses a
  build when fewer than 30 games are eligible for the daily puzzle
  (`MIN_POOL` in `src/lib/daily.js`).
- `stats.json` carries the full shape `Games.jsx` reads, not just the
  fields the shape check requires.
- `comics.json` is the comics shelf's body (`GET /api/public/comics`), with one
  title of each kind and each row's `kind`, `volumes_owned` and
  `volume_numbers`; `backend/scripts/export_public_comic_fixtures.py` writes it
  from the real `PublicComicRow` code, so `/shelf/comics` paints cards and
  chips in the browser checks.
- `comic-issues.json` (rows carry `kind`, which the link-preview text reads) feeds the issue and volume pages' heads; its
  `volumes` mirror `PublicComicIndexVolume` (the old `ed-1-1` edition is also
  the volume `ed-1-1`).
- Shapes mirror `SNAPSHOTS` in `scripts/fetch-snapshot.mjs`.
  `scripts/fixture-snapshot.test.mjs` runs them through its validators, so
  drift fails `npm test`.

## api/

Responses for the two live endpoints the issue and volume pages call,
`/api/public/items/<id>/issues/<n>` and `.../volumes/<slug>`. The spec
fulfils them with `page.route`. They mirror the shapes `ComicIssue.jsx` and
`ComicVolume.jsx` read, and must change with those endpoints. `volume.json`
was written from the backend's own `PublicVolumePage` model
(`model_dump_json`), so its keys cannot drift from the real body; regenerate
it the same way when the model changes. Their series, issue and volume match
`snapshot/comic-issues.json` (`ed-1-1` is the old edition URL, kept as a
volume slug).

### Admin volume bodies

`admin-volume.json` (`GET /api/comics/volumes/{id}`), `admin-volumes.json`
(`GET /api/comics/{id}/volumes`), `admin-volume-delete-preview.json`,
`admin-volume-state.json` (the owned/read `PATCH`), `admin-volume-move.json`
and `admin-volume-link.json` are not served by `page.route`: the component
tests (`AdminComicVolume.test.jsx`, `BooksPanel.test.jsx`) import them.
`backend/scripts/export_admin_volume_fixtures.py` writes them by validating
invented data through the real response models in `comics_schemas.py`, so a
key the API does not send cannot be hand-written here. Rerun it when one of
those models changes, then `npx prettier --write e2e/fixtures/api`.
`e2e/admin.spec.js` covers the same page against a real backend.

### Public title bodies

`public-comic-run.json`, `-book_line.json`, `-single_book.json` and `-both.json`
(`GET /api/public/items/<id>`) and `public-comic-wall-both.json` (`.../issues`)
are one fixture title of each kind. `e2e/dynamic.spec.js` serves them with
`page.route` for the title pages (so the Books and Issues sections, axe and the
no-console-errors check run on each kind), and `Item.test.jsx` and
`BookWall.test.jsx` import them. `backend/scripts/export_public_comic_fixtures.py`
writes them by validating invented data through `PublicItemDetailOut` and
`PublicWall`; rerun it when `PublicComicDetail` changes, then
`npx prettier --write e2e/fixtures/api`. The ids match `snapshot/items.json`
and `snapshot/comic-issues.json`.
