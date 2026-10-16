# Shoresh Scheduling

Step 1 of Shoresh: a free, Salesforce-native day-camp scheduling app. Design, glossary, and
decisions live in the wiki (`~/Dev/wiki`: `projects/shoresh-scheduling-sf.md`, its build log,
`projects/shoresh-scheduling-data-model.md`, `decisions/`). Read the build log before starting.

- **Exactly two Salesforce orgs: the Dev Hub (`shoresh-devhub`) and one test org
  (`shoresh-test`).** Never create another org, for any reason. Everything (CI, trying things,
  prototypes) deploys to the test org. See `docs/ci-setup.md`.
- Build choices for this repo: `docs/adr/`. Walkthrough for Greg: `docs/try-camp-setup.md`.
- No namespace, package, or package version without Greg's go-ahead.
