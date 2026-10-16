# 0004: Fixed and recurring activities, build choices

Status: proposed (2026-10-16), slice 3b. Design source: wiki `projects/shoresh-scheduling-sf`
(slice 3 planning rounds 1 to 3, "Open questions answered", "Slice 3b"),
`projects/shoresh-scheduling-data-model` ("Set-time items", "Protecting history", "Rows that
lose their owner"), glossary (fixed activity, recurring activity, mutual exclusivity), and
decisions 0004 and 0007. Shoresh desktop (`FixedEventsScreen.jsx`, its ADR
`2026-08-28-fixed-vs-recurring-events`) was read for behaviour only; where it differs, the wiki
wins.

## Choices

1. **Two objects, both details of the program**: `FixedActivity__c` and `RecurringActivity__c`
   (decision 0004: never merged, never linked to an activity). Fields: name, `TimeBlock__c`
   (where it starts; restrict-delete), `Length__c` (time blocks in a row, default 1),
   `Location__c` (optional; restrict-delete), `SortOrder__c`, `CopiedFrom__c`; recurring adds
   `Monday__c` … `Friday__c`. No "who" or "days" on a fixed activity, by design. "A time block
   is required" and "at least one day" are validation rules, not required fields, so they can
   be relaxed later.
2. **Who a recurring activity covers is `Coverage__c`** (detail of the season, as the data model
   has it), built now with only the recurring-activity owner and division or group targets
   (restrict-delete). Other owners (special dates, elective times, linked choices) are added
   with their slices. **No rows means everyone in the program**, exactly like activities' "Who
   can do it"; the data model's `AllGroups__c` checkbox was not added. A target must be in the
   recurring activity's own program.
3. **Weeks are week exceptions, not a new `EventWeek__c`**, consistent with slice 3a:
   `WeekException__c` gains `FixedActivity__c` and `RecurringActivity__c` targets (exactly-one
   rule widened, same-season check, cleared on delete). The screens show them as "Runs in"
   ticks, all ticked by default. `EventWeek__c` is dropped from the data model.
4. **Clashes are refused, never just shown**, from every side that can cause one, with a
   message in the camp's words that names the fix. A season's fixed and recurring activities are
   worked out cell by cell (group, time block, day, week) after every change, and the first
   clash, in a fixed order, is the refusal:
   - an item running past the program's last time block;
   - a recurring activity ticked for a day its program does not run;
   - two items with the same group in the same time block, same day, in a week both run in;
   - more groups at a location at once than fit there (programs keep their own time blocks,
     so "at once" means overlapping clock times on the same day and week).

   Sides checked: the items themselves, who they cover, their week ticks (removed or moved to
   another target), a location's groups that fit going down, time blocks added, moved,
   changed, or deleted, groups added or their availability changed, a program's days changed,
   new weeks, and anything restored from the Recycle Bin. Triggers on those objects report the
   change (`SetTimeTriggers` → `SetTimeGuard`).

5. **A screen save is checked once, at the end.** A table save writes rows, then week ticks,
   then who, so the check is deferred to the end of the whole save and a clash undoes all of it
   (`ScreenSaves`, `deleteRecord`, copy season). A change made in Salesforce directly is checked
   as soon as it is saved. Without this, a new recurring activity (everyone, until its who is
   saved a moment later) could be refused for a clash it would never have.
6. **Morning-only and afternoon-only groups are left out, not refused.** A group not at camp in
   a time block is not part of an item in that block; the row's **Left out** column says so
   ("Bunk 3 is morning only and is left out", or "... left out of its afternoon part" for an
   item that spans both). Group weeks ("Runs in" on bunks) and location weeks ("Open in") are
   not used to excuse a clash: a bunk away in Week 3 still counts in Week 3. That is stricter,
   never looser. A location closed in a week an item runs is shown in Needs attention, not
   refused (it is not in the agreed list of clashes).
7. **Who is chosen in the table**: a **Who** column shows "Everyone in Main" or the names, and
   **Change** opens the same picker as activities' "Who can do it" under the row. Who is saved
   with the row, all or none, so a new recurring activity can be saved already narrowed to its
   bunks. (A details panel below the table, as for activities, would have saved a new row as
   "everyone" first, and could be refused for that.) New recurring rows start with no day
   ticked; only the program's days are offered.
8. **Deletes.** Deleting a fixed or recurring activity takes its week ticks and who rows with
   it. Deleting what one depends on is refused with its name: the time block it starts in, its
   location, a group or division in who it covers, or its program. Deleting a time block it
   only spans is refused if the item would then run past the end of the day. Deleting a season
   clears coverage and fixed and recurring activities first (platform check (a)). Salesforce's
   own Delete button meets the restrict-delete lookups and refuses, as in slices 2 and 3a.
9. **Copy season** carries fixed and recurring activities (time block, location, program
   re-pointed to the copies), who each covers, and their week ticks (re-pointed to the copied
   week in the same position, as in slice 1). The copy is checked for clashes before it is kept.
10. **Roots**: the wide Fixed activities card is live (count, up to six names, opens its screen).
    Recurring activities have their menu entry; the desktop shows them nowhere else on its
    Roots. Needs attention gains three nudges for both kinds: runs in no weeks; every group it
    covers is left out; its location is not open in a week it runs.
11. **Removed** (Greg, 2026-10-16; nothing was released): `Activity__c.EventOnly__c` (its "Only
    part of events" box under More rules) and `TimeBlock__c.EventsOnly__c` (the "Events only"
    column). Empty time is always named by a fixed or recurring activity ("Free time", "Rest").
    Both fields were also deleted from the test org. Camp words `FixedEvent` / `RecurringEvent`
    are now `FixedActivity` / `RecurringActivity` ("Fixed activity", "Recurring activity").
12. **Cost of the check.** Each check reads the season's items, programs, blocks, groups,
    weeks, and locations (about seven queries). Seasons with no fixed or recurring activities
    are remembered for the rest of the transaction, so ordinary saves elsewhere cost little.

13. **Open for Greg:** adding or deleting a time block in the middle of a multi-block item
    changes which blocks it covers (Rest = Period 1 for 2 blocks covers Period 2; delete Period
    2 and it covers Lunch). It is refused only if that causes a clash or runs past the end of
    the day; otherwise it happens without a word. Options: refuse it, or show it in Needs
    attention.

## Choices that are hard to undo after release

- Object and field names: `FixedActivity__c`, `RecurringActivity__c`, `Coverage__c` (with
  `RecurringActivity__c`, `Division__c`, `Group__c`), and `WeekException__c.FixedActivity__c`
  / `.RecurringActivity__c`.
- Both items are details of the program (not the season), and `Coverage__c` a detail of the
  season.
- `Length__c` counts time blocks, starting at `TimeBlock__c`.
- Recurring days are five checkboxes, Monday to Friday (day camps only, decision 0001).
- No coverage rows means everyone in the program (no `AllGroups__c`).
- The restrict-delete lookups: time block, location, coverage targets, and week exceptions'
  new targets.
- Coverage rows are auto-numbered (`CV-000000`).
