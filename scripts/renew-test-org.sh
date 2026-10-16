#!/usr/bin/env bash
# Replaces the one test org with a fresh one and gives GitHub its login.
# Greg's rule: exactly two Salesforce orgs, the Dev Hub and one test org. Never more.
# So this deletes the old test org BEFORE creating the new one, and refuses to run if any
# other test org exists. Run when the test org expires (every 30 days) or to start clean.
# Needs: sf logged in to shoresh-devhub, gh logged in as a ShoreshHQ admin, jq.
set -euo pipefail

REPO=ShoreshHQ/shoresh-scheduling
ALIAS=shoresh-test
cd "$(dirname "$0")/.."

old_user=$(sf org display --target-org "$ALIAS" --json 2>/dev/null | jq -r '.result.username // empty' || true)
others=$(sf org list --json | jq -r --arg u "$old_user" '.result.scratchOrgs[]? | select(.username != $u) | .username')
if [ -n "$others" ]; then
  echo "Stopping: other test orgs exist, and the rule is one test org only:"
  echo "$others"
  exit 1
fi

if [ -n "$old_user" ]; then
  echo "Deleting the old test org..."
  sf org delete scratch --target-org "$old_user" --no-prompt >/dev/null || true
fi

echo "Creating a new 30-day test org..."
sf org create scratch --definition-file config/project-scratch-def.json \
  --target-dev-hub shoresh-devhub --alias "$ALIAS" --duration-days 30 --wait 15 >/dev/null

echo "Giving GitHub its login (stored as the encrypted secret SFDX_AUTH_URL_CI)..."
url=$(sf org auth show-sfdx-auth-url --target-org "$ALIAS" --json | jq -er '.result.sfdxAuthUrl | select(startswith("force://"))')
gh secret set SFDX_AUTH_URL_CI --repo "$REPO" <<< "$url"
unset url

sf org assign permset --name Shoresh_Scheduler --target-org "$ALIAS" >/dev/null 2>&1 || true
expires=$(sf org list --json | jq -r --arg a "$ALIAS" '.result.scratchOrgs[] | select(.alias==$a) | .expirationDate')
echo "Done. The test org expires on $expires."
