# 0006: Import last year, build choices

Status: proposed (2026-10-16), slice 4b, part 1 of 2. Design source: wiki
`projects/shoresh-scheduling-sf` ("Slice 4 planning" rounds 1 and 2, Greg's 4b decisions of
2026-10-16), `projects/shoresh-desktop-import` (how the desktop imports),
`projects/shoresh-scheduling-data-model`, the glossary, and Shoresh desktop
(`src/ingest`, `src/screens/ImportScreen.jsx`, `src/screens/ReconciliationScreen.jsx`,
`src/components/reconciliation`), whose import code this adapts (Apache-2.0, see `NOTICE`).

**Part 1 (this):** reading the files, the review, and adding the season's setup.
**Part 2 (next PR):** the imported week saved as a version "Imported from <file name>",
placements that match nothing reported, electives/special days/trips noted in that version,
Undo last import, and remembered answers (`ImportAnswer__c`).

## Choices

1. **Files are read in the browser.** Excel (.xlsx, .xlsm, .xls) through **SheetJS Community
   Edition 0.20.3** (Apache-2.0), shipped unchanged as the static resource `SheetJS`
   (`xlsx.full.min.js` from the SheetJS CDN tarball
   `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, SHA-256
   `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`), loaded with
   `loadScript` only when an Excel file is chosen. The same version is a dev dependency, so
   tests read the same way. The full build is used (not "mini") because it reads old .xls files.
   0.20.3 has no known advisories (the two published ones were fixed in 0.19.3 and 0.20.2).
   **CSV is read by our own small reader** (quotes, commas and line breaks inside quotes,
   semicolon- and tab-separated files), so a cell like "9:00-9:45" or "6/30" is never turned
   into a date or number. The desktop's CSV path produced no pages at all; this one is tested.
   Code Analyzer skips static resources (`code-analyzer.yml`): the minified library is not our
   code. PDF is not read.
2. **The import engine is plain JavaScript** (`c/shoreshImportEngine`, no server calls), so
   the same files and answers always give the same proposal (determinism), and it is tested
   with Jest on made-up files. Adapted from the desktop: sheet to page and merged cells as
   blocks spanned (`sheetGrid.js`), the camp-day rule for times without AM/PM and ordering
   (`orderTimeBlocks.js`), passing-time rows of ten minutes or less (`periodSpan.js`), cell
   cleaning, division-in-title rules and day recognition (`extractEntities.js`,
   `scheduleShape.js`), the word-ending rule for similar names (`nearDuplicateNames.js`), the
   elective words, file-name group names (`sharedFilenamePrefix`). Rewritten for Greg's
   decisions: classification, similar names, matching existing setup, the questions. Nothing
   uses `crypto.randomUUID` (keys are built from names).
3. **Sheets.** A sheet may hold one schedule or several one under another (a row naming only a
   day, or a new heading row, starts the next). The time-block labels are the first column, or
   the first two when the times sit beside the names ("Period 1" | "9:00-9:45"). A row above
   the group headings with fewer cells (often merged) is read as the divisions over them.
   Sheets with something in them but no schedule are listed, not silently skipped.
4. **Three layouts** (Greg): **all camp** (a page per day, groups across), **by group** (a page
   per group, days across; the group's name from a title line, the sheet, or the file name,
   minus what all the files share, so "Camp 2026 - Bunk 1.csv" is "Bunk 1"), and **by
   activity** (a page per day, activities across, the groups doing each listed in its cell; or
   a page per activity with days across). Day columns are found as the desktop does. Telling
   groups from activities is new: camp group names, a row where several cells say the same
   thing (everyone at Lunch: only activities repeat across a row), cells listing several
   names (only groups do), and numbering. **The layout found is shown for every file and the
   director can change it** (the desktop only showed it). A week is read from "Week 2" in a
   title, sheet, or file name, so several weeks can be imported together.
5. **Cross-checking.** Every cell (group, week, day, time block) that two files describe
   differently becomes a question naming which file says what. Cells that agree are read once.
6. **Fixed, then recurring, then activities** (Greg's order and "suggest only when sure"):
   - **fixed, sure:** every group, the same time block and length, every day the program runs
     that week (a special day may be skipped), in every week the files cover, and nowhere else;
   - **recurring, sure:** every placement sits in set-time patterns (the same groups, slot, and
     days), each covering whole divisions or everyone, and either holding on most days or for
     most groups, or confirmed by a second week in the files; and nowhere else;
   - **activity:** a name with no set-time pattern (what every rotation looks like);
   - **asked** ("Is X at a set time, or an activity?"): everything else, in particular a name at
     a set time and also scattered elsewhere (never decided silently), one division at one
     time on one day of a single week, and a pattern that differs between weeks. The card
     describes the pattern ("Juniors at Period 4 on Wednesday") and offers only what fits.

   A set-time pattern is one held on more than half the days (the desktop's daily rule), by two
   thirds of the groups (its weekly rule), or by a whole division of two or more groups. A
   staggered lunch (Juniors at one block, Seniors at the next, every day) becomes two recurring
   activities named Lunch.

7. **Noted, not set up** (Greg): electives (the desktop's words, Chugim, Bechirot, Electives,
   and the camp's own word), trips (trip, outing, excursion, and the camp's word), special
   events (the camp's word), and special days (one name filling a whole day for most groups, or
   the camp's word). They are listed on the preview and in the summary, and are not created.
   Part 2 notes them in the imported version as "not set up yet".
8. **Similar names, always asked, never merged on their own** (Greg): capitals, spacing, and
   punctuation, "and" / "&" / "+"; endings (Swim / Swimming, including a doubled last letter);
   **one letter changed, added, dropped, or swapped** (Music / Musik). Numbers keep names apart
   (Lunch 1 / Lunch 2, Bunk 3A / Bunk 3B). Raised among the file's names and against the camp's
   (activity, fixed, recurring, and group names); a name the camp already has is asked about as
   the camp's ("Same: use Music" / "Different: add Musik"). Asked on the first screen, as the
   desktop does, because the answers change everything after.
9. **Existing setup: add only, matched by name** (Greg). Programs by their groups (or the
   camp's only program; otherwise asked); time blocks by their times (one overlapping at
   different times is asked: keep, change to the file's times, or leave out); divisions and
   groups by name; activities, fixed and recurring activities by name, keeping the kind they
   have. Where the file disagrees, the director is asked: a program's missing days, a time
   block's times, a fixed or recurring activity's time block, length, or days, an activity's
   length. A group set up in another division than the file shows can only be kept where it is
   (or left out): Salesforce does not move a group to another division. Nothing set up is ever
   changed without the director choosing "Change". Not compared (the file is one sample week, and
   these are the director's rules): times a week, groups at once, who can do it, who a
   recurring activity covers, locations.
   Also (from the independent review): two timetables never share one program on their own
   (their time blocks differ), so the second is asked about; a camp block that two of the
   file's blocks fall in can only be kept or left out (one set of times cannot fit both); a
   group the camp has in another program than the one its schedule goes to is left out and
   said so; "Juniors only" (or everyone) is written by group when the camp's division (or
   program) has groups the file does not show; a time block whose times change keeps its
   name and part of day; a name that is an activity in one program and set-time in another
   is set up as each, and said so.
10. **What new records take from the file.** Time blocks: name and times (an end not written is
    taken from the next block; the last one is as long as the others, and the summary says so;
    a block with no times at all is left out and said). Programs: the days the file shows.
    Groups: all day. Activities: length (the one it has most often; the summary says if it
    varies), times a week (fewest and most per group, counting none for a group that could have
    and did not), groups at once (most at the same time), who can do it (whole divisions, only
    when every group in them did it and no other group did), and the place when the file names
    one place for it. **Outdoors, rain plans, and priority are not asked** (Greg, 2026-10-16:
    "do not ask during import"): new activities start without them (priority keeps its default,
    Low), and the summary says where to set them. Places named in cells ("Swim (Pool)",
    "Art @ Art room") are offered with a tick, unticked, as on the desktop; a ticked one fits as
    many groups as the file has there at once, so it never causes a clash on its own.
11. **Every question must be answered before saving, and every question can be answered
    "Leave it out for now"** (Greg, 2026-10-16). That item is not added, the summary lists it
    under "Left out for now", and the next import asks again (part 2 remembers the other
    answers). The desktop instead let a director save with questions open ("keep N for later");
    without stored open questions that would mean a silent drop.
12. **Saving.** `ImportController.saveSetup(plan)` takes the reviewed plan (JSON: programs, time
    blocks, divisions, groups, locations, activities with who, fixed activities, recurring
    activities with who, in that order). New records refer to each other by keys the screen
    builds; existing ones by Id, and **an Id is refused unless it belongs to the season being
    imported into** (`ImportKeys`). Everything is written in user mode, one list per kind, all
    or none, with the fixed/recurring clash check deferred to the end like a screen save
    (`SetTimeGuard`); a clash refuses the whole import with the usual message. A 40-group,
    14-block, 60-activity camp saves in one go well inside Salesforce's limits (Apex test).
13. **Screens follow the desktop.** Roots' **Import last year** opens the import screen (it is
    reached from Roots, not the menu). Steps: a drop area ("Drop schedule here", **Choose
    files**, ".xlsx · .xls · .csv — several at once"); the preview, "Found in the file. Nothing
    added yet.", with each file's layout, similar names, places to tick, read-only chips by kind
    (tagged new, already set up, changes, left out, noted), and "Good to know" notes; then the
    review, "Reconciling <files>" with "X of Y questions answered" and cards (set-time and
    disagreement questions first with an amber edge, as the desktop's hold lane; answered cards
    fold to "✓ answer" with **Change**); **Use this setup**; then the summary (added, changed as
    chosen, left out for now, not set up yet, good to know) and **Continue** to Roots.

## Differences from the desktop (proposed, not settled)

- **Not built:** the review's four tiles (Understood, Needs attention, Changed, Not in source)
  and its reveal animation; the question cards are one list in the desktop's lane order.
  Proposed for later polish with Greg, with a mockup, if he wants them.
- **Layout can be changed per file** (the desktop only displayed it).
- **No per-group division dropdown on the preview**: divisions come from the file, and a group
  whose division the file does not give is a question card (only when the program already has
  divisions; otherwise the groups go into one division, Main, to rename later).
- **Undo, the imported version, remembered answers:** part 2.

## Choices that are hard to undo after release

- The static resource name `SheetJS` and the Apex class `ImportController` (`saveSetup`) are
  part of the package's surface once released. No new objects or fields in part 1.
