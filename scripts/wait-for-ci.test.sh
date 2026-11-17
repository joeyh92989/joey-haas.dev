#!/usr/bin/env bash
# Tests for wait-for-ci.sh against a fake `gh`. No network.
#
#   ./scripts/wait-for-ci.test.sh
#
# The fake reads a scenario file: one line per `gh run view` call (the last line
# repeats), each `<backend>,<frontend>` as a conclusion or `-` for not finished.
# `norun` in the scenario file means `gh run list` finds no run (a run that has
# not been created yet), for the first N calls given as `norun:N`.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat >"$tmp/bin/gh" <<'FAKE'
#!/usr/bin/env bash
d="$FAKE_DIR"
case "$2" in
  list)
    n="$(cat "$d/norun" 2>/dev/null || echo 0)"
    if [ "$n" -gt 0 ]; then echo "$((n - 1))" >"$d/norun"; exit 0; fi
    echo 4242 ;;
  view)
    # Each of the script's two jq calls reads the same line; advance after the second.
    c="$(cat "$d/calls" 2>/dev/null || echo 0)"
    line_no=$(( c / 2 + 1 ))
    total="$(wc -l <"$d/scenario")"
    [ "$line_no" -gt "$total" ] && line_no="$total"
    echo "$((c + 1))" >"$d/calls"
    row="$(sed -n "${line_no}p" "$d/scenario")"
    b="${row%%,*}"; f="${row##*,}"
    ok=0; bad=0
    for v in "$b" "$f"; do
      case "$v" in success) ok=$((ok + 1)) ;; failure | cancelled | timed_out) bad=$((bad + 1)) ;; esac
    done
    # Which query? The success query mentions "success" only.
    case "$*" in *'.conclusion == \"failure\"'* | *'conclusion == "failure"'*) echo "$bad" ;; *) echo "$ok" ;; esac ;;
esac
FAKE
chmod +x "$tmp/bin/gh"

fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: expected '$2', got '$3'"; fails=$((fails + 1)); fi; }
scenario() { export FAKE_DIR="$tmp/$1"; rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"; printf '%s\n' "${@:2}" >"$FAKE_DIR/scenario"; }
run() { PATH="$tmp/bin:$PATH" POLL_SECONDS=0 MAX_WAIT_SECONDS=1 "$here/wait-for-ci.sh" "$@" >"$FAKE_DIR/out" 2>"$FAKE_DIR/err"; echo $?; }

scenario s1 "success,success"
check "both passed exits 0" 0 "$(run abc1234)"

scenario s2 "-,-" "success,-" "success,success"
check "waits for unfinished jobs, then passes" 0 "$(run abc1234)"

scenario s3 "success,failure"
check "a failed job exits 1" 1 "$(run abc1234)"
check "...and says CI is red" 1 "$(grep -c 'CI is red' "$FAKE_DIR/err")"

scenario s4 "cancelled,success"
check "a cancelled job exits 1" 1 "$(run abc1234)"

scenario s5 "-,-"
check "never finishing times out with exit 1" 1 "$(run abc1234)"
check "...and says so" 1 "$(grep -c 'did not finish' "$FAKE_DIR/err")"

scenario s6 "success,success"; echo 2 >"$FAKE_DIR/norun"
check "waits for a run that does not exist yet" 0 "$(run abc1234)"

scenario s7 "success,success"
check "no argument exits 2" 2 "$(run)"
check "a non-hash exits 2" 2 "$(run 'main; rm')"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
