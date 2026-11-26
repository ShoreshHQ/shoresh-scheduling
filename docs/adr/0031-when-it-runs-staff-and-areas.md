# 0031. When an activity can run, who leads it, and areas of camp

Date: 2026-11-26. Status: proposed (Greg, 2026-11-26: "plan it all"). The plan for three pieces, each
its own PR. Each PR fills in its own section's decisions as it is built and marks it accepted.
Piece A: accepted (built 2026-11-26; "As built" below). Piece B: accepted (built 2026-11-26;
"As built" below).

## Context

A competitor study (wiki `venture/camp-scheduler-competitors.md`) found one gap a camp comparing
schedulers would notice: staff. Camptivities schedules an activity only when someone who can lead it
is free. Greg (2026-11-26): most camps work the other way. They plan activities first, then put staff
on them. What a camp needs is to say when an activity can run (because that is when its leader is
around), and then name who leads it.

Today a regular activity cannot be limited to part of the day or week. "Morning only" and "afternoon
only" belong to groups (CORE-1.7, engine 2.6). An activity can only be closed for a whole week
(`WeekException__c`, engine 1.2) or pinned as a fixed or recurring activity. The desktop has neither
feature, so both go beyond it. Build them from screens Shoresh already has, not new designs.

Greg also asked for walking areas, for camps on a big, spread-out site, planned now and built last.

Decided by Greg the same day and not part of this plan: fairness stays week by week (no
season-wide fairness rule). Ideal class size, skill prerequisites, parent apps, check-in,
overnight tools and counselor phone views are outside Shoresh.

## Piece A: when an activity can run

1. **The activity details panel gains "When it runs":** for each program, a grid of that program's
   days (weekdays, or Day 1 to Day N for a numbered-days season, ADR 0025) by its time blocks. Every
   box starts ticked; the director unticks where the activity can't run. Use the same ticks the
   recurring activity's days already use. Time blocks, not hours: blocks already carry clock times,
   and hours would make a block that half-overlaps a leader's hours ambiguous.
2. **Stored as the boxes that are unticked**, so nothing stored means "whenever", and a time block or
   day added later is open until the director says otherwise. A child record of the activity (for
   example activity, program, time block, day) is a choice that can't be undone after release, so the
   PR names it under "Choices that are hard to undo" as ADR 0002 does.
3. **The generator never places an activity where it can't run**: a new engine rule beside closures
   (1.2) and not-at-camp (2.6), in the engine protocol, with its golden and differential tests. A
   camp that unticks nothing gets the same weeks as before. The tests must prove that.
4. **A person's own hand edit there still goes through**, saved and kept like any lock, and shown in
   the Why list like a closure (engine 9.9, CORE-4.8). Shown, never refused.
5. **Everywhere that picks an activity respects it**: Build a week, Generated Schedule, Update to
   match setup, the rainy-day fallback (CLOSE-4.9) and the checks. Electives, special days, special
   events and imported weeks: settle each case from the protocol, write down what was chosen and why,
   and ask the coordinator if the protocol doesn't answer it.
6. **The AI and command line**: `read_activity_details` / `change_activity_details` (API-1.51) gain
   it, in the panel's own words, through the panel's own save.
7. **Lists and copies keep it**: an activities download and import round trip doesn't lose it, and Copy
   season carries it over (time blocks matched as Copy season already matches them).

### Piece A as built

- **Stored** as `ActivityOffTime__c`, one row per box unticked: `Activity__c` (master-detail, so
  it goes with its activity and shares its access), `TimeBlock__c` (a lookup: a time block deleted
  leaves the row blank, which says nothing and is dropped at the activity's next save) and
  `Day__c`, the weekday Monday to Sunday. A numbered-days season's Day 3 is stored as its weekday,
  as every other stored day is (ADR 0025 choice 2). The program is the time block's, so it is not
  stored again. A trigger refuses a time block of another season and any change in an archived
  season, as Who can do it's does.
- **The panel** shows one small table per program (named only when the season has several), the
  program's days across in the camp's week order and its time blocks down; each box is the
  recurring activities' day tick (`chip`), ticked = it can run. A box saves the moment it changes,
  as Who can do it does: the whole list, only while it is still as the director saw it
  (`ActivitiesController.saveWhenItRuns`); someone else's change since is asked about with the
  panel's "Changed by someone else" question.
- **The engine** treats an unticked box as a limit, like an activity's length (protocol GEN-3.14
  to 3.17, CORE-4.9): no step places it there and never-blank never bends it. A cell where nothing
  set up for the group runs says so ("No activity for Bunk 4 runs then"). A camp that unticks
  nothing gets exactly the weeks it got before: the whole engine suite (golden, ported desktop and
  desktop-differential weeks) passes unchanged, and 150 random camps build byte for byte the same
  with and without empty When it runs lists.
- **Shown, never refused:** a hand edit or lock there is kept and its dot says "Not running then"
  on both schedules; Update to match setup lists a placement there with the same words among the
  changes the director chooses, and takes it out (a locked one too) only if chosen, exactly as it
  does a closure. The server refuses only a generated save that newly places one
  there ("Archery doesn't run in Lunch on Monday."), as it does a closure.
- **Rainy day** (CLOSE-4.9) never switches to an indoor activity that doesn't run in that block
  on that day.
- **AI and command line:** `read_activity_details` / `change_activity_details` gain
  `when_it_runs`: "whenever", or a list of the boxes it can't run, each said as the panel reads it
  out ("Lunch, Monday"; "Lunch, Day 1" in a numbered season; " (Main)" after it with several
  programs). The change goes through the panel's own save, compared under the activity's lock.
- **Copy season** copies each row onto the copied time block (matched by `CopiedFrom__c`, as Copy
  season matches time blocks).

**A5, the cases the protocol had to settle:**

- **Electives:** not limited. An elective set is placed by the director, at its own set time
  (repo ADR 0027), and the engine keeps it like a lock (GEN-2.2); its offerings are chosen for the
  set, not placed in cells. The engine never picks an elective, so When it runs has nothing to
  steer there. An offering at a time its activity is unticked is the director's own choice.
- **Special days:** not limited. A day a special day replaces is never built (GEN-2.8), and its
  plan is made by hand on the special day's own time blocks, which no grid box names.
- **Special events:** not limited. An event is placed by hand and kept (GEN-2.2); it isn't an
  activity.
- **Imported weeks:** the imported version itself is kept as it was (Versions never change). Step
  8's floor seeds a build from it only with placements the engine itself may make
  (`weekFloor.js` seedFromImport asks `allowed`), so an imported placement where its activity
  can't run isn't carried into a Generate; a week built by hand from the import keeps it, with
  its "Not running then" dot.
- **Hand edits and Manual Build:** a person may always put an activity there (CORE-4.8); it is
  shown, never refused.

**Choices that are hard to undo after release:** the object `ActivityOffTime__c` and its three
fields; `Day__c` values Monday to Sunday; storing the boxes unticked (nothing stored = whenever)
rather than the boxes ticked; the AI's word "whenever".

## Piece B: who leads an activity

1. **Staff are a list in Camp Setup**, like Locations: name and notes, with Import a list and
   Download. A staff member can come in from the camp's own system through the API with that
   system's ID, like campers (decision 0009, `bring_in_*`). Shoresh never owns more about a person
   than it needs.
2. **The activity details panel gains "Who leads it"**: none, one or more staff. Leaders belong to
   the activity, not to each cell. A cell-by-cell override waits until a camp asks for it.
3. **Leaders show where staff look**: the Activity and Location print views and Excel sheets name
   them, and Print and Excel gain **By staff member**: one page per person showing where they are at
   each time block of the week. That is built from the activities they lead and where those activities
   landed. It doesn't need a new screen.
4. **A clash is shown, never fixed**: one person leading two different activities at overlapping
   times goes in the Why list ("Dana leads Archery and Swim, Monday 10:00"). The generator doesn't
   know about staff. That matches Greg's "activities first", and "When it runs" is how a director keeps
   a leader's activities apart. The same activity with several groups at once is not a clash.
5. **No shifts, no time off, no availability, no staff-first generation.** Decision 0003 in the wiki
   changes from "no staff scheduling" to "staff are named on activities, not scheduled". The PR's Wiki
   line asks the coordinator to make that change.
6. **The AI and command line** can read and change the staff list and an activity's leaders, and read
   the By staff member view, through the screens' own saves.
7. **Copy season** carries staff and leaders over.

### Piece B as built

- **Stored** as `StaffMember__c`, a child of the season like a location (name, notes, its place
  in the list, and for a person from the camp's own system that system's name and ID, matched as
  campers are: `OutsideMatch__c`, season + system + ID, unique), and `ActivityLeader__c`, one row
  per leader: `Activity__c` (master-detail) and `StaffMember__c` (a lookup: a staff member
  deleted leaves the row blank, which says nothing and is dropped at the activity's next save).
  A trigger refuses a staff member of another season and any change in an archived season.
  "Staff member" is a camp word (`StaffMember`), so a camp can call them counselors.
- **Camp Setup** has a Staff screen after Locations: the list (name, the activities each leads,
  notes in the row's details), Import a list and Download (names and notes), saved as every
  setup table is. **The activity details panel** has "Who leads it": the season's staff as ticks,
  shown only once the season has staff, saved the moment one changes, whole, only while it is as
  the director saw it (`ActivitiesController.saveWhoLeadsIt`, CORE-1.40).
- **Prints and Excel** (PUB-6.12 to 6.14): an Activity page's title names its leaders; a Location
  page lists, under its grid, who leads each activity held there; and **By staff member** gives a
  page and a sheet per person who leads something placed that week: days across, time blocks
  down, each cell the activity, where and with which groups.
- **The Why list** (CORE-6.20): "Dana leads Archery and Swim · Monday · Period 2", once per person,
  day and time block, among the lines to look at, never fixed. Said by the time block's name, as
  every other Why line names a time, rather than the clock time the plan's example used. It
  checks one program's week, as the Why list does; a person leading in two programs at once is
  not seen yet. The generator never reads Who leads it: the engine suite passes unchanged and 60
  random camps build byte for byte the same with and without leaders.
- **AI and command line:** staff are a setup kind (add, rename, notes, delete; the Staff list's
  import and download), and `read_activity_details` / `change_activity_details` gain
  `who_leads_it` (names A to Z, or "nobody"), saved through the panel's own save (API-1.158,
  API-1.159). The By staff member view is the connector's `download_schedule` with `what: staff`.
- **From the camp's own system:** `/v1/staff` (and the Flow action `staff`, permission set
  `Send_Staff`) brings staff in matched on system + ID only, never on name, as campers come in
  (API-2.7); Undo last import covers it. A staff member from outside keeps that system's name:
  only its batches change it (API-4.11, as campers' names, API-4.2); one added by hand in Camp
  Setup is renamed freely. Not an AI tool (API-1.6).
- **Electives:** not covered. Who leads it names who leads an activity's regular placements; an
  elective is placed by the director at its own set time (as for When it runs, A5), so the By
  staff member page and the Why list's conflict line look at regular activities only.
- **Copy season** copies the staff (with the camp system's ID, so that system finds the same
  person next season) and who leads each copied activity.

**Choices that are hard to undo after release:** the objects `StaffMember__c` and
`ActivityLeader__c` and their fields; the camp word `StaffMember`; leaders stored per activity
(not per cell); the AI's word "nobody"; the outside door's `global` surface (`IncomingStaff`, its
`Record` with `season`, `source_system`, `staff_id`, `staff_name`, the address `/v1/staff` and
the Flow action `staff`).

## Piece C: areas of camp (walking distance)

1. **A location may have an area** ("Lakefront", "Upper fields"). It is optional, a column in the
   Locations table, and in the list import and download. Most camps leave it blank.
2. **The generator prefers fewer back-to-back area changes for a group, as its last tie-break**:
   after every rule and preference it has today, and before "the first found". It never costs a
   minimum, an Open cell, a lock, a maximum, the spread or any other existing preference. A camp with
   no areas gets the same weeks as before, and the golden and differential tests must prove it.
3. **The Why list shows walks only when areas are set**: "Bunk 4 changes area 3 times on Monday".
   Shown, never refused.
4. **The AI and command line** read and change a location's area like its other fields.

## How it is built

Order A, B, C, each one PR from origin/main under the repo's CLAUDE.md: test first, protocol
statements with their test cells, both reviews, lint, quick checks green, never merge. The
coordinator batches. Every screen change is checked in the test org after its batch on a made-up camp,
with screenshots for Greg, who reviews the outcome.
