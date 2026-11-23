#!/usr/bin/env bash
# Install Playwright's Chromium and the system libraries it needs, and retry
# when the runner's apt mirror is throttled.
#
#   ./scripts/install-chromium.sh        (from frontend/, where npx finds playwright)
#
# `npx playwright install --with-deps chromium` normally takes about 20 s. On
# some runs the apt step crawls (21.9 MB at 151 kB/s took 2 min 25 s), and that
# one slow shard decides the whole run's wait. The slow part is the download,
# before anything is installed, so killing it and starting again is safe: a
# fresh attempt usually gets a faster mirror connection. The last attempt has
# no cap, so a real failure still fails the job with its own output.
#
# `timeout` only kills Playwright's own process: the apt-get it started as root
# keeps running and holds the dpkg lock, so a plain retry fails at once with
# "Could not get lock" (seen on the first CI run of this script, exit 100). So
# before each retry the stale apt-get is killed and waited for.
#
# Env: INSTALL_TIMEOUT (seconds per capped attempt, default 75), INSTALL_TRIES
# (attempts in all, default 3), SUDO (default `sudo`; used to kill a stale
# apt-get and to run `dpkg --configure -a` in case the kill landed mid-install).
set -u

TIMEOUT="${INSTALL_TIMEOUT:-75}"
TRIES="${INSTALL_TRIES:-3}"
SUDO="${SUDO:-sudo}"

attempt=1
while :; do
  if [ "$attempt" -ge "$TRIES" ]; then
    npx playwright install --with-deps chromium
    exit $?
  fi
  if timeout "$TIMEOUT" npx playwright install --with-deps chromium; then
    exit 0
  fi
  echo "Chromium install attempt $attempt did not finish in ${TIMEOUT}s (or failed); trying again." >&2
  $SUDO pkill -x apt-get >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -x apt-get >/dev/null 2>&1 || break
    sleep 1
  done
  $SUDO dpkg --configure -a >/dev/null 2>&1 || true
  attempt=$((attempt + 1))
done
