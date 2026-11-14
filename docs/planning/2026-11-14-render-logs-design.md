---
status: done
kind: chore
mode: auto
---

# Read Render API logs in the ship step (#235)

## Problem
The ship step's log check had no way to read Render's logs, so a deploy that
logs new errors but passes smoke would go unnoticed.

## Solution
`scripts/render-logs.sh` calls Render's `GET /v1/logs` for the API service with
`RENDER_API_KEY` from the environment, level `error`, over the last N minutes.
CLAUDE.md → Ship's Logs line names it; the README gets a section.

## Decisions (my call)
- A script, not a CLI: the Render CLI would add an install and a login; the API
  needs only curl and python3, both already required by `smoke.sh`.
- Exit codes 0 / 1 / 2 so the ship step can branch on "none / new errors /
  unreadable"; an unreadable log is a stop, not a pass.
- Service and owner IDs live in the script (identifiers, in the repo's memory
  and dashboard URLs already); the key never does.
- Render keys cannot be scoped read-only. Joey's call (2026-11-14); noted in
  the README.

## Tasks
1. Script, tested against production: 0 error entries over 24 h on 2026-11-14.
2. CLAUDE.md Ship line, README section and tree line.

Smoke check: `RENDER_API_KEY=… ./scripts/render-logs.sh 1440` exits 0 or 1,
never 2. No migration, no changelog entry.
