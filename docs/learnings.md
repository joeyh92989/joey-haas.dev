# Learnings

### 2026-11-18 · lesson · A guard test must be shown failing with the guard removed
The add bar's double-Save test clicked twice with `fireEvent`, but the Save button is disabled by state and React flushes inside `fireEvent`, so the second click never reached the handler and the test passed with the in-flight ref deleted. Remove the guard and watch the test fail before trusting it; reach the handler twice in one `act`.
Story #341 · docs/planning/2026-11-17-spots-add-bar-design.md

### 2026-11-18 · lesson · A recorded fixture run against the real clock is a time bomb
`test_refresh_upserts_the_hours_and_records_the_run` read a forecast recorded 9 to 15 November while the job drops hours older than two days, so at 06:00 UTC on 18 November it went red on every PR at once (#443 had passed twenty minutes earlier on the same code). A test that feeds recorded dated data to code that reads `datetime.now` freezes that clock inside the recording; check the date arithmetic of any new fixture-based test, and read a red check's own assertion before blaming the branch.
PR #443

### 2026-11-17 · decision · Nominatim gets its own client name, with no email address
The catalogue's `USER_AGENT` carries the owner's email, which Overpass and the store hosts already receive. Joey chose a separate `NOMINATIM_USER_AGENT` (app name and site URL) over reusing it; a test asserts no `@` in the header. A new external service gets its own client name, not the shared one.
PR #443 · docs/planning/2026-11-17-place-kind-intake-design.md

### 2026-11-17 · decision · Places are their own intake area, with a search hook on the kind
Registering `place` under shelf would have run Nominatim on every shelf search and counted places as shelf work, so `IntakeArea` gained `places` (migration 0024, additive) and `Kind` an optional `search` for kinds with no metadata source. The commit takes an advisory lock and re-validates the entry, because `spots` has no unique constraint on `source_id`.
PR #443 · docs/planning/2026-11-17-place-kind-intake-design.md

### 2026-11-17 · lesson · Read the registry and the area code before writing "appears with no new page"
Issue #340 said the new kind would show on `/admin/add` with no new page; the first implementer's read of the code found sittings store an area (a Postgres enum) and the Add page draws only shelf and closet, so the story grew a migration and a page and was re-planned mid-flight. Before a story claims a kind needs no migration or page, check where `area` and `kinds_for` are used.
PR #443

### 2026-11-17 · lesson · A test fake must delete what the server deletes
The places page kept a sitting id after the commit that deleted the sitting, so "Add another" would 404 on the second place; the mocked tests passed because the fake kept the sitting alive. The task review caught it only by reading the real commit code. Build a page's fake API from the server's lifecycle (deletes, 404s, 409s), and have reviewers compare the page's calls with the real routes.
PR #443

### 2026-11-18 · lesson · A cold read of every PR that wrote data or a public body found a real bug in seven of ten
The comics book-first epic (#323, PRs #428 to #442) ran one implementer at a time with a read-only reviewer that had not seen the author's report. It found: a shim that resurrected a deleted volume (#433, HIGH), a model answer that could auto-link `#1-9999` and mark thousands of issues owned (#435), a 500 from an unchunked insert, an owned unmatched book still creating a title (#436), and a public-facing twin that disagreed on one figure (#442). Four authors wrote code before the failing test; the cure was making the brief say "see it fail, name the test". Also: `timeout` does not exist on this Mac, so a `timeout 480 gh run watch` returns at once and looks like a stuck deploy (poll a loop with `sleep` instead); a GitHub push event can start main's CI a few minutes late, so a slow deploy is not a stuck one; check each deploy by `GET /api/version`, smoke and `render-logs.sh`, not by the run's colour alone.
PRs #428 to #442 · docs/planning/2026-11-17-comics-book-first-design.md

### 2026-11-17 · lesson · A data-copying migration must be tested against odd values, and the rehearsal cannot do it
0021's backfill passed CI and `neon-rehearsal` and failed on production: `WHERE jsonb_typeof(editions) = 'array' AND jsonb_array_length(editions) > 0` ran `jsonb_array_length` on a scalar (Postgres does not order AND), and a JSON-string value then broke `json.loads`. The rehearsal branch is schema-only, so it has no rows, and the tests only seeded arrays. The transaction rolled back, so production stayed at 0020. For a migration that reads existing JSONB: select plainly, filter in Python, and seed a scalar, a string, `null`, an object and an empty list in the test.
PR #428 · fix PR for 0021

### 2026-11-17 · decision · The frontend audit gate covers shipped dependencies only, until picomatch is patched
A PR that touched no frontend file went red on `npm audit --audit-level=high`: a new picomatch ReDoS advisory (GHSA-fc5q-39xc-vjpf) lists every version as affected, so `npm audit fix` cleared only four moderate findings and `--force` offered a vitest downgrade, which is no fix. picomatch comes in through vite, vitest and eslint only. Chose `--omit=dev` in the CI step (Joey's call) over suppressing one advisory through a wrapper script and over leaving every PR blocked. The cost: advisories in dev tooling no longer fail a PR. Revert to the full audit once a patched picomatch exists.
PR #428

### 2026-11-17 · decision · `strict` is off; the deploy waits for that commit's CI instead
Epic merges were serial because `strict` re-ran CI on every PR behind `main` (#418 needed two full cycles after another PR merged under it). Dropped it (Joey's call) after shipping `wait-for-ci` (#419): Deploy API waits for `backend` and `frontend` on the pushed commit, so a combination no CI saw cannot deploy; the cost is about 5 minutes before each deploy starts, and a red `main` blocks deploys until fixed. A required check that is an aggregate job (`backend`) appears late, so a guard must wait for it, not time it out (#418). Restore: `required_status_checks` `strict=true`.
PRs #414 #416 #418 #419 · docs/planning/2026-11-16-deploy-gate-design.md

### 2026-11-16 · lesson · Merging an epic is serial under `strict`; stacks do not fix that, a train and a faster `backend` do
Epic #392 (seven PRs, 80 minutes): `main` requires `backend` and `frontend` and an up-to-date branch (`strict`), so each merge put the rest behind it. CI is 5 to 7 minutes a run (`backend` 4.5 to 6.7, `frontend` 2 to 3.5; `e2e`, `e2e-admin` under 2.5, not required), not the 10 first written here. An `update-branch` re-ran 6 of 7 PRs; five merged about 7 minutes apart, one CI cycle each, and idle gaps (#404 about 22 minutes behind `main`, #410 9 minutes green before a merge) cost as much as the re-runs.
Stacks do not remove per-PR CI or the `strict` cycle (docs: squash supported, CI runs on every PR in a stack, same repo only; plan availability not stated in GitHub's docs); they help real chains (#398 on #409). A merge queue is likely unavailable on a user-owned repo (third-party reports; GitHub's docs pages do not say; check Settings, Rules, New ruleset). Doing: `scripts/merge-train.sh` (no idle gaps) and a `backend` profile (pytest is 328 s of a 6-minute job). Not done: dropping `strict` (risk: two green PRs break main together, and `deploy.yml` does not wait for CI). The merge-order rule lives in `agents.md` and the repo `CLAUDE.md`, not in `sdlc-execution` or `sdlc-ship`.
Epic #392 · docs/planning/2026-11-16-closet-products-design.md

### 2026-11-16 · lesson · A cold review of every PR that fetches a user-supplied address found a real bug each time
#409 (seed file), #413 (link way in) and #415 (attach a product) each got a read-only reviewer that had not seen the author's report. All three found something the author's local gates passed: a client could plant the address the server later fetches (#409); two products with no SKU shared an id and the second was silently dropped as already owned, and a stale photo attached after a colour change (#413); a photo added while a link resolved was overwritten, and concurrent writes returned a 500 (#415). The SSRF guard itself held each time. Every fix went back to the author with a failing test first, except that the #415 race tests were written after the code and not shown failing on the old code. Keep the cold review for PRs that fetch, write on an address the client chose, or race a second writer; skip it for pure UI.
PR #409 · PR #413 · PR #415

### 2026-11-16 · lesson · Check the data and the live screen yourself before telling Joey how to use a feature
The #396 agent never opened the real seed file, so I parsed it with the new parser before the upload (63 rows, 0 problems, only two colour names left for Check). I also told Joey a photo could be replaced from the garment page; the page only showed the photo, so #399 grew an add-or-replace control. Run the parser on the real file in a scratch process and open the live page before writing steps for Joey, and keep the file itself out of the repo (it is purchase history).
PR #409 · PR #415

### 2026-11-16 · lesson · A branch-guard hook blocks `git push origin HEAD`; agents need the refspec in the brief
Several agents' first push was refused; they recovered with `git push origin HEAD:<branch>`. Put the explicit refspec in every implementer brief, as `agents.md` already says for pushes.
PR #405

### 2026-11-16 · lesson · A proof run on a stale install proves nothing
The 10-run acceptance for #244 first failed 10 of 10 with the same "1 file failed, 2787 tests passed": `og-card.test.mjs` could not resolve `opentype.js`, which the main checkout's `node_modules` predated. CI runs `npm ci`, so it never saw it. Before any N-run acceptance, `npm ci`, and read the failing file's name, not only the exit code.
PR #378

### 2026-11-16 · lesson · Briefs for implementer agents list every CI gate
#372 failed the frontend job on Lint (`process` not imported in a test) after the agent ran format, tests and build but not `npm run lint`. Every later brief named each step of the CI job to run locally (lint, format, build, audit, ruff, pip-audit), and none of those PRs failed on a gate. Name the gates in the brief; "run the checks" is not enough.
PR #372

### 2026-11-16 · lesson · Count with the real tool before sizing a follow-up
#300 said about 29 inline admin strings and #301 about 108 routes without a `response_model`. A scan over the code found 237 strings and about 99 routes (decorators sit indented inside router factories, so the first grep found none). Both were split into batches after counting. Size from a real scan, and write the scan so it can stay as a ratchet (`adminCopyScan.test.js`).
PR #372

### 2026-11-16 · lesson · Branch protection requires backend and frontend, and an up-to-date branch
CLAUDE.md said no check was required, and a merge of #368 was refused as BEHIND after #367 merged. `main` requires `backend` and `frontend` with `strict: true`: after each merge, `gh pr update-branch` the next PR, wait for CI, merge, one at a time. A baseline-update commit pushed by `GITHUB_TOKEN` starts no CI; push an empty commit after it.
PR #378

### 2026-11-15 · lesson · A focus test in AdminLayout flaked on CI
`AdminLayout.test.jsx > offers sign-in again after a sign-out the server confirmed` failed with `expected <body> to be <main id="main">` on a PR that only changed `render.yaml` (run 43726434998) and passed on a rerun of the same commit. A third flaky test after #237's two: a focus assertion racing the runner. One rerun confirmed it; if it recurs, freeze the timing it waits on like #237 did, not retry.
PR #258

### 2026-11-15 · lesson · A deploy hook for the wrong service answers 2xx
`RENDER_API_DEPLOY_HOOK_URL` held the static site's hook, so a dry run "succeeded" while the API never rebuilt; only Render's deploy list for each service showed it. `deploy.yml` now checks the URL names the API's service id. Prove a deploy by the live commit changing (`GET /api/version`), never by the hook's status code.
PR #256 · run 43672179895

### 2026-11-15 · lesson · Render skips the API for commits outside backend/
The API service has `rootDir: backend`, so a merge that touches only `.github/` or docs deploys nothing, and live can differ from main's tip. A hook with `ref` always deploys the commit it names.
PR #256

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

### 2026-11-12 · lesson · Contract tests on both sides of an API can each be wrong
The neighbour strip's API dropped the current issue while the frontend's fixtures included it; both suites passed and only the whole-branch review saw it. Build frontend fixtures from the backend's response shape (or one shared fixture) for any new public body.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-design.md

### 2026-11-14 · lesson · A targeted local run misses files, and the migration head is pinned
A local run over a guessed name pattern skipped `test_recommendations_routes.py` (#229); adding a migration means bumping the head pin in `test_schema_check.py`, and forgetting it failed CI on #225 and again on #443 (the plan's migration task never named the file, and no targeted run included it). Name `test_schema_check.py` in the migration task's brief and run it; build local test lists from the files a diff imports, and let CI run the full suite before merging.
PR #229 · PR #225 · PR #443

### 2026-11-14 · lesson · A run across midnight UTC can flake
A test date read once at import and a server clock read per request drift a day apart when CI crosses 00:00 UTC (#227). Give the code one injectable clock and freeze it in the test.
docs/planning/2026-11-14-test-flakes-design.md

### 2026-11-14 · lesson · The auto-mode classifier can refuse production job calls
A backfill fired from the browser against production was refused until Joey said "run the backfill" in so many words. Ask for that explicit go-ahead instead of retrying.
PR #229

### 2026-11-14 · lesson · Comic Vine models some trades as one-issue volumes
Mad Max TPB, Haunt of Horror and Hello Darkness "Volume One" are one-issue volumes, while Creepshow is a volume of singles with the trade as an edition. Check `count_of_issues` before assuming a series has singles.
docs/planning/2026-11-13-comics-book-design.md

### 2026-11-17 · lesson · The prerender reads comic-issues.json, not comics.json
Link-preview heads for a title come from `items.json` and `comic-issues.json` (`prerender-lib.mjs`); `comics.json` is only the shelf's. A field the preview needs (the title `kind`, #330) goes on the `comic-issues` index row, or the build never sees it.
PR #330
