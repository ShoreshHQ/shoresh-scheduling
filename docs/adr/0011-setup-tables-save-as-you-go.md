# 0011: Setup tables save as you go

Status: proposed (2026-10-17). Design source: wiki `projects/shoresh-scheduling-sf` decision 15
(2), Greg 2026-10-17: "Setup tables work like the desktop: an always-present blank last row,
saved as you go (Enter), replacing table-wide Save/Cancel." Desktop (read-only copy,
`~/Dev/Shoresh/shoresh-desktop` at 69dbd34): `docs/governance/standards/DESIGN_STANDARD.md`
§6a "InlineAddRow" (lines 222-235), `src/components/setup/InlineAddRow.jsx`, the row editing
of `src/screens/GroupsScreen.jsx` (lines 86-115), and
`docs/adr/2026-09-08-crdt-conflict-reconciliation.md` ("Decision"). Manual Build's compare and
set: ADR 0008 §4.

The desktop has no decision record of its own for inline add, save on Enter, row checks, or
undo; DESIGN_STANDARD §6a is the rule, and it says every table setup screen uses the blank
row, "no exceptions". The desktop has no undo for row edits either: only Trash for deletes.

## Choices

1. **One table, every setup screen.** `c/shoreshEditableTable` changed, so Weeks, Location
   types, Locations, Activities, Time blocks, Units, each unit's Bunks, Fixed activities and
   Recurring activities all work this way. Programs, the season form, Camp words, and Activity
   details are forms, not tables, and keep their Save buttons. _Changed 2026-10-20 (ADR 0013,
   decision 26 (4)): the forms save as you go too, one field at a time, in this queue._
2. **The blank last row** (desktop `InlineAddRow`). _Since 2026-10-21 (ADR 0015 choice 11) it
   is dashed, with no fill, at the end of each section, and the week ticks are a strip shown
   while the row is pointed at or edited, the weeks said as the exception at rest; every
   behaviour below is unchanged._ Always there, tinted like the desktop's,
   its first text field showing the table's add word ("Add Bunk") in grey. It starts with the
   screen's starting values (an activity's length 1 and so on; every week ticked). Names now
   start blank: the old "Week {n}" style names would make an untouched row look filled in.
   It is added by **Enter**, its **+ Add** button (the desktop's words), **leaving the row**
   once something was typed (desktop `InlineAddRow.jsx` lines 77-87), or **Done** in its "Who"
   picker. Moving between its own fields adds nothing. Until every required value is filled
   in, **+ Add** is greyed out and Enter or leaving does nothing, quietly, as on the desktop;
   its fields never show "Complete this field". While it is being added its fields are
   locked and its button reads "Adding…" (the desktop's word), so fast typing can't add a row
   twice or run into the next one; a blank row added while another row is saving waits, still
   locked, and goes next. If the add is refused, the row opens again with the cursor back where
   it was (the field, or the Add button). The button shows "+ Add" and is named for its table
   for screen readers ("Add Bunk"). Once added, the
   row shows at once with the saved rows, the blank row empties to its starting values, and
   after Enter or **+ Add** the cursor is back in its first field (desktop: focus kept after
   add). With a Show filter on (Locations by type), it starts with the chosen type.
3. **Saved rows save as you go.** A change is saved when the director presses **Enter** in a
   typing field or tick of the row, or leaves the row (for anywhere outside it and its "Who"
   picker); a dropdown's Enter picks its choice, and the row saves on leaving. **Escape** puts
   the row back as saved, from a typing field or a dropdown (not from a date or time field, or
   a dropdown that is using it to close its list). A **"Runs in"/"Open in" tick** is saved the
   moment it is clicked, as on the desktop (`GroupsScreen` `handleToggleExclusion`). The
   desktop first asks "Turn off … for Week 3?" when the week already has placements; the table
   has the place for that question (`beforeWeekOff`, an async yes/no asked before a saved row's
   week is unticked; no puts the tick back), which PR #48 fills in after this one; other
   ticks (days, Outdoors), dropdowns, and "Who" (on **Done**) save with the row. A fix offered
   in a row's note is saved at once. A **refused** change stays on screen with a bronze edge
   on its row (and "Not saved" for screen readers) until it is saved or put back, so it is
   never silently lost once the message clears. With a Show filter, a row whose type is
   changed stays in view until it is saved, then follows the filter.
   _Difference from the desktop:_ the desktop opens a saved row for editing (click, Enter, or
   Space), then saves it on Enter or a Save button; leaving it does not save. Salesforce rows
   are always fields to type in, with no open or closed state, so leaving the row is what
   ends an edit; Greg's brief asks for save on leaving the row.
4. **One row at a time, in order, across the whole page.** Rows wait their turn in the order
   the director left them, whichever table they are in (Location types and Locations share a
   screen, as do a program's tables). The page saves a row, tells the table what happened,
   reads the season again, and only then sends the next row; and any read of the season that
   answers after a newer one was asked for is dropped, so the screen never goes back to older
   data. A step that fails in a way nothing expected is shown, and the rows after it still go.
   A row save does not make the page busy: buttons stay usable, so the click that moved
   focus out of a row (say, a Delete) still lands. Typing while a row is being saved stays on screen and is saved next. A Jest property
   test plays 200 random sessions of typing, leaving rows, answers, and someone else's changes,
   and checks that nothing typed is lost, nothing older is saved over it, and only one row is
   ever being saved.
5. **Two people editing: compare and set, row by row** (`SetupTablesController.saveRow`,
   `RowSaves`, `RowSeen`), in the spirit of ADR 0008 §4. A saved row sends only the fields the
   director changed and what each held when the director saw it. The server locks the row and
   checks each one: unchanged since, or already what the director wants, is saved; changed by
   someone else, nothing of the row is saved and the answer says what it holds now. Fields the
   director did not touch are never sent, so a change someone else made to another column
   stays. "Who" a recurring activity covers is checked the same way (someone else choosing the
   same is no question). Week ticks need no check: a tick says what the director wants, and
   saving it twice is the same as once. A row save's week ticks and "who" must be about that
   row; anything else is refused before anything is read (`RowExtras`). The question names
   each value as the director reads it: a choice by its name (one someone else just added once
   the reload brings it, never its record Id), a date as "Sat, Jul 3, 2027", a time as "9:00
   AM".
   The question is Manual Build's: **Changed by someone else**, each field named
   ("Week 1 · Name") with **Theirs** and **Yours**, then **Keep theirs** (theirs stays; the
   director's other changes to the row are still saved) or **Use yours** (the same change
   again, naming what is there now). As in Manual Build, Escape keeps theirs, Tab stays on the
   two buttons, and afterwards the cursor is back in the row. Nothing else is sent while it is
   open. A row someone else deleted is refused in plain words ("Week 1" was deleted by someone
   else.).
   _Difference from the desktop:_ the desktop syncs devices and shows clashes afterwards on a
   Conflicts screen ("Two devices changed the same thing at once. Keep one."); it never picks
   one (its CRDT ADR, "Decision"). Salesforce has one copy of the data, so the question is asked
   at save time instead, which keeps the same rule: nothing is overwritten unseen.
   _Since 2026-10-21 (step 3b, ADR 0015 choice 12) an activity's length, groups at once, No
   limit, priority, outdoors, rain plan and no weekly maximum are in its details beside the
   table, saved as a form's fields are (the last save wins, ADR 0013 Known limits); its name,
   location, how often (at least, at most) and weeks stay in the row and keep this check._
6. **Messages.** A row save shows no "Saved." toast (the desktop's row saves are silent); screen
   readers hear "Swim saved" or "Swim added", again each time even when the words are the
   same. A refusal is the screen's usual message, naming the row, and the typing stays to fix.
7. **Access.** The Shoresh Scheduler permission set includes `SetupTablesController`; a test
   checks it, since Apex tests don't enforce class access.
8. **Everything the table did before stays:** "Same name as another" (the blank row's typing
   counts too), overlapping weeks, "Runs in" ticks, "Who", the unit picker on a saved bunk and
   its "Moving" note, the Show filter (the blank row always shows), sort order (a new row goes
   after the highest saved number), the error card for an object the table doesn't know, and
   keyboard and screen-reader labels.
9. **Empty state** (desktop shipped tables): one quiet line in the table ("No bunks yet."),
   centred, with the blank row under it. The explanatory sentences that some empty lines
   carried are gone (design guide: title only).

## Differences from the desktop, all told

- Leaving a saved row saves it (choice 3); the desktop opens a row and saves on Enter or Save.
- Conflicts are asked at save time (choice 5); the desktop shows them on a Conflicts screen.
- A refused change keeps a bronze edge on its row (its fields read "…, not saved" to screen
  readers); the desktop keeps a refused row open with Save and Cancel.
- The blank row's fields lock while it is being added; the desktop's stay open (with "Adding…"
  on its button, which this table shows too).
- Until PR #48, unticking a week with placements doesn't ask first (see choice 3).
- Escape in the question keeps theirs (Manual Build's rule; coordinator, 2026-10-17).

## Known limits

- "Who" a recurring activity covers is compared under the row's lock, but an import writing
  coverage at the same instant does not take that lock; the window is a few milliseconds.
- Escape in a dropdown puts the row back unless the dropdown marks the key as used to close
  its list; whether every Salesforce dropdown does that is checked by hand in the test org.

## Not changed

- What a row must have comes from each screen's columns (`required`). A value left blank is
  sent as nothing, never as the field's default, so the server can fill it in: the desktop
  parity work makes a time block's name and part of day optional (a blank name becomes the
  time range, a blank part of day follows the start time) with no change to the table.
- "Same name as another" and the overlapping-weeks flag are now the shared bronze dot
  (`c/shoreshDot`): no words beside it; the words show on hover, keyboard focus, or a tap, and
  screen readers read them (design guide, Greg 2026-10-17). Coordinator, 2026-10-17: fix it
  here, since this PR owns the table.
- `saveRecords` stays for the program form and Needs attention fixes. `saveRowsAndWeeks` and
  `saveRowsWeeksAndWho` are removed: nothing called them, and they saved without the compare
  and set (tests call `ScreenSaves.save` directly).
