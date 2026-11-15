---
status: approved
kind: plan
mode: auto
---

# Frontend performance audit fixes (#270, #271, #272)

Baseline build: `index-*.js` 569.81 kB raw / 180.11 kB gzip.

## #270 quiet session check
`GET /api/auth/me?quiet=1` answers 200 `{"signed_in": false}` when signed out
and `{"email", "signed_in": true}` when signed in. Without the parameter the
route is unchanged (401), so AdminLayout and old callers are unaffected, and
an older backend ignoring the parameter still answers 401, which RootLayout
already reads as signed out. RootLayout sends `quiet=1` and trusts only
`response.ok && body.signed_in !== false`. Auth is not weakened: no session
data is returned for a signed-out caller.

## #271
- `readSnapshot` caches its promise per name (a failure is not kept), so Home's
  CoverStrip and Now playing share one request. `resetSnapshotCache` for tests.
- CoverStrip asks IGDB for `t_cover_small` (slot is 50x67).
- About photo gets `width`/`height`/`decoding`. The file is a real JPEG, so no rename.

## #272
- A Vite plugin adds `<link rel=preload as=font>` for Inter 400 and 500 (body
  and UI text; the serif sets only two headlines so is not preloaded).
  `font-display: swap` is already set by @fontsource.
- Lazy-load `/shelf/*` pages, `/daily` and `/stats` (Denver already is).
