# 0032. Reading a schedule PDF through a person's AI

Date: 2026-11-27. Status: accepted (coordinator, 2026-11-27, from Greg's "however they did the
transformation from pdf to excel is worth extracting and improving as a skill and a program that
we can use for shoresh to teach importing by pdf").

## Context

This changes an earlier decision. Greg's Q1 of 2026-10-27 (wiki `projects/shoresh-sf-ingestion-plan.md`,
"Decisions") was "No PDF/photo reading": spreadsheets stay the main door, with pasted grids for the
rest. His request of 2026-11-27, above, asks for PDF reading. This ADR takes that as replacing Q1
for the AI's way in only. Photos, and the screens, still don't read PDFs (decision 8).

Many camps keep last year's schedule only as a PDF, printed from a spreadsheet: a page per bunk,
or a page per day. Import last year (ADR 0006) reads Excel and CSV, in the three layouts camps
print (all camp, by group, by activity), and decides what each name is and what to ask. It does
not read PDF. The desktop reads text copied out of a PDF (`src/ingest/textGrid.js`), guessing
columns from the spacing.

Three real camps' schedules (two PDFs, one set of Excel files; kept out of every repo) were turned
into spreadsheets by hand in a sandbox to find out what reading a PDF takes. What they showed:

- The tables are drawn with lines, and a spreadsheet's PDF keeps them. Reading the lines gives the
  cells and the merged boxes exactly. Spacing alone would not (a box over eight blocks, a time
  written over two lines, words turned on their side in a Block column).
- A cell coloured in draws its own box, so a merged box can be several coloured boxes edge to
  edge. Only the lines are borders.
- Some things can't be read for sure: a box blacked out with nothing on it, words drawn in the
  box's own colour (a half-day group's afternoon, blacked out over what the spreadsheet still
  held), and a box shifted off the times beside it (Friday's swim and lunch a quarter of an hour
  later).
- What is in a cell (a swim box listing its own times, "Activity" over "Room") is the camp's own
  writing, the same in their Excel file. That is the import engine's to read, not a PDF reader's.

## Decisions

1. **A PDF is read into the import's own sheets, in the page's own layout.** Each page's table
   becomes a sheet ("Page n"), boxes as merged cells, lines above the table as rows of their own.
   The import then reads it exactly as the same table from Excel: same layouts, same questions,
   same review. No second shape and no second reader of layouts.
2. **Read by what the page draws.** Borders are the stroked lines (and filled boxes a few points
   thin); cells with no border between them are one box; a box that isn't a rectangle is its cells.
   Each character goes in the box its centre falls in, read in its own direction. The rows are the
   boxes down the first column (the times); a finer box goes in the times it covers by more than
   half.
3. **Nothing is guessed** (product principle: show problems, don't resolve them silently). A box
   filled in with no words, words hidden in a box's colour or under a box drawn over them, a box
   whose edge falls inside a time, and two boxes in one place are each said in one line with the
   review. The cell is left empty, or placed by what it covers. Scanned pages and pages with no
   table are left out and said. A PDF of nothing else is refused. No OCR.
4. **Through Import last year's own door, not a tool of its own.** `import_last_year` takes a file
   as `{file_name, pdf_path}`; the connector reads the PDF on the person's computer, then sends the
   sheets through `fileOf` and the screen's review unchanged (API-1.160, INGEST-1.11). A separate
   `read_a_pdf` tool was considered and dropped, for two reasons. It would be a tool with no web
   address, outside API-1.6 ("a person's AI brings data in only as the screens do") and
   `matchesTheApi`. And the AI would have to copy every page's cells back into `import_last_year`
   by hand, dozens of pages for one camp, where one slip goes unseen.
5. **The instructions travel in the tool's own words.** `import_last_year`'s description tells any
   AI to send the PDF, not retype it; to tell the person each thing the review says the PDF
   doesn't make plain, before saving, and fill none in; and to ask for the original file when a
   PDF is scanned. Every camp's AI gets them with the connector (API-1.15). No MCP prompt: the
   connector has none, and this needs none.
6. **pdf.js, run apart.** `pdfjs-dist` 4.10.38's legacy build for Node (Apache-2.0), unchanged, is
   carried in the connector as `engine.pdfjs.mjs` and `engine.pdfjs.worker.mjs`, with its licence in
   NOTICE and Settings' Legal (API-1.157). It needs Node 20 or later, as the connector already does.
   `connect/pdfPages.js` runs it in a process of its own, so a broken or huge PDF can't take the
   connector down, and the same code runs under Jest. `isEvalSupported: false`, as advised after
   CVE-2024-4367 (fixed in 4.2.67). The 10 MB and 256-sheet limits are checked first (INGEST-1.1,
   1.2); a file that doesn't start `%PDF-` is refused unread.
7. **Size.** The connector ships as the ShoreshConnect static resource, at most 5 MB as a zip.
   Measured 2026-11-27: today's connector zips to 1.13 MB; with pdf.js's two files and licence it
   zips to 1.66 MB, a third of the limit. Unzipped it is about 5.5 MB; the limit counts the zip.
8. **The screen doesn't take a PDF.** Import last year's screen reading a PDF in the browser is a
   separate product question for Greg; this is the AI's way only.
9. **Tests use made-up PDFs only.** `connect/__tests__/pdf.test.js` prints the import corpus's
   invented camps to PDF in each layout and reads them back as the same tables, and draws each
   thing above (coloured merged boxes, sideways words, blacked-out and hidden words, shifted boxes,
   scanned pages). No real camp's file, or anything made from one, is in the repo.

## Consequences

- A camp with only a PDF can bring last year in through its AI, and sees the same review a
  spreadsheet gets, plus what the PDF couldn't make plain.
- How the import reads a cell's own writing (times inside a swim box, "Activity" over "Room", a
  title of two lines) is unchanged. Any improvement there is the engine's, and helps Excel files too.
- The connector grows by about 0.5 MB zipped.
- Bumping pdf.js means changing the pinned version in `package.json`, the NOTICE and Legal lines,
  and rebuilding the connector.
