# 0010: Generated Schedule

Status: proposed (2026-10-17), part G1 of 5 (the engine). Design source: wiki
`projects/shoresh-scheduling-sf` ("Generated Schedule round 1", Greg 2026-10-17, and the
coordinator's technical calls the same day), `projects/shoresh-design-guide`,
`projects/shoresh-scheduling-data-model`. Starting point: the desktop generator, Greg's own
Apache-2.0 repo `gfeitel1-maker/Scheduling-Project-`, `src/engine/buildSchedule.js`
(`scheduleCohort`), `eligibility.js`, `weekCatalog.js`, `placementLedger.js`, `blockOverlap.js` and
their tests. Builds on ADR 0005 (grid format v1), 0008 (Manual Build's day shape, not-at-camp
cells) and 0009 (names through `c/shoreshSchema`).

## Greg's decisions (2026-10-17)

1. **Two schedules, like the desktop.** Manual Build and Generated are separate; each week can
   have one of each, and either can be saved as a version or published.
2. **Hand edits are locks.** A cell placed or moved by hand in the Generated schedule is locked
   automatically and shows a small lock. Rebuild fills around locks. **Start over** clears
   everything, locks included, after saving a version.
3. **Lock** a cell, with shortcuts to lock a whole day or a whole group. One word and one action
   for keeping a cell from changing: **Lock**, with a lock icon (never "pin", "hold" or "keep";
   the desktop's "Held in place" is not carried over). Code, flags and copy say lock/locked.
4. **Each week gets its own pattern.** Program + week + option number make the seed. Rebuilding
   the same week gives the same result. **Try another** moves to the next option; any option
   can be brought back.
5. **Fill the open cells** fills only the empty cells, beside the whole-week Rebuild.
6. **Other programs count by capacity.** Other programs' fixed and recurring activities and their
   published schedule for the week count against each place's groups that fit and each
   activity's groups at once. No overrun, no conflict.
7. **Never a blank cell.** Every at-camp cell gets an activity. When the rules can't all be met,
   the least-bad choice goes in with the bronze dot, and hover says which rule it bends. Rules
   give way in this order (coordinator): weekly max, then once a day, then who it's set up for,
   then groups at once, then the place's capacity last. Locks, fixed and recurring activities and
   not-at-camp cells never give way. Not-at-camp cells stay hatched.
8. **Anyone with Shoresh Scheduler access** can generate.

## The five parts

- **G1 (this one):** the engine, a pure module with no screen, no Apex and no saving.
- G2: the Apex reader for the engine's inputs; create the Generated draft; save a rebuild with the
  whole-draft revision check (ADR 0005 §9); the server re-checks what it saves.
- G3: the Generated Schedule screen (menu entry; Generate, Rebuild, Try another, Fill the open
  cells; the dots and their hover; still to place).
- G4: locks (automatic on hand edits; lock a cell, day or group; Start over; stored in grid
  format v2).
- G5: other programs' occupancy fed to the engine.
  Versions and Publish reuse Manual Build parts 4 and 5.

## Choices (G1)

1. **Where it runs.** In the browser, as the LWC service module `c/shoreshEngine`
   (`generateWeek`), a port of the desktop's week generation. It reads no server, saves nothing,
   reads no clock and never calls `Math.random`. G2's server re-checks on save.
2. **Inputs.** The week's days in Manual Build's day shape (`ScheduleViews.DayView`: blocks,
   groups, items, rows with `^` for "carries on"), with fixed and recurring activities already in
   (as Start a blank week puts them), plus the season's records as the server sends them: groups,
   time blocks, activities, who-it's-set-up-for rows, locations, fixed and recurring activities
   (for their places), and week exceptions. Every field name comes from `c/shoreshSchema` (ADR
   0009); fixed and recurring activities are each read with their own field set. Also: the
   program, week and option (the seed), the mode, locks, other programs' occupancy, and the
   camp's words for the reasons.
3. **What is kept.**
   - A full build keeps locked placements, fixed and recurring activities, things not set up yet
     from an import (elective, special day, special event, trip), and the rows of groups setup no
     longer has. Every other activity is cleared and the cell built again.
   - **Fill the open cells** keeps every filled cell and fills only Open ones.
   - A lock on any cell of a multi-block placement keeps the whole placement. A locked Open cell
     stays Open.
   - A not-at-camp cell (Availability against the block's part of day, the same rule as
     `SetTimePlan.atCamp` and Manual Build's hatching) is never filled. A full build clears an
     unlocked activity left in one; Fill the open cells keeps it.
   - Kept activities count toward weekly counts, once a day, places and groups at once.
4. **Hard rules** (never broken unless a flag names the rule):
   - who it's set up for (ActivityEligibility: none means every group; a division row covers its
     groups);
   - weekly max (`NoWeeklyMax__c` means none);
   - once a day per group;
   - the place's groups that fit (`GroupsThatFit__c`, at least 1), counting every block a
     multi-block activity covers, fixed and recurring activities at that place, and other
     programs. A location not in the list has no limit (as on the desktop);
   - groups at once (`NoGroupLimit__c` means none; a blank number counts as 1, the hand-add
     default);
   - same division only (the Activities screen: "Only groups from the same division at the same
     time"): groups doing the activity at once are one division, and so is everyone in its place.
     It holds both ways (a second division can't join a place a same-division-only activity
     holds, whatever arrives first) so the result can't depend on placement order. Another
     program's groups count as another division;
   - a multi-block activity needs its whole length in consecutive Open, at-camp cells, and is one
     session;
   - one placement per group across blocks whose clock times overlap (touching times don't).
     Structural rules (length, overlap) never give way.
5. **Soft goals.** Weekly minimum; early in the week (`EarlyWeekCount__c` by
   `EarlyWeekByDay__c`); high priority before low (blank priority is low). **"By Wednesday"
   counts Wednesday** (the plain reading of the Activities screen's "By"). The desktop counted
   only days before its target day. This is Greg's to confirm; it is one comparison in
   `week.js` (`earlyEnd`).
6. **Fill order, ported:** kept cells first; multi-block activities first in each priority round;
   the tight-week capped matching (desktop T380); greedy fewest-choices, high then low; then the
   three repair passes, each step undone unless it ends whole: a reshuffle per stranded cell, the
   weekly-minimum ejection chain, and moving a blocking session. Budgets are the desktop's, so a
   week that can't fit gives up fast. Differences from the desktop, each on purpose:
   - ties are broken by pre-drawn keys, never `rand() - 0.5` in a sort (an inconsistent
     comparator gives different orders in different browsers);
   - in the greedy round, the early-week goal comes first, then the fewest sessions so far, then
     the key (the desktop's early ordering was lost in its random sort); multi-block heads break
     ties by key too, so Try another varies them;
   - the tight-week test ignores a group with no Open cells (it has nothing to spare and nothing
     to fill);
   - Salesforce's fixed and recurring activities are never linked to an activity (data model),
     so the desktop's "anchored activity" exclusion has no counterpart; nor do events-only
     blocks (removed in slice 3b), electives and events (kept as they are).
7. **Never blank.** After the repairs, each Open cell still empty gets the activity whose most
   serious bend is the least serious, comparing bends in the order rules give way (weekly max,
   once a day, who it's set up for, groups at once, same division only, the place's capacity);
   then high priority; then the one the group has had least; then the key. **Same division only
   gives way just before the place's capacity**: it is a rule about sharing the place, and the
   order Greg approved doesn't name it. Each cell of the placement returns a flag with the rules
   it bends and a reason in camp words for the hover: "Over its weekly limit", "Twice in a day",
   "Not set up for Bunk 3", "Over its limit of 2 bunks at once", "Shares Pool with another
   division", "More bunks at Pool than fit". Only a cell nothing can go in at all (the group is
   busy at an overlapping time, or no activity is short enough for the gap) stays Open, listed
   in `openCells` with its reason. No activities at all, or none running this week, returns an
   error result ("No activities are set up yet." / "No activities run this week.") instead of a
   grid.
8. **Determinism.** The seed is `programId|weekId|option`, hashed with 32-bit FNV-1a into
   mulberry32 (the desktop's generator). Each Open cell gets its own stream (seed + date + group +
   block), from which one key per activity is drawn in activity order before placing starts; the
   matching has its own stream. Every input is sorted by SortOrder, then Id (by character code,
   never locale); days by date; other programs' occupancy by date, time, place, activity. So the
   same inputs and option give the same week in every browser and whatever order records
   arrive in, and another week, program or option gives another pattern.
9. **Other programs (G5 fills it).** `otherPrograms`: groups per place and per activity at a
   date and clock time. An entry counts against each of this program's blocks whose time
   overlaps it, on places' groups that fit and activities' groups at once. Default: none.
10. **Output.** The days in the same shape Manual Build uses (frame unchanged; items listed in the
    order cells use them; items no cell uses are dropped), `flags` per cell, `stillToPlace`
    (weekly minimums not met, early-week goals missed, each with a line like "Swim · Bunk 3:
    1 still needed by Wednesday"), and `openCells`. Flags and reasons are not stored: G3 works
    them out again on load (coordinator's call).
11. **Code layout** (`force-app/main/default/lwc/shoreshEngine`): `shoreshEngine.js` (entry point,
    output, words), `setup.js` (reads inputs, ordering), `week.js` (the builder), `random.js`
    (hash and stream).

## Tests

- The desktop's tests, ported (`ported.test.js`): the tight Latin-square week, never lifting
  below a minimum, the capped-activity matching sweeps, the minimum repair (including the
  1,000 seeded weeks known to be feasible, with locks every fifth week), multi-block first
  (contiguous sessions, 3-block runs, the 30-case groups-at-once grid), overlapping blocks.
- The rules one at a time (`rules.test.js`), including each step of the order rules give way.
- A seeded property test (`properties.test.js`, 300 random small camps with divisions,
  part-day groups, overlapping blocks, places, fixed activities, locks and kept cells from an
  earlier build, both modes, other programs), checked by an independent checker
  (`__tests__/data/check.js`): no hard rule broken unless a flag on a generated cell names it;
  never blank; locked, fixed and not-at-camp cells untouched; deterministic.
- Determinism (`determinism.test.js`): a pinned week, byte-identical rebuilds, 20 shuffled input
  orders, shuffled grid group order, no `Math.random`, different options, weeks and programs.
- Performance (`performance.test.js`): 12 groups × 5 days × 8 blocks, a week that fits and one
  that can't, each well under 2 seconds in Jest (about 15 ms and 350 ms on a laptop).
- Mutation check of the key guards (review practice, see the PR).
- Known limit, pinned: in the desktop's "one spare cell" sweep (8 groups, 9 cells, 8 activities
  once a week, one group at a time), options 80 and 82 of 1..100 leave one session short (6 in
  1,000). The desktop's own 100 seeds all passed; the repairs are the same, the tie-breaks
  differ. The minimum repair won't move a session out of a cell it can't refill cleanly, even
  though never-blank would fill it. A later change could let it, with care.

## Choices that are hard to undo after release

None in G1: no objects, fields, picklist values or Apex. Locks are stored in G4 (grid v2).
