# 0008: Manual Build, build choices

Status: proposed (2026-10-17), Manual Build part 1 of 6. Design source: wiki
`projects/shoresh-scheduling-sf` ("Manual Build, round 1", Greg 2026-10-17, and his answers to the
plan's questions the same day), `projects/shoresh-desktop-manual-build` (how the desktop does it:
the baseline), `projects/shoresh-design-guide`. Desktop: `src/screens/ScheduleScreen.jsx`,
`src/screens/schedule/useGeneration.js` (`placeFixedEvents`), `useSlotMutations.js`,
`src/components/schedule/CellInlineEditor.jsx`. Builds on ADR 0005 (storage, grid format v1).

## The six parts

1. **This one:** the Manual Build draft, Start a blank week, slot saves with conflicts, typing a
   name into a slot (and adding a new activity that way), the keyboard grid.
2. Activity list on the left, drag and drop (place, move, swap, remove), multi-block shortening,
   Undo/Redo (50 steps per visit).
3. Counters (Filled, Still needed, Spread across the week, Overlapping) and the bronze dots (over
   its weekly limit, not set up for a bunk, twice in a day).
4. Clear day, Clear week, Copy day to…; Versions on this screen; Save version; any version opens
   in Manual Build.
5. Publish (`PublishedAt__c`, `PublishedBy__c`, `PublishKey__c`).
6. Setup changed since the week started: dots and "Update to match setup".

## Choices (part 1)

1. **Where it lives** (Greg, 2026-10-17: like the desktop). The menu's last section is **Manual
   Build**, **Generated Schedule** (Coming), and **Schedules** (the read-only viewer of ADR 0005,
   unchanged). Roots' **Build or generate the schedule** opens Manual Build. Manual Build has the
   same week and program pickers and the Daily / Group / Activity View toggle; Activity View is
   read-only, as on the desktop. Versions comes to this screen in part 4.
2. **The draft.** One `Schedule__c` per program and week with Status Draft, Origin Manual, and the
   name "Manual Build". It is not a version: the Versions list doesn't show it. No new fields:
   **one per program and week** is kept by `ManualDrafts.start`, which locks the program row and
   then looks for a draft again. A second Start (a double click, or someone else at the same
   moment) waits for the lock and gets the first one's draft.
3. **Start a blank week** (desktop `placeFixedEvents`). It makes one day for each date of the week
   the program runs (its Monday to Friday ticks). Each day has the program's time blocks and its
   groups that are not away that week (a week exception on the group). Fixed and recurring
   activities go where slice 3b's `SetTimePlan` puts them (their weeks, days, who, and length).
   A group that isn't at camp for part of the item's length gets the part it is there for: a
   morning-only group the earlier part of an item that crosses into the afternoon, an
   afternoon-only group the later part. The part starts at the group's first at-camp block
   in the item and runs through its unbroken at-camp blocks. An item with at camp, away, then
   at camp again inside it is placed for the first stretch only. Setup's clash checks count
   the group at every block it is at camp for, so they reserve more than the blank week
   places, which is the safe side. Everything else is Open. The same setup
   always gives the same grids. A program with no time blocks, no groups at camp, or no days
   that week is refused with a sentence naming it. A fixed or recurring activity whose slot is
   already taken (only possible with setup saved around the clash check) is not placed, and the
   screen lists it after Start (_Rest · Bunk 3 · Monday_) rather than leaving it to be found.
   `SetTimePlanReader` reads in system mode because it backs the clash check (ADR 0001 §6).
   Before a screen uses it, `SetTimeAccess` checks that the scheduler can read every object
   and field it reads, so system mode shows nothing user mode wouldn't. A second copy of its
   queries in user mode was the other option; it would have meant two versions of slice 3b's
   reader to keep in step. Every other read is in user mode.
4. **Slot saves: compare and set, slot by slot** (Greg #11: each slot saves on its own; a slot
   someone else changed asks "keep theirs or use yours"; nothing is overwritten unseen). The
   day-level revision check of ADR 0005 §9 would make two people editing different bunks of the
   same day collide, so Manual Build does not use it to decide. Instead:
   - An edit is a list of runs. A run covers one group, one day, and blocks next to each other.
     It says what each slot held when the director saw it (`before`) and what it should hold
     (`after`).
   - A slot's identity is `''` (Open), `A:<record Id>` for an item starting there (kind and
     record Id; kind and name for things not set up yet), or `^` plus the identity of the item
     carrying on into it. Names never decide a match; 15- and 18-character Ids are the same
     slot.
   - `SlotSaves` locks the schedule, reads the days, and checks each edit's `before` against the
     slots as they are now. If they still match, the edit is made, even when other slots of
     that day changed. If not, the edit is left out and its position comes back in `conflicts`.
     Every edit's runs are made together or not at all.
   - The days are written through `ScheduleDaySaves` with the revision just read under the same
     lock, so its own check always passes and the import's whole-day writes keep working.
   - The answer is always the schedule as it now is, everyone's changes included. The screen
     shows theirs and asks: **Keep theirs** (nothing more is sent) or **Use yours** (the same
     edit again, naming what is there now).
   - Undo (part 2) is an edit like any other, so undoing over someone else's newer change asks
     the same question.
   - The dialog names the first cell that isn't what the director saw, with theirs and yours
     there.
   - **Use yours** makes exactly the change the director chose: the same cells, the same
     length. It is made on the server's latest copy of the week, not on the screen's, which
     may include edits still waiting. Anything of theirs that overlaps it is replaced in full,
     so nothing is left cut short.
   - While the question is open, later edits wait. **Use yours** goes first; then they are
     sent, each checked the same way.
5. **What an edit may not do** (refused with a sentence, nothing saved):
   - change, cover, or place a fixed or recurring activity (they stay where setup puts them;
     part 6 adds "Update to match setup");
   - place anything in a block where the group is not at camp (morning or afternoon only);
   - place an activity from another season;
   - change anything but a Manual Build draft (a version, a published schedule, or a later
     Generated Schedule draft);
   - start partway through a placement (refused: the screen never sends that). A run that would
     change what the slots outside it belong to is a **conflict**, not a refusal: the screen's
     picture of the day was out of date (say, someone placed the same activity at another
     length);
   - change a day that can't be read (refused with ADR 0005's "This day could not be read: …",
     not offered as a conflict).
     Slots are compared exactly (Apex `==` ignores capitals, so `equals` is used).
     Items no slot uses any more are dropped from the day's list (`ScheduleGrid.dropUnusedItems`).
6. **Typing a name** (desktop `CellInlineEditor`). Double-click, Enter, or F2 on a slot opens a
   small box under it, named for the slot (_Bunk 1 · Monday · Period 2_). It lists, filtered as
   you type (spaces and capitals aside):
   - **Open**, when the slot is filled and nothing is typed;
   - the activities set up for that bunk;
   - only **Open** for something left in a block where the group isn't at camp (it can only be
     cleared);
   - then the rest, each with a bronze dot and _Not set up for <bunk>_ (Greg #3: allowed, with
     a dot). The desktop lists only eligible activities; here typing must be able to do what
     dragging can;
   - then **Add "<name>" to activities** (Greg, Q2), when no activity has that name.
     **Add** creates an activity with the Activities screen's hand-add starting values (length 1,
     once a week, low priority, one group at a time). A name the season already has gives that
     activity instead. Add needs a Manual Build draft and locks its season, so two people adding
     the same new name at once, from any week or program of the season, get one activity. Electives, special events, and special days are not offered: they are not
     set up in Salesforce yet. The wording avoids an article built from a camp word (design guide).
7. **Multi-block activities fill their length** (Greg #7). From the slot's first block, an
   activity runs for its length over Open slots. It stops at a filled slot, a block where the
   group isn't at camp, or the end of the day. Replacing or clearing part of a multi-block
   placement takes the whole placement. Shortening and extending by hand come in part 2.
8. **Keyboard** (accessibility; drag and drop comes in part 2 with its own keyboard path). In
   Manual Build the grid is an ARIA grid with one cell in the tab order (roving tabindex).
   - Arrow keys move between slots; a multi-block slot is one stop.
   - Enter or F2 opens the box. Its input is a combobox over a listbox: up and down arrows
     choose, Return picks, Escape closes and puts focus back on the slot.
   - Delete or Backspace clears a slot.
   - A slot that can't change is marked `aria-readonly` and announced when tried (_Lunch stays
     where it is set up._). A placement left in a block where the group isn't at camp can
     still be cleared.
   - A polite live region announces each saved edit (_Placed Swim · Bunk 1 · Monday ·
     Period 2_) and each conflict, and says the same words again when repeated. The conflict
     dialog is modal and keeps Tab on its two buttons. It starts on **Keep theirs**, and Escape
     keeps theirs.
     The read-only grid (Schedules page) is unchanged: a table, not focusable.
9. **Saving feels instant.** An edit shows on the grid at once, slightly faded until the server
   has it. Edits made meanwhile are queued and sent one at a time, in order, each on top of the
   server's latest answer. A refused save shows its sentence (plus how many waiting changes
   were not saved) and reloads the week; the sentence stays until the next save works or
   another week is chosen. Coming back to the browser window reloads the week (unless an edit
   is under way), so other people's changes show. A reload that started before an edit never
   replaces it. There is no push from the server. The slot box closes when the page scrolls.
10. **Not at camp.** In the draft, a slot where the group isn't at camp (from today's setup:
    morning-only or afternoon-only groups) is hatched and says _Not at camp_; nothing can be
    placed there. The legend gains that look.
11. **Code layout:**
    - `ManualBuildController`: the screen's four calls;
    - `ManualDrafts`: find, start, and lock a draft;
    - `BlankWeek` and `BlankDay`: Start a blank week;
    - `ProgramReads`: setup reads;
    - `SlotEdits`: what the screen sends and gets back;
    - `SlotSaves`, `SlotRules`, `SlotIds`: compare and set, and its rules;
    - `ManualBuildViews`: activities with who they're not set up for, and away slots;
    - `ManualBuildActivities`: adding an activity;
    - `SetTimeAccess`: the read check before the system-mode set-time reader;
    - LWC `shoreshManualBuild` (with `slotEdits.js`); an `editable` mode on
      `shoreshScheduleGrid`.
      All new code reads object and field names through `ShoreshSchema`, typed references, and
      `c/shoreshSchema`. The LWC suite runs in the namespaced Jest run.

## Choices (part 2)

13. **The activity list** (desktop `ActivityPalette.jsx`, `shoreshBuildPalette` with `counts.js`):
    - a rail left of the grid in Daily and Group View;
    - a **Filter…** box;
    - activities under their weekly minimum first, then a line, then the rest, each part by
      name;
    - each chip says _N placed (needs 3–5)_ (also _needs 6+_, _up to 5_, _needs 2_).
      Group View counts the bunk shown against the activity's times a week. Daily View counts
      the camp, against those times multiplied by the bunks it is set up for (the desktop's
      scope). A multi-block placement counts once. **Over the maximum is never blocked** (Greg
      #2): the chip can still be dragged, and its count gets the bronze dot. The desktop greys it
      out and stops the drag. The dots on the grid come in part 3. The server sends each
      activity's `minPerWeek` and `maxPerWeek` (null when it has no weekly limit).
14. **Drag and drop** (desktop `dragHandlers.js`), HTML drag events:
    - a list activity onto a slot places it, or replaces what is there. It fills its length
      over Open slots and says so when there wasn't room (_Placed Boating · … (1 of 2)_);
    - a placement onto an Open slot **moves** it and keeps its length. Somewhere too short is
      refused (_Boating doesn't fit there._), not cut;
    - onto a filled slot the two **swap**. As on the desktop, only single-block activities
      swap (_Only single-block activities swap._);
    - back onto the list **takes it out**.
      Fixed and recurring activities don't move and nothing lands on them. Refusals are a quiet
      line under the toolbar (`role=status`), never a banner.
15. **Longer and shorter** (desktop `useSpanExtendDrag.js`; Greg #7 "can be shortened"):
    - a placement's bottom handle dragged to a slot of the same bunk and day makes it end
      there, longer over Open, at-camp slots only;
    - Shift+Down and Shift+Up add or take off a block.
16. **One way to describe every change** (`moves.js`). The change is made on a copy of the
    rows it touches. Each row is then compared with its original, and the run sent is exactly
    the slots that differ, widened to whole placements. A move within one row is one run; a
    move or swap across rows is two runs in one edit, made together or not at all.
17. **Undo and Redo** (desktop `useUndoRedo.js`; Greg #10), `history.js`:
    - 50 steps per visit; choosing another week clears them, and Versions holds older history
      (part 4);
    - the toolbar buttons are named for the step (_Undo: Swapped Swim and Soccer_), with
      Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y (not inside the typing box);
    - an Undo is the step's runs sent back the other way, so it is checked like any edit.
      Over someone else's newer change it asks _keep theirs or use yours_. Keeping theirs
      drops the step from both Undo and Redo;
    - a refused save clears Undo, because what is saved is no longer known there.
18. **Keyboard, at parity with drag** (accessibility):
    - Space on a placement picks it up (_Swim picked up from Bunk 1 · Monday · Period 2._);
      arrow keys move; Space or Enter puts it down (move or swap); Escape puts it back;
    - Enter, Space, or a click on a list activity picks it up, and focus goes to the grid;
    - while something is picked up, a click on a slot puts it down too;
    - the picked slot and the picked list activity are outlined; `aria-pressed` is on the
      list chip.
19. **Review fixes (part 2):**
    - **Length without dragging (WCAG 2.5.7):** a click on a placement's handle picks up its
      end (_Swim: choose where it ends._), and a click on a slot of the same bunk and day sets
      it. A handle dropped on a multi-block cell lands on the block under the pointer.
    - **Drags:** a drag that ends without a drop is forgotten (`dragend`). A drop counts only
      if it carries the dragged thing's name. The drag carries the name shown, never a record
      Id, so a drop into a text box writes a word.
    - **Undo:** after **Use yours**, the Undo step is what was really saved, so Undo brings
      theirs back whole. Keeping theirs also drops a waiting Undo or Redo of that step.
      Ctrl/Cmd+Z does nothing in the Filter box, the typing box, or the question.
    - **Picked up:** let go when the view, day, or bunk changes, or the week reloads. The
      picked cell is `aria-selected`.
    - **Refused:**
      - a swap never puts anything where the bunk isn't at camp;
      - something not set up yet stays where it is (_Chugim stays where it is._);
      - the swap refusal uses the camp's words (_Only activities one Period long swap._);
      - a list activity dropped on a leftover where the bunk isn't at camp says so;
      - putting something back where it was says _Put back._
    - **Counts:** in Group View, a bunk an activity isn't set up for needs none of it
      (_0 placed_; the dot if any is placed).
    - **The refusal line** is plain text; the always-present live region announces it, once.

20. **The bronze dot shows no words** (Greg, 2026-10-17). `c-shoresh-dot`, used for every
    "needs a look" dot from here on (the grid's in part 3 too):
    - its words (a few, in camp terms: _Over its weekly limit_, _Not set up for Bunk 2_,
      _Not placed: the cell was taken_) show in a small tooltip on hover, on a tap, and when
      the dot or the row it sits on has keyboard focus (the list chip, the highlighted option
      in the typing box);
    - screen readers read them without hovering: they are assistive text inside the row, so
      part of its name; the tooltip itself is hidden from them;
    - a dot alone (Start's _Not placed_ note) is its own tab stop. A tap on a dot inside a row
      shows the words and doesn't also act on the row.
      `lightning-helptext` was not used: its info icon is a different look from the dot. The
      tooltip uses the SLDS neutral colours, never bronze text.
21. **Review fixes, round 2 (coordinator):**
    - **What the question lists is what Use yours sends** (`conflicts.js`). Each edit carries
      its intent: the director's cells, each named by day, group, and **time block Id** (never
      by position, which moves when a block is added), with what it should hold, and the
      director's view of every row it touches, also by time block Id. The intent travels with
      the edit through questions, Use yours, and further questions. When a question opens,
      `plan()` makes the intent on the server's week as it is now: the director's cells, and
      anything of theirs those cells overlap cleared in full. Its runs are exactly what Use
      yours sends, and its rows come from the same comparison. **The rule: every cell Use yours
      would change is listed, except the director's own cells that still hold what the
      director expected there.** What the director expects in their own cells is what the edit
      names as there before it: for an edit, the screen when it was made; for an Undo or Redo,
      what the step left, even if the screen has since refreshed to someone else's change
      (which is then listed, not replaced). Every run also names the time block of each of its
      cells (`blockIds`, required: a run without them is refused as unreadable), kept with the
      step for Undo and Redo: the screen never mistakes a block added inside it since for one
      of them, and the server (`SlotSaves`, `SlotEdits.Run.onBlocks`) makes a run only on
      exactly those blocks, or returns a conflict, so a placement never lands shifted onto a
      new block. So nothing
      anyone else put anywhere (in the director's cells, or in a placement of theirs that would
      be cleared) is replaced without being shown. With nothing to list there is no question;
      with nothing to change, _Already as you had it._ After Use yours, what the question
      showed counts as seen, for a further question. One thing Use yours does without asking:
      when theirs is the same activity, shorter, and the cells it no longer covers were Open
      when the director made the edit, it is made the director's length again; no one's
      activity is lost. (If someone shortened the director's own activity, those cells are
      listed.)
    - **When the plan can't be made** nothing is sent; the edit, Undo, or Redo leaves the Undo
      and Redo lists (an edit never saved; an Undo or Redo can't be made), and a waiting Undo
      or Redo of it goes. The quiet line says why:
      - a cell's day, bunk, or time block left the week: _Bunk 1 · Monday · Lunch isn't in the
        week any more._;
      - a time block was added inside the director's cells: _Bunk 1 · Monday has changed. Try
        again._;
      - a fixed or recurring activity is now where the director's cells are (they are never
        cleared): _Flagpole stays where it is set up._;
      - for an Undo or Redo, the same reason after what can't be undone: _Can't undo Placed
        Swim · …: Flagpole stays where it is set up._ (When it is pressed, before anything is
        sent, the cause isn't known: _Can't undo Placed Swim · …: the week has changed._)
        The line stays until the director's next change or answer, and is said again once, with
        the first save that follows (whose words would otherwise talk over it). Other notes are
        said once and never twice on the line: _Redo skipped._ with its own save, _Already as
        you had it._ at once.
    - **A run never includes a cell the edit doesn't change** (`diffRuns`): changed stretches
      are widened only as far as their own placements. A swap of Period 2 and Period 4 is two
      runs, and Period 3 is never part of the edit, whatever someone puts there.
    - **Checked by a seeded property test** (`conflicts.property.test.js`): 3,000 generated
      weeks (two days, three bunks, fixed and recurring activities, activities one to three
      blocks long). Each gets a director's edit: a plain edit (place, multi-block, clear, move or
      swap within or across days and bunks, length), or an Undo or Redo of any of those, some of
      them steps Use yours made (their runs from `plan()` over someone else's change), half
      pressed after the screen refreshed to someone else's change. Then random changes by others
      (cells, cleared placements, longer or shorter activities, new fixed or recurring
      activities, time blocks added anywhere including inside a placement, or removed), and up
      to three questions in a row. The test server makes runs as `SlotSaves` does, only on the
      blocks they name. The test keeps its own record of what the director expected and saw,
      and checks each time: the rule, strictly; that no fixed or recurring activity is ever
      changed; after each save, that every cell was written in exactly the time block it was
      meant for (from the test's own record for the first send), holding what the director
      chose; and that Use yours is never refused when nobody changed anything after the
      answer. Breaking the rule, the record of what was
      expected, or the server's block check fails it. On the screen, every test that clicks Use
      yours checks the same rule by time block Id against the server's week at question time
      (`useYoursSendsWhatWasShown`), carrying the director's own cells and what they have seen
      through a further question.
    - **Use yours and Undo:** a waiting Undo or Redo of the same step is dropped (it was worked
      out from what the director saw); a dropped Undo puts the step back on top of Undo, and a
      dropped Redo is said with the save (_Placed Swim · …. Redo skipped._) and stays on the
      quiet line. The saved change can always be undone: if a later change cleared Redo after
      it was undone, it goes on top of Undo. A change, or a Redo of one, becomes what was saved,
      in the same place in the Undo list. An Undo made over theirs is done and leaves both
      lists, so there is never an _Undo: Undone: …_. Focus returns to the cell, after either
      answer.
    - **A swap checks both ends**: neither activity may land where its new bunk isn't at camp.
      It is refused on the quiet line, not by the server.
    - **The handle** is a slim bar to see and drag, in a 48 × 24 px area to click (WCAG 2.5.8). A
      drag that starts off the bar is a move, and with something picked up, a click on the
      handle puts it down like a click anywhere on the cell.
    - **Quiet words for quiet no-ops:** a length chosen in another bunk or day (_Swim can only
      change length within Bunk 1 · Monday._), or before its start (_Swim can't end before it starts._); Space on
      a fixed or recurring activity (_Lunch stays where it is set up._), on the quiet line too.
    - **The swap refusal** reads _Longer activities don't swap._ (camp words).
    - **The dot's tooltip** (WCAG 1.4.13): Escape closes it (and is used up, so it doesn't also
      close the typing box or answer a question); the pointer can move from the dot onto it with
      no gap and it stays; a second tap hides it. Shown for keyboard focus, it lets clicks
      through to whatever is under it.
22. **Follow-ups from part 1:**
    - deleting a week or program now says _That includes its Manual Build and 2 saved
      versions._ (`shoreshCampSetup.savedSchedulesNote`, through `c/shoreshSchema`);
    - the slot box follows its slot when the page scrolls, and closes when the slot leaves the
      screen;
    - an empty cell is recognised by the views' `open` flag, not by its text;
    - Activity View is unchanged: it lists the bunks doing an activity in each block, so a
      bunk's away blocks have nothing to show there.

23. **Part 3: checks and counters** (Greg's decisions 2 to 4; desktop `computeFindings`,
    `computeOverlaps.js`; coordinator's answers 2026-10-17). Worked out live from the grid by
    `checkWeek` (pure, one function per rule): nothing is stored, nothing is blocked, and a mark
    clears as soon as its cause moves. A day that can't be read is left out. Inputs come from
    the setup records every screen already gets (`readActivities`, `readLocations`,
    `readProgram`, field names from `c/shoreshSchema`), so the server sends nothing new.
    - **One rules module with Generated Schedule.** Written here, then moved into
      `c/shoreshEngine` (#38, ADR 0010 §10) as the exported `checkWeek` (coordinator's call).
      Manual Build imports `checkWeek`, its readers and `reasonFor` from there and keeps no copy
      of any rule or its words (the activity list's and the typing box's words come from
      `reasonFor` too). The rule order is the order the engine's rules give way.
    - **The activity list follows the same check** (`counts.js`): what is placed comes from
      checkWeek's `placements`, its bronze dot from `bends` (any placement in view over its
      weekly limit), and "still needed" from `stillNeededBy` (any group in view short). So in
      Daily View an activity gets the dot when any bunk is over, as the grid's dots do, not
      when the camp's total passes its limit times the bunks (coordinator, 2026-10-17). Only the
      "2 placed (needs 3–5)" words are worked out here, from the setup numbers.
    - **The bronze dot** (`c-shoresh-dot`, no visible words) goes on a placement, never on a
      fixed or recurring activity or a not-set-up item. One dot per placement, its reasons
      joined by " · ", in this order: _Over its weekly limit_ (only on the sessions past the
      limit, the latest in the week: by date, then the first block's start time, then its place
      in the day's blocks, then block Id; Greg's decision 12, 2026-10-17);
      _Twice in a day_ (on both); _Not set up for Bunk 2_; _Over its limit of 2 bunks at once_;
      _Shares Pool with another division_ (an activity for one division at a time, sharing its
      place with another division; or _With another division at the same time_ for one with no
      place); _More bunks at Pool than fit_ (fixed and recurring activities count toward the
      place); _Already busy then_ (a bunk in two time blocks whose times overlap; blocks that
      only touch don't). A placement running several blocks counts once toward weekly and daily
      counts, and in each block it covers for at-once, division and place checks.
    - **The grid** (`c-shoresh-schedule-grid`) takes a `dot` (its words) on any cell and knows
      nothing about why, so Generated Schedule reuses it. The words show on hover, on a tap,
      and while the cell has keyboard focus, and are in the cell's assistive text.
    - **Counters** under the toolbar (desktop): **Filled** _34 of 120_ (cells filled, of the
      cells to fill: at camp, not fixed or recurring; neutral; the desktop's "Placed", renamed
      because the activity list's "2 placed" counts placements, not cells). **Still needed** (activity and
      bunk pairs short of the weekly minimum: one per line of its list, like the desktop's
      badges; Greg, 2026-10-17), **Spread across the week** (short of the
      early-week goal, by that day inclusive, only when the week has a day by then), and
      **Overlapping** (each clash once: a place in a block, an activity in a block, two of a
      bunk's placements whose blocks overlap). Still needed and Spread list group by group, then
      activity by SortOrder and Id, as the engine does. Each shows its count as a separate numeral and is left out at zero
      (design guide). A click opens the list of its lines, in the engine's words (_Swim · Bunk 3:
      2 still needed_, _… by Wednesday_, _Swim · Monday · Period 2: Over its limit of 3 bunks at
      once_); a second click closes it. The grid isn't highlighted by the list (desktop).
    - **Waits for part 6:** an activity, place or bunk closed that week (a week exception).
    - **Checked by** `checkWeek`'s own tests in `c/shoreshEngine` (scenario tests and a seeded
      property test against an independent placement-by-placement oracle: every dot's words,
      both lists, the overlap count's lines, Filled), and screen tests here for the counters, the
      list, the dots and their focus, and decision 12 (only the extra session is dotted).

## Choices that are hard to undo after release

None in parts 1 to 3: no new objects, fields, or picklist values. The draft uses ADR 0005's
`Status__c` Draft and `Origin__c` Manual. The slot identity is not stored, only sent between
the screen and the server.

## Not done here

- **Truly simultaneous Starts** are not exercised by a test (Apex tests run one at a time). The
  test calls Start twice; the code takes the program lock before looking again.
