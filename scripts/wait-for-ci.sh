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

# The required jobs, as branch protection names them, and one query that prints
# "<passed> <failed-or-cancelled>" for them from a single read of the run.
JQ='[.jobs[] | select(.name == "backend" or .name == "frontend")]
  | "\([.[] | select(.conclusion == "success")] | length) \([.[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out")] | length)"'

start="$SECONDS"
attempt=0
ok="?"
while :; do
  attempt=$((attempt + 1))
  if ! run_id="$(gh run list ${repo_args[@]+"${repo_args[@]}"} --workflow ci.yml --commit "$SHA" --event push --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty' 2>&1)"; then
    echo "attempt $attempt: gh run list failed: $run_id"
    run_id=""
  fi
  if [ -z "$run_id" ]; then
    echo "attempt $attempt: no CI run for $SHA yet"
  elif ! counts="$(gh run view "$run_id" ${repo_args[@]+"${repo_args[@]}"} --json jobs --jq "$JQ" 2>&1)"; then
    echo "attempt $attempt: gh run view $run_id failed: $counts"
  else
    read -r ok bad <<<"$counts"
    echo "attempt $attempt: CI run $run_id, required jobs passed: ${ok:-?}/2, failed or cancelled: ${bad:-?}"
    if [ "${bad:-0}" != "0" ]; then
      echo "CI is red on $SHA (run $run_id): not deploying. Fix main with a PR; a manual Run workflow deploys without this wait." >&2
      exit 1
    fi
    if [ "${ok:-0}" = "2" ]; then
      echo "backend and frontend passed on $SHA"
      exit 0
    fi
  fi
  if [ $((SECONDS - start)) -ge "$MAX_WAIT_SECONDS" ]; then
    echo "CI did not finish on $SHA within ${MAX_WAIT_SECONDS}s (last seen: ${ok:-?}/2 passed): not deploying. If CI is green, check that ci.yml still has jobs named backend and frontend." >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"
done
