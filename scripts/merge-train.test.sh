#!/usr/bin/env bash
# Tests for merge-train.sh against a fake `gh`. No network, no real PRs.
#
#   ./scripts/merge-train.test.sh
#
# The fake keeps one tiny state file per PR in a temp dir:
#   <n>.state (OPEN|MERGED)  <n>.draft  <n>.merge (CLEAN|BEHIND)  <n>.head
#   <n>.mergeable  <n>.checks  <n>.mergefail (refusals left)
# <n>.checks is: pass | fail | pending:<k> | none (no checks reported yet) |
# partial (only `backend` ever reports) | late:<k> (`frontend` is missing for the
# first k polls, like an aggregate that starts last) | behindonce (passes, but main moves
# on while it runs). Merging a PR makes every other open PR BEHIND, like
# branch protection's strict rule; update-branch gives a PR a new head and
# restarts its checks. `strict` in the dir holds true (default) or false for the
# protection's strict setting. `apifail` in the dir makes the compare API answer nothing.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'FAKE'
#!/usr/bin/env bash
d="$FAKE_DIR"
echo "gh $*" >>"$d/calls"
if [ "$1" = api ]; then
  case "$2" in
    *required_status_checks)
      case "$*" in *.strict*) cat "$d/strict" 2>/dev/null || echo true ;; *) printf 'backend\nfrontend\n' ;; esac ;;
    *compare*)
      [ -e "$d/apifail" ] && exit 0
      n="$(printf '%s' "$2" | sed 's/.*\.\.\.sha\([0-9]*\).*/\1/')"
      if [ "$(cat "$d/$n.merge")" = BEHIND ]; then echo 1; else echo 0; fi ;;
  esac
  exit 0
fi
case "$1 $2" in
  "pr view")
    pr="$3"; field="$5"
    case "$field" in
      state) cat "$d/$pr.state" ;;
      isDraft) cat "$d/$pr.draft" ;;
      mergeStateStatus) cat "$d/$pr.merge" ;;
      mergeable) cat "$d/$pr.mergeable" ;;
      headRefOid) cat "$d/$pr.head" ;;
      baseRefName) echo main ;;
    esac ;;
  "pr update-branch")
    pr="$3"
    echo "$(cat "$d/$pr.head")x" >"$d/$pr.head"
    echo CLEAN >"$d/$pr.merge"
    [ "$(cat "$d/$pr.checks")" = fail ] || echo "pending:1" >"$d/$pr.checks" ;;
  "pr checks")
    pr="$3"
    if [ "${4:-}" != "--required" ]; then printf 'e2e\tpass\t1m\n'; exit 0; fi
    c="$(cat "$d/$pr.checks")"
    case "$c" in
      pass) printf 'backend\tpass\t1m\nfrontend\tpass\t1m\n'; exit 0 ;;
      fail) printf 'backend\tfail\t1m\n'; exit 1 ;;
      none) echo "no checks reported on the 'x' branch"; exit 1 ;;
      partial) printf 'backend\tpass\t1m\n'; exit 0 ;;
      late:*) k="${c#late:}"
        if [ "$k" -le 0 ]; then echo pass >"$d/$pr.checks"; printf 'backend\tpass\t1m\nfrontend\tpass\t1m\n'; exit 0; fi
        echo "late:$((k - 1))" >"$d/$pr.checks"; printf 'backend\tpass\t1m\n'; exit 0 ;;
      behindonce) echo pass >"$d/$pr.checks"; echo BEHIND >"$d/$pr.merge"
        printf 'backend\tpass\t1m\nfrontend\tpass\t1m\n'; exit 0 ;;
      pending:*) k="${c#pending:}"
        if [ "$k" -le 0 ]; then echo pass >"$d/$pr.checks"; printf 'backend\tpass\t1m\nfrontend\tpass\t1m\n'; exit 0; fi
        echo "pending:$((k - 1))" >"$d/$pr.checks"; printf 'backend\tpending\n'; exit 8 ;;
    esac ;;
  "pr merge")
    pr="$3"
    if [ -e "$d/$pr.mergefail" ] && [ "$(cat "$d/$pr.mergefail")" -gt 0 ]; then
      echo "$(($(cat "$d/$pr.mergefail") - 1))" >"$d/$pr.mergefail"; exit 1
    fi
    echo MERGED >"$d/$pr.state"
    for f in "$d"/*.state; do
      o="$(basename "$f" .state)"
      if [ "$o" != "$pr" ] && [ "$(cat "$f")" = OPEN ]; then echo BEHIND >"$d/$o.merge"; fi
    done
    exit 0 ;;
esac
FAKE
chmod +x "$tmp/bin/gh"

# Limits: tests that expect a timeout set GRACE=1 MAXW=1 (SECONDS is a whole-second
# counter, so such a limit can expire in milliseconds); the rest get generous ones.
fails=0
# new_pr <n> <merge> <checks>
new_pr() {
  echo OPEN >"$FAKE_DIR/$1.state"; echo false >"$FAKE_DIR/$1.draft"
  echo "$2" >"$FAKE_DIR/$1.merge"; echo "$3" >"$FAKE_DIR/$1.checks"
  echo MERGEABLE >"$FAKE_DIR/$1.mergeable"; echo "sha$1" >"$FAKE_DIR/$1.head"
}
run() { PATH="$tmp/bin:$PATH" POLL_SECONDS=0 GRACE_SECONDS="${GRACE:-20}" MAX_WAIT_SECONDS="${MAXW:-30}" "$here/merge-train.sh" "$@" 2>"$FAKE_DIR/err" >"$FAKE_DIR/out"; echo $?; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: expected '$2', got '$3'"; fails=$((fails + 1)); fi
}
count() { grep -c -E "$1" "$FAKE_DIR/calls"; }
fresh() { export FAKE_DIR="$tmp/$1"; rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"; : >"$FAKE_DIR/calls"; }

# 1. Three PRs: the first is clean, the others fall behind and get updated.
fresh t1; new_pr 1 CLEAN pass; new_pr 2 CLEAN pass; new_pr 3 CLEAN pass
check "train of three exits 0" 0 "$(run 1 2 3)"
check "all merged" "MERGED MERGED MERGED" "$(cat "$FAKE_DIR/1.state" "$FAKE_DIR/2.state" "$FAKE_DIR/3.state" | tr '\n' ' ' | sed 's/ $//')"
check "first PR is not updated" 0 "$(count 'update-branch 1')"
check "later PRs are updated once each" "1 1" "$(count 'update-branch 2') $(count 'update-branch 3')"
check "merge order is the given order" "1 2 3" "$(grep 'pr merge' "$FAKE_DIR/calls" | awk '{print $4}' | tr '\n' ' ' | sed 's/ $//')"
fresh t1b; new_pr 1 CLEAN pass
check "#PR numbers are accepted" 0 "$(run '#1')"

# 2. A failing required check stops the train and merges nothing after it.
fresh t2; new_pr 1 CLEAN pass; new_pr 2 CLEAN fail; new_pr 3 CLEAN pass
check "failed check exits 1" 1 "$(run 1 2 3)"
check "PR before the failure merged" MERGED "$(cat "$FAKE_DIR/1.state")"
check "failed PR not merged" OPEN "$(cat "$FAKE_DIR/2.state")"
check "PR after the failure untouched" OPEN "$(cat "$FAKE_DIR/3.state")"
check "failure is not retried" 1 "$(count 'pr checks 2 --required')"

# 3. Draft, closed, conflicting.
fresh t3; new_pr 1 CLEAN pass; echo true >"$FAKE_DIR/1.draft"
check "draft exits 1" 1 "$(run 1)"
fresh t4; new_pr 1 CLEAN pass; echo MERGED >"$FAKE_DIR/1.state"
check "already merged exits 1" 1 "$(run 1)"
fresh t5; new_pr 1 BEHIND pass; echo CONFLICTING >"$FAKE_DIR/1.mergeable"
check "conflict exits 1" 1 "$(run 1)"
check "conflict is not updated or merged" 0 "$(count 'update-branch|pr merge')"

# 4. Pending checks are waited for.
fresh t6; new_pr 1 CLEAN pending:3
check "pending then pass exits 0" 0 "$(run 1)"

# 5. The risky branches.
fresh t8; new_pr 1 CLEAN none
check "no checks ever reported stops" 1 "$(GRACE=1 MAXW=1 run 1)"
check "...and says so" 1 "$(grep -c 'no required checks appeared' "$FAKE_DIR/err")"
fresh t9; new_pr 1 CLEAN partial
check "a required check that never reports stops" 1 "$(GRACE=1 MAXW=1 run 1)"
check "...and names it" 1 "$(grep -c 'not yet reported: frontend' "$FAKE_DIR/err")"
check "...without merging" 0 "$(count 'pr merge')"
fresh t9b; new_pr 1 CLEAN late:3
check "a required check that appears late is waited for" 0 "$(run 1)"
check "...and then merged" MERGED "$(cat "$FAKE_DIR/1.state")"
fresh t10; new_pr 1 CLEAN behindonce
check "falling behind during checks goes round again" 0 "$(run 1)"
check "...with one update-branch" 1 "$(count 'update-branch 1')"
fresh t11; new_pr 1 CLEAN pass; echo 1 >"$FAKE_DIR/1.mergefail"
check "one refused merge is retried" 0 "$(run 1)"
check "...merge was called twice" 2 "$(count 'pr merge 1')"
fresh t12; new_pr 1 CLEAN pass; echo 9 >"$FAKE_DIR/1.mergefail"
check "a merge refused every round stops" 1 "$(run 1)"
check "...after three tries" 3 "$(count 'pr merge 1')"
fresh t13; new_pr 1 CLEAN pass; touch "$FAKE_DIR/apifail"
check "an unreadable compare API stops, not guesses" 1 "$(run 1)"
check "...without updating or merging" 0 "$(count 'update-branch|pr merge')"

# 5b. strict off: PRs behind main are merged in order with no update-branch.
fresh t14; echo false >"$FAKE_DIR/strict"; new_pr 1 CLEAN pass; new_pr 2 CLEAN pass; new_pr 3 BEHIND pass
check "strict off: train exits 0" 0 "$(run 1 2 3)"
check "...every PR merged" "MERGED MERGED MERGED" "$(cat "$FAKE_DIR/1.state" "$FAKE_DIR/2.state" "$FAKE_DIR/3.state" | tr '\n' ' ' | sed 's/ $//')"
check "...no update-branch at all" 0 "$(count 'update-branch')"
check "...in the given order" "1 2 3" "$(grep 'pr merge' "$FAKE_DIR/calls" | awk '{print $4}' | tr '\n' ' ' | sed 's/ $//')"
fresh t15; echo false >"$FAKE_DIR/strict"; new_pr 1 CLEAN behindonce
check "strict off: main moving during checks is not a retry" 0 "$(run 1)"
check "...one merge, no update-branch" "1 0" "$(count 'pr merge 1') $(count 'update-branch')"
fresh t16; echo false >"$FAKE_DIR/strict"; new_pr 1 CLEAN fail
check "strict off: a failed check still stops" 1 "$(run 1)"
fresh t17; echo false >"$FAKE_DIR/strict"; new_pr 1 BEHIND pass
check "dry run reports strict off" 1 "$(run --dry-run 1 >/dev/null; grep -c 'strict (up-to-date branch required): no' "$FAKE_DIR/out")"

# 6. Dry run changes nothing; bad usage exits 2.
fresh t7; new_pr 1 BEHIND pass
check "dry run exits 0" 0 "$(run --dry-run 1)"
check "dry run mutates nothing" 0 "$(count 'update-branch|pr merge')"
check "no PRs exits 2" 2 "$(run)"
check "non-number exits 2" 2 "$(run abc)"
check "...and names the bad argument" 1 "$(grep -c "not a PR number: 'abc'" "$FAKE_DIR/err")"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
