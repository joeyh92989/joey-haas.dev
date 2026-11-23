---
status: planned
kind: chore (CI speed)
mode: auto
issue: "#603 (epic #601)"
---

# Speed up the focus-ring helpers without dropping a case

Spec: `docs/planning/2026-11-23-ci-speed-design.md`.

## Problem

`focus rings paint…` tests are 74% of browser test time (184 tests, 3,027 test-seconds; single tests 25 to 78 s). Three near-copies of the Tab-and-measure helper exist: `closet-ring.js` (`unringed`, used by `admin-closet`, `admin-add`, `admin-home`), `denver-site-ring.js` (`tabRings`, full pixel check on every control; used by `admin-denver-site`, `admin-home`) and `admin-data-ring.js` (`tabRings`, pixel check once per distinct "look"; used by `admin-data`).

Reading them, the per-control cost has fixed sleeps in it: `tabRings` does two `waitForTimeout(200)` per control (focused, then blurred) and `unringed` two `waitForTimeout(150)`, plus up to eight `page.screenshot` band reads per control. At about 180 controls on a page that is 60 to 70 s of pure waiting in a 72 s test. That is the first hypothesis to check by measuring, not assume.

## Scope

In: `frontend/e2e/*-ring.js`, the specs' imports, `frontend/README.md` (Browser tests). Out: the test titles (the CI shard split keys on the text `focus rings paint`), `ci.yml`, how many cases exist, any reduction of the width × theme matrix (that is #609, `needs-joey`).

## My calls

1. One module, `frontend/e2e/focus-ring.js`, holds the shared pieces (bands, inspect, settle). It exports `unringed`, `tabRings` and `tabRingsByLook` with the **same semantics each has today**; the three old files go away and callers import from the new one. The look-deduplication stays only where it already is (`admin-data`). Extending it to the other specs would skip pixel reads and is a coverage change: not done here; reported as an option.
2. Replace each fixed sleep with a settle that waits for what the sleep was waiting for: the control's CSS transitions and any scroll to finish (`document.getAnimations()` finished, then two animation frames), with a cap equal to the old sleep so it can never wait longer than today. A ring that is still transitioning when read is the reason the sleep exists, so the settle is keyed on animations, not a shorter guess.
3. Measure first, with the same single test before and after, locally.

## Tasks

Model: Sonnet.

1. **Baseline.** `cd frontend && npm ci && mkdir -p public/snapshot && cp e2e/fixtures/snapshot/*.json public/snapshot/ && VITE_DAILY_SALT=local npm run build`, then `npx playwright test admin-add.spec.js --project=desktop --grep "focus rings paint on every control of discover at 390px, light"` (and one `admin-closet` ring test via `npm run e2e:admin` only if Postgres is available locally; otherwise say so). Record wall time, number of controls, and time per control. Check `uptime` first; one Playwright run at a time.
2. **Module merge** per call 1. Acceptance: `grep -rn "waitForTimeout" frontend/e2e/focus-ring.js` shows none or only a capped settle; the old three files are deleted; every import is updated; `npm run lint` and `npm run format:check` pass in `frontend/`; `npx playwright test --list` shows the same test count for both configs as on `origin/main` (compare the numbers).
3. **Settle instead of sleep** per call 2. Acceptance: the same single test passes, and its wall time before and after is reported.
4. **Mutation check.** Prove the tests still catch a missing ring: in the local build only (not committed), add `*:focus-visible{outline:none !important;box-shadow:none !important}` to the built CSS in `dist`, run the same test, expect it to fail with unringed sides; then rebuild.
5. **Docs.** `frontend/README.md` Browser tests: one paragraph on the shared helper and the settle. No changelog entry.

## Risks

- A settle that returns early reads a ring mid-transition: flaky. Mitigation: three local runs of the test, and three CI runs on the PR (rerun).
- Title text changes shift the CI shards: titles are not touched.

## Ship notes

CI-only. No migration. The PR's own CI is the proof: read the shard times against the table in the design doc (add-1 6 min, add-2 2.8 min, add-3 4.1 min, cd-3 7.9 min, rest 7.5 min in run 45232887718) and report each.
