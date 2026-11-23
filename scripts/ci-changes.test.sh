#!/usr/bin/env bash
# Tests for ci-changes.sh. No git, no network: file lists are fed on stdin.
#
#   ./scripts/ci-changes.test.sh
set -u

here="$(cd "$(dirname "$0")" && pwd)"
fails=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; fails=$((fails + 1)); fi
}

run() { printf '%s' "$1" | "$here/ci-changes.sh"; }

check "docs file and root README are docs-only" heavy=false "$(run $'docs/x.md\nREADME.md\n')"
check "root CLAUDE.md alone is docs-only" heavy=false "$(run $'CLAUDE.md\n')"
check "docs plus issue template is docs-only" heavy=false "$(run $'docs/planning/a.md\n.github/ISSUE_TEMPLATE/bug.yml\n')"
check "no trailing newline" heavy=false "$(run 'docs/x.md')"
check "a name with spaces under docs/" heavy=false "$(run $'docs/my file.md\n')"
check "a name with spaces outside docs/" heavy=true "$(run $'my file.txt\n')"
check "frontend changelog is heavy" heavy=true "$(run $'frontend/changelog.md\n')"
check "frontend README is heavy" heavy=true "$(run $'frontend/README.md\n')"
check "backend file is heavy" heavy=true "$(run $'backend/x.py\n')"
check "workflow file is heavy" heavy=true "$(run $'.github/workflows/ci.yml\n')"
check "render.yaml is heavy" heavy=true "$(run $'render.yaml\n')"
check "a script is heavy" heavy=true "$(run $'scripts/smoke.sh\n')"
check "root non-markdown file is heavy" heavy=true "$(run $'package.json\n')"
check "docs plus one heavy file is heavy" heavy=true "$(run $'docs/x.md\nfrontend/src/App.jsx\n')"
check "CLAUDE.md plus a frontend file is heavy" heavy=true "$(run $'CLAUDE.md\nfrontend/src/App.jsx\n')"
check "empty input is heavy" heavy=true "$(run '')"
check "blank lines only is heavy" heavy=true "$(run $'\n\n')"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
