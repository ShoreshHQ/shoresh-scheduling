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

They never overlap: one name has one kind in a program. The import tries fixed first, then
the activity clue of rule 2, then recurring. Getting this wrong on an ordinary
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

Refined 2026-10-27 after an independent review; each rule is clue, meaning, example, test.

1. **Every group present, same slot, every day → fixed.**
   Clue: in each of the name's slots, every group has it on every day the program runs, and no
   other activity is ever in that slot. A group that is not there does not count against it: no
   cell that day, a trip or special event (noted, not set up), or an "Off"/"Away" cell, as long as
   the name is there for three times as many group-days as are away. A week without the name at
   all (a travel week) only has to leave the slot free. A name fixed in two slots is two fixed
   activities, one per block. Two days of evidence at least (rule 4).
   Example: Carpool at 08:40 and at 15:40, Group Time at 09:00 (plant camp); Carpool every day
   with Bunk 3 on the Zoo trip on Wednesday.
   Test: "every group, same time block, every day, nowhere else"; "rule 1: fixed at two times a
   day"; "rule 1: a bunk on a trip / with no cells / off on Wednesday does not break a fixed
   Carpool"; "rule 1: another activity in the slot … does break fixed".

2. **One name, one kind: a group has it at three or more times → activity everywhere.**
   Clue: in one week some group has the name in three or more different slots. That is placed
   like a scheduled activity, so the name is an activity in the whole program, even where another
   group or division happened to have it in a steady slot. Checked before anything is asked.
   Example: Bunk 2 has Sports in Period 2 Monday, Wednesday and Friday while the other bunks have
   it at varying periods; Juniors do Art together on Monday while Seniors rotate it.
   Test: "rule 2: one bunk's steady Sports …"; "rule 2: Juniors together for Art once …"; "rule 5:
   a division together, but at three or more different times a week".

3. **Held, and the grid shows it repeats → recurring.**
   Clue: every placement is held (whole divisions of the groups that have it, most groups at once,
   or one group in its one slot on most days), the same in every week that has it, and the grid
   shows repetition: the same groups in the same slot on two days or more; every group together
   (or most of them: an all-camp moment, even once a week); staggered across the camp (on one day
   its placements together reach most groups, as Swim does for two divisions a period); the same
   slots in two weeks or more; or a numbered sibling that is a set time ("Lunch 4" once, beside
   "Lunch 1" every day; a sibling that is an activity, "Sports 2" beside rotating "Sports 1",
   makes it an activity). One record per pattern.
   Example: Lunch 1 to 5, Menucha, Swim, Swim Return, Ruach, Shabbat, All Camp Activity, CIT's
   blocks (plant camp).
   Test: "staggered by division"; "everyone on one day"; "rule 2: everyone but one group";
   "rule 3: one group at the same time on most days".

   **A real division together with no repetition → asked (a genuine split).** A whole division of
   the timetable together at different blocks on different days, or once in a one-week file, with
   none of the evidence above. Unless another activity goes to the very same groups together
   (they take turns, as a rotation does): then it is an activity.
   Example: Juniors' Art Monday Period 1 and Wednesday Period 3, nobody else has Art; Library time,
   all of Juniors once on Wednesday (`walkthrough.test.js`).
   Test: "rule 3: a division together at different times on two days, nobody else, is asked";
   "rule 3: one division once in a one-week file is asked"; "rule 3: a numbered sibling at a set
   time …"; "rule 3: a numbered sibling that rotates …"; "rule 3: the same groups taking turns …";
   "rule 3: the same shape with nothing else for those groups together is asked".

4. **Small grids need two days of evidence.**
   Clue: fixed, and recurring by repetition, need the name on two days or more. In a one-day file
   only every group together may be read as recurring without asking; nothing is read as fixed.
   The two days may come from the same groups' other timetable (a Friday read as a program of its
   own, fixed at that time in the main one). "Most groups" means at least three groups and two
   thirds, so with three groups two bunks of different divisions together once is an activity.
   Test: "rule 4: a one-day file reads nothing as fixed"; "rule 4: with three groups …".

5. **The weeks agree, or it is asked.**
   Clue: weeks that have the name must show it in the same slots. A week without it (a special or
   travel week) is not a change.
   Test: "weeks in the files must agree"; "rule 5: a week without the name is not a change of
   time" (empty, and other activities there).

6. **Anything else → activity.**
   Clue: some placement is held by nothing above (a group alone at a time it does not repeat), or
   the groups together are not a real division (two groups of different divisions together once).
   Example: Sports, Water Play, Art, Clay (plant camp); every level-1 and level-2 rotation.
   Test: "a rotation is activities"; "two groups of different divisions together once".

## Asked, because the grid supports both readings

Only these three. Each card offers set time, activity, or leave it out.

- **A. Mostly at a set time, a few times elsewhere.** A strong set time (most days, or most
  groups) holds at least three quarters of the name's cells, and the rest are at other times
  (no group at three or more times: that is rule 2).
  Example: Swim for everyone in Period 3 every day, and once more for one bunk on Thursday.
  Test: "a name at a set time and also scattered elsewhere"; `version.test.js` "a name left out
  for now".
- **B. A set time that changes from week to week.** Every cell is held, but the slots differ
  between the weeks that have the name (Flag in Period 1 in week 1, Period 2 in week 2). A week
  without the name does not count.
  Test: "weeks in the files must agree before a set time is sure".
- **C. A genuine split** (rule 3): a real division together with no repetition the grid shows.

## Known limits

- Without divisions in the file, half the groups together once (Library time in the by-group
  CSV samples) is an activity: no clue says set time. Where the file shows divisions, the same
  cells are asked (rule 3).
- A division's set time at three or more different times a week (Swim Monday, Wednesday and
  Friday at different periods) reads as an activity (rule 2).
- The numbered-sibling clue only strips a trailing number ("Lunch 4" → "Lunch").
- Two spellings of one name ("Lunch2", "Swim Returning") are still asked as similar names and
  classified apart until answered.
