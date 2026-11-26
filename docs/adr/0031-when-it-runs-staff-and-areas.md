# 0031. When an activity can run, who leads it, and areas of camp

Date: 2026-11-26. Status: proposed (Greg, 2026-11-26: "plan it all"). The plan for three pieces, each
its own PR. Each PR fills in its own section's decisions as it is built and marks it accepted.

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
