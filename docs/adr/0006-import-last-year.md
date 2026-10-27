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
   _Electives are set up since electives slice E9 (choice 23); trips, special events and special
   days are still noted._
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
   (or left out): Shoresh does not currently allow moving a group between divisions
   (`Group__c.Division__c` is set as not reparentable, our setting; whether to allow it is
   with Greg). Nothing set up is ever
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
    _Redrawn in the design system (2026-10-23, wiki decision 56, ADR 0015 choice 15): the
    preview and the review are now one page, and the summary is the same page after Add. Every
    question, answer, refusal and save above is unchanged; see choice 22._

14. **Fixes after PR #15's review, and Greg's answers (2026-10-16), in a follow-up PR:**
    - **A group is its division and its name.** "Bunk 1" in Juniors and "Bunk 1" in Seniors are
      two groups (shown as "Bunk 1 (Juniors)" where a name is used in several divisions), in
      everything the import does: placements, cross-checks, set-time patterns, the version. A
      file that names such a group without its division asks "Which Bunk 1 is in <file>?". A
      division taken only from a file's name ("Camp 2026 - Bunk 3") is a hint, overruled by a
      division any page states.
    - **Who can do an activity is written out unless the files cover every group in the
      season**: whole divisions where the groups cover them, the groups by name otherwise. An
      empty list (everyone) would otherwise reach groups of other programs, or ones the files do
      not show.
    - **The same files give the same result in any order** (files sorted by name, then sheet
      order).
    - **Times**: ranges of bare hours ("9-10", "12-1") are read; a 5 or 6 o'clock block without
      AM or PM is asked about (item 15).
    - **Divisions and programs are chosen on the preview** (Greg: the desktop's dropdown per
      group). Every new group shows its division: the file's preselected; none preselected when
      the file is silent and the program has divisions (the import waits); Main only for a
      program with no divisions and a file naming none, shown and changeable. Each set of groups
      shows its program the same way (preselected when sure, including a camp's only program).
    - **Moving a group between divisions is allowed** (Greg). `Group__c.Division__c` is now
      reparentable (master-detail). A group the camp has in another division than the file
      shows gets a card: **Move**, **Keep it in <division>**, **Add a new <group> to
      <division>**, or **Leave it out for now**; it says which activities and recurring
      activities name either division in who they are for, so nothing shifts unseen. A group can
      move only within its own program (`GroupMoves`, refused otherwise), and a move re-runs the
      fixed and recurring clash check. Moving a group on the Groups screen is a separate small PR
      after part 2.

15. **After PR #16's two reviews (2026-10-16):**
    - A group is its **program**, division, and name: the same division and name in two
      programs ("Juniors: Bunk 1" in each) are two groups, shown with their schedule's number
      ("Bunk 1 (schedule 2)"); the camp's groups are matched within the program.
    - Who-lists are worked out by division record, never by division name (two programs may
      each have a "Main" or a "Juniors").
    - "Keep it in <division>" is offered only for a group in the same program; a group of
      another program can only be added anew or left out.
    - The move card leaves out activities that also name the group itself, and says it plainly
      ("If it moves, Bunk 3 is no longer in Library (for Juniors) and is now in Boating (for
      Seniors).").
    - A division that already has a group of that name is not offered in that group's
      dropdown, so the dropdown cannot quietly make a duplicate.
    - A block written without AM or PM at 5 or 6 o'clock ("6:00-6:30") is never guessed: the
      preview asks "Is Late pickup 6:00–6:30 in the morning or the evening?" (morning, evening,
      or leave it out; until answered it reads as evening). "Grades 3-5", "Ages 6-8", "Periods
      1-2", "Period 1-2" are not times.
    - The division dropdown hides only divisions of the same program that already have a group
      of that name.
    - Bare hours from 7 to 11 are always morning and 12 to 4 afternoon: Shoresh is for day camps
      only (decision 0001), so "7:30-8:30 Evening program" reads as morning. Only 5 and 6
      o'clock are asked about. Answering "morning" can make two pages' versions of a block the
      same ("6:00 AM-6:30 AM" and "6:00-6:30"): they are then one block. Until it is answered, a bare
      time is never merged with a stated one ("6:00 PM-6:30 PM"); the block kept is the one
      whose label states AM or PM. The question is per
      time and what the block holds, so two programs' rows are asked about separately.
    - A division read only from a lone file's whole name ("Juniors - Bunk 1.csv") is offered in
      that group's dropdown but never preselected (nor is Main over it), unless it matches a
      division the camp has or a page states. A program with no divisions can always choose Main (not
      preselected when a file name suggests another).
    - Two files with the same name are ordered by what is in them; "Use this setup" also waits
      for the preview's choices; `GroupMoves` reads camp words once per camp.
16. **Deferred by Greg (2026-10-16)** to the Groups-screen move PR and Manual Build: a group
    moved on Salesforce's own record page changes who it is eligible for with no card (the
    clash check still runs); and schedules already built may show a moved group in an activity
    it is no longer eligible for, with nothing pointing it out.
    - **Schedules already built (2026-10-22, Groups screen).** The schedules mark such a cell
      "Not set up for <group>" (ADR 0008). Before the move is saved, the Groups screen's "What
      changes" note also says what the group's schedules keep: _Its schedules keep Swim (4
      cells), marked "Not set up for Bunk 3"._ It counts the group's cells, in its program's
      Manual Build and Generated Schedule drafts, of each activity the move takes it out of
      (`GroupPlacements`, asked once per group the first time a move would take it out of an
      activity; user mode; days read 25 at a time, with a query cap, past which the note adds
      _Not every schedule could be read._, and _Its schedules could not be checked._ if the
      question fails). Nothing in a schedule changes: the director decides, on the schedule,
      what to do with each cell. Saved versions and published schedules are not counted; they
      are history and keep what they said. Recurring activities the group leaves or joins are
      named in the same note and show as setup changes on the schedule (ADR 0008 part 6).
      The desktop moves a group with no note at all (GroupsScreen.jsx: the age division is a
      plain field of the row); the note is Shoresh's "never shift unseen" rule.
    - A group moved on Salesforce's own record page still gets no note (unchanged).

## Part 2: the imported version, Undo last import, remembered answers

17. **Last year's week is saved as a version** (Greg, 2026-10-16), in the same all-or-none save:
    one `Schedule__c` per program and week in the files (Status Version, Origin Imported,
    VersionReason Imported), named **"Imported from <file>"** (or "<file> and N more"; at most
    80 characters), with a `ScheduleDay__c` per day the program runs, in grid format v1 (ADR
    0005). The screen builds each grid with the keys of the records it names; the server puts in
    their Ids once everything else is saved (`ImportVersionWrites`), so a version always points
    at the records this import created or matched. It is not changed by later edits (ADR 0005).
    - **Which week**: a week the files name ("Week 2" in a title, sheet, or file name) goes to
      the season's week of that name; one week in the files and one in the season match;
      otherwise the review asks "Which week is last year's schedule?" (by name; "Leave it out"
      keeps the setup without a version). A season with no weeks keeps no version, and "Good to
      know" says to add weeks first. (Replaced 2026-10-17, desktop-parity cleanup, following Greg's
      rule that an import adds what's missing: a season with no weeks gets them from its dates in
      the same save, as "Fill in weeks" makes them, and the week question names each by its start
      date; Undo removes them. Only a season whose dates give no weekdays still keeps no version.)
    - **Cells**: a fixed, recurring, or activity item set up (or matched) by the import, by its
      record; an elective, special day, special event, or trip as written, with no record (shown
      as "not set up yet" on the schedule page, ADR 0005); a two-block placement as `^` below it.
    - **Placements that cannot be placed are listed, never dropped** (Greg): on Saturday or
      Sunday, a group, time block, program, or name left out, a day the program does not run, a
      week not chosen or missing, a day the season's week does not have, or two things in one
      cell. The summary lists them by name, with how many, why, and up to three examples.
18. **Undo last import** (Greg): on the import summary ("Undo this import") and on Roots ("Last
    import: <files>, <when>" with **Undo last import**, as on the desktop), confirmed first
    ("Undo the import of <files>?" / "What this import added is removed, and what it changed
    goes back to how it was. Anything you have edited since the import stays as it is.").
    - Each import is recorded in `Import__c` (detail of the season): its files, every record it
      created with the values it wrote, and every record it changed with the values before and
      after (`ImportWriter`, `ImportUndoLog`).
    - Undo (`ImportUndo`) removes what the import created, children first, and puts back what it
      changed, but **keeps anything edited since** (a field no longer holds what the import
      wrote) **or still in use** (something not made by the import is inside it, or Salesforce
      refuses the delete because something points at it), and names them: "Import undone.
      Removed 31 things it added. Kept, because they were changed since: Swim. Kept, because
      something else still uses them: Bunk 1, Juniors, Main." The version goes too, unless it was
      renamed. Comparing values, not dates, keeps this exact (and testable).
    - A record the import changed that was deleted since is named ("Not put back, because they
      were deleted since: Period 2.").
    - **Any other refusal stops the whole Undo** (PR 17 review): only "something still points at
      it" counts as in use. A rule, trigger, or permission refusal rolls everything back and says
      which record and why ("Nothing was undone. Swim: couldn't put back what it was before.
      <reason>"), and the import stays undoable, so the director can fix it and try again.
      Rolling back was chosen over a partial Undo because "nothing changed" is simpler to explain.
    - **Undo goes back one import only** (Greg, 2026-10-17): it is offered only for the season's
      most recent import (imports in the same second go by their number), and only once. After
      that import is undone, no earlier import can be undone and Roots offers no Undo, until the
      next import, whose Undo it then offers. The clash check runs at the end, and a clash undoes
      the Undo.
    - **A program with published schedules is kept**, not refused: a published schedule is inside
      its program, so the "something inside it" check keeps the program as in use before any
      delete is tried, and history protection never sees it. The same holds when the imported
      version itself was published since: it is kept as changed, and its program as in use.
    - **Imports and Undos in one season take turns:** both lock the season row first
      (`ImportUndo.lockSeason`, `FOR UPDATE`), and Undo re-reads the import and "last" under the
      lock, so two Undos, or an Undo and an import saving, can't interleave.
19. **Remembered answers** (Greg: exact answers per camp, pattern learning later):
    `ImportAnswer__c` (detail of the camp) holds each question's key and answer. Keys and
    answers are names and choices, never record Ids (the program question is answered by the
    program's name), so they still work after a season is copied. The save remembers every answer
    given and forgets any answered "Leave it out for now" (the next import asks again). The next
    import fills in remembered answers; their cards (and ticked places) show "remembered" and can
    be changed (since ADR 0021 choice 9 with who and when: "Remembered from your answer on 3 Jul";
    a different answer replaces the record, so its Created By and date stay true). One
    answer per camp and question (`Key__c`, unique: the camp and a SHA-256 digest of the key; the
    full key is in `QuestionKey__c`).

20. **Things you delete stay deleted** (Greg, build log decision 45, 2026-10-21; desktop Director
    Guide §2 "Things you delete stay deleted", `electron/ops/ingest.js` `rejectedSlotKeys` and
    `fieldProvenance.js` `isHumanDeleted`). A setup item a director deletes on a setup screen
    (`SeasonSetupController.deleteRecord`) is remembered for the camp, with the answers above:
    `SetupDeletions` writes `ImportAnswer__c` with the key
    `deleted|<kind>|<program>|<name>` answered `deleted`, in the same all-or-none step as the
    delete (a refused delete remembers nothing). Kinds are the import's own words: Activity,
    Location, LocationType and Program (season items, no program), and Division, Group,
    TimeBlock, FixedActivity and RecurringActivity (named with their program). Keys are names,
    never Ids, so a deletion holds in next year's season too.
    - **Only a director's delete counts**, as on the desktop (a delete with source "human"):
      Undo last import, a season's delete (and what goes with it), and "Same location?" merges
      remember nothing. Weeks and seasons are not remembered: weeks follow the season's dates.
    - **Something the camp has wins**, as the desktop's "live wins over tombstone": a name set
      up again by hand is matched as usual. Only an item an import would add is left out.
    - **Import last year** (`c/shoreshImportEngine`, `deleted.js`) leaves out a deleted
      activity (any of activity, fixed or recurring of that name, for its program), group, new
      time block, or place, without asking its questions (its kind, its division); placements
      in it are listed as not in last year's version, "deleted before; not brought back" (or
      "its group / time block was deleted before; not brought back"). A place deleted before is
      not offered, even with its tick remembered.
    - **Import a list and the camp workbook** (`c/shoreshLists`) mark such a row `deleted`
      instead of `new`. A place or kind of place a row names is not added with the list: the
      row is saved without it, as if the file said nothing about its place (an item the camp
      has keeps the place it has), as Import last year saves a placement without a place it
      no longer offers (review of #101: the rows used to wait, which held up the whole save
      until the director undid their own delete). The rest of the list saves; the summary
      says "<row> · no location" (or "unchanged location").
    - **Shown, never silent**: both screens list them under "Deleted before; not brought back",
      each with **Bring back** (one click). _(Import last year since choice 22: on its one page
      they sit with what is not set up yet, "Deleted before: Riflery" and Bring back; the page
      after Add still lists them under "Deleted before; not brought back".)_ Bring back answers the key `back`: the item is then
      added like any other, and the save forgets the deletion (`forget`). The summary of Import
      last year lists what stayed out.
    - Names compare as similar names do (`foldName`: case, spaces and punctuation ignored).
    - **A deleted program stays deleted with all it had** (review of #101). Its divisions,
      groups and time blocks go with it, and Import last year makes up a new program's name
      ("Program 2"), so the program's own key alone could never match. Its groups are
      remembered with it, as `deleted|ProgramGroup|<program>|<group>` (the same delete step,
      one query for the groups). Last year's timetable whose groups match one of them (any
      group; the most, then by name), when no program the camp has holds any of its groups and
      none has its name, is that program: left out whole, without asking which program, listed
      under "Deleted before; not brought back", its placements "its program was deleted
      before; not brought back". Brought back, it is added again under its own name, and the
      save forgets it and its remembered groups.
    - **Import a list** leaves out the rows naming a deleted program (not asked which days),
      division, or time block (not asked when it is), each "its <kind> was deleted before; not
      brought back", and lists the program, division or time block with Bring back; brought
      back, it is asked about and added as any new one, and the save forgets it.
    - **Bring back keeps the cursor on the way** (WCAG 2.4.3): the button goes with the item,
      so the cursor moves to the question it opened on that screen (its division, a new
      program's days, a time block's times), else the next Bring back still listed (else the
      one before it), else the step's main button (Add on Import last year since choice 22, while
      it can be pressed, else the screen's heading; Save on a list).
    - **A deleted division's groups go with it**: each is remembered as a deleted group of its
      program (`deleted|Group|<program>|<group>`), so Import last year and Import a list leave
      it out and list it, as a group deleted by itself.
    - Not covered: a name in a "who" list added as a group or division (asked of the director
      each time, never silently).

21. **Rules Shoresh guessed are marked for a look** (Greg, build log decision 45, 2026-10-21: "yes
    to shoresh rules being guessed at"; desktop `src/utils/ruleProvenance.js`,
    `ActivitiesScreen.jsx` RuleProvenanceDot, `LocationsScreen.jsx` CapacityProvenanceDot,
    `GroupsScreen.jsx` DivisionProvenanceDot, ADR 2026-08-09 activity-rule hand-edit
    provenance). Until now what the import worked out was shown only in the review (item 10).
    - **What counts as guessed** is what the desktop marks "inferred": a new activity's times a
      week and who can do it; a new place's groups that fit ("Shoresh set a few capacities from
      your old schedule"); and a new group's division when only its file's name gave it (item
      15: a file-name hint matching a division the camp has or a page states, left as
      preselected). The desktop's "observed" values are read outright and carry no mark: an
      activity's place and groups at once, and a division a page states. A choice the director
      made on the preview (a division picked, even the one suggested) is theirs. Main for a
      program with no divisions is not a guess about the group, so it is not marked (the desktop
      has no division then). Nothing an import matches or changes is marked; only what it adds.
    - **Stored with the import answers.** The plan names them (`guessed`: kind, key, fields;
      `c/shoreshImportEngine` plan.js), and the save (`SetupGuesses`, `SetupGuessRecords`, with keys and values in `SetupGuessValues`; same all-or-none step)
      remembers each in `ImportAnswer__c` with the key
      `guessed|<season Id>|<kind>|<program, for a group>|<name>|<field>` (fields `often`, `who`, `fits`,
      `division`) answered with the value saved: "2-3" (or "2-none" for no weekly maximum),
      who as each division or group by program and name in order ("everyone" when empty; a list
      longer than an answer holds as its SHA-256 digest), the number that fits, the division's
      name. Names, as every remembered answer, except the season: a guess belongs to the season
      it was made in, by Id, so a camp that imports into two seasons keeps each one's marks (a
      second import guessing differently, or Looks right in one season, never clears the other's,
      and a guess looked at stays looked at), and a season renamed keeps its marks.
    - **Shown on the setup screens** (`SeasonSetupReader` guesses via `SetupGuessStanding`, one query: the camp's
      answers): a guess stands while the record still holds the value saved and was there when
      it was guessed. So **a change anywhere clears it** (this screen, Salesforce's record page,
      a list import), as the desktop's "the last write was the director's", with no hook in each
      save path; and an item set up again later by hand with the same name (after Undo last
      import, a delete, or in a copied season) is the director's, not marked. A value set back
      by hand to exactly what was guessed shows the mark again (the desktop would keep it
      confirmed); comparing values keeps this exact and testable, as Undo does (item 18).
    - **The mark is the design system's needs-a-look corner** (ADR 0015 choice 6; the desktop's
      one bronze dot, owner ruling 2026-10-09: one visible state) in the top right corner of the
      guessed cell: Activities' How often and Who, Locations' groups that fit, and a bunk's name
      for its unit (its unit is the section it sits in). It is a button (`c/shoreshGuessMark`),
      named for whose it is ("How often for Swim: guessed from your file"; "Bunk 1: Juniors
      guessed from the file name", which is why the bunk is in its unit). Pressed, a one-line pop
      beside it says "Guessed from your file" (or the unit's reason) and offers **Looks right**,
      the desktop's Confirm, with the cursor on it; Escape or leaving closes it, Escape putting
      the cursor back on the mark. Looks right forgets that one guess
      (`SetupGuessesController.confirmGuess`, `SetupGuessConfirm`, two queries) and the season is read again; the
      cursor goes to that cell's field (else the row's first) and "<name>: looks right" is said.
      The desktop's per-row popover listing every field, its tier words and "why" sentences
      are not shown: one mark per guessed cell says which value it is, with fewer words.
    - Checked by `guessed.test.js` (what the plan names), `shoreshGuessMark.test.js`,
      `shoreshEditableTable.test.js` and `shoreshCampSetup.test.js` ("rules Shoresh guessed"),
      `SetupGuessesTest` (stored with the values saved, shown, cleared by a change anywhere,
      Looks right, refused fields, a record made later, two seasons of one camp, query bounds), the large camp in
      `ImportSetupSavesTest` (60 activities' guesses inside the same bounds), and in the test org
      by `scripts/a11y-browser-check.mjs` (the mark reached by Tab, opened, Escape, Looks right
      said and the cursor kept).

22. **One page, in the design system** (Greg, wiki decision 56, 2026-10-23: the approved
    mock-ups `design-research/screens-r1` import-pick, import-review-a, chosen over one question
    at a time, and import-done; ADR 0015 choice 15 has the look). Every behaviour above stays:
    the questions and their answers (including Leave it out for now), remembered answers,
    guessed marks (choice 21), things deleted stay deleted with Bring back (choice 20), the
    version, the all-or-none save and Undo. What moves:
    - **Three states, one screen.** The drop well ("Drop last year's files", **Choose files**,
      ".xlsx · .xls · .csv", several files at once as before); then **one page** where the
      preview and the review were two steps; then the same page after the save. The rail
      holds **‹ Roots** (named "Back to Roots"), the screen's name (its heading), the first
      file's name and "+ N" for the rest, and on the right **Start again** and the main
      button, or after the save **Undo this import** and **Done** (back to Roots).
    - **Check these first** comes first: every question, the preview's and the review's, one
      raised row each in the engine's order (similar names first, then the held questions,
      then the rest), with the needs-a-look corner until it is answered. The answers sit in
      the row as a set: the one chosen is pressed and raised (`aria-pressed`), and choosing
      another changes it, so the old "✓ answer" fold and **Change** are gone. An answer's
      reason (the old line under each button) is its tooltip and is read with its name. A
      row answered from memory says **Remembered** (the separate "N answers remembered" line
      is gone). The program and division a file needs are dropdowns in their rows; one
      Shoresh could choose itself (preselected) is not a question and is listed lower, under
      the old headings ("Programs for these bunks", "Unit for each new bunk"), still
      changeable.
    - **Comes in**: quiet counts, one tile per kind the save will add (bunks, units, time
      blocks, activities, places, fixed and recurring activities, programs, weeks filled in
      from the season's dates), counted from the plan the save would send (records with no
      Id). Each tile opens into its names under the tiles (`aria-expanded`), and closes again
      (Greg took the recommendation: counts, each opening into its names). The read-only
      chips of everything found, "already set up" included, are gone from the page: only what
      is added is counted, and what changes is a question in Check these first.
    - **The main button says what happens**: "Add 26" (the tiles' total) once every question
      is answered; "N questions left", not pressable, until then; "Use this setup" when
      nothing new is added (a version only, or answers only).
    - **Last year's schedule**: each version as a row with a small picture of its first day
      (a column per group, a row per time block, at most eight each; set-time cells in the
      primary, activities as wells, special days, events, electives and trips dashed;
      decoration only, hidden from screen readers) beside its week (and program) and "Kept as
      a version, Imported from <file>". The week itself is still chosen by its question.
    - **Not set up yet**: the noted items as dashed chips, and things deleted before as
      "Deleted before: <name> · <kind>" with **Bring back**. **Files**: each file's pages and
      its layout dropdown; a file read without confidence carries the corner until the
      director picks its layout. **Good to know** last.
    - **After Add**: **Added N** as tiles from the save's own counts (the version is not a
      tile), **Changed, as you chose** as tiles, **Last year's schedule** with "Open it on
      Schedules" as words (the mock-up's "Open in Manual Build" link is not built: the import
      screen cannot open another screen, and a version is looked at on Schedules, ADR 0005),
      the placements not in the version, left out for now, deleted before, not set up yet,
      and good to know. Undo is on the rail, confirmed as before; once undone, its message
      shows at the top and the cursor goes to **Done**.
    - **The cursor** (WCAG 2.4.3): opening the screen puts it on the heading (unchanged);
      files read, on the first open question's first answer, else Add; an answer keeps it
      on the answer pressed (or, if the answer took its row away, the next open question);
      Bring back as choice 20 says; Add, on the "Added" heading; Start again, the heading.
    - Checked by `shoreshImport.test.js` (the drop well and its rail; one page with the
      questions first and their corners; an answer pressed and changed; Comes in counts and
      their names; Add's words; the preselected dropdowns listed lower; the cursor; axe on
      each state) and, in the test org, by `scripts/a11y-browser-check.mjs` (Import last
      year from Roots by keyboard: heading, files chosen, the first question, a choice kept
      pressed, a count opened, Start again and back to Roots, axe; nothing imported).

23. **Electives in last year's file** (electives slice E9; wiki plan
    `shoresh-sf-electives-plan` §6.1; desktop ADR `2026-10-11-import-electives-keep-their-shape`
    (D1-B, D2, D3-C, the precedence, re-import), Director Guide §6 "Double-period electives" and
    `electron/ops/materializeImportedVersion.js` `writeSpanBundles`; ADR 0018 choices 45 to 50
    for what is saved). Until now an elective was noted "not set up yet" (choice 7) and its cell
    stayed a dashed placeholder. Now (`c/shoreshImportEngine` `electives.js`):
    - **An elective word in a cell is an elective set, without a question**: Chugim, Bechirot,
      Electives, or the camp's own word for an elective set (Camp words). It is said, not asked:
      the page lists each set under the camp's word for elective sets, "Read as electives:
      Tuesday, Period 3, every bunk.", with what it adds ("3 choices proposed: …", "Each choice
      taken as a set across Period 1 and Period 2 on Thursday.", or "No choices in the file: add
      them later."), and the one escape, **Not electives**, beside **Electives** (pressed), as
      the program and unit choices Shoresh makes itself are listed (choice 22). Not electives is
      per set and remembered; the name then goes the usual way (fixed, recurring, activity, or
      asked).
    - **A list cell** ("Hiking, Fishing, Kayaking") is a set of those choices only under the
      desktop's strict rule: a comma, semicolon or spaced slash; three parts or more; none empty;
      none with "&" or "and"; none longer than four words. Its set is named after its choices,
      sorted, once each ("Electives (Fishing, Hiking, Kayaking)", or with the camp's word), so the
      same list in any order is one set. Anything else list-like (two parts, an unspaced slash as
      in "Arts/Crafts", an "&") is **one question** in Check these first: 'Is "Arts/Crafts" one
      activity or a choice of Arts or Crafts?' (One activity, A choice of 2, Leave it out for
      now). As every question here, it must be answered (choice 11; the desktop defaults to one
      activity); until then nothing else is asked about that name.
    - **What the camp has wins** (the desktop's precedence): a name the camp has as an activity,
      or as a fixed or recurring activity of that program, is never read as an elective. A set the
      camp has of that name (spaces and capitals aside) is used, and only the choices it doesn't
      offer yet are added.
    - **The cells**: the version holds the set by its record (kind `E` with the set's key, ADR
      0018 choice 20) in every time block it fills, a double period too (each block on its own,
      ADR 0018 choice 21; never `^`), so bunks side by side show it as one wide cell (#128).
    - **Choices** are proposed offerings (ADR 0018 choice 45). A choice the camp or the file has
      as an activity is that activity; otherwise it is added as an activity: one block long, one
      bunk at a time, 0 times a week (what the file shows: it is never placed as an activity of
      its own), who held the set as who can do it (the rule of choice 14), with its how often and
      who marked as guessed (choice 21).
    - **Double periods** (Director Guide §6): the same set held by a bunk in back-to-back periods
      (the next block starts when the last ends, or within ten minutes of passing time, choice 2;
      lunch or anything between keeps them apart) links each choice the import adds across them:
      a linked choice per choice and day, applying to all divisions. If the bunks holding it that
      day hold it across different periods it can't be linked, and Good to know says so
      ("Chugim on Thursday: different bunks hold it across different time blocks, so Shoresh
      can't link them. Each period is chosen separately."). A choice added later is not linked.
      Linked choices are named as the Electives screen names them (ADR 0018 choice 41): an
      offering's first one is the activity's name, so a choices sheet's plain "Pottery" chooses
      it; a later one "Pottery · Thu 9:00". The desktop's import names them "Pottery — Tuesday";
      this was chosen so a plain choice on a sheet takes the double period. Their periods are
      marked as guessed on the Electives screen (choice 21; ADR 0018 choice 48).
    - **Things you delete stay deleted** (choice 20): an elective set deleted before
      (`deleted|ElectiveSet||<name>`), an offering (`deleted|Offering|<set>|<activity>`), an
      activity (`deleted|Activity||<name>`) and a linked choice
      (`deleted|LinkedChoice|<set>|<activity>|<weekdays>|<time blocks>`, ADR 0018 choice 49) are
      not added again; each is listed "Deleted before" with Bring back, and a deleted set's cells
      are "deleted before; not brought back".
    - **Comes in** counts elective sets, offerings and linked choices as tiles; after Add, the
      save's own counts.
    - Not in this slice: binding the "not set up yet" electives of versions already saved (Roots,
      plan §6.1); similar names among a list's choices (they are matched to activities by name,
      spaces and capitals aside); the Electives menu stays "Coming".
    - Checked by `electives.test.js` (the word and the list read, the strict rule and the
      question, the camp's activity and set winning, the cells, the choices' activities, double
      periods linked, not linked and kept apart by lunch, a later linked choice's name, things
      deleted with Bring back, the same plan in any file order), `shoreshImport.test.js` (the
      section, its words and Not electives, the tiles), the existing engine tests (Chugim is a
      set now), and `ImportElectivesTest` (the save within a query bound, the guessed periods,
      Undo, a deleted linked choice remembered, an entry naming a record refused).

## Differences from the desktop (settled with Greg, 2026-10-16)

- **Layout can be changed per file** (the desktop only displayed it): kept.
- **The review's four tiles and reveal animation:** later, as polish, with a mockup first.
- **Division dropdown per group** on the preview, as the desktop has it (item 14).
- **Undo, the imported version, remembered answers:** part 2.

## Choices that are hard to undo after release

- The static resource name `SheetJS` and the Apex class `ImportController` (`saveSetup`,
  `getAnswers`, `undoImport`) are part of the package's surface once released.
- Part 2 objects: `ImportAnswer__c` (detail of Camp: `QuestionKey__c` long text, `Answer__c`,
  `Key__c` unique) and `Import__c` (detail of Season: `Files__c`, `Created__c`, `Changed__c`,
  `UndoneAt__c`), both auto-numbered and not reportable.
- `Group__c.Division__c` is reparentable (groups can move between divisions of a program).

## The imported week is kept as it came in (2026-10-25)

Greg (engine care plan, `projects/shoresh-sf-engine-care-plan.md` in the wiki): the imported week is a
permanent version, labelled with where it came from. `ImportedWeekGuard` keeps it, alongside
`PublishedGuard` and in the same days lookup: a version an import made (Status Version, Origin
Imported) is never deleted, its days never change, and it stays its program's and week's import.
The exceptions are the import itself, its Undo and deleting its whole season (inside
`ImportedWeekGuard.allow()`), and Shoresh's own Publish, Unpublish and rename (`PublishedGuard.writing()`).
Deleting its whole program also takes it (Salesforce deletes a program's schedules with it, as a
season's): the week belongs to the program, so it goes when the program does. It can be renamed and
restored; its origin still says Imported. Marking some other version Imported by hand is not refused
(it does no harm). Test data that writes a version's days uses a saved-by-hand version
(`ShoreshTestData.savedVersion`). Every full engine build is never emptier than this
week where the limits allow (PR 4b): `GeneratedInputs` sends the newest imported version's days with
the week, and the engine builds again from it when its first build is emptier (protocol 8.19–8.23).
