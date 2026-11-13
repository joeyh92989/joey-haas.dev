# Learnings

### 2026-11-12 · lesson · A visual sample must include the admin shell and data-only pages
PR 6's 20-route visual diff missed the comic run box, trip pages and the admin rail; a later shot found a two-digit badge covering the phone tab-bar icon. For CSS-wide changes, add a mocked admin page (with a 2-digit badge), a comic series and a trip page to the sample, and grow badges away from their icon.
PR #214 · docs/planning/2026-11-12-tokens-components-design.md

### 2026-11-12 · lesson · CI's browser checks see a site with no data
CI builds without the snapshot, so axe passed while production's data pages (`/now` lists, shelf chips, the half star) still failed link and contrast rules; a real-data build found five more. For UI work, also run `SNAPSHOT_API_URL=https://api.joey-haas.dev VITE_DAILY_SALT=local npm run build && npx playwright test e2e/a11y.spec.js --project=desktop` before the PR.
docs/planning/2026-11-12-visible-fixes-design.md

### 2026-11-12 · lesson · Screenshots must load the page the way a visitor does
The first shots run produced two false findings: grey covers (native `loading="lazy"` images never scrolled into view) and an inactive Collection tab (static routes requested as `/shelf/`, which `NavLink end` does not match). Make lazy images eager before a full-page capture, request every page in its canonical sitemap form, and check a surprising visual finding against the code before filing it.
PR #206 · docs/planning/2026-11-12-site-review-issues.md

### 2026-11-12 · decision · Browser tests run on Playwright against the built site
Chose `@playwright/test` over Vitest browser mode and an ad hoc script: it exercises the built, prerendered `dist` (what ships), and the one setup serves both CI (smoke + axe on every PR) and design reviews (`npm run shots`).
docs/planning/2026-11-12-playwright-e2e-design.md

### 2026-11-12 · lesson · CI's format check is not lint
#175 went red on `prettier --check` (`npm run format:check`), which `npm run lint` does not run; the local preflight had only run lint, tests and build. Run `npm run format:check` in every frontend preflight and implementer gate.
PR #175 · docs/planning/2026-11-12-closet-walkthrough-plan.md

### 2026-11-12 · lesson · A `pgrep -f pytest` guard matches its own shell
Guards meant to wait for another worktree's pytest (the local test DB is shared) matched their own command line and never waited, so two runs overlapped and a preflight showed two false failures. Match the interpreter, e.g. `pgrep -f '[.]venv/bin/python.*pytest'`, or serialise runs another way.
docs/planning/2026-11-12-admin-walkthrough-plan.md

### 2026-11-12 · lesson · A client-side state guard cannot see a server-side claim
#174's photo Remove was disabled for `reading` photos in the client, but the server claims a photo as `reading` before the client hears of it, so the guard almost never fired; the whole-branch review caught it. Guard state-dependent writes on the server (lock the row, 409 on the claimed state), and treat the client check as UX only.
PR #174 · docs/planning/2026-11-12-comic-sitting-fixes-design.md

### 2026-11-12 · lesson · A new public route needs the analytics allowlist too
`/shelf/<id>/<n>/` shipped with no pattern in `backend/analytics.py`, so its views would have been dropped; only the full backend suite (`test_every_public_route_in_the_app_is_counted`) caught it, after every task review passed. Next time, list analytics, prerender, sitemap and `render.yaml` in the plan for any new public route.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-plan.md

### 2026-11-12 · lesson · Check the schema before writing interfaces into a plan
The plan typed `item_id` as an int; `items.id` is a UUID. The Task 3 implementer caught it and every later task had to be told. Read `models.py` for the keys a plan's signatures name.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-plan.md

### 2026-11-12 · lesson · Contract tests on both sides of an API can each be wrong
The neighbour strip's API dropped the current issue while the frontend's fixtures included it; both suites passed and only the whole-branch review saw it. Build frontend fixtures from the backend's response shape (or one shared fixture) for any new public body.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-design.md
