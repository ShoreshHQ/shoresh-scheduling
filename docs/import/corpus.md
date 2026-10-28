# Import corpus: how well "Import last year" reads a camp

Made-up camps with a known true answer, fed to the import exactly as the screen does (no
remembered answers), so we can count what it asks and what it reads wrong, and drive both down.
Everything in the corpus is invented.

## Levels

| Level                          | What the camps are like                                     | Status  |
| ------------------------------ | ----------------------------------------------------------- | ------- |
| 1 Ordinary                     | One schedule that repeats every week, clean data            | Built   |
| 2 Different schedules per week | Week 2 differs from week 1, special weeks                   | Built   |
| 3 Hard                         | Doubles, trips, half days, gaps, spelling slips, note lines | Built   |
| 4 Very hard                    | Messy real-world layouts, notes in cells, mixed layouts     | Not yet |
| 5 Really weird                 | Anything a camp has actually sent that breaks the rules     | Built   |

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
  together" camps and Greg's camp have them), activities, groups here part of the day (INGEST-2.9;
  only level 3's half days have them), and grid
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

## Level 3

320 camps (`scripts/import-corpus/level3.js`), each an ordinary one-week camp of level 1 (same
eight layouts, 40 each) with two or three of the untidy things almost every real camp file has:

- **double**: a group has one activity two periods running (a cell merged down in Excel, the name
  written twice in a CSV, the group listed in both blocks by activity).
- **trip**: one division (or the whole camp) on a Field Trip one afternoon, merged down the
  afternoon in Excel. Trips are noted, not set up: not an activity, but kept in the imported week.
- **halfDay**: the youngest division goes home after Lunch; its afternoon cells are blank. It
  stays in the camp's one program (see the open question below). Its groups are Morning only
  (INGEST-2.9) when all they have is before noon and the day has blocks from noon; a Lunch at
  noon or later keeps them all day (26 of 114 camps).
- **gaps**: a few blank cells in ordinary periods: nothing scheduled then.
- **spelling**: a cell or two spelled otherwise ("archery", "ARCHERY", "Arts&Crafts"); the truth is
  the usual spelling (INGEST-2.2). Not in by-activity files, which write a name once.
- **notes**: a line under each title ("Updated June 2 - subject to change", "DRAFT v3") and
  footnotes under each grid ("Rain plan: ...", "* Bring a water bottle").

Left for level 4: several programs in one file, evening blocks, weekends with their own blocks,
specials mid-week, several weeks together with these traits.

    npm run score:import -- --level 3

The report adds a line per trait (a camp counts under each of its traits). Unsure layouts, which
the screen marks for the director to pick (INGEST-2.6), are now counted as a "layout" question
on every level (none on levels 1 and 2).

Baseline (2026-10-28): 223 of 320 perfect; questions 973 (966 "the files disagree", 4 layout, 2
list, 1 kind); 97 camps with wrong reads. Causes: a note line under the title was taken as the
page's name, so stacked days lost their day ("Updated June 2" even read as a week) and a sheet or
file per group was named by the note, every group the same, every cell a disagreement (94 camps,
all with notes); and a by-activity page whose blocks did not call the full roll was unsure (4).

After INGEST-2.7 (a note line written above every page names none of them) and INGEST-2.8 (an
unsure page takes its file's sure layout): **317 of 320 perfect**; questions 5 (3 layout, 2 list);
the 3 left are by-activity files of animal-named groups with a half-day division, every page
unsure, the layout asked (unanswered they read all-camp: groups 71, activities 67, cells 1469).
By trait, perfect before → after: notes 52 → 145 of 146, trip 115 → 147 of 147, double 111 → 149
of 150, gaps 106 → 142 of 143, spelling 72 → 100 of 100, halfDay 95 → 111 of 114. Levels 1 and
2 (320 of 320 each), the travel camps (39 of 40) and Greg's camp (perfect) unchanged.

Groups here part of the day scored (INGEST-2.9, 2026-10-28): 88 half-day camps expect 423 groups
Morning only; 86 are read right. The rest are the 3 by-activity camps above, whose groups are
misread (availability 9 wrong reads). Still 317 of 320 perfect; levels 1 and 2, the travel
camps and Greg's camp unchanged (no group read part of the day).

## Level 5

320 camps (`scripts/import-corpus/level5.js`), each an ordinary one-week camp with exactly one
weird trait (weird files are rare; they rarely come two at a time), 32 per trait:

- **transposed**: an all-camp grid on its side, a row per group and a column per time block.
- **timeInCell**: a page per group with no time column; each cell carries its time ("9-9:45 Art").
- **legend**: cells are letter codes ("A") with a key under the grid ("A = Archery").
- **hebrew**: groups, divisions, activities, Lunch and the opening named in Hebrew.
- **oneGroup**: the whole camp is one group.
- **hugeCamp**: 100 to 160 groups in six to eight divisions.
- **oneDay**: a one-day program; the file has a single day, and that day is the program.
- **longDay**: 11 to 15 half-hour periods.
- **colorOnly**: one activity was shown only by cell color; exported, its cells are blank and only
  "Blue = Swim" is left under the grid.
- **multiActivity**: a few cells name two activities ("Swim/Art").

For the last two only the director knows the answer, so **asking is the right read**: those cells
are not compared (`truth.unknownCells`, and names only they hold, `truth.ignoreNames`), and the camp
is correct only if the import asks; reading on silently counts one wrong read, "silent". Today any
question counts as asking (no question kind is for this yet).

Left out, because the right reading is Greg's call: emoji in names ("🏊 Swim"), an activity and
its place in one cell ("Art (Barn)"). Left to level 4: several programs, evening blocks, weekends
with own blocks, mid-week specials, several weeks.

    npm run score:import -- --level 5

Baseline (2026-10-28, before any engine change for these): **113 of 320 correct**; 78 camps asked
something (1,367 questions: 1,091 "similar", 194 "the files disagree", 52 list, 18 layout, 12
division); 181 camps with wrong reads.

| Trait         | Camps | Correct | Asked | Questions | Camps wrong | Main wrong reads                                     |
| ------------- | ----- | ------- | ----- | --------- | ----------- | ---------------------------------------------------- |
| transposed    | 32    | 0       | 0     | 0         | 32          | groups 461, activities 240, blocks 225, cells 14,925 |
| timeInCell    | 32    | 0       | 0     | 0         | 32          | days 32, activities 192, cells 5,008                 |
| legend        | 32    | 0       | 0     | 0         | 32          | activities 256, cells 12,895                         |
| hebrew        | 32    | 0       | 32    | 1,293     | 15          | groups 359, fixed 304, cells 9,317                   |
| oneGroup      | 32    | 17      | 14    | 22        | 6           | groups 29, cells 396                                 |
| hugeCamp      | 32    | 32      | 0     | 0         | 0           | none                                                 |
| oneDay        | 32    | 0       | 0     | 0         | 32          | fixed 55, recurring 55                               |
| longDay       | 32    | 32      | 0     | 0         | 0           | none                                                 |
| colorOnly     | 32    | 0       | 0     | 0         | 32          | silent 32                                            |
| multiActivity | 32    | 32      | 32    | 52        | 0           | none (asked "similar")                               |

Causes, biggest first:

1. **A grid on its side is not recognised** (32 camps, e.g. L5-001): the time blocks are read as
   groups and the groups as blocks; nearly everything is wrong.
2. **Letter codes are read as activities and the key is ignored** (32, e.g. L5-003): activities
   "A" to "H", every cell a letter.
3. **A single day's set times are read as recurring** (32, e.g. L5-007): with one day the opening
   and Lunch are each one time, so they come in as recurring, not fixed.
4. **Times in the cells: Monday is taken as the label column** (32, e.g. L5-002): the first day is
   lost, and where the time is short ("9-9:45") some cells keep it in the activity's name.
5. **Color-only meaning is read on silently** (32, e.g. L5-009): the blank cells are read as free
   time; nothing asks what "Blue = Swim" meant.
6. **Hebrew names a letter apart are asked as spelling slips** (32 asked, e.g. L5-034: "ניצנים א"
   and "ניצנים ב"); and a sheet or file per group with Hebrew titles is read as one group named
   after the file, every cell a disagreement (15 camps, e.g. L5-004).
7. **One group**: a one-sheet by-group workbook names the group after the file (L5-115); a
   one-column all-camp page has its layout asked (L5-035); one-group by-activity pages misread
   (L5-265).

"Swim/Art" camps count as correct only because the import asks whether "Swim/Art" is a slip of
another name; the question it should ask is open (below). Levels 1 to 3, the travel camps and
Greg's camp unchanged.

Open questions for Greg (the corpus follows the recommendation where it scores at all):

- **Emoji in names** (not scored): keep "🏊 Swim" as written, or read it as Swim. Recommended:
  Swim, with the emoji dropped and shown in the notes, so it matches the same activity elsewhere.
- **Activity and place in one cell** (not scored): "Art (Barn)" as activity Art at place Barn,
  as one activity "Art (Barn)", or ask. Recommended: Art at the Barn, shown, when the bracket
  holds a place used for more than one activity.
- **A file with one day** (scored as recommended): a one-day program, or a sample day that repeats
  every day. Recommended: that day only, shown, as the file says.
- **Two activities in one cell** (scored as "asks anything"): what to ask. Recommended: "Swim/Art:
  half the period each, or the group splits?".

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
