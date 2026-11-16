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
# Env: POLL_SECONDS (default 20) between polls; MAX_WAIT_MINUTES (default 30)
# per PR for the checks to finish; GRACE_SECONDS (default 120) for a new head's
# checks to appear. The limits are wall-clock, not poll counts.
# Exit 0 = every PR merged, 1 = stopped on a PR (reason on stderr), 2 = usage.
set -u

POLL_SECONDS="${POLL_SECONDS:-20}"
MAX_WAIT_MINUTES="${MAX_WAIT_MINUTES:-30}"
GRACE_SECONDS="${GRACE_SECONDS:-120}"

dry_run=0
prs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    *)
      number="${arg#\#}"
      case "$number" in
        '' | *[!0-9]*)
          echo "not a PR number: '$arg' (give numbers like 411 or #411)" >&2
          echo "usage: $0 [--dry-run] PR [PR...]" >&2
          exit 2
          ;;
      esac
      prs+=("$number")
      ;;
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
# this: a PR that is behind and also waiting on checks can read BLOCKED. An
# answer that is not a number is an API failure, never "behind". Sets $behind
# in this shell: `stop` inside a $(...) would only leave the subshell.
get_behind() {
  behind="$(gh api "repos/{owner}/{repo}/compare/$(field "$1" baseRefName)...$(field "$1" headRefOid)" --jq .behind_by)"
  case "$behind" in
    '' | *[!0-9]*) stop "$1" "could not read how far behind main it is (GitHub API answered '$behind')" ;;
  esac
}

# The checks branch protection requires, so a pass is only believed once every
# one of them has reported (GitHub registers them one at a time after a push).
# Empty when the protection cannot be read; the exit code is then all there is.
required_contexts() {
  gh api "repos/{owner}/{repo}/branches/main/protection/required_status_checks" --jq '.contexts[]' 2>/dev/null
}

# Wait until the PR's head moves off $2 (update-branch pushes a merge commit).
wait_for_new_head() {
  local pr="$1" old="$2" start="$SECONDS"
  while [ "$(field "$pr" headRefOid)" = "$old" ]; do
    [ $((SECONDS - start)) -ge "$GRACE_SECONDS" ] && stop "$pr" "update-branch did not move the head within ${GRACE_SECONDS}s"
    sleep "$POLL_SECONDS"
  done
}

# Poll the required checks (gh exits 0 pass, 1 fail, 8 pending), and treat "no
# checks reported" as not yet while GitHub creates the new head's runs.
wait_for_checks() {
  local pr="$1" start="$SECONDS" out rc ctx missing
  while :; do
    out="$(gh pr checks "$pr" --required 2>&1)"
    rc=$?
    case "$rc" in
      0)
        missing=""
        for ctx in $CONTEXTS; do
          printf '%s\n' "$out" | cut -f1 | grep -qx "$ctx" || missing="$missing $ctx"
        done
        [ -z "$missing" ] && return 0
        [ $((SECONDS - start)) -ge "$GRACE_SECONDS" ] && stop "$pr" "required check(s) never reported:$missing"
        ;;
      8) ;;
      *)
        if printf '%s' "$out" | grep -qi 'no checks reported\|no required checks'; then
          [ $((SECONDS - start)) -ge "$GRACE_SECONDS" ] && stop "$pr" "no required checks appeared within ${GRACE_SECONDS}s"
        else
          printf '%s\n' "$out" >&2
          stop "$pr" "a required check failed. Not retried: read it, fix it, rerun the train"
        fi
        ;;
    esac
    [ $((SECONDS - start)) -ge $((MAX_WAIT_MINUTES * 60)) ] && stop "$pr" "checks still running after ${MAX_WAIT_MINUTES} minutes"
    sleep "$POLL_SECONDS"
  done
}

# Say so when a check that is not required is not green: the train will not
# stop for it (e2e flakes, a rehearsal diff is a judgement), but the person
# reading the log should see it before the merge.
warn_non_required() {
  local out
  out="$(gh pr checks "$1" 2>&1 | grep -v -E '	(pass|skipping)	' || true)"
  [ -n "$out" ] && printf '%s  WARNING #%s has checks that are not green (not required):\n%s\n' "$(date +%H:%M:%S)" "$1" "$out"
  return 0
}

CONTEXTS="$(required_contexts | tr '\n' ' ')"

if [ "$dry_run" -eq 1 ]; then
  for pr in "${prs[@]}"; do
    get_behind "$pr"
    printf '#%s  state=%s draft=%s merge=%s mergeable=%s behind_by=%s\n' "$pr" \
      "$(field "$pr" state)" "$(field "$pr" isDraft)" \
      "$(field "$pr" mergeStateStatus)" "$(field "$pr" mergeable)" "$behind"
  done
  echo "required checks: ${CONTEXTS:-<could not read branch protection>}"
  exit 0
fi

for pr in "${prs[@]}"; do
  [ "$(field "$pr" state)" = "OPEN" ] || stop "$pr" "not open"
  [ "$(field "$pr" isDraft)" = "false" ] || stop "$pr" "still a draft"

  merged=0
  for round in 1 2 3; do
    [ "$(field "$pr" mergeable)" != "CONFLICTING" ] || stop "$pr" "conflicts with main: rebase it by hand"
    get_behind "$pr"
    if [ "$behind" != "0" ]; then
      old="$(field "$pr" headRefOid)"
      log "#$pr is behind main: update-branch"
      gh pr update-branch "$pr" || stop "$pr" "update-branch failed"
      wait_for_new_head "$pr" "$old"
    fi
    log "#$pr: waiting for required checks"
    wait_for_checks "$pr"
    # Another merge may have landed while the checks ran: go round again.
    get_behind "$pr"
    if [ "$behind" != "0" ]; then
      log "#$pr fell behind main while its checks ran: round $round of 3"
      continue
    fi
    warn_non_required "$pr"
    log "#$pr: merging (squash)"
    if gh pr merge "$pr" --squash; then
      merged=1
      break
    fi
    log "#$pr: merge refused, round $round of 3"
    sleep "$POLL_SECONDS"
  done

  [ "$merged" -eq 1 ] || stop "$pr" "not merged after 3 rounds (it kept falling behind main, or the merge was refused: see above)"
  [ "$(field "$pr" state)" = "MERGED" ] || stop "$pr" "merge did not complete"
  log "#$pr merged"
done
log "train done: ${#prs[@]} merged"
