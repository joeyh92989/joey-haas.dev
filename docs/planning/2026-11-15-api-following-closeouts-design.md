# API: private `following`, error shape, and test closeouts

Status: building. Kind: fix. Mode: auto. Refs #301, #244, #275.

## Plan

1. Drop `following` from `PublicComicRow` and `PublicComicDetail` (public_comics.py); the public shelf drops its Following chip (`COMIC_CHIPS`), the item page no longer hides "as of" for followed series. The admin shelf keeps the chip and reads `following` from `/api/items`.
2. Pin `following` in `FORBIDDEN` (test_public_outputs.py) and `COMIC_FORBIDDEN`.
3. One error shape in `errors.py`: `detail` always; router 404 reads "Not found"; 422 is `{type, loc, msg}` without `input`. No status or header changes.
4. Response models: public routes already have them; admin routes return dicts by design, noted in the README. Not adding 99 models.
5. Verify-only: #244 (10 runs of Admin* suites) and #275 (SpotMap action at 400px).

Done when: the new tests pass, lint is clean, #301's bullets are met or named as skipped in the PR.
