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
# Env: INSTALL_TIMEOUT (seconds per capped attempt, default 75), INSTALL_TRIES
# (attempts in all, default 3), SUDO (default `sudo`; a killed apt may leave
# dpkg half-configured, so a retry first runs `$SUDO dpkg --configure -a`).
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
  $SUDO dpkg --configure -a >/dev/null 2>&1 || true
  attempt=$((attempt + 1))
done
