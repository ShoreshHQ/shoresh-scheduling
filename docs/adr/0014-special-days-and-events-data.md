# 0014: Special days and special events, the data

Status: proposed (2026-10-20; slice 2 added 2026-10-22; slice 3 added 2026-10-22), Special Events
and Special Days slices 1 to 3 of 6 (plan: wiki
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
`2026-08-22-event-internal-subschedule` and `2026-08-22-event-schedule-import`._

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
      week does (`BlankDay.atCampPart`, now shared). A slot already taken is left as it is;
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
    - **A fixed or recurring activity brought in** when a special day started (choice 12) keeps
      its padlock and stays where it is, as on every schedule ("Fixed activities and recurring
      activities stay where they are."); **Clear schedule** (Edit menu, asked first) empties every
      cell, those too. The desktop's special-day grid lets such a cell be typed over; here the
      grid is the shared one, whose padlock means "stays", so taking one out is Clear (or slice
      6's follow-up). No checks or dots on a special schedule (the desktop's special days have no
      engine either).

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
    `blockFromLabel`, `cellName`, now exported), the first schedule in it: its rows' times are
    the time blocks (a row with only a start ends where the next starts), its columns an event's
    stations or, for a special day, the camp's groups matched by name, and each cell's name the
    season's activity of that name or a new one (choice 15). A cell merged down the rows carries
    on. **Only an empty schedule is imported into**, as on the desktop: one with entries is
    refused ("Color War already has entries. Clear it first if you want to replace it with an
    import, or add to it by hand."). Nothing is left out quietly: the screen says how many cells
    were filled, the activities added, columns that name no group, rows with no times, places
    written in cells (not kept), and when only the first of several schedules was read.

18. **Checked by** `SpecialScheduleTest`, `SpecialScheduleFrameTest` and `SpecialScheduleImportTest` (as a scheduler, records made in the same
    `System.runAs`, each request's queries bounded: open at most 20, a cell save 25, a frame
    change 20, an import 25; a special day's own time blocks and groups, typing, a conflict, a
    fixed activity kept, another season's activity refused, an event's time blocks and stations
    added, moved, renamed, taken out, a placement cut in two, Clear, a stale revision refused, an
    import for an event and for a special day, a second import refused, Add <name> at 0 times a
    week, no access), `shoreshSpecialSchedule.test.js` and `fromFile.test.js` (the screen, typing
    saved as Manual Build's, the frame, Clear, Import and Download, a file read into a plan),
    `shoreshWeekEditor.test.js` (planName), `shoreshSpecialDetails.test.js` and
    `shoreshCampSetup.test.js` (Open schedule and back), and in the test org by
    `scripts/a11y-browser-check.mjs` (the special day added in the Special events step: its
    schedule opened from its details with focus on its name, axe on it, a name typed into a cell
    and its save said, back with focus on Open schedule). A plan with no time blocks yet now reads
    back (`ScheduleGrid` takes a row with no cells when there are no time blocks).

## Names

Every object and field is reached through typed Apex references and `c/shoreshSchema`
(regenerated), never written as text (ADR 0009). Messages use camp labels for `SpecialDay`,
`SpecialEvent`, `Week`, `Season` and `Location`.

## Not in this slice

Putting a special day or event on a day and showing it on the schedules (slices 4 and 5),
replacing a placed special day with a confirm, Needs attention for a special day whose weekday or
groups no longer match (a group added to the camp after a special day was made is not one of its
columns until then), and the week delete warning (slice 6).
