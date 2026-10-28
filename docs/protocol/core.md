# CORE protocol

What every part of Shoresh means and does, whichever screen or sub-protocol is running. The
layer rule, numbering and tests are in [README.md](README.md). Where Greg's dated word differs
from older text (ADRs, plans, the desktop), Greg's latest word is what is written here (wiki
`projects/shoresh-protocol.md`, sections E and F).

A statement with no test citing its ID yet is a target, not a claim that the software does it
today. `node scripts/protocol-index.js` lists which are which.

## Layer 1: Terms

Each term has one meaning. The words in "Avoid" do not appear on screens.

- **CORE-1.0** Every term MAY carry the camp's own word, which MUST then be used on every screen
  and message. Anyone with Shoresh access MAY change camp words.

| ID        | Term                   | Definition                                                                                                                                                                                                      | Avoid                          |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| CORE-1.1  | Camp                   | The organisation using Shoresh. Shoresh plans any day of the week, weekends included (Greg 2026-10-27). Day camps only (decision 0001).                                                                         | organisation, tenant           |
| CORE-1.2  | Season                 | One run of camp with a start and end date; holds weeks. Past seasons are history and can be copied.                                                                                                             | summer, year (as a term)       |
| CORE-1.3  | Program                | A part of camp with its own set of time blocks and its own days. Every camp has at least one.                                                                                                                   | cohort, track                  |
| CORE-1.4  | Week                   | A dated stretch of a program's camp days within a season; the unit built and published. Its first day and its days come from the camp's grid, or from the days programs run (Greg 2026-10-27).                  | rotation                       |
| CORE-1.5  | Day                    | One date inside a week on which the program runs.                                                                                                                                                               | operating day                  |
| CORE-1.6  | Block                  | A named stretch of clock time (start, end) in a program's day; the same set every regular day. Morning or afternoon by its start time.                                                                          | period, slot                   |
| CORE-1.7  | Group                  | Campers who move together all day; the unit a schedule is built for. In exactly one division. At camp all day, morning only, or afternoon only.                                                                 | bunk, cabin                    |
| CORE-1.8  | Division               | A collection of groups inside one program.                                                                                                                                                                      | unit, age division, tier       |
| CORE-1.9  | Location               | A place an activity happens, with a "groups fit" number.                                                                                                                                                        | place, venue, facility         |
| CORE-1.10 | Groups fit             | How many groups a location holds at one time, counting every program by clock time. Blank is 1.                                                                                                                 | capacity (alone)               |
| CORE-1.11 | Groups at once         | How many groups may do one activity at one time. Blank is 1. The smaller of this and groups fit governs.                                                                                                        | capacity (alone)               |
| CORE-1.12 | Activity               | A catalogue item the scheduler places: length, minimum, maximum, priority, indoor or outdoor, groups at once, who can do it. Anything that is not a fixed or recurring activity.                                | session, event                 |
| CORE-1.13 | Fixed activity         | Every group in the program, the same block, every day the program runs. Nothing else is ever in that block (Greg 2026-10-15, 2026-10-16).                                                                       | fixed event, anchor            |
| CORE-1.14 | Recurring activity     | Held at a set, repeating time that leaves its block free on other days or for other groups: many groups but not all (lunch by division), or every group but not every day (Greg 2026-10-27).                    | recurring event                |
| CORE-1.15 | Set time               | The family name for fixed and recurring activities: things whose time is decided before building.                                                                                                               | events only                    |
| CORE-1.16 | Special event          | A one-off program taking over part of a day with its own plan, for the whole camp or chosen divisions or groups. The only thing called an "event".                                                              |                                |
| CORE-1.17 | Special day            | Its own day, with its own schedule, built in that schedule's grid screen as on the desktop; it takes the place of the regular day for its date (Greg 2026-10-27). A special day with no blocks is a closed day. |                                |
| CORE-1.18 | Placement              | One group doing one activity in one block (or run of blocks) on one day.                                                                                                                                        | session, slot                  |
| CORE-1.19 | Minimum                | Fewest placements a group must get of an activity in a week. In a short (holiday) week the camp chooses to keep it or shrink it; the default is keep (Greg 2026-10-27).                                         |                                |
| CORE-1.20 | Maximum                | Most placements a group should get in a week. A preference: the only limit that may be exceeded, and it is shown when it is (Greg 2026-10-17, 2026-10-25).                                                      | cap, limit (for max)           |
| CORE-1.21 | Priority               | High or Low. Blank counts as Low. Never guessed at import.                                                                                                                                                      | Medium, importance             |
| CORE-1.22 | Lock                   | A person's mark that a placement (or an open cell) stays when the week is built again.                                                                                                                          | pin, hold, keep                |
| CORE-1.23 | Hand edit              | A placement a person made. Always allowed; becomes a lock on a generated week (Greg 2026-10-26).                                                                                                                | override, manual change        |
| CORE-1.24 | Closure                | An activity, location, fixed or recurring activity that does not run in a given week. Screens say it positively: "Runs in", "Open in".                                                                          | outage                         |
| CORE-1.25 | Away                   | A group not at camp in a given week (or part of a day). Its cells do not exist for building.                                                                                                                    | absent, off-site               |
| CORE-1.26 | Imported week          | Last year's week from the camp's file, kept unedited and labelled "Imported from <file>". The least a build must fill (Greg 2026-10-25).                                                                        | baseline                       |
| CORE-1.27 | Version                | A saved copy of a program's week, taken automatically before anything replaces it.                                                                                                                              | snapshot, backup               |
| CORE-1.28 | Published              | The one version of a program's week marked final; each program publishes on its own.                                                                                                                            | live, released                 |
| CORE-1.29 | Conflict               | Two things claiming the same group, location or limit at the same time. Always shown.                                                                                                                           | overlap, clash, double booking |
| CORE-1.30 | Open                   | A cell no activity fills, with its reason.                                                                                                                                                                      | gap, hole, unfillable          |
| CORE-1.31 | Still needed           | Placements a group is short of an activity's minimum this week.                                                                                                                                                 | underserved, shortfall         |
| CORE-1.32 | Spread across the week | How an activity's placements fall across a week's days for a group. Back-to-back days are fine; spread never costs a minimum or a High priority placement (Greg 2026-10-27).                                    | distribution                   |
| CORE-1.33 | Measures               | Minimums met, priorities met, spread across the week (Greg 2026-10-27).                                                                                                                                         | the words listed in CORE-6.4   |

Each definition is the test: a screen, import or build that uses the word for anything else
breaks the term.

Contradicted by the code today (2026-10-27; tests in `shoreshEngine/__tests__/core.test.js`,
behaviour unchanged):

- CORE-1.30, contradicted: an Open cell's reason can read "No activity fits this gap"
  (`shoreshEngine/words.js`, the camp term "Gap"), an Avoid word.
- CORE-1.33, contradicted: the week's measures (`shoreshEngine/measure.js`) are placed of
  total, still needed, under and over; there is no "priorities met" count.

## Layer 2: Reading

- **CORE-2.1** Shoresh MUST read the same input in the same order every time: by sort order,
  then id, compared by character code; days by date.
- **CORE-2.2** The same file or setup MUST give the same facts.
- **CORE-2.3** Shoresh MUST NOT guess a value it cannot read; it MUST show the question instead.

## Layer 3: Classification

- **CORE-3.1** Every name in a program MUST be exactly one of: fixed activity, recurring
  activity, activity. They MUST NOT be linked to each other. The same word at a set time for
  some groups and placed freely for others is two items with two names.
- **CORE-3.2** Classification MUST try fixed first, then recurring, then activity.
- **CORE-3.3** A name in every group's same block on every day MUST be fixed; it MUST NOT be
  asked.
- **CORE-3.4** A name at a set time for some groups, or for every group on some days, MUST be
  recurring; on a clear grid it MUST NOT be asked.
- **CORE-3.5** "Who can do it" with nothing ticked MUST mean every group; a division ticked MUST
  cover its groups.
- **CORE-3.6** A blank groups at once and a blank groups fit MUST be 1.

## Layer 4: Limits

These never bend for Shoresh.

- **CORE-4.1** A group MUST NOT be given an activity it is not set up for.
- **CORE-4.2** A group MUST NOT do one activity twice in a day (a multi-block one counts once).
- **CORE-4.3** A location MUST NOT hold more groups than fit, and an activity MUST NOT have more
  groups than its groups at once; other programs count by clock time.
- **CORE-4.4** A group MUST be in only one of two blocks that overlap in time.
- **CORE-4.5** An activity MUST NOT be shortened; a multi-block activity MUST get its full length
  in a row.
- **CORE-4.6** Shoresh MUST NOT place anything in a cell that is locked, set time, special,
  closed, away or not at camp.
- **CORE-4.7** The maximum MAY be exceeded, and only the maximum; every time it is, it MUST be
  shown.
- **CORE-4.8** Limits CORE-4.1 to 4.6 bind Shoresh. A person's hand edit MAY break them and MUST
  then be shown (Greg 2026-10-26).

## Layer 5: Placement order

- **CORE-5.1** Locks, hand edits, set-time activities, specials and electives MUST be laid down
  first and never moved.
- **CORE-5.2** Minimums MUST come before anything else is added.
- **CORE-5.3** High priority MUST be placed before Low.
- **CORE-5.4** Spread MUST give way to a minimum or a High priority placement.
- **CORE-5.5** Every open cell MUST be filled when the limits allow; a minimum MAY leave a cell
  open only as a last resort, saying the trade (Greg 2026-10-26).
- **CORE-5.6** A full build MUST NOT be emptier than the imported week where limits allow.
- **CORE-5.7** Ties MUST be broken by a fixed key from program, week and option; never by chance
  or the clock.
- **CORE-5.8** The same inputs MUST give the same week, byte for byte.
- **CORE-5.9** In a short week the minimum MUST be kept unless the camp chose to shrink it; what
  is short MUST be shown as still needed (Greg 2026-10-27).

## Layer 6: Explanation and measures

- **CORE-6.1** Every conflict MUST be shown; Shoresh MUST NOT block it or resolve it silently.
- **CORE-6.2** Every open cell MUST carry one reason in camp words.
- **CORE-6.3** Nothing from checks MUST appear on the grid, not even on hover; all of it MUST
  live in the one Why list beside the grid (Greg 2026-10-25).
- **CORE-6.4** Measures MUST be minimums met, priorities met (High, then Low, as counts) and
  spread across the week (a count, reported only). Shoresh MUST NOT call a week "fair" or an
  activity "popular" (Greg 2026-10-27). Contradicted: `measure.js` has no "priorities met"
  count (see CORE-1.33).
- **CORE-6.5** Counters MUST use "N of M placed", "still needed", "under", "over"; never
  "Filled" or "Overlapping".
- **CORE-6.6** Screens MUST NOT add help text or banners, or show ids, field names or machinery;
  one plain sentence only when Shoresh can't proceed.
- **CORE-6.7** Problems MUST be computed from what is there, never stored.
