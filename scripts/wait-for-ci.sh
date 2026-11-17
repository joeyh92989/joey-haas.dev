#!/usr/bin/env bash
# Wait until the required CI jobs (`backend`, `frontend`) have passed on a commit.
#
#   ./scripts/wait-for-ci.sh SHA
#
# Used by deploy.yml before it migrates and deploys, so a push to main whose CI
# is red never reaches production. Reads the `ci.yml` push run for SHA with `gh`
# (needs GH_TOKEN, and `actions: read` in a workflow).
#
# Env: POLL_SECONDS (default 15), MAX_WAIT_SECONDS (default 1800), REPO
# (default $GITHUB_REPOSITORY, else the current repo).
# Exit 0 = both passed, 1 = one failed or was cancelled, or the wait ran out,
# 2 = usage.
set -u

SHA="${1:-}"
case "$SHA" in
  '' | *[!0-9a-f]*) echo "usage: $0 SHA (a full or short commit hash)" >&2; exit 2 ;;
esac
POLL_SECONDS="${POLL_SECONDS:-15}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
repo_args=()
[ -n "$REPO" ] && repo_args=(--repo "$REPO")

# The required jobs, as branch protection names them.
REQUIRED='.name == "backend" or .name == "frontend"'

start="$SECONDS"
attempt=0
while :; do
  attempt=$((attempt + 1))
  run_id="$(gh run list ${repo_args[@]+"${repo_args[@]}"} --workflow ci.yml --commit "$SHA" --event push --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)"
  if [ -z "$run_id" ]; then
    echo "attempt $attempt: no CI run for $SHA yet"
  else
    ok="$(gh run view "$run_id" ${repo_args[@]+"${repo_args[@]}"} --json jobs \
      --jq "[.jobs[] | select($REQUIRED) | select(.conclusion == \"success\")] | length" 2>/dev/null)"
    bad="$(gh run view "$run_id" ${repo_args[@]+"${repo_args[@]}"} --json jobs \
      --jq "[.jobs[] | select($REQUIRED) | select(.conclusion == \"failure\" or .conclusion == \"cancelled\" or .conclusion == \"timed_out\")] | length" 2>/dev/null)"
    echo "attempt $attempt: CI run $run_id, required jobs passed: ${ok:-?}/2, failed or cancelled: ${bad:-?}"
    if [ "${bad:-0}" != "0" ] && [ -n "$bad" ]; then
      echo "CI is red on $SHA (run $run_id): not deploying. Fix main with a PR; a manual Run workflow deploys without this wait." >&2
      exit 1
    fi
    if [ "$ok" = "2" ]; then
      echo "backend and frontend passed on $SHA"
      exit 0
    fi
  fi
  if [ $((SECONDS - start)) -ge "$MAX_WAIT_SECONDS" ]; then
    echo "CI did not finish on $SHA within ${MAX_WAIT_SECONDS}s: not deploying." >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"
done
