---
status: superseded
date: 2026-11-09
topic: live-tonight-picks
superseded_by: docs/planning/2026-11-09-recommendation-engine-design.md
---

> **Folded into the recommendation engine design (2026-11-09).** The review
> found the freeze is one symptom of the engine's momentum and flat-mean
> scoring; the engine doc adopts option A of question 2 (live from public
> rows), answers question 5 "visitors too", and carries the slot story,
> copy and mockups. This doc is kept for the problem statement only.

# Tonight's picks after a finish

## Problem

Tonight's three picks on `/shelf/next` are frozen to the most recent day
before today's UTC midnight on which Play Next showed a game. Finishing a
game does not change them until the next nightly run.

On 2026-11-09 the owner finished Balan Wonderworld, a 3D platformer, from
the new Wrap up sheet. The chip updated to "Just finished Balan
Wonderworld" at once, because the last finish is read live. The picks did
not, because they were chosen the night before against Dredge. The result
read as three platformer-ish games offered immediately after a platformer
was put down, under a chip naming that platformer.

Two defects sit inside that, and they are separable:

1. **A label that no longer holds.** Slot labels are frozen with the picks,
   while each pick's reasons are rebuilt live. Donkey Kong Bananza kept the
   "Change of pace" label, but `change_of_pace_reason` compared it against
   the live last finish, found neither a different size band nor a
   disjoint genre set, and returned None, so the explanation silently
   disappeared. The label promises a contrast the engine has computed does
   not exist. (Narrow fix, probably not a design question: withhold the
   label when the reason is None, exactly as it is already withheld when
   the last finish is private.)
2. **The picks themselves.** The owner wants a finish to rebuild the
   suggestions immediately. This is the design question.

## Constraints

- **Why the freeze exists, and it is not laziness.** `public_picks_with_day`
  in `backend/public_outputs.py` publishes only events dated before today's
  UTC midnight, "otherwise anyone polling this route could watch the owner
  use Play Next, skip a game or refuse one as it happened". Any design that
  publishes today's shown or skipped events breaks that, and the privacy
  rule should win unless the design avoids events altogether.
- **Finishes are already public the moment they happen.** `tonight.last_finish`
  is computed live, and the cache fingerprint includes every `items` row, so
  a status change is visible at once. So reacting to a *finish* leaks
  nothing new. Reacting to *browsing* does. The line is between the two.
- **There is already a live public pick path.** Pick for me (PR #97,
  `backend/public_pick_for_me.py`) computes three backlog games publicly,
  live, from the same scoring in `backend/picker.py`, with no events at all.
  Whatever this design chooses should be weighed against simply reusing
  that mechanism for Tonight.
- **The picks are events, not a query.** Today's membership comes from
  `pick_events` rows written when the owner was shown a game. Tonight's
  picks cannot change without either new events (leaks) or a live
  computation (a different source of truth for the same section).
- **The page says so out loud.** The masthead reads "Picks Sun 8 Nov" and
  the Or instead list is captioned "rebuilt nightly"
  (`frontend/src/content/spine.js`). Copy has to move with the behaviour.
- **Caching.** `/api/public/next` is cached on a data fingerprint
  (`backend/public_next_cache.py`). Anything new the body reads must join
  the fingerprint or the page serves it stale. Pick events are already in it,
  windowed and dated before midnight.
- **Public output is pinned by tests.** `backend/tests/test_public_outputs.py`
  walks the body for forbidden keys and pins the allowed fields. A pick may
  never carry a slot key, score, date, event or rank.
- Plain CSS with design tokens, dark default; no new dependency. Public
  reasons are rebuilt over public rows only and are first person.

## Relevant files

- `backend/public_outputs.py` — `public_picks_with_day`, `public_slot`,
  `WITHHELD_SLOTS`, `SLOT_ORDER`, and the day-selection rule.
- `backend/picker.py` — the scoring, `last_finish`,
  `change_of_pace_reason`, `public_reasons`, `SLOT_LABELS`.
- `backend/public_pick_for_me.py` — the existing live public pick path.
- `backend/public_next_cache.py` — the fingerprint.
- `frontend/src/pages/Next.jsx`, `frontend/src/components/PickList.jsx`,
  `frontend/src/content/spine.js` — the section, the compact list, the copy.
- `docs/planning/2026-11-08-tonight-continue-design.md` — the feature this
  extends, including the stale-card decision reversed on 2026-11-09.
- Repo `CLAUDE.md` → Media tracker, the Play Next and `next_list`
  paragraphs, for the public rules as they stand.

## Open design questions

1. Should a finish rebuild the picks, or only invalidate the parts of the
   old set whose premise has changed (the Change of pace slot)? The second
   is much smaller and may be all the owner actually felt.
2. If the picks go live, what is the source of truth: the scorer computed
   on request, as Pick for me does, or the recorded events with today's
   included? Only the first keeps the privacy rule intact.
3. If they go live, do the slots survive? Best fit, Change of pace and
   Waited longest are defined partly by the owner's history and by what was
   offered before. A live set may have no coherent notion of "last shown
   in".
4. What does the page say instead of "Picks Sun 8 Nov" and "rebuilt
   nightly"? Does the section still name a day at all?
5. Should the change be visible to visitors, or only to the signed-in
   owner? An owner-only live recomputation sidesteps every privacy
   question, at the cost of the public page staying a day behind.
6. What happens between a finish and the next nightly if the picks stay
   event-based: is there an acceptable in-between, such as dropping a pick
   whose slot premise has lapsed rather than replacing it?

## What "done" looks like for the design

- A chosen approach for question 2 and 5, with the privacy argument stated
  explicitly, since that is the rule being traded against.
- The slot story settled: which labels survive a live set, and what a pick
  with no meaningful slot shows.
- Replacement copy for the picks date and the "rebuilt nightly" caption.
- Mockups in `docs/planning/mockups/2026-11-09-live-tonight-picks/`, with a
  `chosen.html`, covering: the section right after a finish, a set with no
  slots, and the empty case. Phone width and both themes.
- The spec half filled in on this doc, `status:` flipped to
  `ready-for-plan`.
