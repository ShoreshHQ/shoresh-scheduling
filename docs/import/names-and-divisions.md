# Import: divisions of one, and names spelled two ways

How "Import last year" reads a group the file gives no division, and two spellings of one name,
without asking. Settled by Greg on 2026-10-27 from his own camp (`scripts/import-corpus/
fixtures/plant-camp.xlsx`): divisions come from each sheet's heading, CIT is its own division,
"Lunch2" is Lunch 2 and "Swim Returning" is Swim Return. Everything these rules read is shown
in the import's notes, never done silently; anything they do not cover is still asked
(ADR 0006 §8).

Code: `force-app/main/default/lwc/shoreshImportEngine/` (`structure.js` `ownDivisions`,
`names.js` `readWithoutAsking`, applied in `reading.js`, notes in `plan.js` `importNotes`).
Tests: `__tests__/names.test.js`; Greg's camp in `__tests__/corpus.test.js`.

## The rules

Each rule is clue, meaning, example, test.

1. **A division of one** (Greg, 2026-10-27).
   Clue: the file gives divisions to the other groups of a timetable (a heading's first word,
   "Pirchim 1"; a division row; "Juniors - Bunk 1"), and one group's heading or name carries no
   division, and the files give that name no division anywhere else.
   Meaning: that group is its own division, named after it. Said in the notes ("CIT has no
   division in the file while the other groups do, so it is its own division, CIT"), not asked.
   Example: CIT beside Pirchim 1 ... Tamarim 2 is division CIT.
   Test: "a group with no division beside divided groups is its own division". Counter-case: a
   file with no divisions anywhere keeps its groups undivided, no one-group divisions ("a file
   with no divisions anywhere keeps its groups undivided"). A name given a division elsewhere in
   the files (Bunk 1 in Juniors, in another program) is still asked which division
   (`identity.test.js`, "another program's divisions do not hide this program's").

2. **The same name, spelled with other spacing, capitals or punctuation** (Greg, 2026-10-27).
   Clue: two of the file's names have the same letters and the same numbers once spacing,
   capitals and punctuation ("&" read as "and") are set aside, and one is used more often.
   Meaning: one name, read as the more common form, shown in the notes, not asked. Used equally
   often, it is asked (nothing tells which spelling the camp uses).
   Example: "Lunch2" once among "Lunch 2" is Lunch 2; "Arts&Crafts" / "Arts & Crafts".
   Test: "Lunch2 once among Lunch 2 is read as Lunch 2". Counter-case: different numbers never
   merge, "Lunch 2" / "Lunch 3", "Bunk 1 2" / "Bunk 12" ("different numbers never merge").

3. **The same name with another ending, in the same place** (Greg, 2026-10-27).
   Clue: an activity name used rarely (at most 2 cells, and at most a fifth as often as the
   other) has the same words as a common name except that its last word adds -s, -es, -ing or
   -ed (a doubled last letter allowed); and every cell of it sits where the common name does:
   in the same block on the same day for another group, or in the same block on another day for
   the same group.
   Meaning: a slip, read as the common name, shown in the notes, not asked.
   Example: "Swim Returning" once (Arazim 2, Wednesday's last block, where the other groups have
   Swim Return) is Swim Return.
   Test: "Swim Returning once where every other group has Swim Return is read as Swim Return".
   Counter-cases, still asked: "Swim" and "Swimming" both common; the rare form at an unrelated
   time; never across different words ("Free Swimming" / "Swim Return").

## What stays the same

- A pair involving a name the camp already has is still asked, as before.
- A name rules 2 or 3 would read as two different names is asked.
- A remembered answer about a pair wins over rules 2 and 3 ("a remembered answer about the pair
  still wins").
- Everything after reading uses the read name: remembered answers (a group's division,
  `division|CIT`) and deleted items (`deleted|Activity||Swim Return`, which also folds spelling)
  are keyed by it.
