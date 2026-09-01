#!/usr/bin/env bash
# Smoke test for the deployed personal site.
#
# Usage:
#   ./scripts/smoke.sh [SITE_URL] [API_URL]
#
# Defaults to the production Render URLs. Prints one line per check and exits
# non-zero if any check fails.
#
# The API runs on Render's free tier and spins down after ~15 minutes idle, so
# the health check allows a generous timeout to absorb a cold start.

set -uo pipefail

# Default to the custom domain: that is what visitors actually load, and it is
# the pair that exercises the CORS and cookie configuration end to end.
SITE_URL="${1:-https://joey-haas.dev}"
API_URL="${2:-https://api.joey-haas.dev}"

pass=0
fail=0

report_pass() {
  printf 'PASS  %-42s %s\n' "$1" "$2"
  pass=$((pass + 1))
}

report_fail() {
  printf 'FAIL  %-42s %s\n' "$1" "$2"
  fail=$((fail + 1))
}

check_equals() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    report_pass "$name" "$actual"
  else
    report_fail "$name" "expected '$expected', got '$actual'"
  fi
}

http_status() {
  curl -s -o /dev/null -w '%{http_code}' -m 90 "$1"
}

echo "Site: $SITE_URL"
echo "API:  $API_URL"
echo

check_equals "GET /" "$(http_status "$SITE_URL/")" "200"

# Deep links are the check that matters most: they prove the static host's SPA
# rewrite serves index.html on non-root paths. Without it, client-side routing
# breaks on refresh — and local dev will not reveal the problem, because Vite's
# dev server handles unknown paths differently than a CDN does.
check_equals "GET /about (deep link)" "$(http_status "$SITE_URL/about")" "200"
check_equals "GET /projects (deep link)" "$(http_status "$SITE_URL/projects")" "200"
check_equals "GET /nonsense-path (SPA 404)" "$(http_status "$SITE_URL/nonsense-path")" "200"

# NOTE: a plain "GET /blog returns 200" check would be worthless here. The SPA
# rewrite serves index.html for every unmatched path, so any URL returns 200
# whether or not the route exists — the /nonsense-path check above already
# proves the rewrite works. Blog routing is verified in the browser instead.
#
# feed.xml is different: it is a real file in dist/, and Render skips rewrite
# rules for paths where a resource exists. So its content type distinguishes a
# genuinely served feed from the SPA fallback, and a 200 alone does not.
feed_type="$(curl -s -o /dev/null -m 90 -w '%{content_type}' "$SITE_URL/feed.xml")"
case "$feed_type" in
  *xml*) report_pass "feed.xml served as XML" "$feed_type" ;;
  *) report_fail "feed.xml served as XML" "got '$feed_type' — likely the SPA fallback" ;;
esac

feed="$(curl -s -m 90 "$SITE_URL/feed.xml")"
if printf '%s' "$feed" | grep -q '<channel>' && printf '%s' "$feed" | grep -q "$SITE_URL"; then
  report_pass "feed.xml is a well-formed channel" "contains <channel> and site URL"
else
  report_fail "feed.xml is a well-formed channel" "missing <channel> or site URL"
fi

check_equals "GET /api/health" "$(curl -s -m 90 "$API_URL/api/health")" '{"status":"ok"}'

check_equals "GET /api/auth/me unauthenticated" "$(http_status "$API_URL/api/auth/me")" "401"

check_equals "GET /api/items unauthenticated" \
  "$(http_status "$API_URL/api/items")" "401"

check_equals "POST /api/items unauthenticated" \
  "$(curl -s -o /dev/null -m 90 -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d '{}' "$API_URL/api/items")" \
  "401"

# 401 rather than 404: authentication is checked before existence, so an
# unauthenticated caller cannot learn whether an id exists by guessing at them.
check_equals "GET /api/items/{id} unauthenticated is 401 not 404" \
  "$(http_status "$API_URL/api/items/00000000-0000-0000-0000-000000000000")" \
  "401"

login_location="$(curl -s -o /dev/null -m 90 -w '%{redirect_url}' "$API_URL/api/auth/login")"
case "$login_location" in
  *accounts.google.com*) report_pass "auth/login redirects to Google" "accounts.google.com" ;;
  *) report_fail "auth/login redirects to Google" "got '${login_location:-<none>}'" ;;
esac

# Directly tests the vulnerability this sub-project fixes.
#
# The origin below is deliberately an onrender.com subdomain, not a generic
# "evil.example". The old rule was allow_origin_regex=https://.*\.onrender\.com
# with credentials enabled, so any Render-hosted app could make credentialed
# requests to this API. A generic bad origin was never matched by that regex and
# would pass this check even while the hole was wide open.
forged_origin="https://not-my-site.onrender.com"
forged_acao="$(curl -s -o /dev/null -m 90 -D - -H "Origin: $forged_origin" "$API_URL/api/health" | grep -i '^access-control-allow-origin:' | tr -d '\r')"
if printf '%s' "$forged_acao" | grep -q 'onrender.com'; then
  report_fail "CORS rejects other onrender.com origins" "API echoed $forged_acao"
else
  report_pass "CORS rejects other onrender.com origins" "no ACAO for $forged_origin"
fi

# Proves the public pages were actually decoupled from the backend, rather than
# merely appearing decoupled.
asset="$(curl -s -m 90 "$SITE_URL/" | grep -o '/assets/[^"]*\.js' | head -1)"
if [ -z "$asset" ]; then
  report_fail "bundle has no /api/projects reference" "no JS asset found in index.html"
elif curl -s -m 90 "$SITE_URL$asset" | grep -q '/api/projects'; then
  report_fail "bundle has no /api/projects reference" "bundle still references /api/projects"
else
  report_pass "bundle has no /api/projects reference" "$asset"
fi

# Drafts must be excluded from the production build, not merely hidden at
# render time. This asserts an absence, which is exactly what eyeballing the
# deployed site cannot catch.
if [ -z "$asset" ]; then
  # Without an asset there is nothing to inspect, so passing here would report
  # success having checked nothing at all.
  report_fail "no draft content in bundle" "no JS asset found in index.html"
elif curl -s -m 90 "$SITE_URL$asset" | grep -q 'DRAFTONLYMARKER'; then
  report_fail "no draft content in bundle" "draft marker found in $asset"
else
  report_pass "no draft content in bundle" "$asset"
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
