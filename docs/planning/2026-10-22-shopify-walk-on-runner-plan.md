# Shopify walk on the nightly runner — plan

Spec: `2026-10-22-shopify-walk-on-runner-design.md`. Branch
`fix/shopify-walk-on-runner`. Sequential; each task ends green.

1. **Wire format.** `backend/physical_sources/wire.py` (pure; covered by
   `test_physical_imports.py` automatically) and
   `tests/test_physical_wire.py`: round-trip of every recorded Shopify
   fixture's parsed rows, and refusals (missing/extra key, wrong type, bad
   date, bad decimal, bool as int).
2. **Routes.** `physical_routes.py`: `record_store` split out of
   `refresh_store`; `GET stores/{key}/html-skip`; `POST stores/{key}/ingest`
   with its validation; `RefreshIn.adapter`. `items.JOB_ROUTES` +
   `tests/test_job_token.py`. Tests in `tests/test_physical_ingest.py`:
   ingest of a parsed fixture writes the same rows a Render refresh writes;
   archive rule (errors / short / empty keep old rows live); 422s; 409 under
   the lock; 401 signed out; html-skip lists recently checked handles;
   `adapter` filter on `/refresh`.
3. **Runner script.** `backend/scripts/walk_stores.py` and
   `tests/test_walk_stores.py` against MockTransport for both the stores
   (recorded fixtures) and the API; exit codes 0/1/3; a raising walk posts
   an `internal` error. README section in `backend/scripts/README.md`.
4. **Nightly.** `nightly.yml`: checkout, setup-python, `pip install` the
   `httpx2` line, WooCommerce-only `call stores`, then the script.
5. **Docs.** `physical_sources/README.md` (the 429 paragraph is wrong since
   #77's prod run: rewrite it; document the runner walk), `limits.py`'s
   RATE_LIMIT comment, CLAUDE.md's nightly order line.
6. **Finish gate.** Full pytest, ruff check + format, review (auth + CI
   surface: ultra review), PR. Joey merges; then `workflow_dispatch` Nightly
   is the smoke (spec, Smoke).
