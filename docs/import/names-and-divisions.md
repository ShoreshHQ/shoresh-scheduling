# Import: divisions of one, and names spelled two ways

> **Sub-protocol INGEST** of the [Shoresh protocol](../protocol/README.md). It sits on CORE
> layers 1-3 and 6 ([core.md](../protocol/core.md)) and is part of reading (layer 2). Rule n
> here is statement `INGEST-2.n`.

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
   (`identity.test.js`, "another program's divisions do not hide this program's"). A column
   for everyone or for no group (All Camp, Whole Camp, Everyone, All, Staff, Counselors, Notes,
   Total; any capitals) is never a division of one: its division is asked ("an All Camp,
   Everyone or Staff column is never a division of one"). The note is shown only when no answer
   replaced the rule: a remembered `division|CIT` answer wins, and then no note ("a remembered
   division answer replaces rule 1").

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

4. **A division spelled like another is asked** (review of PR 166).
   Clue: a division only one group has, one letter, ending or spelling away from another
   division in the file or the camp ("Junoirs - Bunk 4" beside Juniors bunks).
   Meaning: asked as a similar-name question about the division, never a silent division of
   one. Answered the same, the group goes into the other division.
   Test: "Junoirs beside Juniors is asked as a similar division name", "answered the same, Bunk
   4 is in Juniors".

5. **A question both of whose names are read as one is not asked** (review of PR 166).
   Clue: rules 2 or 3 read both names of a similar pair as the same name ("lunch 2" and
   "Lunch-2", both Lunch 2; "swim" and "Swims", both Swim).
   Meaning: the pair answers itself; nothing is asked.
   Test: "lunch 2 and Lunch-2, both read as Lunch 2", "swim and Swims, both read as Swim".

6. **Which way round a page is, without numbers in the names** (2026-10-28).
   Clue: a page whose days are not across and that the camp's group names, lists of names in
   cells, or a name repeated across a block do not already settle. A group is in one place at a
   time, so: a block naming one thing twice (everyone at Lunch) means the cells are activities,
   groups across (all-camp). Every block naming the same set of names, each exactly once (at
   least four fifths of the blocks with names), and not simply one per column, means the cells
   are groups, activities across (by-activity): the blank cells are activities nobody had then.
   Meaning: the layout is read that way and shown, as every layout is. A page that reads both
   ways (each block one name per column, the same names every block) is not guessed: it is
   marked unsure and the director picks its layout, one question for the file.
   Example: Archery, Canoeing, Drama, Gaga, Lunch across, Otters, Wolves and Little Herons once
   in each block, the three listed together under Lunch: by-activity (corpus L1-055, L1-286).
   Test: `reading.test.js` "rule 6: …" (the by-activity page; counter-case, animal groups across
   with everyone at Lunch is all-camp; a page that reads both ways is left unsure). Code:
   `layouts.js` `blocksCallTheRoll`.

7. **A note line written above every page names none of them** (level-3 corpus, 2026-10-28).
   Clue: a line alone in its row above a grid (a title line) that is written the same above
   every schedule of the files, when there are two schedules or more ("Updated June 2 - subject
   to change", "DRAFT v3", "Questions? Ask the head counselor"; a footnote of the page before,
   "Rain plan: ...", when it repeats above each). A page split by a week column is one schedule.
   Meaning: it is a note, not the page's name: the page is named by its last other title line.
   A page whose only title lines are notes is named by its sheet when its file has several
   sheets, each named, none "Sheet1" and none only a day or week (a sheet per group); otherwise
   its lines are kept as before, so one group's own title repeated in a file per week ("Otters")
   stays its name. A date in a dropped note ("June 2") is not read as the page's week.
   Example: a sheet per group, each starting "Questions? Ask the head counselor": the groups are
   named by their sheets; days stacked on one sheet, "DRAFT v3" under each day's title: each
   page keeps its day.
   Test: `reading.test.js` "INGEST-2.7: …" (a page per group with a note; days stacked with a
   note and footnotes; a sheet per group whose only line is the note). Counter-cases
   ("INGEST-2.7: counter-case: …"): one group's only title, the same in a file per week, or on
   sheets named for weeks, is still its name; a single page's two title lines keep the last, as
   before (known limit below). Code: `sheets.js` `notesAboveEveryPage`.

8. **A page whose layout is unsure takes its file's sure layout** (level-3 corpus, 2026-10-28).
   Clue: a page rule 6 leaves unsure (its blocks do not call the full roll: a group gone home
   after Lunch, a blank cell), in a file whose other pages are sure of their layout, all the
   same one (and days across or not alike).
   Meaning: the page is read in that layout, as the rest of its file, and is not asked. A file
   with no sure page, or sure pages that differ, is asked as before (rule 6).
   Example: a by-activity CSV, days stacked, where Monday has a blank cell for one group: Monday
   is by-activity like Tuesday to Friday.
   Test: `reading.test.js` "INGEST-2.8: …" (counter-case: alone in its file it is still
   unsure). Code: `reading.js` `sameLayoutPerFile`.

9. **A group here only for the morning comes in Morning only** (Greg, 2026-10-28: "they are a
   morning only group").
   Clue: a new group (not one the camp has, not left out) whose cells are all in the morning, on
   two days or more, in a timetable where other groups have cells read in both the morning and
   the afternoon: every afternoon cell blank on every day it is in the files. The morning and afternoon are the time blocks' part of
   the day, as the engine reads it (`shoreshEngine/setup.js` `atCamp`): the camp's own for a
   block it has, else the import's (a block starting before noon is in the morning, `plan.js`).
   The mirror: all its cells in the afternoon.
   Meaning: the group comes in Morning only (Afternoon only), the same choice as on the Groups
   screen, and is listed under "Shoresh read these as" with All day (review.md rule 9); nothing
   is asked. Its blank half of the day is not a gap: it is away then, so an item every group
   there has in one afternoon slot is still read as fixed (classification rule 1).
   Example: the Minnows go home after a morning Lunch; their cells from noon on are blank every
   day: the Minnows' bunks come in Morning only.
   Test: `availability.test.js` "INGEST-2.9: …" (Morning only; Afternoon only; the blanks are
   not gaps). Counter-cases ("INGEST-2.9 counter-case: …"): blank on some afternoons only, or in
   the files one day only, changes nothing; an afternoon no group has anything read in (letter
   codes with a key, level-5 corpus) shows no one away; a group at a Lunch at noon or later and blank after
   it stays all day, since Morning only would drop its Lunch (known limit below). Apex
   `ImportSetupSavesTest` `ingest29AGroupHereForTheMorningComesInMorningOnly`. Code:
   `availability.js`.

10. **A day's times run forward** (level-4 corpus, 2026-10-28).
    Clue: a time block written without AM or PM ("7:00 - 8:00") whose morning reading would be
    earlier than a block written above it on the same page.
    Meaning: it is the afternoon or evening, read on in order, and not asked: Dinner "6:00 - 6:45"
    under a 2:45 block is 6 in the evening, and the Evening Program "7:00 - 8:00" and Cabin Time
    "8:15 - 9:00" under it are 7 and 8:15 in the evening, never the morning before the camp's day
    starts. A time with nothing later above it is read by the camp-day rule (1 to 6 the afternoon,
    7 to 11 the morning), and a 5 or 6 o'clock one is still asked, morning or evening (ADR 0006);
    a 5 or 6 o'clock one still asked moves the day on only as its morning reading, so nothing
    under it is read on from a guess. A time earlier than a block above it whichever way it is
    read (written out of order) is asked.
    Example: an overnight camp's day written 9:00 to 3:35, then Dinner, Evening Program and Cabin
    Time without AM or PM (level 4, e.g. L4-009).
    Test: `reading.test.js` "INGEST-2.10: …" (an evening runs on from the afternoon; a 6 o'clock
    block under the morning is the evening). Counter-cases ("INGEST-2.10 counter-case: …"): a time
    written out of order either way round is still asked; a time with nothing later above it keeps
    the camp-day rule; `reading.test.js` "a 5 or 6 o'clock block without AM or PM is asked about"
    (written first, it is asked). Code: `structure.js` `readForward`.

11. **A grid on its side is stood up** (level-5 corpus, 2026-10-28).
    Clue: a heading row whose first one or two cells name its rows ("Group", or "Division,
    Group") and whose other cells are all time blocks with clock times, two or more ("Period 1
    (8:30 - 9:15)"), with rows under it that do not start with a time.
    Meaning: a row per group and a column per time block: read stood upright, the blocks as rows
    and the groups as columns, a division column as the division row over them. A cell merged
    across two blocks runs over both. Title lines stay where they are.
    Example: "Division, Group, Period 1 (8:30 - 9:15), …" then "Juniors, Bunk 1, Nature, …"
    (L5-001).
    Test: `weird.test.js` "INGEST-2.11: …" (stood upright; a merged cell). Counter-case: an
    upright grid with a time column is read as before. A special day's schedule from a file
    turns sheets itself and reads them as written (`c/shoreshSpecialSchedule` `fromFile.js`).
    Code: `sheets.js` `standUpright`.

12. **The time written in every cell** (level-5 corpus, 2026-10-28).
    Clue: two rows or more whose cells after the first all start with the same time range ("9-9:45
    Art", "9-9:45 Swim").
    Meaning: that time is the row's time block, and each cell is the rest ("Art"); the first
    column keeps its name ("Period 1 (9-9:45)"). The Monday column is a day like the others,
    never a second label column. A bare hour ending a range whose start is a time ("10:20-11")
    is its end, 11:00.
    Example: a page per group with no time column (L5-002).
    Test: `weird.test.js` "INGEST-2.12: …". Counter-case: one cell with a time in it is a cell.
    Code: `sheets.js` `timesOutOfCells`, `text.js` `timeTokens`.

13. **Letter codes read through their key** (level-5 corpus, 2026-10-28).
    Clue: two lines or more one under another, each alone in its row, "A = Archery" (or "A:
    Archery", "A - Archery"; a code of one to three letters or digits), most of whose codes the
    grid's cells are written as.
    Meaning: each cell of a time-block row that is exactly a code is its name (a heading row,
    "Time, 1, 2", is never rewritten); the key's lines, and a "Key:" or "Legend" line over
    them, are not part of any schedule.
    Example: cells "A", "B", … with "Key: A = Art, B = Ropes Course, …" under the grid (L5-003).
    Test: `weird.test.js` "INGEST-2.13: …". Counter-case: one line alone that looks like a key
    line ("Bet - Bunk 3", a page's title) is a title. Code: `sheets.js` `readKey`.

14. **Names apart by a word of one letter are lettered** (level-5 corpus, 2026-10-28).
    Clue: two names the same but for one word, a single letter in each, in any script ("Bunk A"
    / "Bunk B", "ניצנים א" / "ניצנים ב").
    Meaning: lettered as "Bunk 1" / "Bunk 2" are numbered: two names, never asked as a slip.
    Lettered with a letter outside A to Z, such a name's first words are its division, as
    "Yeladim 3"'s are ("Schedule A" stays one name, as before).
    Test: `weird.test.js` "INGEST-2.14: …". Counter-case: a Latin typo one letter apart
    ("Archery" / "Archrey", "Music" / "Musik") is still raised. Code: `names.js`
    `letteredApart`, `text.js` `divisionInTitle`.

15. **Two names one letter apart, both in wide use, are two names** (level-5 corpus, 2026-10-28).
    Clue: a pair one letter apart (rule 4's kind of slip, "letter") where each name is in at least
    three cells, the rarer at least half as often as the other, and one file uses both.
    Meaning: a slip is the odd cell, not half the schedule: two names, not asked ("כדורגל" /
    "כדורסל", soccer and basketball, each all week).
    Test: `weird.test.js` "INGEST-2.15: …". Counter-case: a rare spelling beside a common one
    ("Musik" twice, "Music" twenty times) is asked; each spelling only in files of its own (one
    counsellor's "Archary" all week) is asked; a name the camp already has is asked as before. Code: `names.js` `bothInUse`.

16. **A title in any script names its page** (level-5 corpus, 2026-10-28).
    Clue: a sheet, title or file name written in letters other than A to Z (Hebrew).
    Meaning: it is a name like any other: a sheet per group named "ניצנים - ניצנים א" names that
    group and its division, and a shared start of file names is cut back to a whole word in any
    script.
    Test: `weird.test.js` "INGEST-2.16: …". Code: `layouts.js` `isOnlyDayOrWeek`, `sheets.js`
    `sheetsNameTheirPages`, `distinctName`.

17. **A camp of one group** (level-5 corpus, 2026-10-28).
    Clue: (a) a workbook of one sheet, the sheet with a name of its own ("Otters", not "Sheet1",
    a day or a week); (b) a page of one column, days not across; (c) a by-activity page where one
    name sits once in every block, under a different activity block to block.
    Meaning: (a) the sheet names the page's group, not the file (a file's name is most often the
    camp's); (b) the page is that group's day (all-camp), sure; (c) the name is the group
    (by-activity).
    Test: `weird.test.js` "INGEST-2.17: …". Counter-cases: a comma-separated file is still named
    by its file; the same name in one column all day is an activity. Code: `layouts.js`
    `pageName`, `detectLayout`, `blocksCallTheRoll`; `sheets.js` `filesToPages` (`ownSheet`).

18. **Two activities in one cell** (Greg, 2026-10-28, level-5 decision 4).
    Clue: a cell naming two things with a slash or comma ("Swim/Art"), each of which the files
    also name on its own.
    Meaning: asked "Half the period each, or does the group split?" (the camp's word for group).
    "Half the period each" brings the cell in as one activity, named as written (a period is not
    split in two); "The group splits" makes it a choice of the two, as "A choice of" does; or
    leave it out. Two names the files never use alone keep the question "one activity or a
    choice of".
    Test: `weird.test.js` "INGEST-2.18: …". Code: `electives.js` `readElectives`,
    `questions.js` `twoActivitiesCard`.

19. **An activity shown only by colour is asked** (level-5 corpus, 2026-10-28).
    Clue: a line alone in its row naming a colour ("Blue = Swim"; "Blue: Swim" or "Blue -
    Swim" under a "Key" or "Legend" line), below a time block of a grid that has blank cells,
    the colour no cell is written as, and the name no cell holds.
    Meaning: the activity was shown by its cells' colour, lost on export, so its cells are
    blank. Never read as free time without a word: asked "Where was Swim? The file showed it
    only in blue." "Add Swim with no times yet" brings it in as an activity with no times (0 to
    1 a week, everyone, to set on the setup screens); "Leave it out", or no answer, adds nothing.
    The card says how to bring its times in: type the name into those cells and upload again.
    Test: `weird.test.js` "INGEST-2.19: …". Counter-cases: a colour the cells are written as
    ("Blue" a team) is not a colour key; a title above the grid ("Blue - Juniors") is a title;
    a grid with no blank cell has no colour key. Code: `sheets.js` `readColourKey`, `proposal.js`
    `colourOnly`.

20. **Emoji in a name** (Greg, 2026-10-28, level-5 decision 1).
    Clue: a cell or heading with emoji in it ("🏊 Swim").
    Meaning: read without them ("Swim"); the import's notes keep them ("🏊 Swim is read as
    Swim."). A cell that is only emoji keeps them. ©, ® and ™ are part of a name ("Lego™
    Club") unless drawn as emoji.
    Test: `weird.test.js` "INGEST-2.20: …". Code: `text.js` `withoutEmoji`, `reading.js`
    `emojiNotes`, `plan.js` `importNotes`.

21. **An activity and its place in brackets** (Greg, 2026-10-28, level-5 decision 2).
    Clue: "Art (Barn)".
    Meaning: Art at the Barn, the Barn offered as a place on the screen, when the files have
    more than one activity at the Barn, or the camp already has a place of that name; otherwise
    one activity named "Art (Barn)". "Art @ Barn" always names a place.
    Test: `weird.test.js` "INGEST-2.21: …" (two activities at a place; one; a place the camp
    has). Code: `reading.js` `placesInBrackets`.

## With the classification rules

- A division of one is a whole division for classification rule 7: an item only CIT has in one
  repeating slot is a set time, like any division's. An item CIT has at different times stays an
  activity ("an activity only CIT does, at different times, stays an activity").
- Rule 1 runs before classification rule 8: a division read as one group (Juniors, its bunks
  always together) is that group, with no division of its own, and is not re-divided ("a
  division read as one group (rule 8) is not split or re-divided by rule 1").

## Known limits

- Rule 12 needs the time to be the same across a row; a page whose cells in one row give
  different times is read as before. Rule 13 reads a key on the sheet it is on, not one on a
  sheet of its own. Rule 21 reads a place one activity has ("Swim (Pool)", "Lunch (Dining
  hall)") as part of the name: write "Swim @ Pool" to name the place.

- Rule 3 reads a plain plural too: "Arts" twice where "Art" is used ten times in the same blocks
  is read as Art. It is shown in the notes; a camp that means two activities answers nothing
  today and must rename one on the activities screen.

- Rule 7 needs two schedules or more: a single page with a note line under its title is still
  named by the note (the last title line). Every page of a by-activity file whose afternoon
  blocks miss a half-day division is unsure (rule 6) and its layout is asked (level-3 corpus,
  three camps).

- Rule 9 needs every cell a group has to be on its side of noon: a division that eats a Lunch at
  12:15 and then goes home stays all day (its afternoon cells are blank, not a gap question), so
  the director sets it on the Groups screen (level-3 corpus: 26 of 114 half-day camps). Rule 9
  reads only new groups: a group the camp has keeps its own choice.

## What stays the same

- A pair involving a name the camp already has is still asked, as before.
- A name rules 2 or 3 would read as two different names is asked.
- A remembered answer about a pair wins over rules 2 and 3 ("a remembered answer about the pair
  still wins").
- Everything after reading uses the read name: remembered answers (a group's division,
  `division|CIT`) and deleted items (`deleted|Activity||Swim Return`, which also folds spelling)
  are keyed by it.
