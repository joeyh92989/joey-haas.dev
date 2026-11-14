---
status: in-progress
kind: chore
mode: auto
---

# Admin browser suite in CI (#216) — design and plan

Follow-up to `2026-11-12-admin-e2e-design.md` (Scope → Out: "Running the admin suite in CI").

## Problem

`npm run e2e:admin` runs on Joey's machine only, so nothing stops a PR that breaks an admin page
(a 500 from our own API, a missing heading, a new axe violation) from merging.

## Solution

A new `e2e-admin` job in `.github/workflows/ci.yml`, mirroring the local script:

- a `postgres:18` service (same image and health options as the `backend` job);
- Python 3.12 with pip cache, `pip install -r requirements.txt -c constraints.txt` (what Render
  installs; the backend venv the suite uses needs only runtime deps);
- Node 24, `npm ci`, Chromium, the build with `VITE_DAILY_SALT=ci`;
- `npm run e2e:admin` with `E2E_BACKEND_BIN` pointing at the Python bin directory. The script
  creates `joeyhaas_e2e` with `psql` (preinstalled on ubuntu-latest) against
  `postgres:postgres@localhost:5432/template1`, which the service provides, and runs
  `alembic upgrade head`.

The backend's env is set by `playwright.admin.config.js` itself (dummy client id and secret, a
random `SESSION_SECRET`, `ADMIN_EMAIL=admin@example.com`, `FRONTEND_URL=http://localhost:4173`,
`E2E_TEST_LOGIN=1`), so the workflow sets no secrets and references none. The test-login guard
(`config.py` refuses `E2E_TEST_LOGIN=1` unless `FRONTEND_URL` is http://localhost) is unchanged and
still applies in CI. The report uploads on failure.

## Decisions (my call)

- Separate job, not an extension of `e2e`: the public e2e job stays fast and keeps its name.
- No fixture snapshot copy: the admin suite does not need dynamic shelf pages, and an empty
  `public/snapshot` matches the local run.
- `CI=true` turns on `forbidOnly` in the admin config; it has no retry setting, so none is added.
- Making `e2e-admin` a required check is a branch protection change; not done here (noted on the PR).

## Tasks

- [x] Plan doc
- [x] `e2e-admin` job in `ci.yml`
- [x] README (Browser tests → Admin suite), CLAUDE.md Commands, `docs/learnings.md` sentence
- [x] Local `npm run e2e:admin` green

## Smoke check

The `e2e-admin` job is green on the PR.
