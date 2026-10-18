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
   details are forms, not tables, and keep their Save buttons.
2. **The blank last row** (desktop `InlineAddRow`). Always there, tinted like the desktop's,
   its first text field showing the table's add word ("Add Bunk") in grey. It starts with the
   screen's starting values (an activity's length 1 and so on; every week ticked). Names now
   start blank: the old "Week {n}" style names would make an untouched row look filled in.
   It is added by **Enter**, its **+** button, or **leaving the row** once something was
   typed (desktop `InlineAddRow.jsx` lines 77-87). Moving between its own fields adds nothing.
   The **+** is greyed out until every required value is filled in, and leaving a half typed
   row adds nothing and keeps the typing, quietly, as on the desktop; Enter on it shows which
   value is missing. Once added, the row shows at once with the saved rows, the blank row
   empties to its starting values, and after Enter or **+** the cursor is back in its first
   field (desktop: focus kept after add).
3. **Saved rows save as you go.** A change is saved when the director presses **Enter** in a
   typing field or tick of the row, or leaves the row (for anywhere outside it and its "Who"
   picker); a dropdown's Enter picks its choice, and the row saves on leaving. **Escape** puts
   the row back as saved (not in a date or time field, where it closes the picker). Ticks ("Runs in", "Open in", days), picklists, and "Who" (on **Done**)
   save the same way. A fix offered in a row's note is saved at once.
   _Difference from the desktop:_ the desktop opens a saved row for editing (click, Enter, or
   Space), then saves it on Enter or a Save button; leaving it does not save. Salesforce rows
   are always fields to type in, with no open or closed state, so leaving the row is what
   ends an edit; Greg's brief asks for save on leaving the row.
4. **One row at a time, in order.** Rows wait their turn in the order the director left them.
   The screen saves a row, tells the table what happened, reads the season again, and only
   then does the table send the next row, so every reload the table sees is newer than the
   last. Typing while a row is being saved stays on screen and is saved next. A Jest property
   test plays 200 random sessions of typing, leaving rows, answers, and someone else's changes,
   and checks that nothing typed is lost, nothing older is saved over it, and only one row is
   ever being saved.
5. **Two people editing: compare and set, row by row** (`SetupTablesController.saveRow`,
   `RowSaves`, `RowSeen`), in the spirit of ADR 0008 §4. A saved row sends only the fields the
   director changed and what each held when the director saw it. The server locks the row and
   checks each one: unchanged since, or already what the director wants, is saved; changed by
   someone else, nothing of the row is saved and the answer says what it holds now. Fields the
   director did not touch are never sent, so a change someone else made to another column
   stays. "Who" a recurring activity covers is checked the same way. Week ticks need no check:
   a tick says what the director wants, and saving it twice is the same as once.
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
6. **Messages.** A row save shows no "Saved." toast (the desktop's row saves are silent); screen
   readers hear "Swim saved" or "Swim added". A refusal is the screen's usual message, naming
   the row, and the typing stays to fix.
7. **Everything the table did before stays:** "Same name as another" (the blank row's typing
   counts too), overlapping weeks, "Runs in" ticks, "Who", the unit picker on a saved bunk and
   its "Moving" note, the Show filter (the blank row always shows), sort order (a new row goes
   after the highest saved number), the error card for an object the table doesn't know, and
   keyboard and screen-reader labels.
8. **Empty state** (desktop shipped tables): one quiet line in the table ("No bunks yet."),
   centred, with the blank row under it. The explanatory sentences that some empty lines
   carried are gone (design guide: title only).

## Known limits

- "Who" a recurring activity covers is compared under the row's lock, but an import or the
  older table save writing coverage at the same instant does not take that lock; the window
  is a few milliseconds.
- In Safari a click on a tick does not move focus to it, so ticking a week in a row being
  typed in can save the row early, then again on leaving. Nothing is lost.

## Not changed

- What a row must have comes from each screen's columns (`required`). A value left blank is
  sent as nothing, never as the field's default, so the server can fill it in: the desktop
  parity work makes a time block's name and part of day optional (a blank name becomes the
  time range, a blank part of day follows the start time) with no change to the table.
- "Same name as another" and the overlapping-weeks flag are now the shared bronze dot
  (`c/shoreshDot`): no words beside it; the words show on hover, keyboard focus, or a tap, and
  screen readers read them (design guide, Greg 2026-10-17). Coordinator, 2026-10-17: fix it
  here, since this PR owns the table.
- `saveRecords`, `saveRowsAndWeeks`, and `saveRowsWeeksAndWho` stay for the program form,
  Needs attention fixes, and tests.
