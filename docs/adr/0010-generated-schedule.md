# 0010: Generated Schedule

Status: proposed (2026-10-17), parts G1 (the engine) and G2 (reading its inputs, saving the
week) of 5. Design source: wiki
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
   give way in this order, first to last:
   1. weekly max: **maximums are soft in practice; go over them before anything else, smallest
      overage first, and show it** (Greg's correction, 2026-10-17: "I write 2 art periods, but
      I'd accept 3");
   2. once a day;
   3. who it's set up for;
   4. groups at once;
   5. same division only (Greg, 2026-10-17);
   6. the place's capacity, last.

   The order is the coordinator's, with Greg's two additions. Locks, fixed and recurring
   activities and not-at-camp cells never give way; not-at-camp cells stay hatched. **An
   activity is never shortened** to fit a gap (Greg, 2026-10-17, replacing an earlier "shorter
   than set up" bend): a gap no activity's length fits stays Open, which Greg expects to be
   practically nonexistent in real camps, as does a cell where the group is busy at an
   overlapping time.

8. **Anyone with Shoresh Scheduler access** can generate.
9. **"Early in the week: N by Wednesday" counts Wednesday** (Greg, 2026-10-17).

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
   program, week and option (the seed: 1, 2, ..., as a number or as text; left out means 1; 0,
   a fraction or anything else is refused with "That option can't be built." so a screen bug
   can't show the wrong week as if it were the one asked for), the mode, locks, other programs'
   occupancy, and the camp's words for the reasons.
3. **What is kept.** ("Kept" is this ADR's and the code's word for a cell the build leaves alone;
   on screen the only word is **Lock**, decision 3.)
   - A full build keeps locked placements, fixed and recurring activities, things not set up yet
     from an import (elective, special day, special event, trip), and the rows of groups setup no
     longer has. Every other activity is cleared and the cell built again.
   - **Fill the open cells** keeps every filled cell and fills only Open ones.
   - A lock on any cell of a multi-block placement keeps the whole placement. A locked Open cell
     stays Open.
   - A not-at-camp cell (Availability against the block's part of day, the same rule as
     `SetTimePlan.atCamp` and Manual Build's hatching) is never filled. A full build clears an
     unlocked activity left in one; Fill the open cells keeps it.
   - Kept activities count toward weekly counts, once a day, places and groups at once. A kept
     activity setup no longer has (deleted, or closed this week) stays where it is but counts
     toward none of these: its place and rules are unknown. A kept activity setup still has is
     shown by its name in setup now (a rename shows the new name, as in Manual Build).
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
   - a multi-block activity needs its whole length in consecutive Open, at-camp cells whose times
     don't overlap each other (Wake-up 8:00–8:30 and P1 8:00–9:00 are one stretch of time, not two
     periods), and is one session;
   - one placement per group across blocks whose clock times overlap (touching times don't).
     Where a group's Open cells overlap, the build first chooses which to fill, the same
     whatever order anything is filled in: none overlapping a kept cell; then, of every choice of
     cells that don't overlap, the one that holds the most activity time given the activities'
     lengths (a multi-block activity needs its cells next to each other), then the most room for
     the group's multi-block activities, then the earliest ends (with more than 12 such cells in
     one day, earliest end first). Blocks 8:00–8:45, 8:30–9:15 and 9:00–9:45 fill 8:00 and 9:00;
     with Wake-up 8:00–8:30, P1 8:00–9:00 and P2 9:00–10:00 and a two-block Hike, the Hike takes
     P1 and P2 (coordinator's review). A cell left out whose overlapping cells end up Open isn't
     busy after all, and is filled at the end. Every cell left Open says why, from the finished
     week: "Already busy then" only when the group holds something overlapping it, otherwise "No
     activity fits this gap". This never gives way.
5. **Soft goals.** Weekly minimum; early in the week (`EarlyWeekCount__c` by
   `EarlyWeekByDay__c`); high priority before low (blank priority is low). **"By Wednesday"
   counts Wednesday** (the plain reading of the Activities screen's "By"). The desktop counted
   only days before its target day; Greg chose to count it (decision 9). It is one comparison in
   `week.js` (`earlyEnd`). Only sessions on the days that count meet the goal: a locked Friday
   session doesn't meet a goal "by Tuesday" (the desktop counted every session of the week).
6. **Fill order, ported:** kept cells first; multi-block activities first in each priority round;
   the tight-week capped matching (desktop T380); greedy fewest-choices, high then low; then the
   three repair passes, each step undone unless it ends whole: a reshuffle per stranded cell, the
   weekly-minimum ejection chain, and moving a blocking session. Budgets are the desktop's, so a
   week that can't fit gives up fast, and the two repair loops have hard caps as well (each
   productive sweep or pass makes progress, so the caps never bind on a working engine; they keep
   a future edit from freezing the browser). Differences from the desktop, each on purpose:
   - the weekly-minimum repair may leave a cell its move empties for never-blank to fill, as long
     as the whole chain leaves no more cells Open than it found (the desktop refused any move
     whose emptied cell it couldn't refill cleanly). What never-blank then puts there can bend
     more than the move saved, so when the repair did this, the week is also built without it
     and the lenient week is kept only if it is no worse: it meets more minimums, or as many
     with no more bends, both counted by `checkWeek` (coordinator's reviews, 2026-10-17). The
     choice is deterministic. In 1,500 probe camps the lenient week was better in 84 and worse
     in 31, so keeping the better of the two beats either alone; the "one spare cell" sweep
     went from 6 in 1,000 options short to none;
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
   then high priority; then the one the group has had least; then the key. Same division only
   gives way just before the place's capacity (decision 7): it is a rule about sharing the
   place. Among the choices that only go over a weekly maximum (tried before any other bend),
   the smallest overage wins, so a third Art for several bunks comes before a fifth for one
   (decision 7); then high priority, then the one the group has had least, then the key. An
   activity is never shortened. A cell stays Open, listed in `openCells`, only when the group is
   busy at an overlapping time ("Already busy then") or no activity's length fits the gap ("No
   activity fits this gap"). No activities at all, none running this week, no days to build,
   or an option that can't be used returns an error result instead of a grid: "No activities
   are set up yet.", "No activities run this week.", "This week has no days to build.", "That
   option can't be built." (week and activity in the camp's own words).
   The hover reasons, in camp words: "Over its weekly limit", "Twice in a day", "Not set up for
   Bunk 3", "Over its limit of 2 bunks at once", "Shares Pool with another division" (or "With
   another division at the same time" for an activity with no place), "More bunks at Pool than
   fit", and "Already busy then". Group, division, week and gap
   are the camp's own words (`c/shoreshTerms`). They are written in one place (`reasonFor`,
   `words.js`); Manual Build part 3 will reuse them, so the dots say the same words on both
   schedules: change them there, deliberately, and for both.
8. **Determinism.** The seed is `programId|weekId|option`, hashed with 32-bit FNV-1a (the
   desktop hashed its camp id with djb2) into mulberry32 (the desktop's generator). Each Open cell gets its own stream (seed + date + group +
   block), from which one key per activity is drawn in activity order before placing starts; the
   matching has its own stream. Every input is sorted by SortOrder, then Id (by character code,
   never locale); days by date; other programs' occupancy by date, time, place, activity. So the
   same inputs and option give the same week in every browser and whatever order records
   arrive in, and another week, program or option gives another pattern.
9. **Other programs (G5 fills it).** `otherPrograms`: groups per place and per activity at a
   date and clock time. An entry counts against each of this program's blocks whose time
   overlaps it, on places' groups that fit and activities' groups at once. No count means one
   group; a count of 0 takes no room. Default: none.
10. **One rules module: `checkWeek`.** The dots come from the finished grid, not from how it was
    built: `checkWeek(days, model, { t, dayName })` (`checks.js`), written and tested for Manual
    Build part 3 (its scenario tests and its 2,000-week property test against an independent
    oracle came with it) and moved here so both schedules use it (coordinator, 2026-10-17). One
    function per rule, in the order rules give way, with `reasonFor`'s words. **Over its weekly
    limit dots only the sessions past the limit, the latest in the week** (by day, then start
    time, then place in the day, then Id; a limit of 2 and 3 sessions dots the 3rd) (Greg,
    2026-10-17). **A locked session doesn't carry that dot while one the build placed can**: the
    dots go on the latest unlocked sessions past the limit, and on locked ones only for as many
    as there aren't enough unlocked ones for (coordinator, 2026-10-17: the director's choices
    win). The engine tells checkWeek which placements it kept (`model.locked`); Manual Build has
    no locks, so it is unaffected. Any other rule broken by several placements dots all of them: twice in a day
    dots both, too many at an activity or a place dots each one there; fixed and recurring activities count toward a place but never get a dot. So the
    same grid always gets the same dots, whatever order it was filled in, and anything kept
    that breaks a rule is dotted too. Overlapping lists each group's cell (day, time block)
    where its placement breaks a rule that time block shares with other cells: groups at once,
    same division, place capacity, or busy at an overlapping time, like the desktop's
    `computeOverlaps` (coordinator, 2026-10-17). A placement running two time blocks that clashes
    in one is one cell; a cell breaking several is one entry, its reasons in give-way order;
    fixed and recurring activities never have one. Additions here: other programs' groups (counted
    at places and activities, another division for same division only), and each dot's rule
    names (`bends`). `checkInputs.js` reads the season's records into its model (activities and
    places through the engine's own readers); the engine builds the same model from its inputs
    (`checkModel`).
11. **Output.** The days in the same shape Manual Build uses (frame unchanged; items listed in the
    order cells use them; items no cell uses are dropped); `flags`, checkWeek's dots on the
    finished week, one entry per cell; checkWeek's `stillNeeded` and `spread` lines ("Swim ·
    Bunk 3: 1 still needed by Wednesday"), the same as data (`stillNeededBy`: activity, group,
    how many missing; `spreadBy`: the same and the day; entry i is line i, so Manual Build's
    counters can add them up), `overlapping` (`[{ dateValue, groupId, blockId, rules, text }]`,
    text "Bunk 3 · Monday · Period 2: Over its limit of 1 Bunk at once · More Bunks at Pool than
    fit", by day, then time block, then the grid's group order) and `cells` (filled of to fill),
    in the same words and order as Manual Build; `openCells`; and `ruleChecks`, the build's work. Flags and reasons are not stored: G3
    works them out again on load with `checkWeek` (coordinator's call).
12. **Code layout** (`force-app/main/default/lwc/shoreshEngine`): `shoreshEngine.js` (entry
    point, output), `setup.js` (reads inputs, ordering), `week.js` (the builder), `random.js`
    (hash and stream), `grid.js` (reads a day's rows, so the engine never depends on a screen),
    `words.js` (`reasonFor`), `checks.js` and `checkInputs.js` (the rules module).

## The desktop's flags and findings, mapped

The desktop's schedule flags (per cell) and findings (per group and activity; desktop ADR
2026-07-28 "Reshape schedule flags"), and where each lives here.

| Desktop                                                                                                                                                            | What it said                                                                     | Here                                                                                                                                                                                                                                                    |          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `UNDERSERVED`                                                                                                                                                      | A group short of an activity's weekly minimum                                    | `stillNeeded` lines and `stillNeededBy` data                                                                                                                                                                                                            | Carried  |
| `DISTRIBUTION`                                                                                                                                                     | Short of an early-week goal                                                      | `spread` lines and `spreadBy` data ("by Wednesday" counts Wednesday)                                                                                                                                                                                    | Carried  |
| `UNFILLABLE` and its reasons (nothing eligible, weekly max, already today, place full, no room for full length, activity at capacity, busy at an overlapping time) | A cell left blank, and why                                                       | Never blank fills the cell; the rule it bends is a dot in `flags`. Only a cell nothing can go in is in `openCells` ("Already busy then", "No activity fits this gap")                                                                                   | Replaced |
| `OUTER_RESOURCE_CONFLICT`                                                                                                                                          | Combined use of a place over its capacity, across cohorts or between fixed items | Other programs' groups count in the build and in checkWeek's place capacity, groups at once and same division (`flags`, `overlapping`). Fixed and recurring activities over a place's capacity are refused by setup's clash checks (slice 3b)           | Replaced |
| `OVERLAP` (place capacity, an activity's groups per slot, a group in two blocks at an overlapping time)                                                            | A cell booked past a limit it shares with other cells                            | `overlapping`, one entry per cell, in the same give-way order as the dots. Adds same division only (Greg's give-way order, decision 10), which the desktop's `OVERLAP` didn't check                                                                     | Carried  |
| `FIXED_EVENT_OVERLAP`                                                                                                                                              | Two same-name fixed events in one group's block                                  | Refused by setup's clash checks; a cell holds one item; Start a blank week lists anything it couldn't place (ADR 0008 §3)                                                                                                                               | Replaced |
| `DANGLING_LOCATION`                                                                                                                                                | An activity set to a place that isn't in the list                                | Can't happen: `Activity__c.Location__c` is restrict-delete and must be in the activity's season (`ActivityTriggerHandler`). A place missing from the engine's input has no limit, as on the desktop, so G2's reader passes every location of the season | Dropped  |
| `FIXED_EVENT_DUPLICATE`                                                                                                                                            | An activity also placed as a fixed event                                         | Fixed and recurring activities aren't linked to activities (data model)                                                                                                                                                                                 | Dropped  |
| `FIXED_EVENT_IDENTITY_GAP`                                                                                                                                         | A fixed event linked to no live activity                                         | Greg's answer to Q12                                                                                                                                                                                                                                    | Dropped  |
| `EVENTS_ONLY_SPAN`                                                                                                                                                 | A locked span running into an events-only block                                  | `EventsOnly__c` was removed in slice 3b                                                                                                                                                                                                                 | Dropped  |
| `WEATHER_RISK`                                                                                                                                                     | Outdoor activity                                                                 | Already removed on the desktop                                                                                                                                                                                                                          | Dropped  |
| Early-week goal aimed at a replaced (special) day                                                                                                                  | The goal's day isn't a normal day this week                                      | Special days aren't set up in Salesforce yet                                                                                                                                                                                                            | Later    |
| Elective findings (`BELOW_MINIMUM`, `KEPT_BELOW_MINIMUM`, `NO_CAMPERS`, `NO_CAPACITY`, `NO_OFFERINGS`, `UNPLACED_AFTER_DECLINE`, `UNSUPPORTED_LINKED_CHOICE`)      | Elective seat assignment                                                         | Electives aren't built yet                                                                                                                                                                                                                              | Later    |

What changed in kind: the dots are worked out from the finished grid by one module for both
schedules (`checkWeek`), never stored, and over the weekly limit dots only the sessions past it
(Greg).

## Tests

- The desktop's tests, ported (`ported.test.js`): the tight Latin-square week, never lifting
  below a minimum, the capped-activity matching sweeps, the minimum repair (including the
  1,000 seeded weeks known to be feasible, with locks every fifth week), multi-block first
  (contiguous sessions, 3-block runs, the 30-case groups-at-once grid), overlapping blocks.
- The rules one at a time (`rules.test.js`), including each step of the order rules give way,
  overlapping blocks keeping the most cells, a gap no activity fits staying Open, and going over
  weekly maximums first with the smallest overage.
- `checkWeek`'s own tests (`checks.test.js`, `checks.property.test.js`), moved with it.
- A seeded property test (`properties.test.js`, 300 random small camps with divisions,
  part-day groups, overlapping blocks, places, fixed activities, locks and kept cells from an
  earlier build, both modes, other programs), checked by an independent checker
  (`__tests__/data/check.js`): no hard rule broken unless a flag on a generated cell names it;
  never blank (a cell left Open must have the group busy at an overlapping time); locked, fixed
  and not-at-camp cells untouched; deterministic; and the engine's dots are exactly what
  `checkWeek` says about its finished week, with checkWeek's model built from the camp, not by
  the engine. A second property test (300 camps where only weekly maximums press) checks that
  no bunk is two or more over on an activity while another, at most one over, was free for
  that cell.
- Determinism (`determinism.test.js`): a pinned week, byte-identical rebuilds, 20 shuffled input
  orders, shuffled grid group order, no `Math.random`, different options, weeks and programs.
- Two camps where the leniency alone made the week worse, kept as fixed data
  (`__tests__/data/repairCamps.js`: the coordinator's reviewer's camp 166, and camp 93 from the
  probe).
- Performance (`performance.test.js`): 12 groups × 5 days × 8 blocks, a week that fits and one
  that can't. Each is bounded by its work, the rule checks the build makes (`ruleChecks` in the
  result: the same on any machine; about 20,000 and 1,070,000 today, with headroom), and only
  loosely by wall time, since CI runners are slower: the week that fits takes about 20 ms on a
  laptop, the one that can't about 0.7 s on a laptop and 1.6 s on CI (it is often built twice,
  with and without the minimum repair's leniency). For G3: the coordinator measured a
  40 × 5 × 12 week that can't fit at about 6 seconds. `generateWeek` is one synchronous call, so
  as it stands the screen would freeze for that long and couldn't show progress; G3 will need the
  build split into pieces it can run a little at a time (or moved off the main thread), and only
  then can `ruleChecks` drive a progress display.
- Mutation check of the key guards (review practice): deliberate breakages of the rules, kept
  cells, never-blank, the overlap choice, the smallest overage, the repair limit, the seed, input
  ordering and checkWeek's rules; every one makes a test fail (taking out the repair rollback
  makes the build loop forever).

## Choices (G2)

13. **Reading the engine's inputs** (`GeneratedScheduleController.getInputs`, `GeneratedInputs`).
    One call returns everything `generateWeek` needs for a program and week, every query in user
    mode (`WITH USER_MODE`, so object and field access is checked):
    - the week's days in Manual Build's day shape: the Generated draft's days when there is one,
      otherwise a blank week built now and not saved (`BlankWeek`, the same as Manual Build's
      Start a blank week: fixed and recurring activities placed where setup puts them, groups away
      that week left out, with its "not placed" list). The set-time reader behind it runs in system
      mode and is checked first by `SetTimeAccess` (ADR 0008 §3). Opening the screen saves nothing;
    - the season's records as records (field names carry the package's prefix once it has one):
      the program's groups (division, availability, sort order) and time blocks (part of day,
      sort order); the season's activities with every rule field the engine reads; who each is set
      up for (`ActivityEligibility__c`); locations with groups that fit; the program's fixed and
      recurring activities (for their places); this week's exceptions. Who a recurring activity
      covers (`Coverage__c`) is already applied in the days, where it is placed, so it isn't sent
      again;
    - the draft's Id, what its days were saved at (`revision`, below) and the option it was built
      with. Locks come in G4 (grid format v2); until then the data module sends none, and other
      programs (G5) none.
14. **The Generated draft** (`GeneratedDrafts`). One `Schedule__c` per program and week, Status
    Draft, Origin Generated, named "Generated Schedule", beside Manual Build's (decision 1: two
    separate schedules). It is made by the week's **first save** (Generate), not by opening the
    week, under the program-row lock as `ManualDrafts.start` does: the save locks the program,
    then looks again. Unlike Manual Build's Start, a second first save does not get the first
    one's draft: it is a **conflict**, since taking it would replace someone's generated week
    unseen. The first save also builds the blank week again under the lock and compares it with
    what was sent; if setup has changed the days since (a time block added), that is a conflict
    too, saying so: _Main's time blocks or groups changed since you opened this week. Open it
    again, then generate._ (camp words).
15. **Saving a week** (`saveWeek`, `GeneratedSaves`): the whole week at once, for Generate,
    Rebuild, Try another, Fill the open cells and Start over. The **schedule-level revision
    check** (ADR 0005 §9): `revision` is every day's revision in one text
    (`2026-06-29:3|2026-06-30:3|…`); the save locks the draft, reads its days and compares the
    whole text. Any day saved by someone else since means **nothing is written** and the answer
    is `conflict` with ADR 0005's sentence ("Someone else changed this schedule since you opened
    it…"), for the screen to show. Otherwise the days are written through `ScheduleDaySaves` at
    the revisions just read under the same lock, so its own check passes. A conflict is an
    answer, not an error; a refusal (below) is an error with a sentence.
16. **Rebuild and Start over keep a version first** (decision 2), in the same all-or-nothing
    save: Status Version, Origin Generated, `SourceSchedule__c` the draft, named "Before Rebuild"
    or "Before Start over", with the draft's days and option. **One new `VersionReason__c`
    value: `AutoSaved` (label "Auto-saved")**, the desktop's word for a version the app keeps by
    itself; neither Imported nor Saved by hand is true of it. Try another and Fill the open cells
    keep no version: any option can be built again (decision 4), and Fill the open cells only
    adds. A conflict or refusal keeps nothing.
17. **The option is stored** (decision 4): **one new field, `Schedule__c.EngineOption__c`**
    (Number, four digits): the option the week was last built with, also on the versions kept
    before a rebuild, so the same option can be brought back. No existing field could hold it:
    the name is the version's own and can be renamed, and the grid's format has no place for it.
    It is the first of the data model's planned "engine fields" (what a generated schedule was
    built from). Options run 1 to 9999; anything else is refused with the engine's "That option
    can't be built."
18. **What the server checks on save** (`GeneratedFrames`, `GeneratedChecks`), refusing the
    whole week with a sentence and writing nothing:
    - the days sent are exactly the draft's days (each date once), each on its own time blocks
      and groups, in order: the stored frame is kept, only items and rows are taken from the
      screen, and they must make a readable grid (ADR 0005 §6), stored one way (Open as empty,
      item numbers without leading zeros, 18-character Ids). A draft with a day that can't be
      read is refused, naming the day: _Monday could not be read: …_;
    - only this program's and week's Generated draft: a version or published schedule ("A saved
      version can't be changed."), Manual Build's draft or another week's are refused; Generate
      is only a first save, the others need the draft;
    - on every cell that changed, Manual Build's own rules (`SlotRules`, the same sentences):
      fixed and recurring activities are not moved, covered, cleared or placed; nothing is put
      where the group isn't at camp; an activity must be this season's. **A leftover where the
      group isn't at camp may be cleared** (a full build does, ADR 0010 §3), never filled or
      changed. Something not set up yet (elective, trip…) is kept, never newly placed;
    - **Fill the open cells changes only cells that were Open** (the engine keeps every filled
      cell, §3), so it can't replace a week without the version Rebuild keeps;
    - names come from the server: an activity's from setup now, anything else's as saved.
      Rule bends (over a weekly limit, twice a day, not set up for a group, groups at once, same
      division, place capacity) are allowed: the engine flags them.
19. **Permissions** (decision 8): the Shoresh Scheduler permission set gets
    `GeneratedScheduleController` and `EngineOption__c` (read and edit). No new global members.
20. **The data module** `c/shoreshGeneratedWeek` (no screen yet: G3):
    - `loadWeek(programId, weekId)` gives `generateWeek`'s input plus the draft, its revision
      and option;
    - `saveWeek(loaded, { action, option, days })` sends only what the server reads and
      resolves to `saved` (with the new revision for the next save), `conflict` or `refused`,
      each with its sentence.

    It names no fields: records pass through as the server sends them.

21. **Code layout (G2):** `GeneratedScheduleController` (two calls), `GeneratedInputs` (the
    reader), `GeneratedDrafts` (find, lock, revision), `GeneratedWeek` (what is sent and returned),
    `GeneratedSaves` (the save), `GeneratedFrames` and `GeneratedChecks` (the checks).
    Shared with Manual Build: `ProgramReads` (now also reads sort orders), `BlankWeek`,
    `ScheduleViews.dayViews`, `SlotRules` (a second constructor, and `activityOf`/
    `seasonActivity`), `ScheduleDaySaves.CHANGED_SINCE`.

## Tests (G2)

`GeneratedScheduleTest` and `GeneratedRefusalsTest` (Apex, as a scheduler with the permission
set; camp in `GeneratedTestData`): the inputs of a week not generated yet (blank week, the
season's records with their rule fields, only this week's exceptions, nothing saved); the first
Generate making the draft beside Manual Build's; two first saves making one draft and the second
told of it; a save over a newer one is a conflict and writes nothing; Rebuild and Start over keep
a version first and Try another and Fill the open cells don't; names from setup; and each
refusal above, each writing nothing; someone without Shoresh access can neither read nor save.
Jest for `c/shoreshGeneratedWeek`, in the normal and namespaced runs, including one that feeds
what it loads to the real `generateWeek` and sends what it built.

## Not done in G2

- Truly simultaneous first saves are not exercised (Apex tests run one at a time), as in ADR
  0008; the test saves twice from the same read, and the code takes the program's lock before
  looking again.
- The server doesn't refuse an activity or place closed this week, or a group marked away after
  the draft was made: the engine leaves them out, and Manual Build can place them by hand too.
- When locks are stored (G4), the server must refuse a save that changes a locked cell itself,
  not leave it to the browser.
- Deleting a week or program says _That includes its Manual Build and 2 saved versions._ but
  doesn't yet name a Generated draft (`shoreshCampSetup.savedSchedulesNote`): for G3, when the
  screen can make one.

## Choices that are hard to undo after release

None in G1: no objects, fields, picklist values or Apex. Locks are stored in G4 (grid v2).

G2:

- The field `Schedule__c.EngineOption__c` (Number, 4 digits, no decimals).
- The picklist value `VersionReason__c` `AutoSaved` ("Auto-saved").
- The Generated draft's name "Generated Schedule" and the versions' names "Before Rebuild",
  "Before Start over" (stored text; versions can be renamed).
