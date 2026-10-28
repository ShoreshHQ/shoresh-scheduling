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
`shoreshImportEngine/__tests__/review.test.js`, `shoreshImport/__tests__/shoreshImport.test.js`.

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
