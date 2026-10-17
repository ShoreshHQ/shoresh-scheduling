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
- **No field or object names written as text** (`"StartDate__c"`, `record.StartDate__c`, `'Week__c'`,
  `day + '__c'`): once the package has its `shoresh` namespace they find nothing. LWC takes names
  from `c/shoreshSchema` (generated: `node scripts/generate-shoresh-schema.js`); Apex uses typed
  references and `ShoreshSchema`; stored names (import logs, answer keys) are bare local names.
  `npm run check:namespace` fails on any one, and every component's tests also run namespaced
  (`npm run test:unit:namespaced`). Rules and guards: `docs/adr/0009-namespace-safe-names.md`.
- **Salesforce skills** in `.claude/skills/` are a vetted copy of Salesforce's sf-skills
  (`.claude/skills/SOURCES.md`). Each starts with "Shoresh overrides (these win)": those lines and
  this file beat the skill text. Never install sf-skills plugins.
- **Every PR also gets the `salesforce-reviewer` agent** (`.claude/agents/salesforce-reviewer.md`,
  read-only) alongside the general review: AppExchange security items, user mode and system-mode
  justification, package hygiene, accessibility, design-guide wording.
