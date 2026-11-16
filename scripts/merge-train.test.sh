#!/usr/bin/env bash
# Tests for merge-train.sh against a fake `gh`. No network, no real PRs.
#
#   ./scripts/merge-train.test.sh
#
# The fake keeps one tiny state file per PR in a temp dir:
#   <n>.state (OPEN|MERGED) <n>.draft <n>.merge (CLEAN|BEHIND)
#   <n>.head  <n>.checks (pass|fail|pending:<k>) <n>.mergeable
# Merging a PR makes every other open PR BEHIND, like branch protection's
# strict rule; update-branch gives a PR a new head and (re)starts its checks.
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
  n="$(printf '%s' "$2" | sed 's/.*\.\.\.sha\([0-9]*\).*/\1/')"
  if [ "$(cat "$d/$n.merge")" = BEHIND ]; then echo 1; else echo 0; fi
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
    pr="$3"; c="$(cat "$d/$pr.checks")"
    case "$c" in
      pass) echo "backend pass"; exit 0 ;;
      fail) echo "backend fail"; exit 1 ;;
      pending:*) k="${c#pending:}"
        if [ "$k" -le 0 ]; then echo pass >"$d/$pr.checks"; exit 0; fi
        echo "pending:$((k - 1))" >"$d/$pr.checks"; echo "backend pending"; exit 8 ;;
    esac ;;
  "pr merge")
    pr="$3"
    echo MERGED >"$d/$pr.state"
    for f in "$d"/*.state; do
      o="$(basename "$f" .state)"
      if [ "$o" != "$pr" ] && [ "$(cat "$f")" = OPEN ]; then echo BEHIND >"$d/$o.merge"; fi
    done
    exit 0 ;;
esac
FAKE
chmod +x "$tmp/bin/gh"

fails=0
# new_pr <n> <merge> <checks>
new_pr() {
  echo OPEN >"$FAKE_DIR/$1.state"; echo false >"$FAKE_DIR/$1.draft"
  echo "$2" >"$FAKE_DIR/$1.merge"; echo "$3" >"$FAKE_DIR/$1.checks"
  echo MERGEABLE >"$FAKE_DIR/$1.mergeable"; echo "sha$1" >"$FAKE_DIR/$1.head"
}
run() { PATH="$tmp/bin:$PATH" POLL_SECONDS=0 GRACE_SECONDS=2 "$here/merge-train.sh" "$@" 2>"$FAKE_DIR/err" >"$FAKE_DIR/out"; echo $?; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: expected '$2', got '$3'"; fails=$((fails + 1)); fi
}
fresh() { export FAKE_DIR="$tmp/$1"; rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"; : >"$FAKE_DIR/calls"; }

# 1. Three PRs: the first is clean, the others fall behind and get updated.
fresh t1; new_pr 1 CLEAN pass; new_pr 2 CLEAN pass; new_pr 3 CLEAN pass
check "train of three exits 0" 0 "$(run 1 2 3)"
check "all merged" "MERGED MERGED MERGED" "$(cat "$FAKE_DIR/1.state" "$FAKE_DIR/2.state" "$FAKE_DIR/3.state" | tr '\n' ' ' | sed 's/ $//')"
check "first PR is not updated" 0 "$(grep -c 'update-branch 1' "$FAKE_DIR/calls")"
check "later PRs are updated once each" "1 1" "$(grep -c 'update-branch 2' "$FAKE_DIR/calls") $(grep -c 'update-branch 3' "$FAKE_DIR/calls")"
check "merge order is the given order" "1 2 3" "$(grep 'pr merge' "$FAKE_DIR/calls" | awk '{print $4}' | tr '\n' ' ' | sed 's/ $//')"

# 2. A failing required check stops the train and merges nothing after it.
fresh t2; new_pr 1 CLEAN pass; new_pr 2 CLEAN fail; new_pr 3 CLEAN pass
check "failed check exits 1" 1 "$(run 1 2 3)"
check "PR before the failure merged" MERGED "$(cat "$FAKE_DIR/1.state")"
check "failed PR not merged" OPEN "$(cat "$FAKE_DIR/2.state")"
check "PR after the failure untouched" OPEN "$(cat "$FAKE_DIR/3.state")"
check "failure is not retried" 1 "$(grep -c 'pr checks 2' "$FAKE_DIR/calls")"

# 3. Draft, closed, conflicting.
fresh t3; new_pr 1 CLEAN pass; echo true >"$FAKE_DIR/1.draft"
check "draft exits 1" 1 "$(run 1)"
fresh t4; new_pr 1 CLEAN pass; echo MERGED >"$FAKE_DIR/1.state"
check "already merged exits 1" 1 "$(run 1)"
fresh t5; new_pr 1 BEHIND pass; echo CONFLICTING >"$FAKE_DIR/1.mergeable"
check "conflict exits 1" 1 "$(run 1)"
check "conflict is not updated or merged" 0 "$(grep -c 'update-branch\|pr merge' "$FAKE_DIR/calls")"

# 4. Pending checks are waited for.
fresh t6; new_pr 1 CLEAN pending:3
check "pending then pass exits 0" 0 "$(run 1)"

# 5. Dry run changes nothing; bad usage exits 2.
fresh t7; new_pr 1 BEHIND pass
check "dry run exits 0" 0 "$(run --dry-run 1)"
check "dry run mutates nothing" 0 "$(grep -c 'update-branch\|pr merge' "$FAKE_DIR/calls")"
check "no PRs exits 2" 2 "$(run)"
check "non-number exits 2" 2 "$(run abc)"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
