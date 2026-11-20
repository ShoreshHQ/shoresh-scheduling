# Security review audit (2026-11-20)

Shoresh's own audit of `force-app` and the downloadable connector (`ShoreshConnect`, built from
`connect/`) against Salesforce's AppExchange security review checklist, done before submitting.
It is internal: it records findings, open items and what was not checked. What goes to the
reviewer is [reviewer-notes.md](reviewer-notes.md): the false-positive notes and the register of
system-mode reads and writes.

Code on `main` at e4b489ee (through #445). Done by reading and searching the code, independently
reviewed, plus Code Analyzer scans. Nothing here was tried against an installed package; that
waits for the first package version.

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

**Code Analyzer.** CI runs the required selection on every change. On `main` (CI run
44808539035, Code Analyzer 5.16.0): 0 findings, with 40 suppressions in `code-analyzer.yml`, each
one file or folder, one rule, a limit and a reason. CI's scan leaves out `staticresources/`
(`code-analyzer.yml`), so the static resources were scanned separately with the same selection
(2026-11-20): 2 findings, both `@lwc/lwc/no-inner-html` inside SheetJS's own minified code
(`SheetJS.js` and the connector's copy, `engine.SheetJS.cjs`); retire-js found no
known-vulnerable library. Both are explained in the reviewer notes.

**Sharing.** All 461 non-test classes are `with sharing`, except 4 inner classes that are
`inherited sharing` and are called only from their `with sharing` outer class; none is
`without sharing`. The 30 triggers only hand off to `with sharing` classes.

**CRUD/FLS.** 641 static queries: 530 `WITH USER_MODE`, 111 `WITH SYSTEM_MODE`, none without a
mode. No plain DML: the 108 writes are all `Database.*` with an access level (94 user mode, 14
system mode); `Database.emptyRecycleBin`, which takes no access level, follows a user-mode delete.
Every system-mode use is in the reviewer notes' register, with its reason.

**Permission sets.** 11 sets, no system permissions. View All / Modify All only on Shoresh's own
Season object, in Shoresh Scheduler, on purpose. Every class the screens call is in Shoresh
Scheduler; each connection set opens only its own class, read or create and edit, never delete.

**SOQL injection.** 15 dynamic queries in 13 classes. Every object and field name comes from
Salesforce's own describe or a fixed allow-list; every value is a bind variable.

**XSS and browser code.** No Aura, no Visualforce. No `lwc:dom="manual"`, `innerHTML`, `eval` or
string timers in Shoresh's components or the connector's pages. No link built from camp data.
Static resources load only from the package. CSV and Excel exports guard against formulas.

**Third-party code.** SheetJS Community Edition 0.20.3 (past CVE-2023-30533 and CVE-2024-22363),
byte-identical to the lock-file-pinned copy from SheetJS's own CDN. Salesforce's LWC engine (MIT)
inside the connector's two pages. Fonts Inter and JetBrains Mono (SIL OFL 1.1).

**Secrets.** None in the code or connector. `gitleaks` over every branch's history (1,366 commits
with changes): no leaks. No Remote Site Settings, CSP Trusted Sites, Named or External
Credentials, or connected apps shipped. Debug logging carries only error codes and messages.

**Callouts.** One, `OutgoingDoors.post`, always `callout:<Named Credential>` the camp made; the
name is checked so it can't carry a path or reach another package's credential. The send history
keeps no payload, headers or credentials.

**Web addresses (99 `@RestResource` classes) and Flow actions (`send_*`).** Salesforce sign-in
only, no guest access. Class access, then the capability's permission set checked in code, then
user mode for every read and save. Unknown fields refused; incoming batches capped at 200 records.

**Connector.** Comes from the camp's own org, with the person's own Salesforce sign-in kept by
Salesforce's CLI. Shoresh never sees, prints or stores a token. Starts `sf` without a shell;
accepts only `*.salesforce.com` sign-in hosts; uses only Node's built-ins; refuses to run when
older than the camp's copy.

## Findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                               | Severity      | State                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Four catch blocks on the outside-system web addresses (`OutgoingDoors`, `IncomingDoors`, `IncomingSave`) called `ScreenErrors.of(e)`, which throws on a web request by design. An unexpected error there escaped as Salesforce's raw `APEX_ERROR` (exception name; a stack trace in an unpackaged org) instead of Shoresh's plain answer, and one refused record rejected a whole incoming batch sent by web address. | Low to medium | Fixed in its own PR, with tests.                                                                                                               |
| A-1 | `/v1/seasons` (`list_seasons`) returned camp name, dates, short-week and archived values read in system mode (`OutgoingRows.seasonsSeen`), while its comment said user mode. No exposure today: only Shoresh Scheduler reaches it, and it can read those fields.                                                                                                                                                      | Low           | Fixed in its own PR, with tests.                                                                                                               |
| A-2 | ADR 0001 point 6 listed two system-mode writes; there are nine.                                                                                                                                                                                                                                                                                                                                                       | Low (docs)    | Fixed here: ADR 0001 lists them all.                                                                                                           |
| A-3 | The save-time checks' system-mode reads have their reason only in ADR 0001 point 6, not beside the code; `CampLabelSaves` and `CampClock` have none either.                                                                                                                                                                                                                                                           | Low (docs)    | The register lists each with its reason.                                                                                                       |
| A-4 | A save-time check reads in system mode, and some refusals name a value read that way (for example a location's "groups that fit"). Someone whose admin hid that field could see its value in a refusal. Only reachable if an admin removes Shoresh's own fields from someone who has Shoresh Scheduler.                                                                                                               | Low           | **Open: fix before submitting** (show only values read in user mode). Reviewers flag field values reaching a person past field-level security. |

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
- **Checkmarx:** Salesforce's own source scan, run from the partner portal; it needs the partner
  account.

## Not checked

- An installed, namespaced package: field-level security, the Named Credential resolution from a
  namespaced package, and Lightning Web Security behaviour. Waits for the first package version.
- Every save-time system-mode read traced to the exact words a person sees (about 15
  spot-checked; see A-4).
- Live calls to the web addresses, and attempts to break out of the connector's code mode.
- Graph Engine (Salesforce's data-flow scan, a developer preview, recommended but not part of the
  required selection).
