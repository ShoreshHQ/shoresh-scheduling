# Shoresh Scheduling

Day-camp scheduling for Salesforce: step 1 of Shoresh, a free AppExchange app.

Design, glossary, and decisions live in the Shoresh wiki (`projects/shoresh-scheduling-sf`,
`projects/shoresh-scheduling-data-model`, `decisions/`).

## Try it

`scripts/try-in-test-org.sh` puts this branch into the test org and opens
the **Shoresh** tab (needs the Dev Hub login, alias `shoresh-devhub`). A click-by-click walkthrough
is in [docs/try-camp-setup.md](docs/try-camp-setup.md). Build choices are in
[docs/adr](docs/adr).

## Checks on every pull request

- LWC Jest unit tests and Salesforce Code Analyzer.
- Deploy to the test org, then run all Apex tests. There are exactly two Salesforce orgs, the
  Dev Hub and one test org; see [docs/ci-setup.md](docs/ci-setup.md).

## Not done yet (needs Greg)

No namespace is registered and no package has been created. `sfdx-project.json` names the
package, but `sf package create` and any package version wait for Greg's go-ahead.
