---
title: Profile before parallelizing CI
date: 2026-11-14
tags: [ci, pytest]
---

Backend pytest was 92% of the critical path in CI, and nearly all of it was one fixture.

Reading the slowest durations, with setup time included, showed it: the `engine` fixture rebuilt every table for each of about 3,000 tests, at 0.3 to 0.6 seconds apiece.

The fix was to build the schema once per run and truncate the tables between tests. Locally that took the suite from 14 minutes to 7 minutes 45 seconds, with no xdist and no extra runners.

Before adding workers, run `pytest --durations` with setup included and see where the time goes.
