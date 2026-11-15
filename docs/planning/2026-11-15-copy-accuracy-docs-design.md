---
status: done
kind: writing
mode: auto
---

# Copy accuracy and docs drift (#279, #280, #281, #300)

## Problem

Visitor-facing text and the README describe a past process: migrations
applied by hand, "every push deploys both", twelve stores, seven job routes,
picks recorded by the nightly, films and TMDB with no film on the shelf. The
README route table misses routes and two doc paths are wrong. Some admin
strings sit inline in pages instead of `content/`.

## Plan

- #279: correct the post and Colophon against the code (11 stores in
  `STORES`, 18 entries in `items.JOB_ROUTES`, migrations automatic on merge,
  API deploys from the Deploy API workflow, no picks step). The N64 "still to
  come" line cannot be verified, so it is dropped rather than guessed.
- #280: drop film and TMDB wording from visitor strings.
- #281: README intro, deploy and migration lines, route table, script paths;
  document `e2e-admin-db.mjs` and the fixture-snapshot test in
  `frontend/scripts/README.md`; link `docs/` files.
- #300: move the five named admin strings into `content/`.

## Out of scope

Prerender, CSS, backend, dates, naming, /now, hero buttons.
