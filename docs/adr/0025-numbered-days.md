# 0025: Numbered days (Day 1 to Day 6)

Status: accepted (2026-11-06). Product decisions: Greg, 2026-11-06 (found by the break-and-rebuild
campaign: a Day 1 to Day 6 file was read as bunks on one day). Neither the desktop nor Salesforce
had this, so there is no desktop spec. Builds on ADR [0022](0022-any-day-of-the-week.md).

## Greg's decisions

- **The number restarts each week.** The camp's first day of the week is Day 1 again, so a Day 6
  isn't reached in a five-day week.
- **A closed or rained-out date's number is skipped.** The next open day keeps its own number.
- **One grid repeats.** Day 1 to Day 6 are built once and every Day 3 looks the same; a change on
  one date is an exception to that grid.

## Choices

1. **A season's days are named or numbered.** `Season__c.NumberedDays__c`, a checkbox like
   `ShrinkShortWeek__c`, off by default, carried by Copy season.

2. **A day's number comes only from its date.** It is the date's place counted from the camp's
   first day of the week (WEEK-1.2, `WeekCalendar.firstDayOf`): Monday is Day 1 for Monday to
   Friday, Sunday is Day 1 for Sunday to Thursday. Nothing is stored per date and every stored
   key stays a weekday (ADR 0022 choice 2), so a day's number is a new way of saying a weekday:
   schedules, publishing, sending out, versions, rain plans, electives and special days keep
   working. Sending out already speaks in dates. A closed date needs nothing: the numbers around it
   don't move.

3. **Saying a day goes through one place.** Today nine separate places word a day. Each screen,
   download and AI answer in a numbered season says "Day 3", through `dayLabel` on screen and one
   Apex helper on the server. A date stays beside it where it is shown today. An AI may name
   "Day 3", the date or the weekday; its answers say "Day 3".

4. **Each program has its own grid,** as schedules are per program and week today.

5. **The grid is a real week, and Apply to other weeks repeats it.** The director builds any week
   as today (Generated Schedule or Manual Build), then applies it. Every date keeps its own
   `ScheduleDay__c` row: a grid with no date has nowhere to live, and publishing and sending out
   read rows by date.
   - Apply shows what would change first, week by week. It is the person's own action, so WEEK-6.1
     holds: building or changing a week never changes another by itself. A later change to the grid
     reaches other weeks only by applying again.
   - **A locked cell is the exception.** Apply matches cells by Day number and never overwrites a
     locked cell in a target week; each one kept is listed. No "base" field: a lock is already how a
     person says "keep this", and it is already shown.
   - A target week's draft goes to its Versions first, so Apply can be undone there.
   - A cell on a Day the target week doesn't have is listed, never dropped (WEEK-2.4).
   - A published week changes only by publishing it again (PUB-4.2).
   - **It goes screen to screen.** Manual Build applies to other weeks' Manual Builds, Generated
     Schedule to their Generated Schedules; a week has one of each, and only that screen's draft
     changes. A week with none gets one (`WeekApply`).
   - **The grid repeats, so every unlocked cell follows it,** an empty one too; fixed and recurring
     activities stay the week's own, and a special event stays where it was placed (listed, as
     Start from another week lists one).
   - **What Apply fills isn't locked, on Generated Schedule too,** though a hand edit's cells are
     (LOCK-1.1): a lock would keep each cell the next time, and a later change to the grid could
     never reach it. Only a person's own lock keeps a cell. A Rebuild of that week then moves what
     Apply filled; that is the person's own action too, and the week goes to Versions first.
   - **One week per call.** Each week reads its setup and both weeks' days, and writes a version
     and a draft: reasoned at 12 to 25 queries for the preview and up to 45 for the apply (bounds
     in `WeekApplyTest`, not yet measured), so 8 weeks can't fit the limit of 100 queries in one
     request. The screen goes through the weeks one call at a time, says how far it has got, and
     keeps each week whole; a week that fails is said on its row and the others still go. An AI
     does the same, one `apply_to_other_weeks` per week (API-1.124).

6. **The import reads "Day 3" as that day.** Columns, pages, heading rows and one file per day,
   recognised in `dayOf` before letters are stripped. A numbered file into a season with no weeks
   marks the season numbered; into an existing named-days season, each number is shown as the
   weekday it lands on. Either way the review shows it, and nothing is asked unless the file can't
   be read another way. A Day 6 cell in a Monday-to-Friday season is listed: "that week has no such
   day".

7. **Early-week goals still count by position** (WEEK-4.1): "by Day 3" is the first 3 days of that
   week's run.

## Not done here

- A number that carries on across weekends and weeks, or waits out a closed day (Greg chose
  otherwise).
- A camp word for "Day". `CampLabel__c` could rename it later; numbering itself is behaviour, not a
  synonym.
- A week that links to its grid live. Apply copies; nothing changes behind a director's back.
