---
status: building
kind: fix
mode: auto
---

# Backend API audit fixes (#264, #265, #302; #277 and #301 triaged)

## Scope

- **#264** `Config.docs_enabled` is true only with `ENABLE_DOCS=1` or a localhost `FRONTEND_URL`.
  `main.py` passes `docs_url`, `redoc_url`, `openapi_url` as `None` otherwise. `smoke.sh` pins the 404s.
- **#265** `public_cache.py`: a middleware inside CORS that, for a 200 `GET /api/public/*`, adds
  `Cache-Control: public, max-age=60, stale-while-revalidate=300` (unless the route set one) and a
  weak ETag hashed from the body, and answers a matching `If-None-Match` with 304. The ETag is the
  body hash, not the `/next` fingerprint, so a body that reads something new can never serve stale:
  the fingerprint stays the server-side cache key and nothing new has to join it.
- **#302** Direct unit tests for `intake/garment_kind.py` and `intake/shelf_kinds.py`; the two
  scripts get a test that names them (import and pure helpers) or a comment where indirect.

## Not in this PR

- **#277** needs the rule decided in the comics-book spec first (status follows marks, or the
  frontend hides the label). Both change behaviour beyond the backend; left for Joey.
- **#301** `following` is read by the public Comics page's Following chip and the series page, so
  dropping it is a frontend change; error-body unification and 99 response models are separate
  larger work.
