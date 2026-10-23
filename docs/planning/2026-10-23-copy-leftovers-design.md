---
status: planned
mockups: none
chosen: none
---

# Copy leftovers from the My Shelf pass — design

Date: 2026-10-23 · Repo: joey-haas.dev · Read against `main` at `99c9309`.
Follows `2026-10-22-copy-pass-design.md`, whose PR (#79) flagged these
strings as left behind.

## Problem

PR #79 swept `Could not …` to `Couldn’t …` and changed the frontend's
favourites message to "Remove one first.", but missed a few strings:

- Four mid-sentence "could not" strings in the admin pages.
- Two API strings in `backend/items.py`. They still say "Unfavorite one
  first." and "Could not update:", and the admin pages show them verbatim, so
  the same refusal reads two ways depending on which form hits it.

## Scope

In: the strings below (the last three were found in review) and the tests that assert them.
Out: the `/shelf/year` double count, which changes analytics behaviour and
gets its own PR. Historical planning docs that quote the old strings are not
edited either.

| File                                                   | Old                                        | New                                                   |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------- |
| `backend/items.py` `FAVORITES_FULL`                    | `… Unfavorite one first.`                  | `… Remove one first.` (matches `AdminCollection.jsx`) |
| `backend/items.py` bulk update 422                     | `Could not update: …`                      | `Couldn’t update: …`                                  |
| `frontend/src/pages/Admin.jsx`                         | `The nightly status could not be read.`    | `The nightly status couldn’t be read.`                |
| `frontend/src/pages/AdminAnalytics.jsx`                | `The analytics could not be read.`         | `The analytics couldn’t be read.`                     |
| `frontend/src/pages/AdminImport.jsx`                   | `could not be read`                        | `couldn’t be read`                                    |
| `frontend/src/pages/AdminImport.jsx`                   | `could not reach the API`                  | `couldn’t reach the API`                              |
| `frontend/src/pages/Collection.jsx` (admin shelf hint) | `… shows four; unfavorite {n}.`            | `… shows four; remove {n}.`                           |
| `backend/recommendations_routes.py` Radar lane 3       | `IGDB answer could not be read (…)`        | `IGDB answer couldn’t be read (…)`                    |
| `backend/recommendations_routes.py` Discover note      | `The model's answer could not be read (…)` | `The model’s answer couldn’t be read (…)`             |

The curly apostrophe matches the convention #79 set. These are mechanical
contractions, so they skip the Grammarly round-trip.

## Plan

One milestone, one commit, no carve-outs (no infra, migration or deploy-path
change).

1. Change the strings, and update the assertions in
   `test_items_favorites.py`, `test_discover_routes.py`, `test_recommendations_routes.py`, `Admin.test.jsx`, `AdminAnalytics.test.jsx`,
   `AdminItem.test.jsx` and `AdminCollection.test.jsx` (the last two mirror
   the API's text in their fixtures).
   AC: `git grep` finds no old string outside the historical planning docs.
   Tests: full pytest, vitest, eslint, prettier, ruff and the build.

## Environment test

After merge and deploy: `./scripts/smoke.sh https://joey-haas.dev
https://api.joey-haas.dev` is green, and `/api/health` returns ok. The changed
strings show only on admin error paths behind sign-in, so the smoke run checks
that the deploy is healthy, not the strings themselves.
