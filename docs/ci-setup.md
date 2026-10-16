# Salesforce orgs and CI setup

**Rule (Greg, 2026-10-16): exactly two Salesforce orgs. Never create a third.**

| Org | Alias | Used for |
|---|---|---|
| Dev Hub (Greg's Developer Edition org) | `shoresh-devhub` | The main org: owns the test org, and later the package |
| The test org | `shoresh-test` | Everything else: the automatic checks on every pull request, Claude sessions, and Greg trying things out |

No extra orgs for experiments, prototypes, or parallel checks: those deploy to the test org too.
The scripts enforce this: `scripts/renew-test-org.sh` deletes the old test org before creating
the new one and refuses to run if any other test org exists, and `scripts/try-in-test-org.sh`
deploys to the existing test org instead of creating one.

## How the checks use it

The "Scratch org deploy and Apex tests" check logs in to the test org with the encrypted secret
`SFDX_AUTH_URL_CI`, deploys the pull request, and runs all Apex tests. One run at a time, so two
pull requests never deploy over each other. Because the test org is also used by hand, the
deploy ignores change-tracking conflicts: the repository is always what should end up in the org.

## When the test org expires (every 30 days)

The check fails with "Could not log in to the shared test org". Ask Claude to renew it, or run
this on this Mac from the project folder:

```bash
scripts/renew-test-org.sh
```

It deletes the old test org, creates a new 30-day one, hands its login to GitHub as
`SFDX_AUTH_URL_CI` (nothing is shown on screen or saved to a file), and prints the new expiry
date. Then re-run the failed check: on the pull request, **Checks** tab → **CI** →
**Re-run all jobs**. Each renewal is also a clean from-scratch check.

Current test org: created 2026-10-16, expires 2026-11-15.

## What the secret can do

`SFDX_AUTH_URL_CI` is a login to a throwaway test org with no real data, so a leak can do little
harm. The older `SFDX_AUTH_URL_DEVHUB` secret (a login to the Dev Hub itself) is not used by CI
and can be removed.
