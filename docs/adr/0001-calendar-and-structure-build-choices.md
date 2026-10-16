# 0001: Calendar and structure, build choices

Status: accepted (2026-10-15). Design source: wiki `projects/shoresh-scheduling-data-model`
("Calendar and structure") and `decisions/0001` to `0007`.

## Choices

1. **Week exceptions have only a group target for now.** `WeekException__c` exists with
   `Group__c` (lookup, restrict-delete). `Activity__c` and `Location__c` are added when those
   objects are built; the "exactly one target" validation rule is widened then. Adding fields
   and editing a validation rule are both allowed after release, so nothing is locked in.
   There is no screen for week exceptions yet; copying a season does copy them.
2. **Season delete is a before-delete trigger**, not a separate Shoresh action. Platform check
   (a) showed restrict lookups inside a season block deleting the whole season. The trigger
   clears week exceptions first, so both the Shoresh screen and Salesforce's own Delete button
   work.
3. **Published history guard is ready before schedules exist.** `PublishedHistory` refuses to
   delete a season, program, or week that has published history. Its finder is a stand-in that
   finds none until `Schedule__c` is built; tests swap in a finder that finds some and check the
   refusal and its message.
4. **Copying moves every date by the same number of days** (new start minus old start), so each
   week keeps its length and place. If that is not a whole number of weeks, the copy screen says
   which weekdays change; nothing is adjusted silently. Copies start in Planning.
5. **Camp labels apply to every Shoresh message**, including trigger and validation messages
   built in Apex. Validation rules (static text) avoid model terms. Salesforce's own messages
   (for example, a restrict-delete refusal) still name objects by their packaged labels.
6. **All writes from the screens are user-mode DML** through one controller with an allow-list
   of objects; reads are `WITH USER_MODE`. Trigger checks read in system mode on purpose
   (duplicate keys must be found even in records the user cannot see).
