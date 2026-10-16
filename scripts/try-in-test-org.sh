#!/bin/bash
# Puts this branch's Shoresh into the one test org and opens Camp Setup.
# Uses the existing test org (alias shoresh-test); never creates another one.
# Usage: scripts/try-in-test-org.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ALIAS=shoresh-test
if ! sf org display --target-org "$ALIAS" >/dev/null 2>&1; then
  echo "The test org is missing or expired. Run scripts/renew-test-org.sh first."
  exit 1
fi
echo "Putting Shoresh into the test org..."
sf project deploy start --source-dir force-app --target-org "$ALIAS" --ignore-conflicts --wait 30 > /dev/null
sf org assign permset --name Shoresh_Scheduler --target-org "$ALIAS" > /dev/null 2>&1 || true
echo "Opening Camp Setup in your browser."
sf org open --target-org "$ALIAS" --path /lightning/n/Shoresh_Camp_Setup
