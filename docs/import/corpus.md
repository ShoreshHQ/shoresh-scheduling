# Import corpus: how well "Import last year" reads a camp

Made-up camps with a known true answer, fed to the import exactly as the screen does (no
remembered answers), so we can count what it asks and what it reads wrong, and drive both down.
Everything in the corpus is invented.

## Levels

| Level                          | What the camps are like                                         | Status  |
| ------------------------------ | --------------------------------------------------------------- | ------- |
| 1 Ordinary                     | One schedule that repeats every week, clean data                | Built   |
| 2 Different schedules per week | Week 2 differs from week 1, special weeks                       | Built   |
| 3 Hard                         | Doubles, trips, special days, typos, several files that overlap | Not yet |
| 4 Very hard                    | Messy real-world layouts, notes in cells, mixed layouts         | Not yet |
| 5 Really weird                 | Anything a camp has actually sent that breaks the rules         | Not yet |

## What level 1 contains

320 camps (`scripts/import-corpus/camps.js`, seeded: the same seed always gives the same camp),
40 in each of the eight ordinary ways a camp prints its week:

- **All camp** (a column per group): Excel with a sheet per day, Excel with the days stacked on
  one sheet, a CSV per day, one CSV with the days stacked.
- **By group** (a page per group, days across): Excel with a sheet per group, a CSV per group.
- **By activity** (a column per activity, the groups doing it listed in the cell): Excel with a
  sheet per day, one CSV with the days stacked.

Each camp varies: 1 to 6 divisions (merged headings above the groups in Excel), 2 to 40 groups
named "Bunk 7", "Cabin 7", "Group 7", "Juniors 2" or "Otters"; Monday to Friday, Monday to
Thursday, or Sunday to Thursday; 4 to 7 periods named Period/Activity/Block with Lunch, and often
an opening event (Flagpole, Morning Circle, Boker Tov, Line Up) at the same time every day;
times as "9:00 - 9:45", "9:00 AM - 9:45 AM" or "09:00-09:45", in their own column, beside the
period name, or alone; days written in full or short ("Mon"). Activities rotate so no group has
the same thing at the same time every day. No typos, no double periods, no trips or special days.

### Divisions travel together

40 more level-1 camps (`scripts/import-corpus/travel.js`), five in each of the eight layouts,
scored on their own table in the level-1 report. Two to four divisions of two to four groups each;
every group of a division at the same activity, rotating through more activities than the day has
periods, so a division may have an activity only once or twice a week, and divisions take turns at
one activity a period apart. Set times are by division: Lunch in two sittings every day (the Lunch
block for the first divisions, the next period for the rest), and in half the camps Swim at its
own period for each division every day; an opening event every day as in level 1. Truth: Lunch
(and Swim) recurring, the opening fixed, everything else an activity.

This shape was missing, which is how one-off staggers and single division placements came to be
read as set times without a question. Baselines (2026-10-27): before the second review, 21 of 40
perfect, 82 rotation activities read as recurring; after it, 37 perfect, 28 questions, 1 wrong.
With Greg's rule 7 (whole divisions together are a set time, even once): 20 of 40 perfect, 2
questions, 102 rotation activities read as recurring in 20 camps. With Greg's rule 8 (a division
whose bunks always move together is one group) and the truth to match (each such division is one
group, where the file shows divisions): 39 of 40 perfect; the one left is a by-activity file with
no divisions shown (2 "mostly at a set time" questions, one name read as recurring).

## What is scored

- **Questions**: every card the director would have to answer (cards that come with a default
  answer already chosen are not counted), by kind.
- **Wrong reads**, compared with the truth, each missing or extra item counting one: programs,
  days, time blocks (by start and end), divisions (only where the file shows them), groups,
  fixed events (name and time), recurring activities (by name; only the "divisions travel
  together" camps and Greg's camp have them), activities, and grid
  cells (group, day, time block: the right activity).

## Greg's camp

`scripts/import-corpus/fixtures/plant-camp.xlsx` is a real camp's schedule made fictional with
Greg's approval: a sheet per group (13 groups in five plant-name divisions, plus CIT, its own division), a heading
with the group's name on row 1 and the days on row 3, times without am/pm. Its truth is written by
hand in `scripts/import-corpus/plant-camp.js`. It is scored on its own line under level 1, with a
check that each heading becomes its group (never data), the days come from the lower row, and no
cell is read a row off. Baseline (2026-10-27): headings, days and rows all read right; asks 14
(2 spelling slips, CIT's division, 11 "set time or activity?"); wrong: Carpool not set at its two
times, 8 set-time names left as activities, the two misspelled cells.

After the classification rules (`docs/import/classification.md`, 2026-10-27): asks 3 (2 spelling
slips, CIT's division), no "set time or activity?"; fixed (Carpool twice, Group Time, Mifkad,
Busses), recurring and activities all read right. Still wrong: CIT's division, and until the
spelling questions are answered "Lunch2" and "Swim Returning" stay two activities of one cell
each (answered, everything reads right).

After the review refinements (absent groups keep fixed, one name one kind, genuine splits asked,
two days of evidence; 2026-10-27): unchanged. Still no "set time or activity?"; Lunch 4 and 5
(one division once) are recurring by their numbered siblings, Swim and Swim Return by being
staggered across the camp. Level 1 unchanged (318 of 320, no questions); level 2 unchanged
(148 of 320, no "set time or activity?", recurring wrong 0).

After the second and third reviews and Greg's rule 7 (whole divisions together are a set time,
even once; 2026-10-27): no "set time or activity?"; Lunch 4 and 5, Swim and Swim Return
recurring by rule 7 (Swim: Garinim and Pirchim in Period 6 and Shkedim and Tamarim in Period 7 on
Monday, Arazim, Garinim and Pirchim in Period 8 on Wednesday). Level 1 and level 2 unchanged.

After the names-and-divisions rules (`docs/import/names-and-divisions.md`, Greg 2026-10-27):
**perfect, nothing asked.** CIT is its own division; "Lunch2" and "Swim Returning" are read as
Lunch 2 and Swim Return and shown in the notes. Level 1 (318 of 320, no questions), the travel
camps (39 of 40) and level 2 (148 of 320) unchanged on every count.

## Level 2

320 camps (`scripts/import-corpus/level2.js`), 2 to 6 weeks, Monday to Friday, each week rotating
differently; some also have a Friday with different afternoon blocks in one week, a second
session with a different set of groups, or activities only some weeks. Written as a sheet per
week, a file per week (Excel or CSV), weeks stacked on one sheet under "Week 2 - Monday" headings,
a "Week" column, or by group (a sheet per group per week, or a file per week). Cells are scored
week by week; the report adds which weeks were found per layout and per kind of difference.

    npm run score:import -- --level 2

Baseline (2026-10-27): 98 of 320 perfect; weeks found exactly in 240. Biggest causes: a Friday
with different blocks splits every group in two ("Cabin 1 (schedule 1)"); a "Week" column file
is not read at all; by-group files with the week only in the file name lose the week, so every
cell becomes a "the files disagree" question; a fixed event in a camp whose groups change between
sessions is asked about.

After the classification rules (2026-10-27): 148 of 320 perfect (was 98); "set time or
activity?" questions 0 (was 1410); fixed events wrong 24 (was 105), activities wrong 121 (was
330), grid cells wrong 426582 (unchanged), recurring wrong 0 (unchanged). Each name the import
decides on, in every timetable it reads, now gets the kind its truth says; the fixed events and
activities still wrong come from the weeks, programs and Friday splits above.

After the week rules (`docs/import/weeks.md`, INGEST-4.1 to 4.4; 2026-10-27): **320 of 320
perfect, nothing asked** (was 148, 20,125 "the files disagree" questions). By layout, perfect
before → after: allCamp csv weekColumn 0 → 40 (a "Week" column is read as each row's week);
byGroup xlsx filePerWeek 0 → 40 (the week in the file's name is kept; no more disagreement
questions); allCamp csv filePerWeek 25 → 40, allCamp xlsx filePerWeek 23 → 40, sheetPerWeek 24 →
40, weeksStacked 23 → 40, byActivity filePerWeek 28 → 40, byGroup sheetPerGroupWeek 25 → 40 (a
Friday with its own blocks in one week is that week's own day, not a second program). By what
differs: oddFriday 0 → 118 of 118, session 49 → 97 of 97, weekActivities 76 → 160 of 160,
rotation 148 → 320. Level 1 (318 of 320, no questions), the travel camps (39 of 40) and Greg's
camp (perfect) unchanged on every count.

Then (2026-10-27) the odd Friday is saved as a special day on that week's Friday with its own
blocks, and the scorer checks it: time blocks are the saved plan's program blocks (the odd
Friday's are no longer in the truth's blocks), and a new kind, special days, compares the
week's days read as special days with the truth. Still 320 of 320, both kinds 0.

## How to run

    npm run score:import             the full corpus, summary table
    npm run score:import -- --camps  also one line per camp not read perfectly

`force-app/main/default/lwc/shoreshImportEngine/__tests__/corpus.test.js` scores the first 80
camps in Jest and holds today's numbers as a ceiling: a change may lower them, never raise them.
When a change improves them, lower the ceiling in that test and update the baseline below.

## Baseline (2026-10-27, all 320 camps)

With INGEST-2.6 (a by-activity page told by every block naming each group once; 2026-10-28):
read perfectly 320 of 320, questions 0, nothing read wrong. Level 2 (320 of 320), the travel
camps (39 of 40; L1T-023 is the classification limit above, not its layout) and Greg's camp
(perfect) unchanged. After weekends (ADR 0022): read perfectly 318 of 320, questions 0; the 2
left were the by-activity camps of cause 2 below (groups 33, fixed 2, activities 31, cells 801).
First baseline, before weekends:

Read perfectly: 254 of 320. Questions: 0. Camps with any wrong read: 66.

| Wrong read                             | Total | Camps |
| -------------------------------------- | ----- | ----- |
| Days                                   | 65    | 65    |
| Groups                                 | 33    | 2     |
| Fixed events                           | 2     | 2     |
| Activities                             | 31    | 2     |
| Grid cells                             | 7015  | 66    |
| Programs, blocks, divisions, recurring | 0     | 0     |

Causes:

1. **Sunday is dropped without a word** (65 camps, almost all the cell errors). A Sunday to
   Thursday camp comes in as Monday to Thursday and Sunday's whole grid is gone. Shoresh's
   programs have Monday to Friday only, so this may be a product decision rather than a reading
   one, but today nothing tells the director.
2. **By-activity pages with groups that have no numbers** (2 camps, e.g. L1-286: groups named
   Otters, Wolves, Little Herons). The page is read as all-camp: the activities become groups and
   the groups become activities. Fixed by INGEST-2.6 (names-and-divisions.md, rule 6).
