# Build scripts

Four Node scripts run around `vite build` (`npm run build`):

```
fetch-snapshot.mjs  →  build-search-index.mjs  →  vite build  →  prerender.mjs  →  generate-rss.mjs
```

## fetch-snapshot.mjs

**What and why.** It writes the public API's response bodies to
`public/snapshot/items.json`, `stats.json`, `next.json`, `status.json`,
`comics.json` and `site-stats.json`, which Vite then copies into `dist/`. (`picks.json` and `radar.json` are retired with their
routes.) The API is on Render's free tier and sleeps after about 15 idle
minutes. Without the snapshot, `/shelf` would open with a thirty-second
"Waking the server" notice. With it, the page paints straight away and then
refreshes from the API. Home and Projects read the same file for their cover
strips, so they still make no API calls.

**When it runs.**

- Only when `VITE_API_URL` is set, which is the Render static site. CI and
  local builds skip it, so they stay offline and deterministic.
- It never fails the build. Each data request is retried once. If the API
  doesn't wake within 120 s, or returns
  something unexpected, the build ships without a snapshot, and the site
  behaves as it did before the snapshot existed.
- Required snapshots (`items`, `stats`) are written together or not at all.
- `next`, `status`, `comics`, `site-stats`, `pick-for-me`, `spots` and
  `comic-issues` are optional; if one fails, the build leaves that file out.
  `comic-issues.json` (`/api/public/comic-issues`) is read only by the
  prerender, for the heads of the comic issue and edition pages; without it
  those pages keep the site card. The nightly does not compare it.
- Beside them it writes `meta.json`, `{"fetched_at": "<ISO time>"}`, which
  the admin Dashboard reads for the snapshot row of its jobs panel. It is
  not an API body, so the nightly compare does not read it, and it is
  cleared with the others when a run fails.
- When it runs, it first deletes the snapshot files an earlier run left in
  `public/snapshot/` (temp files too), and does so again on every failure, so
  a failed run ships no snapshot rather than a stale one.

**Usage.**

```bash
npm run snapshot   # fetch from production into public/snapshot/ for local dev
VITE_DAILY_SALT=local npm run build   # on Render: snapshot, vite build, prerender, then the RSS feed
```

**Refreshing.** Every deploy refreshes the snapshot. Between deploys,
`.github/workflows/nightly.yml` runs nightly at 00:17 UTC: it refreshes the
picks, the catalogue and the suggestions first, then compares the live API
bodies with the deployed files and triggers a static-site deploy through a
Render deploy hook only when they differ. A failure on `items` or `stats`
fails the compare; `next` and `comics` are skipped with a warning
when the API cannot serve them (a 404 until it has deployed); `status` and
`site-stats` are not compared at all, since `next` differs every night and
the redeploy that follows refreshes them. See the root
README → Collection snapshot and Nightly job.

**Gotchas.**

- `public/snapshot/` is gitignored and must never be committed.
- Files fetched by `npm run snapshot` stay in `public/snapshot/` and are copied
  into later local builds until you delete them. An offline build (no
  `VITE_API_URL`) leaves them alone; a build that does fetch replaces or
  removes them.
- The files are the API's response text, byte for byte (number literals such
  as `86.0` included), so the snapshot workflow can compare them with the live
  API. Change what the API publishes and you change what the snapshot
  publishes, so `test_public.py` covers both.

## snapshot-presence.mjs

Not a step of its own: `vite.config.js` calls `snapshotPresence(dir)` when
Vite starts, after `fetch-snapshot.mjs` has written `public/snapshot/`, and
defines the answer as `__SNAPSHOT_PRESENCE__` for
`src/lib/snapshotPresence.js` (#125). It reads `comics.json` and
`spots.json` and answers, per key, `true` (a series or a spot to show),
`false` (written and empty) or `null` (missing or unreadable). Only `false`
hides a link: the Comics tab (`SpineTabs`) and the Denver footer link
(`SiteFooter`'s `hasSpots`). A first comic or spot reaches the links at the
next build, which the nightly job triggers when either snapshot changes.
Tests: `snapshot-presence.test.mjs`.

## build-search-index.mjs

**What and why.** It writes `public/search-index.json`, the site search's
index of posts, public shelf items and comic series, which Vite copies into
`dist/`. Search runs entirely in the browser, so it works while the API
sleeps. The static pages (`STATIC_PAGES` in `src/content/pages.js`) are
bundled into the app instead, so the dialog always has them; only `/blog`,
which exists only when a post is published, is written here.

**What goes in.** Each entry is `{g, t, s, title, sub, href, cover?}`: the
group, the normalized title and secondary text (`src/lib/normalize.js`, the
same function the dialog applies to the query), and what the row shows.
Posts carry their summary, tags and the optional `keywords:` frontmatter
list (terms a post is about without saying them in its title). Drafts are
skipped. Items come from `public/snapshot/items.json`; comic series from
`comics.json`, or from the comic items when that file is absent, never both.
Covers are kept only when they are https. Without a snapshot the index holds
pages and posts only, and the build carries on.

**Budget.** The script fails when the index is over 100 KB gzipped
(`BUDGET_BYTES`), because the dialog fetches it whole on first open. It
writes to a temporary file and renames it, so a failed run never leaves a
half-written index.

**Never committed.** Like the snapshot, it holds the public rows of the day
and is gitignored.

**Run it alone:** `node scripts/build-search-index.mjs` (after
`fetch-snapshot.mjs` for shelf rows). Tests: `build-search-index.test.mjs`.

## prerender.mjs

**What and why.** Crawlers and link previewers (Slack, iMessage, LinkedIn)
mostly do not run JavaScript, so before this every URL previewed as "Joey
Haas" with the site card. After `vite build`, it writes a copy of
`dist/index.html` for every public route, each with its own `<title>`,
description, canonical URL and Open Graph tags, plus `sitemap.xml` and
`robots.txt`. Only the head changes: the body is the same SPA shell, and the
app renders the page as before.

**Routes.** The static pages (`/`, `/about`, `/projects`, `/shelf`,
`/shelf/next`, `/now`, `/colophon`, `/stats`, `/daily`, `/blog` while a post is published, and
`/til` while a note is), every published post and note,
every item in `dist/snapshot/items.json`, and a Year in review page
for each year with a finish (`/shelf/year/<year>`). An item's preview image is its
cover; a post's description is its first paragraph. Copy comes from
`src/content/`, so a wording change there reaches the previews.

**Shelfle's pool floor.** When the build has a snapshot, `assertDailyPool`
counts the games `/daily` can pick from (`dailyPool` in `src/lib/daily.js`)
and stops the build under `MIN_POOL` (30), logging the count otherwise. A
build without a snapshot skips the check, since `/daily` then shows its
empty state.

**The shelf's feed.** It also writes `dist/shelf/feed.xml`, the twenty most
recent finishes in the snapshot (`spineFeed`), announced in the heads of
`/shelf` and `/now`, and the same bytes at `dist/spine/feed.xml`, the URL
subscribers had before the rename. Item GUIDs stay on the `/spine/<id>/`
form (`LEGACY_PREFIX`), so a reader does not see every entry again. A build
without a snapshot writes an empty channel.

**Pre-rename heads.** `legacyRoutes` copies the shelf, What's next, How it
works and every item page to its old `/spine` path, with the canonical URL
and `og:url` left on `/shelf`. A link shared before the rename still
previews as its page, and the app then redirects to `/shelf`. They are not
in the sitemap. `render.yaml` keeps rewrites for `/spine`, `/spine/next` and
`/spine/how`, and the exact-match test counts them.

**The `render.yaml` rewrites.** Render serves an existing file before any
rule, but it serves `shelf/next/index.html` only at `/shelf/next/`. At
`/shelf/next` the `/* → /index.html` catch-all wins and the page previews as
the site card (found in production on 2026-10-19, after #55). So
`render.yaml` rewrites each prerendered path to its own `index.html` ahead of
the catch-all, and `prerender-lib.test.mjs` fails unless the rules name
exactly the static pages, the published posts and the published notes. There are no placeholders:
a rewrite to a file the build did not write serves an **empty 200**, not the
SPA (a `/blog/:slug` rule did this to `/blog/example`, a draft, on
2026-10-19). So publishing or unpublishing a post or note means adding or removing
its rule. Item, year and month pages (`/shelf/:id`, `/shelf/year/:year`,
`/shelf/journal/:month`) change between deploys and stay on the catch-all;
their prerendered heads are served only at the trailing-slash URL. So those
routes carry `slash: true`, and `routeUrl` gives them the slash form in the
canonical, `og:url` and sitemap, as `src/lib/spinePaths.js` does for every
in-app link and the feed. A redirect from the bare form would loop on Render
for any path without a file, so the bare form stays the SPA. Asset URLs are
root-absolute (`/assets/…`), so they resolve from any depth.

**Privacy.** Items come only from the snapshot, which holds what
`/api/public/items` serves: public items. A build without a snapshot (CI,
local) prerenders no item pages. Each admin page in `ADMIN_ROUTES` gets a
`noindex` copy, and `robots.txt` disallows `/admin`; an admin item page
(`/admin/collection/<id>`) falls back to the home file, which robots.txt
already keeps crawlers away from. Keep `ADMIN_ROUTES` in step with `App.jsx`.

**Gotchas.**

- `dist/index.html` is both the home page and the SPA fallback for every
  other path, so it keeps no canonical or `og:url`: an unknown path must not
  claim to be the home page.
- The pure parts (routes, head, excerpt, sitemap) live in
  `prerender-lib.mjs` and are tested in `prerender-lib.test.mjs`.

## generate-rss.mjs

It writes two feeds: `dist/feed.xml` from `frontend/posts/` and
`dist/til/feed.xml` from `frontend/notes/`, skipping drafts. Both are written
by `writeFeed` in `markdown-lib.mjs`, so the two cannot drift apart in
escaping or excerpting, and a missing `notes/` writes an empty channel.
Each item carries the entry's first paragraph as plain text (`excerpt` in
`prerender-lib.mjs`, the same one the prerendered description uses). It never
renders HTML, so it can't disagree with the site about how a post renders.
It runs after `vite build`, because it writes into `dist/`.

## markdown-lib.mjs

`readPublished(dir)` is the one reader of the markdown folders for the build
scripts: published entries (`draft: true` skipped, as the plugin's production
build does), newest first. `prerender.mjs` and `generate-rss.mjs` both use it,
so they agree on what is published. `rssFeed` and `writeFeed` build the feeds.
Tested in `markdown-lib.test.mjs`.

## Travel scripts (run by hand)

Unlike the four above, nothing here runs in `npm run build`. The travel
photos are built on the owner's machine and the WebPs committed, because
the originals carry GPS and must never enter git (design D4). The order for
a new trip is ingest → write → build:

```
ingest-photos.mjs  →  (write the draft)  →  build-travel-images.mjs  →  commit
```

`docs/travel-onboarding.md` is the working plan around these: what to
collect, from whom, and which trips are still to recover.

### trip-markdown.mjs

The trip grammar, pure: frontmatter (`parseTripFrontmatter`), day headings,
photo lines and prose (`parseTripDays`), the date of each day (`dayDates`,
null below `precision: day`), the photo names a trip shows
(`referencedPhotoNames`), and the guard that refuses a `TODO` in a trip that
is not a draft (`assertNoPlaceholders`). The Vite plugin, the image build
and the ingest tool all parse through it, so they cannot disagree on what a
trip is. Tested in `trip-markdown.test.mjs`.

### build-travel-images.mjs

```
node scripts/build-travel-images.mjs <slug>
```

Reads `trips/<slug>/photos/photos.json` and `trips/<slug>.md`, and writes
`public/travel/<slug>/<name>-800.webp` and `-1600.webp` for **only the
photos the trip file shows** (the cover included); the rest of the manifest
stays unbuilt and is reported as "not in the trip file". It bakes EXIF
orientation into the pixels (`.rotate()`) and strips every scrap of
metadata, GPS above all, then writes each built photo's dimensions back into
the manifest so the page reserves their space. A `kid: true` photo is
refused unless it also carries `publish: true`. A trip file that does not
parse fails this script too. Tested in `build-travel-images.test.mjs`.

### ingest-photos.mjs

```
node scripts/ingest-photos.mjs --from <folder>                    # dry run: report only
node scripts/ingest-photos.mjs --from <folder> --write --slug <slug> [--trip <n>]
```

Turns a dump of photos (a camera-roll export, a partner's folder, an old
backup) into candidate trips:

- **Reads** every image under `--from` (jpg, jpeg, png, heic, heif, webp,
  tif, tiff; anything else is counted and ignored) for its camera time and
  GPS, with `exifr`.
- **Dates with a confidence, never invents one**: `exif` from the camera;
  `mtime` from the file's modified time when the file is older than
  `--fresh-days` (30); otherwise `none`. A file touched recently was
  probably just copied, so its mtime says nothing about the trip.
- **Groups** dated photos into trips: more than `--gap` (2) empty days
  between two photos starts a new one. Undated photos join no trip and are
  listed by path.
- **Places** a photo only when its GPS is within `--radius-km` (40) of an
  entry in `places.json`. No GPS, no guess: an unplaced day is written as
  the place `TODO`.
- **`--write`** copies the chosen trip's photos into the gitignored
  `trips/<slug>/photos/`, named by capture time (`2014-06-03-1422`),
  converting HEIC to JPEG with macOS `sips` (elsewhere it reports and skips
  them). It then writes `photos.json` (name, file, date, confidence; **no
  GPS**) and scaffolds `trips/<slug>.md` as `draft: true`, with one day
  heading per day that has photos, each day's photos listed in a comment to
  pick from, and `TODO` wherever a person has to write. A draft with `TODO`
  renders in the dev server; the site build refuses one that is not a
  draft. It never overwrites an existing trip. The dump folder is never
  modified.

Tested in `ingest-photos.test.mjs` on generated photos with real EXIF.

### places.json

The gazetteer for `ingest-photos.mjs`: a few hundred cities and towns,
`{name, country, lat, lon}`, weighted to where trips have been and might
go. Coordinates are approximate (town centres, about two decimals) because
they only have to land a photo within 40 km. Names become place names in a
trip file, so none may contain `·` or `→`. Add a place by hand when a trip
needs one; the tool reads nothing from the network.

## draw-denver-map.mjs

Draws the `/denver` poster map from OpenStreetMap and writes it to
`src/content/maps/denver.js`, which is committed. It is an authoring step,
not part of the build: the page never calls Overpass or a tile server. Run it
again only to redraw or extend the map, then commit the result.

```bash
node scripts/draw-denver-map.mjs                  # fetch the area, write the module
node scripts/draw-denver-map.mjs --record-fixture # re-record the test fixture
```

**What it does.** One Overpass query (`out geom`) for the streets, the South
Platte and Cherry Creek, and the parks inside `DENVER_AREA`. It projects them
north-up with `src/lib/mapFit.js`, the same projection the page uses for
pins. Only the west edge and the latitudes are chosen; the east edge follows
from the 800×600 viewBox, so the drawing keeps the cos(latitude) proportions
`makeFit` insists on. Each layer (arterials, streets, water, parks) becomes
one path. Each line is clipped to a padded frame, simplified with
Douglas–Peucker and rounded to 0.1. Elements are sorted by type and then id
first, so the same answer always writes the same file. Two known limits of
the clip: a point is kept only when it or a neighbour is inside the frame,
so a long segment whose ends both lie outside it is dropped; and a park is
drawn only when one of its vertices is inside, with its holes filled. Check
the corners by eye after a redraw. Neighbourhood and water labels and the
two reference intersections in the module's `fit` are placed by hand in the
script.

**Attribution.** The data is ODbL. The module's header says so, and its
`attribution` field is the line the page shows beside the map.

**Overpass.** The main instance often answers 502 or 504 under load. Set
`OVERPASS_URL` to a mirror, for example
`https://overpass.private.coffee/api/interpreter`. The script sends a generic
user agent, with no personal contact details.

**Tests.** `draw-denver-map.test.mjs` runs `buildDrawing` on a recorded
answer for a small area around Union Station
(`fixtures/overpass-union-station.json`), with no network. It checks that
the output is deterministic, that real intersections fall on the drawn
lines, and that the committed module's fit, labels and attribution are
valid. The fixture and the module are generated, so Prettier ignores them.
