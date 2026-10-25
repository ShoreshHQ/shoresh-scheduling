# The week engine's protocol, rule by rule

Every rule `c/shoreshEngine` applies when it builds a week, in plain words, one line each: the
protocol step it belongs to (Greg's nine steps, wiki `projects/shoresh-sf-engine-care-plan.md`),
the file it lives in, and the test that covers it. Paths are under
`force-app/main/default/lwc/shoreshEngine/`; tests under its `__tests__/`.

- **Gap** in the Test column: no test pins this rule today.
- **To change in a later PR**: the care plan changes this rule; it is written here as it is now.

This list describes the engine as it stands after PR 3 of the care plan. PR 1 moved code into
files by step and changed no behaviour (600 random camps build byte for byte the same); PR 3 made
never-blank bend only preferences, says a blank setup field taken as 1, and counts early-week
goals from the week's real first day (rules 1.5, 1.6, 1.10, 3.1, 3.12, 7.1–7.3, 7.8, 9.5, 9.6).

## The files, by step

| Step                            | File                                  | Runs                      |
| ------------------------------- | ------------------------------------- | ------------------------- |
| 1. Read and check setup         | `setup.js`, `checkInputs.js`          | first                     |
| 2. Lay down what's fixed        | `weekFixed.js`                        | second                    |
| 3. Each cell's options          | `weekOptions.js` (`weekRules.js`)     | asked by every later step |
| 4–6. Place by priority, top up  | `weekPlace.js`                        | third                     |
| 8. Search before giving up      | `weekRepair.js`                       | fourth (before step 7)    |
| 7. Never blank                  | `weekNeverBlank.js`                   | fifth                     |
| 9. Write the why                | `checks.js`, `words.js`, `measure.js` | on the finished week      |
| The ledgers every step shares   | `weekState.js`                        |                           |
| The order, and the second build | `week.js`, `shoreshEngine.js`         |                           |

Note the order: today the repairs (step 8) run **before** never-blank (step 7), as on the
desktop. Never-blank fills whatever the repairs could not.

## Step 1. Read and check setup

| #    | Rule                                                                                                                                                                                                                   | Where                                         | Test                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1.1  | Records are read in SortOrder, then by Id, compared by character code, never by locale.                                                                                                                                | `setup.js` inOrder                            | determinism: "whatever order the records arrive in", "tie in sort order"                               |
| 1.2  | An activity closed this week, or at a place closed this week, is left out.                                                                                                                                             | `setup.js` readActivities                     | rules: "an activity closed this week…"                                                                 |
| 1.3  | No activities at all, or every one closed: the build stops and says so.                                                                                                                                                | `shoreshEngine.js`                            | rules: "says so clearly when there are no activities", "every activity is closed"                      |
| 1.4  | Every day replaced by a special day: the build stops and says so.                                                                                                                                                      | `shoreshEngine.js`                            | specials: "says so when every day is a special day"                                                    |
| 1.5  | A blank groups-at-once (not "No group limit") becomes 1, and the result says so (`setupNotes`: "Arts: Groups at once is blank, so it counts as 1", the setup screen's label). Never 0, never a stop.                   | `setup.js` readActivities, `shoreshEngine.js` | rules: "a blank groups at once…"; oddCamps: "blank groups at once"                                     |
| 1.6  | A blank groups-that-fit for a place an activity this week uses becomes 1, and the result says so (`setupNotes`: "Field: Groups that fit is blank, so it counts as 1"); a place nothing uses this week isn't mentioned. | `setup.js` readLocations, `shoreshEngine.js`  | rules: "a blank groups that fit…", "says nothing of a blank place…"; oddCamps: "blank groups that fit" |
| 1.7  | "No weekly max" and "No group limit" mean no limit.                                                                                                                                                                    | `setup.js`                                    | rules: "no weekly maximum is placed (NoWeeklyMax)"                                                     |
| 1.8  | Length is at least 1 block; minimum at least 0.                                                                                                                                                                        | `setup.js`                                    | Gap                                                                                                    |
| 1.9  | An activity with no eligibility rows is for every group; a row names a group or a whole division.                                                                                                                      | `setup.js` readEligibility                    | properties (random eligibility), rules: "fills a cell no activity is set up for"                       |
| 1.10 | An early-week goal needs a count and a weekday, Monday to Sunday (the picklist offers Monday–Friday).                                                                                                                  | `setup.js` WEEKDAYS                           | oddCamps: "goal by Sunday"                                                                             |
| 1.11 | "Try another" option: a whole number 1–9999, as a number or text; anything else is refused.                                                                                                                            | `shoreshEngine.js` optionOf                   | rules: "Try another"                                                                                   |
| 1.12 | Contradictions (min > max) are refused by the validation rule `MaxAtLeastMin`, not by the engine.                                                                                                                      | object metadata                               | Apex/metadata, not here                                                                                |

## Step 2. Lay down what's fixed

| #   | Rule                                                                                                         | Where                             | Test                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2.1 | Fixed and recurring activities stay where they are and take up their place.                                  | `weekFixed.js`                    | rules: "keeps fixed activities…", "a recurring activity…", "a fixed activity filling a place…"     |
| 2.2 | Special events and elective sets stay; an elective set takes up each of its offerings' places.               | `weekFixed.js`                    | specials: "keeps a placed event…"; electives: "keeps a placed set…", "knows the set has the place" |
| 2.3 | A full build clears every activity not locked; a lock on any cell of a multi-block activity keeps all of it. | `weekFixed.js`                    | rules: "keeps a locked cell in a full build…", "a lock on any cell…"                               |
| 2.4 | "Fill the open cells" keeps every filled cell and fills only the Open ones.                                  | `weekFixed.js`                    | rules: "fill the open cells keeps every filled cell…"                                              |
| 2.5 | A locked Open cell stays Open.                                                                               | `weekFixed.js`                    | rules: "a locked Open cell stays Open"                                                             |
| 2.6 | A cell where the group isn't at camp (morning-only, afternoon-only) is never filled.                         | `weekFixed.js`, `setup.js` atCamp | rules: "leaves a not-at-camp cell Open…"                                                           |
| 2.7 | A group setup no longer has keeps its row exactly as it was.                                                 | `weekFixed.js`                    | rules: "keeps the row of a group setup no longer has…"                                             |
| 2.8 | A day a special day replaces is never built and comes back as it was.                                        | `shoreshEngine.js` splitReplaced  | specials: "never builds on a day a special day replaces…"                                          |
| 2.9 | Kept activities count toward weekly totals, once-a-day and places.                                           | `weekFixed.js` keepRun            | rules: "keeps fixed activities, and counts…"                                                       |

## Step 3. Each cell's options

| #    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                | Where                                                         | Test                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Only activities set up for the group are tried, by every step, never-blank included.                                                                                                                                                                                                                                                                                                                                | `weekFixed.js` readRow, `weekOptions.js`, `weekNeverBlank.js` | properties, rules: "the hard rules", "never places an activity the group isn't set up for…"                                                       |
| 3.2  | Weekly maximum: no more sessions than the max.                                                                                                                                                                                                                                                                                                                                                                      | `weekOptions.js` check                                        | rules: "weekly maximum and once a day hold…"                                                                                                      |
| 3.3  | Once a day: a group does an activity at most once a day; a multi-block one counts once. A limit (Greg, 2026-10-25): never-blank doesn't bend it either; only a hand edit can.                                                                                                                                                                                                                                       | `weekOptions.js` check                                        | checks: "a multi-block placement is one placement"; rules: "never repeats an activity in a day…"                                                  |
| 3.4  | A place holds at most its groups-that-fit, across every activity there, other programs included.                                                                                                                                                                                                                                                                                                                    | `weekOptions.js` placeProblems                                | rules: "a place shared by two activities…"; otherPrograms suite                                                                                   |
| 3.5  | A place nobody set up has no limit.                                                                                                                                                                                                                                                                                                                                                                                 | `weekOptions.js` placeProblems                                | rules: "a place nobody set up…"                                                                                                                   |
| 3.6  | Groups at once: no more groups at an activity than its limit, other programs included.                                                                                                                                                                                                                                                                                                                              | `weekOptions.js` activityProblems                             | ported: "capped activities…"; rules: other programs                                                                                               |
| 3.7  | Same division only: no two divisions share the activity or its place; whoever arrived first holds it.                                                                                                                                                                                                                                                                                                               | `weekOptions.js`                                              | rules: "same division only…" (two tests)                                                                                                          |
| 3.8  | A multi-block activity needs its full length in consecutive Open, at-camp cells that don't overlap in time.                                                                                                                                                                                                                                                                                                         | `weekOptions.js` check                                        | rules: "multi-block activities fill consecutive…", "never runs into a block where the group isn't"                                                |
| 3.9  | A group is in only one of two blocks that overlap in time; blocks that only touch don't overlap.                                                                                                                                                                                                                                                                                                                    | `weekOptions.js` check                                        | ported: "time-overlapping blocks"; rules: "where blocks overlap…"                                                                                 |
| 3.10 | Where a group's blocks overlap, the cells to fill are the choice that holds the most activity time, then most multi-block room, then earliest ends; past 12 overlapping cells, earliest end first.                                                                                                                                                                                                                  | `weekOptions.js` fillable                                     | rules: "the overlap choice looks at activity lengths", "fills two short blocks…"                                                                  |
| 3.11 | Ties are broken by keys drawn from a stream seeded by program, week, option and cell; never `Math.random`.                                                                                                                                                                                                                                                                                                          | `weekOptions.js` drawTieKeys                                  | determinism (all)                                                                                                                                 |
| 3.12 | Early-week goal: the days that count are calendar days from the week's real first day up to the goal's day. The week starts on its first day when that is a Sunday (so a Sunday-start week's Sunday counts before Monday), else on the Monday on or before it. A weekday missing from the week still counts the days before it. No day counts: the goal weighs nothing in placing, so it never costs a filled cell. | `setup.js` earlyDates, `weekOptions.js` readEarlyGoals        | rules: "early-week goals count from the week's real first day" (four tests); oddCamps: "Sunday-start week", "weekend-only week", "goal by Sunday" |
| 3.13 | Only sessions on the days that count meet an early goal (a locked Friday doesn't meet a Tuesday goal).                                                                                                                                                                                                                                                                                                              | `weekOptions.js` earlyScore                                   | rules: "a session later in the week doesn't…"                                                                                                     |

## Steps 4–6. Place by priority, then top up

| #   | Rule                                                                                                                                                                  | Where                              | Test                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| 4.1 | High priority goes first, then low.                                                                                                                                   | `week.js`, `weekPlace.js` runRound | rules: "high priority is placed before low…"                  |
| 4.2 | In each round, multi-block activities first, longest first, round-robin over groups up to each minimum.                                                               | `weekPlace.js` placeSpansFirst     | ported: "multi-block activities are placed first…"            |
| 4.3 | A multi-block session goes on the day that best keeps the early goal, then the day holding fewest of it so far (spread across days).                                  | `weekPlace.js` placeSpansFirst     | ported: "keeps an early-in-the-week goal…"                    |
| 4.4 | In a tight week, scarce activities (capped groups-at-once, with a minimum) are matched per period so every group gets its minimum.                                    | `weekPlace.js` placeScarceSessions | ported: "capped activities in an exactly fitting week (T380)" |
| 4.5 | Then every empty cell, fewest choices first, takes the activity that best keeps the early goal, then the one the group has had least (fair spread), then the tie key. | `weekPlace.js` runRound            | properties; determinism pin                                   |
| 6.1 | Topping up is not a separate step: the rounds fill every cell they can with any activity under its max, not only up to minimums.                                      | `weekPlace.js` runRound            | properties                                                    |
| 6.2 | Spread is fairness of counts per group (least-had first); there is no rule spacing an activity across days for single-block activities beyond once a day.             | `weekPlace.js`                     | Gap (no test of spacing)                                      |

## Step 8. Search before giving up (runs before step 7)

| #   | Rule                                                                                                                                                                          | Where                               | Test                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| 8.1 | Repair 1: an empty cell is filled directly, or by lifting one placement (same group or same period) and refilling it, up to 3 deep, 300 lifts per cell.                       | `weekRepair.js` tryFill             | ported: "repair pass fills a tight but feasible week"                     |
| 8.2 | No repair lifts an activity below its weekly minimum.                                                                                                                         | `weekRepair.js`                     | ported: "never lifts an activity below its minimum…"                      |
| 8.3 | Repair 2: a group short of a minimum gets one more session by an ejection chain, up to 3 deep; multi-block placements are lifted only when that fails, on their own budget.   | `weekRepair.js` raise, minRepair    | ported: "no activity left below its minimum…" (incl. 1000 seeded weeks)   |
| 8.4 | Repair 2 may leave a cell empty for never-blank if the chain leaves no more empty cells than it found; such a week is built again without that leniency and the two compared. | `weekRepair.js`, `shoreshEngine.js` | ported: "camp 166", "camp 93"                                             |
| 8.5 | The two builds are compared by `worse()`: fewer still-needed lines, then fewer bends. **To change in a later PR** (no ranking; the director picks).                           | `shoreshEngine.js` worse            | ported: "camp 93…"                                                        |
| 8.6 | Repair 3: a cell blocked only by an activity's own session elsewhere (twice a day, max, last seat) moves that session in and refills the cell it left, up to 4 deep.          | `weekRepair.js` fillCell            | ported: "repair pass…"; Gap for fillCell on its own                       |
| 8.7 | Every repair step that doesn't end whole is undone; kept cells never move; only single-block generated placements move (except 8.3's span lift).                              | `weekRepair.js`                     | ported: "never moves a locked cell"                                       |
| 8.8 | Repairs stop at fixed work budgets, the same on every machine.                                                                                                                | `weekRepair.js`                     | performance: "gives up on a week that can't fit…", "counts the same work" |
| 8.9 | The imported week is not used as a floor: a build can be emptier than the week it started from. **To change in a later PR.**                                                  | —                                   | Gap                                                                       |

## Step 7. Never blank

| #   | Rule                                                                                                                                                                                                                                   | Where                                           | Test                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Every cell still empty gets an activity the group is set up for that fits every limit (once a day, groups at once, groups that fit, same division, other programs included), bending only its weekly max. Nothing else gives way here. | `weekNeverBlank.js`, `weekRules.js` PREFERENCES | rules: "only the weekly max gives way…", "never repeats an activity in a day…", "never puts one group too many…", "never over-fills a place", "never shares a same-division activity…", "counts other programs as full" |
| 7.2 | Never-blank never tries an activity the group isn't set up for.                                                                                                                                                                        | `weekNeverBlank.js`                             | rules: "never places an activity the group isn't set up for…", "never bends who an activity is for…"; oddCamps: "eligible activities all full"                                                                          |
| 7.3 | Weekly max is a preference (Greg): going over is the only bend, smallest overage first.                                                                                                                                                | `weekNeverBlank.js`                             | rules: "goes over the weekly max before leaving a cell Open…"; properties: "never 2+ over…"                                                                                                                             |
| 7.4 | Then high priority, then least had, then the tie key.                                                                                                                                                                                  | `weekNeverBlank.js`                             | Gap (order after overage not pinned on its own)                                                                                                                                                                         |
| 7.5 | An activity is never shortened: a cell where the group is busy at an overlapping time, or a gap no length fits, stays Open with that reason.                                                                                           | `weekNeverBlank.js` finishOpen                  | rules: "leaves Open only a cell nothing can go in", "never shortens an activity"                                                                                                                                        |
| 7.6 | A cell left out for an overlapping one that stayed Open is filled after all.                                                                                                                                                           | `weekNeverBlank.js` finishOpen                  | rules: "a cell left out is filled after all…"                                                                                                                                                                           |
| 7.8 | Nothing allowed fits: the cell stays Open and says why: "Everything for Bunk 3 is full then" (every activity set up for the group is full or taken then), or "No activity this week is set up for Bunk 3".                             | `weekNeverBlank.js` openWhy, `words.js`         | rules: "never places…", "never puts one group too many…", the hover reasons                                                                                                                                             |
| 7.7 | Locks, fixed and recurring activities and not-at-camp cells never give way.                                                                                                                                                            | `weekFixed.js`                                  | rules: "what is never touched"                                                                                                                                                                                          |

## Step 9. Write the why

| #   | Rule                                                                                                                                                                            | Where                    | Test                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | The finished week is checked by the same rules module Manual Build uses; a bent cell's dots come from that check, not from the builder.                                         | `checks.js`              | checks.property: "agree with an independent oracle"; properties                                                                                 |
| 9.2 | Over the weekly limit dots only the sessions past it, the latest first; locked sessions are skipped.                                                                            | `checks.js`              | checks: "over its weekly limit…"; steps: "the weekly-limit dot goes on the unlocked session"                                                    |
| 9.3 | Each reason is said in camp words, shared with Manual Build.                                                                                                                    | `words.js`               | rules: "the hover reasons, shared with Manual Build"                                                                                            |
| 9.4 | Still needed: each group and activity short of its minimum; spread: each short of its early goal, by that day inclusive.                                                        | `checks.js` stillToPlace | checks: "still to place and the counters"                                                                                                       |
| 9.5 | A week with no day by an early-week goal's day says so once per goal (`noEarlyDay`: "Climbing: this week has no day by Tuesday"), not per group, and lists no shortfall for it. | `checks.js` stillToPlace | rules: "a week with no day by then says so once…"; checks: "no early-week line when the week has no day by then"; oddCamps: "weekend-only week" |
| 9.6 | A cell still Open says why: busy at an overlapping time, everything set up for the group full then, nothing this week set up for it, or no activity fits the gap.               | `shoreshEngine.js`       | rules: "leaves Open only a cell nothing can go in", "never puts one group too many…"                                                            |
| 9.7 | The why is shown as dots on the grid. **To change in a later PR** (one Why list beside the grid).                                                                               | screens                  | screen tests                                                                                                                                    |
| 9.8 | The same inputs give the same week, byte for byte; building in steps gives the same week as at once.                                                                            | all                      | determinism; steps: "builds the same week as generateWeek…"                                                                                     |

## Gaps found

Rules with no test after PR 1: 1.5, 1.6, 1.8, 1.10, 3.12 for a Sunday or weekend-only week, 6.2,
7.4, 8.6 on its own, 8.9. PR 2's odd-camp library covers 1.5, 1.6, 1.10 and 3.12 (as known
failures until PR 3, which fixed them). Still gaps: 1.8, 6.2, 7.4, 8.6 on its own, 8.9 (PR 4 brings the import floor).

## The odd-camp library and the settled rules

`__tests__/oddCamps.test.js` builds every camp in `__tests__/data/oddCamps.js` (25 synthetic
camps, each with a line saying what makes it odd) and holds it to the settled rules, checked by
`__tests__/data/settledRules.js` without the engine's code:

- **Hard limits:** the engine never bends who an activity is for, once a day, groups at once,
  groups that fit, or same division only (no flag naming one on a cell it placed).
- **Same input, same output:** built twice, and from its records in reverse order, byte for byte.
- **Never hides a problem:** `data/check.js`'s checks (every bend flagged, no silent blank, kept
  cells kept), plus every minimum short and every early-week goal short listed with the right
  count (early days counted from the week's real first day), a week with no day by the goal
  said once, and a blank setup field named.
- **A gap is a bug:** no Open cell where an allowed activity is physically free (the weekly max is
  a preference, so it never excuses a gap); for small camps an exhaustive search
  also proves no week fills more cells within the hard limits.

Camps: one group; sixty groups; one activity only; weekend-only week; Sunday-start week; goal by
Sunday; half days; overlapping time blocks; every activity closed one day (a camp-wide event, since
closures are per week); a closed place; scarce places; groups away part of the week; heavy
eligibility; eligible activities all full; multi-block activities; impossible goals; priority mix;
locks and hand edits; other programs share places; special and replaced days; blank groups at
once; blank groups that fit; ordinary small (4 groups), medium (12) and large (30) camps.

### Known failures (today's engine breaks a settled rule)

Each runs as `test.failing` and its exact lines are pinned, so a fix that lands makes the suite
fail until the entry is removed, and a new break fails at once. PR 2 pinned eight; PR 3 fixed all
eight, including the one pinned for PR 4. Making once a day a limit (Greg, 2026-10-25) opened two
gaps, pinned for PR 4: never-blank leaves those cells Open with their reason, and only a search
that rearranges earlier placements can fill them.

| Camp                    | Rule broken                                                                    | Fixed in |
| ----------------------- | ------------------------------------------------------------------------------ | -------- |
| half days               | Gap: 2 cells Open ("everything full"); the exhaustive check runs out of budget | PR 4     |
| overlapping time blocks | Gap: 8 cells filled within the limits where 10 can be                          | PR 4     |

Fixed by PR 3:

| Camp                         | Rule that was broken                                                                                                       | Fixed in |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| weekend-only week            | Never hides: no word that the week has no day by Tuesday (9.5)                                                             | PR 3     |
| Sunday-start week            | Never hides: lists climbing 1 short by Monday though Sunday + Monday meet it (3.12)                                        | PR 3     |
| goal by Sunday               | Never hides: a goal "by Sunday" is dropped silently (1.10)                                                                 | PR 3     |
| scarce places                | Hard limits: never-blank overfills a one-bunk place (7.1)                                                                  | PR 3     |
| scarce places                | Gap: 4 cells filled within the limits where 6 can be (pinned for PR 4; went away once never-blank stopped taking the room) | PR 3     |
| eligible activities all full | Hard limits: never-blank places an activity the bunk isn't set up for (7.2)                                                | PR 3     |
| blank groups at once         | Hard limits, never hides, gap: blank becomes 1 silently, then is overfilled (1.5)                                          | PR 3     |
| blank groups that fit        | Hard limits, never hides, gap: blank becomes 1 silently, then is overfilled (1.6)                                          | PR 3     |

Every other camp in the library keeps every settled rule.

## Desktop differential

`__tests__/desktopDifferential.test.js` builds 400 seeded random synthetic camps in this engine
and in a vendored copy of the desktop's (`jest/desktop-engine/`), and compares outcomes, never
cells: sessions per group and activity, minimums met, early-week goals met, cells left empty,
cells filled by bending a rule. It reports differences as data (run it with
`DESKTOP_DIFF_REPORT=<file>` for every camp's row) and fails only if a camp can't be built or the
counts don't add up. Drawn only from what both engines share: no overlapping blocks, other
programs, same-division activities, locks, electives or special days.

Known, expected differences:

- **Never-blank.** The desktop leaves a cell empty (UNFILLABLE) where nothing fits cleanly; this
  engine fills it by going over a weekly max (step 7), and since PR 3 leaves it Open, with its
  reason, when only a limit (once a day included) would give way.
- **Early-week goal with no target day.** The desktop's goal is "before day X"; when day X isn't in
  the week, it drops the goal. This engine still counts it if any day by then is in the week.

Results on the first run (2026-10-25, 400 camps): this engine left 0 cells empty where the
desktop left 5,355 of 17,686. By weekly minimums met: 140 camps had the same outcome with no
bends; 160 met the same minimums, with this engine filling the desktop's empty cells by bending;
76 met more minimums here; 24 met fewer here (by 1 to 5 group-activity pairs), worth a look in
PR 4 (search), since a never-blank bend can take a cell a minimum needed. Early-week goals: 265
camps the same; 72 differ in a week missing the desktop's target day (likely the reading above;
the cause is assumed, not shown); 48 short more on the desktop; 15 short more here.

The check that counts add up is one-sided (filled plus empty never exceed the cells to fill), so
it would not catch an undercount.

After PR 3 (2026-10-25, same 400 camps; never-blank bends only the weekly max): **this engine
leaves 4,063 of 17,686 cells empty (23%), in 205 camps; the desktop leaves 5,355 (30%), in 233.**
Before PR 3 it left none, by bending. Every Open cell says why ("Everything for Bunk 3 is full
then" and the like); PR 4's search is what is meant to fill them. Cells filled by bending fell
from 6,981 to 1,296, all over a weekly max; before, 5,257 were twice in a day, 1,696 over groups
at once, 1,226 an activity a group isn't set up for and 370 over-filled a place. By weekly
minimums met: 210 camps the same with no bends (was 140); 114 the same, filling by going over a
max (was 160); 42 meet more here (was 76); 26 meet fewer here (was 24); 8 camps leave more cells
empty than the desktop (13 cells in all): search gaps for PR 4. Minimums short in all: 2,611 here
(was 2,517) against 2,634 on the desktop. Early-week goals: 267 camps the same, 73 differ in a
week missing the desktop's target day, 46 short more on the desktop, 14 short more here.
