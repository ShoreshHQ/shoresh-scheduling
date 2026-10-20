# 0003: Menu, Roots, and "Runs in", build choices

Status: proposed (2026-10-16), slice 3a. Design source: wiki `projects/shoresh-scheduling-sf`
(slice 3 planning rounds 1 to 3, "Open questions answered", "Coordinator handoff (final)") and
Shoresh desktop (`src/screens/RootsHomeScreen.jsx`, `src/components/layout/navSections.js`,
its ADRs `2026-08-22-roots-as-hub-setup-ia`, `2026-08-27-roots-hub-bento-layout`,
`2026-08-28-roots-home-is-a-distinct-screen`, `2026-08-28-stage-aware-nav-landing`).

## Choices

1. **One page, one screen at a time, every screen kept on the page.** The tab is
   still one Lightning component (`shoreshCampSetup`), now with a left-hand menu
   (`shoreshMenu`, SLDS vertical navigation). Screens not shown are hidden, not removed, so
   unsaved typing on one screen is still there after visiting another. No new tab, object, or
   field. The tab is labelled **Shoresh** (Greg, 2026-10-16, "for now"); its API name and
   address stay `Shoresh_Camp_Setup`.
2. **Menu order and words** follow the brief (Greg, 2026-10-16): Roots; Camp: Weeks, Programs,
   Divisions, Groups, Time blocks, Locations, Camp words; Activities: Activities, then Fixed
   activities, Recurring activities, Special events (marked Coming); Schedules (Coming). Every
   entry uses the camp's words. "Fixed activities" and "Recurring activities" are built as
   "Fixed / Recurring" + the camp's word for activities until slice 3b renames the FixedEvent
   and RecurringEvent camp words. "Roots", "Camp", "Camp words", and "Schedules" are not glossary
   terms and stay as they are. _Changed 2026-10-20 (ADR 0013 choice 21): the section titles are
   the desktop's, Camp, Activities & Events, Schedules._
3. **Before the first season**, only Camp words can be opened; the rest is greyed out (each
   needs a season). _Changed 2026-10-20 (ADR 0013 choice 11): greyed entries stay in the tab
   order, marked unavailable, and say why ("Needs a season", "Coming") to screen readers._ New season and Copy season stay at the top, beside the season picker;
   Delete season moved to the Weeks screen, with the season's name, dates, and status.
   _Changed 2026-10-20 (ADR 0013): the season's name, dates and Delete season open from a pencil
   beside the season picker; Status is no longer shown._
4. **Roots is the desktop's Roots home**, not a redesign: the "Build or generate the schedule"
   door, "What has taken root" with the desktop's six cards in the desktop's places (large
   Activities and Groups with up to four names, small Divisions, Locations, Time blocks, and a
   wide Fixed activities card), "Needs your attention" beside them (sorted by name, as on the
   desktop; stacked above the cards on a narrow window), and Import last year at the bottom.
   Not built yet (shown as Coming): the schedule door, Fixed activities, Import last year.
   Left out: the desktop's "Download worksheet" (not planned for Salesforce), its undo of an
   import, its "couldn't be read" dashes, and its overflow chip (the list shows every item).
   Differences: every card opens its screen (the desktop's cards do not; the brief asks for
   it); and a small **Weeks** card fills the place the desktop's grid leaves empty, beside the
   lower half of Groups (Greg, 2026-10-16). _Changed 2026-10-20: the camp's whole setup now
   downloads as **Download worksheet** (the desktop's words, ADR 0007 choice 18), and Import
   last year recedes to **Re-import last year** once the camp has setup (ADR 0013 choice 20)._
5. **Needs attention items know which screen fixes them.** `setupProblems` returns
   `{ screen, name, why }`; Roots lists all of them and each opens its screen, and each screen
   shows its own at the top. Two checks come from the desktop's Roots: a season with no
   activities, and a group no activity is open to. None blocks anything. (Since the
   desktop-parity cleanup, 2026-10-17, coordinator's call: building a week waits for the
   desktop's required areas, readiness.js. Manual Build's Start lists everything missing in one
   sentence with links, `shoreshSetupRules.stillNeeded`, and each setup menu item shows the
   desktop's **!** (Needed) or **✓** (Done), `menuMarks`. Needs attention items still block
   nothing. Two differences from the desktop's look, both from the design guide's colour rules:
   the desktop draws **!** in red (`--danger`) in a column before the label, and Shoresh draws
   it as dark text on a bronze ring after the label (red is for errors only; bronze is the
   caution hue but never text, and SLDS navigation puts badges after the label); and the ✓ is
   a green check icon, as green is for small marks only. The turn-off question's **Turn off
   anyway** is the brand button, not the desktop's red one: turning a week off is undone by
   ticking it again, and red is kept for what can't be undone. With several programs an area
   is done only when every program has it, as Manual Build lists it.)
6. **"Runs in" week ticks live in each table** (Groups, Activities; Locations say **"Open in"**,
   which reads better for a place). Every week is ticked unless a week exception names the row
   in that week; new rows start with every week ticked. Storage is unchanged (`WeekException__c`).
   The Week exceptions grid is gone. Unticking a bunk, activity, or location for a week it is
   already placed in (a Manual Build or Generated Schedule draft) asks first, in the desktop's
   words (ExclusionConfirmDialog.jsx; `RunsInController`; desktop-parity cleanup, 2026-10-17).
7. **A table's rows and its week ticks save together, all or none**
   (`SeasonSetupController.saveRowsAndWeeks`, `RunsIn`, `ScreenSaves`). A new row's unticked
   weeks are sent with the row's place in the save, so a new bunk can be saved with a week
   unticked in one step. Saving them separately would have left a half-saved table (rows saved,
   ticks not) that a second Save would duplicate. `WeekExceptionsController` is removed; its
   tests call `WeekExceptions.save` through a test helper.
8. **Deleting takes a record's own unticked weeks with it** (Greg, 2026-10-16). A group,
   activity, or location's week exceptions, and for a division or program its groups', are
   deleted in the same all-or-none step as the record (`WeekExceptions.deleteWithWeeks`),
   instead of refusing the delete as slice 1 did. A delete is still refused, with the existing
   messages, when something else depends on the record (who can do it, a rain plan, a location
   an activity uses). Salesforce's own Delete button still meets the restrict-delete lookups and
   refuses; the Shoresh screens are the way to delete.
9. **Camp words' Cancel** now puts back the saved words ("Cancel changes", like the tables)
   instead of leaving the screen, since Camp words is now a screen of its own.
   _Changed 2026-10-20 (ADR 0013): Camp words saves as you go; there is no Save or Cancel._
