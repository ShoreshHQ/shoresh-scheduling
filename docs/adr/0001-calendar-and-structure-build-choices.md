# 0001: Calendar and structure, build choices

Status: accepted (2026-10-15). Design source: wiki `projects/shoresh-scheduling-data-model`
("Calendar and structure") and `decisions/0001` to `0007`.

## Choices

1. **Week exceptions have only a group target for now.** `WeekException__c` exists with
   `Group__c` (lookup, restrict-delete). `Activity__c` and `Location__c` are added when those
   objects are built; the "exactly one target" validation rule is widened then. Adding fields
   and editing a validation rule are both allowed after release, so nothing is locked in.
   Camp Setup has a grid for them (one row per group, one column per week); copying a season copies them. Deleting a group, division, or program that a week exception still names is refused with a message listing the marks and pointing to that grid. (Since 0003 the grid is gone: each row has "Runs in" week ticks instead, and deleting a record clears its own week exceptions instead of refusing.)
2. **Season delete is a before-delete trigger**, not a separate Shoresh action. Platform check
   (a) showed restrict lookups inside a season block deleting the whole season. The trigger
   clears week exceptions first, so both the Shoresh screen and Salesforce's own Delete button
   work. Consequence: restoring a deleted season from the Recycle Bin does not bring back its
   week exceptions (they were deleted separately). The delete confirmation says the delete
   cannot be undone.
3. **Published history guard is ready before schedules exist.** `PublishedHistory` refuses to
   delete a season, program, or week that has published history. Its finder is a stand-in that
   finds none until `Schedule__c` is built; tests swap in a finder that finds some and check the
   refusal and its message.
4. **Copying moves every date by the same number of days** (new start minus old start), so each
   week keeps its length and place. If that is not a whole number of weeks, the copy screen says
   which weekdays change; nothing is adjusted silently. Copies start in Planning.
5. **Camp labels apply to every Shoresh message**, including trigger and validation messages
   built in Apex. Validation rules (static text) avoid model terms. Salesforce's own messages
   name objects and fields, so screens never show them (`ScreenErrors`, audit 2026-10-17):
   common ones (in use elsewhere, no access, already used, required, too long) get a plain
   sentence, anything else "Couldn't save. Try again." with the detail in the debug log. Once packaged,
   only Shoresh support (subscriber login) can read that log, not the camp's own admin. (The import's
   undo refusal still adds the platform's text; it is changed with the import code.)
6. **All writes from the screens are user-mode DML** through one controller with an allow-list
   of objects and, per object, of the fields the screens send (a parent field only on a new
   row); reads are `WITH USER_MODE`. **Trigger and save-time checks read in system mode** on
   purpose, so a check never depends on the saver's object and field access: duplicate checks,
   season matches, delete protection, and the fixed and recurring activity clash check
   (`SetTimeGuard`, `SetTimePlanReader`), which also runs at the end of screen saves. Their
   refusal messages can include values read this way (for example a location's "groups that
   fit"), even from a field an admin has hidden from that person. (Audit, 2026-10-17.)
   - **Record sharing still applies.** Every class is `with sharing`, and with that keyword system
     mode skips object and field permissions but not sharing. So these checks see only records
     the person can see, not "records the user cannot see" as this point first said. Nothing is
     lost within a season: everything in it is controlled by the season, so anyone saving into
     a season sees all of it. Duplicate checks are also held by unique `Key__c` fields, which
     ignore sharing. Checks across two seasons (a lookup pointing into another season) are left
     as they are.
   - **One system-mode write:** deleting a season first deletes its week exceptions, coverage,
     fixed and recurring activities, schedules, and activities in system mode
     (`SeasonTriggerHandler`), after the published-history refusal (point 3). All of them sit
     under the season through master-detail links (some through a week or program), so the season delete would
     remove them anyway; system mode only skips the person's delete permission on those child objects, never their record
     access. It is needed because restrict-delete lookups between the children would otherwise
     block the season delete (point 2).
7. **Anyone with Shoresh access can change camp labels** (Greg, 2026-10-15). "Shoresh access"
   means the Shoresh Scheduler permission set. Camp records are readable and editable by
   everyone with access (org-wide Read/Write), and camp labels follow their camp. This replaces
   the data model's "read-only for everyone". Side effect: those users can also rename any camp
   in the org and change its time zone (not delete it); in a multi-camp org that includes
   other camps. If an admin narrows access to camp records, the label editor is read-only for
   people without edit access and says so; someone without the permission set is told to ask
   for it.
   Whether the person can edit the camp is read from `UserRecordAccess` in system mode
   (`CampLabels.whyCannotEdit`); it reads only that person's own access to that one camp.
8. **Choices that are hard to undo after release:** `Camp__c.TimeZone__c` is text (a standard
   time-zone name such as America/New_York) rather than a picklist, so any zone fits; nothing
   uses it yet. `TimeBlock__c.PartOfDay__c` is Morning or Afternoon only (day camps;
   adding a value later is easy, removing one is not). Camp's org-wide Read/Write (point 7):
   package upgrades do not change sharing settings in installed orgs, so narrowing it later
   would only reach new installs.
9. **Unsaved typing is kept** when another part of the setup screen is saved; only a table's
   own successful save replaces what it shows.
