#!/usr/bin/env bash
# Merge a list of PRs into main, one after another, with no idle gap between.
#
#   ./scripts/merge-train.sh [--dry-run] PR [PR...]
#
# Branch protection on main requires `backend` and `frontend` and an up-to-date
# branch (strict), so every merge puts the remaining PRs behind main. This runs
# the update-branch / wait / merge cycle for each PR in the order given, the
# moment the previous one lands. See scripts/README.md for the why and the gates.
#
# Env: POLL_SECONDS (default 20) between checks; MAX_WAIT_MINUTES (default 30)
# per PR for the checks to finish.
# Exit 0 = every PR merged, 1 = stopped on a PR (reason on stderr), 2 = usage.
set -u

POLL_SECONDS="${POLL_SECONDS:-20}"
MAX_WAIT_MINUTES="${MAX_WAIT_MINUTES:-30}"
GRACE_SECONDS="${GRACE_SECONDS:-120}" # for checks to appear after a push

dry_run=0
prs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    '' | *[!0-9]*) echo "usage: $0 [--dry-run] PR [PR...]" >&2; exit 2 ;;
    *) prs+=("$arg") ;;
  esac
done
if [ "${#prs[@]}" -eq 0 ]; then
  echo "usage: $0 [--dry-run] PR [PR...]" >&2
  exit 2
fi

log() { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*"; }
stop() { printf 'STOP  #%s: %s\n' "$1" "$2" >&2; exit 1; }
field() { gh pr view "$1" --json "$2" --jq ".$2"; }
# Commits main has that the PR's head lacks. mergeStateStatus is not used for
# this: a PR that is behind and also waiting on checks can read BLOCKED.
behind_by() {
  gh api "repos/{owner}/{repo}/compare/$(field "$1" baseRefName)...$(field "$1" headRefOid)" --jq .behind_by
}

# Wait until the PR's head moves off $2 (update-branch pushes a merge commit).
wait_for_new_head() {
  local pr="$1" old="$2" waited=0
  while [ "$(field "$pr" headRefOid)" = "$old" ]; do
    [ "$waited" -ge "$GRACE_SECONDS" ] && stop "$pr" "update-branch did not move the head within ${GRACE_SECONDS}s"
    sleep "$POLL_SECONDS"
    waited=$((waited + POLL_SECONDS))
  done
}

# Poll the required checks: 0 pass, 1 fail, 8 pending, and "no checks reported"
# while GitHub has not created the new head's runs yet.
wait_for_checks() {
  local pr="$1" waited=0 grace=0 out rc
  while :; do
    out="$(gh pr checks "$pr" --required 2>&1)"
    rc=$?
    case "$rc" in
      0) return 0 ;;
      8) ;;
      *)
        if printf '%s' "$out" | grep -qi 'no checks reported\|no required checks'; then
          grace=$((grace + POLL_SECONDS))
          [ "$grace" -gt "$GRACE_SECONDS" ] && stop "$pr" "no required checks appeared within ${GRACE_SECONDS}s"
        else
          printf '%s\n' "$out" >&2
          stop "$pr" "a required check failed. Not retried: read it, fix it, rerun the train"
        fi
        ;;
    esac
    [ "$waited" -ge $((MAX_WAIT_MINUTES * 60)) ] && stop "$pr" "checks still running after ${MAX_WAIT_MINUTES} minutes"
    sleep "$POLL_SECONDS"
    waited=$((waited + POLL_SECONDS))
  done
}

if [ "$dry_run" -eq 1 ]; then
  for pr in "${prs[@]}"; do
    printf '#%s  state=%s draft=%s merge=%s mergeable=%s behind_by=%s\n' "$pr" \
      "$(field "$pr" state)" "$(field "$pr" isDraft)" \
      "$(field "$pr" mergeStateStatus)" "$(field "$pr" mergeable)" "$(behind_by "$pr")"
  done
  exit 0
fi

for pr in "${prs[@]}"; do
  [ "$(field "$pr" state)" = "OPEN" ] || stop "$pr" "not open"
  [ "$(field "$pr" isDraft)" = "false" ] || stop "$pr" "still a draft"

  for round in 1 2 3; do
    [ "$(field "$pr" mergeable)" != "CONFLICTING" ] || stop "$pr" "conflicts with main: rebase it by hand"
    if [ "$(behind_by "$pr")" != "0" ]; then
      old="$(field "$pr" headRefOid)"
      log "#$pr is behind main: update-branch"
      gh pr update-branch "$pr" || stop "$pr" "update-branch failed"
      wait_for_new_head "$pr" "$old"
    fi
    log "#$pr: waiting for required checks"
    wait_for_checks "$pr"
    # Another merge may have landed while the checks ran: go round again.
    if [ "$(behind_by "$pr")" != "0" ]; then
      continue
    fi
    log "#$pr: merging (squash)"
    if gh pr merge "$pr" --squash; then
      break
    fi
    [ "$round" -eq 3 ] && stop "$pr" "merge refused three times"
  done

  [ "$(field "$pr" state)" = "MERGED" ] || stop "$pr" "merge did not complete"
  log "#$pr merged"
done
log "train done: ${#prs[@]} merged"
