# Learnings

### 2026-11-24 · decision · Piece feedback is its own table, and a lock beats it
Turning a piece down is a `garment_feedback` row (kind, optional occasion, optional day), not columns on `garments` or a one-piece `outfits` row: it holds every scope, keeps outfit rows meaning outfits, and gives the Closet page its history. A lock on a turned-down piece keeps the piece, because the lock is the newer and more explicit choice; feedback never edits a tag.
PR #657 · docs/planning/2026-11-24-closet-piece-feedback-design.md

### 2026-11-24 · lesson · The first changelog entry of a day reddens Home's visual baselines
Home's "Last shipped" date is masked in `visual.spec.js`, but the mask box takes the date's width, so "Nov 23" → "Nov 24" moved 19 pixels and failed `e2e-shard (rest)` on #636 with no visual change. A PR that opens a new `## YYYY-MM-DD` heading should expect it: run `update-visual-baselines.yml` on the branch and push an empty commit. Later PRs under the same heading pass. A fixed-width mask would end it.
PR #636 · docs/planning/2026-11-24-closet-picker-pool-design.md

### 2026-11-20 · lesson · A layered legacy sheet loses to Tailwind's theme layer, and a design colour is not a text colour
Putting `index.css` in `@layer legacy` still let Tailwind's `theme` layer replace the site's `--font-sans`, `--font-mono` and `--radius` the moment any CSS used them, so every page lost Inter until a cold review diffed computed styles against a build of `main` (#541); `tailwindSetup.test.js` now fails on a new collision. In #527 the owner's dark accent `#f7a391` is 3.49:1 as text on a card: keep it for fills and edges, and add `--accent-text`, `--ok-text` and `--warn-text` for text. Check a "no visible change" PR by comparing computed styles, not only tests, and measure a colour in the role it will play.
PRs #541, #542 · docs/planning/2026-11-20-design-system-foundation-design.md · docs/planning/2026-11-20-design-system-tokens-design.md

### 2026-11-20 · decision · Places and outings: built, parked, then removed
Epic #339 shipped stories #340 to #351 (12 PRs) with 0 spots and 0 visits in production, and was parked when the plan moved to international trips; the code was removed from main (restore tag `places-outings-2026-11-20`). Two lessons stayed with the code: Nominatim got its own client name with no email address (a new external service gets its own, not the shared one), and the issue's claim that the new kind needed no migration or page was wrong, because sittings store an area and the Add page drew only shelf and closet (before a story says that, check where `area` and `kinds_for` are used). The rest is in the retrospective.
Epic #339 · PR #443 · docs/planning/2026-11-20-places-outings-retrospective.md · docs/planning/2026-11-17-place-kind-intake-design.md

### 2026-11-18 · lesson · A cap or filter tuned on typical input breaks the real long tail
#342 capped a pasted line at 300 characters, but real Google Maps place URLs run 200 to 900 characters, so the main use case was unreadable until the final review; and a sanitiser that dropped every control character glued the words around a newline. Test limits and cleaners with real-shaped long-tail input (a 700-character map URL, a blurb with a newline), and map whitespace to a space before dropping the rest.
Story #342 · docs/planning/2026-11-18-places-paste-way-design.md

### 2026-11-18 · lesson · A guard test must be shown failing with the guard removed
The add bar's double-Save test clicked twice with `fireEvent`, but the Save button is disabled by state and React flushes inside `fireEvent`, so the second click never reached the handler and the test passed with the in-flight ref deleted. Remove the guard and watch the test fail before trusting it; reach the handler twice in one `act`.
Story #341 · docs/planning/2026-11-17-spots-add-bar-design.md

### 2026-11-18 · lesson · A column drop is two releases: unmap, then drop
Deploy API runs the migration before the new code is live, so dropping a column the running code still maps makes every query on that table 500 until the new build is up (a cold review caught it on #453). Merge the PR that unmaps it first (it also needs `_diff_against_models` to ignore the column, or every earlier-revision test sees a `remove_column`), then the drop.
PR #453 · docs/planning/2026-11-18-retire-items-editions-design.md

### 2026-11-18 · lesson · A test that mixes recorded or frozen dates with the real clock fails on a date
`test_refresh_upserts_the_hours_and_records_the_run` read a forecast recorded 9 to 15 November while the job drops hours older than two days, so at 06:00 UTC on 18 November it went red on every PR at once (#443 had passed twenty minutes earlier on the same code). A test date read once at import and a server clock read per request drift a day apart when CI crosses 00:00 UTC (#227). Give the code one injectable clock, freeze it inside the recording's window, check the date arithmetic of any new fixture-based test, and read a red check's own assertion before blaming the branch.
PR #443 · PR #227 · docs/planning/2026-11-14-test-flakes-design.md

### 2026-11-18 · lesson · A cold read of every PR that writes data, fetches a user-supplied address or races a second writer found a real bug in most
The comics book-first epic (#323, PRs #428 to #442) ran a read-only reviewer that had not seen the author's report and found a bug in seven of ten: a shim that resurrected a deleted volume (#433, HIGH), a model answer that could auto-link `#1-9999`, a 500 from an unchunked insert, a public twin that disagreed on one figure (#442). PRs #409, #413 and #415 each had one too: a client could plant the address the server later fetches, two SKU-less products shared an id, a photo added while a link resolved was overwritten and concurrent writes returned a 500; the SSRF guard itself held. Four authors wrote code before the failing test (the #415 race tests were never shown failing on the old code); the cure was a brief that says "see it fail, name the test". Skip the cold review for pure UI.
PRs #428 to #442 · PRs #409 #413 #415 · docs/planning/2026-11-17-comics-book-first-design.md

### 2026-11-18 · lesson · Briefs for implementer agents name every CI gate and whole-repo pin
#372 failed Lint (`process` not imported in a test) after the agent ran format, tests and build but not `npm run lint`; #175 went red on `prettier --check`, which lint does not run; #346 went red on `test_recs_response_models.py` (it pins the count of `/api/spots*` routes) and on `prettier --check` for `index.css`, because implementers ran only targeted tests. Name each step of the CI job in the brief (lint, `npm run format:check`, build, audit, ruff, pip-audit) and have the agent grep the tests for a pinned route count before the first push; "run the checks" is not enough.
PR #372 · PR #175 · PR #460 · docs/planning/2026-11-12-closet-walkthrough-plan.md · docs/planning/2026-11-18-log-outing-design.md

### 2026-11-17 · lesson · A data-copying migration must be tested against odd values, and the rehearsal cannot do it
0021's backfill passed CI and `neon-rehearsal` and failed on production: `WHERE jsonb_typeof(editions) = 'array' AND jsonb_array_length(editions) > 0` ran `jsonb_array_length` on a scalar (Postgres does not order AND), and a JSON-string value then broke `json.loads`. The rehearsal branch is schema-only, so it has no rows, and the tests only seeded arrays. The transaction rolled back, so production stayed at 0020. For a migration that reads existing JSONB: select plainly, filter in Python, and seed a scalar, a string, `null`, an object and an empty list in the test.
PR #428 · fix PR for 0021

### 2026-11-17 · decision · The frontend audit gate covers shipped dependencies only, until picomatch is patched
A PR that touched no frontend file went red on `npm audit --audit-level=high`: a new picomatch ReDoS advisory (GHSA-fc5q-39xc-vjpf) lists every version as affected, so `npm audit fix` cleared only four moderate findings and `--force` offered a vitest downgrade, which is no fix. picomatch comes in through vite, vitest and eslint only. Chose `--omit=dev` in the CI step (Joey's call) over suppressing one advisory through a wrapper script and over leaving every PR blocked. The cost: advisories in dev tooling no longer fail a PR. Revert to the full audit once a patched picomatch exists.
PR #428

### 2026-11-17 · lesson · The prerender reads comic-issues.json, not comics.json
Link-preview heads for a title come from `items.json` and `comic-issues.json` (`prerender-lib.mjs`); `comics.json` is only the shelf's. A field the preview needs (the title `kind`, #330) goes on the `comic-issues` index row, or the build never sees it.
PR #330

### 2026-11-17 · decision · `strict` is off; the deploy waits for that commit's CI instead
Epic #392 merged serially under `strict` (seven PRs, 80 minutes; CI is 5 to 7 minutes a run, and idle gaps cost as much as the re-runs), and stacks do not remove the per-PR CI or the `strict` cycle. Dropped `strict` (Joey's call) after shipping `wait-for-ci` (#419): Deploy API waits for `backend` and `frontend` on the pushed commit, so a combination no CI saw cannot deploy; the cost is about 5 minutes before each deploy and a red `main` blocks deploys until fixed. A required aggregate check (`backend`) appears late, so a guard must wait for it, not time out (#418); a baseline-update commit pushed by `GITHUB_TOKEN` starts no CI (push an empty commit). `scripts/merge-train.sh` lands PRs in order. Restore: `required_status_checks` `strict=true`.
Epic #392 · PRs #414 #416 #418 #419 · docs/planning/2026-11-16-deploy-gate-design.md · docs/planning/2026-11-16-closet-products-design.md

### 2026-11-17 · lesson · A test fake must copy the server, on both sides of an API
A page's fake API must delete what the server deletes: the places page kept a sitting id after the commit that deleted the sitting, so "Add another" would 404 on the second place while the mocked tests passed, and the task review caught it only by reading the real commit code (#443). The neighbour strip's API dropped the current issue while the frontend's fixtures included it, and both suites passed (#173). Build frontend fixtures from the backend's response shape and lifecycle (deletes, 404s, 409s), or one shared fixture, and have reviewers compare the page's calls with the real routes.
PR #443 · PR #173 · docs/planning/2026-11-11-comic-issue-pages-design.md

### 2026-11-16 · lesson · Check the data and the live screen yourself before telling Joey how to use a feature
The #396 agent never opened the real seed file, so I parsed it with the new parser before the upload (63 rows, 0 problems, only two colour names left for Check). I also told Joey a photo could be replaced from the garment page; the page only showed the photo, so #399 grew an add-or-replace control. Run the parser on the real file in a scratch process and open the live page before writing steps for Joey, and keep the file itself out of the repo (it is purchase history).
PR #409 · PR #415

### 2026-11-16 · lesson · A branch-guard hook blocks `git push origin HEAD`; agents need the refspec in the brief
Several agents' first push was refused; they recovered with `git push origin HEAD:<branch>`. Put the explicit refspec in every implementer brief, as `agents.md` already says for pushes.
PR #405

### 2026-11-16 · lesson · A proof run on a stale install proves nothing
The 10-run acceptance for #244 first failed 10 of 10 with the same "1 file failed, 2787 tests passed": `og-card.test.mjs` could not resolve `opentype.js`, which the main checkout's `node_modules` predated. CI runs `npm ci`, so it never saw it. Before any N-run acceptance, `npm ci`, and read the failing file's name, not only the exit code. The same holds for a stale `dist`: a phone-overflow browser case passed locally against an old build and failed on CI; rebuild (`npm run build`) before every `e2e` run, and measure with real-shaped long data.
PR #378

### 2026-11-16 · lesson · Count with the real tool before sizing a follow-up
#300 said about 29 inline admin strings and #301 about 108 routes without a `response_model`. A scan over the code found 237 strings and about 99 routes (decorators sit indented inside router factories, so the first grep found none). Both were split into batches after counting. Size from a real scan, and write the scan so it can stay as a ratchet (`adminCopyScan.test.js`).
PR #372

### 2026-11-15 · lesson · A deploy hook for the wrong service answers 2xx, and Render skips the API for commits outside backend/
`RENDER_API_DEPLOY_HOOK_URL` held the static site's hook, so a dry run "succeeded" while the API never rebuilt (`deploy.yml` now checks the URL names the API's service id). The API has `rootDir: backend`, so a merge touching only `.github/` or docs deploys nothing by itself; a hook with `ref` always deploys the commit it names. Prove a deploy by the live commit changing (`GET /api/version`), smoke and `render-logs.sh`, never by the hook's status or the run's colour. A GitHub push event can start main's CI a few minutes late, so a slow deploy is not a stuck one, and `timeout` does not exist on this Mac, so `timeout 480 gh run watch` returns at once (poll in a `sleep` loop).
PR #256 · run 43672179895 · PRs #428 to #442

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

### 2026-11-14 · lesson · A targeted local run misses files, and the migration head is pinned
A local run over a guessed name pattern skipped `test_recommendations_routes.py` (#229); adding a migration means bumping the head pin in `test_schema_check.py`, and forgetting it failed CI on #225 and again on #443 (the plan's migration task never named the file, and no targeted run included it). Name `test_schema_check.py` in the migration task's brief and run it; build local test lists from the files a diff imports, and let CI run the full suite before merging.
PR #229 · PR #225 · PR #443

### 2026-11-14 · lesson · The auto-mode classifier can refuse production job calls
A backfill fired from the browser against production was refused until Joey said "run the backfill" in so many words. Ask for that explicit go-ahead instead of retrying.
PR #229

### 2026-11-14 · lesson · Comic Vine models some trades as one-issue volumes
Mad Max TPB, Haunt of Horror and Hello Darkness "Volume One" are one-issue volumes, while Creepshow is a volume of singles with the trade as an edition. Check `count_of_issues` before assuming a series has singles.
docs/planning/2026-11-13-comics-book-design.md

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

### 2026-11-12 · lesson · A client-side state guard cannot see a server-side claim
#174's photo Remove was disabled for `reading` photos in the client, but the server claims a photo as `reading` before the client hears of it, so the guard almost never fired; the whole-branch review caught it. Guard state-dependent writes on the server (lock the row, 409 on the claimed state), and treat the client check as UX only.
PR #174 · docs/planning/2026-11-12-comic-sitting-fixes-design.md

### 2026-11-12 · lesson · A new public route needs the analytics allowlist too
`/shelf/<id>/<n>/` shipped with no pattern in `backend/analytics.py`, so its views would have been dropped; only the full backend suite (`test_every_public_route_in_the_app_is_counted`) caught it, after every task review passed. Next time, list analytics, prerender, sitemap and `render.yaml` in the plan for any new public route.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-plan.md

### 2026-11-25 · lesson · /security-review reads the checkout, not the branch
The built-in `/security-review` diffs the current checkout against its upstream, so run from the main checkout it reviewed an empty diff while the work sat in a worktree. Point an Opus security reviewer at the branch diff (`git diff origin/main...<branch>`) instead.
PR #657 · docs/planning/2026-11-24-closet-piece-feedback-design.md

### 2026-11-25 · lesson · A test workaround can hide the bug it works around
#549's implementer gave a test a budget of one to stop a piece being asked twice; the second ask was the bug (three strikes in one night). When a subagent bends a test around a behaviour, check that behaviour before accepting the test. Fixed with a per-run `sent` set.
PR #655 · docs/planning/2026-11-24-closet-fill-blanks-design.md
