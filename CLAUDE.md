# Shoresh Scheduling

Step 1 of Shoresh: a free, Salesforce-native day-camp scheduling app. Design, glossary, and
decisions live in the wiki (`~/Dev/wiki`: `projects/shoresh-scheduling-sf.md`, its build log,
`projects/shoresh-scheduling-data-model.md`, `decisions/`). Read the build log before starting.

- **Exactly two Salesforce orgs: the Dev Hub (`shoresh-devhub`) and one test org
  (`shoresh-test`).** Never create another org, for any reason. Everything (CI, trying things,
  prototypes) deploys to the test org. See `docs/ci-setup.md`.
- Build choices for this repo: `docs/adr/`. Walkthrough for Greg: `docs/try-camp-setup.md`.
- No namespace, package, or package version without Greg's go-ahead.
- **Merging is by hand** (Greg, 2026-10-16): a PR is merged (squash) only after both CI checks pass
  on its latest commit and an independent review is done. GitHub auto-merge stays off: on the free
  plan this private repo cannot require checks, so auto-merge would not wait for the tests.
- **Never queue a full Apex test run in shoresh-test** (no `--test-level RunLocalTests`, no
  `sf apex run test` without `--synchronous`). The org allows 500 queued test-class runs per rolling
  24 hours, and past that every queued run fails at once. Run tests one class at a time with
  `sf apex run test --synchronous --class-names <Class> --target-org shoresh-test`; those don't count.
  CI runs every class that way (`scripts/run-apex-tests.mjs`, see `docs/ci-setup.md`).
- **Don't use shoresh-test while a CI run is using it.** CI runs take turns with each other, but
  not with sessions. Before deploying or running tests there, check
  `gh run list --repo ShoreshHQ/shoresh-scheduling --status in_progress` (and `--status queued`), and
  wait until no "Scratch org deploy and Apex tests" job is running.
