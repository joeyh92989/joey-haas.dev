---
status: planned
kind: fix
mode: auto
---

# Waits that say what they wait on (design)

Issue: #160. Branch `fix/intake-waits`. Plan: `2026-11-12-intake-waits-plan.md`.

## Problem

Three waits on the live site showed one word for up to two minutes, with no hint of what was
being waited on, whether it was still working, or that it had failed:

- Comic sitting: a photo read `queued` for 40 s to 2 min under copy that says `each photo is
  read as it lands` (photos are read one at a time, in order, by `useReadNext`).
- Closet, Tag now: `Tagging…` for 50 s to 2 min (one synchronous `POST /api/closet/tag`; the
  model budget is `llm.TOTAL_BUDGET_SECONDS` = 150 s, with no client timeout).
- Closet Today after a change: `Waking the server or planning…` for 20 to 30 s (the first read
  may plan the day with a model call; `apiFetch` has no timeout).

Acceptance (#160): each wait says what it is waiting on and, after a threshold, that it is still
working; a failure is reported rather than left on the waiting word.

## Scope

In: the three waits. Out: server-side speed; the reader's model; any new endpoint.

## Solution and decisions ("my call", auto mode)

1. **One elapsed-time helper**, `lib/useElapsed.js` (seconds since a wait started, ticking once
   a second while active, reset when it ends), and one place for the words in
   `content/status.js`, so the three waits read alike.
2. **Name the wait, then reassure, then give up honestly.** Each wait shows what it is on:
   - Sitting tiles: an unread photo reads `waiting to be read · N ahead` (its place in the
     one-at-a-time queue), the photo being read reads `reading · 12 s`. After 30 s:
     `still reading — the model can take a minute or two`. Shoot's tip says photos are read
     one at a time, in order (not "as it lands").
   - Tag now: `Tagging N photos — one model call · 12 s`; after 30 s `still working — this can
     take up to two minutes`.
   - Today: `Waking the server or planning the day · 12 s`; after 20 s `still working —
     planning asks the model and can take up to two minutes`.
3. **A client deadline just past the server's budget.** A request still unanswered after 165 s
   (`llm.TOTAL_BUDGET_SECONDS` 150 s + margin) is reported as a failure in that wait's own
   words, with Retry where the page already has one; the request is aborted with an
   `AbortController` passed to `apiFetch` (add an optional `signal`). *Why 165 s:* anything
   shorter would report a failure for a call the server is still allowed to finish.
4. Failures the server already reports (a failed photo, a tag `note`, `LOAD_ERROR`) keep their
   current words; the change is that the waiting word never outlives them.

## Sources

Closet/intake map (researcher, 2026-11-12): `frontend/src/components/intake/PhotoTile.jsx:7-10,49-72`,
`ShootStep.jsx:228`, `lib/useReadNext.js:69-118`, `pages/AdminCloset.jsx:118-131,161-162`,
`pages/AdminClosetToday.jsx:394,457-479,623-624`, `content/status.js:18`, `lib/api.js:11-13`,
`backend/llm.py:45,158`, `backend/closet_routes.py:887-945`.

## Open questions

None.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
