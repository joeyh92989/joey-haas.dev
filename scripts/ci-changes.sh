#!/usr/bin/env bash
# Decide whether a change needs the heavy CI jobs.
#
#   git diff --name-only origin/main...HEAD | ./scripts/ci-changes.sh
#
# Reads changed file names (one per line) on stdin and prints exactly one line:
# `heavy=false` when EVERY file is docs-only, otherwise `heavy=true`.
# Docs-only means a file under docs/, a root-level *.md, or a file under
# .github/ISSUE_TEMPLATE/. An empty list, or anything else, is heavy: any
# doubt runs the full suite. This is the one place the definition lives.
set -u

heavy=false
seen=false
while IFS= read -r f || [ -n "$f" ]; do
  [ -z "$f" ] && continue
  seen=true
  case "$f" in
    docs/*|.github/ISSUE_TEMPLATE/*) ;;
    */*) heavy=true ;;
    *.md) ;;
    *) heavy=true ;;
  esac
done

[ "$seen" = true ] || heavy=true
echo "heavy=$heavy"
