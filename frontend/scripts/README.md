# Build scripts

Two Node scripts run around `vite build` (`npm run build`):

```
fetch-snapshot.mjs  →  vite build  →  generate-rss.mjs
```

## fetch-snapshot.mjs

**What and why.** It writes the public API's response bodies to
`public/collection/items.json` and `stats.json`, which Vite then copies into
`dist/`. The API is on Render's free tier and sleeps after about 15 idle
minutes. Without the snapshot, `/collection` would open with a thirty-second
"Waking the server" notice. With it, the page paints straight away and then
refreshes from the API. Home and Projects read the same file for their cover
strips, so they still make no API calls.

**When it runs.**
- Only when `VITE_API_URL` is set, which is the Render static site. CI and
  local builds skip it, so they stay offline and deterministic.
- It never fails the build. If the API doesn't wake within 120 s, or returns
  something unexpected, the build ships without a snapshot, and the site
  behaves as it did before the snapshot existed.
- Required snapshots (`items`, `stats`) are written together or not at all.

**Usage.**

```bash
npm run snapshot   # fetch from production into public/collection/ for local dev
npm run build      # on Render: snapshot, then vite build, then the RSS feed
```

**Refreshing.** Every deploy refreshes the snapshot. Between deploys,
`.github/workflows/snapshot.yml` runs daily and triggers a static-site deploy
through a Render deploy hook, but only when the live API bodies differ from
the deployed files. See the root README → Collection snapshot.

**Gotchas.**
- `public/collection/` is gitignored and must never be committed.
- The files are verbatim API bodies. Change what the API publishes and you
  change what the snapshot publishes, so `test_public.py` covers both.

## generate-rss.mjs

It writes `dist/feed.xml` from the frontmatter in `frontend/posts/`, skipping
drafts. It reads frontmatter only and never renders post HTML, so it can't
disagree with the site about how a post renders. It runs after `vite build`,
because it writes into `dist/`.
