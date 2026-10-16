#!/bin/bash
# Adds a made-up version of a week to the test org, for trying the schedule page (slice 4a).
# The first run also sets up an invented camp, "Sample Camp (made up)", with one week, six bunks,
# time blocks, activities, and fixed and recurring activities. Synthetic data only.
# Uses the existing test org (alias shoresh-test); never creates another one.
# Usage: scripts/make-sample-version.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ALIAS=shoresh-test
if ! sf org display --target-org "$ALIAS" >/dev/null 2>&1; then
  echo "The test org is missing or expired. Run scripts/renew-test-org.sh first."
  exit 1
fi
out=$(sf apex run --file scripts/apex/sample-version.apex --target-org "$ALIAS" --json 2>&1 || true)
if grep -q '"success": true' <<< "$out" && grep -q 'SAMPLE_VERSION' <<< "$out"; then
  echo "Done. In the Shoresh tab, pick the camp \"Sample Camp (made up)\", then open Schedules."
else
  echo "Could not make the sample version:"
  echo "$out" | grep -E '"(message|compileProblem|exceptionMessage|exceptionStackTrace)"' || echo "$out"
  exit 1
fi
