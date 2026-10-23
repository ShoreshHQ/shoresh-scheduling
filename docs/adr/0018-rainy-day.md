# 0018: Rainy day

Status: proposed (2026-10-22). Design source: the desktop, which is the spec here:
`src/utils/rainyDay.js` (`planRainyDay`, `rainyReceiptText`, `RAIN_PLAN_FULL_TEXT`),
`src/screens/ScheduleScreen.jsx` (the "Rainy day…" toolbar button and its note, lines 400-410 and
1080-1115), `src/screens/schedule/useSlotMutations.js` (`applyRainyDay`, 1720-1800), and
`docs/guide/DIRECTOR_GUIDE.md` §5 "Rainy day". Wiki: `projects/shoresh-sf-parity-gaps.md` (the
row "Rainy day switch"), `projects/shoresh-desktop-behaviour-index.md` (rows "Rainy day… switch",
"Rainy day receipt and Undo", "Rain plan full mark"), `projects/shoresh-scheduling-sf.md`
decisions 47 and 51. Builds on ADR 0002 (the rain plan), 0005 (which reserved
`ScheduleDay__c.RainyDay__c`), 0008 (the week editor, its tools and Undo), 0010 (Generated's locks),
0014 (special days and events) and 0015 (the rail and the corner mark).

On a wet morning the director switches every outdoor activity of one day to its rain plan in one
step, sees what changed and what couldn't, and can undo it.

## Choices

1. **Where it lives: Edit, on Manual Build and on Generated Schedule.** The desktop puts
   **Rainy day…** on the toolbar of either schedule, the two screens where a week is changed by
   hand; the Schedules page and a published schedule are read-only, as on the desktop (a
   published week changes by switching its draft and publishing again). ADR 0015's rail has one
   grammar and no free buttons, and Edit (ADR 0008 part 7 §5) is where every hand change of the
   week already sits (Undo, Redo, Copy, Paste, Clear day, Copy day to…, Clear week; Generated's
   Lock). So **Rainy day…** is a row of Edit, after a line below the screen's own rows, with the
   week's days under it one step in, exactly as **Copy day to…** opens its days. A new rail item
   was the other option; it would have been the only rail item that changes the week outside
   Edit. It is the week editor's own row (`c-shoresh-week-editor`, `rainyWith`), so both screens
   have the same one. Not in Activity View (read-only there, as Clear day isn't), nor on a
   special day's or event's own schedule.
2. **The days offered** are the week's days that can be read, without the days a special day
   replaces (the desktop: `days.filter(d => !replacedDayIds.includes(d.id))`), named in full
   ("Monday").
3. **What switches** (`shoreshWeekEditor/rain.js` `planRain`, the desktop's `planRainyDay`). On
   that day, every activity cell whose activity is outdoors is one of:
   - **longer than one block**: left as it is;
   - **without a rain plan**: no rain plan, or one that is outdoors too (ADR 0002 refuses saving
     an outdoor rain plan; one saved before that rule still counts as none);
   - **locked** (Generated only): left as it is. A Lock beats a switch as it beats a paste (ADR
     0008 part 9 §5); the desktop has no such lock on a hand edit, and Salesforce's Generated
     Schedule never lets a hand edit cover a lock (ADR 0008, "What Generated Schedule adds");
   - **full**: its rain plan has no room in that block, so it keeps its activity and is marked;
   - **switched** to its rain plan, in that one cell.
     Nothing else is touched: a fixed or recurring activity, a special event placed on the grid
     (decision 47's flagged event cells), an elective, or anything not set up yet. A cell where the
     bunk isn't at camp, or that someone else changed since (below), is left out of all of these.
     Cells are taken block by block and, in each block, bunk by bunk, so the same day always
     switches the same cells (same inputs, same output).
4. **"No room"** is the desktop's rule: the rain plan's groups at once are taken, or its place is
   full. What counts is what stays in that block, the cells switched before this one, and, as
   Salesforce's checks count them (ADR 0008 §23, `checkWeek`), a fixed or recurring activity at
   the place and other programs' groups there (ADR 0010 §23). The desktop counts only the
   schedule's own activities; counting the rest means a switch never makes a place too full by
   the same checks that would then put a corner on it.
5. **The version first.** Choosing a day first keeps the week as an automatic version named
   **Before rainy Monday** (Auto-saved, Versions lists it), so the dry day is there after Undo
   has gone; then the day is worked out again on the week as it is now and switched. Nothing to
   switch or mark keeps no version (the desktop: only the note). If the version can't be kept,
   nothing is switched: _The rainy day could not be applied. … Nothing was changed._
   `RainyDayController.keepManualWeek` and `keepGeneratedWeek` (the Generated week keeps its locks
   and option, as Save version does) under each screen's own draft lock.
6. **One Undo step.** The switch is one edit through the screen's slot saves, like Clear day: the
   same "keep theirs or use yours" check, and a cell someone else changed since is left as theirs
   and the rest switched as the same step (ADR 0008 §24: _Rainy Monday, except 1 activity that
   changed_). On Generated, the switched cells lock as every hand edit does (ADR 0010 §33), and
   Undo leaves the locks as ADR 0008 §17 says. Undo, from the line, Edit or Ctrl+Z, puts every
   switched cell back and takes the marks away; Redo makes both again.
7. **What it says: the desktop's receipt, on the tool line with its Undo.** _Rainy Monday: 3
   switched to rain plans, 1 full, 2 without a rain plan, 1 longer than one block, left as is ·
   Undo_; with nothing to do, _Rainy Monday: nothing outdoors to switch_. Salesforce adds only
   _N locked, left as is_ (choice 3). Words are kept to the receipt; the grid shows the rest:
   each switched cell pulses once (the acknowledgement edits already use), and each full cell
   carries the corner mark.
8. **The mark.** A full cell carries the needs-a-look corner (`c-shoresh-dot` corner, ADR 0015;
   top right, so it sits with the padlock at the bottom right and an event's flag before its name,
   decision 51) whose words are the desktop's: **Rain plan full: choose another**. It joins any
   other words the corner has. The mark stays until the cell changes (the desktop: "the mark stays
   until the cell is next changed"): any edit, by anyone, that puts something else there takes it
   away, and putting the same activity back by hand later does not bring it back.
9. **Where the marks are kept: `ScheduleDay__c.RainyDay__c`** (long text), the field ADR 0005
   reserved, on the day's first part: one line per full cell, "group Id|time block Id|activity
   Id", sorted (`RainMarks`). A mark is kept only while its cell holds that activity, starting
   there; every save of a day drops the ones that no longer do (`ScheduleDaySaves`), so a mark can
   never say something the grid doesn't show. The marks travel with the edit
   (`SlotEdits.Edit.rain`: the marks the day keeps once the edit is made), so the switch and its
   marks are one save, and Undo and Redo put back exactly the marks from before or after. Every
   other change to a day keeps the marks whose cells still hold them (a Lock, Update to match
   setup, a Rebuild where the cell stays). **Restore** clears them: restoring "Before rainy
   Monday" is the way back from a rainy day. A version, a published schedule and a copied week
   start without marks.
10. **Not counted.** The counter and Publish's question don't count the marks: a full cell isn't
    a broken rule but a choice still to make by hand, and the corner on the cell is where it is
    seen. The desktop lists it among its findings; the counter's "to look at" lists only cells
    breaking a rule shared with other cells (ADR 0008 part 7 §6).

## Checked by

- Jest: `shoreshWeekEditor` `rain.test.js` (what switches, full by groups at once and by place,
  counting what stays, a fixed activity at the place and other programs; longer, none, outdoor
  rain plan; events, fixed, electives, indoor untouched; locked, someone else's and away cells;
  the same day the same switch; the receipt's words; a mark matching 15- or 18-character Ids; the
  tool's runs and marks; worked out again around someone else's change) and `rainy.test.js` (a
  replaced day not offered, no row without a host, an event never switched, a locked cell, the
  version kept first and the day worked out after it, keep theirs then the rest);
  `shoreshManualBuild` `rainyDay.test.js` (Edit's row and its days, none in Activity View, the
  version before the save, the edit and its marks, the line, the corner's words, Undo with its
  marks, a mark going when its cell changes, nothing to switch, the version refused, only full
  cells) and `dayTools.test.js` (Edit's rows); `shoreshGeneratedSchedule` `rainyDay.test.js`
  (Generated's controller and saver).
- Apex: `RainyDayTest`, as a scheduler with the records made inside `runAs`, each request under
  40 queries: the version (Auto-saved, Manual and Generated); the switch and its marks saved as
  one edit and read back; a mark staying when another cell changes and going when its own does,
  and not coming back with the same activity; Undo taking them away; a mark on a cell that doesn't
  hold its activity dropped; a garbled mark refused with nothing saved; Restore of "Before rainy
  Monday" without marks; a Lock on Generated keeping them; Generated's week read carrying each
  activity's Outdoor and Rain plan (the switch works them out from that read).
- In the test org: `scripts/a11y-browser-check.mjs` opens Edit on Generated Schedule with the
  keyboard, reaches **Rainy day…**, opens its days, chooses them in turn until one switches
  something (the camp's Soccer is outdoors), checks the receipt is said and focus is on its Undo,
  and undoes it. A week where no day switches anything fails the check.

## Choices that are hard to undo after release

`ScheduleDay__c.RainyDay__c` (long text, 131,072) and what it holds: one line per cell, "group
Id|time block Id|activity Id". A later format would need reading both.

## Not done here

- The desktop's toolbar line _N outdoor activities have no rain plan · Set them_: Salesforce
  shows that on Needs attention instead (Greg, 2026-10-16; ADR 0002 §6), unchanged here.
- The desktop's small outdoor icon on schedule cells (behaviour index: not decided).
- Electives' places: electives are not built (decision 44); when they are, their places count
  toward "no room" as the desktop's `resolveElectiveOfferingLocations` does.
