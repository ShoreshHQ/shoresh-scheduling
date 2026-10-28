# Import: which week, and one week's own day

> **Sub-protocol INGEST** of the [Shoresh protocol](../protocol/README.md). It sits on CORE
> layers 1, 2 and 6 ([core.md](../protocol/core.md)) and is part of reading (layer 2). Rule n
> here is statement `INGEST-4.n`.

How "Import last year" tells which week each part of the files is for, and reads a week whose
day has its own time blocks. Settled product rules: recognise it, do it, and show it in the
notes; ask only on a genuine split, never resolve one silently; one week's shape comes from the
grid (ADR 0022).

Code: `force-app/main/default/lwc/shoreshImportEngine/` (`weekLabels.js`; `sheets.js`
`splitWeekColumn`; `layouts.js` `pageWeek`; `structure.js` `weekDayShapes`; `version.js`
`mapWeeks`, `specialDayFor`; the note in `plan.js` `importNotes`; the save in Apex
`ImportSpecialDayWrites`). Tests: `__tests__/weeks.test.js`; the
level-2 corpus in `__tests__/corpus.test.js`.

## The rules

Each rule is clue, meaning, example, test.

1. **A week column.**
   Clue: a column headed Week, Wk, Week #, Weeks, Session, Week of, Week starting, Dates or Week
   dates (any capitals), whose cells in the rows below (title lines of one cell left out) name
   weeks: "Week 2", "Wk 2", "W2", a bare number, a date ("7/6", "July 6"); at least two of them
   and at least four in five of the filled cells.
   Meaning: each row is for the week its cell names; a blank cell carries the week above down.
   The column is not a group. A bare number under Session is "Session n", otherwise "Week n"; a
   date is "Week of month/day". A page whose rows are for several weeks is read as one page per
   week.
   Example: a CSV "Week, Period, Time, Group 1, Group 2" with "Week 1" ... "Week 5" down the
   first column (level 2 "allCamp csv weekColumn").
   Test: "INGEST-4.1: a Week column gives each row its week"; "recognises Wk, Session, Week of
   and Dates headings"; "the week written once and left blank below carries down".
   Counter-case: a column headed Week whose cells name no weeks is read as before ("a column
   headed Week whose cells name no weeks is not a week column").

2. **The week in a file's name.**
   Clue: the file's name (folder and extension set aside) names a week: "Week 2", "Wk2", "W2",
   "Session 1", "Week of July 6", or a bare date when the name names no day ("Camp - 7-6-2026";
   "Monday 6-30" is that day's date, not a week). A page's own title or sheet name naming a week
   comes first.
   Meaning: every page of that file is for that week, also when the file's name is used for the
   group's name (by-group files: the week is taken out of the name, the week kept). Files for
   different weeks never disagree: a cell is compared only with the same group, week, day and
   block.
   Example: "Camp 2026 - Week 2.xlsx", a sheet per group (level 2 "byGroup xlsx filePerWeek").
   Test: "INGEST-4.2: reads Week 2, Wk2, W2, Session 1 and a date as the week"; "a by-group file
   per week, the week only in the file's name"; "Wk, W and Session file names read the same way".
   Counter-case, still asked: two files for the same week that differ ("two files for the same
   week that differ still disagree, and it is asked"). A group named like a month ("Juniors 1")
   is not a date.

3. **One week's day with its own blocks is that week's own day, not a second program.**
   Clue: in files of two weeks or more, pages whose time blocks clash with another
   timetable's (a Friday afternoon of one long block where the other days have two), where
   those pages hold no group on a week and day the other timetable already has for it; have
   blocks the other lacks on at most one day of a week, on fewer than half of all the days of
   the files, and not in every week; and have only the other's groups, or (new groups, a second
   session starting that week) use only the other's blocks on their other days.
   Meaning: those pages join the other's program, and the groups stay one group each (no
   "(schedule 1)"/"(schedule 2)"). The day comes in as a special day on that week's day (ADR
   0014: it replaces that day for the whole camp), named after it ("Week 2 Friday"), with its
   own time blocks (the blocks its cells use, ids of its own) and the file's cells in its
   schedule. The program's time blocks never gain that day's; the week's version has no grid
   for that day; set times do not count it as one of "every day". The notes say so ("Week 2's
   Friday comes in as a special day with its own times"). A by-group page that holds both
   shapes (the normal blocks and the short Friday's) is one timetable.
   Example: level 2 "oddFriday": week 2's Friday has Activity A and B after lunch where the other
   days have Activity 4 to 6.
   Test: "INGEST-4.3: a Friday with other blocks in week 2 is that week's own day"; "the same on
   by-group pages"; "a special day on Week 2's Friday, with its own blocks and the file's
   cells"; "the program's blocks never gain the short Friday's"; Apex `ImportSpecialDayTest`
   (saved as a special day with its own blocks; Undo takes it away). The corpus scorer checks
   the saved plan's program blocks and the special days found.
   Counter-cases, still two programs: different groups on different blocks every day ("different
   groups on different blocks every day are two programs"); a Friday that differs in every week
   ("a Friday that differs in every week is not one week's day"); a one-week file, which cannot
   tell one week's Friday from every week's (`classify.test.js`, "rule 4: Lunch for everyone on
   a Friday of its own is fixed when fixed at that time Monday to Thursday").

4. **A week named by a date goes to the season's week holding it.**
   Clue: a week read as "Week of month/day" (rules 1 and 2), and a season week whose start and
   end dates hold that month and day (any year).
   Meaning: that week's grids go to that season week without asking; a date in none of the
   season's weeks is asked, as any unmatched week is.
   Test: "INGEST-4.4: goes to the season's week holding that date, without asking";
   counter-case "a date in none of the season's weeks is asked".

5. **"Session N" in a season of numbered weeks.**
   Clue: a week read as "Session N" (rules 1 and 2), and the season's weeks all named one word
   and a number, the same word, not Session ("Week 1", "Week 2", ...).
   Meaning: Session N is the season's week numbered N, without asking, said in the notes
   ("Session 2 is read as Week 2: the weeks are numbered.").
   Test: "INGEST-4.5: Session 2 is the season's Week 2, without asking, said in the notes".
   Counter-case: weeks not numbered ("Opening", "Color War") are asked, as before ("weeks not
   numbered are asked, as before").

6. **The camp's own special day on that day wins.**
   Clue: a week's own day (rule 3) on a season week's day that already holds one of the camp's
   special days (a day holds one, ADR 0014 choice 3).
   Meaning: the director's special day is kept; the file's day is left out, its cells listed as
   not placed, and the notes say so before saving ("Week 2's Friday already has Color War, so
   the file's Friday was left out."). The save never fails on it: one placed since the screen
   read the camp is skipped too.
   Test: "INGEST-4.6: the camp's own special day on that day wins"; Apex
   `ImportSpecialDayTest` "theDirectorsSpecialDayOnThatDayWins".

## Known limits

- A day whose blocks differ in every week (a short Friday every week), or in a one-week file,
  still reads as a second program, with the groups split into "(schedule 1)" and "(schedule
  2)", as before.
- Without season weeks (none, and no dates to fill them in), the special day has no day to go
  on and its cells are left out, as a version's are.
