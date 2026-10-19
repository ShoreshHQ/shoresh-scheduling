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
4. In two (coordinator, 2026-10-17): **4a** Clear day, Clear week, Copy day to…; **4b** Versions
   on this screen (Save version, Restore, rename, delete) and Start from another week.
5. Publish (`PublishedAt__c`, `PublishedBy__c`, `PublishKey__c`); see "Choices (part 5)".
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
   that week is refused with a sentence naming it, and so is a season with no activities
   (desktop readiness.js; the screen offers Start only once nothing is still needed). A fixed or recurring activity whose slot is
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
    - a refused save clears Undo, because what is saved is no longer known there;
    - on Generated Schedule (ADR 0010 §33), an Undo or Redo changes a cell's lock only if its
      step locked or unlocked that cell and no Lock-menu choice covered the cell since; every
      other cell keeps the lock it has now, whoever set it (Greg, 2026-10-18: Undo keeps a Lock
      the director chose). Manual Build has no locks.
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
    clears as soon as its cause moves. A day that can't be read is left out. **One source:** the
    records the checks read all come with the draft (`DraftView`): the season's activities and
    places (`activityRecords`, `locationRecords`, read by `SeasonSetupReader.activitiesOf` and
    `locationsOf`, the setup screen's own queries), the program's groups with their divisions
    (`groupRecords`) and where its fixed and recurring activities are
    (`fixedActivityRecords`, `recurringActivityRecords`). So they are read again whenever the
    week is (window focus, reload), and anything changed elsewhere shows at once; the activity
    list's words come from the same draft. An activity added from a slot ("Add <name>") brings
    its record back with it (`ActivityOption.record`) and joins the draft's. Field names come
    from `c/shoreshSchema`.
    - **One rules module with Generated Schedule.** Written here, then moved into
      `c/shoreshEngine` (#38, ADR 0010 §10) as the exported `checkWeek` (coordinator's call).
      Manual Build imports `checkWeek`, its readers and `reasonFor` from there and keeps no copy
      of any rule or its words (the activity list's and the typing box's words come from
      `reasonFor` too). The rule order is the order the engine's rules give way.
    - **The activity list counts as the desktop does** (`counts.js`, `ActivityPalette.jsx`;
      Greg's round 2 decision 8, "palette counts work as on the desktop"): what is placed comes
      from checkWeek's `placements`; which group a chip sits in and its bronze dot follow the
      numbers its own words show ("4 placed (needs 4–6)"). In Daily View that is the camp's
      total against the targets times the bunks it is set up for, in Group View the one bunk
      against the activity's own targets whoever it is set up for (desktop `scaleFor`; the
      grid's dot says "not set up"), so the chip never says one thing and sits or marks
      another. Exactly at the maximum is not over it.
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
      nothing about why, so Generated Schedule reuses it. The words show on hover and while the
      cell has keyboard focus (a tap on the cell gives it focus), and are in the cell's
      assistive text. The dot is `in-cell`: it never takes a tap meant for the cell; its words
      open toward the cell from its right edge and wrap, so the grid's edge never cuts them
      off; and Escape reaches the cell only while the cell's focus brought the words up (one
      press hides them and puts back what was picked up). Shown by hovering, Escape stops at
      the words, as item 21 says.
    - **Screen readers hear what an edit did to the dots**, once, with its save: the first dot
      it brought (_Placed Soccer · Bunk 2 · Monday · Period 2. Soccer · Bunk 1: Over its limit
      of 1 Bunk at once, and 1 more_), or else the first it took away (_Soccer · Bunk 1: fine
      now_). A sighted director sees the dot appear (WCAG 4.1.3). The desktop says nothing
      here (only its drag steps are announced); this is added for screen-reader users
      (coordinator, 2026-10-17).
    - **A quiet pulse** (desktop `useFlagChangeAck`, `flag-changed-ack`): when a director's own
      edit changes the dots of up to three placements, each of those cells shows a neutral grey
      outline that fades once (220ms), never bronze or red, even for a new problem; a second
      change to the same cell pulses again. Undo, Redo, a reload, or switching view, day or
      bunk never pulse; with reduced motion there is none.
    - **One component for both schedules:** the counters and the list below are
      `c-shoresh-week-checks` (coordinator, 2026-10-17), so Generated Schedule (G3) shows the same
      ones. It takes checkWeek's result as it comes (checkWeek says, in `hasCoverageTargets` and
      `hasSpreadTargets`, whether any activity has a weekly minimum or an early-week goal), a
      `reset-key` (a week shown fresh closes the list and brings accepted lines back) and a
      `route` ("manual"; the generated route's lighting of cells is to come). It raises `locate`
      with the clicked line (the page takes the director there) and `accept`.
    - **Counters** under the toolbar, as the desktop's manual route shows them (ScheduleScreen.jsx,
      StatBadge; the desktop is the spec, coordinator 2026-10-17). Each is a tile, its number
      above its words. **Filled** _34 of 120_ (cells filled, of the cells to fill: at camp, not
      fixed or recurring; neutral). The desktop says "Placed"; it is **Filled** here by the
      coordinator's call under Greg's one-word-per-idea rule, because the activity list's
      "2 placed" counts placements, and "Placed" would mean cells in one place and placements
      in the other (coordinator, 2026-10-17). **Overlapping** (always shown): one per cell
      that overlaps, a bunk in a time block where its placement breaks groups at once, one
      division at a time, place capacity, or is booked at an overlapping time, as the desktop's
      `computeOverlaps` flags slots (checkWeek's `overlapping`). **Still needed** (activity and
      bunk pairs short of the weekly minimum, shown only when some activity has one, desktop
      `hasCoverageTargets`) and **Spread across the week** (short of the early-week goal, by
      that day inclusive, only when the week has a day by then; shown only when some activity
      has one, `hasSpreadTargets`). Each number is the number of its lines (Greg, 2026-10-17:
      like the desktop's badges). A zero shows grey and opens nothing, as on the desktop, which
      here wins over the design guide's "leave a zero out" (the desktop is the spec); it stays
      in the tab order (`aria-disabled`), so a counter that drops to zero while it has focus
      keeps it. As on StatBadge, the words are small and quiet under the number, and a tile
      that opens the list has a chevron; the tiles have no "open" look (the desktop's manual
      route has none). The one difference: above zero the tile has a bronze border and the
      number stays in the text colour, where the desktop colours the number (the design guide
      keeps bronze off text; coordinator, 2026-10-17).
    - **One list, "Still to place"** (the desktop's findings rail on the manual route): any
      counter above zero opens it under the counters, with every overlap first, then still
      needed, then spread, in the engine's words (_Bunk 1 · Monday · Period 2: Over its limit
      of 3 bunks at once_, _Swim · Bunk 3: 2 still needed_, _… by Wednesday_). Still needed and
      Spread list group by group, then activity by SortOrder and Id, as the engine does. As
      FindingsRail, it is a panel over the grid (at most 360 by 400 pixels, scrolling inside),
      each line with a bar on its left (bronze; forest for spread) and **Close** at the bottom.
      A counter again, or **Close**, closes it; with nothing left to list it stays open and says
      how many cells are open (_5 open_, or _All placed_; desktop `railEmptyText`). After
      **Close**, focus goes back to the counter that opened it; after **Accept**, to the next
      line (or Close). The grid isn't highlighted by the list (desktop's manual route).
    - **A line takes you there** (desktop `locateFindingsRow`): clicking it (or Enter or Space on
      it) shows that bunk's week in Group View and closes the list; an overlapping cell's line
      also puts keyboard focus on that cell, so its dot's words show and a screen reader reads
      them.
    - **Accept** (the desktop's word, `FindingsRail`): on a still needed or spread line only,
      it hides the line for this visit and the counter drops by one. The line's key carries its
      numbers (desktop `findingDismissKey`), so when they change it comes back. Overlaps have
      nothing to accept: they go when the clash is moved. Accepted lines are forgotten when the
      week, the program or the page changes; nothing is stored.
    - **Waits for part 6:** an activity, place or bunk closed that week (a week exception).
    - **Checked by** `checkWeek`'s own tests in `c/shoreshEngine` (scenario tests and a seeded
      property test against an independent placement-by-placement oracle: every dot's words,
      both lists, the overlap count's lines, Filled), and screen tests here for the counters, the
      list, Accept, a line's jump, the announcement, the dots and their focus, decision 12
      (only the extra session is dotted), the program's divisions reaching the checks, and the
      checks following the week when it is read again.

24. **Part 4a: Clear day, Clear week, Copy day to…** (Greg's round 2 decisions 6 and 7; the
    desktop has none of these, so his decisions and the coordinator's answers of 2026-10-17 are
    the spec). Worked out as runs (`tools.js`) and saved like any other edit, slot by slot with
    the same "keep theirs or use yours" check, each one Undo step.
    - **Only what Undo can put back changes.** Fixed and recurring activities stay where setup
      put them. Anything else that stays is named, with why: an activity deleted since, one
      where its bunk is no longer at camp, or something not set up yet (an imported elective).
    - **Clear day**: in Daily View the day shown, every bunk; in Group View a menu of the
      week's days, clearing that bunk's day. **Clear week**: every day, every bunk, in either
      view. No confirm (decision 6): the line under the toolbar says _Cleared Monday · Undo_
      (_Cleared Bunk 3 · Tuesday_, _Cleared Week 1_; _2 stayed: Archery · Bunk 1 · Monday
      (deleted since); …_ when anything stays), and Undo there (named _Undo Cleared Monday_ for
      screen readers), the toolbar's, or Ctrl+Z puts it all back. With nothing to clear:
      _Nothing to clear on Monday._, or _Nothing cleared on Monday. 2 stayed: …_
    - **Copy day to…** (Daily View): a menu of the week's other days, and _All other days_
      with three or more (decision 7: within the same week only; Greg confirmed, 2026-10-18). On each target day, each
      bunk's activities are replaced by the ones it has on the day shown, at the same time
      blocks (matched by Id). Something already the same there needs nothing; anything else that
      can't go is left out whole and listed: _Copied Monday to Tuesday. 1 left out: Soccer · Bunk
      2 · Tuesday: not at camp then. · Undo_ (also _Lunch is set up there_, _Tuesday has no
      Period 5_ naming the block it lacks, _not on Tuesday_, _deleted since_, _not set up yet_;
      five named at most, then _and N more_). With nothing copied: _Nothing copied. 1 left out:
      …_ or _Tuesday already matches Monday._ No confirm.
    - **Someone else's change in the way** (Greg confirmed, 2026-10-18): a tool isn't
      dropped for one cell. On **Keep theirs**, or when the saved week has changed under it (a
      fixed activity now in a cell it clears, say), it is worked out again on the saved week,
      leaving every cell someone else changed since the director looked as it is now, and the
      rest is made as the same Undo step: _Cleared Monday, except 1 activity that changed ·
      Undo_. **Use yours** makes all of it, as for any edit. While the question is open the line
      isn't shown, and edits wait. The re-plan (`tools.js` `replan`) works from two weeks only:
      the one the director made the tool on (kept with it, never replaced by anything newer)
      and the server's, without the director's own edits still waiting, so those never count
      as anyone else's. A cell is someone else's when the placement it is part of isn't the one
      the director saw (where it starts, how long it runs, what it is), so a placement made
      shorter or longer counts in every cell. A cell kept in any round stays kept in the next. A copy comes from the
      source day as the director saw it; a target whose source cell someone else changed is
      kept. A copied placement and what is there now go whole or not at all, so nothing is
      cleared for a copy that can't come. "Except N" counts the placements holding the cells
      the tool meant to change that won't hold what it meant, in the camp's word for
      activities, the same word as for locked ones (_except 1 activity that changed_, also
      _… and 1 activity that is locked_; Greg approved, 2026-10-18, one word per idea; until then
      it counted cells). A cell may be kept only to keep a placement whole, or hold a fixed
      activity setup put there. Checked
      by `tools.property.test.js`: 3,000 seeded weeks of 4 or 5 days and 5 to 7 blocks,
      activities up to 3 blocks long, others making, lengthening, shortening and clearing
      placements and putting whole rows back, up to four rounds of Keep theirs or Use yours,
      and an edit of the director's own waiting; the server modelled as SlotSaves and
      ScheduleGridRules take an edit. Nothing kept is overwritten, the tool changes only what
      it meant, every placement is left whole, Undo puts the saved week back exactly, "except
      N" is exact, and the director's own edit is never someone else's and saves after the
      tool when its cell is as they saw it.
    - Not on a day that can't be read (only Clear week shows there, and leaves that day), and
      not in Activity View (read-only there, as on the desktop).
    - **Checked by** `tools.test.js` (what each tool changes, leaves, and lists, including
      several-block placements against fixed activities and away times, blocks matched by Id in
      another order or with one inserted, and cells someone else changed) and `dayTools.test.js`
      (the screen: the runs sent, the line and its Undo, Keep theirs and Use yours on a clear, a
      fixed activity appearing, the menu, what stayed and the five-name cap, nothing copied,
      a day that can't be read).

25. **Part 4b: Versions on Manual Build and Start from another week** (desktop VersionsDropdown,
    useSnapshots; Greg's decision 9 and his "Start from another week", 2026-10-17; coordinator's
    answers of the same day). Server: `ManualVersions`, `ManualWeekStart`, through
    `ManualBuildController`; every query in user mode, every write user-mode DML, the draft
    locked while each runs.
    - **Versions** (the shared `c-shoresh-versions`, in its Manual Build form, after a divider
      on the toolbar as on the desktop): the program's week's versions, each with **rename**,
      **delete** and **Restore**, and the footer _Name current version…_ · **Save version**.
    - **Save version** keeps the week as it is now under its name (1 to 80 characters): Status
      Version, Origin Manual, VersionReason Saved by hand, SourceSchedule the draft.
    - **Restore** (the desktop's word, Greg confirmed, 2026-10-18; on the Schedules page the look-only action stays
      **Open**) takes any version of the program's week, from Manual Build or Generated
      Schedule (decision 9), and copies its days into the draft. First the draft as it was is
      kept as a version named _Before Restore_ (VersionReason **Auto-saved**, the value G2 adds
      too), the way back, as on the desktop; a day the version doesn't have leaves the draft.
      Undo starts over (desktop), and the restored version is marked _on screen now_ until the
      next edit. The screen sends back each day's revision as it showed the week; if anyone saved
      a day since, Restore is refused with nothing changed (_Someone else changed this week since
      you opened it, so nothing was restored._ · **Reload**), so a newer week is never replaced
      unseen. Restore waits, disabled, while an edit is saving; the week and program can't be
      changed while it runs, and a reload already on its way can't paint the old week over the
      restored one. A version whose day can't be read is refused, with nothing changed. A version keeps the names it was saved with (ADR 0005 §4), so nothing is
      skipped; setup changed since is part 6's.
    - **Delete** (anyone with Shoresh Scheduler access, coordinator): a second click, as the
      desktop's inline _Delete?_; its days go with it. Only a version of the draft's week; never
      the draft.
    - **Start from another week**, beside Start a blank week while the week has no Manual
      Build: a menu of the program's other weeks' Manual Build, each week's published schedule
      (part 5; named in the camp's word today) and every version of the program, published
      schedules replaced since among them (_Week 2 · Manual Build_, _Week 1 · Published
      schedule_, _Week 1 · Before the trip (version)_). The week starts as Start
      a blank week does (fixed and recurring activities from this week's own setup), then each
      day takes the activities of the source day with the same weekday (in a week longer than
      seven days, first Monday from first Monday, second from second), bunk by bunk, at the
      same time blocks, through the same slot saves as any edit. Only into Open cells where the
      bunk is at camp, and only activities still in setup and running that week; anything else
      stays Open and is listed under the toolbar, never guessed (_Swim · Bunk 3 · Monday: not at
      camp then_; also _not at camp this week_, _not running this week_, _deleted from setup_,
      _not set up yet_, _that day has no Period 5_, _Lunch is there_). A whole source day is never
      dropped silently either: one that can't be read, or a weekday the new week doesn't have
      (a week starting on a Tuesday), or a second Monday the new week doesn't have, is listed
      (_Monday: not in this week_, with the date for a second one). The copy goes in as one edit
      per day. If someone else started the week first, even while this one waited for the
      program's lock, their draft is shown as it is, nothing is copied into it, and the screen
      says so (_Someone else started this week; nothing was copied._). While
      a version is being saved or restored, edits on the grid wait (_One moment: the week is
      being saved or restored._), so Restore never paints over one. The desktop's Duplicate
      week is a whole-week clone with no choice of source; this is Greg's own.
    - **The list** has no line explaining itself; each row's buttons are named for their version
      (_Restore Before the trip_), _Delete?_ is red and said aloud, an auto-saved version says
      _Auto-saved_, buttons are at least 24px, and focus returns to the Versions button after
      Restore or Escape and to the next version after a delete.
    - **Checked by** `ManualVersionsTest` (save, a name needed, Restore with Before Restore, a
      week changed since refused, a day the version lacks, only this program's and week's
      versions, an unreadable day refused, a draft with no days, delete never the draft),
      `ManualWeekStartTest` (matched by weekday, a second Monday, a placement several blocks
      long, a bunk away that week or then, closed, deleted, already there, an unreadable day,
      a week already started, what can and can't be the start, a published schedule and the ones
      it replaced), `versions.test.js` and
      `shoreshVersions.test.js` (the list, Restore and its guards, Save version, Delete?, focus,
      Start from another week and its guards).

## The week editor (extracted from Manual Build)

Generated Schedule needs the same hand-editing as Manual Build, so the drawing and editing of a
week moved into one component, `c-shoresh-week-editor`, with no change in behaviour. Manual Build
keeps choosing the program and week, starting a week, Versions, the week-checks counters and the
Clear day, Clear week and Copy day buttons; it hands the editor the week (`show`) and a saver
(`saveRuns`, which wraps `saveSlots` and turns its refusal into an answer), and hears what changed
(`statechange`, `edited`, `errorchange`, `reload`). The host's own controls sit in the editor's
slots (pickers, tools, checks, status, outcome), so the screen reads the same. The tool buttons call the
editor's `runTool`, so a tool is one step in the same queue and Undo as a typed edit.

The rules modules (`slotEdits`, `moves`, `history`, `conflicts`, `tools`, `counts`) moved into the
editor's folder with their tests, code unchanged: a Lightning component can only import files in
its own folder, so the editor could not reach them where they were.

### What Generated Schedule adds (all off until a host passes it)

Manual Build passes none of these and behaves as before.

- `locks` (cells as "date|groupId|blockId"): a locked cell shows its lock ("Locked", or "Locked
  empty" for a cell kept empty on purpose), can't be dragged, dropped on, picked up or typed
  into, and Enter or a click raises `unlockrequest` {slot, key} and keeps focus on the cell. The
  editor works out beforehand what a hand edit does to locks, as the server does (the whole
  placement of a changed cell is locked when it holds something, unlocked when left Open; what is
  left of a placement made shorter stays locked; a fixed or recurring activity is never locked),
  so the lock shows at once. Every
  run it saves names the locks the screen saw (`locksBefore`); an Undo or Redo also names the
  locks to restore (`locksAfter`, one "1" or "" per time block), the ones from before or after
  the step. No locks passed, no lock fields on the runs.
- `tools`: passing false leaves out the host's `tools` slot only. "Add <name> to activities"
  stays, as on the desktop's generated schedule (review of #67; no decision from Greg to take it
  away); `addActivityWith` is how a host adds on its own draft (Generated: ADR 0010 §41;
  Manual Build's `ManualBuildController.addActivity` when left out).
- `checkWith(days, locks)`: a host's own check of the week, used instead of the editor's
  (Generated's engine check with the locks on screen): its flags draw the dots and its
  `openReasons` a dot on an Open cell. `lit`: the cells the host's counters light up. The editor
  only draws them. `focusCell(key)` puts focus on a grid cell for the host.
- Generated Schedule doesn't unlock on `unlockrequest`: its Lock menu offers that cell's Unlock
  (ADR 0010 §40).
- `saved` {schedule, conflicts, label, kind} after each answered save (the host shows that
  schedule, never a patched copy), `editstate` {busy, queueEmpty}, and `cellfocus` {key, slot,
  cell} when keyboard focus reaches a cell.
- After every answered save the editor takes the locks from, in this order: the saver's `locks`
  (the cells locked now); else the `locks` of each day in the schedule the server sent
  (`ScheduleViews`, every day must carry them); else what its own prediction says the edit left
  (nothing when the edit was a conflict).
- **Nobody's lock is covered unseen.** When a save comes back as a conflict and a cell the edit
  touches is locked on the server but was not locked when the edit was made, the edit is not sent
  again, not even by Use yours: it is dropped (no Undo step left, no lock shown for it) and said
  as "<cell> is locked." (the same words as any other refusal, naming that cell). This holds for
  an Undo and a Redo too. A conflict that changed no lock on the cells it touches is sent again
  as before, after its question if there is one. An edit sent again with nothing new to ask is
  given up after two more tries ("Not saved ... The <week word> kept changing"), rather than sent
  for ever; this guard also runs in Manual Build, which passes no locks.
- **A lock someone took off is not a reason to drop an edit** (review of #67). When a conflict
  comes back with nothing to ask (the cells hold what the director saw, nothing newly locked) and
  a cell the edit touches was locked when the director made it but is no longer locked on the
  server, the edit (or Undo, or Redo) is sent again at once, ahead of the edits waiting behind
  it, naming those cells unlocked as they are now; every lock still held on the server is still
  named as seen. Undo and Redo keep their place. Each resend takes at least one lock out of what
  it names, so it ends.
- **What an edit names as locked is what the director saw when they made it.** Each edit keeps
  the locks on screen at that moment (with the edits waiting before it made) and sends those as
  `locksBefore` whenever it is sent: first, after a wait behind a slow save, again after a
  question or a tool worked out again, and for an Undo or Redo (the locks on screen when it was
  pressed). Never the newest locks the server has since sent, which would cover a lock that
  arrived while the edit waited. The server then refuses and the editor says "<cell> is locked."
- **A clash with another director's hand edit ends in "<cell> is locked."** (coordinator call). A
  hand edit locks the cell it changes, so when two directors change one cell the second one's edit
  is refused with the same words, with no keep-theirs / use-yours question. Reason: the question
  would let the second director cover a lock the first one made on purpose, and a lock is only
  taken off deliberately (the Lock menu), here as everywhere else. A clash on a cell nobody
  locked still asks as before.
- **A tool keeps the other person's locked cells and does the rest** (the same as decision 19's
  tools). Clear day, Clear week, and Copy day that meet a cell locked since the director looked do
  not drop whole: the locked cells are left out, the rest is made as the same Undo step, and the
  notice says what was left, counting activities (placements, once each, as the changed ones are
  counted): "Cleared Monday, except 1 activity that is locked", with them listed as "1 stayed:
  Soccer · Bunk 1 · Monday (locked)." (a copy: "1 left out: …: locked."). With nothing left to
  do it says "Cleared Monday: nothing done, those activities are locked." A cell kept only
  because a lock took its placement out whole is worked out again from the locks in each later
  round, so a second round still says it as locked, not as changed.
- **A longer activity stops at a locked cell**, as it stops at a filled one: it fills the blocks
  before the lock and is shown short ("(1 of 2)"), like a placement cut short in Manual Build.
- **One unlock request per gesture.** A double-click on a locked cell (click, click, double-click),
  or Enter right after a click, raises one `unlockrequest`; the same cell asked again after 600 ms
  is a new gesture.

## Choices (part 5: Publish)

The desktop has no publish (behaviour index, "Publish"; desktop
`docs/adr/2026-07-28-plural-candidate-schedules-per-camp.md`): it never names one schedule final.
So the spec is Greg's: Manual Build round 1 #1 (both schedules get Publish; it copies the draft as
the week's published schedule; publishing again replaces it after a confirm showing what changes;
later draft edits don't touch the copy), round 2 #4 (anyone with Shoresh Scheduler access can
publish; `ScheduleEntry__c` waits until something reads it), wiki decision 0002 (one published
schedule per week; the earlier one is kept as history) and the data model (`PublishedAt__c`,
`PublishedBy__c`, `PublishKey__c`; "Protecting history").

1. **Publish copies the draft** (`SchedulePublish.publish`): a new `Schedule__c` with Status
   Published, the draft's Origin, `SourceSchedule__c` the draft, `PublishedAt__c` now,
   `PublishedBy__c` the user, `PublishKey__c` "programId:weekId", named the camp's word for
   _Published schedule_, with the draft's days copied exactly (grid text and all). No
   `ScheduleEntry__c` rows yet (round 2 #4).
2. **Publishing again replaces it**: every published schedule of the week becomes a Version
   (Status Version, key cleared, `PublishedAt__c` kept), in the same transaction as the new copy.
   It shows in Versions marked _Published_, can be restored and renamed, and is never deleted
   (`ManualVersions.remove` refuses: "… was the published schedule, which is kept as history,
   so it can't be deleted."; the list shows no **delete** for it). `PublishedHistory` and the
   week delete (`WeekExceptions`) count Status Published **or** `PublishedAt__c`, so a week,
   program or season with a replaced published schedule is still kept (ADR 0005 §10 asked for
   this).
3. **What is shown first** (coordinator call under "show problems, never resolve silently").
   Publish asks the server for a preview (`previewPublish`): the published schedule it would
   replace and each cell that would change, "Bunk 1 · Monday · Period 2: Swim → Archery",
   neighbouring blocks with the same change on one line ("Period 1–Period 2"), at most 30 lines
   plus "…and N more." (`PublishedChanges`; cells matched by group and time block record; an
   activity renamed since is a change; locks are not). The screen adds what its counters and dots
   show (`c/shoreshPublish`): "N of M cells still Open.", "N activities need a look." (the camp's word),
   "Overlapping: N", "Still needed: N", "Spread across the week: N" (each only above 0, the last
   two only when the camp has those targets; lines the director accepted are not counted, as the
   counters don't count them). It asks (c-shoresh-ask, _Publish Week 1?_ or
   _Publish Week 1 again?_, **Publish**/Cancel) whenever there is a change or a problem to show;
   a first publish with nothing to show goes at once; a week already published as it is says
   _Week 1 is already published as it is._ and writes nothing (the server agrees: same cells,
   no new copy). Never blocked (round 1 #2 to #4).
4. **Nothing published unseen.** A preview of a week someone saved since the screen read it
   publishes nothing: the screen compares the preview's revisions with its own, shows the
   refusal below and reads the week again. Publish sends back the preview's revisions and the
   published schedule it showed. Someone saved the week since: refused, _Someone else changed this week
   since, so nothing was published. Look it over, then publish again._, and the week is read
   again. Someone published since: _Someone else published this week since, so nothing was
   replaced. …_ Two first publishes at the same moment: the key's uniqueness refuses the second
   the same way. Publish locks the draft (its drafts class) and then the week's published rows,
   never the program, so it can't deadlock with a Generated save (program, then draft).
5. **On screen**: **Publish** (brand button) last on the toolbar, waiting while an edit saves or
   a Restore runs; beside it _Published Oct 18, 10:04 by Pat_ and, once the draft differs,
   _· changed since_ (from `DraftView.published`, worked out on the server by the same
   comparison; an edit on screen marks it at once). While a publish is on its way (and while its
   question is open) edits, Versions and the week and program pickers wait, so its answer,
   published or refused, is always shown; when the question closes, focus returns to Publish.
6. **For Generated Schedule next**: `SchedulePublish` takes any locked draft (Generated's
   `GeneratedDrafts.lockedToEdit` gives one), and `c/shoreshPublish` takes any checks result, so
   wiring Generated is a controller method pair and the same toolbar button. Not wired here.
7. Reads: preview at most 15 queries, publish at most 25 (asserted in `SchedulePublishTest`);
   opening Manual Build adds one query (three when the week is published).

## Choices that are hard to undo after release

None in parts 1 to 3: no new objects, fields, or picklist values. The draft uses ADR 0005's
`Status__c` Draft and `Origin__c` Manual. The slot identity is not stored, only sent between
the screen and the server. Part 4b adds the `VersionReason__c` value **AutoSaved**
("Auto-saved"), the same one Generated Schedule G2 (#46) adds; whichever merges second keeps
the one value. Part 5 adds `Schedule__c.PublishedAt__c` (date/time), `PublishedBy__c` (lookup to
User, cleared if the user is deleted) and `PublishKey__c` (text 40, unique, case-sensitive:
"programId:weekId" while published, cleared when replaced), as the data model names them.

## Not done here

- **Truly simultaneous Starts** are not exercised by a test (Apex tests run one at a time). The
  test calls Start twice; the code takes the program lock before looking again.
