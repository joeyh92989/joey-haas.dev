# Learnings

### 2026-11-12 · lesson · CI's format check is not lint
#175 went red on `prettier --check` (`npm run format:check`), which `npm run lint` does not run; the local preflight had only run lint, tests and build. Run `npm run format:check` in every frontend preflight and implementer gate.
PR #175 · docs/planning/2026-11-12-closet-walkthrough-plan.md

### 2026-11-12 · lesson · A `pgrep -f pytest` guard matches its own shell
Guards meant to wait for another worktree's pytest (the local test DB is shared) matched their own command line and never waited, so two runs overlapped and a preflight showed two false failures. Match the interpreter, e.g. `pgrep -f '[.]venv/bin/python.*pytest'`, or serialise runs another way.
docs/planning/2026-11-12-admin-walkthrough-plan.md

### 2026-11-12 · lesson · A new public route needs the analytics allowlist too
`/shelf/<id>/<n>/` shipped with no pattern in `backend/analytics.py`, so its views would have been dropped; only the full backend suite (`test_every_public_route_in_the_app_is_counted`) caught it, after every task review passed. Next time, list analytics, prerender, sitemap and `render.yaml` in the plan for any new public route.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-plan.md

### 2026-11-12 · lesson · Check the schema before writing interfaces into a plan
The plan typed `item_id` as an int; `items.id` is a UUID. The Task 3 implementer caught it and every later task had to be told. Read `models.py` for the keys a plan's signatures name.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-plan.md

### 2026-11-12 · lesson · Contract tests on both sides of an API can each be wrong
The neighbour strip's API dropped the current issue while the frontend's fixtures included it; both suites passed and only the whole-branch review saw it. Build frontend fixtures from the backend's response shape (or one shared fixture) for any new public body.
PR #173 · docs/planning/2026-11-11-comic-issue-pages-design.md
