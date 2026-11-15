---
status: in-progress
kind: bug
mode: auto
---

# Admin unit tests under load (#244)

## Problem

Admin* suites fail when the machine is busy (CI, or backend pytest running
beside `npm test`): a different set each run, all passing alone.

Two timing dependencies, found by reading the failing tests:

1. **Library waits tuned for an idle machine.** Testing Library's `findBy*` and
   `waitFor` give up after 1 s, and Vitest after 5 s a test. The admin pages are
   lazy-loaded, and the tests chain several `userEvent` calls (each yields to the
   event loop), so on a loaded machine the same work takes several times longer.
2. **A focus assertion that races the effect.** AdminLayout's sign-out test
   waits for the sign-in text, then reads `document.activeElement` at once. The
   text is in the DOM after the commit, but `mainRef.current.focus()` runs in
   the passive effect that follows, which the load can delay past the read.

## Change

- `src/test-setup.js` (new, `setupFiles`): `asyncUtilTimeout` 10 s. A wait still
  returns the moment its condition holds, so a passing test is no slower; only a
  test that would have failed waits longer. Raising a wait ceiling is the honest
  fix for (1): the work is real and finishes, it is only the ceiling that was
  tuned to an idle machine.
- `vitest.config.js`: `testTimeout` 30 s for the same reason.
- AdminLayout focus test: `waitFor` the focus instead of reading it once. This
  removes the race in (2) rather than hiding it behind a longer wait.

## Verification

Full `npm test` repeatedly, including while other worktrees' suites and pytest
ran (machine load average above 400 during the first run).

## Result

Same machine, same time, load average 450 to 900 (several worktrees running
suites at once): before, 35 tests in 29 files failed (1 s waits, 5 s tests);
after, 9 failed in 7 files, and 6 of those hit even the 30 s ceiling because
files took 500 s of wall time each. The remaining failures are CPU starvation
at roughly 100 times oversubscription, not timing races, and 17 worker-start
errors came from Vitest's own pool. The acceptance run (10 consecutive passes
beside pytest) was not reachable on that machine and needs a quiet one or CI.
