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
   Clue: the file's name (folder and extension set aside) surely names a week: "Week 2", "Wk2",
   "Session 1", "Week of July 6", a month and day ("Jul 6"), or a full date with its year
   ("Camp - 7-6-2026") when the name names no day ("Monday 6-30" is that day's date). A pair
   of numbers alone ("Grades 3-5", "Ages 8-10", "Swim 7-6", "Camp 10.2 final") is a week only
   beside the word week; otherwise it is not one and the name is kept whole. A bare "W2" is a
   week only alone: no group word ("Bunk W2", "W12 Girls") and no other small number in the
   name, and the number no more than the season's weeks (12 when it has none yet). A page's
   own title or sheet name naming a week comes first.
   Meaning: every page of that file is for that week, also when the file's name is used for the
   group's name (by-group files: the week is taken out of the name, the week kept). Files for
   different weeks never disagree: a cell is compared only with the same group, week, day and
   block.
   Example: "Camp 2026 - Week 2.xlsx", a sheet per group (level 2 "byGroup xlsx filePerWeek").
   Test: "INGEST-4.2: reads Week 2, Wk2, W2, Session 1 and a date as the week"; "a by-group file
   per week, the week only in the file's name"; "Wk, W and Session file names read the same way".
   Counter-case, still asked: two files for the same week that differ ("two files for the same
   week that differ still disagree, and it is asked"). A group named like a month ("Juniors 1")
   is not a date. Not weeks (review of PR 176): "a range or a version number in a name is not
   a week, and the name is kept whole"; "a bare W2 is a week only alone and within the season's
   weeks".

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
   schedule. One bigger than a schedule holds (40 time blocks, 150 groups) refuses the whole
   import, nothing saved. Undo removes it, unless the director has saved its schedule since
   (then it stays, on its day, with every group, activity and place its schedule uses, and Undo
   lists them as kept: "Swim (Week 2 Friday uses it)"). The program's time blocks never gain
   that day's; the week's version has no grid
   for that day; set times do not count it as one of "every day". The notes say so ("Week 2's
   Friday comes in as a special day with its own times"). A by-group page that holds both
   shapes (the normal blocks and the short Friday's) is one timetable.
   Example: level 2 "oddFriday": week 2's Friday has Activity A and B after lunch where the other
   days have Activity 4 to 6.
   Test: "INGEST-4.3: a Friday with other blocks in week 2 is that week's own day"; "the same on
   by-group pages"; "a special day on Week 2's Friday, with its own blocks and the file's
   cells"; "the program's blocks never gain the short Friday's"; Apex `ImportSpecialDayTest`
   (saved as a special day with its own blocks; Undo takes it away; too big refuses the import;
   Undo keeps one whose schedule the director saved since). The corpus scorer checks
   the saved plan's program blocks and the special days found.
   Counter-cases, still two programs: different groups on different blocks every day ("different
   groups on different blocks every day are two programs"); a day of its own answered "A second
   program" (`classify.test.js`, "rule 4: Lunch for everyone on a Friday of its own is fixed when
   fixed at that time Monday to Thursday"). The same day in every week, or in a one-week file,
   is rule 12.

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
   numbered are asked, as before"). The note is given only when the session decided the week; a
   name with both a session and a week ("Session 2 Week 1") is asked ("the session note only
   when the session decided; Session 2 Week 1 is asked").

6. **The camp's own special day on that day wins.**
   Clue: a week's own day (rule 3) on a season week's day that already holds one of the camp's
   special days (a day holds one, ADR 0014 choice 3).
   Meaning: the director's special day is kept; the file's day is left out, its cells listed as
   not placed, and the notes say so before saving ("Week 2's Friday already has Color War, so
   the file's Friday was left out."). One placed after the screen read the camp refuses the
   whole import with a message (read the files again), never dropped silently.
   Test: "INGEST-4.6: the camp's own special day on that day wins"; Apex
   `ImportSpecialDayTest` "aSpecialDayAddedSinceTheFilesWereReadRefusesTheWholeImport".

7. **A date of numbers only may be month first or day first.**
   Clue: a "Week of" date of numbers only ("6/7") that reads as a date both ways.
   Meaning: when only one reading lands in a season week, that week, said in the notes ("Week
   of 6/7 is read as July 6, in Week 1: read the other way round, it is in none of the
   weeks."); when both land in different weeks, asked. A month name or a year first ("Jul 6",
   "2026-07-06") reads one way only.
   Test: "INGEST-4.7: only one reading lands in a season week"; counter-case "both readings
   land in season weeks: asked"; "a date of numbers may be read either way".

8. **Two days of their own in one week are asked.**
   Clue: rule 3's clue, except that one week has two days with their own times (Thursday and
   Friday of week 2).
   Meaning: asked "Are Thursday and Friday of Week 2 special days, or a second program?".
   Until answered (or answered a second program) the days stay a program of their own, as
   before; special days joins them as rule 3; leave it out leaves those days out.
   Test: "INGEST-4.8: two days of their own in one week are asked"; counter-case "one day of
   its own in a week is not asked".

9. **Two programs' days of their own on one week's day.**
   Clue: two timetables (two programs) each have a day of their own on the same season week's
   day.
   Meaning: a day holds one special day, so which program's day it is is asked; until answered
   (or left out) neither is made, never two, and their cells are listed as not placed. The save
   refuses a plan that would still put two on one day.
   Test: "INGEST-4.9: two programs' own Fridays in one week: which is asked, never two special
   days".

10. **A doubled cell runs over its own day's blocks.**
    Clue: a merged cell or a cell written twice down a page (a double period, a trip all
    afternoon) in a program whose timetable also holds a week's own day's blocks (rule 3).
    Meaning: the run covers the time blocks of the rows it spans on its own page, and on a day
    that is not a day of its own never one of that day's own blocks; a by-group page whose rows
    between are another day's own blocks (blank that day) is read over them. Before, the run was
    counted on from its first block along every block of the timetable, so it landed on the
    special day's.
    Example: level 4 L4-012, a Field Trip merged down Week 1's Tuesday afternoon, in files whose
    Week 3 Wednesday has its own blocks.
    Test: "INGEST-4.10: a merge on Monday runs over Monday's blocks, not the short Friday's between
    them"; counter-case "INGEST-4.10 counter-case: a doubled cell in a week with no day of its own
    runs on as before". Code: `items.js` `coveredIndexes`, used through `blocksOf`.

11. **A special day covers both programs** (Greg, 2026-10-28, level-4 decision 3).
    Clue: one program's week's own day (rule 3), made as a special day, in files of two programs
    or more, where another program has a regular day on that week's day.
    Meaning: a special day replaces the day for the whole camp (ADR 0014), so that program's
    groups are in the same special day, on their own blocks (both programs' blocks in time order,
    each group's row blank in the other's), and that program's week has no regular grid for that
    day. Nothing is asked. When the day of its own is left out, or the camp's own special day is on
    it (rule 6), the other program's day stays as it was. Two programs each with a day of their own
    on it is still asked (rule 9).
    Test: "INGEST-4.11: the other program's groups are in the special day, on their own blocks,
    with nothing asked"; counter-case "INGEST-4.11 counter-case: the day of its own left out leaves
    the other program's Friday as it is". The level-4 decision camps (`decisionCamps`) score every
    group of both programs in the special day. Code: `version.js` `gridOf`, `versionFor`.

12. **A day with its own times every week is one special day on that day of every week**
    (Greg, 2026-10-29, level-4 decisions 1 and 2: "treat it like a special day").
    Clue: rule 3's clue, except that the day of its own is the same weekday in every week of the
    files (a Saturday on its own Shabbat times every week), or the files hold one week; or, on
    pages that hold every day's blocks (by-group pages), a weekday whose cells use blocks no
    other day uses, at times that overlap the other days' blocks, in every week it has.
    Meaning: one special day (named after the day, "Saturday"), with its own time blocks and the
    file's cells, put on that day of every week of the files: one `SpecialDay__c` and one plan,
    with a `SpecialDate__c` for each week, so changing its times once changes every week's. No
    second program, the program's blocks never gain the day's. A one-week file: a weekend day is
    every week without asking; a mid-week day is asked "Friday has its own times. Every week, or
    just this once?" ("Every week": on that day of every week of the season; "Just this once",
    or unanswered: one special day, as rule 3). A season week whose day already holds the camp's
    own special day keeps it (rule 6, said in the notes). A cell that differs from week to week
    is placed in no week, each listed as not placed ("it differs from week to week, and one
    special day has the same schedule every week"), never one week's chosen quietly.
    Example: level 4 `everyWeekCamps` (`L4E-001` to `L4E-016`).
    Test: "INGEST-4.12: a Friday on its own times in every week is one special day, on each
    week's Friday"; "a cell that differs from week to week is placed in no week, and listed";
    "the same on by-group pages that hold every day's blocks"; "a one-week file's mid-week day
    asks Every week, or just this once?"; "Every week puts that one special day on every week's
    day of the season"; "a weekend day in a one-week file is every week, without asking"; the
    corpus "reads every camp perfectly, one special day on that day of every week"; Apex
    `ImportSpecialDayTest` "oneSpecialDayOnEveryWeeksDay". Code: `structure.js` `everyWeek`,
    `ownWeekdays`; `version.js` `everyWeekDays`; the save `ImportSpecialDayWrites` (`also`).

13. **The regular day ending early is the regular day, not a special day** (Greg, 2026-10-29:
    "it just means that your camp ends a little earlier one day"; usually the week's last day,
    a Friday, or a Saturday in a Sunday to Saturday camp, but any day of this shape reads the same).
    Clue: on that day every group's cells sit in the regular day's blocks up to a point, then
    every group has what the regular day's last block holds (Dismissal, also "Dismissal at 2"),
    and nothing after it. Three ways a file shows it: Dismissal on a shorter block of its own
    where a period starts ("1:50-2:10", no rows after); Dismissal in that period with the rest of
    the day blank; or one cell merged from there to the day's end.
    Meaning: the regular day. Dismissal holds the rest of it that day: it is placed from the
    block it starts in to the end of the day, so nothing is scheduled after it. No special day,
    no block of its own, nothing asked, no note. Dismissal stays one fixed activity (Greg,
    2026-10-29), at its usual time block, with that day as its early day and the blocks it starts
    before its usual one (CORE-3.7: `earlyDay`, `earlyBlocks` in the plan; `EarlyDay__c`,
    `EarlyBlocks__c` saved). Same idea as a group here only for the morning (names-and-divisions.md
    rule 9).
    Counter-case: a day whose blocks really differ (another length or flow, Dismissal at its
    usual time) stays a special day (rules 3, 12).
    Example: level 4 `earlyEndCamps` (`L4X-001` to `L4X-012`).
    Test: "INGEST-4.13: prefix-early-end → regular: Dismissal on a shorter block of its own,
    nothing after, is the regular day"; "Dismissal written in the last period, the rest of the
    day blank, runs to the day's end"; counter-case "INGEST-4.13 counter-case: truly different →
    special: a day of its own flow stays a special day"; the corpus "reads every camp perfectly,
    the early day the regular day"; Apex `ImportSetupSavesTest` "aFixedActivitysEarlyDayIsSaved".
    Code: `structure.js` `earlyEnds`; `reading.js` (the placements it covers, `early`);
    `classify.js` `patternsOf` (read at its usual slot); `items.js` `earlyOf`.

## Known limits

- A day whose blocks differ in some weeks and not others, on several weekdays, still reads as a
  second program, as before.
- Without season weeks (none, and no dates to fill them in), the special day has no day to go
  on and its cells are left out, as a version's are.
