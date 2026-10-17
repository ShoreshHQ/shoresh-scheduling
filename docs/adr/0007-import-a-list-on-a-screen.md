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
3. **Nothing defaults quietly.** A cell that can't be read (a Yes/No cell saying "maybe", "two"
   in a number column, Saturday) makes its row unreadable: listed with the reason, left out.
   Yes/No reads Yes, Y, True, 1, x and No, N, False, 0; a blank tick column is No. A name
   written twice: the first row is used and the second says so.
4. **Only the columns the file has are compared** (Greg, #2). A row naming something set up
   shows every difference ("Times a week: at least: 3 → 2") with Keep or Change, and every one
   must be answered; "Change all from this file" answers them all and its label says how many
   values it clears. **A blank cell clears the value** (Greg, Q1), shown as a difference tagged
   "clears a value". For a number a record can't be without (length, times a week at least,
   groups that fit, priority) a blank cell changes nothing, and a new item takes what an item
   added by hand starts with. Names are never changed by a list.
5. **What a row names that doesn't exist is added, after asking for what it needs** (Greg, Q2,
   for every import from now on): a location or location type is added ("Will also add",
   ticked and greyed out); a name in "Who can do it" that is no unit or bunk asks whether to
   add it as a unit (which program) or a bunk (which unit); a rain plan naming an activity
   that is nowhere asks its length, and the rest starts as an activity added by hand. Every
   question can be answered "Leave it out for now", which leaves out the rows that name it. Only
   what will be saved counts: a place named in a difference answered Keep is not added. A rain
   plan naming a row that can't be read or is left out is asked about the same way, never
   linked to nothing.
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

## Choices that are hard to undo after release

- `ImportController.saveList` and the plan's shape (records with kind, key or id, fields,
  refs, who) are part of the package's surface once released.
- The "who" entry in `Import__c.Changed__c` (an import's Undo must still read it later).
- No new objects or fields.
