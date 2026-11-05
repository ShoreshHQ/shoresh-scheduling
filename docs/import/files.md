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
   line sends (`import_list`, `import_worksheet`, `import_last_year`, `bring_in_choices`,
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
   refused with the types the door reads, and nothing is imported. Not yet: the desktop's .txt on
   Import last year, offerings and a special event is text copied from a PDF, read by its own
   reader (`src/ingest/textGrid.js`); Shoresh does not read that kind of file yet.
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
