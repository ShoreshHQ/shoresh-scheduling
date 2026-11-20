# Security review audit (2026-11-20)

A full audit of `force-app` and the downloadable connector (`ShoreshConnect`, built from
`connect/`) against Salesforce's AppExchange security review checklist, done before submitting.
Read with [reviewer-notes.md](reviewer-notes.md): the false-positive notes and the register of
every system-mode read and write, written for the reviewer.

Code on `main` at e4b489ee (through #445). Done by reading and searching the code, plus the
Code Analyzer reports CI makes on every change. Nothing here was tried against a live installed
package; that waits for the first package version.

## What Salesforce asks for

From the partner security review docs (checked 2026-11-20; sources in the wiki's
`salesforce/appexchange-publishing.md`):

- A Code Analyzer report from
  `sf code-analyzer run --rule-selector AppExchange --rule-selector Recommended:Security`. It need
  not be clean; every finding left must be explained as a false positive.
- A false-positive document (no set format): [reviewer-notes.md](reviewer-notes.md).
- What reviewers test: object and field permissions (CRUD/FLS), sharing, SOQL injection, XSS,
  CSRF, open redirects, secrets stored insecurely, callouts over TLS to declared endpoints,
  known-vulnerable libraries, Lightning Locker / Lightning Web Security, third-party JavaScript and
  CSS, and any client the package ships (here, the connector).
- A web-app (DAST) scan only for external web apps, mobile apps or APIs the partner runs. Shoresh
  runs none: everything lives in the camp's own org.

## Results

| Area                                               | Result                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Analyzer (AppExchange + Recommended:Security) | **0 findings** on `main` (CI run 44808539035, Code Analyzer 5.16.0). 40 suppressions, each one file, one rule, a limit and a reason, in `code-analyzer.yml`; explained in the reviewer notes.                                                                                                           |
| Sharing                                            | All 461 non-test classes are `with sharing`; none `without sharing`. 4 inner classes are `inherited sharing`, called only from their `with sharing` outer class. 35 triggers, each only hands off to a `with sharing` handler.                                                                          |
| CRUD/FLS                                           | 641 static queries: 531 `WITH USER_MODE`, 111 `WITH SYSTEM_MODE`, none without a mode. No plain DML anywhere: every write is `Database.*` with an access level (108 user mode, 16 system mode). Every system-mode use is listed with its reason in the reviewer notes. One finding (A-1, below).        |
| Permission sets                                    | 11 sets, no system permissions (no Modify All Data, View All Data, API Enabled). View All / Modify All only on Shoresh's own Season object in Shoresh Scheduler, on purpose. Every class a screen calls is in Shoresh Scheduler; each connection set opens only its own class.                          |
| SOQL injection                                     | 16 dynamic queries. Every object and field name comes from Salesforce's own describe or a fixed allow-list; every value is a bind variable. No user text is ever put into a query.                                                                                                                      |
| XSS and browser code                               | No Aura, no Visualforce. No `lwc:dom="manual"`, `innerHTML`, `eval` or string timers. No link built from camp data. Static resources are loaded only from the package. CSV and Excel exports guard against spreadsheet formulas.                                                                        |
| Third-party code                                   | SheetJS Community Edition 0.20.3 (past CVE-2023-30533 and CVE-2024-22363), byte-identical to the lock-file-pinned copy from SheetJS's own CDN. Salesforce's LWC engine (MIT) inside the connector's two pages. Fonts Inter and JetBrains Mono (SIL OFL 1.1).                                            |
| Secrets                                            | None in the code or connector. `gitleaks` over the whole git history (1,364 commits): no leaks. No Remote Site Settings, CSP Trusted Sites, Named or External Credentials, or connected apps shipped. Debug logging carries only error codes and messages.                                              |
| Callouts                                           | One, `OutgoingDoors.post`, always `callout:<Named Credential>` the camp made; the name is checked so it can't carry a path or reach another package's credential. The send history keeps no payload, headers or credentials.                                                                            |
| Web addresses (`@RestResource`, 99)                | Salesforce sign-in only (no guest access). Class access, then the capability's permission set checked in code, then user mode for every read and save. Unknown fields refused; incoming batches capped at 200 records. One finding (F1, below).                                                         |
| Flow actions (`send_*`)                            | Callable only by a holder of the matching Read permission set or Shoresh Scheduler; data read in user mode; plain error sentences.                                                                                                                                                                      |
| Connector download                                 | Comes from the camp's own org, with the person's own Salesforce sign-in kept by Salesforce's CLI. Shoresh never sees, prints or stores a token. Starts `sf` without a shell; accepts only `*.salesforce.com` sign-in hosts; uses only Node's built-ins; refuses to run when older than the camp's copy. |

## Findings and fixes

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                               | Severity      | Fix                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| F1  | Four catch blocks on the outside-system web addresses (`OutgoingDoors`, `IncomingDoors`, `IncomingSave`) called `ScreenErrors.of(e)`, which throws on a web request by design. An unexpected error there escaped as Salesforce's raw `APEX_ERROR` (exception name; a stack trace in an unpackaged org) instead of Shoresh's plain answer, and one refused record rejected a whole incoming batch sent by web address. | Low to medium | Own PR: `ScreenErrors.words(e)` at those call sites, with tests acting as a web request. |
| A-1 | `/v1/seasons` (`list_seasons`) returned camp name, dates, short-week and archived values read in system mode, while its comment said user mode. No exposure today (only Shoresh Scheduler reaches it, and it can read those fields), but it is the pattern reviewers flag.                                                                                                                                            | Low           | Own PR: those fields read in user mode.                                                  |
| A-2 | ADR 0001 point 6 listed two system-mode writes; there are nine, each with its reason in the code.                                                                                                                                                                                                                                                                                                                     | Low (docs)    | This PR: ADR 0001 point 6 lists them all; the reviewer notes hold the full register.     |
| A-3 | 36 system-mode reads in 16 files (save-time checks) have their reason only in ADR 0001 point 6, not beside the code.                                                                                                                                                                                                                                                                                                  | Low (docs)    | The reviewer notes list each file with its reason.                                       |

## For the submission, not defects

- **Declare the outgoing sends** in the questionnaire: only Named Credentials the camp creates,
  through a Flow action; no endpoint of the publisher's.
- **The connector signs in as the person, with all of their Salesforce access**, not a Shoresh-only
  access. That is the settled model (a person's AI acts as that person, with exactly their access).
  Say so in the submission and in the director guide's connect section.
- **The connector bundle (`.mcpb`) is not signed.** Optional: sign it. Once the `shoresh` namespace
  is registered, the copied prompt's lookup can also require the package's namespace.
- **Code comments credit the desktop app's repository** (`github.com/gfeitel1-maker/Scheduling-Project-`),
  inside the connector too. Attribution only.
- **Checkmarx:** the partner portal also runs its own source scan for some submissions; it can
  only be run once the partner account exists.

## Not checked

- An installed, namespaced package: field-level security, the Named Credential resolution from a
  namespaced package, and Lightning Web Security behaviour. Waits for the first package version.
- Each of the ~90 save-time system-mode reads traced to the exact words a person sees (about 15
  spot-checked).
- Live calls to the web addresses, attempts to break out of the connector's code mode, and
  SheetJS advisories published after June 2026.
- Graph Engine (Salesforce's data-flow scan, still a developer preview, recommended not required).
