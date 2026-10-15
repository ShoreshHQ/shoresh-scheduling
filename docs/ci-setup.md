# CI setup: connecting GitHub to the Dev Hub (one time, Greg)

Every pull request gets its own short-lived Salesforce test org (a scratch org). GitHub can
only create one if it can log in to the Dev Hub. That login is a secret, so Greg sets it up
once by hand. Until then the "Scratch org deploy and Apex tests" check fails with the message
"The SFDX_AUTH_URL_DEVHUB secret is not set".

## What you need

- This Mac, with the Salesforce CLI logged in to the Dev Hub (it is: alias `shoresh-devhub`).
- The GitHub CLI logged in as `gfeitel1-maker` (it is).

## Steps

1. Open the Terminal app (or a terminal tab in the Claude app).
2. Paste this single command and press Return. It reads the Dev Hub login from the Salesforce
   CLI and hands it straight to GitHub as an encrypted secret. Nothing is shown on screen or
   saved to a file.

   ```bash
   sf org display --target-org shoresh-devhub --verbose --json | jq -r .result.sfdxAuthUrl | gh secret set SFDX_AUTH_URL_DEVHUB --repo ShoreshHQ/shoresh-scheduling
   ```

   You should see one line like: `✓ Set Actions secret SFDX_AUTH_URL_DEVHUB for ShoreshHQ/shoresh-scheduling`.
   If you see `command not found: jq`, run `brew install jq` and try again.
3. Check it is there:

   ```bash
   gh secret list --repo ShoreshHQ/shoresh-scheduling
   ```

   The list should show `SFDX_AUTH_URL_DEVHUB` with today's date. (GitHub never shows the
   value again, only the name.)
4. Re-run the failed check: open the pull request on GitHub, click the **Checks** tab, choose
   **CI**, then **Re-run all jobs**. Or tell Claude "the secret is set" and Claude will re-run it.

## What this secret can do

It is a login to the Dev Hub org (Greg's own Developer Edition org, separate from any employer
org). Anyone who can change this repository's workflows could use it, so the repository stays
private with Greg as the only admin. If it ever leaks: in the Dev Hub, Setup → Connected Apps
OAuth Usage → Salesforce CLI → Revoke, then repeat the steps above.

A later improvement is a dedicated connected app with a certificate (JWT login) so the CI login
can be revoked separately from Greg's own CLI login.
