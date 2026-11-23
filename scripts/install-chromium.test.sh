#!/usr/bin/env bash
# Tests for install-chromium.sh against a fake `npx`. No network, no apt.
#
#   ./scripts/install-chromium.test.sh
#
# The fake reads FAKE_PLAN, a comma list with one word per call: ok (exit 0),
# fail (exit 1), hang (sleep past the timeout). It counts calls in $tmp/calls.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/npx" <<'FAKE'
#!/usr/bin/env bash
n=$(($(cat "$FAKE_DIR/calls" 2>/dev/null || echo 0) + 1))
echo "$n" >"$FAKE_DIR/calls"
step="$(echo "$FAKE_PLAN" | cut -d, -f"$n")"
case "$step" in
  ok) exit 0 ;;
  fail) exit 1 ;;
  hang) sleep 30 ;;
esac
FAKE
chmod +x "$tmp/bin/npx"

# GNU `timeout` is on the CI runner but not on macOS: stand in with perl's alarm.
if ! command -v timeout >/dev/null 2>&1; then
  cat >"$tmp/bin/timeout" <<'SHIM'
#!/usr/bin/env bash
secs="$1"
shift
exec perl -e 'alarm shift; exec @ARGV or exit 127' "$secs" "$@"
SHIM
  chmod +x "$tmp/bin/timeout"
fi

fails=0
run() { # name plan expected-exit expected-calls [extra env...]
  local name="$1" plan="$2" want_exit="$3" want_calls="$4"
  shift 4
  rm -f "$tmp/calls"
  env "$@" PATH="$tmp/bin:$PATH" FAKE_DIR="$tmp" FAKE_PLAN="$plan" SUDO=true \
    INSTALL_TIMEOUT=1 "$here/install-chromium.sh" >/dev/null 2>&1
  local got_exit=$? got_calls
  got_calls="$(cat "$tmp/calls" 2>/dev/null || echo 0)"
  if [ "$got_exit" = "$want_exit" ] && [ "$got_calls" = "$want_calls" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name: exit $got_exit (want $want_exit), calls $got_calls (want $want_calls)"
    fails=$((fails + 1))
  fi
}

run "first attempt succeeds" "ok" 0 1 INSTALL_TRIES=3
run "a hung attempt is killed and retried" "hang,ok" 0 2 INSTALL_TRIES=3
run "two hung attempts, then ok" "hang,hang,ok" 0 3 INSTALL_TRIES=3
run "a failed attempt is retried" "fail,ok" 0 2 INSTALL_TRIES=3
run "the last attempt's failure is the job's failure" "hang,hang,fail" 1 3 INSTALL_TRIES=3
run "tries=1 runs once, uncapped" "fail" 1 1 INSTALL_TRIES=1

[ "$fails" = 0 ] && echo "all passed"
exit "$fails"
