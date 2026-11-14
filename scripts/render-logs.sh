#!/usr/bin/env bash
# Print the API service's recent Render logs, for the ship step's log check.
#
#   ./scripts/render-logs.sh [SINCE_MINUTES] [LEVEL]
#
# SINCE_MINUTES defaults to 30, LEVEL to error (error, warning, info). Reads
# RENDER_API_KEY from the environment; the key is never written anywhere.
# Exit 0 = no entries, 1 = entries printed, 2 = could not read the logs.
set -u

SERVICE_ID="srv-da3u2m8ae00c73983rsg" # joey-haas-dev-api
OWNER_ID="tea-da3tqfrbc2fs73bh7ldg"
SINCE_MIN="${1:-30}"
LEVEL="${2:-error}"

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "RENDER_API_KEY is not set" >&2
  exit 2
fi
case "$SINCE_MIN" in '' | *[!0-9]*) echo "SINCE_MINUTES must be a number" >&2; exit 2 ;; esac

start="$(python3 -c "import datetime as d,sys;print((d.datetime.now(d.timezone.utc)-d.timedelta(minutes=int(sys.argv[1]))).strftime('%Y-%m-%dT%H:%M:%SZ'))" "$SINCE_MIN")"

body="$(curl -s -m 60 -G "https://api.render.com/v1/logs" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  --data-urlencode "ownerId=$OWNER_ID" \
  --data-urlencode "resource=$SERVICE_ID" \
  --data-urlencode "level=$LEVEL" \
  --data-urlencode "startTime=$start" \
  --data-urlencode "limit=100" \
  --data-urlencode "direction=forward" -w $'\n%{http_code}')" || { echo "request failed" >&2; exit 2; }

code="${body##*$'\n'}"
json="${body%$'\n'*}"
if [ "$code" != "200" ]; then
  echo "Render answered HTTP $code" >&2
  exit 2
fi

printf '%s' "$json" | python3 -c '
import json, sys
logs = json.load(sys.stdin).get("logs", [])
for l in logs:
    print(l["timestamp"], l["message"][:300])
print(f"{len(logs)} {sys.argv[1]} entries since {sys.argv[2]}", file=sys.stderr)
sys.exit(1 if logs else 0)
' "$LEVEL" "$start"
