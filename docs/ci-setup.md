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
`SFDX_AUTH_URL_CI`, deploys the pull request, and runs all Apex tests (unless the pull request
doesn't need them, see the next section). One check at a time, so two
pull requests never deploy over each other. Tests run one class at a time (see below). Because
the test org is also used by hand, the
deploy ignores change-tracking conflicts: the repository is always what should end up in the org.

### How much of the test org a pull request needs

A full check takes about 20 minutes, and every pull request waits for the one before it. So a
first, quick check ("Which org checks this change needs", `scripts/ci-pr-category.js`) looks at
the files the pull request changes and picks one of three:

| Category | What changed                                                                                                     | What the org check does                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs`   | Nothing the test org sees: `docs/`, `.md` files, `.claude/`, `prototypes/`, Jest and lint settings               | Passes at once. Doesn't wait in line for the test org or touch it. |
| `screen` | Only screens (`force-app/main/default/lwc/`) and static resources, plus any `docs` files                         | Deploys to the test org (proves it deploys); no Apex tests.        |
| `full`   | Anything else: Apex, triggers, objects, fields, permission sets, tabs, CI, `scripts/`, `package.json`, `config/` | Deploys and runs every Apex test, as before.                       |

When in doubt it picks `full`: a path not in the first two rows, or a failure to list the
changed files, runs everything. The org check still reports under the same name, and passes,
in every category; its log and summary say which category it chose and why.

### The nightly full run on main (the safety net)

Merges to main run only the quick check ("LWC Jest and Code Analyzer"). Every night at 07:15 UTC
(03:15 New York time in summer, 02:15 in winter) the full check runs on main: deploy and every
Apex test. Whatever a `docs` or `screen` pull request skipped is tested by the next morning. It
waits its turn for the test org like any pull request.

A failed nightly run shows as a red run in the repository's **Actions** tab (filter by event
"schedule"); GitHub also emails whoever last changed the schedule. The coordinator session
checks the latest nightly run each morning:
`gh run list --repo ShoreshHQ/shoresh-scheduling --workflow CI --event schedule --limit 1`.

To start a full run by hand (for example right after a risky merge): **Actions** tab → **CI** →
**Run workflow** → branch `main` → **Run workflow**, or
`gh workflow run CI --repo ShoreshHQ/shoresh-scheduling --ref main`.

GitHub turns scheduled runs off after 60 days with no commits to the repository; the Actions tab
then offers to turn it back on.

### Waiting in line for the test org

When several pull requests are open, their checks take turns: the rest wait (shown as
"Waiting" / "Pending" on the pull request) and start in the order they arrived. Nothing needs
pushing again. This is the `queue: max` setting on the check in `.github/workflows/ci.yml`,
which lets up to 100 checks wait.

Without it, GitHub lets only **one** check wait: when a third arrived, the waiting one was
cancelled ("Canceling since a higher priority waiting request for shared-test-org exists"),
and with five or six pull requests open, checks kept getting cancelled (2026-10-17).

Pushing again to a pull request still cancels that pull request's older check; only the newest
version of each pull request is checked. A `docs` pull request doesn't join the line at all.

## Namespace-safety checks (in "LWC Jest and Code Analyzer")

Once the package has its `shoresh` namespace, Salesforce names every custom field
`shoresh__Field__c`, so code that writes `StartDate__c` as text finds nothing (blank cells, failed
saves). Every such spelling has been replaced; two checks keep it that way
(`docs/adr/0009-namespace-safe-names.md`):

- **No names written as text** (`npm run check:namespace`, `scripts/namespace-safety.js`): fails
  on any name ending `__c`, `__r`, `__mdt`, `__e`, `__Share`, `__History`, `__x` or `__b` written
  as text in LWC JavaScript or templates, or in an Apex string literal, and on Apex `getName()`.
  Tests, comments, `c/shoreshSchema` and `ShoreshSchema.cls` don't count. It allows none.
- **Namespaced Jest run** (`npm run test:unit:namespaced`): every component's tests run with every
  `@salesforce/schema` import named `shoresh__...`; new components are included automatically.
  Tests hand records in through `nsRecord()` and check what is sent through `bareRecord()`
  (`jest/namespace.js`).

Neither proves the namespaced org works; that is checked after the namespace is registered.

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
