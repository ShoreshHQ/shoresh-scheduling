#!/bin/bash
# Makes a fresh scratch org with this branch's Shoresh in it and opens Camp Setup.
# Usage: scripts/try-in-scratch-org.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ALIAS=shoresh-try
echo "Creating a test org (about a minute)..."
sf org create scratch --definition-file config/project-scratch-def.json --alias "$ALIAS" \
  --duration-days 7 --target-dev-hub shoresh-devhub --wait 15 > /dev/null
echo "Putting Shoresh into it..."
sf project deploy start --source-dir force-app --target-org "$ALIAS" --wait 30 > /dev/null
sf org assign permset --name Shoresh_Scheduler --target-org "$ALIAS" > /dev/null
echo "Opening Camp Setup in your browser."
sf org open --target-org "$ALIAS" --path /lightning/n/Shoresh_Camp_Setup
