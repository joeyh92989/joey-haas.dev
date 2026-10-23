# Build scripts

Three Node scripts run around `vite build` (`npm run build`):

```
fetch-snapshot.mjs  →  vite build  →  prerender.mjs  →  generate-rss.mjs
```

## fetch-snapshot.mjs

**What and why.** It writes the public API's response bodies to
`public/snapshot/items.json`, `stats.json` and `next.json`, which Vite then
copies into `dist/`. (`picks.json` and `radar.json` are retired with their
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
- `next` is optional; if it fails, the build leaves that file out.
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
npm run build      # on Render: snapshot, vite build, prerender, then the RSS feed
```

**Refreshing.** Every deploy refreshes the snapshot. Between deploys,
`.github/workflows/nightly.yml` runs nightly at 00:17 UTC: it refreshes the
picks, the catalogue and the suggestions first, then compares the live API
bodies with the deployed files and triggers a static-site deploy through a
Render deploy hook only when they differ. A failure on `items` or `stats`
fails the compare; `next` is skipped with a warning
when the API cannot serve it (a 404 until it has deployed). See the root
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

## prerender.mjs

**What and why.** Crawlers and link previewers (Slack, iMessage, LinkedIn)
mostly do not run JavaScript, so before this every URL previewed as "Joey
Haas" with the site card. After `vite build`, it writes a copy of
`dist/index.html` for every public route, each with its own `<title>`,
description, canonical URL and Open Graph tags, plus `sitemap.xml` and
`robots.txt`. Only the head changes: the body is the same SPA shell, and the
app renders the page as before.

**Routes.** The static pages (`/`, `/about`, `/projects`, `/shelf`,
`/shelf/next`, `/now`, `/colophon`, and `/blog` while a post is published), every published post,
every item in `dist/snapshot/items.json`, and a Year in review page
for each year with a finish (`/shelf/year/<year>`). An item's preview image is its
cover; a post's description is its first paragraph. Copy comes from
`src/content/`, so a wording change there reaches the previews.

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
exactly the static pages and the published posts. There are no placeholders:
a rewrite to a file the build did not write serves an **empty 200**, not the
SPA (a `/blog/:slug` rule did this to `/blog/example`, a draft, on
2026-10-19). So publishing or unpublishing a post means adding or removing its
rule. Item, year and month pages (`/shelf/:id`, `/shelf/year/:year`,
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

It writes `dist/feed.xml` from `frontend/posts/`, skipping drafts. Each item
carries the post's first paragraph as plain text (`excerpt` in
`prerender-lib.mjs`, the same one the prerendered description uses). It never
renders post HTML, so it can't disagree with the site about how a post
renders. It runs after `vite build`, because it writes into `dist/`.
