# Salesforce orgs and CI setup

**Rule (Greg, 2026-10-16): exactly two Salesforce orgs. Never create a third.**

| Org                                    | Alias            | Used for                                                                                                 |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| Dev Hub (Greg's Developer Edition org) | `shoresh-devhub` | The main org: owns the test org, and later the package                                                   |
| The test org                           | `shoresh-test`   | Everything else: the automatic checks on every pull request, Claude sessions, and Greg trying things out |

No extra orgs for experiments, prototypes, or parallel checks: those deploy to the test org too.
The scripts enforce this: `scripts/renew-test-org.sh` deletes the old test org before creating
the new one and refuses to run if any other test org exists, and `scripts/try-in-test-org.sh`
deploys to the existing test org instead of creating one.

## How the checks use it

The "Scratch org deploy and Apex tests" check logs in to the test org with the encrypted secret
`SFDX_AUTH_URL_CI`, deploys the pull request, and runs all Apex tests. One check at a time, so two
pull requests never deploy over each other. Tests run one class at a time (see below). Because
the test org is also used by hand, the
deploy ignores change-tracking conflicts: the repository is always what should end up in the org.

## Running Apex tests: one class at a time

Run Apex tests with `node scripts/run-apex-tests.mjs` (add `--target-org shoresh-test` when the
test org is not your default org). It runs each test class on its own, directly
(synchronously), and prints one line per class, a summary, and the coverage of this
repository's classes and triggers (the check fails below 75%). CI uses the same script.

Why: a queued run (`sf apex run test --test-level RunLocalTests`) counts every test class
against the test org's **daily allowance of 500 queued test classes** (a rolling 24 hours).
CI and every working session share the one test org, so on 2026-10-16 a busy day used it up,
and every queued run then failed at once with "UNKNOWN_EXCEPTION" before any test started.
Direct single-class runs do not count against that allowance. **Never queue a full
`RunLocalTests` run in the test org.** To see what is left:
`sf org list limits --target-org shoresh-test` (`DailyAsyncApexTests`).

Coverage is read from the org's running totals for this repository's classes and triggers,
so it is close to, but not exactly, what a single full run would report.

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
