#!/usr/bin/env bash
# Replaces the one test org with a fresh one and gives GitHub its login.
# Greg's rule: exactly two Salesforce orgs, the Dev Hub and one test org. Never more.
# Every check below asks the Dev Hub itself, so it also sees orgs made from another machine
# or by a create that timed out here but finished there.
# Run when the test org expires (every 30 days) or to start clean.
# Needs: sf logged in to shoresh-devhub, gh logged in as a ShoreshHQ admin, jq.
set -euo pipefail

REPO=ShoreshHQ/shoresh-scheduling
ALIAS=shoresh-test
HUB=shoresh-devhub
cd "$(dirname "$0")/.."

# Prints one username per active test org (nothing if there are none); fails if the Dev Hub
# cannot be asked.
active_orgs() {
  local json
  json=$(sf data query -o "$HUB" -q "SELECT SignupUsername FROM ActiveScratchOrg" --json 2>/dev/null) || return 1
  jq -e '.status == 0' <<< "$json" >/dev/null || return 1
  jq -r '.result.records[].SignupUsername' <<< "$json"
}

old_user=$(sf org display --target-org "$ALIAS" --json 2>/dev/null | jq -r '.result.username // empty' || true)
active=$(active_orgs) || { echo "Stopping: could not ask the Dev Hub which test orgs exist."; exit 1; }
unknown=$(grep -vxF -- "${old_user:-<none>}" <<< "$active" | grep . || true)
if [ -n "$unknown" ]; then
  echo "Stopping: the Dev Hub has test orgs this script does not know, and the rule is one test org only:"
  echo "$unknown"
  echo "Ask Claude to sort this out before renewing."
  exit 1
fi

remaining=$(sf limits api display -o "$HUB" --json | jq -r '.result[] | select(.name=="DailyScratchOrgs") | .remaining')
if [ "${remaining:-0}" -lt 1 ]; then
  echo "Stopping before anything is deleted: the Dev Hub's daily allowance of new test orgs is used up."
  echo "The current test org still works. Try again tomorrow."
  exit 1
fi

if [ -n "$old_user" ] && grep -qxF -- "$old_user" <<< "$active"; then
  echo "Deleting the old test org..."
  sf org delete scratch --target-org "$old_user" --no-prompt >/dev/null
  after=$(active_orgs) || { echo "Stopping: could not confirm the old test org was deleted. Nothing new was created."; exit 1; }
  if grep -qxF -- "$old_user" <<< "$after"; then
    echo "Stopping: the old test org is still there after deleting it. Nothing new was created."
    exit 1
  fi
fi

echo "Creating a new 30-day test org..."
if ! sf org create scratch --definition-file config/project-scratch-def.json \
  --target-dev-hub "$HUB" --alias "$ALIAS" --duration-days 30 --wait 15 >/dev/null; then
  echo "Creating the new test org failed. There is now no test org, and the automatic checks will"
  echo "fail until there is one. Do not simply re-run: ask Claude to check the Dev Hub first, in"
  echo "case the org was created anyway after the wait ran out."
  exit 1
fi

echo "Giving GitHub its login (stored as the encrypted secret SFDX_AUTH_URL_CI)..."
url=$(sf org auth show-sfdx-auth-url --target-org "$ALIAS" --json | jq -er '.result.sfdxAuthUrl | select(startswith("force://"))')
gh secret set SFDX_AUTH_URL_CI --repo "$REPO" <<< "$url"
unset url

expires=$(sf org list --json | jq -r --arg a "$ALIAS" '.result.scratchOrgs[] | select(.alias==$a) | .expirationDate')
echo "Done. The test org expires on $expires. It is empty until the next check or try-in-test-org.sh deploys to it."
