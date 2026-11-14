---
status: shipped
kind: ui-fix
mode: auto
issue: 224
---

# Item page while the API is cold

## Problem

#224: `/shelf/<id>/` looked blank for a long time on 13 Nov while the free
Render API was asleep (30-60s).

Evidence, from the built site (`vite preview`, synthetic snapshot, every
`/api/public/items/*` request held for 40s or aborted), screenshots at 1s, 5s
and 20s:

| Case | What painted | Verdict |
|---|---|---|
| Item in `/snapshot/items.json`, detail pending | The full preview at 1s: cover, title, status, tags, rating tile. Nothing says more is coming | Works, but silent |
| Item **not** in the snapshot, detail pending | Breadcrumb and one muted line: "Loading…", then "Waking the server…" at 3s. The h1 is visually hidden | Reads as a blank page |
| Detail request fails | "That didn't load. Try again in a minute." and Try again | Correct, standard state |

So the preview does paint first, and the failure path is right. The real gap
is an item missing from the snapshot (added since the last nightly, or a
snapshot fetched without it): the page has no shape, only a thin line.
Production's snapshot did contain Ocarina of Time (checked 2026-11-14), so
Joey's blank page on the 13th may also have been a stale snapshot; that part
cannot be proved from here.

## Solution

- Missing from the snapshot: draw the item head in `--skeleton` (existing
  `skeleton-cover` / `skeleton-line`) above the existing `LoadState`, which
  already says "Loading…" then the WAKING words.
- In the snapshot, detail pending: after `SLOW_LOAD_AFTER_S` (3s) add the
  WAKING line under the preview, so a visitor knows the description and
  similar strip are coming. Silent before 3s, so a warm API (0.14s) shows no
  flicker.
- Failure: unchanged (already the standard error state with retry).

## My calls

- No new mockup: reuses the skeleton and `LoadState` patterns.
- No new words: `WAKING` from `content/status.js`.
- Issue option 3 (detail fields in the snapshot, or per-item snapshot files)
  stays a follow-up: a bigger change to the snapshot contract, the nightly,
  the fingerprint and the privacy tests.
- Changelog bullet under 2026-11-14, since the waiting state is visitor-visible.

## Tasks

- [x] Reproduce the three cases with screenshots
- [x] Component tests: preview + pending (waking line after 3s), missing + pending (skeleton + waking), failure (error, retry, no skeleton)
- [x] Skeleton and wait line in `Item.jsx`, CSS in `index.css`
- [x] Changelog bullet

## Smoke check

Build, serve, delay `/api/public/items/*` by 40s; open an item in the snapshot
and one that is not. Both show something at 1s and the waking line by 5s.
