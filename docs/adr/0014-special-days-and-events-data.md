# 0014: Special days and special events, the data

Status: proposed (2026-10-20), Special Events and Special Days slice 1 of 6 (plan: wiki
`projects/shoresh-sf-parity-gaps`, "Build plan"). Design source: wiki
`projects/shoresh-scheduling-data-model` (`SpecialEvent__c`, `SpecialDay__c`, `PlanPart__c`,
`SpecialDate__c`). Where the data model is looser, the desktop decides: desktop ADRs
`2026-10-09-special-day-binds-to-a-week-day`, `2026-08-20-special-days-authoring-and-day-override-repoint`,
`2026-08-22-events-overlay-placement` and `2026-08-22-event-internal-subschedule`. No screens in
this slice (slice 2 is the setup screen).

## Choices

1. **Four objects, all details of the season**, so they share like every other setup record
   (controlled by the season): `SpecialEvent__c` (name, optional `Location__c`, `Notes__c`,
   `SortOrder__c`), `SpecialDay__c` (name, `Notes__c`, `SortOrder__c`), `PlanPart__c` (the plan
   of one special day or event) and `SpecialDate__c` (puts one on a day). The Shoresh Scheduler
   permission set can read, create, edit and delete all four.
2. **Items stay in their season** (Greg): Copy last season does not bring special days, events,
   their plans or their days. So the data model's `CopiedFrom__c` was not added; it can be added
   later if that changes.
3. **A special day replaces that day for the whole camp** (desktop
   `2026-10-09-special-day-binds-to-a-week-day`). It owns its own time blocks and a grid of every
   group by time block, so each group's day can still differ. So `SpecialDate__c` has no
   `WholeCamp__c` and is not a `Coverage__c` owner: the data model's "whole camp or chosen groups"
   is dropped. A week day holds **at most one** special day; a second is refused ("Tuesday of
   "Week 2" already has the special day "Field Day". Take it off first, or choose another day.").
   Asking before replacing one comes with the screens (slice 4).
4. **Put on a week and a weekday, not a date.** `SpecialDate__c` has `Week__c` (required,
   restrict-delete) and `Day__c` (Monday to Friday, the days a program can run), as the desktop
   binds to (week, day). A week whose dates are moved keeps its special days on the same
   weekdays. `SpecialDates.dateOf` gives the date in the week today; a weekday the week no longer
   has is refused on save ("Short week" has no Monday.) and, after a move, is null (to be shown
   under Needs attention in slice 6).
5. **Several days means several rows** (desktop 2026-08-22 ADRs): no date ranges. A special event
   can be on many days, but only once on each; a special day and events can share a day. The
   event's start and end times in the data model were not added: an event covers time blocks on
   the grid (slice 4), as on the desktop.
6. **Plans use the schedule-day format.** `PlanPart__c` has exactly one of `SpecialDay__c` or
   `SpecialEvent__c`, `Part__c`, `Plan__c` (long text), `GridFormatVersion__c` and `Revision__c`,
   the same compact grid, split rule and revision check as `ScheduleDay__c` (ADR 0005). A plan's
   time blocks are its own (ids local to the plan, not time block records); its rows are groups
   for a special day, and stations or teams for an event. `SpecialPlans` reads and writes plans
   with `ScheduleGrid`, `ScheduleGridParts` and `ScheduleDays.readDay`, unchanged.
7. **Names are unique in a season**, per kind (a hidden `Key__c`, as for location types), so a
   name always means one special day or one event (an import can match by name). A special day
   and an event may share a name. A special event's location must be in its season.
8. **Deleting is refused while it is on a day**, naming the days in the camp's words: "This
   special day can't be deleted yet: it is on Tuesday of "Week 2" and Thursday of "Week 5". First
   take it off those days, then delete it." The desktop deletes the placements with the special
   day instead; the build plan (Greg-approved) chose the refusal. Taken off every day, it can be
   deleted and its plan goes with it. Restrict-delete lookups from special dates and plans are
   the backstop. A location a special event uses says so when deleted.
9. **What goes with what.** Deleting a week takes its special days and events off its days (they
   mean nothing without the week; the items are kept), as its drafts and versions go with it. Deleting
   a season clears its special dates, plans and special events first (restrict-delete lookups
   would otherwise block it, platform check (a)). The week's delete warning does not yet count
   them (slice 6).
10. **Reads are bounded.** A season's special dates are one query (`SpecialDates.forSeason`), any
    number of plans one more (`SpecialPlans.readAll`); a plan save is four. Tests assert these as
    a scheduler, records made inside the same `System.runAs`.

## Names

Every object and field is reached through typed Apex references and `c/shoreshSchema`
(regenerated), never written as text (ADR 0009). Messages use camp labels for `SpecialDay`,
`SpecialEvent`, `Week`, `Season` and `Location`.

## Not in this slice

Screens (slices 2 to 5), replacing a placed special day with a confirm, Needs attention for a
special day whose weekday or groups no longer match, and the week delete warning (slice 6).
