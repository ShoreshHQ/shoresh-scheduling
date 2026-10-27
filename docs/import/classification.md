# Import: fixed, recurring, or activity

> **Sub-protocol INGEST** of the [Shoresh protocol](../protocol/README.md). It sits on CORE
> layers 1-3 and 6 ([core.md](../protocol/core.md)) and carries out CORE layer 3. Rule n here
> is statement `INGEST-3.n`.

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
the activity clue of rule 2, then recurring (rules 3 and 7). Getting this wrong on an ordinary
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

Refined 2026-10-27 after an independent review, and again after a second one that found silent
misreads from clues too weak to decide on their own: a weak clue never decides silently; where
the grid really supports both readings the director is asked. Each rule is clue, meaning,
example, test.

1. **Every group present, same slot, every day → fixed.**
   Clue: in each of the name's slots, no other activity is ever there, and every group has it on
   most of its own days there (at least three times as many days as it is there with the slot
   empty). Judged group by group: a day a group is away does not count (no cells that day, a trip
   or special event, an "Off"/"Away" cell); a group that is there but never has the name in that
   slot means it is not fixed (then the other rules decide). A cell spelled otherwise and still
   asked as a similar name ("lunch" beside "Lunch") does not break it. A week without the name at
   all (a travel week) only has to leave the slot free. A name fixed in two slots is two fixed
   activities, one per block. Two days of evidence at least (rule 4).
   Example: Carpool at 08:40 and at 15:40, Group Time at 09:00 (plant camp); Carpool every day
   with Bunk 3 on the Zoo trip on Wednesday. Not fixed: Carpool for three bunks every day, the
   fourth bunk never (blank or at another activity then).
   Test: "every group, same time block, every day, nowhere else"; "rule 1: fixed at two times a
   day"; "rule 1: a bunk on a trip / with no cells / off on Wednesday does not break a fixed
   Carpool"; "rule 1: another activity in the slot … does break fixed"; "rule 1: a group that
   never has the name in its slot is not fixed"; "rule 1: a cell spelled otherwise, still asked,
   does not break a fixed Lunch".

2. **One name, one kind: a group has it at three or more times → activity everywhere.**
   Clue: in one week some group has the name in three or more different slots. That is placed
   like a scheduled activity, so the name is an activity in the whole program, even where another
   group or division happened to have it in a steady slot. Checked before anything is asked.
   Example: Bunk 2 has Sports in Period 2 Monday, Wednesday and Friday while the other bunks have
   it at varying periods; Juniors do Art together on Monday while Seniors rotate it.
   Test: "rule 2: one bunk's steady Sports …"; "rule 2: Juniors together for Art once …"; "rule 5:
   a division together, but at three or more different times a week".

3. **Held, and the grid shows it repeats → recurring.**
   Clue: every placement is held (whole divisions of the program, most groups at once, or one
   group in its one slot on most days), the same in every week that has it, and the grid shows
   repetition: the same groups in the same slot on two days or more; every group together (or most
   of them: an all-camp moment, even once a week); or the same slots in two weeks or more. A
   stagger repeats when each division has its slot on two days or more (Swim for one division in
   Period 2 and the next in Period 3, every day). One record per pattern.
   Example: Lunch 1 to 3, Menucha, Ruach, Shabbat, All Camp Activity, CIT's blocks (plant camp).
   Test: "staggered by division"; "everyone on one day"; "rule 2: everyone but one group"; "rule
   3: one group at the same time on most days"; "rule 3: the same slot in two weeks is enough
   repetition".

4. **Small grids need two days of evidence.**
   Clue: fixed, and recurring by repetition, need the name on two days or more. In a one-day file
   only every group together may be read as recurring without asking; nothing is read as fixed.
   The two days may come from the same groups' other timetable (a Friday read as a program of its
   own, fixed at that time in the main one). "Most groups" means at least three groups and two
   thirds, so with three groups two bunks of different divisions together once is an activity.
   Test: "rule 4: a one-day file reads nothing as fixed"; "rule 4: with three groups …"; "rule 4:
   Lunch for everyone on a Friday of its own is fixed when fixed at that time Monday to
   Thursday".

5. **The weeks agree, or it is asked.**
   Clue: weeks that have the name must show it in the same places (group, day, slot). A week
   without it (a special or travel week) is not a change, nor is a group away on a day (a trip,
   off, no cells), the same excuse as rule 1. Another activity in its place is a change.
   Example: Juniors' Flag every day; in week 2 Bunk 2 is on the Zoo trip Wednesday: recurring.
   Test: "weeks in the files must agree"; "rule 5: a week without the name is not a change of
   time" (empty, and other activities there); "rule 5: a bunk on a trip one day in week 2 is not
   a change of time"; "rule 5: the slot taken by another activity in week 2 is still asked".

6. **Anything else → activity.**
   Clue: some placement is held by nothing above (a group alone at a time it does not repeat), or
   the groups together are not a real division. A division is every group of it in the program
   that week, not only the groups that have the name: two bunks of different divisions together
   are never a division, in a one-week or a several-week file. A bunk whose cell there is the name
   spelled otherwise, still asked ("Swim Returning"), counts as having it until answered.
   Example: Sports, Water Play, Art, Clay (plant camp); every level-1 and level-2 rotation.
   Test: "a rotation is activities"; "two groups of different divisions together once"; "rule 6:
   two bunks of different divisions together in both weeks are an activity"; "rule 6: a division
   is every group of it in the program, a cell spelled otherwise counting until answered"; "similar
   names: Swim and Swimming …".

7. **One or more whole divisions together at once → recurring, even once (Greg 2026-10-27).**
   Greg: "multiple groups go at once. It's a recurring activity. If I had more than one week it
   would show the same groups going every week at the same time." Clue: every placement is held,
   the weeks agree, and some placement is every group of one or more divisions of the program
   together, even once in a one-week file. This replaces the earlier "genuine split" question.
   Rule 2 comes first (a name some group has at three or more times is an activity everywhere);
   bunks of different divisions together that are not whole divisions are rule 6 (activity).
   Example: Lunch 4 and 5, Swim and Swim Return (plant camp: Garinim and Pirchim at Swim on
   Monday, Arazim, Garinim and Pirchim on Wednesday); Library time, all of Juniors once on
   Wednesday (`walkthrough.test.js`); Aleph and Bet at Color War Practice once.
   Test: "rule 7: one division once in a one-week file is recurring"; "rule 7: a division
   together at different times on two days, nobody else, is recurring"; "rule 7: one division's
   single Lunch 4 …"; "rule 7: Juniors' Library Wednesday and Campfire Thursday …"; "rule 2
   before rule 7 …"; "rule 7: whole divisions together are a set time, even once" (three grids,
   and two bunks of different divisions: activity).

8. **A division whose bunks always move together is one group (Greg 2026-10-27).**
   Greg: "if all groups in a division are moving at the same time to activities, then there is
   really 1 group in the division. So they really just don't have divisions, they have groups."
   Clue, read before anything above: every bunk of a division has the same cell in every time
   block of the files (blocks where the whole division has nothing do not count). Then the
   division is read as one group, named as the division ("Juniors", clearer than "Bunk 1, Bunk
   2"), with no division of its own, and the import's notes say so ("Bunk 1, Bunk 2 always do
   the same thing at the same time, so Juniors is set up as one group"). A division whose bunks
   differ in even one block stays a division of bunks. Rule 7 then applies only to real
   divisions: a travelling division's activity met once or twice a week is an activity.
   Evidence first, as rule 4 for fixed: the division has cells on two days or more and in three
   time blocks or more; a one-day or one-block file keeps its bunks, with no note.
   Not merged, with a note saying why, when: the camp already has one of the bunks in that
   division (its setup wins; they are matched as usual; a bunk of that name in another division
   does not count); another group in the files has the division's name; or a remembered answer
   about one of the bunks' identity (a deleted group, its division, which group, a group
   spelling) would otherwise stop applying. Other remembered answers (a cell the files disagree
   on) do not count.
   Re-import: a camp group named as the division (rule 8's reading last time) is matched again,
   so the same file gives the same groups. If the bunks now differ, the director is asked "Split
   Juniors into its groups?"; until answered Juniors stays one group, with its first bunk's
   schedule, never split silently.
   Code: `together.js`, applied in `reading.js` before classification.
   Test: "rule 8: …" (one group with its note; one differing block keeps the bunks; the
   travelling camp's activities are activities; bunks the camp already has; a bunk of that name
   in another division; re-importing the same file; re-imported with the bunks differing; a
   one-day and a one-block file; a remembered deleted bunk; a remembered answer not about
   identity).

## Asked, because the grid supports both readings

Only these two. Each card offers set time, activity, or leave it out.

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

## Known limits

- Without divisions in the file, half the groups together once (Library time in the by-group
  CSV samples) is an activity: no clue says set time. Where the file shows divisions, the same
  cells are recurring (rule 7).
- A division's set time at three or more different times a week (Swim Monday, Wednesday and
  Friday at different periods) reads as an activity (rule 2).
- Two spellings of one name ("Lunch2", "Swim Returning", or "lunch" beside "Lunch") are still
  asked as similar names and stay two names until answered: the variant is its own activity.
  Spacing is already tidied when the file is read. The variant does not break the main name's
  fixed slot or division (rules 1 and 6), but its cells are not counted as the main name's: a
  case-only difference is never merged silently.
- Without divisions in the file (a by-activity file of animal-named groups), rule 8 cannot see a
  division moving together: four of six bunks together twice reads as most of the camp
  (recurring), in one camp of the "divisions travel together" corpus.
