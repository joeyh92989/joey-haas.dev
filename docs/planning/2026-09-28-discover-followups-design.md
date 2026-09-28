# Discover follow-ups: one pick per game, the overload note, Rate a few as a table — Design

Follow-up to E8b (`2026-09-27-tracker-e8b-discover-design.md`), from the
first live run on 2026-09-28.

## Problem

1. **A game took two of the eight slots.** Citizen Sleeper was picked on
   Switch and on Switch 2. Discover keeps one candidate per
   `(igdb_id, platform_id)` (the catalogue's key), so a game released on
   both platforms competes twice.
2. **The fallback note was vague.** Every Gemini model returned 503; the
   page said "The model did not answer", when `llm.py` knew it was an
   overload and that retrying in a few minutes would work.
3. **Rate a few was hard to read.** Titles sat at the left edge and the
   stars at the right edge of a 72rem-wide panel, so it was hard to tell
   which game a row of stars rated; and a rated row vanished at once, so
   there was no confirmation of what was saved.

## Scope

**In:** one pick per IGDB game in Discover; an overload note; Rate a few
as a compact table that keeps rated rows with their score.
**Out:** Radar (it already shows one row per platform on purpose — a
pre-order is per platform); `llm.py`'s retry chain; any migration.

## Proposed solution

1. **One per game** (`discover.prescore`): after scoring, keep the best
   candidate per `igdb_id`; on a tie, the later platform (Switch 2 over
   Switch over N64, i.e. `DISCOVER_PLATFORMS` order). Done before the
   shortlist, so the model and the fallback both see one entry per game.
   Answers already exclude by IGDB id, so wanting one platform's pick
   already drops the other.
2. **Overload note** (`_failure_note`): an error containing "overloaded"
   (Gemini's 503 chain) or Anthropic's "Error code: 529" reads "Gemini is
   overloaded; try again in a few minutes" / "The model is overloaded;
   try again in a few minutes".
3. **Rate a few table** (`RateAFew.jsx`, `index.css`), owner's choice of
   layout:
   - A `<table>` capped at ~36rem wide: **Game** (title · platform),
     **Rating** (QuickRate), and a narrow **score** column ("—" or
     "8/10 saved"). Striped rows; the row under the pointer or holding
     focus is highlighted (`:hover` and `:focus-within`, per the shelf
     rule that nothing is hover-only).
   - A rated row **stays** for the session showing its score, and can be
     re-rated or cleared (clearing PATCHes `rating: null` and returns the
     row to "—"). The six shown are fixed when the panel first renders;
     when all six are rated and more unrated games remain, a **Next few**
     button shows the next six.
   - Each row's stars keep their accessible name via the row: the
     QuickRate group gets `aria-label="Rating for <title>"`.

## Key decisions

| Decision | Chosen | Tradeoff |
|---|---|---|
| Dedupe level | Per IGDB game, best score wins | A Switch-only and a Switch 2 edition can't both be suggested; the card names the platform picked |
| Tie-break | Newest platform | Switch 2 editions are the ones the owner buys now |
| Rated rows | Stay with their score | Longer panel within a session; clear confirmation and a way to fix a mis-tap |
| Table vs list | Table (owner) | Real row/column semantics; a little more markup |

## Prior art

Existing code only: `discover.prescore`, `recommendations_routes._failure_note`,
`llm.py`'s overload message, `QuickRate` (clear = choose current value),
the shelf's hover/focus-within rule in CLAUDE.md. No new dependency.

## Open questions

None.

## Smoke test strategy

No new route; `scripts/smoke.sh` unchanged. Before merge: pure test for one
per game and its tie-break; route test for the overload notes (Gemini's and
Anthropic's wording); RateAFew tests for the table, a rated row staying with
"8/10", re-rate, clear, and Next few. After deploy: generate on
`/admin/discover` → no title twice; Rate a few (after un-rating one game, or
when a game is next finished) shows the table.
