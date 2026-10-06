# Build scripts

Two Node scripts run around `vite build` (`npm run build`):

```
fetch-snapshot.mjs  →  vite build  →  generate-rss.mjs
```

## fetch-snapshot.mjs

**What and why.** It writes the public API's response bodies to
`public/snapshot/items.json`, `stats.json` and `next.json`, which Vite then
copies into `dist/`. (`picks.json` and `radar.json` are retired with their
routes.) The API is on Render's free tier and sleeps after about 15 idle
minutes. Without the snapshot, `/spine` would open with a thirty-second
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
- When it runs, it first deletes the snapshot files an earlier run left in
  `public/snapshot/` (temp files too), and does so again on every failure, so
  a failed run ships no snapshot rather than a stale one.

**Usage.**

```bash
npm run snapshot   # fetch from production into public/snapshot/ for local dev
npm run build      # on Render: snapshot, then vite build, then the RSS feed
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

## generate-rss.mjs

It writes `dist/feed.xml` from the frontmatter in `frontend/posts/`, skipping
drafts. It reads frontmatter only and never renders post HTML, so it can't
disagree with the site about how a post renders. It runs after `vite build`,
because it writes into `dist/`.
