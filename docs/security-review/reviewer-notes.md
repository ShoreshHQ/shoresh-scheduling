# Notes for the security reviewer

Shoresh is a free, Salesforce-native scheduling app for day camps. Everything it stores lives in
the camp's own org; the publisher runs no server and receives no data. These notes explain each
finding a scanner reports or a reviewer is likely to ask about, and list every place the code uses
system mode, with the reason. The audit itself: [README.md](README.md).

## How access works, in one paragraph

Every class is `with sharing` (4 inner classes are `inherited sharing`, called only from their
`with sharing` outer class). Every query names its mode and every save uses `Database.*` with an
access level; user mode is the default, so object, field and record access are the person's own.
Shoresh Scheduler is the one permission set for people (camp staff); ten narrow permission sets,
one per capability, are for systems a camp connects (each opens only its own Apex class, read-only
or create and edit, no delete, no system permissions). Season__c is Private with no sharing rule
shipped; the scheduling objects are controlled by their season, so seeing a season means seeing
what is in it. The camp's own words, saved import answers and learned answers (`CampLabel__c`,
`ImportAnswer__c`, `LearnedEvent__c`) are controlled by their camp, and `Camp__c` is Public
Read/Write inside the org: a camp is the organization, so everyone with Shoresh shares them. System mode, where used, skips object and field permissions only, never record sharing.

## Code Analyzer suppressions (`code-analyzer.yml`)

The AppExchange + Recommended:Security scan reports 0 findings with these suppressions. Each names
one file or folder, one rule and a maximum count, so a new hit of the same rule elsewhere still fails.

| Rule                                                                                 | Where                                               | Why it is not a risk                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pmd:ProtectSensitiveData` (16)                                                      | `Key__c`, `QuestionKey__c`, `PublishKey__c` fields  | Duplicate-check lookup keys built from visible values (season and name, week and date). Not secrets: no password, token or personal data.         |
| `pmd:FieldNamingConventions` (10)                                                    | The API's record classes (`Incoming*`, `Outgoing*`) | Fields are the plain-English names outside systems and Flows see (`camper_name`, `first_choice`), so they are snake case on purpose. Naming only. |
| `pmd:AvoidGlobalModifier` (2)                                                        | `IncomingResult`, `OutgoingResult`                  | A Flow action's answer in a managed package must be `global` for the camp's Flows to read it.                                                     |
| `pmd:AvoidBooleanMethodParameters` (2)                                               | `SetupMatch`, `SpecialScheduleImport`               | The setter of a Boolean property a screen sends; Salesforce fills only properties. Design rule, not security.                                     |
| `pmd:TooManyFields` (1)                                                              | `GeneratedInputs`                                   | One answer carrying a week's inputs in one request. Design rule.                                                                                  |
| `eslint:@lwc/lwc/no-async-operation` (2)                                             | `shoreshDotField`, `shoreshMotion`                  | `requestAnimationFrame` for animation frames, not timers.                                                                                         |
| `pmd:AvoidLwcBubblesComposedTrue` (6), `eslint:@lwc/lwc-platform/no-process-env` (1) | Jest test folders only                              | Tests fake real browser events (which are composed) or print a table; never shipped.                                                              |

Static resources are left out of the CI scan (`**/staticresources/**`) and were scanned on their own
with the same selection: 2 findings, both `@lwc/lwc/no-inner-html` at line 21 of SheetJS's minified
code (`SheetJS.js`, and the connector's copy `engine.SheetJS.cjs`). The flagged code reads
`innerHTML` (it never writes it) from an HTML table element in SheetJS's `table_to_sheet`, which
Shoresh never calls (it reads and writes workbooks and CSV only); the connector runs in Node,
where there is no page at all. retire-js found no
known-vulnerable library. SheetJS Community Edition
0.20.3 (Apache-2.0, from SheetJS's own CDN, pinned with an integrity hash; past CVE-2023-30533 and
CVE-2024-22363). A scanner that maps "xlsx" to the npm registry, which stops at 0.18.5, may wrongly
call it outdated.

## Patterns a scanner flags by shape that are safe

- **Dynamic SOQL (15 sites in 13 classes:** ArchivedSeasons, AgentSetupNotes, ImportLogValues, UserModeWrites,
  AgentReadSetup, ImportWhoKinds, ImportUndoDeletes, RowSeen, ImportProvenanceAttached,
  ImportUndoValues, SetupDelete, AgentRunsIn, AgentSetupNewRow). Object, field and relationship
  names come from `Schema` tokens through `ShoreshSchema.queryName` / `childRelationship`. A name
  that arrives as text is first resolved against a fixed allow-list (`ImportFields.field`,
  `AgentSetupFields.fieldOf`, `RowSeen`). Every value is a bind variable. No user text is
  concatenated, so `escapeSingleQuotes` is not needed.
- **`loadScript` / `loadStyle`:** only the package's own static resources, never a CDN.
- **Downloads:** a `blob:` URL of bytes the package made; file names stripped of path characters.
- **Spreadsheet formulas:** CSV cells starting with `= + - @` or a tab or return get a leading `'`
  (`OutgoingRows`); Excel cells are written as text.
- **`href` bindings:** in-page anchors, the package's own static resources, a constant GitHub link
  (`rel="noopener noreferrer"`) and a constant `mailto:` support address. None from records.
- **Web-address answers** are always `application/json` or `text/csv`.
- **The connector's print page** inlines JSON into a `<script>` with every `<` escaped.
- **`postMessage(..., "*")`** in the connector's week view is the MCP Apps handshake with its host
  frame and carries no camp data; the listener accepts only messages from `window.parent`.

## Outgoing data and callouts

- **One callout:** `OutgoingDoors.post`, to `callout:<name>`, where the name is a Named Credential
  the camp's admin created and the camp's own Flow passes (`to_system`). The package ships no
  endpoint, Named or External Credential, Remote Site Setting or CSP Trusted Site. The name must
  match `^[A-Za-z](_?[A-Za-z0-9])*$`, so it can't carry a path or query or reach another package's
  credential. Any Named Credential in the org may be named, by design: the camp decides where its
  schedules go.
- **Who can send:** a holder of the matching Read permission set or Shoresh Scheduler (checked in
  code before any callout), with Apex class access to that one action.
- **What is sent:** published schedules, elective offerings and seats. Never drafts, versions,
  comments, family or medical details.
- **What a send keeps** (Send__c): destination name, what was sent, the remote status code and up to
  200 characters of its status text. Never the payload, headers or credentials.
- **Deliberate exposure, stated plainly:** a connection's published-schedule read finds schedules
  in user mode (so only seasons the camp shared with it), then reads their days and groups' divisions
  in system mode (`OutgoingPublished`, `OutgoingGroupSchedule`). A connection therefore sees the
  published days of a shared season without object access to the day records, and never sees drafts.
  Granting the connection sets read on the day records instead would let them read draft days too,
  so the narrower system-mode read is the safer choice.

## Incoming web addresses (`@RestResource`, 99 classes)

Salesforce's own sign-in only; no guest or public access; no connected app shipped (a camp makes
its own External Client App and integration user). Three layers: Apex class access (Shoresh
Scheduler opens every address, each connection set only its own); the capability's permission set
checked in code (`IncomingBatch.requireAccess`, `OutgoingDoors.byWeb`; any change by an AI needs
Shoresh Scheduler); user mode for every read and save. Incoming records are read with
`JSON.deserializeStrict` into typed classes with no Id or Owner fields; unknown fields are refused;
a batch holds at most 200 records. Seasons named by a caller are found in user mode. Errors come
back as Shoresh's own sentences; anything unexpected as "Shoresh couldn't tell why. Try again.",
with detail only in the debug log.

## The connector (ShoreshConnect static resource)

A Node command line and MCP server a camp downloads from Settings, so a person's AI can do what
the screens do, as that person.

- **Sign-in:** the person's own Salesforce sign-in, made and kept by Salesforce's CLI
  (`sf org login web`). Shoresh code never reads, prints or stores a token; every call is
  `sf api request rest` started without a shell, the body on standard input. The sign-in host must
  be `*.salesforce.com`.
- **Its access is the person's whole Salesforce access**, not a Shoresh-only access: it acts as the
  person, with exactly their permissions (the settled design).
- **What it calls:** only Shoresh's own web addresses and one query for its own static resource.
- **Integrity:** it comes from the camp's own org over TLS, never from GitHub or npm; a packaged
  static resource can't be edited by the subscriber; it refuses to run when older than the org's copy.
- **Dependencies:** Node built-ins only at runtime; bundled SheetJS 0.20.3 and Salesforce's LWC
  engine (MIT).
- **Files:** imports take file contents, never a local path; downloads go to `~/Downloads` without
  overwriting, names stripped of path characters.
- **Code mode** runs an AI's script in a `vm` context holding only Shoresh's calls, with code
  generation from strings off and call, memory and time limits. It is not a security boundary and
  isn't presented as one: the script runs as the person, as the CLI does.
- **Ask first (API-1.106, API-1.153):** a change that deletes, clears or replaces is done only with
  the confirm its own preview gave. Over MCP the AI never sees that confirm: the connector shows the
  preview in a macOS dialog (`osascript`, words passed as an argument) and sends the confirm only on
  the person's click on Yes, so text in camp data can't talk an AI into it. An AI that can run
  commands on the computer has the person's own sign-in and isn't stopped by this.

## Register of system-mode use

Each entry's reason is in a comment at the code or in ADR 0001 point 6 (the save-time checks in
row 1, and `CampLabelSaves` and `CampClock`).

| #   | What                                                                                                                                                | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Save-time checks: duplicates, a record's season matching its parent's, delete protection, published-history protection, fixed and recurring clashes | ActivityEligibilityTriggerHandler, ActivityTriggerHandler, CoverageTriggerHandler, CampLabelTriggerHandler, LocationTriggerHandler, LocationTypeTriggerHandler, GroupMoves, PlanPartTriggerHandler, ScheduleTriggerHandler, SetTimeGuard, SetTimeItemTriggerHandler, SpecialDateTriggerHandler, WeekExceptionTriggerHandler, NoDivisions, ArchivedSeasons, ElectiveRunTriggers, SetTimePlanReader, PublishedHistory, PublishedGuard, SpecialDates, ElectiveSetSeasonBlocks | A protection must hold whoever saves, whatever their field access. Sharing still applies. A refusal that would print a field value read this way (a location's "groups that fit", an activity's length, a recurring activity's day, a special date's weekday) leaves it out unless the person can read that field. A clash names where the two meet, which is the saver's own choice. |
| 2   | Children deleted with their parent                                                                                                                  | SeasonTriggerHandler, ElectiveSetupTriggers.clear, LinkedChoiceTriggers, SpecialItemTriggerHandler, WeekExceptions, WeekTriggerHandler, NoDivisions                                                                                                                                                                                                                                                                                                                        | They belong to the parent (master-detail or "part of"); restrict-delete lookups between siblings would otherwise block a delete the person may make. Skips only the child object's delete permission, never record access.                                                                                                                                                            |
| 3   | Shoresh's own logs, read-only to people so no one can forge them                                                                                    | ImportLog (Import__c and its kept files), SendLog (Send__c), IncomingQuestions, IncomingRenamed                                                                                                                                                                                                                                                                                                                                                                            | Undo and Settings trust them. ImportLog checks the person's edit access to the season (`UserRecordAccess`) before writing; every change an import makes is user mode.                                                                                                                                                                                                                 |
| 4   | The platform's answer about the current person                                                                                                      | CampLabelSaves, ImportLog (`UserRecordAccess`); IncomingBatch (`PermissionSetAssignment`, `PermissionSetGroupComponent`)                                                                                                                                                                                                                                                                                                                                                   | Only the caller's own access, used only to refuse, never to grant.                                                                                                                                                                                                                                                                                                                    |
| 5   | Key fields                                                                                                                                          | ChoicesImportCampers, IncomingCampers, OutsideOwned                                                                                                                                                                                                                                                                                                                                                                                                                        | `Key__c` is filled by a trigger and granted to no one; `OutsideMatch__c` (an outside system's own id) is readable to Shoresh Scheduler and Send Campers, and read in system mode only alongside `Key__c`. Matched within a season already found in user mode, then the records are re-read in user mode by Id.                                                                        |
| 6   | Camp words and time zone, for wording only                                                                                                          | CampClock, DayWords, SetupSeasons, ImportedWeekGuard, OutsideOwned, IncomingSeason                                                                                                                                                                                                                                                                                                                                                                                         | Labels and the clock, never returned as data.                                                                                                                                                                                                                                                                                                                                         |
| 7   | Published days for a connection                                                                                                                     | OutgoingPublished, OutgoingGroupSchedule                                                                                                                                                                                                                                                                                                                                                                                                                                   | See "Deliberate exposure" above.                                                                                                                                                                                                                                                                                                                                                      |
| 8   | The Recycle Bin (`ALL ROWS`)                                                                                                                        | NoDivisions, ImportProvenanceAttached                                                                                                                                                                                                                                                                                                                                                                                                                                      | Needs system mode; only Shoresh's own records.                                                                                                                                                                                                                                                                                                                                        |
| 9   | `Database.emptyRecycleBin`                                                                                                                          | ElectiveClear                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Right after the same records were deleted in user mode, in one savepoint: the camp's end-of-season clear removes camper data for good, on purpose. Takes no access level.                                                                                                                                                                                                             |
| 10  | Seasons already found in user mode, re-read for naming and opening                                                                                  | OutgoingRows.seasonsSeen and seasonsSaid (used by OutgoingRows, SeasonToOpen, AgentSeasons)                                                                                                                                                                                                                                                                                                                                                                                | Name, camp, dates, short-week choice and archived, to name a season in a refusal and pick the season a screen opens on. The seasons list a person's AI reads uses them only to choose and order seasons, and re-reads each season it lists in user mode.                                                                                                                              |
| 11  | Whether an elective run sits on a saved version                                                                                                     | IncomingRuns                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A key that sends choices can't read schedules; only this yes or no comes back, to refuse with.                                                                                                                                                                                                                                                                                        |

## Permission choices a reviewer will ask about

- **Shoresh Scheduler has View All and Modify All on Season__c.** A camp is the organization, so
  everyone with Shoresh sees every season of their org (the product's decision). It is Shoresh's own
  object in its own permission set, not Modify All Data. Modify All includes delete; Shoresh still
  asks first and refuses to delete a season once anything in it was published. Connection sets do
  not have it: they see only the seasons a camp shares with them.
- **Camp__c is Public Read/Write inside the org** (Private externally): anyone with Shoresh can change
  the camp's own words and time zone. No one is granted delete on Camp__c.
- **No permission set grants a system permission.**
