#!/usr/bin/env bash
# Test, build and push the current branch in one step (keeps agent sessions to few, cheap steps).
# Usage: tools/ship.sh "commit message" [--build]
#   Runs npm test; firmware host tests only when firmware/ or v61/ changed; preview build with --build.
set -euo pipefail
msg="${1:?commit message required}"
cd "$(dirname "$0")/.."
git add -A
if git diff --cached --name-only | grep -qE '^(firmware|v61)/'; then bash firmware/run_tests.sh 2>&1 | tail -3; fi
npm test 2>&1 | grep -E 'Tests |FAIL|×' || true
npm test >/dev/null 2>&1 || { echo "npm test failed"; exit 1; }
if [ "${2:-}" = "--build" ]; then npm run build:preview >/tmp/ship-build.log 2>&1 || { tail -20 /tmp/ship-build.log; exit 1; }; echo "build ok"; fi
git diff --cached --quiet && { echo "nothing to commit"; exit 0; }
git commit -q -m "$msg"
git push -q origin "$(git rev-parse --abbrev-ref HEAD)"
echo "pushed $(git rev-parse --short HEAD) to $(git rev-parse --abbrev-ref HEAD)"
