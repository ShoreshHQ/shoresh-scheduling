# Import: fixed, recurring, or activity

How "Import last year" decides what each name in a schedule is. The definitions are Greg's
(wiki `decisions/0004-fixed-and-recurring-events-stay-separate.md`, the glossary, and the
ingestion plan's classification protocol, 2026-10-27):

- **Fixed activity:** every group in the program, the same block, every day. Nothing else is
  ever in that block.
- **Recurring activity:** a set, repeating item that leaves its block free on other days or for
  other groups: the same time for many groups but not all (lunch by division), or every group but
  not every day (an all-camp activity twice a week).
- **Activity:** everything else, placed by the scheduler.

They never overlap, and the import tries them in that order. Getting this wrong on an ordinary
camp is a bug, not a question.

Code: `force-app/main/default/lwc/shoreshImportEngine/classify.js` (`classifyName`). Tests:
`__tests__/classify.test.js` unless another file is named.

## What the grid gives

For one name in one timetable, week by week, the import groups its cells into **patterns**: the
same **slot** (start block and length), the same **days**, and the **groups** that have it
exactly there on exactly those days. Three clues come from that: **who** (which groups, and
whether they are whole divisions), **when** (which slot, which days), and **repetition** (on how
many days, and whether it is the same each week).

## The rules

1. **Every group, same slot, every day → fixed.**
   Clue: every pattern of the name covers all of that week's groups on every day the program
   runs, and the slots are the same every week. A name fixed in two slots is two fixed
   activities, one per block.
   Example: Carpool at 08:40 and at 15:40, Group Time at 09:00 (plant camp).
   Test: "every group, same time block, every day, nowhere else"; "rule 1: fixed at two times a
   day".

2. **Whole divisions (or most groups) together → held at a set time.**
   Clue: two or more groups share the slot on the same days, and they are whole divisions of the
   groups that have the name at all, or at least two thirds of the timetable's groups.
   Example: Lunch 4 for all of Shkedim on Wednesday only; All Camp Activity for everyone but CIT
   on Tuesday and Thursday; Swim Return for Pirchim, Garinim and Arazim on Wednesday, even with
   one Arazim cell spelled "Swim Returning".
   Test: "rule 2: one division on one day of one week"; "rule 2: everyone but one group";
   "rule 2: a division counts the groups that have the name at all"; "staggered by division".

3. **One group, one slot, most days → that group's set time.**
   Clue: a group has the name only in that one slot, on two days or more and on most of the days
   the program runs.
   Example: CIT Block 1, 2 and 3 for CIT every day; Lunch 2 for Tamarim 1 on four days.
   Test: "rule 3: one group at the same time on most days".

4. **Every placement held, one set on its own → recurring.**
   Clue: every pattern of the name is held by rule 2 or 3, the patterns are the same every week,
   and at least one of them is a set time on its own: it repeats (rule 3's days), or it is whole
   divisions of the whole timetable (or most groups). One record per pattern.
   Example: Lunch 1 to 5, Menucha, Swim, Swim Return, Ruach, Shabbat, All Camp Activity, CIT's
   blocks (plant camp).
   Test: the rule 2 and 3 tests above; `walkthrough.test.js` (Library time, all of Juniors on
   Wednesday).

5. **A group has it at three or more different times → activity.**
   Clue: in one week some group has the name in three or more different slots. That is a
   rotation, even when a whole division goes together.
   Example: a division that does Art together, at a different period every day.
   Test: "rule 5: a division together, but at three or more different times a week".

6. **Anything else → activity.**
   Clue: some placement is held by neither rule 2 nor rule 3 (a group alone at a time it does
   not repeat), or nothing is a set time on its own (two groups of different divisions together
   once).
   Example: Sports, Water Play, Art, Clay (plant camp); every level-1 and level-2 rotation.
   Test: "a rotation is activities"; "rule 5: two groups of different divisions together once".

## Asked, because the grid supports both readings

Only these two. Each card offers set time, activity, or leave it out.

- **A. Mostly at a set time, a few times elsewhere.** A strong set time (most days, or most
  groups) holds at least three quarters of the name's cells, and the rest are at other times.
  It may be a recurring item moved once, or an activity that happened to sit still.
  Example: Swim for everyone in Period 3 every day, and once more for one bunk on Thursday.
  Test: "a name at a set time and also scattered elsewhere"; `version.test.js` "a name left out
  for now".
- **B. A set time that changes from week to week.** Every cell is held, but the patterns differ
  between the weeks of the files (Flag in Period 1 in week 1, Period 2 in week 2). A recurring
  record has one time, so the director says which reading is meant.
  Test: "weeks in the files must agree before a set time is sure".

## Known limits

- Without divisions in the file, half the groups together once (Library time in the by-group
  CSV samples) is an activity: no clue says set time. Where the file shows divisions, the same
  cells are a recurring activity for that division (rule 2).
- A division's set time at three or more different times a week (Swim Monday, Wednesday and
  Friday at different periods) reads as an activity (rule 5).
- Two spellings of one name ("Lunch2", "Swim Returning") are still asked as similar names and
  classified apart until answered.
