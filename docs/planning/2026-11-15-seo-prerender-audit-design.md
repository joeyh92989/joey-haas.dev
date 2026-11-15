---
status: done
kind: fix
mode: auto
---

# SEO prerender audit fixes (#266 #267 #268 #269 #290, #278 checked)

All changes sit in the build-time head layer (`prerender-lib.mjs`, `prerender.mjs`,
`generate-rss.mjs`, `clip.js`, `pages.js`).

- **#266** Home gets canonical and `og:url` (the issue asks for it; the cost is that the SPA
  fallback file now names Home as canonical for unknown paths, which are soft 404s anyway).
  `Person` + `WebSite` JSON-LD on `/`, `BlogPosting` on posts, `twitter:title`/`description`
  on every route.
- **#267** Sitemap skips any route whose canonical is not its own URL (`/shelf`). `lastmod`
  from the snapshot: an item's latest finish, else `created_at`; issue and edition pages take
  their series' date; year and month pages the latest finish inside them.
- **#268** Titles that collide are qualified, in order: year, platform, publisher, then a short
  id. Issue and edition pages use the series' qualified name (year and publisher come from the
  items snapshot, joined on `item_id`, so no backend change).
- **#269** `clip` prefers the last sentence end (60+ characters), then the last clause break,
  then a word with an ellipsis. `/blog` gets a real sentence.
- **#290** Explicit autodiscovery on `/` and `/blog`, `/blog/feed.xml` as a byte copy of
  `/feed.xml`, `/changelog.xml` from `changelog.md`, visible RSS links on Blog, TIL, Stats and
  the footer.
- **#278** Already holds on production: `/denver` and `/denver/` serve `noindex`, the sitemap and
  search index omit it (the #125 hidden-path rule). No change; the "no promise" copy question
  is Joey's.
