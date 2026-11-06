---
title: Render serves a prerendered page only at the slash
date: 2026-11-06
tags: [render, static-sites]
draft: true
---

On a Render static site, a build that writes `dist/about/index.html` gets it
served at `/about/`, but not at `/about`: without the slash, the SPA's `/*`
catch-all wins, and the page goes out with the site's generic head (title,
description, link preview) instead of its own.

The fix is one rewrite per page, listed ahead of the catch-all:

```yaml
routes:
  - type: rewrite
    source: /about
    destination: /about/index.html
  - type: rewrite
    source: /*
    destination: /index.html
```

Two things that look like shortcuts and are not:

- A rule with a wildcard or a placeholder for pages that might not exist. A
  rewrite to a file the build did not write serves an empty 200, not the SPA.
- A redirect that adds the slash. Render matches the slash form against the
  same source again, so any path without a file loops.

So every prerendered page gets its own rule, and a test checks the rules
against the pages the build actually writes.
