# Import: what Shoresh read, questions left open, and a second import

> **Sub-protocol INGEST** of the [Shoresh protocol](../protocol/README.md). It sits on CORE
> layers 1, 2 and 6 ([core.md](../protocol/core.md)) and is part of reading (layer 2) and saving.
> Rule n here is statement `INGEST-5.n`.

How "Import last year" shows what it read without asking, saves with questions still open, and
updates a season an earlier import filled. Settled product rules (Greg, 2026-10-27; wiki
`projects/shoresh-sf-ingestion-plan.md`, decisions Q2 to Q5): recognise it, do it, show it in one
reviewable list with a one-click change; save what is settled and keep the rest open, guessing
nothing; a second import updates, and never changes what the director made or changed by hand.

Code: `force-app/main/default/lwc/shoreshImportEngine/` (`review.js` `readAsGroups`; `items.js`
`verdictFor`, `kindsThatFit`; `structure.js` `weekDayShapes`; `reading.js` and `people.js` for
the notes the list reads); the screen `force-app/main/default/lwc/shoreshImport/`. Tests:
`shoreshImportEngine/__tests__/review.test.js`, `__tests__/availability.test.js`, `shoreshImport/__tests__/shoreshImport.test.js`.

## The rules

Each rule is clue, meaning, example, test.

1. **A name read as an activity, fixed or recurring, is listed with a one-click change.**
   Clue: a new name (not one the camp has, not asked, not left out) that the classification rules
   (`classification.md`) settled without a question.
   Meaning: it is a line under "Shoresh read these as", in its kind's group ("12 activities", "5
   fixed activities", "9 recurring activities"), with a button for each kind that fits it, the
   one read pressed: fixed only when everyone holds it at one time, recurring only when it has a
   set-time pattern, activity always. A click is an answer (key `kind|<name>`, with the program
   when there are several), so the setup follows at once, the line moves to its new group with
   the cursor on the button pressed, and the save remembers it like any answer.
   Example: Swim for every bunk at 9:50 every day is read as fixed; "Activity" makes it an
   activity.
   Test: "INGEST-5.1: each new name read without asking is listed in its kind's group, counted";
   "INGEST-5.1: one click changes it, the setup follows, and the save remembers it".
   Counter-cases: "a rotation offers only Activity, and a change that does not fit is not taken";
   "a name the camp already has is not listed".

2. **Two spellings read as one name are listed, with Keep apart.**
   Clue: names-and-divisions.md rules 2 and 3 read a slip as the common name.
   Meaning: a line "Lunch2 → Lunch 2" under "names joined", with **Same** (pressed) and **Keep
   apart** (the pair answered "different": both names come in). It is no longer a note.
   Test: "INGEST-5.2: listed as names joined, not in the notes; Keep apart keeps both".

3. **A division of one is listed with its dropdown.**
   Clue: names-and-divisions.md rule 1 makes a group with no division its own division.
   Meaning: a line under "division of one" with the group's division dropdown (its own division
   chosen); choosing another moves it, and the line stays, showing the choice. It is no longer a
   note, nor in the list of each new group's division.
   Test: "INGEST-5.3: listed with its dropdown; changing it moves the group".

4. **One week's day with its own times is listed, with A second program.**
   Clue: weeks.md rule 3 reads one week's day as a special day.
   Meaning: a line "Week 2's Friday" under "day of its own", with **Special day** (pressed) and
   **A second program** (key `ownDays|<week>`, as weeks.md rule 8's question): the day's groups
   are then a program of their own. It is no longer a note.
   Test: "INGEST-5.4: listed as a day of its own; A second program keeps it one".

5. **Add can keep questions for later; nothing they decide is guessed.**
   Clue: Add pressed while questions are open (ADR 0006 §11 as changed by Greg, 2026-10-27).
   Meaning: every open question that has "Leave it out for now" is saved as left out, so
   whatever it decides stays out of the setup and the version (its placements are listed as not
   placed), and a question that opens another is followed; what is settled is saved. Add says
   it: "Add 58, 3 for later". The open questions are kept with the import (`Import__c.Open__c`:
   key and title each) and the files as read (a file kept with the import, so they can be
   answered later); they are not remembered as answers. The page after Add lists them under "3
   import questions left", and Roots shows "3 import questions left" beside the last import
   while that import is the season's last and not undone. A question without "Leave it out for
   now" (one group split in two, `splitCard`) still has to be answered before Add. Questions
   that do not fit with the import are counted, and the page after Add says "12 more questions
   will be asked next time you import these files"; Roots counts only the ones kept.
   **The kept file** (review of #177): only the files the director chose, as read, linked to the
   import's record only (no other sharing), so it is visible to users who can see the season
   (an import is a detail of its season). It is kept only while its questions are open: it is
   deleted when a newer import of the season is saved (which also answers them, rule 6) and when
   the import is undone.
   Test: "INGEST-5.5: Add saves what is settled; the open question is kept with the files, and
   nothing it decides is guessed"; "INGEST-5.5: an open division choice can wait for later, and
   its bunk is not guessed"; Roots "INGEST-5.5: the last import's questions kept for later wait
   on Roots"; Apex `ImportReviewTest` `ingest55OpenQuestionsAreKeptWithTheFilesAndShownOnRoots`.
   Counter-case: "an import with no questions left shows none".

6. **Answering later applies it.**
   Clue: "N import questions left" pressed on Roots.
   Meaning: Import last year opens on the same files as read, with every answer the camp gave
   (remembered answers, ADR 0006 §19), so only the open questions are asked; Add saves what
   their answers bring in, as a second import of the same files (rule 7), and keeps any still
   open the same way. The files are given only for the season's last import while it has
   questions open and is not undone (`ImportLog.openFiles`); a newer import or an Undo ends
   them.
   Test: "INGEST-5.6: answering later opens the same files, asks only what is left, and Add
   applies it"; Apex `ingest56TheFilesAreOnlyForTheLastImportWithQuestionsOpen`.

7. **A second import updates what an earlier import brought in; what was made or changed by hand
   is never changed unasked.**
   Clue: the file disagrees with an activity's length, or a fixed or recurring activity's time
   block, length or days (ADR 0006 §9), for one the camp has.
   Meaning: an item an earlier import (not undone) created and no one has changed since
   (`ImportProvenance`: its fields still hold what the last import to write them wrote,
   compared by value from the imports' own logs; it has not been saved since that import, so a
   value changed by hand and set back by hand still counts as changed; and none of its attached
   records, who can do it, who it covers, weeks off, was added, changed or deleted by hand;
   only the season's newest 200 imports are read) is updated from the file
   without a question, and listed under "updated from the file" with **Update** (pressed) and
   **Keep as it is**. Anything else, made by hand or changed by hand since (on any screen, the
   record page, a list import), is asked as before. Read when the files are read
   (`ImportController.getImported`); if it cannot be read, everything is asked. The save checks
   again: an update made without asking to an item changed since the files were read is left
   out, and the page after Add says "Swim was changed since you opened the files; it was left as
   it is."
   Example: Lunch an import added at Period 4, untouched, and the new file has it at Lunch: it
   moves to Lunch, listed, one click to keep it at Period 4.
   Test: "INGEST-5.7: untouched since the earlier import: updated without asking, and listed
   with Keep as it is"; "INGEST-5.7: Keep as it is leaves it as it is"; Apex `ImportReviewTest`
   `ingest57WhatAnImportBroughtInIsItsUntilChangedByHand`,
   `ingest57ASecondImportsUpdateKeepsItTheImports`, `ingest57AnUndoneImportBroughtInNothing`.
   Counter-case: "made or changed by hand: asked, never changed unasked".
   Not covered: time blocks, programs' days, groups' divisions and places are still asked
   whoever made them.

8. **What an earlier import brought in that the new file lacks is listed, Keep or Remove.**
   Clue: an activity, or a fixed or recurring activity of a program the files cover, that rule
   7 counts as the import's, and whose name (spaces and capitals aside) is nowhere in the files
   (not a cell, not a name read, not an elective's choice). Something still using it keeps it:
   another activity's rain plan or copy, an elective's choices, weeks it is off, or a cell in any
   of the season's schedules (drafts, versions, published; `ImportItemUses`). Such an item is
   listed as kept with why ("Arts & Crafts is Swim's rain plan, so it stays") and no Remove.
   One use does not keep it (coordinator's decision on Greg's Q3 example, 2026-10-27: a
   corrected file lacks "Arhcery", which the first import placed): cells only in earlier
   imports' own imported weeks (not published) of a program and week this import brings in again,
   since the newest imported week is the one that counts (engine protocol 8.9). Remove is then
   offered and says so ("Arhcery · also taken out of Imported from maple.xlsx"); removing it
   takes its cells out of those weeks (`ImportSupersededCells`), and Undo puts the item and those
   days back exactly (a day changed since is kept and named). Any other imported week, a draft,
   or a published schedule keeps it ("Arhcery is on Imported from maple.xlsx"). The save
   checks the same.
   Meaning: listed under "Not in these files" with **Keep** (pressed, the default) and
   **Remove**; nothing is removed unasked. Removed ones go in the same all-or-none save, in user
   mode, after the server checks each is still the import's and nothing uses it
   (`ImportRemovals`; anything else refuses the whole import with the plain reason, so nothing
   pointing at a removed item is ever cleared); the page after Add counts them under "Removed, as you chose", and
   Undo of that import brings them back with what went with them (`ImportUndoRemovals`, from the
   Recycle Bin; one no longer there is named as deleted since). Something made or changed by
   hand is never listed.
   Test: "INGEST-5.8: listed with Keep, the default; Remove sends it to be removed"; "a week
   this import brings in again supersedes it"; counter-case "an imported week this import does
   not bring in keeps it, with why"; Apex
   `ingest58CellsOnlyInASupersededImportedWeekGoWithTheItemAndUndoPutsThemBack`,
   `ingest58AnImportedWeekNotBroughtInAgainKeepsTheItem`; screen
   "INGEST-5.8: what an earlier import brought in and these files lack"; Apex `ImportReviewTest`
   `ingest58RemovesWhatAnImportBroughtInAndUndoBringsItBack`,
   `ingest58NeverRemovesWhatWasMadeOrChangedByHand`.
   Counter-cases: "made or changed by hand is never listed"; "a program the files do not cover
   is not listed". Not listed: groups, divisions, time blocks, places and programs (removing
   them takes their schedules with them).

9. **A group here for part of the day is listed, with All day.**
   Clue: names-and-divisions.md rule 9 reads a new group as Morning only (or Afternoon only).
   Meaning: a line with the group's name under "groups here part of the day" (in the camp's word
   for groups: "2 bunks here part of the day"), with **Morning only** (pressed) and **All day**.
   A click is an answer (key `availability|<group>`): the group comes in all day and its blank
   half of the day is read as before; the save remembers it like any answer.
   Test: "INGEST-5.9: listed as here part of the day, with Morning only pressed and All day";
   "INGEST-5.9: All day makes it all day, and the save remembers it".
