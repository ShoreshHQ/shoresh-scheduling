#!/bin/bash
# Puts this branch's Shoresh into the one test org and opens the Shoresh tab.
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
# Giving yourself the Shoresh permission set fails harmlessly if you already have it.
if ! out=$(sf org assign permset --name Shoresh_Scheduler --target-org "$ALIAS" --json 2>&1); then
  if ! grep -q "Duplicate PermissionSetAssignment" <<< "$out"; then
    echo "Could not give you the Shoresh permission set:"
    echo "$out"
    exit 1
  fi
fi
echo "Opening the Shoresh tab in your browser."
sf org open --target-org "$ALIAS" --path /lightning/n/Shoresh_Camp_Setup
