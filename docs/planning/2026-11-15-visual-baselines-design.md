# Visual baselines (#217)

Status: in progress · Kind: chore (test infrastructure) · Mode: auto

## Goal

`toHaveScreenshot` baselines for the public pages and one page per dynamic
kind, so a layout regression (such as the spacing snap in #213) shows as a
pixel diff in CI.

## Decisions

- **Baselines come from the CI runner only.** Font hinting and Chromium's
  Linux build differ from macOS, so a PNG made on a Mac never matches. The
  snapshot path has no platform suffix: there is exactly one set, from
  ubuntu.
- **Separate config and spec** (`playwright.visual.config.js`,
  `e2e/visual.spec.js`, `npm run e2e:visual`). The main config's `testMatch`
  is an explicit list, so `npm run e2e` never sees it.
- **Set:** home, about, projects, one post, shelf games, one item, one comic
  series, 404, daily; each in dark and light at 393 (Pixel 5) and 1280
  wide = 36 PNGs. Source is the fixture snapshot in `e2e/fixtures/`.
- **Determinism:** `page.clock.setFixedTime` (the Daily number, footer
  year), reduced motion, `animations: 'disabled'`, `caret: 'hide'`,
  `document.fonts.ready`, lazy images made eager, API blocked. No tolerance
  at first (`maxDiffPixels: 0`); loosen only on evidence of runner noise.
- **Updating:** a `workflow_dispatch` workflow (`update-visual-baselines.yml`)
  runs the spec with `--update-snapshots` on ubuntu, uploads the PNGs as an
  artifact and commits them to the dispatched branch (never `main`). The
  workflow alone has `contents: write`. A commit made with `GITHUB_TOKEN`
  does not start CI, so push an empty commit or re-run to get the compare.
- **Compare:** the `e2e` job runs `npm run e2e:visual` after the normal run.
- Out of scope: the admin suite.
