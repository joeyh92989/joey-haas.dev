# Spine follow-ups — Design

Input: the follow-up issues filed after Spine Next, #40–#46. The copy pass
(#39) is out of scope here. The parent is
`docs/planning/2026-10-05-spine-next-design.md`, whose S9 (the batch freeze)
this spec amends. Decisions are dated 2026-10-06. No schema change.

## Problem

Spine Next shipped with a list of deferred work:
- two public endpoints nothing reads any more, one of which still updates
  live when the owner answers a game;
- a public route that does around a second of CPU per request on the free
  tier;
- status colours that only the legend tells apart, and an item-page
  backdrop that renders as a muddy band;
- store dates copied onto items before #38 fixed the copy;
- a privacy-safe residual that is cheap to close;
- a flaky test;
- a dozen small review notes.

None of these is urgent. Together they are the difference between "shipped"
and "finished".

## Scope

**In**, as four PRs, in this order:

| PR | Issues | What |
|---|---|---|
| 1 | #40, #45, #46, #43 | Retire `/api/public/picks` and `/api/public/radar`; the review tidy-up; the flaky-test hunt; the #43 hardening |
| 2 | #44 | Cache `/api/public/next`; bound the pick-event query |
| 3 | #42 | Status colours; drop the item-page backdrop |
| 4 | #41 | The store-date backfill script (Joey runs it) |

**Out:**
- the copy pass (#39);
- running the backfill against Neon (Joey's, decided 2026-10-06);
- fixing #43's residuals (a) and (c), which are accepted;
- any migration.

## Proposed solution

### PR 1 — Retire, tidy, harden (#40, #45, #46, #43)

**#40: retire the two routes.**
- **Backend.**
  - Remove `GET /api/public/picks` and `GET /api/public/radar` from `backend/public.py`.
  - Remove `load_public_radar`, `PublicRadarOut` and `RADAR_LIMIT` from `backend/public_outputs.py`.
  - Keep `public_picks_with_day` and its `PublicPickOut` rows: `/api/public/next` uses them. Drop the thin `load_public_picks` wrapper if nothing else calls it.
- **Tests.** No guarantee is lost; each one is re-pinned through `/api/public/next` (decided 2026-10-06).
  - The twelve picks tests in `tests/test_public_outputs.py` assert on `tonight.picks`, with `item_id` in place of `id`. They cover: the latest shown day, the seven-day window, a game shown today waiting for tomorrow, skips and nevers, title order, and private or pinned games never being picks.
  - The radar tests are deleted only where a `/next` test already pins the same rule: registry-only dates, IGDB-only links, no store, price or window, and never the Switch 1 sheet's date. A rule without a `/next` twin is ported first.
  - `tests/test_public.py` drops its picks/radar requests (around lines 779, 867 and 917).
- **Build and ops.**
  - `frontend/scripts/fetch-snapshot.mjs`: remove `picks` and `radar` from `SNAPSHOTS`.
  - `frontend/src/lib/snapshot.js`: remove them from `SHAPES`.
  - `.github/workflows/nightly.yml`: remove them from the compare loop, leaving `items stats next`.
  - `scripts/smoke.sh`: remove their key-set checks and their snapshot loop entries, and keep the `next` checks.
  - Static files already deployed under `/snapshot/picks.json` and `/snapshot/radar.json` disappear on the next build, and nothing reads them.
- **Docs.** Remove every mention of the two routes as live:
  - README (Public API, Collection snapshot);
  - `frontend/scripts/README.md`;
  - `backend/physical_sources/README.md` and the comment in `collapse.py` (both now point at `/api/public/next`'s public date rule);
  - CLAUDE.md;
  - the how-it-works post.

**#45: the tidy-up.** One commit per area. Each item comes from the issue.
- **Phone nav, first-item focus ring.** Give the scrolling nav inline padding with a matching negative margin, as is already done for block padding.
- **`FADE_PX`.** Comment that the JS constant mirrors the CSS `2rem`.
- **Store-list focus.** After an answer removes a row, move focus to the next row's first action, or to the status line when none is left.
- **Store-list titles become links.** `_row_out` gains `igdb_url`, using the `_igdb_url` check (admin only).
- **"Last nightly".** Its stale state gets a visual distinction: when `summary.stale`, the line renders with the existing `.admin-error` treatment (an `--accent` left border on `--surface`) rather than `.muted`. No new colour token is needed.
- **`releaseWords`.** Move it to `frontend/src/lib/releaseWords.js`; `AdminRadar.jsx` re-exports it.
- **Not on cartridge.** Hide the "(0)" count when nothing is in the list.
- **`require_admin`.** Compute `_job_route` once.
- **`test_job_token.py`.** Replace the vacuous trailing-slash test, or drop it with a comment saying why.
- **Test gaps.** Add the missing `nightly.js` and `next_list` cases.

**#46: the flaky test, time-boxed.**
- Run `npx vitest run` about 20 times under synthetic CPU load (`yes > /dev/null`, one per core) and capture any failure.
- **If it reproduces:** fix it deterministically (fake timers, a held promise) rather than by lengthening timeouts.
- **If it never reproduces:** harden the likely suspects (the fake-timer "Waking the server" tests and the held-promise re-link test that the #47 review flagged), and close #46 noting it never reproduced.

**#43: harden (b), accept (a) and (c).**
- `next_load.taste_sparing_owned` also requires the item's title, casefolded and trimmed, to equal the owned row's title. A renamed or re-linked item is then scanned like any other private game.
- Add a test: a renamed owned item's new title is refused.
- S9 records (a) and (c) as accepted.
- Close #43 with the decision.

### PR 2 — Cache `/api/public/next` (#44)

**The cache.** `backend/public_next_cache.py` (new) holds a single-entry
in-process cache:

```text
fingerprint = (
  UTC today,
  count(items), digest of every items row's (id, xmin),
  count(recommendations), digest of every recommendations row's (id, xmin),
  count(catalogue_runs.finished_at), max(catalogue_runs.finished_at),
  count of shown and skipped pick events in [midnight - 7 days, midnight),
)
```

As shipped (Task 12 and its fix round). The plan first named
`max(items.updated_at)` and per-kind status counts with `max(generated_at)`;
see D3 for why the digest replaced them.

- **Fingerprint query.** One cheap aggregate query per request, against the full build. Every input that can change the body changes the fingerprint:
  - a new generation;
  - an answer, which gives the row a new `xmin`;
  - any item insert, edit or delete, by any write path;
  - a catalogue run finishing, in whatever order runs commit;
  - the UTC day, which is what makes the picks roll over;
  - a Play Next commit that lands after midnight with shown or skipped events dated before it.
- **On a match:** return the cached body.
- **On a miss:** build it under an `asyncio.Lock` so concurrent misses build once, then store it.
- **Reach.** The route in `public.py` calls the cache. The admin store list stays uncached and live.
- **Deliberate staleness.** A "never" event deleted by the admin restore route leaves the fingerprint unchanged, so the restored game returns at the next day rollover rather than at once. That is stricter than today's accepted residual, and the docstring says so.

**Bounding the pick-event query.**
- In `public_picks_with_day`, SHOWN and SKIPPED events are bounded to the seven-day window start, since a skip matters only at or after a shown event in the window.
- NEVER events stay unbounded, because a never is permanent (refines the issue's wording).

**Tests.**
- A hit does not rebuild (spy on the loader).
- Each fingerprint input invalidates: a new generation, an answer, an item update, an item delete, a catalogue run, and a day change via the existing `clock` fixture.
- Concurrent misses build once.
- The bounded query still honours an old NEVER.

**Measure.** Time the route locally, before and after, on a realistic fixture, and put the numbers in the PR.

### PR 3 — Status colours and the item backdrop (#42)

**Status colours.**
- New `--status-backlog` and `--status-abandoned` values in both theme blocks of `index.css`:
  - backlog becomes a darker tan, around lightness 45 in dark;
  - abandoned goes cooler and darker, so it reads as "set aside";
  - finished stays the cream, and playing keeps the sage.
- The rule from CLAUDE.md, which matches WCAG 1.4.11's 3:1 minimum for non-text marks:
  - each status colour clears 3:1 against `--surface` in both themes;
  - `--status-backlog` also clears 3:1 against `--border`.
- **Measurement.** A throwaway script in the scratchpad computes the ratios with the WCAG relative-luminance formula, and the commit message records them, as the original status commit did.
- **Check.** The stacked bar, its legend and the chips, in both themes.

**Item backdrop: drop it** (decided 2026-10-06).
- Remove `.item-hero-backdrop` and its overlay (`.item-hero::after`) from `pages/Item.jsx` and `index.css`. The cover then sits on `--surface`, as in the favourites row.
- Update `Item.test.jsx` where it asserts the backdrop.
- **Visual check:** an item page at 390px and at desktop width, in both themes.

### PR 4 — The store-date backfill script (#41)

**The script.** `backend/scripts/clear_store_release_dates.py`, documented in
`backend/scripts/README.md`.
- **Selection.**
  - Take recommendation rows with status `wanted` or `owned`.
  - Join items on `(external_source, external_id)` where `items.release_date == recommendations.release_date`. The date was copied, not edited since.
  - Keep a row when its date was not a registry, day-precise date: `release_source` is not `registry`, or precision is not `day`. Discover rows qualify, since they store no `release_source`.
- **Default is a dry run:** it prints title, platform, date and source, plus a count.
- **`--apply`** sets those items' `release_date` to NULL in one transaction and prints what it changed.
- **Config.** It reads `DATABASE_URL` the way the other scripts do.
- **Tests (DB).** Each case runs through the dry run and through `--apply`:
  - a store-dated wanted item is selected and cleared;
  - a registry day-dated one is untouched;
  - an item whose date was edited after creation (dates differ) is untouched.
- **Run.** Joey runs it after merge. The README gives the two commands, and says a later "Refresh game metadata" can refill dates from IGDB.

## Key decisions

- **D1 — One spec, four PRs, by risk and kind:** cleanup, then performance, then visual, then data. Each PR can be reviewed alone and closes its issues.
- **D2 — #40's guarantees survive the route's removal.** Every picks rule is re-pinned through `/next`, and a radar test is deleted only where `/next` already has a twin. *Tradeoff:* more test churn than simply deleting them.
- **D3 — #44 caches on a data fingerprint, not a TTL.** A TTL would serve a stale batch after a generation, or reveal an answer at TTL expiry. A fingerprint changes only when the inputs do. *Tradeoff:* one aggregate query per request.
  - **Items and recommendations are fingerprinted by a row count plus a digest of every row's `(id, xmin)`, not `max(updated_at)`.** Postgres gives a row a new `xmin` on every UPDATE, whoever issues it. `max(updated_at)` misses two cases. SQL written by hand skips SQLAlchemy's `onupdate`. And `updated_at` is `now()`, the transaction's start time, so an earlier transaction that commits after a later one leaves the max unchanged. A test pins each case. The digest also needs no list of the columns the body reads.
  - **Catalogue runs:** a count of finished runs plus the latest finish. Runs are never deleted and finish once, so the count moves even when runs commit out of order.
  - **Pick events:** the day key covers events written today. The one gap is a Play Next transaction that starts before midnight and commits after it, writing shown events dated yesterday. So the fingerprint counts shown and skipped events inside the window and before midnight. Those are deleted only with their item, so the count moves only on such a late commit. NEVER is left out, which keeps the accepted restore delay.
- **D4 — Never events stay unbounded.** A never is permanent, so the window applies only to shown and skipped events.
- **D5 — #43 (b) adds a title-equality condition on top of identity.** It closes the rename case without touching how (a) and (c) behave.
- **D6 — The backdrop is dropped, not reworked.** That is the second look's "safer fit", and it is one fewer surface to keep right in both themes.
- **D7 — #41 ships as a dry-run-first script, and Joey runs it.** Destructive data work stays with the owner (decided 2026-10-06).
- **D8 — Merging.** Each PR is merged by Claude once its review is clean and CI is green (decided 2026-10-06), then the deploy is verified with the smoke test.

## Prior art and docs consulted

| Source | What it settled | Verdict |
|---|---|---|
| WCAG 2.2, SC 1.4.11 Non-text Contrast | 3:1 minimum for graphical objects | Align (PR 3) |
| CLAUDE.md, status tokens | ≥3:1 against `--surface` in both themes; backlog also against `--border`; record the ratios | Align |
| `docs/planning/2026-10-05-site-design-second-look.md`, findings 3 and 4 | Direction for the colours; drop the backdrop | Align |
| `public_outputs.public_picks_with_day` | NEVER is permanent; skips matter only after a shown event | D4 |
| `models.py`, `items.py` | `items.updated_at` has `onupdate`, and the bulk routes go through SQLAlchemy, so every route bumps it. But hand-written SQL skips it, and `now()` is the transaction's start time, so commits can land out of order. Hence the `(id, xmin)` digest for items and recommendations | D3 |
| The S9 freeze, `next_load` | An answer gives its row a new `xmin`, which the fingerprint includes, so the cache cannot hide or leak an answer differently from the uncached route | D3 |

## Open questions

None. All decisions were made 2026-10-06.

## Smoke test strategy

- `scripts/smoke.sh` runs after each deploy:
  - PR 1 removes the picks/radar checks and keeps `next`;
  - PR 2 adds nothing, but the PR reports the response time;
  - PR 3 is checked visually;
  - PR 4 has no deploy-visible change.
- Passing means every line passes and the script exits 0.
- PR 2 is also checked by timing `curl -w '%{time_total}'` twice on production; the second call should be well under the first.
- Both suites, the build, ruff, Prettier and ESLint gate every PR.
