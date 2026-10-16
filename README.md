# Shoresh Scheduling

Day-camp scheduling for Salesforce: step 1 of Shoresh, a free AppExchange app.

Design, glossary, and decisions live in the Shoresh wiki (`projects/shoresh-scheduling-sf`,
`projects/shoresh-scheduling-data-model`, `decisions/`).

## Try it

`scripts/try-in-scratch-org.sh` makes a fresh test org with this branch in it and opens
**Camp Setup** (needs the Dev Hub login, alias `shoresh-devhub`). A click-by-click walkthrough
is in [docs/try-camp-setup.md](docs/try-camp-setup.md). Build choices are in
[docs/adr](docs/adr).

## Checks on every pull request

- LWC Jest unit tests and Salesforce Code Analyzer.
- A fresh scratch org from the Dev Hub: deploy, then run all Apex tests. Needs a one-time
  secret; see [docs/ci-setup.md](docs/ci-setup.md).

## Not done yet (needs Greg)

No namespace is registered and no package has been created. `sfdx-project.json` names the
package, but `sf package create` and any package version wait for Greg's go-ahead.
