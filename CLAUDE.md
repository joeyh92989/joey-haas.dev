# joey-haas.dev

Personal resume/portfolio website for Joey Haas. React frontend + FastAPI
backend, deployed on Render via Blueprint (render.yaml).

## Architecture

- `frontend/` — Vite + React 19 SPA, routed with react-router v8 (declarative
  mode; import from `react-router`, not `react-router-dom`). Deployed as a free
  Render static site. Public pages other than `/shelf*` and `/stats` make
  no API calls (apart from RootLayout's one `/api/auth/me` session check,
  which fails quietly to signed out, and the analytics beacon, a
  fire-and-forget `sendBeacon` to `/api/track` that nothing waits on) —
  bio and project
  content are static modules in `frontend/src/content/`, so the site
  renders fully while the free-tier backend is asleep. Home and
  Projects may read `/snapshot/items.json`, the build-time snapshot: a
  static file on the site's own origin, not an API call. Vite proxies
  `/api` to localhost:8000 for the tracker and the admin pages.
- `backend/` — FastAPI app (`main.py`), **Python 3.12** to match Render.
  macOS system Python is 3.9 and cannot install this dependency set. Deployed
  as a Render web service (free tier: spins down after ~15 min idle). Config is
  validated at import (`config.py`), so the service refuses to start when an
  env var is missing rather than running insecurely. Logging goes through
  `config.configure_logging()`, which keeps the HTTP client's loggers at
  WARNING: several source keys travel as query parameters, and at INFO the
  client writes every request URL -- key included -- to Render's logs. New personal projects
  should be added as APIRouter modules (one file per project), as `auth.py` is.
- `render.yaml` — Render Blueprint defining both services. Changing it and
  pushing updates the infrastructure.

## Commands

- Frontend dev: `cd frontend && npm run dev` (http://localhost:5173)
- Backend dev: `cd backend && source .venv/bin/activate && uvicorn main:app --reload` (http://localhost:8000)
- Frontend build check: `cd frontend && VITE_DAILY_SALT=local npm run build`
  (`vite.config.js` refuses a build without the daily game's salt)
- Frontend tests: `cd frontend && npm test`
- Browser tests: `cd frontend && VITE_DAILY_SALT=local npm run build && npm run e2e`
- Admin browser tests (local, and the `e2e-admin` CI job): `cd frontend && VITE_DAILY_SALT=local npm run build && npm run e2e:admin` (needs local Postgres and ports 8000/4173; README → Browser tests)
- Review screenshots: `cd frontend && npm run shots` (or `E2E_BASE_URL=https://joey-haas.dev npm run shots`)
- Backend tests: `cd backend && ./.venv/bin/pytest`. Every run drops and
  recreates the schema in its database, so each checkout gets its own locally
  (`joeyhaas_test_<folder>_<path hash>`, created on first run by
  `tests/testdb.py`):
  worktrees can run at once. **Two runs from the same checkout** still fail
  each other with "relation items does not exist" and deadlocks, not with real
  bugs. An explicit `TEST_DATABASE_URL` is used as given, and CI keeps its
  service container's `postgres` database
- Post-deploy smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`

## Deploying

Push to `main` on GitHub → two deploys. The static site deploys on push on
Render. **The API deploys from GitHub Actions**, not on push
(`autoDeployTrigger: "off"` in `render.yaml`): `.github/workflows/deploy.yml`
runs `alembic upgrade head` on Neon, calls the API's deploy hook at the merged
SHA, waits until `GET /api/version` reports it, then runs `scripts/smoke.sh`.
On a push it first waits for that commit's `backend` and `frontend` CI jobs
(`scripts/wait-for-ci.sh`), so a red `main` is not deployed; a manual run skips
that wait. A failed migration stops there, before any new code is live. It is gated on the
`API_DEPLOY_FROM_ACTIONS` repository variable; the workflow, its settings,
the rollback and the cutover are in `.github/workflows/README.md`. There is no
staging environment; verify `npm run build` passes and the app works locally
before pushing.

## Conventions (cross-cutting)

- Keep the site a real multi-section/multi-page website (react-router when
  pages are added), not a rendered resume document. A downloadable PDF resume
  is an optional accessory only.
- API routes live under `/api/`. CORS allows exactly `FRONTEND_URL`
  (`config.allowed_origins`, applied in `backend/main.py`), plus the Vite
  dev origin only when `FRONTEND_URL` is itself localhost; the same list
  gates foreign-origin writes (`origin_check.py`).
- `frontend/changelog.md` is the public changelog, shown on `/stats`:
  `## YYYY-MM-DD` headings, one bullet per shipped change, newest first,
  markdown links where a change has a page. **A shipped feature adds its
  entry**, written in the plan that ships it, so it is part of done.
  `lib/changelog.js` parses it (throwing on a heading that is not a real
  date, a date with no bullets or used twice, a nested bullet), and
  `scripts/prerender.mjs` runs the parser on the file during `npm run
  build`, so a bad file fails the build rather than the page; the browser
  parses it again at module load (`content/changelog.js`).
- Specs and plans live in `docs/planning/`, committed alongside the code they
  describe: `<date>-<topic>-design.md` for the spec, `<date>-<topic>-plan.md`
  for the plan. Mockups and the `.superpowers/` execution scratch stay out of
  git — the first are disposable once the UI exists, the second is process
  telemetry.
- The resume PDF lives at `frontend/public/resume.pdf` and is served unhashed at
  `/resume.pdf`. The filename is load-bearing — it is the URL pasted into job
  applications — so replace the file in place rather than renaming it. Publish
  only the scrubbed export; local working copies are not.

## Ship

- Checks: the PR's `backend` (aggregate of `backend-tests` and
  `backend-migrations`: open the red half), `frontend`, `e2e` and `e2e-admin`
  GitHub Actions jobs (`neon-rehearsal` also runs, and only does anything, on a PR that
  changes `backend/migrations/versions`)
- Merge: squash. Branch policy: **not strict** since 2026-11-17 (a PR need not
  be up to date with `main`; `backend` and `frontend` must pass on the PR).
  The safety moved to the deploy: Deploy API waits for that commit's own
  `backend` and `frontend` (`scripts/wait-for-ci.sh`), so two PRs that passed
  alone and break together on `main` are not deployed. A red `main` is a stop:
  fix it with a PR, and read the run. Several ready PRs can merge back to back
  (`./scripts/merge-train.sh <pr>…` still lands them in order). To restore
  strict: `gh api -X PATCH repos/joeyh92989/joey-haas.dev/branches/main/protection/required_status_checks -F strict=true`
- Migration: rehearse in CI: the `neon-rehearsal` job applies it to a
  schema-only Neon branch of production and comments the schema diff on the PR,
  and `cd backend && ./.venv/bin/pytest tests/test_migrations.py` runs the
  upgrade, downgrade, upgrade cycle (additive migrations only; at most two
  migration PRs can rehearse at once, a free-plan root-branch limit) · apply:
  **automatic on merge**, as the first step of the Deploy API workflow. Do not
  apply by hand first; the hand route (`scripts/migrate_neon.py`, see Debugging
  and support) is break-glass only
- Deploy: merge to `main` → the static site deploys on push; the API deploys
  from the **Deploy API** workflow run for that push (Actions tab) · live when
  that run is green: it waits for `GET /api/version` to report the merged SHA
  and smokes. A merge that changes nothing under `backend/` still deploys the
  API through the hook (Render's own filter would skip it)
- Smoke: run by the Deploy API workflow (retried once for the static site's
  clock); by hand: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
- Logs: `./scripts/render-logs.sh 30 error` (errors in the last 30 minutes; exit 0 = none, 1 = entries, 2 = unreadable). Needs `RENDER_API_KEY` in the environment; run it after smoke and treat any entry newer than the deploy as new errors. Dashboard fallback: the API service's Logs
- Rollback: **code, fast:** Actions → Deploy API → Run workflow with `commit`
  set to an earlier commit of main (317b574 or later): no migrations run, the
  hook deploys that commit, the run waits for it. Then revert the bad change
  with a PR. **The cutover itself:** set `autoDeployTrigger: commit` in
  `render.yaml` and clear `API_DEPLOY_FROM_ACTIONS`. Migrations stay (additive,
  safe ahead of the code). A schema rollback is a manual `alembic downgrade`
  after a Neon restore point (`backend/migrations/README.md`)

## Debugging and support

- **`RENDER_API_KEY`** (in Joey's shell profile, never in the repo; Render keys
  are account-wide, not read-only) unlocks the Render API from a session. A
  session started before the key was exported does not have it; in that case
  run commands through `zsh -ic '…'` so the profile is sourced, and never
  print the key or an env var's value.
  - Errors since a deploy: `./scripts/render-logs.sh 30 error` (exit 0 none,
    1 entries, 2 unreadable). Other levels: `./scripts/render-logs.sh 60 warning`.
    Read it soon after the deploy; retention was not checked.
  - Is a deploy live: `GET https://api.render.com/v1/services/<id>/deploys?limit=3`
    (`status` is `live`, `build_in_progress`, `deactivated`…). Better than
    GitHub's deploy status, which can lie (see the Blueprint note in memory).
    Service IDs: API `srv-da3u2m8ae00c73983rsg`, static site
    `srv-da3u2m8ae00c73983rt0`. A push that touches only the frontend, docs or CI
    may not redeploy the API; that is not a failure.
  - It can also read env var *names and values* of a service. Look at names
    only; any change to secrets or production settings is an always-stop.
- **Smoke red right after a deploy: check the check first.** `smoke.sh`'s
  `PRIVATE_KEYS` matches JSON *keys* only (`"word":`). It once matched the
  comic tag group's value `"based_on"` and went red though nothing leaked. If
  a new public field or tag value shares a word with that list, the match is
  on a key, not a value; confirm with
  `curl -s <api>/api/public/items | grep -oE '"(word)"[[:space:]]*:'`.
- **Jobs page is the first place to look at a nightly step**: `/admin/jobs`
  has a row per step, including the comics refresh (`catalogue_runs` source
  `comic_refresh`) and comic tags (`comic_tags`), from `GET
  /api/comics/status`. A series the tag job gave up on after three unusable
  answers (`items.tag_attempts`, migration `0019`) is counted in the tag row's
  note; saving its tags or a changed Comic Vine description resets it.
- **Applying a migration by hand (break-glass; the Deploy API workflow does it
  on merge)**: from a worktree, `scripts/migrate_neon.py` looks for
  `backend/.venv/bin/alembic` beside itself and a worktree has no `.venv`.
  Symlink the main checkout's: `ln -s <main>/backend/.venv backend/.venv`
  (untracked; gitignored), then `<main>/backend/.venv/bin/python
  scripts/migrate_neon.py current` and `upgrade`.
- **CI jobs**: `frontend`, `backend` (an aggregate job: it passes only when
  `backend-tests` and `backend-migrations` both do; keep the name `backend` on it
  alone, since branch protection requires it), `e2e` and `e2e-admin` (the admin browser
  suite against a Postgres 18 service and a real backend, test-login on a
  localhost `FRONTEND_URL`). Branch protection on `main` requires `backend` and
  `frontend` to pass on the PR, and no longer requires the branch to be up to
  date with `main` (strict off since 2026-11-17: after another PR merges, no
  update-branch or second CI run is needed). A conflict still needs a rebase. `e2e`, `e2e-admin` and `neon-rehearsal` are
  not required, so a red one does not block a merge: read them anyway.
- **Known flaky tests** (issue #244): Admin* suites in `npm test` time out under
  load (AdminLayout's focus-target test has failed on CI; it passes on a rerun
  with no frontend change). One rerun of a failed job with a named, unrelated
  flake is fine; a second failure is a real stop. The real-data a11y run
  (`SNAPSHOT_API_URL=https://api.joey-haas.dev … e2e/a11y.spec.js`) fails two
  `/now` link-in-text-block checks on production data; CI does not run it.
- **Item pages on a cold API** (`Item.jsx`): a game missing from the build
  snapshot (added since the last nightly) draws a skeleton and, after 3 s, the
  waking line; a snapshot preview shows the waking line over it. If a visitor
  reports a blank item page, check the snapshot's age first.
- **No `window.confirm`** anywhere in `frontend/src` (lint-enforced): confirm
  inline with `ConfirmDelete` / `ShelfConfirm`. Browser dialogs hang the
  Artifact and e2e environments.
- **Date-sensitive backend tests** take the server's day from
  `playthroughs.server_today()`; freeze that one function, never `date.today()`
  in two places.

## Open items

- [ ] Travel log — built and shipped dark: `/travel`, trip pages, the drawn
      map, lightbox, search and Home's Latest trip, the ingest CLI and
      `docs/travel-onboarding.md`. No trip is published yet (Croatia &
      Greece is a draft with placeholder photos), so `render.yaml` has no
      travel rules and the changelog no entry; both come with the first
      published trip. Spec and plan:
      `docs/planning/2026-11-08-travel-log-design.md`
- [ ] BGG — blocked, not skipped. Its XML API stopped serving anonymous
      requests in late 2025 and now returns 401 for everything; it needs a
      registered app and `BGG_TOKEN`. `sources/bgg.py` reports itself
      unavailable and board games import as manual rows until then
- History of shipped work lives in `git log` and `docs/planning/` (specs and plans); the
  migration list is `backend/migrations/versions/`.

## Where the detail lives

- `frontend/CLAUDE.md` — design tokens, shelf components, theming, prerender and routing rules,
  markdown collections, search, the Daily game. Loads when working under `frontend/`.
- `backend/CLAUDE.md` — the media tracker, Closet, Denver spots, comics, tags, Radar/Discover/
  Play Next, the job token and nightly order, test-login. Loads when working under `backend/`.
