# 0007: Import a list on a screen, build choices

Status: proposed (2026-10-17), slice 4c, part A of four. Design source: wiki
`projects/shoresh-scheduling-sf` ("Slice 4c: per-screen imports, Greg's answers (2026-10-17)"),
the coordinator's plan approval and Greg's answers to its three questions (2026-10-17), and
Shoresh desktop's setup-list import (`src/ingest/entityColumnMapping.js`,
`src/utils/exportSanitize.js`, `docs/adr/2026-09-30-format-agnostic-setup-import.md`, the
screens' `confirmImport`), adapted under Apache-2.0 (see `NOTICE`).

**Part A (this):** the shared engine, the save, Undo, and the Locations and Activities screens.
**Part B:** Program days, Units, Bunks, Time blocks, Fixed and Recurring activities.
**Part C:** "Download this list" on every screen, and the full camp workbook export.
**Part D:** "Import camp workbook" on Roots.
**Part E (2026-10-23):** the file laid into the screen's own table (decision 56).

_Changed 2026-10-20 (Greg: the leftover wording calls follow the desktop): what the director
sees says **worksheet**, as the desktop does (`RootsHomeScreen.jsx` and `ImportScreen.jsx`
"Download worksheet", `workbookToSource.js` "This worksheet …"): **Download worksheet** and
**Import worksheet** on Roots, the file "Summer 2027 - worksheet.xlsx", "Not in the worksheet",
"… of the worksheet that can be read", "The worksheet could not be downloaded", and the save's
"This worksheet is too big to be undone later …". The code keeps its names (`campWorkbookSheets`,
`workbook.js`, `saveWorkbook`, the `workbook` attribute); this record keeps "camp workbook" for
the same thing._

## What the desktop did and did not do

Checked in its code (2026-10-17): its column memory (`mappingSeedling.js`) is wired only into
the elective-preference importer; no setup screen remembers columns, matches the camp's own
words, or lets a column be pointed at a field. Its camp workbook is read-only (a title line
above the headings, other headings, "Yes"/blank booleans) and does not re-import. Its parsing
fills in defaults quietly ("Yes" in an Outdoors column reads as false, an unknown availability
as "all"; two rows with one name, the last wins). So these parts are new work, not a port.

## Choices

1. **One layout per screen** (`c/shoreshLists/screens.js`), used for reading a list, for
   "Download this list", and for that screen's sheet in the camp workbook, so whatever
   Shoresh writes reads back with no changes (Greg, #5). Headings are in the camp's words;
   each column also answers to common other headings, the desktop's among them. There is no
   separate template with example rows: an example row would be imported as a real item. An
   empty list downloads as the template.
2. **Headings, never cell contents, decide the columns.** Matching folds capitals, spaces, and
   punctuation. A heading two columns could claim is given to neither until the director
   picks; an unknown heading is "Not used" and can be pointed at a column. Choices are kept in
   `ImportAnswer__c` (key `columns|<screen>|<heading>`, per camp like every answer); 4b never
   asks those keys. Similar-name answers share 4b's keys (`similar|activity|...`), so a camp
   that said Music and Musik are the same is not asked again.
3. **Nothing defaults quietly.** Rows of one name (capitals and spacing aside) are one item:
   when its rows say the same thing, the first row leads; when they differ in any column the
   file has (coordinator, #20 review), a question shows each version ("Row 3: 9:30 AM ·
   10:00 AM") with Leave it out, and the chosen row leads. Its spelling, whatever the row
   order, is as an item set up spells it, else as written most often, then the first
   alphabetically. A cell that can't be read (a Yes/No cell saying "maybe", "two"
   in a number column, Saturday) makes its row unreadable: listed with the reason, left out.
   Yes/No reads Yes, Y, True, 1, x and No, N, False, 0; a blank tick column is No. A line break
   inside a cell (Alt+Enter) separates names in a list, as a comma does. Rows are settled
   before anything they name is resolved: the first row of each name (capitals and spacing
   aside) leads (or the row chosen when they differ), even one that can't be read, and the
   other rows with that name follow it:
   not saved ("Same as row 2", or "Same as row 2, which can't be read"), left out with it, or
   waiting with it while it is asked about. Two rows answered to be one item set up keep the
   first.
4. **Only the columns the file has are compared** (Greg, #2). A row naming something set up
   shows every difference ("Times per week: at least: 3 → 2") with Keep or Change, and every
   one must be answered. **A blank cell clears the value** of an item set up (Greg, Q1): an
   optional value to none, "at most" to no maximum, "groups at once" to no limit, "who can do
   it" to everyone, each shown as a difference tagged "clears". **A new item starts as one
   added by hand** wherever its cell is blank (at most = at least, or 1; one group at a time;
   everyone). A value an item can't be without (length,
   times a week at least, groups that fit, priority, availability, part of day) can't be
   cleared: on an item set up, a blank there makes the row unreadable ("Length is blank"). **A
   new item starts as one added by hand does** (Greg, 2026-10-17): a blank there takes the
   starting value (part of day from the start time), tagged "starting value". A blank with
   nothing to start from (a name, days, a time) can't be read on any row. "Change all from this file" answers
   only the differences not answered yet (a Keep the director chose stays), and its label says
   how many it changes and how many of those clear a value ("Change the other 8: 1 clears a
   value"). Names are never changed by a list. Two items set up with the name a row gives
   are never picked by order: the director is asked which one (or a new one); two set up with
   a name a row refers to (a location, a rain plan) make the row unreadable.
5. **What a row names that doesn't exist is added** (Greg, Q2, for every import from now on).
   Shoresh asks only where it can't create the item without an answer: a name in "Who can do
   it" that is no unit or bunk (add it as a unit in which program, or a bunk in which unit),
   and, in part B, a new program's days. Locations and location types are added as they are
   (shown under "Also adding", ticked and greyed out). **A rain plan naming an activity that
   isn't set up** (nor a row that will be saved, including one left out) **is added exactly as
   an activity added by hand, with its starting values and no question** (Greg, 2026-10-17);
   it is shown ticked under "Also adding" and can be unticked, and then the rows naming it are
   saved without that rain plan and the summary says so. Every question can be answered
   "Leave it out for now", which leaves out the rows that need it. Only what will be saved
   counts: a place named in a difference answered Keep is not added. **Every name a row refers to
   (a location, a location type, a rain plan) is resolved by one function** (`refs.js`), with
   the same folding as rows: a name the list's own rows give follows that row as settled (to
   the row it was answered to be the same as, to the item it matched, to the row itself, or,
   when that row isn't saved, to an item added as by hand); otherwise the season's item; two of
   one name are never guessed; only a name matching nothing is asked about as similar. The
   result is the same in any row order (tested reversed and shuffled). The last guard before saving: every
   link in the save request names a record set up or one the same request adds; one that
   doesn't is shown under "Review here", never sent to fail.
6. **Columns that are not a screen's fields** follow the screen: "Times a week: at most" and
   "Groups at once" take a number or "No maximum" / "No limit" (one column instead of the
   screen's number and tick); "Early in the week" reads "2 by Wednesday"; "Who can do it" lists
   units and bunks, a name two records share written with what tells them apart ("Bunk 1
   (Juniors)"), never guessed. Weeks' "Runs in" / "Open in" ticks are not in screen lists
   (the camp workbook will carry them, part C).
7. **Saving**: `ImportController.saveList(plan)` (`ImportListSaves`) takes records by kind
   (location types, locations, units, bunks, activities), each with plain fields and fields
   naming another record (a key added in the same save, or an Id). Only fields listed per
   kind in the class are written; every Id must be in the season (`ImportKeys`); user mode;
   all or none; the season locked first so imports and Undos take turns; recorded in
   `Import__c` like Import last year, so **Undo last import** covers it (Greg, #6). A rain
   plan naming an activity added in the same list is written once both exist
   (`ImportWriter.amend`, which fingerprints the record again for Undo).
8. **Who lists on activities set up before** are replaced only when the director chose Change.
   The old list and the new are logged in `Import__c.Changed__c` as a "who" entry; Undo
   (`ImportUndoWho`) puts the old list back unless the list was edited since (then it is kept
   and named), and names an activity whose list lost a unit or bunk deleted since. A list too
   big for the Undo log (`Created__c` or `Changed__c` over 131,072 characters) is refused
   before anything is saved; changing who can do 60 activities fits (Apex test).
9. **Undo removes location types** the import added, after their locations, unless a location
   the import didn't add has been given that type since.
10. **The formula guard** (desktop `exportSanitize.js`): a text cell starting with = + - @ or a
    tab or line break is written with an apostrophe in front, which reading takes off again.
    Used by part C's downloads; reading already takes it off.

11. **Words on screen** (Greg, 2026-10-17: "if we have to explain it in words, then we did not
    do our job visually"): no explanatory sentences in the panel; state is shown with tags
    ("Not used", "Remembered", "clears"), before → after values, and ticks; a card is its
    question and its answer buttons; messages say what happened or what is needed ("Length is
    blank", "Same as row 4").

## Part B: a program's lists (2026-10-17)

12. **Program days, Units (divisions), Bunks (groups), Time blocks, Fixed and Recurring
    activities** use the same engine. Each row's program comes from a **Program** column; with
    one program it can be left out, with several a blank is "Program is blank". Rows are
    settled within their program (a "Lunch" in two programs is two items), and the names they
    refer to (a division, a time block) are resolved within that program by `refs.js`.
13. **What a program list names that doesn't exist** is added, asking only what Shoresh can't
    create it without (Greg, Q2): a new program's days (Monday to Friday ticks; Save waits), a
    new time block's start and end, and a 5 or 6 o'clock time's morning or evening (ADR 0006).
    A division is added as it is. A recurring activity on a day its program doesn't run asks:
    add the day to the program, leave the day out of the row, or leave the row out.
14. **Days** read "Monday, Wednesday", "Mon-Fri", "Mon thru Fri", "Tue/Thu", "Mon Wed Fri",
    "Wednesdays", "weekdays", and letters (coordinator, #20 review): "M/W/F", "M-F", "MWF",
    "Tu", "Th", "W", "F". A lone T is Tuesday when the cell writes Thursday another way ("T/Th"),
    Thursday when it writes Tuesday another way, and otherwise asked ("is T Tuesday or
    Thursday?"); two ("MTWTF") are Tuesday, then Thursday. Two or more dashes are a list
    ("Mon-Wed-Fri" is three days; coordinator, #20 round 2). One dash is a range when its days
    are next to each other ("Mon-Tue") or span the week ("M-F"); any other ("T-Th") is asked:
    "Tue to Thu, or just Tue and Thu?" Asked only when it matters (Greg, 2026-10-17;
    `TWO_DAY_DASH = "ask"` in cells.js). Each such dash is its own question, by how it is written ("M-W",
    "Tu-Th"), and a dash next to run-together letters ("MW-F") is no surer than one between
    single days (coordinator, #20 round 3). Every dash-like character (em dash, minus,
    Unicode hyphens) is a dash. Two-letter days ("Mo We Fr") are read; anything else odd
    ("Mon~Fri", "MonWedFri") can't be read rather than be guessed. "thru", "through" and "to"
    are always ranges. Saturday and Sunday
    can't be read. **Times** read "9:00", "9:00 AM", "13:30",
    and a bare hour by the camp-day rule (ADR 0006): "9" is 9:00 AM, 7 to 11 the morning, 12 to 4
    the afternoon, 5 and 6 asked; a bare 13 to 23 can't be read ("8 PM" written out can). Shoresh writes "9:00 AM"; a time
    outside a camp day ("15:00 AM", before 5 in the morning) can't be read. A new block whose
    list has no Part of day column starts as the time says (before noon: morning); a blank
    cell in a column the file has can't be read, as for every value an item can't be without
    (§4), as are a blank Length or Availability.
15. **A group is its program, division, and name** (ADR 0006 §14), by the division the row
    resolves to, so "Bunk 1" in Juniors and in Seniors are two groups. **A group in another
    division** of its program is a difference ("Unit: Juniors →
    Seniors"); Change moves it (GroupMoves refuses another program's). It is not a move when the file
    also names the group in the division it is in, or when two rows would move the same group
    (never picked by order): those rows are new groups. A list never changes
    which program anything is in, and only adds divisions (never renames them).
16. **Who a recurring activity covers** (Coverage rows) is written and undone like who can do
    an activity (`ImportWhoKinds`): replaced only on Change, put back by Undo unless edited
    since. Undo decides whether to keep a recurring activity it added (edited since, or in use)
    before it removes the Coverage rows it added, and keeps those of one it keeps: an edited
    activity never quietly becomes "everyone".

## Part C: writing lists and the camp workbook (2026-10-17)

17. **"Download this list"** on every screen writes the screen's list in the layout "Import a
    list" reads (`export.js`), as an Excel file named for the screen and season. An empty list
    is the template: headings only. Values are written as the import reads them: Yes / No, "No
    maximum", "No limit", "2 by Wednesday", "9:00 AM", days by name, who lists by the shortest
    name no other unit or bunk shares ("Juniors (Main)" where two programs have a Juniors),
    "Everyone" for no list.
18. **"Download camp workbook"** (now **Download worksheet**) on Roots writes every screen's list as its own sheet, named
    as the menu names the screen, in menu order, then what has no list of its own so a camp
    can be rebuilt from the workbook (coordinator, Q3): the location types (the Locations
    sheet only names those in use), the camp's words (only those it changed), the weeks, and
    the weeks each item runs in ("Runs in": a Yes or No under each week, as the screens'
    ticks). Each screen's import finds its own sheet by name. Importing the whole workbook in
    one go is part D.
19. **Round trip** (Greg, #5): every screen's list, and the workbook, read back with no
    changes, no questions, and nothing to add (Jest, a camp with two programs that share unit
    and bunk names).
20. **Formula guard**: every text cell starting with = + - @ or a tab or line break is written
    with an apostrophe in front, which the import takes off again; numbers are written as
    numbers.
21. **What a spreadsheet can't hold is said, never cut** (own review before opening part C):
    a cell over Excel's 32,767 characters stops the download with a message naming the item.
    Sheet names drop what Excel refuses (: \ / ? * [ ], an apostrophe at either end, the
    name "History", half an emoji at the 31-character cut). In a who list, a name with a
    comma, semicolon, line break, quote, or a bracket left open is written in double quotes,
    a quote inside written twice. Two weeks of one name head their "Runs in" columns with
    their start dates. Two items of exactly one name are asked which is which on the way
    back (shown, never guessed): a known limit of names that aren't unique.
22. **Spacing is tidied on both sides** before names are compared: "Board games" (two
    spaces) in a file matches "Board games" set up, and a name set up with two spaces matches
    the file's one, without a question. Capitals are not: "gym" against "Gym" is asked.
23. **Files are saved from a Blob** (`URL.createObjectURL`, let go at the next download: no timer, which LWC forbids), not a
    data: link, so a large camp's workbook isn't cut off by a browser's link length.

## Part D: importing the camp workbook on Roots (2026-10-17)

24. **One import for the whole camp** (Greg, Q3): **Import camp workbook** (now **Import
    worksheet**) on Roots reads every
    sheet of the workbook Roots downloads, in one review, one save, and one Undo. Nothing the
    workbook leaves out is deleted. It is the panel of "Import a list" in a workbook mode: one
    section per sheet; the questions, **Change all from this file**, and the save label cover
    the whole file.
25. **Sheets are found by what they hold** (coordinator): camp words, weeks, and Runs in by
    their headings; each list by how well its headings fit (most matched, fewest unknown, one
    sheet per list). A camp word making "Weeks (2)", or a sheet renamed, still reads. A sheet
    nothing reads is listed under "Sheets not read".
26. **Order**: camp words first (the other sheets' headings are in them), then weeks, then the
    lists in the order they depend on each other (programs, units, bunks, time blocks, location
    types, locations, activities, fixed, recurring), each read as its screen reads it against
    the season as the sheets before would leave it (`withRecords`), so nothing is added or asked
    twice. A later sheet's change to something an earlier one adds is folded into the add.
27. **Weeks** (Greg, 2026-10-17, in `matchWeeks`): a workbook from this season (a week starting
    within the season's dates) is matched by start date: a new name or end date is a Keep or
    Change, a new start date a week to add. A workbook from another season (no week starting
    within them) is paired by order, as opening a new season copies weeks ("you'd copy the
    weeks but need to update the dates"): its first week is the season's first, and so on; the
    season keeps its own dates (a new name is still a Keep or Change); the preview shows each
    pairing ("Week 1 (Jun 28 2027) → Week 1 (Jun 26 2028)") and Runs in follows it. A workbook
    week past the season's last is left out (its ticks aren't read); a season week past the
    workbook's is listed as not in the workbook and left as it is. Which way (by start date or
    by order) is decided once per sheet, on every row whose dates can be read, before any row
    is set aside, so setting one aside never flips it. A season with dates but no weeks yet
    (coordinator's call, 2026-10-17, following Greg's "copy the weeks, update the dates"): its
    weeks are first filled from its dates as "Fill in weeks" makes them (`SeasonWeeks.toFill`,
    in the same save), then paired by order; the preview shows "Will also add: Week 1 (Jun 26 2028) …" and the pairing; Undo removes the filled weeks unless used or edited since; the
    save refuses if the season's dates no longer give the weeks the preview showed. Dates are read only when certain: 2027-06-28,
    "Jun 28, 2027", "28-Jun-27", or numbers whose day and month order another date in the
    column settles; "7/5/2027" alone could be read two ways and can't be read.
28. **Runs in**: each row finds its item by kind, program, unit, and name; each week column its
    week by name, or "Name (start date)" when two weeks share a name. A changed tick is a Keep
    or Change per item; Change adds or removes that item's weeks off. An item the workbook adds
    runs the weeks it says. A blank tick, an item or week not found, can't be read.
29. **Camp words**: a Keep or Change per word. A word the workbook leaves out stays. Undo puts
    words back, keeping one edited since and naming it (Greg). A word equal to Shoresh's own is
    no camp word, as the camp words editor saves it: a camp word set back to it is removed, and
    Undo puts it back unless the camp chose a word for that term since. The camp row is locked
    (FOR UPDATE) while an import or its Undo changes camp words, so two seasons' imports take
    turns over them.
30. **Server**: `ImportController.saveWorkbook`, the list save in workbook mode, adds Week and
    WeekException kinds (weeks are added or renamed, never moved to another start date; a week
    off removed is checked to be in the season) and camp words (with the camp's edit access).
    Undo removes added weeks and weeks off unless used, puts removed weeks off back, and
    restores changed weeks and words. An item Undo keeps (edited since, or in use) keeps the
    weeks off the workbook gave it, as a recurring item keeps who it covers. A screen's list
    can't write these kinds.
31. **Undo trusts nothing in an import's record** (security review): Import__c's Created__c and
    Changed__c are text a scheduler can edit, so every object and field name Undo takes from
    them must be one an import writes (`ImportFields`); anything else refuses the Undo with
    "this import's record can't be read", and nothing is undone.
32. **What is never picked by position** (own review): two sheets fitting one list equally
    (a copy kept beside it) are neither read, both listed under "Sheets not read"; two weeks
    starting the same day are both unreadable; one item on two Runs in rows with different
    ticks makes both unreadable (the same ticks: one is "same as row N"); and, by order, a week
    row that can't be read leaves every week unpaired until it can, rather than shift the rest.
    Matched by start date, a week the workbook adds or gives a new end that would overlap
    another week of the season is unreadable ("Overlaps Week 2 (Jul 5 2027)"), never added on
    top; two Runs in columns for one week are neither read, both said (independent review).
    The Weeks screen flags overlapping weeks too, without blocking: the bronze dot and
    "Overlaps another week" in the camp's word, as for a same name. A week off Undo can't put
    back is named by item and week ("Swim (Week 2)"); one whose week is in another season
    refuses the Undo.
    Camp words are the camp's, not the season's: undoing one season's workbook puts them back
    for every season of the camp (a product call left open for Greg).

## Part E: the file laid into the screen's own table (2026-10-23)

Design source: Greg's decision 56 in wiki `projects/shoresh-scheduling-sf.md` (remaining screens,
round 1: "Import a list lays the file's rows into the real table (A)") and the approved mock-up
`design-research/screens-r1/list-import-a.png` (`list-import.html`), in the design system (ADR 0015).
Every question, answer and refusal above stays; what moves is said here.

33. **Import a list takes the rail's place, then the table's** (`c/shoreshListImport`, its
    `table.js`). Opened from a setup screen's rail, it is the rail: **Import a list**, the file's
    name once one is chosen (and the sheet, when the file has several), then **Cancel** and the
    one filled button that says what saving does ("Add 3, change 2", choice 11). What saving
    still waits for sits beside them, each with the needs-a-look corner ("1 difference to Keep or
    Change"). While a file is reviewed the screen's own table is put away and the file is laid
    into the same table language in its place (the page hears `listopen { open, review }` and
    marks the screen `screen_importing` / `screen_import-review`; closed, both are back):
    - the screen's sections and columns: a bunk under its unit, a place under its type, an
      activity under its priority, and each program (or elective set) when there are several;
      the section's name and count ("Juniors 4", read "Juniors, 4") counts what will be there
      once saved; the column names once, above the first section. The columns are the ones the
      file has (the name first; what a section already says is not repeated);
    - every item set up stays where it is, as it is, a raised row, whether the file names it or
      not: nothing is removed by a list (choice 4). A camp workbook (Roots) holds the whole camp,
      so there the rows it leaves as they are are counted instead ("40 the same as here");
    - a **new** row has a dashed outline (the missing shows by its outline, as a proposed
      offering), after the rows set up in its section; a new section appears for a unit or type
      the list adds. A blank cell it starts with a value for shows that value, quiet (read
      "1, starting value");
    - a **difference** shows the old value crossed out beside the new one ("~~All day~~ Morning
      only", read "was All day, now Morning only"), with **Keep** and **Change** at the row's
      end, the chosen one raised and pressed; one the table has no column for (a bunk's unit, a
      place's type, a workbook's week) is said in words there ("Unit: Juniors → Inters");
      "clears" still marks a change that empties a value, and **Change all from this file**
      stays above the table;
    - a row it **can't use** carries the needs-a-look corner and says why at its end ("Row 14 ·
      Unit is blank"), in its section when that section is there, else under **Review here**
      (only such rows: a workbook sheet with no screen of its own, Weeks, Camp words or Runs
      in, draws its Keep or Change rows with its new ones, without a heading); a
      row waiting on a question says "Asked above"; a row left out (a repeat, a place deleted
      before) is faded with why;
    - **Leave out** on a new row (the mock-up's, new here): pressed, the row stays where it
      would go, faded and crossed out, and is not saved, nor what only it would add (its new
      location); pressed again, it is back. It keeps the cursor. It is an answer for this import
      only (`skip|…` in `shoreshLists` `skipKey`), never remembered: it is neither a question
      nor a similar name, so `listPlan` neither remembers nor forgets it. A camp workbook
      (Roots) has no Leave out: its sheets are read in order, each against what the ones before
      add, so a place left out of Locations would come back as Also adding through an activity
      on the Activities sheet that names it, and be saved anyway (the desktop has no Leave out);
    - under the table, **Also adding** (choice 5, ticks as before), and **Deleted before, not
      brought back** with each name and its **Bring back** (decision 45, #101) on one line.

    The questions ("Questions for you", choice 3's similar names and which-row questions, a new
    program's days, a block's times) stay above the table, each a raised row with the corner
    until answered, then one quiet line with ✓ and Change. The file's columns (choice 2) are
    behind a **Columns** button (`aria-expanded`) that opens by itself, with the corner, when a
    heading is not used, is unclear, or a needed one is missing. After **Save** the rail says
    **Saved** and what was added and changed, with **Undo this import** and **Close**, and the
    screen's own table comes back with the rows in it, where they live. The Electives list's
    camper-choices file still says so and offers **Bring in choices** (plan §6.2).
    No colour of the earlier palette (bronze) is left in the panel; on Programs and Roots, where
    there is no rail, the same panel is its own piece. Checked by `shoreshListImport.test.js`
    ("laid into the screen's own table": sections, counts, kinds, crossed-out values and what is
    read, the corner, Leave out and its cursor, what the page is told, the Columns button, axe),
    `lists.test.js` (Leave out: not saved, nothing only it adds, not remembered),
    `shoreshCampSetup.test.js` (the rail and table put away while open and reviewing, and back,
    also when another season or camp is picked while a file is reviewed),
    and in the test org by `scripts/a11y-browser-check.mjs` (Import a list on Groups by keyboard:
    the table in the rail's and table's place, Leave out, Cancel bringing the screen back;
    Electives' change saved and said, as before).

## Choices that are hard to undo after release

- `ImportController.saveList` and the plan's shape (records with kind, key or id, fields,
  refs, who) are part of the package's surface once released.
- The "who" entry in `Import__c.Changed__c` (an import's Undo must still read it later).
- No new objects or fields.
