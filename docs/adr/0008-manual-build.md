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
   _Changed (Greg, engine care plan Q18, 2026-10-25):_ nothing from the checks is on the grid any
   more, not even on hover. The dots' words, the setup-changed words and "Rain plan full" are
   rows in the counter's dropdown (the Why list), each naming its bunk, day and time block; a row
   goes to its cell without changing it. The rules below still decide what is said and where.
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
5. **What an edit may not do** (refused with a sentence, nothing saved). _The first two were
   lifted on 2026-10-26: a hand edit is a reminder, never a refusal (part 12)._
   - ~~change, cover, or place a fixed or recurring activity~~ (part 12);
   - ~~place anything in a block where the group is not at camp~~ (part 12);
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
   - (until part 12: only **Open** for something left where the group isn't at camp; now the
     full list, as any slot);
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
    morning-only or afternoon-only groups) is hatched and says _Not at camp_. The legend gains
    that look. (Until part 12 nothing could be placed there; now a hand edit can, reminded.)
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
    - a placement's bottom handle dragged down or up within its bunk and day makes it end at
      the block under the pointer, longer over Open, at-camp slots only (the stretch, below);
    - Shift+Down and Shift+Up add or take off a block.
16. **One way to describe every change** (`moves.js`). The change is made on a copy of the
    rows it touches. Each row is then compared with its original, and the run sent is exactly
    the slots that differ, widened to whole placements. A move within one row is one run; a
    move or swap across rows is two runs in one edit, made together or not at all.
17. **Undo and Redo** (desktop `useUndoRedo.js`; Greg #10), `history.js`:
    - 50 steps per visit; choosing another week clears them, and Versions holds older history
      (part 4);
    - the toolbar buttons are named for the step (_Undo: Swapped Swim and Soccer_), with
      Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y (not inside the typing box; also with nothing
      focused, see "Choices (keyboard…)" §5);
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
      it. A stretch ends on the block under the pointer (see "The stretch").
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
    - **The handle** is a slim bar to see, in a 48 × 24 px area that is all of it to press,
      drag or click (WCAG 2.5.8; changed 2026-10-21, see "The stretch" below). With something
      picked up, a click on the handle puts it down like a click anywhere on the cell.
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
    week is (window focus, reload, or setup saved on another Camp Setup screen, which hands
    Manual Build a new `setup` for the same week: review round 6; when the week can't be read
    again just then, as while an edit saves, its setup changes still are, round 7), and anything changed elsewhere
    shows at once; the activity
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
      (removed); …_ when anything stays; _deleted since_ until 2026-10-20, ADR 0010 §13), and Undo there (named _Undo Cleared Monday_ for
      screen readers), the toolbar's, or Ctrl+Z puts it all back. With nothing to clear:
      _Nothing to clear on Monday._, or _Nothing cleared on Monday. 2 stayed: …_
    - **Copy day to…** (Daily View): a menu of the week's other days, and _All other days_
      with three or more (decision 7: within the same week only; Greg confirmed, 2026-10-18). On each target day, each
      bunk's activities are replaced by the ones it has on the day shown, at the same time
      blocks (matched by Id). Something already the same there needs nothing; anything else that
      can't go is left out whole and listed: _Copied Monday to Tuesday. 1 left out: Soccer · Bunk
      2 · Tuesday: not at camp then. · Undo_ (also _Lunch is set up there_, _Tuesday has no
      Period 5_ naming the block it lacks, _not on Tuesday_, _removed_, _not set up yet_;
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
      schedule_, _Week 1 · Before the trip (version) · Jun 29, 9:00 AM_). A version shows when
      it was saved after its name, as Versions does, so two with the same name can be told apart
      (coordinator, 2026-10-19); a copy still named by when it was published (part 5 item 11)
      shows no second time, since its name already says it. The week starts as Start
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
  given up after two more tries ("Your change wasn't saved: ... The <week word> kept changing"), rather than sent
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
   It is named by when it was published (Greg, 2026-10-19): _Published Oct 18, 2:40 PM_, in the
   user's time zone and as their locale writes the time (a 24-hour clock where it uses one), as
   the screen shows _Published …_ beside Publish; the same moment always gives the same name. One
   someone renamed while it was published keeps their name (`PublishedRows.keepAsHistory`).
   It shows in Versions marked _Published_, can be restored and renamed, and is never deleted
   (`ManualVersions.remove` refuses: "… was the published schedule, which is kept as history,
   so it can't be deleted."; the list shows no **delete** for it). `PublishedHistory` and the
   week delete (`WeekExceptions`) count Status Published **or** `PublishedAt__c`, so a week,
   program or season with a replaced published schedule is still kept (ADR 0005 §10 asked for
   this).
3. **What is shown first** (coordinator call under "show problems, never resolve silently").
   Publish asks the server for a preview (`previewPublish`): the published schedule it would
   replace and each cell that would change, "Bunk 1 · Monday · Period 2: Swim → Archery",
   neighbouring blocks with the same change on one line, named as the rest of the app names a
   run of blocks ("Period 1 – Period 2", as c/shoreshSetupRules does; "9:00 AM – 10:45 AM" when
   either end is a block named by its own times, as `TimeBlockTriggerHandler.rangeLabel` names
   one), at most 30 lines
   plus "…and N more." (`PublishedChanges`; cells matched by group and time block record; an
   activity renamed since is a change, since a Manual Build draft is published by setup's names
   now, as the screen shows it (`ManualBuildNamesNow`, part 6 item 2); so is a bunk or time block
   renamed since, one line each for the week, first, counted as one change each:
   "Renamed: Group A → Bunk Aleph" (`PublishedRenames`; review round 4, wording kept by
   coordinator call in review round 5: otherwise a rename alone would never reach staff); so is a
   time block at new times (Update to match setup moves them, review round 5), one line for the
   week after the renames: "New times: Period 2, 10:00 AM – 10:45 AM → 10:30 AM – 11:15 AM" (a
   block named by its times says them in its rename instead, when its first day moved; moved on
   a later day only, it has a line of its own, "New times: 9:00 AM – 9:45 AM → 9:30 AM – 10:15
   AM", review round 6); locks are not). The question's
   first line counts each kind in plain words, never a rename as a cell: "This replaces the
   published schedule. 1 cell and 1 name change:", "… 1 time block changes:" (the camp's word;
   `renameCount` and `retimeCount` of `changeCount`). The screen adds what its counters and dots
   show (`c/shoreshPublish`): "Filled: X of Y" while cells are Open (until 2026-10-20 "N of M
   cells still Open."; the counters' own words on both screens, Greg's decision 3, ADR 0010 §55),
   "N activities need a look." (the camp's word),
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
   since, so nothing was published._, and the week is read
   again. Someone published since: _Someone else published this week since, so nothing was
   replaced. …_ Two first publishes at the same moment: the key's uniqueness refuses the second
   the same way. Publish locks the draft (its drafts class) and then the week's published rows,
   never the program, so it can't deadlock with a Generated save (program, then draft).
5. **On screen**: **Publish** (brand button) last on the toolbar, after Versions, both at the
   toolbar's right edge as on Generated Schedule and the desktop (a spacer before Versions' divider,
   2026-10-20, ADR 0010 §55), waiting while an edit saves,
   a Restore runs or the week is being read again (so its question is never worked out from a
   view about to be replaced; Unpublish waits the same way); beside it _Published from Manual Build Oct 18, 10:04 AM by Pat_ (item 12) and, once the draft differs,
   _· changed since_ (from `DraftView.published`, worked out on the server by the same
   comparison; an edit on screen marks it at once). While a publish is on its way (and while its
   question is open) edits, Versions and the week and program pickers wait, so its answer,
   published or refused, is always shown; when the question closes, focus returns to Publish.
6. **For Generated Schedule next**: `SchedulePublish` takes any locked draft (Generated's
   `GeneratedDrafts.lockedToEdit` gives one), and `c/shoreshPublish` takes any checks result, so
   wiring Generated is a controller method pair and the same toolbar button. Wired since (ADR
   0010 "Choices (Publish)").
7. Reads: preview at most 6 queries (7 since ADR 0014 slice 5: the week's special days), publish
   at most 15, unpublish at most 8 (asserted in `SchedulePublishTest`); opening Manual Build adds
   one query (three when the week is published).
8. **Unpublish** (Greg, 2026-10-18). **Unpublish** (neutral button) sits beside **Publish**, shown
   only while the week has a published schedule. It asks first (c-shoresh-ask, _Unpublish Week
   1?_ / _Nothing will be published for this week._, **Unpublish**/Cancel, Cancel focused); then
   `SchedulePublish.unpublish` turns the week's published schedule into a version exactly as a
   replaced one (Status Version, key cleared, `PublishedAt__c` and `PublishedBy__c` kept, named by
   when it was published as in item 2), so it is
   in Versions marked _Published_, can be restored and renamed, and is never deleted (decision
   0002). The week then has no published schedule, and publishing again later is a first publish.
   It names the published schedule the screen showed; one published or unpublished since:
   refused, nothing written, _Someone else published or unpublished this week since, so nothing
   was unpublished._, and the week is read again. Draft saves don't
   refuse it: it doesn't touch the draft. While it runs (and while its question is open) edits,
   Versions and the pickers wait, as for Publish; focus then returns to Unpublish, or to Publish
   once Unpublish is gone. It takes any locked draft, like publish, so Generated reuses it as is.
9. **Published history is kept at the data level** (`PublishedGuard`, before triggers on
   `Schedule__c` and `ScheduleDay__c`). A schedule that is or was published (Status Published or
   any of `PublishedAt__c`, `PublishedBy__c`, `PublishKey__c` set), and its days, change only
   inside Shoresh's Publish, Unpublish and rename (`SchedulePublish` and
   `SchedulesController.renameSchedule` call `PublishedGuard.allow()` and `done()` around their
   writes). Anything else, a
   record page, list view, import or the API, in user or system mode, is refused in the camp's
   words: _"Published schedule" is the published schedule, which is kept as history, so only
   Publish, Unpublish and rename in Shoresh can change it._ (_was the_ for one kept as history; _…
   so it can't be deleted._; _… so its days can't be changed._). Making a schedule published any
   other way is refused too (_Only Publish in Shoresh can make the published schedule._). One is
   never deleted, not even by Shoresh. Field permissions stay editable because Publish writes in
   user mode. Checking days costs at most one query per schedule per transaction (a schedule
   found not to be history is remembered until it is updated).
10. **Greg's other answers (2026-10-18)**: the Schedules page keeps showing the newest version, as
    it does (it doesn't switch to the published schedule); a first publish with nothing to show
    publishes at once (no question), as built in item 3; published schedules replaced by a later
    publish stay as history (item 2), and so do unpublished ones (item 8).
11. **Greg's decision (2026-10-19)**: a copy that is no longer the published one (replaced or
    unpublished) is named in Versions by when it was published, _Published Oct 18, 2:40 PM_
    (items 2 and 8), so the week's history reads as a list of publishes rather than several
    _Published schedule_ rows.
12. **Greg's decision (2026-10-19)**: the Published line names the screen the week was published
    from, on both screens. Greg said "from Generated"; the builder used the screen's full name, as
    Versions does: _Published from Manual Build Oct 18, 10:04 AM by Pat · changed since_,
    or _Published from Generated Schedule …_. A week has one published schedule whichever screen
    published it, so Manual Build can show one published from Generated Schedule and the other
    way round. The screen comes from what the published copy already records, its `Origin__c`
    (Publish copies the draft's: Manual or Generated), sent as `PublishState.origin`; no new
    field and no extra query. The screen names are fixed words (as in Versions), not camp words.
    One whose `Origin__c` names neither screen (made before Publish, with no Origin) says
    _Published Oct 18, …_ as before (`c/shoreshPublish` `publishedWord`).

## Choices (part 6: setup changed since the week started)

The desktop writes fixed and recurring events in once, at Start, and never updates them; changing
setup later leaves the week as it was, with no refresh short of a new blank week (desktop
`src/screens/schedule/useGeneration.js`; wiki behaviour index, "Fixed/recurring events frozen at
start"). It marks a placement whose activity, group or place is closed that week ("is marked
closed this week", `src/utils/computeWeekClosures.js`), and never corrects it. Greg chose more:
placements stay, mismatches get a dot, and "Update to match setup" for all or per slot (Manual
Build round 1 #5); a setup rename shows the new name, with no dot (round 2 #3).

1. **What "setup now" is** (`SetupMatch`, `SetupMatchCarry`): Start a blank week's day for each
   date (`BlankWeek`: today's time blocks, the groups at camp this week, fixed and recurring
   activities where `SetTimePlan` puts them), with each of the director's placements carried
   over whole, at the same group and time blocks (matched by record Id), when it still fits:
   its activity is still in the season and running this week (not closed, itself or by its
   place), its group and blocks are still there and in the same order, the group is at camp
   then, and no fixed or recurring activity is now there. Things not set up in Shoresh yet (an
   imported elective) are carried like activities: there is nothing in setup to compare them
   with. Placements go in the order of the day, so the same draft and setup always give the same
   answer (product principle: same inputs, same output).
2. **Dots** (`SetupMatchDots`): every cell of a placement that would not stay as it is, and every
   Open cell a fixed or recurring activity is now set up in, gets the bronze dot with why:
   _Deleted from setup_, _Not running this week_ (camp word; an activity closed by its place
   names the place instead, _Pool is closed this week_, as the desktop's computeWeekClosures.js
   and Generated Schedule do), _Not at camp this week_, _No longer
   in Main_, _Period 5 is no longer set up_, _Its periods changed_ (a block added inside a
   placement), _Not at camp then_ (a bunk now mornings only), _Lunch is set up here now_, _Not
   set up here now_ (a fixed or recurring activity moved or ended), _Not a day of Main now_. A
   fixed or recurring activity's own cell says why when its group or time blocks changed, in the
   same words (_Not at camp this week_, _Not at camp then_, _Period 5 is no longer set up_);
   _Not set up here now_ only when the activity itself moved or ended. **An activity closed this
   week can still be placed by hand** (coordinator call, review round 3), as on the desktop,
   which marks it ("is marked closed this week", `src/utils/computeWeekClosures.js`) rather than
   refusing it: its cell gets _Not running this week_, and the box and the list offer to take it
   out again. The director sees it and chooses; nothing is resolved silently.
   The words join any other dot on the placement after " · " (_Not set up for Bunk 2 · Deleted
   from setup_). The editor takes them as `setupDots` (cell key to words); that is its only
   change. Cells are compared by record Id, so a rename is never a dot: Manual Build shows the
   draft's time blocks, groups, activities and fixed and recurring activities by their names in
   setup now (`ManualBuildNamesNow`), on opening the week and in the week every save sends
   back, and Publish puts out those names, so what staff read is what the director sees (the
   published state's "changed since" counts a rename too). What is saved keeps the names it was
   saved with. A time block whose times changed keeps its saved name on screen until the change is
   made: its row shows the week's times, and a name that is its new time range (an unnamed block
   follows its times) would contradict them. A bunk moved to another unit is the "Not set up for" dot of part 3 (round 1
   #3), not a setup-changed one.
3. **Changes** (`SetupMatchClusters`, `SetupMatchLines`): the cells that differ are grouped so a
   group takes whole placements on both sides (a differing cell, every cell of its placements in
   the draft and in setup now, and theirs in turn). Making one alone always leaves a whole day.
   Each is one line: _Bunk 1 · Monday · Period 2_ · _Swim → Open_ · _Deleted from setup_. When a
   day's time blocks or groups changed (a block added or removed or at new times, a bunk away
   this week or added) the whole day is one change, its summary first (_Monday: Period 3 added,
   Period 2 now 10:30 AM – 11:15 AM, Bunk 3 not at camp this week_) and then the lines of what
   moves with it. New times are compared like the blocks themselves (`SetupMatchCells.sameFrame`)
   and have no dot, as a block added has none: the desktop freezes them at Start, and leaving
   them unflagged would keep old times on screen and in what is published. A day the program no longer runs
   is one change (_Monday: not a day of Main now_), and so is a new one (_Tuesday: added_). A day
   that can't be read is left as it is.
4. **Shown first, chosen by the director.** The screen asks for the changes on its own request
   (`SetupMatchController.getSetupChanges`), whenever the week is read, after a Restore or an
   update, and after a save while the week differs from setup or a closed activity exists
   (placing one makes a new difference). A bronze box above the grid says _Week 1 doesn't match
   setup_ with **Update to match setup**: true whatever made the difference ("setup changed
   since this week started" would not be after a closed activity was placed by hand). A late
   answer for the week shown before is dropped once another week is chosen. That opens `c-shoresh-setup-match`, read
   fresh: every change, each with its own **Update** (the "per slot" of round 1 #5), and
   **Update all** for every change listed; **Cancel** first, as on c-shoresh-ask. Edits,
   Versions, Publish, the pickers and the reread on coming back to the window wait while it is
   read, open or updating; while an update is on its way, Cancel and Escape wait too (its answer
   is for the list as it was), and focus waits on the list itself, never leaving the dialog.
   After one change the list stays with what is left and says so from a live region inside the
   dialog (the refusal below too), read out each time even when the words are the same as the
   last; focus goes to the first row's Update. After Update all it closes, says how many changes
   were made, and focus goes back to **Update to match setup**, or on to **Publish** when the
   box is gone with nothing left. After an update the publish line, the checks and Versions are
   those of the week as it is now (no longer a version restored; a version just kept listed). If the changes can't be read, the dots and the box stay as
   last read and the screen says it couldn't check (never a week that only looks as if it
   matched).
5. **Nothing changed unseen** (`SetupMatch.make`, under the draft's lock): each change's key is
   a digest of exactly the cells it changes, from what to what. The update sends the keys and the
   week's revisions the list was worked out on. Someone saved a day since: refused, nothing
   changed, _Someone else changed this week since, so nothing was updated._, and the week is read
   again. Setup changed again so a chosen change is no longer the one shown (the key isn't
   offered now): refused, nothing changed, and the list shows what it would change now (_Setup
   changed again since you looked, so nothing was updated. …_). A change that takes away or
   replaces one of the director's own placements first keeps the week as it was as an automatic
   version, _Before Update to match setup_ (VersionReason Auto-saved, as before Restore), **once
   per opening of the list** (coordinator call, review round 3): the first update in that
   opening that takes a placement keeps it, and later ones in the same opening keep none (the
   screen sends `versionKept`; the server answers `kept`), so updating row by row leaves one way
   back, the week as it was before the list's first such change, not one version per row.
   Opening the list again starts a new opening. Undo starts over afterwards, as after Restore.
   The published copy is never touched. What the update sends (`SetupMatch.Ask`) is a class of
   properties (`{ get; set; }`), as every class a screen sends is: Salesforce leaves a plain field
   empty, so until 2026-10-20 every update arrived with no revisions and was refused as changed
   since, with nobody else editing (found by the real-browser check; `npm run check:aura-inputs`
   now fails on any such field).
6. **The week can't be laid out from setup now** (no time blocks, no group at camp this week,
   no day it runs, no access to its set-time items): the box says why in Start's own words and
   offers no update; nothing is guessed.
7. Reads: getting the changes at most 13 queries, an update at most 45, the view sent back
   included (asserted in `SetupMatchTest` on its small camp: measured 10 and 37; on a camp of 8
   groups, 5 days and 8 time blocks 15 and 45, whether one change or all). Opening Manual Build reads nothing more.
8. **Checked by** `SetupMatchTest` (as a scheduler, data inside `runAs`): nothing to show; a
   deleted activity (dot, line, update by key, version kept); closed this week; a fixed activity
   added (per cell, deterministic keys, no version); one over a director's placement; a rename
   with no dot, still shown after an edit and published as shown; a time block added; a time block at new times (one change a day, the saved name
   shown until made, then the new times and name); a bunk away this week (one change a day); a
   bunk no longer in the program; a time block no longer set up; one added inside a placement; a
   fixed activity ended; a day the program no longer runs; a bunk now mornings only; a week saved
   since; setup changed again since; only a Manual Build draft; one version per opening of the
   list; a fixed activity whose group is away or now mornings only. Screen:
   `setupMatch.test.js` (dots, joined words, a dot on any block of a longer placement, said once,
   the box, the list read fresh, per-change and Update all, Cancel and where focus goes, both
   refusals, a failed update or read, an older answer dropped, another week and a late answer for
   the last one, when it reads again, Undo starting over, what waits while the list is read,
   open or updating, focus and words after Update all, the publish line, checks and Versions
   after an update, one version per opening) and `shoreshSetupMatch.test.js` (the list, focus,
   Tab, Escape, busy and focus while busy, the same words read out again, accessibility).

9. **Generated Schedule uses the same path** (Greg's look-and-feel decision 1, 2026-10-20; ADR
   0010 §56): `SetupMatch` takes a Generated draft too, keeps its locks on every cell an update
   leaves as it was (`SetupMatchLocks`), and sends no view back for it (that screen reads its
   week again). Manual Build's behaviour and query bounds are unchanged.

10. **Also at the foot of the menu** (round 13 mock-up, wiki decision 39; ADR 0015 §9). While the
    week shown can be updated to match setup, the menu's foot says _Setup changed_ with **Update
    to match setup** under it, as the mock-up draws it. It is the same action as the button above
    the grid (the screen's `updateToMatchSetup()`, which opens the same list), held while that
    button is held. Each schedule screen tells the page (`setupstate { changed, busy }`) only
    when either changes. Focus after the list closes still goes to the button above the grid; it
    moves to the menu's when the next design PR takes that line off the screen.

## Choices (keyboard, screen readers and words, 2026-10-20)

From the look-and-feel review of the scheduling screens (findings the coordinator decides,
following the desktop; Greg's part-A calls are in ADR 0010 §55 and §56). The same rules hold on
Generated Schedule (ADR 0010 §57).

1. **Focus lands somewhere useful after every tool, menu and dialog** (WCAG 2.4.3).
   - After **Clear day**, **Copy day to…** and **Clear week**, focus goes to the line's **Undo**
     (`tool-undo`): the most useful next stop, and the menu that ran it may be held while it
     saves, which would drop focus to the page.
   - After **Update to match setup** closes with nothing left to change, its button is gone with
     the box: focus goes to the grid's cell, not to Publish (which may not be there) or the page.
     With changes left, or after Cancel, it goes back to the button, as before.
   - **Versions:** a rename puts focus in its name box (the desktop's `autoFocus`), and after it
     is saved or let go (Escape) focus goes to that version's rename; the list's own focus rules
     (Restore, Escape, delete) are unchanged. A click inside
     the list or on its button is noted by the list itself, so the page-wide "click elsewhere
     closes it" listener lets it be: in Salesforce that listener sees the component through a
     wrapper, so asking whether the click's path held the component's own element always said no
     and the list closed the moment it opened (real-browser check, 2026-10-20).
   - After **Start a blank week** or **Start from another week**, the buttons are gone with the
     week started: focus goes to the new week's first cell, unless the director has put it
     somewhere else meanwhile (it fell to the page before, real-browser check 2026-10-20). The
     editor's `focusCell` waits for its grid when the week is not drawn yet.
   - The counters' list closes with **Escape** too, focus back to the counter that opened it.
2. **One polite live region per screen**: the week editor's. Versions says _Delete …? Press
   again to delete._ through it (`announceWith`); it keeps a region of its own only where the page
   gives none (the Schedules page). The Update-to-match dialog keeps its region: it is modal, and a
   screen reader in it hears only it.
3. **Named controls, nothing by colour alone.** The Versions button is a plain button carrying
   `aria-expanded` itself (a `lightning-button` may not pass it on). _Changed since_ after the
   published date is the "needs a look" dot (its words on hover, focus and for screen readers)
   rather than four small grey words; the published line is a shade darker (#5c6670, WCAG 1.4.3).
   The setup-changed line's words stay `aria-hidden`: the dot beside it always gives them to
   screen readers (`c-shoresh-dot` assistive text).
4. **Fewer, camp words.** A day that can't be read says _Monday can't be shown. Nothing on it was
   changed._ (Group and Activity View: _Can't be shown_), never the server's reason about how
   the day is stored. _Already as you had it._ is _Already done._; _Redo skipped._ is _Redo
   wasn't made._ The counters' list is headed by the counter whose lines it shows (generated
   route), else _Still to place_. In Update to match setup, _Setup changed again, so nothing was
   updated._ (the list shows what it would change now, in place), and **Cancel** reads **Close**
   once an update was made in that opening. Kept as the desktop words them: _Auto-saved_,
   _Accept_, _Rebuild this schedule?_ with _Saved to Versions first._, _Let the app propose one_
   above _Generate a schedule_. (_deleted since_ became the desktop's _(removed)_ on 2026-10-20,
   ADR 0010 §13.)

5. **Ctrl+Z works wherever the director is, and never in a box** (Greg's end-to-end check,
   2026-10-20: "undo should be control z"; desktop `useUndoRedo.js`, which listens on the whole
   window). The shortcut used to work only while focus was inside the week editor; after a
   click on the page's background, or a drag (which moves no focus), focus is on the page and
   the keys did nothing. Now:
   - **Ctrl+Z** (Cmd+Z on a Mac) undoes, **Ctrl+Shift+Z** (Cmd+Shift+Z) or **Ctrl+Y** redoes,
     with focus in the editor or on nothing at all; the live region says _Undone: …_ or
     _Redone: …_, as the buttons do. Ctrl+Alt (AltGr on some keyboards) is left alone.
   - Only the week editor on screen acts: a screen visited earlier stays in the page, hidden, and
     ignores the keys. Focus anywhere else on the page (Salesforce's search, the menu, a
     picker) keeps its own keys.
   - **A box keeps its own Undo**: the typing box, any text box or Salesforce text field the key
     passes through, the activity list's **Filter**, and the Versions name boxes. In Salesforce an
     event's path stops at another component's edge, so the editor can't see the Filter or a
     name box behind the list or the Versions panel: those two components keep Ctrl/Cmd+Z and Y
     to themselves instead (the box still undoes its own typing). Before this, Ctrl+Z in Filter
     undid a schedule change in the real browser although Jest, which shows the whole path,
     said it didn't (real-browser check, 2026-10-20).
     Generated Schedule uses the same editor, so the same keys hold there.

Checked by Jest: focus on the line's Undo after Clear day and Group View's Clear day; focus on
the grid after Update to match setup leaves nothing; the dialog's Close; the day-problem words;
Versions' button, rename focus and `announceWith`, and the list staying open when a page-wide
listener sees the click through a wrapper; focus on the first cell after Start; the counters'
heading and Escape; Ctrl/Cmd+Z and redo with nothing focused on Manual Build and Generated, not
while hidden or from a box elsewhere, Filter and the Versions name boxes keeping theirs. The
real-browser check (`scripts/a11y-browser-check.mjs`) presses them on Manual Build: on the grid,
with nothing focused, and in Filter.

## Choices (the stretch, 2026-10-21)

Greg's report: he pressed a placement's blue handle, saw the up-and-down arrows, dragged down,
and the cells did not merge. In the real browser the handle used HTML drag and drop: only the
5 px bar lengthened, a press a few pixels off it (still inside the handle's area, as a trackpad
press lands) dragged the whole placement, so Swim moved down a block instead of getting longer;
nothing on screen changed until the drop, so there was no telling which of the two was
happening; a drop on a filled slot or above the start changed nothing until a line appeared
afterwards; and touch and pen never start an HTML drag. Jest passed because it fired a made-up
`dragstart` on the bar, and the real-browser check never dragged it.

1. **Pointer events, like the desktop** (`useSpanExtendDrag.js`: pointerdown on the handle,
   pointermove, pointerup; the grid holds the pointer with `setPointerCapture`). Mouse, trackpad,
   pen and touch, in Chrome and Safari alike. The whole 48 × 24 px handle area starts it, never a
   move of the placement (the browser's own drag from there is cancelled); `touch-action: none`
   so a finger stretches instead of scrolling. A press that moves less than 4 px is still a
   click (the click-to-choose-where-it-ends path stays, WCAG 2.5.7).
2. **Live.** While held, the cell itself spans the blocks it will run (drawn over the Open slots
   it covers, outlined), growing or shrinking as the pointer crosses each block's line.
3. **It stops at a filled slot, like the desktop** (§7: over Open, at-camp slots only). The slot
   that stops it shows a ghost: what is there faded, under the stretched name struck through in a
   dashed grey box (the desktop's drag-replace ghost in its neutral drag-truncated colour). On
   letting go it keeps what it reached, as the desktop does; if it reached nothing new, the quiet
   line says why with the existing words (_Swim doesn't fit there._). Above its first block it
   says _Swim can't end before it starts._ Back where it started, nothing changes.
4. **Escape** while holding lets go with no change. Shift+Up and Shift+Down are unchanged.

Checked by Jest (`moving.test.js`, pointer events step by step across a block's line): the live
span while held and the save on letting go; the ghost and the words at a filled slot; shortening
and above the start; Escape; a press that doesn't move is still a click; a second pointer doesn't
stretch; a browser drag from the handle never moves the placement. The real-browser check drags
it with the mouse on Manual Build (press below the bar, small steps into the fixed activity two
blocks down): the span grows live, the ghost shows, it runs two blocks after, Ctrl+Z puts it
back. Tried by hand in the real browser on Manual Build and Generated Schedule: down into Open,
into a filled slot, up, across two blocks into a fixed activity, a slow jittery drag, script-sent
pointer events with a pointerId (as Safari sends them), and touch.

## Choices (part 7: the rail, Edit and the counter, 2026-10-21)

Design build step 2a (ADR 0015 is step 1). Source: Greg's decisions 36 to 41 (wiki
`projects/shoresh-scheduling-sf.md`, "round 13 with rail layout B"), the visual spec in
`docs/design/` (`manual-build.html` `#b` and `#open`, `spacing-spec.md`,
`spacing-spec-continuous.md`). The desktop stays the floor for what each control does and says;
the look is the mock-up's. This step does the frame, the rail, Edit and the counter; the grid,
the drawer under it and the same-activity outlines come in step 2b (the next PR), so until then
the grid and the activity list on its left keep their look.

1. **One frame.** Under the season row the schedule is zones of the frame itself: the rail, one
   hairline, then the week (status lines, the activity list and the grid). The frame's body loses
   its inset for the two schedules (`body_flush` in Camp Setup), so the hairlines run edge to
   edge and each zone keeps its own 12 inset. The screen's title is no longer shown (decision
   36: the menu already says which screen this is); it stays as the heading screen readers land
   on.
2. **The rail, layout B** (`spacing-spec.md` part 2). Three parts: the left starts with a head
   start of the grid's time column and its gap, so the days in the middle sit over the grid's
   cells. Left: the week, then **Edit**, then the screen's own menu (Generated's **Build**), then
   **Daily / Group / Activity** against the days. Middle: **Mon** to **Fri** (no dates, decision
   33; read out in full, "Monday, Jun 29"), or the bunks in Group View. Right: the counter, a
   line, then **Versions**, **Published** (when the week has a published schedule) and
   **Publish**. A part never gets narrower than what it holds: with too little room the days give
   up a little of their centring rather than slide under the views; under 1200 px the parts wrap.
3. **One grammar** (`spacing-spec-continuous.md`, "The grammar"; classes in `c/shoreshTokens`):
   every item 32 tall, 8 side padding, 13 px Inter; at rest regular in the secondary words, a
   value medium in the text colour; the current choice (the week, the view, the day or bunk) is
   the one raised look; a menu is its word and a 12 px chevron and is never raised while closed
   (raised while open); one thin line, 8 each side, between groups; **Publish** is the only
   filled control. Keyboard focus is the highlight ring outside the item.
4. **The week** (`c-shoresh-rail-picker`): an arrow either side of the week, the week raised
   ("‹ Week 3 ›"). The arrows step to the week before or after ("Previous: Week 2"); the week
   itself opens every week of the season in a menu, so any week is still one choice away (the
   combobox it replaces could do that). It takes and gives what `lightning-combobox` did (label,
   value, options, disabled, change), so the screen uses it the same way. With several programs
   the program is a word and its chevron before it. At the first or last week the arrow just
   pressed goes dim; focus then moves to the week itself, which says the week now shown, so it
   never drops to the page.
5. **Edit** (decision 36) holds **Undo** and **Redo** with their keys (⌘Z and ⇧⌘Z on a Mac,
   Ctrl+Z and Ctrl+Shift+Z elsewhere; `aria-keyshortcuts`), a line, then Manual Build's tools:
   **Clear day**, **Copy day to…**, **Clear week** (Group View: **Clear day** with the bunk's
   days under it; none in Activity View). _Since 2026-10-22 (ADR 0019): then, after a line,
   **Rainy day…** with the week's days under it, on Generated Schedule too._ **Copy day to…** opens its days under it, one step in,
   and keeps the menu open. Everything they did is unchanged (part 4a): no confirm, one Undo step,
   the line with its Undo, focus on that Undo after. After the line's own Undo, focus goes to
   Edit (the line is gone, and Undo is in Edit). Keys, as a menu button: Enter, Space or Down open
   it on the first row it can use, Up on the last; Up, Down, Home and End move; Escape closes it
   with focus back on Edit; Tab closes it and moves on; a click elsewhere closes it. Ctrl+Z works
   as before, menu open or not. The rail menu is one component, `c-shoresh-rail-pop`, used for
   Edit, Build, Published and the counter, each with its own rows slotted in.
6. **The counter** (decisions 38 and 41) replaces the counter cards (Filled, Overlapping, Still
   needed, Spread across the week) with one rail item, **29 of 35 placed**, and the needs-a-look
   corner when anything is off target. It opens a dropdown in Edit's look: a slim bar of what is
   placed, **N still needed** (cells still to fill), **N under** with each activity short of its
   weekly goal (_Swim 3 of 4_), **N over** with each activity past its weekly limit (the corner,
   _Soccer 4 of 3_), then **N to look at**: each cell whose placement breaks a rule shared with
   other cells and each bunk still short of an early-week goal, in checkWeek's words (the earlier
   Overlapping and Spread lines). An under or over row shows that activity in Activity View; a
   line to look at takes the director to the bunk's week with focus on the cell, as before.
   Under and over show their 0 when the camp has goals or limits (the desktop's grey 0) and are
   left out when it has none; to look at shows only with something in it.
   - **"Under" means one thing everywhere** (`spacing-spec.md` part 1): an activity's goal is its
     times a week for each bunk it is set up for; a bunk counts only up to its own goal, so one
     bunk's extra never makes up for another's shortfall. _N under_ is every bunk's shortfall
     added up. Over counts only the bunks past the limit: what they have, of what they may have.
     The numbers come from `measureWeek` in `c/shoreshEngine`, worked out once from the week's
     check (the same one that draws the dots), so the counter, its rows and the drawer (step 2b)
     can never disagree. It measures only the activities that check checks: on Generated, an
     activity closed this week (itself or by its place) is never _under_ or _over_, as it has no
     dots or Open reasons either.
   - **What went with the cards:** the desktop's **Accept** (hiding a still needed or spread line
     for the visit) and, on Generated, a counter lighting its cells and **Review all**. The
     approved dropdown has no place for them; what Accept hid is now counted per activity, and
     the cells it is about carry their corner. Publish still asks with the week's own checks
     (`c/shoreshPublish`, unchanged words; see "Not done here"). _Accept came back in part 8
     (Greg's decision 43); the same-activity outlines replace lighting cells._
7. **Published.** The published line (_Published from Manual Build Oct 18, 2:40 PM by Pat_, with
   _Changed since_) and **Unpublish** move into a **Published** dropdown beside Publish, the
   corner on its word when the week changed since it was published. Unpublish asks as before;
   focus goes back to Published after its question (to Unpublish while the dropdown is open, to
   Publish once nothing is published).
8. **Versions** is a rail menu: its word and chevron, raised while open, its panel in Edit's
   look. What it does is unchanged.
9. **Setup changed lives only at the menu's foot** (ADR 0015 §9): the line and its button above
   the grid are gone. The cells keep their marks; the menu's **Update to match setup** opens the
   same list. When the list closes, focus goes back to the menu's Update (the screen asks the
   page, `setupfocus`), or to the grid once the week matches setup. A week that can't be
   compared with setup still says why, on a quiet line under the rail, so that is never hidden.

Checked by Jest: `shoreshRailPop.test.js` (one item, never raised closed, a menu's keys, select,
rows that open rows, a click outside, Tab, held), `shoreshRailPicker.test.js` (arrows, focus
to the week when an arrow goes dim at either end, the raised week, every week in its menu, change, held), `measure.test.js` (placed, still needed,
under per bunk, not set up, closed this week, over, order, look, same inputs same measure),
`shoreshWeekChecks.test.js` (the item, the corner, the dropdown's parts, the 0s, rows to an
activity, lines to a cell, Escape, a week shown fresh), and the screens' suites (Edit's rows in
order and none in Activity View, Copy day to… opening its days, focus to Edit after the line's
Undo, the counter's numbers on real checks, Published and Unpublish, the menu's Update and focus
back to it). In the test org: `scripts/a11y-browser-check.mjs` opens Edit, Build, the counter
and Published with the keyboard (rows, Escape, focus), presses '›' onto the last week (focus on
the week) and runs axe with the counter open;
screenshots next to the mock-up in `docs/design/screens/`.

## Choices (part 8: the grid, the drawer and the outlines, 2026-10-21)

Design build step 2b, on step 2a (part 7). Source: Greg's decisions 36 to 43 (wiki
`projects/shoresh-scheduling-sf.md`), the visual spec in `docs/design/` (`manual-build.html`
`#b`, `#hover-swim` and `#hold-archery`, `spacing-spec.md` part 3, `spacing-spec-continuous.md`
"The grid"), values from `c/shoreshTokens` (ADR 0015). The desktop stays the floor for what each
control does; the look is the mock-up's. The grid is the shared `c-shoresh-schedule-grid`, so
Generated Schedule (ADR 0010) and the Schedules page get the same look.

1. **The grid sits on its zone's surface** with no frame and no lines. The headers are one more
   row and one more column of the same grid, with the same 8 px gap, set like a resting rail item
   (13 px, regular, secondary words) and aligned to the cells: **times only** down the side
   (_9:00–9:45_, no AM or PM, as the mock-up), **names only** across the top (the bunk; in Group
   and Activity View the day, its date for screen readers only). The block's name ("Period 2")
   and the full times ("9:50 AM – 10:35 AM") are what a screen reader hears on the row header.
   Equal insets: the zone's 12 on every side (s3), 8 between cells (s2). Activity rows are at
   least a tile tall (56), the header row one item (32).
2. **One raised cell.** Every placed cell (an activity, a fixed or recurring activity, something
   not set up yet) is the one raised look, its name in medium. A fixed or recurring activity
   carries the round 13 lock before its name. A row where every bunk has the same fixed or
   recurring activity for one block (Lunch, Assembly, a morning flagpole) is **one slim cell
   across the bunks** (28 tall): it is one cell for screen readers too (`aria-colspan`), with
   the first bunk's key. Its marks and words must match in every bunk, or the row stays per
   bunk so nothing one bunk's cell says is lost. Up and Down through it come out in the column
   they went in from; a drop or Space on it is refused as on any fixed cell.
3. **Empty cells are recessed** (the drawer step, a soft inner shadow) and show no word; "Open"
   is still the cell's name for screen readers (and in its title). A cell locked empty
   (Generated) is recessed with its lock. _A director's Lock (Greg, 2026-10-22, ADR 0015 choice
   6):_ the padlock in the cell's bottom-right corner, no border or outline for the lock, so the
   corner mark (top right) and a special event's flag (before its name) show with it.
4. **Marks, not colours.** Selection (picked up from the keyboard or a click) is the highlight
   outline (2 px, 1 px outside); keyboard focus is the rail's focus ring. Needs a look is the
   **corner mark** (`c-shoresh-dot` shape `corner`: same words on hover, tap and focus, in the
   text colour, never bronze) with a fine edge. The other states keep their meaning with a mark
   and words for screen readers, and no new hue: **not set up yet** a dashed edge inside the
   raised cell; **removed** the name struck through (cells, bunks and blocks); **not at camp**
   recessed and hatched in the primary's own steps. The handle shows under the pointer or
   keyboard focus, so a cell at rest is its name only.
5. **The colour legend goes.** Placed, fixed (the lock), Open (recessed), selection and the
   corner say themselves. Three marks don't: so a **quiet single line** under the grid names
   only those on the grid now (_not at camp_, _not set up yet_, _removed_), and none when there
   are none. The Schedules page's own legend goes too (it described the old colours).
6. **The drawer** replaces the activity list on the left. It is its own zone under the grid,
   below the hairline, on the grid's columns: the time column holds **N under** (set like a rail
   total, `measureWeek`'s under count, the counter's number) and the Filter box; each column
   holds a tile. **More activities than columns wrap** onto more rows of the same columns. Chosen
   over scrolling sideways because wrapping keeps every activity in view and in the Tab order,
   keeps each tile under a column, and needs no hidden scroll a director has to discover; a camp
   with many activities gets a taller drawer, and Filter narrows it. With many bunks the grid
   and the drawer scroll sideways together (one scroll), so tiles stay under their columns.
   - **A tile is its name only** (decision 41). An activity over its weekly limit carries the
     corner. Under the pointer, with keyboard focus or held, the tile shows **placed of goal** in
     the counter's words (_3 of 4_; the counter's over row for one over, _4 of 3_; _2 placed_
     with no goal, or once past it, since _2 of 1_ would read as over). A screen reader hears
     the name, those words and _Over its weekly limit_ on the tile always.
   - **Order:** activities under their goal first, then the rest, each by name (the desktop
     lists still needed first).
   - **What it counts:** Daily View the camp, by `measureWeek` (the counter's numbers: a bunk
     counts only up to its own goal; over counts only the bunks past the limit). Group View the
     one bunk shown, measured the same way on its own (the desktop's list counts one group
     there). This replaces the desktop's Daily View arithmetic (the camp's total against the
     targets times the bunks, `countLabel`) so the drawer and the counter can never disagree
     (`spacing-spec.md` part 1).
   - **Every way to place stays:** drag a tile onto a cell; click (or Enter, or Space on) a tile
     to hold it, then click a cell or press Space on it; type in a cell (Enter, F2 or a
     double-click); drag a placement back onto the drawer to take it out.
7. **Holding a tile** (picked up, or being dragged) outlines every cell of its activity and
   draws the dashed **fits here** inside each Open cell where it fits: there is room for its
   whole length (no bunk away, nothing locked or filled in the way) and putting it there gives
   the week **no new needs-a-look mark**, by the same check that draws the marks (Manual Build's
   `checkWeek`, Generated's own check). Worked out once per held activity and week shown; same
   inputs, same cells. Escape lets go ("Put back."), as before.
8. **Same-activity outlines** (decision 38, `spacing-spec.md` part 3). Pointing at a cell, or
   keyboard focus on it, outlines every other cell of that activity: 1.5 px, the highlight at
   45 %, 1 px outside, no fill. A tile under the pointer or with focus outlines its activity's
   cells. Thinner and paler than selection; "fits here" is dashed, inside, and only on Open
   cells, so the two never land on one cell. The selected cell (picked up) keeps its selection
   outline and never takes the paler one, even when the pointer crosses another cell of its
   activity. They replace Generated's counter lighting its cells.
9. **Accept returns** (decision 43, as decision 16 and the desktop's FindingsRail). Hovering or
   focusing a line in the counter's dropdown (an under or over row, or a line to look at) shows
   **Accept**; it tucks that line away for this visit. It comes back when its numbers change or
   a week is shown fresh. A cell that breaks a rule shared with other cells has no Accept, as on
   the desktop (`FindingsRail.jsx`: an overlap goes when the clash is moved). Keyboard: Accept is
   the row after its line (Down), Enter accepts; it says _Accepted for this visit: Swim, 3 of 4._, the dropdown stays open, and focus moves to the next line (else the one before, else the
   counter). The numbers stay the week's (the drawer shows the same ones); the counter's corner
   goes once every line is accepted, because each was looked at.
10. **Group View and Activity View** use the same cells and headers: Group View's columns are
    the days (names only), its drawer the bunk's; Activity View's cards are raised, its grid's
    cells raised where the activity runs (the bunks in it) and recessed where it doesn't.

Checked by Jest: `shoreshScheduleGrid.test.js` (times only with the block for screen readers,
names only, the slim row and when it stays whole, Open's name, the marks' words, the quiet line,
the corner, hover and focus outlines, a held activity's outlines and fits only on Open cells, Up
and Down through a slim row), `shoreshBuildPalette.test.js` (N under, tiles on the columns, name
only, the corner, placed of goal on hover, focus and hold, every event, axe), `counts.test.js`
(the order, the counter's words, over, one bunk, at the limit, past the goal, Filter),
`shoreshWeekChecks.test.js` (Accept on each kind of line and none on a clash, it hides and says
so and moves focus, Down reaches it, the corner, a changed line and a fresh week bring it back),
`moving.test.js` (the drawer's numbers equal the counter's, hover outlines, hold and fits by the
checks, drag holds until it ends, placing where it fits leaves no mark, Group View counts the
bunk) and the screens' suites with the slim rows. In the test org:
`scripts/a11y-browser-check.mjs` holds a tile with the keyboard (outlines, fits only on Open
cells, Escape), points at a cell with the mouse (the outlines) and accepts a line from the
keyboard, on Manual Build and Generated. Screenshots next to the mock-up in
`docs/design/screens/`.

## Choices (part 9: copy and paste cells, 2026-10-21)

Greg's decision 45 (wiki `projects/shoresh-scheduling-sf.md`, 2026-10-21: build multi-select
copy and paste; Manual Build round 2 #5 had left it for later). Desktop:
`src/screens/schedule/useClipboardSelection.js`, `src/screens/ScheduleScreen.jsx` (the paste
line), `src/components/schedule/SlotCell.jsx:332-336` (Shift with an arrow). It lives in the
week editor (`c-shoresh-week-editor`) and the grid (`c-shoresh-schedule-grid`), so Manual Build
and Generated Schedule both have it.

1. **Choosing cells.** Cmd/Ctrl with a click adds a cell to the cells chosen, or takes it off
   (the desktop's gesture). Shift with a click, and a drag with Shift held, choose the block from
   where the choice started (the cell with focus) to that cell; from the keyboard, Shift with
   Left or Right and Cmd/Ctrl+Shift with any arrow do the same. **Shift with Up or Down stays the
   length** (part 2): the desktop gave that chord to length and dropped range selection for it
   (`SlotCell.jsx`), so a block grows down or up with Cmd/Ctrl+Shift. A block takes a placement
   running several blocks whole. Escape, a plain click, or focus moved on by an arrow lets go;
   so do another day, bunk or view. A plain drag still moves a placement. The grid is
   `aria-multiselectable`, and the chosen cells are `aria-selected`; "3 selected" is said.
2. **The look** (ADR 0015): a chosen cell wears the selection's highlight outline (2 px, as a
   picked-up cell) over a tint of the highlight, the tint of a ticked chip (14% forest). No new
   colour.
3. **Copy** (Edit > Copy, or Cmd/Ctrl+C on the grid) takes the cells chosen, else the cell with
   focus, by where they sit (offsets from the top left one). Fixed and recurring activities aren't
   taken (they stay where setup put them), nor a time a bunk isn't at camp; an Open cell is
   taken as Open. It says _Copied Swim._ or _Copied 3 activities and 2 Open._ on the quiet line.
   What was copied stays for this visit to the week (another day, bunk or view keeps it; another
   week doesn't, as Copy day to… works within the week).
4. **Paste** (Edit > Paste, or Cmd/Ctrl+V on the grid) puts it with its top left at the cell
   with focus (or the top left of the cells chosen), on the same or another bunk (Daily View) or
   day (Group View), as **one Undo step**, through the same queue and checks as every edit. It
   is a day tool like Clear day and Copy day to… (tools.js `pasteEdit`, `toolRuns`, `replan`):
   every placement Undo could put back that a pasted cell touches is cleared whole first; an
   Open cell clears; an activity goes in whole or not at all; fixed and recurring activities stay;
   what can't go is left out and listed: _not at camp then_, _removed_, _not set up yet_,
   _Flagpole is set up there_, and _no room there_ when it runs past the grid's last time block
   or column (or the day lacks a block it runs into). A cell someone else changed since asks
   _Keep theirs_ or _Use yours_, and Keep theirs pastes the rest around theirs (§24). The line
   says _Pasted Swim · Bunk 2 · Monday · Period 2_ (or _Pasted 3 activities · …_) with its Undo
   and what was left out; with nothing to change, _Nothing pasted._ and why. From the menu focus
   goes to the line's Undo, as for the other tools; with the shortcut it stays on the grid.
5. **Generated Schedule:** pasted cells lock, as every hand edit there does (`locks.js`
   `foldRun`). A cell the director locked is **left out** and listed (_Swim · Bunk 1 · Tuesday:
   locked._): a Lock beats what is pasted, as it beats a build. (Clear day and Copy day to…,
   which Generated doesn't offer, still treat a lock the director saw as part of their change.)
6. **Not built:** the desktop's Ctrl+A (choose every filled cell) and its click-by-click paste
   (_Paste Swim (3 left)_): one paste of the whole block is one Undo step and says what was left
   out, which the click-by-click way can't. The browser's own clipboard isn't used: nothing is
   copied out of or into other programs.

Checked by Jest: `paste.test.js` (pasted on another bunk clearing what is there whole, a
several-block placement onto another day, Open clears, each reason left out, the same activity
needs nothing, someone else's cell skipped, `replan` keeping their change and leaving a locked
placement out whole), `copyPaste.test.js` (the shortcuts as one Undo step, a Shift block with a
cell left out, no room, fixed activities, Open, Cmd/Ctrl-click and Escape, focus keeping or
letting go of the choice, Edit's rows held and focus after Paste, Group View onto another day,
another day keeps the copy and another week doesn't, Generated locks the pasted cell and leaves
a locked cell out), `shoreshScheduleGrid.test.js` (multiselectable, Shift with Right, Shift
with Down stays the length and Cmd/Ctrl+Shift with Down chooses, Shift and Cmd/Ctrl clicks are
no click, a Shift-drag never moves a cell, focus moved by an arrow says nothing of extending),
`dayTools.test.js` (Edit's rows). In the test org: `scripts/a11y-browser-check.mjs` chooses two
cells with Shift and Right, copies and pastes them with the keys on Manual Build, and checks what
is said and Undo.

## Choices (part 10: special days and events on the week, 2026-10-22)

ADR 0014 choices 19 to 25 (Special Events slice 4; decisions 47.2 to 47.4 and 51; mock-ups
`design-research/special-r1/placed.html` and `placed-day.png`), on Manual Build and, through the
same week editor, Generated Schedule:

1. **Events in the drawer and the typing box.** The drawer ends with an **Events** section, a
   tile per season's special event with its quiet flag (`c-shoresh-build-palette` `events`).
   Picked and put down, dragged, or picked while cells are chosen together, it covers those cells;
   typed into a cell (or the cells chosen), the typing box lists events after the activities. Its
   cells in bunks side by side over the same blocks are one cell with the flag and its place.
   Delete clears it from all of them as one step; it is not dragged or stretched. It saves as an
   edit does (§4), checked by `SlotRules.withEvents`.
2. **The counter and the drawer leave events out** (no dots, not counted as filled or to fill).
3. **A day a special day replaces** shows its own schedule read-only (its name on the day's pill,
   "Fri · Visiting Day"), the special day's line in the drawer's place with **Open <name>**, and
   no counter; Group View shows that day as one named cell, Activity View counts nothing there.
   The week's own cells for that day are kept unchanged: the screen shows none to edit, and
   Clear week, Copy day to and Paste leave that day and say so.
4. **Set it up**: with focus on a cell an import noted as a special event or special day ("not
   set up yet"), "Set it up" makes it from what the file had (ADR 0014 choice 23), then the week
   and the season are read again.
5. **Start from another week** leaves a placed event out, named: "… a special event is put on
   each day by hand" (desktop: events are placed day by day).

Checked by `WeekSpecialsTest`, `SpecialPlacingTest`, `shoreshWeekEditor` `specialDays.test.js`
and `specials.test.js`, `shoreshScheduleGrid` `merged.test.js`.

## Choices (part 11: elective sets on the week, 2026-10-23)

ADR 0018 choices 20 to 27 (Electives slice E5; decision 53.2; mock-up
`design-research/electives-r1` `grid-a`), on Manual Build and, through the same week editor,
Generated Schedule:

1. **Elective sets first in the drawer**, before the activities, only when the camp has any: a
   tile per set with its mark and "4 offerings" (`c-shoresh-build-palette` `electives`). Placed as
   an event is (part 10): picked and put down, dragged, picked while cells are chosen together, or
   typed (the typing box lists the sets first, "Chugim (4)"). Each time block holds the set on its
   own; bunks side by side in the same block are one wide cell, "Chugim (4)", with the set's mark.
   Delete clears it from all of them as one step; it is not dragged or stretched; it saves as an
   edit does (§4), checked by `SlotRules` with `SlotEvents`.
2. **No swap**: an activity put down on a placed set or event is refused, in the desktop's words
   "Can't swap with an elective or an event. Move it to an empty cell instead."
3. **The checks**: the set takes up its offerings' places (a bunk at the same place beside it can
   get "More bunks at <place> than fit"; the set never carries the dot), and is not a cell to fill,
   so the counter and Still to place leave it out.
4. **Set it up** on a cell a file noted as an elective binds the draft's cells of that name to the
   season's set (made, empty, when there is none), then the week and the season are read again.
5. **Start from another week** carries a placed set where it was, while the season has it.

Checked by `ElectivesOnGridTest` and `shoreshWeekEditor` `electives.test.js`.

## Choices (part 12: hand edits are reminders, 2026-10-26)

Greg's decision (engine care plan Q4, binding): _"always allow a hand-edit. We should not assume
that we know better than the person with direct knowledge of what they can or cannot do in the
physical world. Flag it as a reminder but allow it."_

1. **Never refused for what setup says** (Manual Build and Generated Schedule, `SlotSaves`): a
   closed activity, an activity at a closed place, a group away this week (where the grid has a
   row for it), a time a group isn't at camp (morning or afternoon only), and a fixed or recurring
   activity moved, covered or cleared by hand. Those two rules now live in `GeneratedCellRules`, used only by Generated's whole-week saves (ADR 0010). A
   fixed or recurring activity moved onto a day that doesn't list it is listed there as another
   day of the schedule names it.
2. **Still refused, because they protect the data, not the plan:** a cell that changed since the
   screen read it (a conflict, "keep theirs or use yours"); a run that would cut into a placement
   or whose neighbours changed (a conflict); a Lock the screen didn't see (Generated: a conflict);
   an activity, event or elective set that isn't this season's (or was deleted), or a fixed or
   recurring activity no day of the schedule has; a day, group or time block that isn't the
   draft's (`That day is not in this schedule`, a conflict for the rest); a day that can't be
   read; a run the screen could not have sent; and anything but a Manual Build draft (or the
   Generated draft, on Generated Schedule). Generated's whole-week build saves are not hand edits
   and keep every check (ADR 0010).
3. **The reminder is the Why list's setup row**, in the words "Update to match setup" already uses
   (part 6, from the desktop's `computeWeekClosures.js`), place first, so a cell never gets the
   same fact said twice in two phrasings:
   - closed activity: _Bunk 2 · Tuesday · Period 3 · Swim: Not running this week_;
   - closed place: _… · Soccer: Field A is closed this week_;
   - group away this week: _… · Gym games: Not at camp this week_;
   - not at camp then: _… · Soccer: Not at camp then_;
   - a fixed activity moved: _… · Flagpole: Not set up here now_ where it went, and
     _… Period 1: Flagpole is set up here now_ (Open) or _… · Swim: Flagpole is set up here now_
     (covered) where it was.
     "Week" is the camp's word. After a hand edit the screen reads setup changes again when the
     edit touched a fixed or recurring activity or a time a group isn't at camp, or the week has a
     closed activity or a group away (`awayGroupIds`, new on the preview), as it already did for
     closed activities.
4. **On the screen:** no cell is read-only for these reasons; fixed and recurring activities can
   be picked up, moved, stretched, cleared and covered by typing, dragging, an event or an
   elective set; drops onto a time a group isn't at camp are made. The cell keeps its look (set
   time lock mark, _Not at camp_ hatch). An editable grid no longer draws a row every bunk spends
   on the same fixed activity as one slim cell: each bunk's cell is its own, so one can be
   changed (read-only grids still draw the slim row). **Copy and Paste are hand edits** (review
   of #154): Copy takes fixed and recurring activities and not-at-camp times too, and a paste
   covers a fixed or recurring activity and goes onto a time a bunk isn't at camp, reminded as
   above. Copy day to… and a rainy day stay bulk tools: they still leave fixed and recurring
   activities and not-at-camp times as they are, since they are not cells the director chose one
   by one.
5. **The engine never places them** (closed, away, not at camp, set time): generated builds are
   unchanged. A hand edit on Generated is a lock, so later builds keep it; a cell a fixed or
   recurring activity is cleared or moved away from by hand is locked empty, so no build fills it
   (ADR 0010).

Checked by `ManualBuildTest` (`fixedRecurringAndNotAtCampSlotsAreHandEditsWithReminders`,
`closedActivitiesPlacesAndGroupsAwayAreHandEditsWithReminders`, `whatProtectsTheDataIsStillRefused`),
`GeneratedRefusalsTest`, and Jest (`shoreshManualBuild` `setupMatch.test.js`, `moving.test.js`).

**Start from another week, query headroom (2026-10-26).** The start read both weeks' days in
two queries, read the new draft's days again to save into it, read the copied activities again
though setup had them, and read an elective set twice (once to check it is the season's, once to
place it). Now: both weeks in one query, the copy saves into the days as read, the rules use the
season's activities already read (`GeneratedSetup.rules`), and the set read for the check is the
one placed (`SlotRules.withEvents(edits, known)`). Three queries fewer (39 to 36), four with an
elective set (40 to 36); `ManualWeekStartTest` asserts 36 for both.

## Choices that are hard to undo after release

None in parts 1 to 3: no new objects, fields, or picklist values. The draft uses ADR 0005's
`Status__c` Draft and `Origin__c` Manual. The slot identity is not stored, only sent between
the screen and the server. Part 4b adds the `VersionReason__c` value **AutoSaved**
("Auto-saved"), the same one Generated Schedule G2 (#46) adds; whichever merges second keeps
the one value. Part 5 adds `Schedule__c.PublishedAt__c` (date/time), `PublishedBy__c` (lookup to
User, cleared if the user is deleted) and `PublishKey__c` (text 40, unique, case-sensitive:
"programId:weekId" while published, cleared when replaced), as the data model names them. Part 6
adds no fields: the automatic version reuses the AutoSaved reason. Parts 7 to 9 add none (look
and screen behaviour only).

## Not done here

- **Fits here is a hint, not a promise of a clean week.** It checks the week as it is; two
  Open cells that each fit may not both fit at once. Placing still draws any mark it causes.
- **Publish's question still uses the cards' words** (_Filled: 34 of 36_, _Overlapping: 2_,
  _Still needed: 1_). Moving it to the counter's (_34 of 36 placed_, _N under_) is a small
  follow-up.

- **Truly simultaneous Starts** are not exercised by a test (Apex tests run one at a time). The
  test calls Start twice; the code takes the program lock before looking again.
