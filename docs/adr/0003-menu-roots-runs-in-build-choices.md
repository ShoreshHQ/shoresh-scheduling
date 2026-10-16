# 0003: Menu, Roots, and "Runs in", build choices

Status: proposed (2026-10-16), slice 3a. Design source: wiki `projects/shoresh-scheduling-sf`
(slice 3 planning rounds 1 to 3, "Open questions answered", "Coordinator handoff (final)") and
Shoresh desktop (`src/screens/RootsHomeScreen.jsx`, `src/components/layout/navSections.js`,
its ADRs `2026-08-22-roots-as-hub-setup-ia`, `2026-08-27-roots-hub-bento-layout`,
`2026-08-28-roots-home-is-a-distinct-screen`, `2026-08-28-stage-aware-nav-landing`).

## Choices

1. **One page, one screen at a time, every screen kept on the page.** The Camp Setup tab is
   still one Lightning component (`shoreshCampSetup`), now with a left-hand menu
   (`shoreshMenu`, SLDS vertical navigation). Screens not shown are hidden, not removed, so
   unsaved typing on one screen is still there after visiting another. No new tab, object, or
   field. The tab keeps its name and address (`Shoresh_Camp_Setup`).
2. **Menu order and words** follow the brief (Greg, 2026-10-16): Roots; Camp: Weeks, Programs,
   Divisions, Groups, Time blocks, Locations, Camp words; Activities: Activities, then Fixed
   activities, Recurring activities, Special events (marked Coming); Schedules (Coming). Every
   entry uses the camp's words. "Fixed activities" and "Recurring activities" are built as
   "Fixed / Recurring" + the camp's word for activities until slice 3b renames the FixedEvent
   and RecurringEvent camp words. "Roots", "Camp", "Camp words", and "Schedules" are not glossary
   terms and stay as they are.
3. **Before the first season**, only Camp words can be opened; the rest is greyed out (each
   needs a season). New season and Copy season stay at the top, beside the season picker;
   Delete season moved to the Weeks screen, with the season's name, dates, and status.
4. **Roots is the desktop's Roots home**, not a redesign: the "Build or generate the schedule"
   door, "What has taken root" with the desktop's six cards in the desktop's places (large
   Activities and Groups with up to four names, small Divisions, Locations, Time blocks, and a
   wide Fixed activities card), "Needs your attention" beside them (sorted by name, as on the
   desktop; stacked above the cards on a narrow window), and Import last year at the bottom.
   Not built yet (shown as Coming): the schedule door, Fixed activities, Import last year.
   Left out: the desktop's "Download worksheet" (not planned for Salesforce), its undo of an
   import, its "couldn't be read" dashes, and its overflow chip (the list shows every item).
   Differences: every card opens its screen (the desktop's cards do not; the brief asks for
   it); the empty place in the grid beside the lower half of Groups is kept as on the desktop.
5. **Needs attention items know which screen fixes them.** `setupProblems` returns
   `{ screen, name, why }`; Roots lists all of them and each opens its screen, and each screen
   shows its own at the top. Two checks come from the desktop's Roots: a season with no
   activities, and a group no activity is open to. None blocks anything.
6. **"Runs in" week ticks live in each table** (Groups, Activities; Locations say **"Open in"**,
   which reads better for a place). Every week is ticked unless a week exception names the row
   in that week; new rows start with every week ticked. Storage is unchanged (`WeekException__c`).
   The Week exceptions grid is gone.
7. **A table's rows and its week ticks save together, all or none**
   (`SeasonSetupController.saveRowsAndWeeks`, `RunsIn`, `ScreenSaves`). A new row's unticked
   weeks are sent with the row's place in the save, so a new bunk can be saved with a week
   unticked in one step. Saving them separately would have left a half-saved table (rows saved,
   ticks not) that a second Save would duplicate. `WeekExceptionsController` is removed; its
   tests call `WeekExceptions.save` through a test helper.
8. **Refusals speak in the positive.** Deleting a group, division, or program with a week
   unticked says which and asks to tick it again under Runs in on the groups screen; a location
   says "not open in" and Open in; an activity says "does not run in" and Runs in. The refusal
   itself is unchanged from slice 1.
9. **Camp words' Cancel** now puts back the saved words ("Cancel changes", like the tables)
   instead of leaving the screen, since Camp words is now a screen of its own.
