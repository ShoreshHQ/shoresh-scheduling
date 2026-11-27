# Import: which files, and how big, Shoresh reads

> **Sub-protocol INGEST** of the [Shoresh protocol](../protocol/README.md). It sits on CORE
> layers 1, 2 and 6 ([core.md](../protocol/core.md)) and is the first step of reading (layer 2):
> a file is checked before anything in it is read. Rule n here is statement `INGEST-1.n`.

How big a file every import takes, which kinds of file each takes, what the director sees when a file is bigger or of another kind, and cells pasted in place of a file. Settled:
Shoresh follows the desktop (build log decision 69, 2026-11-04), except the sheet limit (rule 2): desktop
`src/utils/exportSanitize.js` `IMPORT_LIMITS`, and its ADR
`docs/adr/2026-08-08-export-formula-injection-sanitizer.md` §3a / F4. The limits are comfortably
above any real camp and far below a file made to exhaust the browser (a "zip bomb", or millions of
rows): a file over one is refused whole, never partly read, and nothing is imported.

| Limit           | At most |
| --------------- | ------- |
| File size       | 10 MB   |
| Sheets          | 256     |
| Rows in a sheet | 20,000  |

Code: `force-app/main/default/lwc/shoreshImportEngine/shoreshImportEngine.js` (`IMPORT_LIMITS`,
`readImportFile`, `checkFileSize`, `checkSheets`, `csvFile`, `workbookFile`, `refusedFile`);
the AI's way in, `connect/imports.js` `fileOf`. Tests:
`shoreshImportEngine/__tests__/limits.test.js`, `connect/__tests__/limits.test.js`, and each
screen's own test file.

## The rules

Each rule is clue, meaning, example, test.

1. **A file over 10 MB is refused before any of it is read.**
   Clue: the file's size, as the browser gives it, is over 10 MB (10 × 1024 × 1024 bytes); for a
   file an AI sends as CSV text, the bytes that text takes.
   Meaning: the screen says "That file is too large to import (over 10 MB). Nothing was
   imported." Its contents are never read and the spreadsheet reader is never loaded or run.
   Example: a 12 MB export from another system is refused; a 10 MB file is read.
   Test: "INGEST-1.1: a chosen file over 10 MB is refused before any of it is read";
   "INGEST-1.1: workbook bytes over 10 MB never reach the spreadsheet reader".

2. **A file with more than 256 sheets is refused.**
   Clue: the workbook's list of its sheets names more than 256.
   Meaning: "That file has too many sheets (over 256) to import safely. Nothing was imported."
   The sheets are counted from that list alone, before any sheet is opened. This differs from the desktop, whose limit is 32: its ADR §3a calls the
   bounds "tunable", and a real camp shape, a tab per group per week, passes 32 at once (16
   groups × 8 weeks = 128 tabs; the level-2 and level-4 corpus camps have 36 to 128). 256 covers
   it, and the 10 MB limit still bounds the file (coordinator, 2026-11-04).
   Example: a workbook of 257 tabs is refused; 128 (16 groups × 8 weeks) and 256 are read.
   Test: "INGEST-1.2: a workbook of 257 sheets is refused; 256 is read";
   "INGEST-1.2: 257 sheets are refused from the workbook's list of sheets, before any sheet is opened";
   "INGEST-1.2: a camp with a tab per group per week, 16 groups by 8 weeks, is read".

3. **A file with a sheet of more than 20,000 rows is refused.**
   Clue: a sheet's real size (the range the file says it covers) is more than 20,000 rows, or a
   CSV has more than 20,000 lines.
   Meaning: "A sheet in that file has too many rows (over 20,000) to import safely. Nothing was
   imported." Each sheet is read no further than its 20,001st row, and is refused on its real
   size, so a sheet of a million rows, real or only claimed, is never read whole and none of its
   rows is turned into cells. What this does not protect: the file is still unzipped to be read,
   as on the desktop; the 10 MB limit bounds what is unzipped.
   Example: a sheet of 20,001 rows is refused; 20,000 is read.
   Test: "INGEST-1.3: a workbook sheet of 20,001 rows is refused; 20,000 is read";
   "INGEST-1.3: a sheet's rows are read no further than 20,001, and a longer sheet is refused by its real size";
   "INGEST-1.3: a sheet claiming a million rows is refused before its rows are turned into cells";
   "INGEST-1.3: a CSV of 20,001 rows is refused; 20,000 is read".

4. **Every way a file comes in is held to the same limits, in one place.**
   Clue: a file chosen on Import last year, Import a list (every list, the Electives list among
   them), Bring in choices or a special day's or event's Import; or a file an AI or the command
   line sends (`import_list`, `import_worksheet`, `import_last_year`, `import_choices`,
   `import_special_schedule`).
   Meaning: the screens read a chosen file only through `readImportFile`, and the AI's file only
   through `fileOf`, both on the engine's one check. The refusal shows where that screen already
   shows a file it could not read, nothing is saved, and the director can choose another file at
   once. Bring in choices, which says "brought in" for what it saves, ends the refusal "Nothing was
   brought in." The AI gets the same words as its answer.
   Test: "refuses a file over 10 MB before reading it, saves nothing, and reads the next file
   chosen" (Import last year, Import a list); "the Electives list refuses a file over 10 MB
   before reading it"; "refuses a file over 10 MB before reading it, brings nothing in, and reads
   the next file chosen" (Bring in choices); "refuses a file over 10 MB before reading it,
   imports nothing, and reads the next file chosen" (special day or event); "is read through
   fileOf by every action that takes a file"; "is refused in the screens' words, and nothing is
   sent to be saved".

5. **Each way in takes the desktop's file types for it.**
   Clue: the file's name ends in one of the door's types (any case); the file picker offers the
   same list.
   Meaning: Import last year takes .xlsx, .xlsm, .xls, .csv and .tsv (desktop `ImportScreen.jsx`);
   Bring in choices takes .xlsx, .xlsm, .xls, .csv, .tsv and .txt (desktop `AssignmentPanel.jsx`:
   camps export CSV and TSV); Import a list, the Electives list and a special day's or event's
   Import take .xlsx, .xlsm, .xls and .csv. A .tsv or .txt is read as text, tab-separated when its
   header line has at least as many tabs as unquoted commas (desktop `exportSanitize.js`
   `tabSeparated`), so a cell that says "Swim, Archery, Ceramics" stays one cell. Any other file is
   refused with the types the door reads, and nothing is imported. The desktop's .txt on
   Import last year, offerings and a special event is text copied from a PDF, read by its own
   reader (`src/ingest/textGrid.js`); the screens don't read that kind of file. A schedule PDF
   comes in another way: a person's AI gives Import last year the PDF itself (rule 11).
   Example: a choices sheet saved from a form tool as `chugim.tsv` reads as the same sheet saved as
   `.csv`; `camp.txt` on Import last year is refused.
   Test: "INGEST-1.5: each door takes the desktop's file types";
   "INGEST-1.5: a .tsv whose cells hold commas is read on its tabs, as the desktop reads it";
   "INGEST-1.5: a .txt is read as the same text, tab- or comma-separated, as the desktop reads it";
   "takes a .tsv and a .txt, as the desktop's choice sheets do, and reads them as the .csv";
   "takes a .tsv as the desktop does, and not yet a .txt copied from a PDF".

6. **Import a list also takes cells pasted from a spreadsheet, read as a file is.**
   Clue: while Import a list waits for a file, the director presses ⌘V or Ctrl+V anywhere in it,
   or chooses Paste cells, and the clipboard holds text (Excel, Numbers and Google Sheets copy
   cells as tab-separated text).
   Meaning: the text is read as a file of one sheet named "Pasted cells", split on tabs only, so a
   single column of names with commas in them stays one column. It is held to the limits of rules
   1 to 3 and goes to the same review a file does, laid into the screen's own table. Nothing in it
   but blanks is refused: "There was nothing in what was pasted. Nothing was imported." A paste
   while a list is already in review changes nothing. When the browser won't let Paste cells read
   the clipboard, the screen says "Shoresh couldn't read what was copied. Paste with ⌘V or
   Ctrl+V." The desktop has no paste; Greg chose it (build log decision 69, 2026-11-04). Import
   last year and Bring in choices take files only.
   Example: three rows of activity names and lengths copied from a sheet and pasted on
   Activities' Import a list show as two new activities to add, as the same rows saved as a .csv
   would.
   Test: "INGEST-1.6: cells pasted with ⌘V are laid into the same review a file is";
   "INGEST-1.6: Paste cells reads what was copied, as ⌘V does";
   "INGEST-1.6: a pasted column of names with commas in them stays one column";
   "INGEST-1.6: nothing but blanks is refused, nothing saved, and the next paste is read";
   "INGEST-1.6: pasted cells keep a file's limits: over 20,000 rows is refused";
   "INGEST-1.6: a paste while a list is in review changes nothing";
   "INGEST-1.6: when the browser won't hand over the clipboard, ⌘V or Ctrl+V is named".

7. **A name longer than Salesforce keeps is a row that can't be read.**
   Clue: a list's name cell (any list's own Name: activities, locations, programs, groups, time
   blocks, special events, offerings), or a name in another list's column that may add it (an
   activity's Location or Rain plan), holds more than 80 characters.
   Meaning: the row is listed as one that can't be read, with why ("Activity: "AAAA…" is longer
   than 80 characters"), and is never counted as ready to save, so the save can't then refuse it
   ("Something typed is too long"). The rest of the file is read as before.
   Test: "INGEST-1.7: a name longer than Salesforce keeps can't be read, with why; it is never
   Ready to save".

8. **Download this list reads back through its own Import a list with nothing to change.**
   Clue: "Download this list" on any setup screen (Programs, Units, Bunks, Time blocks,
   Locations, Activities, Fixed activities, Recurring activities, Electives, Special events), the
   file then brought back in on the same screen's Import a list, as it is or edited.
   Meaning: the list has a column for every field its screen shows that a list can read back,
   headed and written in the screen's own words, and the import reads each one: nothing changes,
   nothing is asked and nothing is lost ("Nothing to change"). That includes the weeks each row is
   on, as the screen's Weeks column says them ("Every week", "Off Week 3", "Off Weeks 1, 6–7",
   "No weeks"; a location "Closed Week 2"), each week by its place in the season, and a fixed
   activity's early start ("Starts earlier on", a day as the season says its days, "Day 3" in a
   numbered season; "Time blocks earlier"). An edited file shows exactly what changed, for Keep or
   Change; a week taken off is saved as a week off, a week put back removes it, and Undo this
   import puts both back. A week the season doesn't have can't be read ("Weeks: there's no Week
   5"). Only the heading the list writes is read as the weeks (the camp's word: "Weeks"); a
   "Weeks" column none of whose cells says weeks (an older list's "8") is not read, as before,
   and the list's columns say so once ("Weeks column not read: it doesn't say which weeks"). The
   camp workbook leaves the weeks to its Which weeks sheet. Special events say the same
   in SPECIAL-2.3; when an activity runs, in rule 10.
   Example: Swim's row says "Every week"; the director writes "Off Week 1" and imports the file:
   one difference, Weeks: Every week → Off Week 1, and saving takes Swim off Week 1.
   Test: "INGEST-1.8: activities: every row reads back unchanged, nothing asked or lost" (and
   each list's own, in shoreshLists `listWeeks.test.js`);
   "INGEST-1.8: a week taken off, a week put back, and an early start changed";
   "INGEST-1.8: a blank early day clears it; a new row's weeks come with it";
   "INGEST-1.8: a week the season doesn't have, or words that aren't weeks, can't be read";
   "INGEST-1.8: only the Weeks heading the list writes is its weeks column";
   "INGEST-1.8: a Weeks column that never says which weeks is left unread, said once";
   Apex ImportWorkbookTest aScreenListSavesWeeksOffAndUndoPutsThemBack; ImportListProgramsTest
   addsAWholeNewProgramFromItsListsAndUndoRemovesIt.

9. **A save that fails says only what is known.**
   Clue: Add, Save or Import fails (Import last year, Import a list or the camp workbook, Bring in
   choices).
   Meaning: "Nothing was saved." (Bring in choices: "Nothing was imported.") only when it is
   known: the save was never sent; Shoresh's server answered (its own words, with or without its
   support code, CORE-6.15: the save threw, so all of it was undone); or Salesforce's limit
   stopped the whole request (`c/shoreshErrors` `outcomeKnown`). With no answer from the server
   (a dropped connection, a timeout) it may have saved after all, so it says Shoresh couldn't
   confirm it and where to look before doing it again (Roots, the list's own screen, Elective
   seats), with a support code, never "Try again." (desktop `writeErrorMessage.js`: "could not
   confirm this saved").
   Example: the connection drops while a whole season imports: "Shoresh couldn't confirm the
   import was saved. Look at Roots before adding these files again. For support: K7Q-4MX.", never
   an invitation to bring the files in twice.
   Test: "INGEST-1.9: never says nothing was saved when the save's outcome is unknown" (Import
   last year, Import a list), "INGEST-1.9: a workbook whose save's outcome is unknown sends the
   director to Roots", "INGEST-1.9: never says nothing was imported when the import's outcome is
   unknown" (Bring in choices); counter-cases "shows a save the server refused, and stays on the
   page", "says why nothing was saved when the server refuses", "INGEST-1.9: a save Shoresh's
   server answered with its support code saved nothing, and says so" (Import last year, Import a list), "INGEST-1.9: an import Shoresh's server answered with its support code imported nothing, and says so" (Bring in choices), "INGEST-1.9: a save
   Salesforce's limit stopped saved nothing, and says so"; shoreshErrors.test.js "outcomeKnown
   (INGEST-1.9)".

10. **An Activities list keeps when each activity runs.**
    Clue: Download this list on Activities, or the camp workbook's Activities sheet, brought back
    in on Activities' Import a list (or the workbook's), as it is or edited (ADR 0031 A7).
    Meaning: the list has a "When it runs" column, in the activity details panel's own words:
    "Whenever" when no box is unticked, else "Not " and each box it can't run in, "<time block>,
    <day>", joined by "; ", in the panel's order (programs, their time blocks, then the camp's
    week), with " (<program>)" after each box only when the season has more than one program. A
    day is said as the season says it ("Day 3" in a numbered season); its weekday name is read
    too. Read back as it is, nothing changes, nothing is asked and nothing is lost. "Whenever",
    "every time" or a blank cell is no box off. An edited cell shows exactly what changed, for
    Keep or Change, like Weeks (rule 8): a box taken off is saved as a box off, a box put back
    removes it, a new activity's boxes come with it, and the activity counts as changed. A box the
    season doesn't have can't be read ("When it runs: there's no Lunch, Saturday (Main)"), nor
    one said without its program when two programs have it.
    Example: Swim's row says "Whenever"; the director writes "Not Lunch, Monday (Main)" and
    imports the file: one difference, When it runs: Whenever → Not Lunch, Monday (Main), and
    saving keeps Swim out of Lunch on Mondays.
    Test: "INGEST-1.8: activities: every row reads back unchanged, nothing asked or lost" (its
    Board games can't run in three boxes);
    "INGEST-1.10: written as the details panel says it, in the grids' order, and read back
    unchanged";
    "INGEST-1.10: one program's season says no program; a numbered season says Day 1 and reads
    Monday too";
    "INGEST-1.10: a box taken off and boxes put back are what it shows and saves; a new row's
    boxes come with it";
    "INGEST-1.10: Whenever, every time or a blank is none off; a box the season doesn't have can't
    be read" (all in shoreshLists `listWeeks.test.js`); "activities: every field sent is one the
    server writes" (`contract.test.js`); Apex ImportListSavesTest
    savesABoxOfWhenItRunsTakenOffAndOnePutBack.

11. **A schedule PDF given to Import last year through a person's AI is read as the same table
    from Excel would be, and what it doesn't make plain is said, never guessed.**
    Clue: `import_last_year` is sent a file as `{file_name, pdf_path}`: where a PDF is on the
    person's computer, which the connector reads there (API-1.160). Screens don't take a PDF
    (ADR 0032).
    Meaning: the file is held to rules 1 and 2 first (over 10 MB, or more than 256 pages, and it is
    refused unread). A file that isn't a PDF, or that can't be opened, is refused: "Shoresh
    couldn't read <file> as a PDF. Nothing was imported." Then each page's table, drawn with lines,
    becomes a sheet named "Page n" in the page's own layout (a page per group, a page per day, by
    activity), so the import finds its layout, its group, its times and its days exactly as for the
    same table from Excel: a box drawn over several cells is one merged cell, lines of text above
    the table come first, each a row of its own, and each box's text is what it shows, its lines as
    lines. The rows are the boxes down the table's first column (the times). Nothing is guessed:
    a box filled in with no words that can be seen is left empty; words drawn in a box's own colour,
    or covered by a box drawn over them, are left out; a box whose top or bottom falls inside a
    time rather than on its edge is placed in the times it covers by more than half; two boxes that
    fall in one place are kept there together. Each of these is said with the review, after it, in
    one line each: "Not plain from the PDF (show the person; each is left as said, not guessed):
    camp.pdf: Page 3, 9:50-10:25, Monday: filled in with no words; left empty". A page that is a
    picture (scanned) or has no table drawn with lines is left out and said; a PDF of nothing else
    is refused ("<file> is a picture of a schedule (scanned), not text; Shoresh can't read it.
    Nothing was imported."). Pages are read in a process of their own, so the same PDF always gives
    the same sheets. Save sends the same files again and they are read again, as any file is.
    Example: a made-up camp's PDF, a page per bunk, with Field Trip drawn as one box down Thursday
    and one bunk's first block blacked out: a sheet per page, read By group; Field Trip is one cell
    over its blocks; the blacked-out box is a line under the review, and its cell is empty.
    Test: `connect/__tests__/pdf.test.js`, "INGEST-1.11: every corpus layout, printed, reads back
    as the same table, merged cells and all"; "INGEST-1.11: the same PDF always gives the same
    sheets"; "INGEST-1.11: lines above the table, a title and the group, come first, each a row of
    its own"; "INGEST-1.11: a merged box whose inside is coloured cell by cell is one cell with all
    its text"; "INGEST-1.11: words turned on their side (a Block column) read in their own
    direction"; "INGEST-1.11: a box filled in with no words, and words hidden in a box's own
    colour, are left out and said, never guessed"; "INGEST-1.11: a box that doesn't line up with
    the times beside it goes in the times it mostly covers, and is said"; "INGEST-1.11: a scanned
    page or a page with no table is left out and said; a PDF of nothing else is refused";
    "INGEST-1.11: a missing file, a file that isn't a PDF, and a PDF over 10 MB are refused before
    any of it is read".
