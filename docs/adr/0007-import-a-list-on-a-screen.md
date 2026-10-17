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
18. **"Download camp workbook"** on Roots writes every screen's list as its own sheet, named
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

## Choices that are hard to undo after release

- `ImportController.saveList` and the plan's shape (records with kind, key or id, fields,
  refs, who) are part of the package's surface once released.
- The "who" entry in `Import__c.Changed__c` (an import's Undo must still read it later).
- No new objects or fields.
