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
3. Counters (Placed, Still needed, Spread across the week, Overlapping) and the bronze dots (over
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
   A group that isn't at camp for part of the item's length (a morning-only group, and an item
   that crosses into the afternoon) gets only the part it is there for. Everything else is Open. The same setup
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

## Choices that are hard to undo after release

None in this part: no new objects, fields, or picklist values. The draft uses ADR 0005's
`Status__c` Draft and `Origin__c` Manual. The slot identity is not stored, only sent between
the screen and the server.

## Not done here

- **Deleting a week or program** says how many saved versions go with it (ADR 0005 §10) but
  doesn't mention its Manual Build draft, which goes too. It needs a line in that confirmation
  (`shoreshCampSetup`, which the namespace PR 5 is converting), so it is a follow-up.
- **Truly simultaneous Starts** are not exercised by a test (Apex tests run one at a time). The
  test calls Start twice; the code takes the program lock before looking again.
