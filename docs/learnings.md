# Learnings

### 2026-11-14 · decision · Deploy the API from GitHub Actions: migrate, then the deploy hook
Chose a `deploy.yml` (alembic upgrade on Neon, then Render's deploy hook at the merged SHA, then wait on `/api/version` and smoke) over a migration in `buildCommand` (runs on every rebuild, no gate) and over `preDeployCommand` and Render previews (paid-only). It costs nothing and a failed migration stops before any new code is live; it gives up Render's auto-deploy of the API.
PR #253 · docs/planning/2026-11-14-ephemeral-ci-migrations-design.md

### 2026-11-14 · lesson · Profile before parallelising CI
Backend pytest was 92% of the critical path, and nearly all of it was the `engine` fixture rebuilding every table for each of ~3,000 tests (0.3-0.6 s each). Building the schema once and truncating between tests halved it (14m to 7m45s locally) with no xdist. Look at `--durations` with setup included before adding workers or runners.
PR #252

### 2026-11-14 · lesson · A schema-only Neon branch has no rows and no parent
It copies tables but no rows, so `alembic_version` is empty and the rehearsal stamps the base head first (proven: `stamp_revision -> 0019`, then only the PR's revision ran). It is also a root branch: the diff action needs `base_branch: production`, and the free plan's three-root limit allows two rehearsals at once.
PR #251 · PR #254 (probe, closed)

### 2026-11-14 · lesson · `/code-review` diffs against local `main`, which is stale
In a worktree the skill reviewed already-merged PRs. Fetch, and pass the range explicitly: `origin/main...HEAD`.
PR #250

### 2026-11-14 · lesson · Agent reports say "green" before CI has run
Subagents reported "checks are green" for their local runs while GitHub showed no checks yet. Read `gh pr checks` before every merge, and make the brief say "do not claim CI is green".
PR #240 · PR #241

### 2026-11-14 · lesson · A new tag or field value can trip smoke's private-key regex
#229's comic tag group `based_on` matched `PRIVATE_KEYS` as a value and turned smoke red after an unrelated deploy. The regex now needs a trailing colon (a key); when smoke goes red, confirm the match is a key before suspecting a leak or the latest deploy.
PR #238

### 2026-11-13 · lesson · A by-hand deploy step needs a visible check
#173's deploy order said to run the sync by hand after merging; it merged 27 minutes after that night's nightly had started, nobody ran it, and the table stayed empty for a day with nothing on the Jobs page. Any job a deploy order relies on gets a Jobs row, so a run that never happened reads "No run recorded".
docs/planning/2026-11-13-comic-issue-sync-design.md

### 2026-11-13 · lesson · The API has no build signal
The Ship "live when" check cannot tell the old backend from the new one for a change with no new route; a commit field on `/api/public/status` would.
PR #218

### 2026-11-12 · decision · Admin browser tests sign in through a local-only test route
Chose a `POST /api/auth/test-login` mounted only with `E2E_TEST_LOGIN=1`, refused at config load unless `FRONTEND_URL` is localhost, over minting Starlette's cookie in Node (couples tests to the cookie format and the secret) or mocking every `/api` call (tests mocks, not the API). The admin suite runs against its own `joeyhaas_e2e` database, locally and in CI (the `e2e-admin` job, #216).
docs/planning/2026-11-12-admin-e2e-design.md

### 2026-11-12 · lesson · smoke.sh pins page titles
A rename of `/daily` and `/shelf/how` passed every unit and e2e test, but `scripts/smoke.sh` greps the live `<title>`s and would have gone red after deploy. When copy changes a page name or title, grep `scripts/smoke.sh` and `e2e/` for the old text in the same task.
docs/planning/2026-11-12-copy-pass-3b-design.md

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
Guards meant to wait for another worktree's pytest (the local test DB is shared) matched their own command line and never waited, so two runs overlapped and a preflight showed two false failures. Match the interpreter, e.g. `pgrep -f '[.]venv/bin/python.*pytest'`, or serialise runs another way. Update 2026-11-13: on macOS the venv's python runs as `Python.app`, so that pattern never matches either and two suites overlapped again; use `ps aux | grep '[p]ytest'`.
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

### 2026-11-14 · lesson · A targeted local test run misses files
A local run over a guessed name pattern skipped `test_recommendations_routes.py` and CI caught it on #229. Build the pattern from the files the diff imports, and let CI run the full suite before merging.
PR #229

### 2026-11-14 · lesson · The migration head is pinned
Adding a migration means bumping the head pin in `test_schema_check.py`; forgetting it failed CI on #225. Put the bump in the migration task of the plan.
PR #225

### 2026-11-14 · lesson · A run across midnight UTC can flake
A test date read once at import and a server clock read per request drift a day apart when CI crosses 00:00 UTC (#227). Give the code one injectable clock and freeze it in the test.
docs/planning/2026-11-14-test-flakes-design.md

### 2026-11-14 · lesson · The auto-mode classifier can refuse production job calls
A backfill fired from the browser against production was refused until Joey said "run the backfill" in so many words. Ask for that explicit go-ahead instead of retrying.
PR #229

### 2026-11-14 · lesson · Comic Vine models some trades as one-issue volumes
Mad Max TPB, Haunt of Horror and Hello Darkness "Volume One" are one-issue volumes, while Creepshow is a volume of singles with the trade as an edition. Check `count_of_issues` before assuming a series has singles.
docs/planning/2026-11-13-comics-book-design.md
