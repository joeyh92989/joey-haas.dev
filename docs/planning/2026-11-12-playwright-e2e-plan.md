---
status: done
kind: architectural
mode: auto
---

# Browser tests with Playwright (plan)

Design: `2026-11-12-playwright-e2e-design.md`. All paths below are under `frontend/` unless noted.
Preflight for every task: `npm run format:check && npm run lint && npm test` (learnings,
2026-11-12: format:check is not lint).

## Task 1 — Harness and route smoke

Files: `package.json`, `package-lock.json`, `playwright.config.js`, `e2e/routes.js`,
`e2e/fixtures.js`, `e2e/smoke.spec.js`, `vitest.config.js`, `/.gitignore`.

- devDependencies `@playwright/test@1.64.1`, `@axe-core/playwright@4.14.0` (exact).
- Scripts: `"e2e": "playwright test"`, `"shots": "playwright test -c playwright.shots.config.js"`.
- `playwright.config.js`: `testDir: './e2e'`, `testMatch` smoke + a11y only, projects `desktop`
  (`devices['Desktop Chrome']`) and `phone` (`devices['Pixel 5']`), `baseURL` =
  `process.env.E2E_BASE_URL ?? 'http://localhost:4173'`, `webServer` (`npm run preview -- --port
  4173 --strictPort`, `reuseExistingServer: !process.env.CI`) only when `E2E_BASE_URL` is unset,
  `retries: CI ? 1 : 0`, html reporter (open never), `forbidOnly` in CI.
- `e2e/routes.js`: `STATIC_PAGES` paths (+ `/blog`, `/til` via `BLOG_PAGE`/`TIL_PAGE` only if
  their built `dist/<path>/index.html` exists when serving locally) normalised to a trailing slash,
  plus a 404 path.
- `e2e/fixtures.js`: a `test` extended with `openRoute(path, theme)` that: adds the init script
  (`localStorage.theme`, `navigator.globalPrivacyControl = true`), aborts `**/api/track`, collects
  `pageerror` and `console` errors (filtering failed `/api/` requests and "Failed to load resource"
  for `/api/` URLs), navigates, and returns the collected errors.
- `e2e/smoke.spec.js`: per route × theme: status < 400 (404 route: the NotFound page renders),
  `h1` visible, `html[data-theme]` equals the theme, no errors, and on `phone` the document's
  `scrollWidth <= clientWidth + 1`.
- `vitest.config.js`: `exclude: [...configDefaults.exclude, 'e2e/**']`.
- `.gitignore`: `frontend/test-results/`, `frontend/playwright-report/`, `frontend/e2e-shots/`.

Acceptance: `VITE_DAILY_SALT=local npm run build && npm run e2e` runs and reports; `npm test`
still collects only Vitest files. A route that genuinely fails is a finding: keep the assertion,
mark that case `test.fail()` with a comment naming the backlog issue, never loosen the check.

## Task 2 — Axe in a real browser

Files: `e2e/a11y.spec.js`, `e2e/known-a11y.js`.

- Per route, dark and light, desktop project only: `new AxeBuilder({ page }).withTags(['wcag2a',
  'wcag2aa'])`, fail on `serious`/`critical` violations not listed in `known-a11y.js`
  (`{ route, ruleId, issue }`), message lists rule, impact, first three targets.
- Known entries start empty; existing violations found during the run are added with
  `issue: 'TBD'`, later filled with the backlog issue numbers before merge.

Acceptance: passes; removing a known entry makes it fail.

## Task 3 — Shots for reviews

Files: `playwright.shots.config.js`, `e2e/shots.spec.js`.

- Same projects and server rule; `testMatch: 'shots.spec.js'`; no retries.
- Routes: the static list, plus, when `E2E_BASE_URL` is set, one sample per dynamic kind
  (`/shelf/<id>/`, `/shelf/year/<y>/`, `/shelf/journal/<m>/`, `/blog/<slug>/`, `/til/<slug>/`,
  comic issue/edition) read from `${base}/sitemap.xml`.
- Per route × theme: wait for network idle (bounded, 15 s), full-page screenshot to
  `e2e-shots/<project>/<theme>/<route-slug>.png`. Errors are logged to
  `e2e-shots/errors.json`, never failing the run.

Acceptance: `E2E_BASE_URL=https://joey-haas.dev npm run shots` writes the PNGs and errors.json.

## Task 4 — CI and docs

Files: `/.github/workflows/ci.yml`, `/README.md`, `/CLAUDE.md`, `/docs/learnings.md`.

- New `e2e` job (Node 24, `npm ci`, `npx playwright install --with-deps chromium`, build with
  `VITE_DAILY_SALT: ci`, `npm run e2e`, upload `playwright-report/` on failure, 14-day retention).
  Same `permissions: contents: read`.
- README: "Browser tests" section after "Smoke test": what runs, commands, shots against prod,
  the beacon opt-out, known-a11y list rule, first-run `npx playwright install chromium`.
- CLAUDE.md Commands: e2e and shots lines.
- learnings: `decision` entry for the architecture choice.

Acceptance: CI green on the PR, including `e2e`.

## Ship notes

No migration, no env var, no production setting. Merge deploys nothing user-visible (frontend
build unchanged apart from dev deps). Smoke: CI `e2e` green; post-merge `./scripts/smoke.sh`.
