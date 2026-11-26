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
`SFDX_AUTH_URL_CI`, deploys the pull request, and runs the Apex tests it needs: only for a
`batch/` pull request and the nightly run on main (both below). One check at a time, so two
pull requests never deploy over each other. Tests run one class at a time (see below). Because
the test org is also used by hand, the
deploy ignores change-tracking conflicts: the repository is always what should end up in the org.

### Changes go in as batches (Greg, 2026-11-24)

Only a pull request from a `batch/` branch uses the test org. Any other pull request gets the
quick checks and its reviews; its org check reports category `later` and passes without touching
the org. Before this, each pull request took its own 45-to-65-minute turn, and every merge sent the
others back for another (2026-11-23: three tracks, most org time spent re-testing changes that had
passed). Never merge a `later` pull request on its own.

How the coordinator puts a batch in:

1. Each change is ready: its own pull request, quick checks green, both reviews done and fixed.
2. Make `batch/<yyyy-mm-dd>-<n>` from the latest main and merge each ready branch into it
   (`git merge --no-ff`), in the order its track needs. If only the connector's built files or
   its version clash, take main's side, run `node scripts/build-connect.js` once, and commit.
   Any other clash: leave that change out and send it back to its track.
3. Run lint, then open a pull request from the batch branch to main listing each pull request
   in it. It runs every check, the test org included, judged against main as above.
4. Green: merge the batch pull request with a merge commit, never squash
   (`gh pr merge <n> --merge --match-head-commit <sha>`). Each pull request in it shows as
   merged, since its commits are now on main; close any that doesn't, with a link to the batch.
5. Red: find which change broke it, remake the batch without it, and send it back to its track.
   A change pushed again after joining a batch also means remaking the batch.

Changes a director can see still get their hands-on check on the test org after the merge, one
at a time.

### How much of the test org a pull request needs

A full check (every Apex class) takes 45 to 65 minutes (the job stops at 90), and every pull request waits for the one before it. So a
first, quick check ("Which org checks this change needs", `scripts/ci-pr-category.js`) looks at
the files the pull request changes and picks one of three:

| Category | What changed                                                                                                                                                                                                             | What the org check does                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `docs`   | Nothing the test org sees: `docs/`, `.md` files, `.claude/`, `prototypes/`, Jest and lint settings                                                                                                                       | Passes at once. Doesn't wait in line for the test org or touch it. |
| `screen` | Only screens (`force-app/main/default/lwc/`, except those Apex repeats: `MIRRORED_SCREENS` in the script) and static resources (except shared examples an Apex test reads: `APEX_READ_RESOURCES`), plus any `docs` files | Deploys to the test org (proves it deploys); no Apex tests.        |
| `full`   | Anything else: Apex, triggers, objects, fields, permission sets, tabs, CI, `scripts/`, `package.json`, `config/`                                                                                                         | Deploys and runs the Apex tests the change can affect (below).     |

When in doubt it picks `full`: a path not in the first two rows, a failure to list the
changed files, or the quick check itself failing runs everything. It uses the rules as they are
on the base branch, so a pull request that edits `scripts/ci-pr-category.js` is still judged by
the old rules (and, since it changes `scripts/`, gets `full`). The org check still reports under the same name, and passes,
in every category; its log and summary say which category it chose and why.

### Which Apex tests a `full` pull request runs

The deploy is always whole, so every class still compiles. But a pull request runs only the
Apex test classes its change can reach (`scripts/ci-apex-tests.js`, also the base branch's
copy): a test class runs if it names a changed class, or names a class that names one, and so on.
A change to a screen Apex repeats counts as a change to the Apex class that repeats it. A change
to shared examples (`ShoreshCellExamples`, `ShoreshFixedOverExamples`, `ShoreshNewRowExamples`, `ShoreshRuleExamples`, `ShoreshSeatExamples`) runs
the Apex test that reads them (`EXAMPLES_READ_BY`), never every class; a test keeps that list to every Apex class that
queries a static resource by name (`FROM StaticResource WHERE Name = '…'`), the way both read them. A pull
request that touches only electives runs a handful of classes in a few minutes; one that changes
nothing any test reaches runs none.

It runs every class instead whenever in doubt: a test data builder (`*TestData`, such as
`ShoreshTestData`), a trigger, an object or field, a permission set, `sfdx-project.json`,
`package.json`, CI files or `scripts/`, any other path outside the Apex classes, more than 40
test classes reached, or the selection itself failing. The log lists each chosen class with the
chain that reached it (`AgentElectivesTest <- AgentElectives <- ElectiveClear`), and the
summary says why. A pull request that runs only some classes shows coverage but doesn't
require it: classes it didn't run would count as 0%. A run of every class (the nightly run, or a
pull request that runs every class) checks coverage.

### The nightly full run on main (the safety net)

Merges to main run only the quick check ("LWC Jest and Code Analyzer"). That check is a summary:
it passes only when its jobs, run side by side, pass ("LWC Jest", "LWC Jest, as if the
package had its namespace", "Code Analyzer and Apex file checks", and "Connector on ..." for each
system); open the red one to see why. Every night at 07:15 UTC
(03:15 New York time in summer, 02:15 in winter) the full check runs on main: deploy and every
Apex test. Whatever a pull request skipped (all Apex tests for `docs` and `screen`, the ones its
change can't reach for `full`) is tested by the next morning. It
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
  (`jest/namespace.js`). The engine's seed sweeps (listed in `jest.namespaced.config.js`) are left
  out of this run only: they read setup through the same code the other suites already cover here.

Neither proves the namespaced org works; that is checked after the namespace is registered.

## Checks that catch org-only mistakes early (in "LWC Jest and Code Analyzer")

The test org is shared and a full run takes 45 to 65 minutes, so these checks catch, with no org,
mistakes that used to show up only there or at AppExchange security review:

- **AppExchange security-review rules.** The Code Analyzer step runs `Recommended` plus the scan
  Salesforce documents for security review (`--rule-selector AppExchange --rule-selector
Recommended:Security`), and fails on moderate (3) or worse. A second step runs the
  security-review scan on its own; both reports are in the `code-analyzer-report` artifact
  (`code-analyzer.html`, `appexchange-security-review.html`). Known false positives are suppressed
  in `code-analyzer.yml`, each for one file or folder, one rule, a limit and a reason: the `Key__c` /
  `QuestionKey__c` lookup keys (`ProtectSensitiveData`: not secrets) and Jest tests that fake
  real browser events (`AvoidLwcBubblesComposedTrue`). Suppression paths are relative to
  `force-app`, the scanned folder. Suppressed findings are not in the reports.
- **The connector, linted and scanned from its source.** It ships as the `ShoreshConnect` static
  resource, and the scan above skips static resources. So `npm run lint` also covers `connect/`
  and `scripts/` with Node's rules (`eslint.config.js`; the week view's component under
  `connect/view/lwc` gets the screens' rules). In the shipped connector, `child_process` gives only
  `execFile` (a program and its arguments as a list: no `exec`, `spawn` or `shell` option), and
  nothing runs text as code (`eval`, `new Function`, `vm`) except `script.js`, whose walled-off
  worker runs the AI's code mode (API-1.119). A second step, `npm run scan:connect`, runs the
  security-review rules (`AppExchange`, `Recommended:Security`) on `connect/`; its report is
  `connector-security-review.html` in the same artifact. The built copy of the connector's `.js`
  files must match `connect/` (`connect.test.js`, `shipsInsideThePackage`); its engine modules and
  pages are checked against their sources by the tests beside it.
  Not covered: the third-party code inside the resource (SheetJS, and the LWC runtime built into
  the week view and printout pages). Code Analyzer's known-vulnerable-library check doesn't
  recognise either (tried: an old SheetJS goes unflagged), so their versions are kept by hand
  (docs/adr, NOTICE). Code Analyzer's PMD can't read some modern JavaScript; it logs a "processing
  error" for those files and goes on (its only JavaScript rule there is for screens' events).
- **Every test asserts, and none is focused or switched off** (`npm run lint`, for every
  `__tests__` folder: the screens', the connector's, the scripts' and `jest/__tests__`).
  `it.only` would run that test alone and CI would stay green; `it.skip`/`xit` would stop one
  quietly. A test must complete an `expect(...).toX(...)`, or call one of the helpers listed in
  `eslint.config.js` that does (`expectCleanGrid`, `checkGrid`, ...); a new asserting helper is
  added to that list by name.
- **Every Apex class and trigger has its `-meta.xml`** (`npm run check:meta`,
  `scripts/apex-meta-files.js`), and no `-meta.xml` is left without its file. Without one, a class
  is left out of every deploy and dry-run with no error, so it never compiles (#55).
- **No Apex variable takes over a class or static's name** (`npm run check:name-clash`,
  `scripts/apex-name-clash.js`). Apex ignores case, and a variable beats a class: inside the scope
  of a field `campLabels`, `CampLabels.forCamp(...)` means the field, and the class doesn't compile
  (#46; also a local `targets` before `TARGETS.keySet()`, #48). Only uses with a dot count, and only
  under a different spelling. Opt out on the declaration's line, with a reason:
  `// apex-name-clash-ok: <why>`.
- **No Apex name that is a reserved word** (`npm run check:reserved-words`,
  `scripts/apex-reserved-words.js`): a local, parameter, field, class, interface or enum named
  with one of Salesforce's Apex reserved keywords, ignoring case (`Integer number`, #46;
  `List<String> into`). The list is the Apex Developer Guide's "Reserved Keywords" page; its
  special keywords that can be names (`count`, `first`, `order`, ...) are allowed.
- **What a screen sends to Apex arrives** (`npm run check:aura-inputs`,
  `scripts/apex-aura-inputs.js`; runs in CI as part of the Jest step, through
  `scripts/__tests__/apex-aura-inputs.test.js`). A class an `@AuraEnabled` method takes, and every
  class it holds, has properties (`{ get; set; }`), not plain fields: Salesforce leaves a plain
  field empty with no error, and Apex tests and Jest never see it (every Update to match setup was
  refused that way, real-browser check 2026-10-20). Opt out a field the server never reads, on one
  of the three lines above it: `// apex-aura-inputs-ok: <why>`.
- **Only one stylesheet reaches inside Salesforce's fields** (`npm run check:salesforce-insides`,
  `scripts/salesforce-insides.js`): any static resource stylesheet other than `ShoreshTable.css`,
  or a light DOM component's CSS, that names an SLDS class (`.slds-input`) fails. How Salesforce
  builds its fields inside isn't supported and may change (ADR 0015 choice 11).
- **Accessibility in Jest** (`@sa11y/jest`, axe-core rules): the main screens' render tests
  (Manual Build, Generated, Schedules, Versions, the setup screen and its tables) end with
  `await expect(element).toBeAccessible()`. jsdom has no layout, so focus loss, contrast and
  tap-target size are still review items.

Not covered: anything else only the org's compiler knows (types, method signatures), and
sharing and query limits at run time.

## Engine branch coverage (in "LWC Jest")

The LWC Jest job runs `npm run test:unit:coverage`: every test, measuring branch coverage of the
three engines (`shoreshEngine`, `shoreshElectiveEngine`, `shoreshImportEngine`), each folder as a
whole. It fails when one drops under its line in `jest.config.js` (`coverageThreshold`). The code
review of 2026-11-25 set the bar at 90%. The Generated Schedule and import engines are held at 90%
(92.2% and 90.2% that day); the elective engine at its level that day, 89.9% (the seat matching's
rare fallback search is untested), and it may only go up, to 90. The margins are small: a change
that adds untested branches to the import or elective engine fails this check until it is tested.
The job prints each engine file's figures, uncovered lines included. Run on a few folders only,
the script fails on the engines it didn't run; it prints text only (no HTML report). On a Mac the
engines' tests take as long with coverage as without (164 s and 168 s); on CI the job took 13 and
16 minutes in its first two runs, against 8.5 to 13.5 without coverage, so any extra is within
the runners' own variation.

Not run by CI: the engine's full seed sweeps (`npm run test:engine:full`, about 15 minutes): the
desktop differential's camps 101-400, the search proof check 51-150, properties 101-300, across
61-200 and the ported spare-cell options 26-100. CI runs the first, smaller sample of the same
seeds. Run the full sweep before changing the engine (docs/engine/protocol.md).

## The AI connector on macOS, Windows and Linux ("Connector on ...")

The connector (`connect/`) runs on the director's own computer, so its Jest suite also runs on
Windows and macOS runners, besides Linux: one check per system ("Connector on ubuntu-24.04",
"windows-2025", "macos-15"), all counted in "LWC Jest and Code Analyzer". Each then installs the Salesforce command line with npm and has the
connector find and start it, as it does on a director's computer. Not covered: the Salesforce
installer's Windows layout and its updates (unit-tested only, from Salesforce's own Windows files), the Yes dialogs (nobody can click them in CI), and
a real sign-in.

## Real-browser accessibility check (by hand, not in CI)

`node scripts/a11y-browser-check.mjs` drives the Shoresh tab in the test org in Google Chrome
with the keyboard only (Camp setup, Manual Build, Generated Schedule, Versions, Update to match
setup, Publish) and writes `docs/a11y-browser-check-<date>.md`: where focus lands after each menu,
dialog and tool closes, what the live regions say, whether every toolbar action is reachable with
Tab, and axe-core's findings on each screen. Run it on this Mac from your worktree after
`npm ci`, with Chrome installed and `sf` signed in to `shoresh-test`: deploy what you want checked
first, and run it only when no CI run is using the test org (it refuses to start while one is
running or queued, and always in CI). It signs in with `sf org open --url-only` and never shows,
logs or saves that link. It works on its own made-up camp, _Keyboard check camp (made up)_ (the
walkthrough's seed under another name, so _Sample Camp (made up)_ is left alone). The first run
adds one week to it; every later run reuses that week, deleting its drafts and saved versions
first (published schedules are kept history and stay), so the camp gains no more weeks. It also
deletes and adds again a fixed activity _Assembly_ there so that week stops matching setup, and
adds a program card and deletes it again. It opens Electives and Elective seats from the menu
(repo ADR 0018 choice 59) with an elective set of its own, _Check chugim_, made by Apex and
deleted after, and Bring in choices from Elective seats; `--only electives` runs just that step, and `--only lists` just Import a list on Groups, Programs and Electives. `--headed` shows the browser; screenshots of failures go to a temporary folder
(`--shots <dir>` to choose).

## Running Apex tests: one class at a time

Run Apex tests with `npm run test:apex` (`node scripts/run-apex-tests.mjs`; add
`-- --target-org shoresh-test` when the test org is not your default org). It runs each test
class on its own, directly (synchronously), and prints one line per class, a summary, and the
coverage of each of this repository's classes and triggers, lowest first, and of all of them.
The check fails below 75% in all, or below 90% in any one class. The classes that were under 90%
when that check came in (2026-11-25) are pinned at their coverage then in
`scripts/apex-coverage-floors.json` (rounded down): each must stay at or above its floor. A floor
may only go up and a class leaves the file once it reaches 90%; the run names any floor that can
be raised, and nothing but review stops a floor from being lowered, so a pull request that lowers
one must say why. CI uses the same script. Add `--class-names A,B` to run only those classes (coverage is
then shown, not required).

Why: a queued run (`sf apex run test --test-level RunLocalTests`) counts every test class
against the test org's **daily allowance of 500 queued test classes** (a rolling 24 hours).
CI and every working session share the one test org, so on 2026-10-16 a busy day used it up,
and every queued run then failed at once with "UNKNOWN_EXCEPTION" before any test started.
Direct single-class runs do not count against that allowance. **Never queue a full
`RunLocalTests` run in the test org.** To see what is left:
`sf org list limits --target-org shoresh-test` (`DailyAsyncApexTests`).

Coverage is read once, after the last class, from the org's running totals for this
repository's classes and triggers, so it is close to, but not exactly, what a single full run
would report. The script starts the Salesforce CLI only twice (to read the login; twice more if the session expires mid-run) and sends each
class's run itself, with the same call the CLI's `--synchronous` run makes; each class's line
shows how many seconds it took.

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

Current test org: created 2026-11-19, expires 2026-12-19, on the new Dev Hub (Developer Edition org 00Dbm000014tFy6, signed up 2026-10-20). The old Dev Hub (00DgK00000VLOOr) was frozen by Salesforce on 2026-10-20 because a sign-in came through a VPN, and with one admin it could not be unfrozen. Turn any VPN off before signing in to Salesforce.

## What the secret can do

`SFDX_AUTH_URL_CI` is a login to a throwaway test org with no real data, so a leak can do little
harm. The older `SFDX_AUTH_URL_DEVHUB` secret (a login to the Dev Hub itself) is not used by CI
and can be removed.
