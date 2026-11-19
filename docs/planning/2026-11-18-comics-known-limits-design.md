---
status: planned
kind: feature
mode: auto
---

# Comics known limits (follow-up to #323)

## Problem

The comics epic shipped with limits written down in `backend/CLAUDE.md`, each
noted as a follow-up. Joey asked for them fixed (2026-11-18). None is a
data-loss bug today; each is a rough edge a normal use can hit.

## Scope

In (one PR, in this order, each its own commit with its own tests):

1. **Add-bar retry makes a second volume.** `POST /api/intake/add` sends no
   idempotence key, so a repeated request (double tap, retry after a timeout)
   writes the same book twice. Fix: the client sends one `request_id` per add
   action; the server derives each volume's `intake_entry_id` from it (uuid5, as
   `volume_plan.typed_key` does), so `write_volume` is idempotent. A request with
   no id behaves as today. A second request with the same id returns the first
   result, not a 409.
2. **A model re-parse can clear a rules-linked link.** `_apply_parsed`
   (`comics_routes.py`) reconciles `source='parsed'` rows; when the model answer
   lacks a link the rules had set, the link is lost. Fix: a re-parse never drops a
   link that an earlier parse set and the new answer does not contradict; it may
   only add or change it. Test: rules link, then a model answer without one.
3. **Shelf card says "1 book with no number" when two books share a line number.**
   Find where the count is derived (`comics.py` / `public_issues.py` / the shelf
   card) and make "no number" mean a book with no `line_number`, not a duplicate.
4. **ISBN missing from Check's preview.** Typed books are not in `comic_adds_for`,
   and adding an `isbn` key broke 7 tests that pin `adds`. Fix without breaking the
   pinned shape: add the ISBN where the preview already lists typed books, or
   update those tests deliberately if the new key is the right shape.

Out: un-reading a volume vs `read_to` (a design question), the contents-parse
no-match memo (needs storage), any migration, GCD (#337 closed).

## Decisions (my call)

- No migration: every fix is code and payload shape.
- Idempotence key in the request body, not a header, so the existing
  origin/auth checks and frontend client need no change beyond one field.
- The key is created once per add action in the frontend and reused for retries
  of that action; a new add gets a new key.

## Tasks

One Sonnet implementer, one PR `fix/comics-known-limits`. Read `backend/CLAUDE.md`
(the four notes: search "Known limit"), `backend/intake/README.md`. Each fix:
failing test first, then the change, then update the `backend/CLAUDE.md` note
(remove the limit or restate it). Add a `frontend/changelog.md` bullet only for
user-visible change (1 and 3). Acceptance per fix is its test plus CI green.

## Ship notes

No migration. Smoke: public comics md5 `cfc1927b264ad97802d67f19ff75d0e1`
unchanged, 12 public details unchanged, 0 error entries.
