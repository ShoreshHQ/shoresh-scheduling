# 0005: Schedule page and versions, build choices

Status: proposed (2026-10-16), slice 4a. Design source: wiki `projects/shoresh-scheduling-sf`
("Slice 4 planning" rounds 1 and 2), `projects/shoresh-scheduling-data-model` ("Schedules",
"Protecting history", platform check (d)), glossary (draft schedule, version, published
schedule), decisions 0002 and 0005. Shoresh desktop for look and behaviour:
`src/screens/ScheduleScreen.jsx` (toolbar, view toggle), `src/components/schedule/`
(`ScheduleDayView`, `GroupGridFrame`, `ScheduleActivityView`, `VersionsDropdown`,
`scheduleGrid.css`), `src/screens/schedule/gridGeometry.js`, `gridTracks.js`,
`useSnapshots.js`, and `docs/guide/DIRECTOR_GUIDE.md` (Generated schedule, Manual Build).

## Choices

1. **One Schedules screen** replaces the menu's "Coming" entry. Its toolbar follows the
   desktop's: the week (and the program, only when there is more than one), the **Daily View /
   Group View / Activity View** toggle (shown once a version is open, as the desktop shows it
   once a schedule exists), then, after a divider, **Versions**. The week's newest version
   opens by itself when the page loads and when the week or program changes (Greg,
   2026-10-16); a week with none says so. Manual Build and Generated
   Schedule are not on the page yet; Roots' "Build or generate the schedule" door stays Coming.
2. **The three views are the desktop's**, read-only:
   - Daily View: day pills, a grid with time blocks down the side (name and a two-line time
     range) and a column per group;
   - Group View: group pills, a column per day;
   - Activity View: a card per activity (the season's catalogue, in order, plus any activity
     in the version that has been deleted since), with its location and "N groups · M times
     this week"; a card opens the week's grid listing the groups doing it in each block, with
     "← All Activities" back.

   A cell that runs several blocks spans their rows (desktop `gridGeometry`/`gridTracks`:
   140px block column, equal columns, rows at least 48px). Nothing placed shows **Open**, as
   the desktop's empty cell does. Fixed and recurring activities have the desktop's anchor
   look (a bar down the left); things not set up yet (elective, special day, special event,
   trip) a dashed box marked "not set up yet". **Trip** is a new camp word (`ModelTerm__c`
   value `Trip`) and glossary term (Greg, 2026-10-16), so a camp can use its own name. A legend under Daily and Group View explains
   the looks (the desktop shows one on Manual Build).

3. **Versions** is the desktop's dropdown, shared by Manual Build and Generated Schedule (it
   lists every version of the program's week). Each row: name, how it was made (Imported,
   Manual Build, Generated Schedule, Copied), when it was saved, "on screen now" for the open
   one, **rename** and **Open**. Differences from the desktop, all because 4a is read-only:
   **Open** shows the version instead of **Restore** copying it into a working schedule;
   there is no **delete** and no "Name current version … Save version" footer. Any version can
   be renamed (the desktop renames only unnamed auto-saves); names are 1 to 80 characters. A
   blue strip says which version is on screen and that it is read-only (_since 2026-10-20, ADR
   0013 choice 16: in camp words, "Imported · saved Oct 3, 2:00 PM · view only", without
   "Looking at a Version"_). **Open** in Versions
   switches to another version.
   On Manual Build (ADR 0008 §25) the same list's action is **Restore**, the desktop's word,
   because there it copies the version into the week being built; it also has **delete** and
   the "Name current version… · Save version" footer there. **Open** stays the Schedules
   page's look-only word (one word per idea, coordinator 2026-10-17).
4. **A version shows what was saved, not today's setup.** Each day stores the names of its
   time blocks, groups, and items as they were (as the data model has published rows copy
   names). Anything it points at that has been deleted since still shows under its saved name,
   marked "deleted since" (data model, Protecting history: lost references are shown, not
   hidden). _Changed 2026-10-20 (ADR 0010 §13): the mark reads "(removed)", as the desktop's._ Fixed and recurring activities are stored in the grid like anything else, so an
   imported or saved version keeps them even if the setup changes later; they are not worked
   out live from today's setup.
5. **Storage**, as the data model has it, with only what 4a needs:
   - `Schedule__c`, detail of `Program__c`: Name (text, the version's name), `Week__c`
     (required, restrict-delete), `Status__c` (Draft, Published, Version), `Origin__c`
     (Manual, Generated, Copied, Imported), `VersionReason__c` (Imported, Saved by hand; more
     values come with the screens that save versions), `SourceSchedule__c` (lookup to a
     schedule, cleared if that one is deleted). Status and origin are required by validation
     rules. A trigger refuses a week from another season.
   - `ScheduleDay__c`, detail of `Schedule__c`: `Date__c`, `Part__c` (from 1),
     `Grid__c` (long text, 131,072), `GridFormatVersion__c`, `Revision__c`. Auto-numbered
     (`SD-000000`), not reportable or searchable (the grid is not meant for reports).
   - `PublishedAt__c`, `PublishedBy__c`, `PublishKey__c` came with Publish (ADR 0008 part 5).
   - Not built yet: the engine fields,
     `Assignments__c`, `RainyDay__c`, `ScheduleEntry__c`, `Assignment__c`.
6. **The compact grid format, version 1** (`ScheduleGrid`, checked by `ScheduleGridRules` and `ScheduleGridFrameRules`).
   JSON with four lists, written in a fixed order so the same day always gives the same text:

   ```json
   {"b":[["<time block id>","Period 1","09:00","09:45"], ...],
    "g":[["<group id>","Bunk 1"], ...],
    "i":[["A","<activity id>","Swim"],["F","<fixed activity id>","Lunch"],["T","","Zoo trip"], ...],
    "r":["1,^,2", ",3,2", ...]}
   ```

   - `b`: the day's time blocks, in order: id, name, start and end ("HH:mm").
   - `g`: groups, in order: id, name.
   - `i`: what is placed: kind, id, name. Kinds: `A` activity, `F` fixed activity, `R`
     recurring activity (each needs an id); `E` elective, `D` special day, `S` special event,
     `T` trip (not set up in Shoresh yet: no id, the name as it appeared in the file).
   - `r`: one row per group (in `g`'s order), one cell per time block (in `b`'s order),
     separated by commas. A cell is empty (nothing placed), a number (an item in `i`, from 1),
     or `^` (the item above carries on into this block: how a two-block activity is stored).
   - Refused, on save and on read: rows not matching groups, cells not matching blocks, a
     number not in `i` (digits 0 to 9 only), `^` in the first block or under an empty cell, an
     unknown kind, a set-up kind without an id, an item, time block, or group without a name,
     a time block or group without an id, a time not written "HH:mm". A day that cannot be read shows "This
     day could not be read: …" in its place, never half a grid.
   - Why this shape: the import (4b) writes it directly (its items are what the file names,
     sorted fixed, then recurring, then activities, with the rest noted as not set up yet); a
     later Manual Build edits cells by changing one token; new needs (locks, locations per
     cell, gap reasons) come as a format version 2, which `GridFormatVersion__c` lets old and
     new days live side by side. A day saved by a newer format shows "saved by a newer version
     of Shoresh" rather than guessing. Version 2 (ADR 0010 §32) adds the
     locks.

7. **Size, tested** (data model requirement before release): a day of 100 groups × 14 time
   blocks, every cell filled with three-digit item numbers, 150 items with long names, is
   **16,760 characters** (13% of one record), written and read back unchanged in about 0.1 s
   of server time (test org, 2026-10-16; also `ScheduleGridTest`). The sample week (6 groups,
   7 blocks) is about 900 characters a day.
8. **Parts**: a day over 100,000 characters is split into parts of whole groups, in group
   order, each repeating `b` and `i` (`ScheduleGridParts`); parts are joined in part order and
   must have the same time blocks and items. One group too long for a part is refused.
9. **Revisions** (`ScheduleDaySaves.write`): a save locks its schedule until it ends, so two
   saves of one schedule (even of a day with no records yet) run one after the other. It names
   the revision each day was opened at (none for a new day), and may name each day once. If any day was saved since, or a "new" day already exists, the whole save is
   refused ("Someone else changed this schedule since you opened it…") and nothing is
   written. Every part of a day has the same revision, which goes up by one per save. A save
   across several days and parts writes all or none, in user mode. Nothing on screen saves
   grids in 4a; the import and Manual Build will.
10. **Deletes** (data model, Protecting history; desktop `DeleteWeekDialog`):
    - deleting a **week** on the Shoresh screens deletes its drafts and versions with it; the
      confirmation says how many ("That includes 2 saved versions."). Salesforce's own
      Delete button is refused by the restrict-delete lookup, as elsewhere;
    - deleting a **program** takes its schedules with it (master-detail); its confirmation
      says so the same way;
    - deleting a **season** clears its schedules first in its before-delete trigger (they
      point at its weeks through a restrict-delete lookup, platform check (a));
    - a week, program, or season with a **published** schedule is refused with the existing
      "kept as history" message. `PublishedHistory` now looks for schedules with Status
      Published (replacing slice 1's stand-in), and since Publish (ADR 0008 part 5) also at
      `PublishedAt__c`, so a schedule published once and replaced since still counts.
    - Copy season does not copy schedules (they belong to dated weeks).
11. **A sample version for trying it** (`scripts/make-sample-version.sh`, anonymous Apex in
    `scripts/apex/sample-version.apex`, not part of the app): sets up an invented camp ("Sample
    Camp (made up)": one week, six bunks, seven blocks, five activities, a fixed and two
    recurring activities) and saves a version "Imported from sample-week.xlsx (made up)"
    through `ScheduleDaySaves.write`, placing fixed and recurring activities where slice 3b's
    `SetTimePlan` says they fall, plus an elective, a trip, a special day, and a special event
    as "not set up yet", and activities in the rest. Synthetic data only.
12. **Screens read in user mode**: `SchedulesController` (versions, open, rename), with the
    Shoresh Scheduler permission set granting the new objects, fields, and class.

13. **Export to Excel and Print** (2026-10-21, parity items 9 and 10 in wiki
    `projects/shoresh-sf-parity-gaps.md`). Desktop: `src/utils/exportSchedule.js`,
    `ExportChooserModal.jsx`, `ScheduleScreen.jsx` ("Versions and export"), Director Guide §10,
    ADR 2026-08-08-export-formula-injection-sanitizer.
    - **Where.** On the Schedules page, in the toolbar's end group with Versions ("Versions and
      export", as the desktop groups them), after one rail line: **Export to Excel** and
      **Print** as rail items (ADR 0015's `.shoresh-item`, with a glyph each), shown once a
      version is open and held while a version with no days is open. Not on Manual Build or
      Generated Schedule yet: their rails belong to the week editor's own PRs, and the Schedules
      page already opens every version of every week (a published one included, from Versions),
      so nothing is out of reach meanwhile.
    - **Which schedule.** The version on screen. The desktop asks "Export which?" every time
      because its button sits on a screen that can hold two schedules, and remembering would be
      the app picking a winner. Here the director has already picked by opening one, and the
      name on the strip above the grid says which, so there is nothing to ask and nothing is
      remembered.
    - **The Excel file** (`c/shoreshScheduleExport` `scheduleSheets`, saved by
      `c/shoreshDownload` with SheetJS): one sheet per day as the desktop's (the time block, then
      a column per group; a cell that runs several blocks is written in each, as the desktop
      writes a slot per block; nothing placed is an empty cell), then **All Groups** in camp words ("All Bunks"; the
      desktop's All Groups: group, day, time block, and what is there, with anything not an
      activity named by kind, "[Fixed activity] Lunch") and **All Activities** (where each
      activity runs: activity, day, time block, the groups there), so the file holds what Daily,
      Group and Activity View show. Headings and sheet names are in camp words; a block reads
      "Period 1 (9:00 AM – 9:45 AM)", or just its times when they are its name; "(removed)"
      marks what was deleted since. A day that can't be read is a sheet saying "Can't be shown"
      and is left out of the flat sheets. Every text cell goes through the formula guard.
      Column widths are the desktop's (`shoreshDownload` now takes them per sheet). The file is
      named "Week 1 - <version>.xlsx".
    - **Print** (`c/shoreshSchedulePrint`, static resource `ShoreshPrint`) follows the view on
      screen: Daily View prints a page per day, Group View a page per group, Activity View a page
      per activity that runs this week (none for one that doesn't). Each page is a plain
      black-on-white table, landscape, titled ("Monday, Jun 29", "Bunk 1"), with the week and the
      version's name, time blocks down the side and a long activity one cell over its blocks;
      Open cells are blank. The browser's own print opens (`window.print()`); its dialog chooses
      pages and printer. The printout is put on the page only while printing and taken away
      after (`afterprint`). Salesforce's header and the menu stay off the paper through
      `ShoreshPrint`, loaded once the first time Print is pressed (as ShoreshTable is): every
      rule is for paper only and only for a page with a printout on it (`body:has(.shoresh-print)`),
      so printing any other Salesforce page is unchanged. Without the style (refused or not
      loaded) it still prints, with the page around it.
    - Checked by `shoreshScheduleExport.test.js` (the sheets, the formula guard, the same file
      every time, the pages per view), `shoreshSchedulePrint.test.js` (the table, the page style
      reaching only a page with a printout), `shoreshSchedules.test.js` ("Export to Excel and
      Print") and `shoreshDownload.test.js` (column widths). Not yet checked in a real browser in
      the test org (the paper's look in Lightning).

## Choices that are hard to undo after release

- Object and field names: `Schedule__c` (`Program__c`, `Week__c`, `Status__c`, `Origin__c`,
  `VersionReason__c`, `SourceSchedule__c`) and `ScheduleDay__c` (`Schedule__c`, `Date__c`,
  `Part__c`, `Grid__c`, `GridFormatVersion__c`, `Revision__c`).
- `Schedule__c` is a detail of the program (uses the last master-detail level: Season →
  Program → Schedule → Schedule day); `ScheduleDay__c` a detail of the schedule.
- `Schedule__c.Week__c` is required and restrict-delete. `SourceSchedule__c` clears on delete
  (Salesforce allows no restrict on a self-lookup).
- `Schedule__c` Name is text (the version's name); `ScheduleDay__c` is auto-numbered.
- A day is keyed by `Date__c` (not a weekday), as the data model has it for rainy and special
  days. If a week's dates are moved after a version is saved, its days keep their old dates.
- Picklist values: Status (Draft, Published, Version), Origin (Manual, Generated, Copied,
  Imported), VersionReason (Imported, SavedByHand). Values can be added later; removing or
  renaming them is the hard part.
- Camp word `Trip` (a new `CampLabel__c.ModelTerm__c` value).
- Grid format version 1 as above: once versions exist in camps' orgs, Shoresh must read it
  forever.

## Settled with Greg (2026-10-16)

- Words kept: **Open** (an empty cell, the desktop's word), **not set up yet**, **deleted
  since**, **Trip** (added to the glossary and the camp words).
- The newest version opens by itself; the first draft waited for an **Open** button.
