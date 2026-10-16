#!/usr/bin/env bash
# Creates the shared test org the CI checks deploy to, and gives GitHub its login.
# Run when CI says the shared test org has expired (every 30 days), or to start over with a
# clean org. Uses one of the Dev Hub's daily test orgs. Needs: sf logged in to shoresh-devhub,
# gh logged in as a ShoreshHQ admin, jq.
set -euo pipefail

REPO=ShoreshHQ/shoresh-scheduling
ALIAS=shoresh-ci
cd "$(dirname "$0")/.."

old_user=$(sf org display --target-org "$ALIAS" --json 2>/dev/null | jq -r '.result.username // empty' || true)

echo "Creating a new 30-day shared test org..."
sf org create scratch --definition-file config/project-scratch-def.json \
  --target-dev-hub shoresh-devhub --alias "$ALIAS.new" --duration-days 30 --wait 15 >/dev/null

echo "Giving GitHub its login (stored as the encrypted secret SFDX_AUTH_URL_CI)..."
url=$(sf org auth show-sfdx-auth-url --target-org "$ALIAS.new" --json | jq -er '.result.sfdxAuthUrl | select(startswith("force://"))')
gh secret set SFDX_AUTH_URL_CI --repo "$REPO" <<< "$url"
unset url

if [ -n "$old_user" ]; then
  echo "Deleting the old shared test org..."
  sf org delete scratch --target-org "$old_user" --no-prompt >/dev/null || true
fi
sf alias set "$ALIAS=$(sf org display --target-org "$ALIAS.new" --json | jq -r '.result.username')" >/dev/null
sf alias unset "$ALIAS.new" >/dev/null

expires=$(sf org list --json | jq -r --arg a "$ALIAS" '.result.scratchOrgs[] | select(.alias==$a) | .expirationDate')
echo "Done. The shared test org expires on $expires."
