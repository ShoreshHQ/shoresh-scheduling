# CI setup: the shared test org

The "Scratch org deploy and Apex tests" check deploys every pull request to **one shared test
org** and runs the Apex tests there. (It used to create a brand-new org for every run, which
used up the Dev Hub's allowance of 6 new orgs a day.)

Two test orgs are in use at any time:

| Org | Alias | Used by |
|---|---|---|
| Shared CI test org | `shoresh-ci` | The automatic checks on every pull request |
| Hands-on test org | `shoresh-dev` | Claude sessions, and Greg trying things out |

Test orgs last at most 30 days. Renewing the shared one also gives a clean, from-scratch check,
which catches anything an org that has been deployed to many times could hide.

Until the first renewal (2026-10-16), `SFDX_AUTH_URL_CI` points at the hands-on org
`shoresh-dev` (expires 2026-10-22), because the Dev Hub's daily allowance was used up. Running
`scripts/renew-ci-org.sh` once the allowance returns gives CI its own org.

## When the shared test org expires (every 30 days)

The check fails with "Could not log in to the shared test org". Ask Claude to renew it, or run
this on this Mac from the project folder:

```bash
scripts/renew-ci-org.sh
```

It creates a new 30-day org, hands its login to GitHub as the encrypted secret
`SFDX_AUTH_URL_CI` (nothing is shown on screen or saved to a file), deletes the old org, and
prints the new expiry date. Then re-run the failed check: on the pull request, **Checks** tab →
**CI** → **Re-run all jobs**.

## What the secret can do

`SFDX_AUTH_URL_CI` is a login to a throwaway test org with no real data, so a leak can do little
harm. The older `SFDX_AUTH_URL_DEVHUB` secret (a login to the Dev Hub itself) is no longer used
by CI and can be removed.
