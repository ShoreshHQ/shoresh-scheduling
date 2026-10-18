# 0010: Generated Schedule

Status: proposed (2026-10-17), parts G1 (the engine), G2 (reading its inputs, saving the
week), G3 (the screen) and G5 (other programs' occupancy) of 5. Design source: wiki
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
  cells, Start over; the dots and their hover; still to place).
- G4: locks (automatic on hand edits; lock a cell, day or group; stored in grid
  format v2).
- G5: other programs' occupancy fed to the engine (and to Manual Build's checks).
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
   date and clock time. Entries count against each of this program's blocks whose time they
   overlap, on places' groups that fit and activities' groups at once, as the most groups there
   at any one moment of the block (§28). No count means one
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
      the program's groups at camp that week (division, availability, sort order) and time
      blocks (part of day, sort order); the season's activities with every rule field the
      engine reads; who each is set up for (`ActivityEligibility__c`); locations with groups that fit; the program's fixed and
      recurring activities (for their places); this week's exceptions. Who a recurring activity
      covers (`Coverage__c`) is already applied in the days, where it is placed, so it isn't sent
      again;
    - a group marked away this week after the draft was made keeps its row in the draft's days
      but is not among the groups sent: the engine keeps the row of a group it isn't sent as it
      is, and the save refuses anything new there (§18). The desktop leaves away groups out
      before every build the same way;
    - the program's and week's own Ids (18 characters), which the engine compares exactly and
      seeds with, whatever Ids the screen was given;
    - the draft's Id, what its days were saved at (`revision`, below) and the option it was built
      with;
    - "deleted since" in the days (ADR 0005 §4) from the records just read: the program's time
      blocks, groups, fixed and recurring activities and the season's activities. Unlike the
      Schedules page (`ScheduleRefs`, which looks for the record anywhere it can be seen), a
      record of another season or program counts as gone here; a Generated draft never holds one,
      since a save refuses another season's activity. The week a Lock or a hand edit answers
      with is marked the same way (`GeneratedInputs.view`), so a note never comes and goes
      between opening the week and changing it;
    - each day's locked cells (G4, §32), which the data module turns into the engine's locks.
      Other programs come with G5 (§27–31).
14. **The Generated draft** (`GeneratedDrafts`). One `Schedule__c` per program and week, Status
    Draft, Origin Generated, named "Generated Schedule", beside Manual Build's (decision 1: two
    separate schedules). It is made by the week's **first save** (Generate), not by opening the
    week, under the program-row lock as `ManualDrafts.start` does: the save locks the program,
    then looks again. Unlike Manual Build's Start, a second first save does not get the first
    one's draft: it is a **conflict**, since taking it would replace someone's generated week
    unseen. The first save also builds the blank week again under the lock and compares it with
    what was sent (`GeneratedSetupChanges`); if setup has changed it since, that is a conflict
    too, naming what changed (camp words), never a refusal that blames the director: _Main's
    days changed …_, _Main's time blocks on Monday changed …_, _Main's groups on Monday
    changed …_, or, for a fixed or recurring activity added, moved or removed, _Period 2 for
    Group A on Monday changed since you opened this week. Open it again, then generate._
15. **Saving a week** (`saveWeek`, `GeneratedSaves`): the whole week at once, for Generate,
    Rebuild, Try another, Fill the open cells and Start over. The **schedule-level revision
    check** (ADR 0005 §9): `revision` is every day's revision in one text
    (`2026-06-29:3|2026-06-30:3|…`); the save locks the draft, reads its days and compares the
    whole text. Any day saved by someone else since means **nothing is written** and the answer
    is `conflict` with ADR 0005's sentence ("Someone else changed this schedule since you opened
    it…"), for the screen to show. Otherwise the days are written through `ScheduleDaySaves` at
    the revisions just read under the same lock, so its own check passes. A conflict is an
    answer, not an error; a refusal (below) is an error with a sentence. A save takes its lock
    (the program's for a first save, the draft's after) before it reads the setup it checks
    (`GeneratedSetup`: time blocks, groups, this week's exceptions), so a save that waited sees
    what the one before it left. Week exceptions are saved without taking either lock, so one
    saved while a save is running can still be missed by it; the next save
    or Rebuild sees it.
16. **Rebuild, Try another and Start over keep a version first**, in the same all-or-nothing
    save: Status Version, Origin Generated, `SourceSchedule__c` the draft, named "Before
    Rebuild", "Before Try another" or "Before Start over", with the draft's days and option.
    Greg's decision 2 names Start over; Rebuild and Try another follow the desktop, which keeps
    an Auto-save before every build that replaces a week (`useGeneration.js`). Try another
    can't count on building the old option again: setup may have changed since. **One new
    `VersionReason__c` value: `AutoSaved` (label "Auto-saved")**, the desktop's word for a version the app keeps by
    itself; neither Imported nor Saved by hand is true of it. Fill the open cells keeps no
    version: it only adds (§18). A conflict or refusal keeps nothing.
17. **The option is stored** (decision 4): **one new field, `Schedule__c.EngineOption__c`**
    (Number, four digits): the option the week was last built with, also on the versions kept
    before a rebuild, so the same option can be brought back. No existing field could hold it:
    the name is the version's own and can be renamed, and the grid's format has no place for it.
    It is the first of the data model's planned "engine fields" (what a generated schedule was
    built from). Options run 1 to 9999, in the engine too (`optionOf`), so a week it builds can
    always be saved; anything else is refused, by both, with "That option can't be built."
18. **What the server checks on save** (`GeneratedFrames`, `GeneratedGrids`, `GeneratedChecks`,
    `GeneratedClosures`), refusing the whole week with a sentence and writing nothing:
    - the days sent are exactly the draft's days (each date once), each on its own time blocks
      and groups, in order: the stored frame is kept, only items and rows are taken from the
      screen, and they must make a readable grid (ADR 0005 §6; a broken one is refused in plain
      words, never the format's own), stored one way (Open as empty, item numbers without
      leading zeros, 18-character Ids). A draft with a day that can't be
      read is refused, naming the day: _Monday could not be read: …_;
    - only this program's and week's Generated draft: a version or published schedule ("A saved
      version can't be changed."), Manual Build's draft or another week's are refused; Generate
      is only a first save, the others need the draft;
    - on every cell that changed, Manual Build's own rules (`SlotRules`, the same sentences):
      fixed and recurring activities are not moved, covered, cleared or placed; nothing is put
      where the group isn't at camp; an activity must be this season's. **A leftover where the
      group isn't at camp may be cleared** (a full build does, ADR 0010 §3), never filled or
      changed;
    - this week's exceptions, read again under the lock (`GeneratedClosures`): nothing new for a
      group away this week (_Group B isn't at camp in Week 1._), and no activity newly placed
      that is closed this week or whose place is (_Soccer is closed in Week 1._, _Gym is closed
      in Week 1._). Unchanged leftovers may stay or be cleared, as above;
    - something not set up yet (elective, trip, special day or event from an import) stays where
      it is, as the engine keeps it: changing or clearing it is refused (_Chugim stays where it
      is._, Manual Build's words), and it is never newly placed;
    - **Fill the open cells changes only cells that were Open** (the engine keeps every filled
      cell, §3), so it can't replace a week without the version Rebuild keeps;
    - names come from the server: an activity's from setup now, anything else's as saved.
      Rule bends (over a weekly limit, twice a day, not set up for a group, groups at once, same
      division, place capacity) are allowed: the engine flags them.
19. **Permissions** (decision 8): the Shoresh Scheduler permission set gets
    `GeneratedScheduleController` and `EngineOption__c` (read and edit). No new global members.
20. **The data module** `c/shoreshGeneratedWeek` (no screen yet: G3):
    - `loadWeek(programId, weekId)` gives `generateWeek`'s input (with the server's own Ids)
      plus the draft, its revision, its option and the blank week's "not placed" list;
    - `saveWeek(loaded, { action, option, days })` sends only what the server reads and
      resolves to `saved` (with the new revision for the next save), `conflict` or `refused`,
      each with its sentence.

    It names no fields: records pass through as the server sends them.

21. **Code layout (G2):** `GeneratedScheduleController` (two calls), `GeneratedInputs` (the
    reader), `GeneratedDrafts` (find, lock, revision), `GeneratedWeek` (what is sent and returned),
    `GeneratedSaves` (the save), `GeneratedSetupChanges` (what changed before a first save),
    `GeneratedFrames`, `GeneratedGrids`, `GeneratedChecks` and `GeneratedClosures` (the checks).
    `GeneratedSetup` reads the program's setup for the week once per request (program, week,
    time blocks, every group, this week's exceptions; the camp's words only when needed) and
    shares it with the reader, the save, the checks and `BlankWeek.build(setup)`, so a request
    uses a fixed, small number of queries whatever the week's size. `SlotRules` takes a
    `SlotRules.Setup` (Manual Build's is built in `SlotSaves`); the reader marks what is
    "deleted since" from the records it has just read, not `ScheduleRefs`' extra queries.
    Shared with Manual Build: `ProgramReads` (now also reads sort orders), `BlankWeek`,
    `ScheduleViews.dayViews`, `SlotRules` (a second constructor, and `activityOf`/
    `seasonActivity`; it reads activities' places too), `ScheduleDaySaves.CHANGED_SINCE`. Deleting
    a week or program now names a Generated draft too: _That includes its Manual Build, its
    Generated Schedule and 2 saved versions._ (`shoreshCampSetup.savedSchedulesNote`).

## Tests (G2)

`GeneratedScheduleTest` and `GeneratedRefusalsTest` (Apex, as a scheduler with the permission
set; camp in `GeneratedTestData`): the inputs of a week not generated yet (blank week, the
season's records with every rule field the engine reads, every place, only this week's
exceptions, groups away left out, the "not placed" list, nothing saved); the first Generate
making the draft beside Manual Build's; two first saves making one draft and the second told of
it; a save over a newer one is a conflict and writes nothing; Rebuild, Try another and Start over
keep a version first and Fill the open cells doesn't; names from setup; a first save after setup
changed, as a conflict naming what changed; and each refusal above (including another
program's request for this draft, and a first save naming a revision), each writing nothing;
someone without Shoresh access can neither read nor save. Each new check was confirmed to fail
its test when taken out (Jest; the Apex ones by reading, as the org was busy).
Jest for `c/shoreshGeneratedWeek`, in the normal and namespaced runs, including one that feeds
what it loads to the real `generateWeek` and sends what it built.

`GeneratedLimitsTest`: a realistic week (8 groups in two divisions, 5 days, 8 time blocks, a
fixed activity every morning) opened, generated and rebuilt, each request within 25 queries
(Salesforce allows 100). Measured in shoresh-test (2026-10-18): opening a week not generated
yet 18 (7 of them the set-time reader's), opening a generated week 12, the first Generate 21
(3 of them the `Schedule__c` trigger's), Fill the open cells 14, a Rebuild with its version 19. No query runs per day, group or cell. Test setup runs the fixed-activity clash check once
(`SetTimeGuard.defer` / `checkPending`), as a screen save does, so each test fits one test's
limits.

## Not done in G2

- Truly simultaneous first saves are not exercised (Apex tests run one at a time), as in ADR
  0008; the test saves twice from the same read, and the code takes the program's lock before
  looking again.
- When locks are stored (G4), the server must refuse a save that changes a locked cell itself,
  not leave it to the browser.
- An away group's row keeps whatever it held, and those leftovers still count toward places
  and groups at once in the engine. G3 shows the row; clearing it is the director's choice.

## Choices (G3)

22. **The build runs in steps** (`generateWeekSteps`). The engine's build is a generator: it
    yields how far it has got (0 to 1, only going up) between pieces of work (a cell in a round
    or a repair, one minimum-repair pass, one never-blank cell), and returns what `generateWeek`
    returns. `generateWeek` runs it to the end at once, so every engine test covers both. The
    steps only report; they never change the build, so a week built in steps is the same week
    (tested on random camps in both modes and on a week that can't fit). How far it has got is
    the share of each pass done (cells, or activity-and-group pairs, done of all), weighted by
    how long each pass takes on a week that can't fit (the two repairs are about 93%); a week
    built twice (the minimum repair's leniency) spends the first half of the bar on the first
    build; the first build's minimum repair settles whether there will be a second, and when
    there won't, the rest of the first build fills the rest of the bar, so every build ends with the bar full. The screen shows the desktop's moving bar (no number)
    until a long build first reports, then the number, and 100 once the week is built, while it
    saves. The screen (`pieces.js`) runs about 30 ms of steps, then gives the browser a turn
    (a message the page posts itself through a `MessageChannel`, handled as a task of its own,
    as React's scheduler does; no timer, which the platform's lint rules don't allow, and none
    of a timer's clamping), and draws the bar. Where `MessageChannel` is missing or refused the
    pieces follow at once, without the browser's turns (Jest's jsdom has none; every browser
    has it). A timer would be the better fallback, but `setTimeout` is a Moderate finding for
    CI's code analyzer (`@lwc/lwc/no-async-operation`), as is an inline exemption, so it would
    fail CI; allowing it for this one file is a CI-settings call, not made here. The coordinator's 40 bunks × 5 days × 12 blocks week
    that can't fit (8.8 million rule checks, about 6.5 s under Jest) now runs with at most about
    50 ms between steps; the test bounds it loosely. `ruleChecks` stays the measure of work; it
    does not drive the bar, since a week's total isn't known before it is built. A Web Worker
    was not used: the engine is LWC modules, and a worker would need it bundled again as a
    static resource, a second copy to keep in step.
23. **One check for what is shown** (`checkGeneratedWeek`). Dots, counters and lines are worked
    out from the week on screen with the engine's own model of the season (the same readers,
    divisions, not-at-camp rule and other programs as the build), whether the week was just
    built, saved earlier or cleared. So a week reads the same right after a build and after a
    reload (decision: flags are never stored, §11). Without locks (G4) this equals the dots the
    engine returns for a full build. **Open** lines come from the grid too: each at-camp cell
    left Open, with the engine's reason when the grid shows it: _Already busy then_ when the
    group holds something at an overlapping time, _No activity fits this gap_ when the run of
    Open cells it is in is shorter than every activity running this week (decision 11: such a
    gap stays Open with a reason). The reason is the cell's dot and ends its line. A cell Start
    over just cleared has neither: something fits, it just isn't built yet. A group the server
    didn't send (marked away this week since the draft was made, G2 §13) is away in every
    block: hatched, not counted in Filled, never Open.
24. **The screen** (`c/shoreshGeneratedSchedule`), the desktop's generated route:
    - a menu entry and a screen beside Manual Build; the menu lists **Generated Schedule** then
      **Manual Build** (by name, as the desktop's `navSections.js`), and the Roots door holds a
      button for each, side by side, so neither is picked for the director (decision 1;
      behaviour index: the two routes are never ranked);
    - a week not generated yet shows the desktop's empty card, _Let the app propose one_ and
      **Generate a schedule** (Generate, option 1); the blank week's _not placed_ lines, as in
      Manual Build;
    - then the toolbar: **Rebuild** (the whole week again, same option, after the confirm),
      **Fill the open cells** (fill mode; greyed while nothing is Open), **Try another** (the
      next option, saved at once), **Option** (every option tried this visit and the one saved:
      picking one builds it again, exactly, decision 4), and **Start over** (after the confirm:
      every activity cleared; fixed and recurring activities and things not set up yet stay;
      the option stays). Each saves the whole week through G2's `saveWeek` with its action;
    - the confirm, the desktop's `ConfirmRegenModal` with Greg's decisions: _Rebuild this schedule?_ / _Builds Week 1 again from your setup._ / _Saved to Versions first._ /
      Cancel (focus first), **Rebuild it**; and _Start over?_ / _Clears the 34 activity cells
      in Week 1. Fixed activities and recurring activities stay._ (each cell holding an
      activity where the bunk is at camp: what it clears; things not set up yet stay, so Filled
      can show more) / _Saved to Versions first._ /
      Cancel, **Start over**. Neither mentions locks yet: G4 adds _Locked cells stay as they
      are._ to Rebuild and _locked ones too_ to Start over, when there are locks to see. Escape
      cancels, Tab stays in the dialog, and focus goes back to the button (after any build, to
      the button that started it; after a conflict, to Reload);
    - while building: a thin bar that follows the build (role progressbar, 0 to 100) and the
      desktop's _Generating…_; every action and the week and program pickers wait; moving to
      another week stops the build and saves nothing;
    - a conflict (someone else saved the week first, or setup changed under a first save) shows
      the server's statement in a box with **Reload** (its closing "Open it again…" is left
      off: the button is the action, and Open is a cell here); nothing is written, and nothing
      can be built over it until it is reloaded. It stays until the director answers it: the
      season read again (a save on another screen) or coming back to the window reads nothing
      behind it. While the week is being read (Reload, coming back to the window) the actions
      wait. Start over shows _Starting over…_, not _Generating…_; A refusal or an engine error shows its sentence and leaves
      the week as it was;
    - the grid is Manual Build's shared grid, Daily, Group and Activity View, with the bronze
      dot (words on hover, focus or tap, and in assistive text), not-at-camp hatching and the
      legend. Cells are in a keyboard grid (arrows) so a dot's words can be read, and every cell
      is read-only (below);
    - the counters and the _Still to place_ list are Manual Build's shared
      `c-shoresh-week-checks`, with `route="generated"`: **Filled**, **Open** (instead of
      Overlapping, as the desktop shows Unfillable there; overlaps are still listed), **Still
      needed**, **Spread across the week**; each counter shows only its own lines and lights up
      their cells (an Open or overlapping line its cell; a still needed or spread line every
      placement of that activity for that group, desktop `findingHighlight.js`), **Review all**
      shows every line; clicking a line opens that group's week at that cell. Manual Build's
      route is unchanged;
    - after a save, a screen reader hears _Filled 34 of 36._
25. **No hand edits on this screen yet.** A hand edit is a lock (decision 2), so an edit without
    one would be undone by the next Rebuild. Changing cells (drag, type, Delete, undo) comes with
    locks in G4, reusing Manual Build's editing then.
26. **Shared layout CSS** `c/shoreshScheduleScreen` (CSS only, like `c/shoreshTokens`): the
    toolbar, view toggle, pills, Activity View cards and legend. Manual Build still has its own
    copy; it moves over in a later cleanup, so its in-flight PR isn't disturbed.

## Differences from the desktop (G3)

The desktop's generated route (`ScheduleScreen.jsx`, `useGeneration.js`, `ConfirmRegenModal.jsx`,
`FindingsRail.jsx`, Director Guide §4) and what is different here, each with its reason.

| Desktop                                                                      | Here                                                                                                              | Why                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| One action, **Rebuild**                                                      | Rebuild, Try another, Option, Fill the open cells, Start over                                                     | Greg's decisions 2, 4 and 5                                                                                         |
| _Replaces this schedule, including your edits._                              | _Builds Week 1 again from your setup._ (G4 adds _Locked cells stay as they are._)                                 | Hand edits are locks and are kept (decision 2); there are no locks before G4                                        |
| Confirm shown for Rebuild only                                               | Also for Start over, naming how many filled cells it clears                                                       | Start over clears everything (decision 2); the design guide's confirmations name live counts                        |
| Rebuild is quiet, red on hover                                               | Every action quiet; only the confirm's button is red                                                              | Design guide: destructive is loud once, in the dialog; Rebuild keeps a version first                                |
| A version only when the week had cells                                       | Rebuild, Try another and Start over always keep one; Fill the open cells none                                     | G2 §16                                                                                                              |
| Seed fixed per camp and program                                              | Program + week + option; any option brought back                                                                  | Decision 4                                                                                                          |
| Admins only ("Admin only")                                                   | Anyone with Shoresh Scheduler access                                                                              | Decision 8                                                                                                          |
| **Unfillable** counter, red; cells marked _Unfillable_ in red, with a reason | **Open**, bronze; a cell no activity fits has the dot _No activity fits this gap_, a busy one _Already busy then_ | Never blank (decision 7): only a busy or no-fit cell stays Open; one word, Open; red only for errors (design guide) |
| Highlight colour by kind (red, bronze, green)                                | One bronze outline and tint                                                                                       | Bronze is the caution hue; red only for errors (design guide)                                                       |
| Counters under the toolbar                                                   | Below the grid                                                                                                    | Design guide: "The generated schedule opens on the grid; concern counts sit below it"                               |
| _Placed X of Y_                                                              | _Filled X of Y_                                                                                                   | Decision 16 (one word per idea)                                                                                     |
| Engine's raw finding text ("Goal: N×/wk — scheduled M×")                     | The engine's lines (_Swim · Bunk 3: 1 still needed_)                                                              | ADR 0010 §7 and §11: one set of words for both schedules                                                            |
| Indeterminate bar, engine on the main thread                                 | The same moving bar for a short build; a long one shows how far it has got, to 100, run in pieces                 | A 40-bunk week takes about 6 s; the tab must not freeze (§22)                                                       |
| Drag, swap, undo on the generated grid                                       | Read-only until G4                                                                                                | §25                                                                                                                 |
| Rebuild clears Undo and Accepted findings                                    | Accepted lines come back after each build or reload, as on the desktop; no Undo here yet                          | Undo comes with editing in G4                                                                                       |
| Neutral _Schedule_ entry: _Open_ with each route's _X of Y placed_           | Roots door with both buttons, no counts                                                                           | The counts would need both drafts read for a week before one is chosen; the door names no week                      |
| Rainy day…, Export, Versions dropdown on the toolbar                         | Not on this screen                                                                                                | Not built for either schedule yet                                                                                   |
| Special days replace days                                                    | Not here                                                                                                          | Special days aren't set up in Salesforce yet                                                                        |

## Choices (G5)

27. **What counts** (Greg's decision 6; `OtherProgramUse`, read with the engine's inputs). For
    every other program of the season and every day of the week: its **published** schedule's
    cells when it has one for that day, fixed and recurring activities included as placed there
    (`OtherProgramGrids`); otherwise its fixed and recurring activities with a place, where setup
    puts them (`OtherProgramSetTime`, SetTimePlan's rules, the same as Start a blank week and
    setup's clash check: a fixed activity takes every group of its program, a recurring one the
    groups it covers, only groups at camp in each time block). Never both for one day, so nothing
    counts twice. **Drafts and versions never count**: only Status Published (should a program
    have more than one, the newest). A group away that week, a place closed that week, and a fixed
    or recurring activity off that week don't count, as in the clash check, for published cells
    too. A published cell whose Id can't be read is skipped, never a screen that fails to open. A published cell
    counts at its activity's place (as setup has it now) and for the activity; a fixed or
    recurring one at its place; something not set up yet (elective, trip...) counts nowhere.
    Publishing itself is Manual Build part 5, so until it ships the fixed and recurring activities
    are what a camp will see counted.
28. **By clock time.** Programs keep their own time grids, so each entry is one of the other
    program's time blocks with its real start and end (`dateValue`, `startTime`, `endTime`
    "HH:mm", `locationId`, `activityId`, `groups`), summed per date, time, place and activity and
    sorted, so the same week always sends the same list. For each of this program's blocks the
    engine counts the **most groups there at any one moment** (a sweep over the entries' start
    and end times inside the block; touching times don't overlap), never the total of every
    entry it overlaps: one group across two of the other program's shorter blocks is one group,
    and two groups one after the other are one at a time (coordinator's review). The data module renames
    `dateValue` to the engine's `date` (`readOtherPrograms`: `date` is reserved in Apex).
29. **No overrun, no conflict.** Other programs only take room: the engine places elsewhere when
    a place's groups that fit or an activity's groups at once is used up, and a dot appears only
    when the finished week is over capacity there (checkWeek's place capacity, groups at once and
    same division only, which already counted other programs, §10).
30. **Manual Build dots the same.** Its draft (`ManualBuildViews.DraftView.otherPrograms`) carries
    the same list, and its checks give checkWeek `othersAt` from `otherProgramsAt` (exported by
    `c/shoreshEngine`, the engine's own counting on Manual Build's days), so both schedules dot
    the same over-capacity places. Nothing else in Manual Build changes.
31. **Reads.** User mode, `with sharing`: at most four queries whatever the number of programs
    (the other programs with their time blocks, fixed and recurring activities; their published
    days; their groups and who their recurring activities cover only when one has a place), one
    when the season has no other program; Manual Build adds the week's exceptions. Programs and schedules are controlled by their season (`ControlledByParent`), so whoever
    can open this program's week sees every other program of the season: a program the user can't
    see while seeing this one can't be made, and so isn't tested. `GeneratedSetup` now also reads each exception's fixed and
    recurring activity. `ScheduleDays.readDay` is public, so published days are read as any day.

32. **The dot names what else is at the place** (follow-up to G5). The desktop names the
    activities, not the program: `conflictFindingMessage` (runStateCopy.js) gives "Pool on
    Monday, Period 2: Swim and Teen swim double-booked (capacity 3).", and buildSchedule.js an
    empty cell's "Pool in use by Teen swim". Here, on hover as every dot's words are: _More Bunks
    at Pool than fit, in use by Teen swim_ (several: "Archery, Lunch and Teen swim", in
    alphabetical order; `reasonFor`'s `inUseBy`). A comma, not " · ", which already joins one
    reason to the next. Each `OtherProgramUse.Entry` carries `names`:
    the activity's, or the fixed and recurring activities' at that place and time, read with the
    rest (the season's activities, and `Name` on the fixed and recurring activities in the one
    other-programs query), so no query is added. One the user can't read (an activity not in the
    season's readable list, say) names nothing, and the dot stays. Over its limit of groups at
    once counts other programs' groups doing the same activity, so a name would only repeat the
    activity's own: it says _Over its limit of 2 Bunks at once, with another program_ instead,
    in the camp's word for Program. Both schedules, since both use checkWeek (`otherNamesAt`
    beside `othersAt`).
    Who decided: naming the activities, not the program ("in use by Swim" even when the other
    program's activity is called Swim too), is Greg's decision (2026-10-18, wiki decision 25:
    keep the desktop's wording). "with another program" for groups at once is a coordinator
    call: the desktop has no words for that case. A placement over several time blocks says
    each rule once: the names from all its blocks together, and "with another program" if any
    of its blocks has their groups; each cell's Overlapping line keeps its own block's words.

## Tests (G5)

`GeneratedOtherProgramsTest` (Apex, as a scheduler, data made inside `runAs`, the clash check
deferred to the end of setup): one program sends nothing; a published day counts at its own times
and a draft doesn't; only the newest published schedule counts, never a version; published cells
carry on across blocks and count fixed and recurring activities at their place; published cells
skip a group away, a place closed and a recurring activity off that week; fixed and recurring
activities count on the days with no published schedule (a two-block recurring one for the one
group it covers, one naming nobody for every group at camp then, one naming a division, a fixed
one for every group), and on a published day that can't be read; a group away, a place closed
and an activity off that week don't count; Manual Build's draft gets the same list. `GeneratedLimitsTest`'s camp gains a second program with a published week and fixed and
recurring activities each, inside the same query bound (opening a week and the first save; the
Rebuild test leaves them out, as its setup runs before `Test.startTest()` and saves don't read
other programs). Jest, normal and namespaced: the data module
passes the list on in the engine's shape; with the Pool free one bunk swims, with another
program's published cell filling it at an overlapping time nobody does (and no dot), and a time
that only touches, or a count of 0, doesn't block; the busiest-moment count (one group across
two shorter blocks, two groups back to back, true overlap, any order, places and activities
apart); Manual Build dots the Pool only once another program's groups take it past what fits,
and counts another program doing Soccer against its bunks at once but not one only at a place.
Naming (§32): Apex, the entries' names (an activity, a fixed activity on a published day and
from setup, and an activity the user can't read naming nothing); Jest, the names per place and
block (in order, once each, only at that place and time), the list's wording (A; A and B;
A, B and C), a two-block placement saying each rule once, Generated's and Manual Build's dot
words with a name and without one. Query counts: `GeneratedLimitsTest` opens a week with one other program
and with three and asserts the same number of queries (catches a query per program), opens the
week again once generated, and opens Manual Build, each with other programs. Jest: one group
leaving as another arrives counts as one whichever entry comes first (a plain sort by time
passes only when the leaving one is listed first).
The property tests' independent checkers count other programs at their busiest moment too. Each new path was confirmed to fail its Jest test when
taken out; the Apex tests run only in CI.

## Choices (G4: locks, server side)

32. **Locks are stored in grid format version 2** (ADR 0005 §6 planned it; `ScheduleGridLocks`).
    A day with a locked cell gets one more list, `"l"`, after `"r"`: one row per group in the
    same order, one cell per time block, `1` locked or empty (`"l":[",1,",",,"]`), and is saved
    with `GridFormatVersion__c` 2. A day with no lock is stored as version 1, exactly as before,
    so the same day always gives the same text and every day saved so far reads unchanged. Lock
    rows are refused when they don't match the groups or time blocks or hold anything but `1`. A
    day split into parts (ADR 0005 §8) keeps each group's lock row with it; a part with no lock
    has no `"l"`, and joining gives every group a lock row or none. Versions copy a day as it is,
    locks included.
33. **Hand edits are locks** (decision 2). A hand edit on the Generated draft is Manual Build's
    slot save (`GeneratedScheduleController.saveSlots` → `SlotSaves.saveOnGenerated`: the same
    runs, the same compare-and-set and _keep theirs or use yours_ conflicts, the same rules),
    with `GeneratedEdits`:
    - every cell an edit **changes** is locked when it holds something (its whole placement),
      unlocked when left Open, so the next build fills it. An activity made **shorter** by hand
      is locked as it is left (otherwise a build would put it back at full length). Cells a run
      covers but doesn't change, and fixed and recurring activities, are left as they are. Greg confirmed, 2026-10-18
      (decisions 20 and 23, confirmed in 24): clearing a cell by hand reads as "not this" rather than "keep this
      empty"; **Lock** an Open cell to keep it empty;
    - each run names its cells' locks as the screen saw them (`locksBefore`; the data module
      fills it in): a cell whose lock is different now is a conflict like any cell someone else
      changed, so nobody's Lock is removed or covered unseen;
    - **Undo and Redo restore the locks** from before their step (coordinator's call, matching
      the desktop's Undo, which leaves no trace): their runs carry `locksAfter`, each cell's lock
      to restore, and the server sets exactly those (never on a fixed or recurring activity).
      Undoing a hand edit unlocks the cell again; undoing a clear brings no lock back that
      wasn't there. The screen keeps each step's locks with it in its Undo history;
    - the edit names the revision the screen read the week at. The answer's `revision` (with
      the week) is given only when nobody else saved the week in between; otherwise it is empty
      and the screen reads the week again before a whole-week save. So a lock or a hand edit
      never lets a stale screen's Rebuild replace someone else's build without a conflict.

    Manual Build's own saves never lock and stay version 1.

34. **Lock and Unlock** (decision 3; `GeneratedScheduleController.setLocks` → `GeneratedLocks`):
    a cell (date, group and time block), a whole day (date only) or a whole group (group only,
    or with a date for its day; `Lock` and `Unlock` spelled exactly; nothing else is read). **The
    shortcuts lock only cells that hold something** (coordinator's call): locking a day's Open or
    not-at-camp cells would keep them empty through every build, unseen, so keeping a cell empty
    is always a Lock on that one cell. Unlock reaches every cell. Like
    a whole-week save it names the revision the screen read the week at, and is a conflict when
    someone else saved the week since. A lock covers the whole placement: locking or unlocking any
    block of a multi-block activity does all of it, as the engine keeps it. Fixed and recurring
    activities are never locked: they always stay where setup puts them. A change that names no
    cell of the week, or isn't `Lock` or `Unlock`, is refused; so is a change to a version or to
    Manual Build's draft. Only the days whose locks changed are written, at their revisions,
    under the draft's lock (`GeneratedLocks`, `GeneratedLockCells`).
35. **Builds keep locks; the server enforces them.** Rebuild, Try another and Fill the open
    cells keep every locked cell (the engine gets them as `locks`). On save the server keeps the
    stored locks whatever the screen sends, and refuses a build that changes a locked cell:
    _Group A · Monday · Period 2 is locked._ (group, day, time block in the camp's words).
    **Start over** clears every lock, after keeping its "Before Start over" version, which keeps
    them.
36. **The data module** (`c/shoreshGeneratedWeek`): `loadWeek` gives the engine the stored locks
    (`locksOf`: `{ date, groupId, blockId }` from each day's `locks` rows). `saveEdits(loaded,
edits)` adds each run's `locksBefore` and resolves to `saved` with the week to go on with
    (its days, locks and revision replaced together; none when someone else saved meanwhile) or
    `refused`; `setLocks(loaded, changes)` to `saved` with the week, `conflict` or `refused`.
    `saveWeek` answers with the week to go on with too: what was built, the new revision and
    the locks the server kept (`Result.locks`; none after Start over). When someone else saved
    meanwhile, `saveEdits` still gives the week as saved now (its locks seen, so the next edit or
    _Use yours_ isn't a false conflict) with an empty revision, so a whole-week save from it is a
    conflict. `inputFor(loaded, action)` builds Start over with no locks and every other build
    with them. The module's copy of the locks is replaced after every save, never patched.
    **Filled** (`checkWeek`'s cells) doesn't count a cell the director locked empty as one to
    fill (`isLockedOpen`), and the engine never lists it as Open.
    `LOCK` and `UNLOCK` name the two changes. One word, **Lock**, everywhere (decision 3).
37. **The screen's side of locks** (G4 screen; `c/shoreshGeneratedSchedule`, `locks.js`):
    - **the lock icon** (`utility:lock`, slate: the design guide's colour for structure that
      stays put; "Locked" in assistive text) on every locked cell, in its top left corner (the
      dot has the right), on every block of a locked placement; the legend shows it (_Locked_), as the desktop's lists its
      locked mark. **A cell locked empty** reads as kept empty, not as Open (coordinator,
      2026-10-18): no _Open_ word and not Open's dashed look, just the cell and its lock,
      _Locked empty_ in assistive text; Open names only cells still to fill;
    - **one Lock menu** in the toolbar (the word **Lock**, the lock icon), offering what applies
      now: the cell keyboard focus last reached (_Lock Bunk 3 · Monday · Period 2_, an Open
      cell too, to keep it empty; never a fixed or recurring activity), the day shown in Daily
      View (_Lock Monday_), the bunk shown in Group View (_Lock Bunk 3_) and the focused cell's
      bunk's day (_Lock Bunk 3 · Monday_); each with _Unlock …_ when it has a locked cell. A lock left on an empty cell where the bunk has since
      come to be away is listed too, so it can be unlocked (never newly locked). The menu
      stays in the toolbar, held when it has nothing to offer (in Activity View, say), so the
      toolbar doesn't shift and Unlock can't take the control away from under focus; after a
      change focus returns to it, or to the grid when it has nothing left to offer. The
      shortcuts are offered only while they would lock a filled cell, as the server locks only
      those. A change is saved at once (`setLocks`), the week shown is the data module's answer
      (never patched), and it is said back: _Locked Monday._ A conflict is the G3 box with
      Reload, focus on Reload; a refusal its sentence;
    - **builds keep locks**: every build's input is `inputFor(loaded, action)` (Start over
      builds with none), and after every save the screen goes on with the week the data module
      returns, its locks as the server kept them;
    - **the check on load** gets the locks too (`checkGeneratedWeek`): a cell locked empty is
      neither Open nor counted to fill, and an over-the-limit dot goes on an unlocked session
      first, as the engine places it (the same dots as the engine's full build, tested);
    - **the confirms** say _Locked cells stay as they are._ (Rebuild) and _Clears the 34 activity
      cells and every lock in Week 1._ (Start over) when the week has a lock (_Clears every lock in
      Week 1; there are no activity cells to clear._ when it has only locks);
    - **building waits for the basics**, as Manual Build does (#48; desktop `readiness.js`):
      before the first Generate, the desktop's one sentence of what is still needed (_One
      thing still needed before you can build the schedule: Activities._), each missing thing
      a link to its screen, and _Set up …_ for the first, in place of _Generate a schedule_
      (`c/shoreshSetupRules` `stillNeeded` / `stillNeededSentence`, the same as Manual Build's).
      A week already generated opens whatever setup lacks since. It is the one message, as in
      Manual Build's chain: not beside _No weeks yet_, a load error, a conflict, or _Week 1 has
      no days Main runs._;
    - **hand editing** (place, move, swap, clear, length, typing, undo with `locksAfter`) comes
      with the shared week editor `c-shoresh-week-editor`, which Manual Build's session extracts
      from Manual Build after its part 4b (coordinator, 2026-10-18: one editor, no fork). Until
      then the Generated grid stays read-only, its cells reachable from the keyboard.

    Different from the desktop (`SlotCell.jsx`, `preplacedSlots.js`): there, a lock belongs to
    an activity (`is_locked`, set by nothing on screen), a locked cell has a bronze bar and no
    icon, and a click or Enter on it unlocks it at once, with nothing said. Here a lock is a
    cell's (decision 3), shown by the lock icon (decision 3; bronze is caution here), and
    nothing unlocks without the director choosing Unlock: a stray click can't undo a choice,
    and a screen reader hears what changed.

## Tests (G4)

`ScheduleGridLocksTest`: a lock stored as version 2 and read back, the same text again once
unlocked (version 1), a changed cell locked and an Open one not, unclear lock rows refused, locks
split and joined with their groups. `GeneratedLocksTest` (as a scheduler): a hand edit locks
what it changes and unlocks what it leaves Open, with the locks and revision in the answer; only
the cells it changes; whole placements but never Flagpole; an activity made shorter is locked as
left; Undo and Redo restore the locks from before their step; a hand edit over a lock it didn't
see is a conflict, and is made when it names it; a stale screen's lock is a conflict and its
hand edit gets no revision; the day and group shortcuts lock only filled cells, a group's day
only that group that day, and only the day that changed is written again; unlock; one block of
a two-block activity locks both; a build that changes a locked cell is refused and one around it
keeps the lock; Fill the open cells can't fill a locked Open cell; Start over clears the locks
and its version keeps them (version 2); Manual Build's saves stay version 1, and Generated edits
and locks don't reach its draft; changes that name nothing, unknown or misspelled actions,
shapes §34 doesn't list (a time block alone, or with a day but no group) and a version are
refused. `GeneratedLimitsTest`: locking a whole day and a hand edit on the realistic week stay
within the same 25 queries. Jest: `locksOf`; the locks reaching the real `generateWeek`, which
keeps the locked cell in eight options (a run without them moves it), and a cell locked empty
not counted as to fill; `saveEdits` naming the locks seen by day, group and block, and the week
to go on with (also when someone else saved, with no revision); `setLocks` saved, conflict and
refused; `saveWeek`'s locks after a save (none after Start over); `inputFor`.

## Choices that are hard to undo after release

None in G1 or G3: no objects, fields, picklist values or Apex. Locks are stored in G4 (grid v2).

G2:

- The field `Schedule__c.EngineOption__c` (Number, 4 digits, no decimals).
- The picklist value `VersionReason__c` `AutoSaved` ("Auto-saved").
- The Generated draft's name "Generated Schedule" and the versions' names "Before Rebuild",
  "Before Try another", "Before Start over" (stored text; versions can be renamed).

G5: none (no objects, fields or global members).

G4:

- Grid format version 2: the `"l"` list and `GridFormatVersion__c` 2 (every reader must keep
  reading versions 1 and 2).
- `GeneratedWeek.LockChange` actions `Lock` and `Unlock` (sent by the screen, not stored).
