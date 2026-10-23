# 0014: Special days and special events, the data

Status: proposed (2026-10-20; slice 2 added 2026-10-22; slice 3 added 2026-10-22; slice 4 added
2026-10-22; slice 5 added 2026-10-22; slice 6 added 2026-10-22), Special Events and Special Days slices 1 to 6 of 6 (plan: wiki
`projects/shoresh-sf-parity-gaps`, "Build plan"). Design source: wiki
`projects/shoresh-scheduling-data-model` (`SpecialEvent__c`, `SpecialDay__c`, `PlanPart__c`,
`SpecialDate__c`). Where the data model is looser, the desktop decides: desktop ADRs
`2026-10-09-special-day-binds-to-a-week-day`, `2026-08-20-special-days-authoring-and-day-override-repoint`,
`2026-08-22-events-overlay-placement` and `2026-08-22-event-internal-subschedule`. No screens in
this slice. _Slice 2 (2026-10-22, choices 11 to 13) adds the setup screen: design source Greg's
decision 47 and the approved mock-up `design-research/special-r1/special-events.html`; desktop
`SpecialEventsScreen.jsx`, `specialDay/copyCampTimeBlocks.js` and ADR
`2026-08-29-unify-special-events-screen`. Slice 3 (choices 14 to 18) adds the schedule inside each
item: design source decision 47.5 and the approved mock-up `design-research/special-r1/special-day.html`;
desktop `specialDay/SpecialDayGridEditor.jsx`, `event/EventGridEditor.jsx`, ADRs
`2026-08-22-event-internal-subschedule` and `2026-08-22-event-schedule-import`. Slice 4 (choices 19
to 25) puts them on the week's schedules: design source decisions 47.2 to 47.4 and 51 and the
approved mock-ups `design-research/special-r1/placed.html`, `placed.png` and `placed-day.png`;
desktop ADRs `2026-08-22-events-overlay-placement` and `2026-10-09-special-day-binds-to-a-week-day`.
Slice 5 (choices 26 to 31) puts them on Publish and the Schedules page: desktop ADR
`2026-10-09-special-day-binds-to-a-week-day` D6 (rendering) and D7 (export), `ScheduleScreen.jsx`,
`replacedLane.js`; Publish is Greg's (ADR 0008 part 5; the desktop has none).
Slice 6 (choices 32 to 36) takes a special day off a day and cleans up: desktop
`specialDay/SpecialDayPlacements.jsx` ("Placed on" chips, "Remove from this day"), Director Guide
"Take it off a day", ADR `2026-10-09-special-day-binds-to-a-week-day` D4.6 and D8, and the mock-up
`placed.html`'s "Take off Friday"._

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
   has is refused on save ("Short week" has no Monday.) and, after a move, is null (shown under
   Needs attention, choice 28).
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
   would otherwise block it, platform check (a)). The week's delete question names them (choice
   29).
10. **Reads are bounded.** A season's special dates are one query (`SpecialDates.forSeason`), any
    number of plans one more (`SpecialPlans.readAll`); a plan save is four. Tests assert these as
    a scheduler, records made inside the same `System.runAs`.

11. **One Special events screen** (slice 2) replaces the menu's "Coming" entry, as the desktop's
    one unified screen for both kinds (its ADR 2026-08-29). It is a setup screen in the shared
    table language (ADR 0015 choices 11 and 12), placed last in the setup order, so Recurring
    activities' next button now leads to it:
    - **The rail** counts both ("3 special days", "4 events") with the quiet ✓ Saved.
    - **Two sections, one list**: **Special days**, then **Events**, each headed with its count,
      the column names once above the first, each with its dashed blank row ("Add Special day",
      "Add Event"). Columns, as the mock-up: **Name**, **Where** (a special day is "Whole camp",
      quiet; an event picks one of the season's places, or None), **Schedule** (a special day's
      time blocks, "7 time blocks"; an event's stations, "4 stations"; "None" quiet until it has
      one), **Placed on** (the days it is on, "Wk 5 Thu, Wk 6 Tue", numbered by the week's place
      in the season and in the camp's word for weeks; "Not placed" quiet) and **Notes**. Name,
      an event's place and Notes are edited in the row and saved as you go (ADR 0011); Schedule
      and Placed on are worked out, never typed. The two lists' columns have the same fixed
      widths so they line up.
    - **Words.** Special days use the camp's word. Events use the camp's word when the camp has
      its own; the default "Special event" is shortened to **Event** on this screen, as the
      mock-up and the desktop say it (the screen's own name already says "special"). Schedule
      counts time blocks in the camp's word, where the mock-up wrote "periods".
    - **An item's details open beside the list** from its row's chevron (decision 47.1), in the
      same zone as an activity's details: its name, Where, Placed on, its notes, and for a
      special day its own time blocks with what is in each ("11:30–12:20 Lunch: Lunch, Rest").
      Focus goes to the panel's heading; Close puts it back on the row's chevron. **Open
      schedule** is there (live since slice 3, choice 14). Nothing in the panel is edited: every
      field an item has is in its row.
    - **Deleting** is the row's delete, asked first as every setup row; one that is on a day is
      refused with choice 8's message. Deleting a season now lists its special days and events
      among what goes with it.
    - The season read (`SeasonSetupReader`) carries them (`SpecialItems.forSeason`: the items,
      each plan in brief and its days, in four queries for any number). Someone who may not read
      the four objects gets none rather than a refusal of the whole season.
    - Not on this screen yet: the mock-up's **Import a list** and **Download this list** (no
      import or download of special items yet), and putting an item on a day (slice 4).

12. **A special day starts from the camp's regular day** (desktop "seeded from time blocks" and
    "bring recurring events in"). The desktop asks "Start from your time blocks?" after a special
    day is created; here it is done without asking (product principle: do what the same action
    does by hand, and show it), in the same save as the special day, all or none
    (`RowSaves` → `SpecialDaySeed`, which reads the camp, and `SpecialDayStart`, which builds the
    plan):
    - its time blocks are a copy of the **first program's** (screens' order) that has any, with
      ids of its own ("b1", "b2", choice 6); its rows are **every group in the camp**, in the
      screens' order;
    - a **fixed or recurring activity is brought in** to the groups it takes when it runs **every
      day its program runs and in every week**, in time blocks the special day has (matched by
      name and times, so another program's item lands only where its time blocks are the same).
      A morning-only or afternoon-only group takes the part it is there for, as Start a blank
      week does (`BlankDay.atCampPart`, now shared). A slot already taken is left as it is.
      What is brought in is an **ordinary cell of the special day**, as on the desktop (its
      fixed events land as plain activity cells in the day's own slots): the director can type
      over it in one group (choice 15), and an import replaces it (choice 17);
    - **nothing is left out quietly**: what was not brought in is named, with why, under the
      Special days section right after it is added (read out): "Not brought in, since they don't
      run every day: Swim." (also: every week; other time blocks; the time was already taken).
      The desktop's offer of a placed day's weekday-only recurring events ("Also bring 2
      recurring events from Tuesday?") comes with putting a special day on a day (slice 4): a
      new special day is never on a day yet;
    - with no program time blocks, it starts empty and says so; someone who may not read fixed
      and recurring activities (`SetTimeAccess`) gets the time blocks only. An event starts with
      no plan.
    - The same setup always gives the same plan. A row save that adds a special day costs about a
      dozen queries (`SpecialDaySeedTest` asserts at most 40, as a scheduler).

13. **Checked by** `SpecialDaySeedTest` (what is brought in and left out and why, the plan's own
    time blocks and cells, morning-only groups, the same plan twice, no time blocks, an event,
    a refused duplicate leaving no plan), `SpecialItemsTest` (the read in four queries, briefs
    and days in order, a carried-on item, the screen's delete, fields the screen may not send),
    `shoreshSpecialDetails.test.js` (the worked-out words, the panel for each kind, Close, an
    item gone), `shoreshCampSetup.test.js` ("Special events": the rail, sections, columns and
    widths, camp words, the seeded note, the panel from the chevron and back, the delete, the
    season's delete count), `shoreshMenu.test.js`, and in the test org by
    `scripts/a11y-browser-check.mjs` (axe on the screen, a special day added by keyboard with
    its note read out, its details opened from the chevron with focus on their heading and back
    on Close, then deleted).

14. **The schedule inside an item opens from its details** (decision 47.1; slice 3). "Open
    schedule" shows it in the Special events screen's place, the list kept as it was underneath:
    the rail's left is "‹ Special events" and the item's name (a heading, where focus goes on
    opening), its right **✓ Saved**, **Import** and **Download**, as the mock-up. Back puts the
    list back, read again if anything inside was saved, with focus on that item's Open schedule.
    Under the grid: **+ <time block>** (the camp's word; the mock-up's "+ Period"), for an event
    **+ Station**, the item's time blocks and stations each in a list that opens from its own
    button, and the item's **Notes** (read only: notes are edited in the row). Not in this slice:
    the mock-up's "On Wk 5 Thu" (putting an item on a day is slice 4).

15. **One grid editor for every schedule** (decision 47.5: an event's schedule reuses the
    special-day grid, with stations across). The grid is `c-shoresh-week-editor`, Manual Build's,
    given the plan as one day (`planName`: no Daily, Group and Activity buttons, no day pills, no
    drawer, and lines name the item where a week's name a weekday). A special day's columns are
    every group in the camp, an event's its stations; its own time blocks run down. So typing a
    name in a cell, Delete, drag and stretch, Copy and Paste, Undo and Redo (this visit), "keep
    theirs or use yours" and the padlock and corner conventions (ADR 0015 choice 6) work as they
    do on Manual Build. Cell edits are sent as Manual Build's are (`SlotEdits`) and made only if
    their cells still hold what the director saw (`SpecialScheduleEdits`); the plan is saved
    whole under its item's lock with a new revision (`SpecialPlans`, choice 6).
    - **What can be typed**: the season's activities. "Add <name> to activities" (the editor's)
      adds a new one at **0 times a week** (`SpecialActivities`), so Generated Schedule never
      places it in a regular week; the desktop makes such an activity a one-off for the same
      reason. A name the season has, spaces and capitals aside, is that activity.
    - **A fixed or recurring activity brought in** when a special day started (choice 12) is an
      ordinary cell of that day, as on the desktop (`SpecialDayGridEditor.jsx`,
      `SpecialDayCell.jsx`: brought-in events are plain activity cells the director types over).
      It is typed over, cleared, moved, stretched, copied and put back by Undo like any other
      cell, in one group without touching the rest; it has no padlock and is not drawn as a slim
      row across the groups. It is still stored as what it is (kind F or R in the plan, so its
      name and record stay right and an import can tell it from what was typed); the editor
      treats it as ordinary wherever it is given `planName` (`staysPut`, `isMovable` in
      `slotEdits.js`), and `SpecialScheduleEdits` lets it be written over, reading it back by Id
      when Undo puts back one the plan no longer lists. It can't be typed in by name (only the
      season's activities can), so the server puts one in a cell by Id **only if the special day
      starts with it** (`SpecialSetTimes`, `SpecialDaySeed.broughtInIds`: what choice 12 brings in
      from the setup as it is now; the same setup gives the same answer). Any other fixed or
      recurring activity of the season is refused with nothing saved ("Assembly can't be put in
      Field Day. Only the fixed activities and recurring activities it started with can be put
      back."), and an event, which starts with none, takes none ("…have their own times and aren't
      placed in it."). A fixed activity changed in setup since the day started so that it would no
      longer be brought in can't be put back by Undo once no group holds it; it is refused, never
      placed quietly. On a week's schedule fixed and recurring activities keep their
      padlock. **Clear schedule** (Edit menu, asked first) empties every cell. No checks or dots
      on a special schedule (the desktop's special days have no engine either).

16. **Time blocks and stations** (`SpecialScheduleFrame`, on `SpecialPlanShape`). A time block has a start and an end
    ("HH:mm", end after start) and a name; with none it is called by its times ("9:00 AM – 9:45
    AM", as setup's time blocks are). A new one goes where its start falls; Change keeps its
    place; ↑ and ↓ move it. An event's stations are added, renamed, moved left and right and
    taken out; a special day's columns are the camp's groups and are refused here ("A special
    day has a column for every group in camp."). What is in a cell moves with its time block or
    station, and a placement a change cuts in two becomes two. Taking out a time block or station
    with something in it asks first ("Remove Lunch? 2 cells in it go with it."), as the desktop
    does; the last time block can't be taken out while there are columns. Ids are the plan's own
    ("b3", "s2", never reused while the plan has them). Each change names the revision the screen
    read and is refused if the plan was saved since ("Someone else changed this special event
    since you opened it…"). **An event starts with no plan** (choice 12): its first open says
    "Add a <time block> and a station to start, or import this schedule from a file." (The
    desktop seeds an event's columns from the camp's groups; decision 47.5 calls them stations,
    so they start empty.)

17. **Download and Import of one item's schedule** (desktop ADR `2026-08-22-event-schedule-import`).
    Download saves the grid as an Excel file of one sheet named for the item, time blocks down and
    columns across, as Schedules' daily sheet (`c/shoreshScheduleExport`). Import reads an Excel
    or .csv file with the import's own reader (`c/shoreshImportEngine`: `filesToPages`,
    `blockFromLabel`, `cellName`, `hasClockTime`, now exported), the first schedule in it. Its
    times may be down the side or across the top, as on the desktop (`parseGridSchedule.js`
    `detectGrid`): the file is read as it is and turned on its side, and the reading whose rows
    are mostly clock times (60%, the desktop's majority) is kept; when both are, the file is
    refused with the desktop's words ("Couldn't tell which side of <file> is the schedule's
    times. Check that the file has a clear time column or time row, and try again."), and when
    neither is (times like "9-10"), it is read as it is. The times are the time blocks (one with
    only a start ends where the next starts), the other side an event's stations or, for a
    special day, the camp's groups matched by name, and each cell's name the season's activity
    of that name or a new one (choice 15). A merged cell carries on along the times.
    **Only a schedule with nothing the director put there is imported into**, as on the desktop:
    one with entries is refused ("Color War already has entries. Clear it first if you want to
    replace it with an import, or add to it by hand."). The desktop has no import onto a special
    day; its import rule (ADR `2026-08-22-event-schedule-import` §6) refuses over authored cells
    and says its first-open seed "is not a conflict". So what a special day started with (its
    time blocks and the fixed and recurring activities brought in, choice 12) is not an entry:
    the file replaces it, and the screen says so ("Replaced by the file, brought in when Field
    Day started: Lunch."). Once any cell holds something typed (an activity), the import is
    refused.
    **The file's time blocks replace the plan's** (and an event's stations its columns), so every
    change to them is named in the same place (`SpecialImportFrame`): a time block with the same
    name and times is kept, one at the same times under another name is renamed, the rest are
    removed or added; stations are matched by name ("Periods renamed by the file: Opening to 9:00
    AM – 9:45 AM.", "Periods removed by the file: Lunch.", "Stations added by the file: Green.").
    **Once the director has changed the frame, an import that would rename or remove any of it
    asks first** and saves nothing until they say yes: "Replace the periods in Field Day?" with
    the same lines and "This can't be undone." (Import, or Cancel: nothing imported). An event's
    time blocks and stations are all the director's; a special day's count as changed once they
    differ, name and times in order, from those it starts with (`SpecialDaySeed.startingBlocks`,
    the setup as it is now, so a setup changed since also asks: asking once too often loses
    nothing). An import onto a frame the director has not touched, or one that only adds, goes
    ahead and names its changes. The server decides (`Outcome.asks`, sent again with
    `Imported.replaceEdited`), so the question can't be skipped and a save in between still refuses the
    import as stale. The desktop adds an import's rows beside an event's seeded ones and never
    removes any (its §6, Non-goals "replace seed axis on import"); here the file's frame replaces
    the plan's, so it is said and, over the director's own changes, asked, the desktop's
    refuse-or-ask rule for anything the director made. Nothing is left out quietly: the screen says how many cells were filled, what it
    replaced, the activities added, columns that name no group, rows with no times, places
    written in cells (not kept), and when only the first of several schedules was read.

18. **Checked by** `SpecialScheduleTest`, `SpecialScheduleFrameTest` and `SpecialScheduleImportTest` (as a scheduler, records made in the same
    `System.runAs`, each request's queries bounded: open at most 20, a cell save 25, a frame
    change 20, an import 25; a special day's own time blocks and groups, typing, a conflict, a
    brought-in fixed activity typed over in one group and put back by Undo after the plan
    dropped it, another season's activity refused, an event's time blocks and stations
    added, moved, renamed, taken out, a placement cut in two, Clear, a stale revision refused, an
    import for an event and for a special day, a second import refused, an import onto a
    special day holding only what it started with (replaced and named, its time blocks' changes
    named without asking) and one with a typed cell refused, a renamed time block asked about
    with nothing saved and replaced on yes, an event's changed stations asked about, a fixed or
    recurring activity the day did not start with refused by Id and one in an event refused;
    putting a brought-in one back reads what the day starts with, so its bound is 30, Add <name> at 0 times a
    week, no access), `shoreshSpecialSchedule.test.js` and `fromFile.test.js` (the screen, typing
    saved as Manual Build's, the frame, Clear, Import and Download, a file read into a plan, an
    import's frame changes named, its question and Yes and Cancel),
    `shoreshWeekEditor.test.js` (planName; a brought-in fixed activity typed over), `shoreshSpecialDetails.test.js` and
    `shoreshCampSetup.test.js` (Open schedule and back), and in the test org by
    `scripts/a11y-browser-check.mjs` (the special day added in the Special events step: its
    schedule opened from its details with focus on its name, axe on it, a name typed into a cell
    and its save said, back with focus on Open schedule). A plan with no time blocks yet now reads
    back (`ScheduleGrid` takes a row with no cells when there are no time blocks).

19. **A special event is placed on the grid as cells** (desktop `2026-08-22-events-overlay-placement`:
    an opaque named cell on the campwide schedule, placed day by day). In the week's compact grid
    (ADR 0005 §6) it is kind `S` with its record's Id; an `S` or `D` without an Id is still an
    import's "not set up yet" (`ScheduleGridRules.isSetUp`, `SET_UP_LATER_KINDS`; the browser's
    `identity` in `slotEdits.js` and `c/shoreshEngine` `grid.js` the same). It covers the bunks and
    time blocks chosen: each bunk's cells hold it (a run per bunk, `S` then `^`), and in Daily
    View bunks side by side holding it over the same blocks are drawn as **one named cell**
    (`mergeKey`, `c-shoresh-schedule-grid`), with its **quiet flag before the name** (decision
    47.3) and its place under it, as the mock-up. With the padlock bottom-right and the look mark
    top-right, all three show at once (decision 51). Several days means placing it on each.
    - **Placed** from the drawer's own **Events** section at the end (decision 47.2; the camp's
      word when it has its own): a tile picked and put down on a cell, dragged onto one, or picked
      while cells are chosen together, which puts it over them at once; or by **typing its name**
      into a cell or the cells chosen together (the typing box lists the season's events after
      the activities, each with its flag). Whatever was in those cells goes in full; a fixed or
      recurring activity, a bunk not at camp or a locked cell refuses it, saying which. Keyboard
      focus stays on the placed cell, or on the cell it is now drawn as one with when bunks side
      by side merge (the focused cell's own may be gone).
    - **Cleared** with Delete: one drawn across bunks goes from all of them, as one Undo step.
      It is not dragged or stretched (it is placed again instead). Clear day and Clear week clear
      it with the activities; Copy, Paste and Copy day to carry it (`tools.js isPlaceable`);
      Start from another week leaves it out and says so ("… a special event is put on each day by
      hand").
    - **Saved** as Manual Build's edits are (`SlotSaves`, `SlotRules.withEvents`, `SlotEvents`): only the
      season's events, read once per save (another season's or a deleted one is refused).
    - **The checks and counts leave it out** (desktop: the generator skips it, never "Unfillable"):
      no dots, not counted as filled or to fill (`checks.js filledCount`), so the counter and
      "Still to place" don't see it. **The generator keeps it like a lock**: a full build never
      clears, moves or fills over it (`GeneratedChecks`: something kept "stays where it is").

20. **An event's days follow the grids** (`SpecialEventDays`, from `ScheduleDayTriggerHandler`
    after a day is saved or deleted). An event is on a week's weekday (a `SpecialDate__c` row, choice 4)
    while a **draft** of that week (Manual Build or Generated, any program) holds it that day, so
    "Placed on" on the Special events screen and the delete refusal (choice 8) see the grid
    however its cells were written (an edit, Paste, Restore, Set it up). Versions and published
    copies are history and don't count. A save whose days hold no placed event, before or after,
    costs nothing (a text test on the stored grid); one that does costs four queries and the
    rows that changed. Only Monday to Friday a week still has. A grid can still hold an event
    since deleted (a version saved before it was cleared and deleted, then restored) or one of
    another season: it shows as removed on the grid, is on no day, and never stops the save, so
    such a version can always be restored. **Deleting a draft or its program** (a program whose
    schedules are all drafts can be deleted from Camp Setup) takes its days along with no trigger
    of their own, so `DeletedDrafts` (from the schedule and program triggers) notes the weeks before
    the delete (drafts of weeks that have an event on a day: one query) and make those weeks' event
    days again after it; one restored from the Recycle Bin puts them back. Otherwise an event
    would stay "on" a day no schedule shows, and could never be deleted.

21. **A special day goes on a day from its details** (desktop "+ Place on a day"; Director Guide
    §7): **Put on a day** in the details panel (decision 47.1) picks the week and the weekday (the
    weekdays that week has) and **Put on** puts it there (`SpecialDayPlacing`,
    `SpecialPlacingController`). A day that has another special day **asks first**, as the desktop
    does (its D11.4: "Week 2 Tuesday already uses Color War. Use Visiting Day instead?"): "Tuesday
    of "Week 1" already has the special day "Field Day". Use this one instead? "Field Day" stays
    saved." with **Use <name>** and Cancel; the answer replaces it in one save, nothing changed
    by asking. What was done is said (role status) and the season is read again, so Manual Build
    and Generated Schedule show it. Taking one off a day: choice 26.

22. **A replaced day shows the special day on both schedules** (desktop D4 and D6; decision 47.4;
    mock-up `placed-day.png`). Both screens are sent the week's specials (`WeekSpecials`: each
    day a special day replaces, with its own schedule as that date's day and the program's groups
    as its columns; one query for the week's special days, none on Generated Schedule, which reads
    them with its week, `ProgramReads.weekWithSpecialDays`, then one for their plans and one
    look-up per kind of record they point at). The season's events come with the season setup the
    screens already have. In Daily View that day's pill reads "Fri · Visiting Day"; its grid is the special
    day's own time blocks, read-only, every cell flat with a fine edge (it is changed in the
    special day), the same thing over the same blocks in bunks side by side one cell; where the
    drawer was, the special day's line: its name, the camp's word for it, its notes, and **Open
    <name> →**, which opens its schedule on the Special events screen. **No counter** on that day.
    In Group View its column is one named cell; Activity View counts nothing there.
    - **The week's own cells for that day are kept**, out of sight (desktop D4.6: non-destructive):
      taken off, the day is as it was. So the screens never change them meanwhile: that day shows no
      cell to edit, and Clear week, Copy day to and Paste leave it as it is and say so ("Tuesday is
      Visiting Day: left as it is."); Copy day to from it is refused. (The server doesn't refuse an edit there: that would cost a
      query on every save, and an edit that reached a hidden cell only waits there, as the
      desktop keeps such rows.)
    - **Nothing is generated or counted there** (desktop D4.1 to D4.3): the engine takes the
      replaced dates (`replacedDates`), builds and checks only the other days, and sends the
      replaced ones back exactly as they were; weekly counts are judged on the days that run.
      Start over leaves that day's cells too. With every day replaced, Generate says "Every day
      this week is a special day, so there is nothing to generate."

23. **"Set it up" on an imported "not set up yet" cell** (`SpecialSetUp` with `NotedItems` and
    `SpecialNamed`, from `SpecialPlacingController.setUpItem`, on Manual Build and Generated
    Schedule, each draft locked as its own edits lock it). With focus on a cell an import noted as a special event or special day,
    a line offers **Set it up** ("Color War isn't set up yet · Set it up"); one click makes it
    from what the file had, its name and where it was:
    - an **event**: the season's event of that name (spaces and capitals aside), made when there
      is none; every cell of the draft that named it now holds it, where it was (choice 20 then
      puts it on those days);
    - a **special day**: the season's special day of that name, made when there is none and
      starting from the camp's regular day as one added on the Special events screen does
      (choice 12), put on each weekday of the week where the file had it. A day that already has
      another special day keeps it and is named ("Wednesday already has "Field Day", so it isn't
      on that day."). The draft's cells for those days stay, out of sight (choice 22).
      The screen says what was done and reads the week and the season again. Electives and trips
      noted from a file are not set up here (they have no setup yet).

24. **Words and looks.** "Events" is the drawer section's word (the default "Special event"
    shortened, as on the Special events screen, choice 11). The flag is the mock-up's. A special
    day's notes show as written. No new colours: the flat read-only cell uses the edge token.

25. **Checked by** `WeekSpecialsTest` (a week sent its replaced day with the special
    day's own schedule, in a bounded open; Generated sent it too; an event placed on the grid is on that day, can't be deleted while it is, and
    is on no day once cleared; another season's event refused), `SpecialPlacingTest` (Put on a
    day, the question before replacing and the answer, already on that day, a weekday the week
    lacks; Set it up for an event and for a special day, and a day already taken),
    `specialDays.test.js` and `specials.test.js` (the week editor: the pill, the read-only day,
    its line and no counter, checks without it, Group View, the Events section, typing over
    chosen cells, one cell across bunks, clearing it, refusals, Set it up, the tools leaving the
    day), `c/shoreshEngine` `specials.test.js` (an event kept, left out of the counts; a replaced
    day never built, sent back, left out of the check; every day replaced),
    `shoreshScheduleViews` `events.test.js`, `shoreshScheduleGrid` `merged.test.js` (one cell,
    flag, padlock and mark together), `shoreshSpecialDetails` `putOnDay.test.js`, and in the
    test org by `scripts/a11y-browser-check.mjs` (Put on a day by keyboard, what was done said,
    axe with it open).

26. **Publish carries them** (`ScheduleSpecials` with `SpecialsNow` and `SpecialsCarried`, from
    `SchedulePublish`; desktop has no publish,
    so the rule is the data model's "published rows copy the names they show, so later edits do
    not rewrite what a past week said"). The published copy keeps the week's days exactly as the
    draft has them (ADR 0008 part 5), the cells under a replaced day included, and beside them a new
    detail of the schedule, `PublishedPlan__c`, holds what the week's special days and events were
    when it was published: for each day a special day replaces (its weekday must be a day the
    program's schedule has), the special day's name, notes and own schedule with the schedule's
    groups only; for each special event placed on a day not replaced that has a schedule of its
    own, its name (as the grid names it) and its schedule. A plan is written in the schedule-day
    format and parts (ADR 0005), so the same reader reads it back; `Item__c` keeps the record's Id
    as text, so a special day or event deleted later still says which it was and is never blocked
    by the history. Only Publish writes it: `PublishedGuard` refuses any other insert, change or
    delete, as for a published schedule's days. A special day's or event's schedule that can't be
    read is refused, nothing published ("The schedule of "Field Day" could not be read (…), so
    nothing was published."), as a day of the week that can't be read is.
27. **What changes in them is said before publishing again**, first in the list
    (`SpecialChanges`, `PublishedChanges.addBetween`): "Tuesday: the regular day →
    Field Day" (or back, or one special day for another, or renamed), "Tuesday · Field Day: notes
    changed", "… time blocks changed", "… bunks changed" (the camp's words), "Color War: stations
    changed", then each changed cell inside them as a week's cells are said ("Group A · Tuesday ·
    Field Day · Period 1: Open → Swim"). The week's own cells under a day replaced on either side
    are out of sight and not compared. The question counts them apart ("1 special day changes",
    "2 special events change", `Preview.specialDayCount`, `eventCount`; a cell inside them is a
    cell), "already published as it is" and Manual Build's and Generated Schedule's "· changed
    since" include them, so putting a special day on a day after publishing is something to
    publish. An event placed or cleared is a change of the week's cells, said there; an event
    that stays placed while its own schedule is built or removed after publishing (carried on one
    side only) is said as an event change (`EventScheduleChanges`), "Color War: schedule added"
    or "… schedule removed", so building an event's stations after publishing is something to
    publish too.
    **Reads**: the week's special days are one query (none on Manual Build and Generated Schedule
    when the week was read with them), their plans one more when there are any, and what a
    published copy carries one, once per request (published history never changes). A preview
    is now at most 7 queries (ADR 0008 part 5 item 7).
28. **The Schedules page shows them** (`ScheduleViews.openWithSpecials`, `ScheduleSpecials.shown`;
    desktop D6). A schedule that is or was published (Status Published or `PublishedAt__c`) shows
    what it carried, whatever changed since; any other (a saved or imported version, a draft) shows
    the week's special days and events as they are now, as Manual Build and Generated Schedule do
    (the desktop applies the replacement to whatever is on screen). In the page
    (`c/shoreshScheduleViews withSpecials`):
    - **Daily View**: the day's pill reads "Tuesday Jun 30 · Field Day"; the grid is the special
      day's own time blocks and the program's bunks, read-only like every cell here; under it the
      special day's line, as on Manual Build (its name, the camp's word for it, its notes; no
      "Open": this page shows what the version holds, and the special day's own screen edits
      today's). One with no schedule yet says "Field Day has no schedule yet." in the grid's place
      (desktop D11.2).
    - **Group View**: the day's column is headed "Tuesday · Field Day" and laid out on the special
      day's own time blocks: one at the same times as a week's time block shares its row, one at
      other times gets a row of its own in time order (desktop D6: "laid out on the special day's
      own time blocks"). Manual Build's Group View draws the day as one named cell (choice 22);
      this page shows a version's content, so it shows the cells. One with no schedule yet is one
      named cell down its column.
    - **Activity View** counts nothing on a replaced day (desktop: the drilldown ignores it); in an
      activity's grid that day's column is one quiet cell named for the special day.
    - **An event's own schedule**: under a day's grid, each special event placed on it that has a
      schedule of its own is listed with its flag, the camp's word, and **Open <name> →**; that
      shows the event's schedule (its time blocks down, its stations across) read-only in the
      grid's place, headed by "← Monday", its name and the camp's word, as Activity View's
      drilldown. Focus goes to "← Monday" and back to the event's Open (WCAG 2.4.3). Changing the
      day or the view closes it.
29. **Export to Excel and Print** (ADR 0005 §13; desktop D7: the special day's grid and its notes
    in place of the normal day). A replaced day's sheet is the special day's own schedule, then a
    blank row, "Field Day (Special day)" and its notes; it is in All Bunks (what each bunk does that
    day) and left out of All Activities, as Activity View leaves it out. Each event with a schedule
    of its own gets a sheet named for it (time blocks down, stations across) after the days. On
    paper, Daily View's page for a replaced day is titled "Tuesday, Jun 30 · Field Day" with its
    notes under the table (or "Field Day has no schedule yet."), and each event's schedule follows
    the days on its own page ("Color War (Special event)"); Group and Activity View print as they
    show.
30. **Fixed in passing**: a special day's own time blocks on Manual Build and Generated Schedule
    were sent marked "removed" (their ids are the plan's own, never records), so the time column
    struck them through. `SpecialPlanDay.ofAll` now builds every plan view (one look-up for all),
    and `WeekSpecials` uses it.
31. **Checked by** `ScheduleSpecialsTest` (as a scheduler, its camp, Field Day, Color War and the
    week's draft made inside the same `System.runAs` in its `@TestSetup`, `KeptCamp`: what Publish
    carries, preview at most 10 queries and publish 25 with a special
    day and an event; the published copy showing them as published after Field Day changed while
    the draft shows them now, opening at most 20; a preview naming an event's stations and a cell
    inside the special day; a day replaced after publishing as the one change, "· changed since"
    and publishing again; only Publish writing `PublishedPlan__c`), `WeekSpecialsTest` (a special
    day's own time blocks not removed), `SchedulePublishTest` and `GeneratedPublishTest` (a
    preview's bound now 7; two Generated tests read their last results before `Test.stopTest()`,
    as publishing in their setup costs two more queries), `shoreshScheduleViews` `specialDays.test.js`, `shoreshScheduleExport`
    `specials.test.js`, `shoreshSchedules` `specials.test.js`, `shoreshSchedulePrint.test.js`
    (notes and "no schedule yet" on paper) and `shoreshPublish.test.js` (the counts in words), and
    in the test org by `scripts/a11y-browser-check.mjs` (the Schedules page: a replaced day's pill
    and line, axe; an event's Open by keyboard, focus on the way back, axe, back with focus on its
    Open).

32. **A special day is taken off a day** (desktop `SpecialDayPlacements.jsx`: the "Placed on"
    chips' x and "Remove from this day"; Director Guide "Take it off a day"; mock-up `placed.html`
    "Take off Friday"). Two ways, as the desktop has two:
    - in its **details**, each day under **Placed on** has its own Take off (an x, named "Take
      Field Day off Tuesday of Week 2" for screen readers); an event has none (its days follow
      the grids, choice 20: it comes off a day when it is cleared from the grid);
    - on **Manual Build and Generated Schedule**, the replaced day's line has **Take off
      <weekday>** beside Open <name>, quiet, as the mock-up (`takeOffWith` on
      `c-shoresh-week-editor`, given by both screens). The week is read again and focus goes to
      that day's pill, which stays chosen.
      Both call `SpecialPlacingController.takeOffDay` (`SpecialDayPlacing.takeOff`: the special
      date of that special day on that week day, locked, deleted in user mode). **What comes back
      is said** (role status): 'Tuesday of "Week 2" has its regular schedule again. "Field Day"
      stays saved.' One already off says so and changes nothing ('"Field Day" is not on Tuesday
      of "Week 2".'); an event's Id is refused ("That can't be taken off a day.").
33. **Safe, and undone by putting it back** (desktop D4.6 and D8: unbinding is lossless; "bind it
    again to undo"). Taking off changes nothing but the special date: the week's own cells for
    that day were kept, out of sight, all along (choice 22), so they are back exactly as they
    were, and the special day and its plan stay saved. So it is not asked first, as on the
    desktop. In the details, **Put back** appears with what was said and takes the focus: it
    puts the special day on that day again, as Put on a day does, so a special day put there
    since asks first (choice 21). On the week's screens the line says the special day stays
    saved; it is put back from its details.
34. **Needs attention on the Special events screen** (and on Roots), shown and never fixed (a
    special day's plan is the director's own; `shoreshSetupRules` `specialDayProblems`):
    - a special day on a **weekday its week no longer has** (the week's dates moved, choice 4):
      'On Monday of "Short week", which that week no longer has. Take it off that day.' That
      day shows nothing special (choice 22);
    - a special day whose **time blocks no longer match the regular day's**: a time block with
      the same name (spaces and capitals aside) as one of the time blocks it started from (the
      first program with time blocks, choice 12) but other times, as when Lunch moved in setup
      after Field Day was made: "Its time blocks no longer match Main's: Lunch is 12:00–12:45
      here and 12:30–13:15 there." Its own time blocks under other names (Families arrive) are
      the point of a special day and are not flagged. The desktop has no such check (its special
      days copy time blocks once, `copyCampTimeBlocks.js`, and never compare again); this is the
      build plan's (Greg-approved) "Needs attention for a special day whose periods no longer
      match".
    - Not flagged: a group added to the camp since a special day started, which is not one of
      its columns (choice 16 refuses adding a group column, so there would be nothing to do
      about it yet).
35. **Deleting names where an item is.** A special day or event on a day is refused with the days
    named (choice 8), and the details' Take off is now the way to take a special day off them.
    Deleting a **week** asks as before and now also names what it takes off its days (choice 9;
    the items stay saved): 'Delete "Week 2"? Anything inside it is deleted too. It takes "Field
    Day" off Tuesday and "Carnival" off Wednesday and Thursday.'
36. **Checked by** `SpecialPlacingTest` (taken off with the week's own days unchanged, Tuesday
    too, the special day and its plan kept, nothing replacing the day, at most 10 queries, as a
    scheduler with records made in the same `System.runAs`; already off; another special day
    left where it is; an event refused), `shoreshSpecialDetails` `takeOff.test.js` (each day's
    Take off and its name, none for an event, what is said, focus on Put back, Put back and its
    question, a refusal), `shoreshWeekEditor` `specialDays.test.js` (Take off <day> only when the
    host can, the day back with its pill focused, a refusal), `shoreshManualBuild`
    `takeOff.test.js` (the week shown, the week and season read again), `shoreshSetupRules`
    (both Needs attention items, and what is not flagged), `shoreshCampSetup` (the week's delete
    question), and in the test org by `scripts/a11y-browser-check.mjs` (Take off by keyboard in
    the details, what comes back said, focus on Put back, axe; the step no longer takes it off
    by Apex before deleting it).

## Names

`PublishedPlan__c` (slice 5): `Schedule__c` (master-detail), `Kind__c` (`D` or `S`, the grid
format's letters), `Item__c` (the record Id as text), `Date__c`, `Notes__c`, `Part__c`, `Plan__c`,
`GridFormatVersion__c`, `Revision__c`; Name is the item's name as published. Hard to undo once
camps have published schedules carrying it.

Every object and field is reached through typed Apex references and `c/shoreshSchema`
(regenerated), never written as text (ADR 0009). Messages use camp labels for `SpecialDay`,
`SpecialEvent`, `Week`, `Season` and `Location`.

## Not in this slice

A special day's column for a group added to the camp after it started (choice 34).
