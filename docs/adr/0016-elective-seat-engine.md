# 0016: Elective seat assignment, the engine

Status: proposed (2026-10-21), electives slice E2 (plan: wiki `projects/shoresh-sf-electives-plan`,
§5 and §8). Design source: the desktop, Greg's own Apache-2.0 repo `gfeitel1-maker/Scheduling-Project-`
at 69dbd34: `src/engine/buildElectiveAssignments.js`, `src/engine/rankKind.js` and their tests,
and desktop ADRs `2026-09-17-individual-elective-scheduling` (D3, D11, D14),
`2026-09-23-elective-run-lifecycle-and-remaining-slices` (b, c; owner rulings Q3, Q6),
`2026-09-26-per-cell-elective-preferences` and `2026-09-29-linked-elective-bundles` (D4, D8).
Follows ADR 0010 §1 (an engine that runs in the browser as an LWC service module). No screens,
no objects: nothing uses the module yet, so nothing a director sees changes.

## Choices

1. **Where it runs.** `c/shoreshElectiveEngine`, beside `c/shoreshEngine`: one exported function,
   `assignSeats`, plain records in, seats and findings out. No Apex, no saving, no clock, no
   `Math.random`. Reading the run's records and saving the seats (with the server checking what
   it saves, plan §5) belong to slice E7.
2. **The desktop's solver, unchanged in what it decides.** Seats taken first: locked seats, then
   linked choices as one matching of campers to linked choices (a linked choice's seats are the
   fewest left after locks at any of its times). Then each elective time on its own, as a
   min-cost max-flow over that time's offerings: optimal within the time, never greedy. A seat a
   camper didn't ask for costs more than any rank and less than no seat, so everyone gets a seat
   if one exists (desktop owner ruling R3). Then minimum to run: the offering furthest below its
   minimum is dropped, its campers moved, one offering a round, until everything left meets its
   minimum; an offering holding a taken seat is kept and reported. Per-time choices count only at
   their time; a whole-week choice counts at every time without its own; the best rank wins when
   rows repeat. Repeats are allowed and each time is scored on its own (owner ruling Q3). Two
   linked choices sharing a time are refused and placed one time at a time, a known limit (D8);
   linked choices first, then everything else, is accepted (Q6).
3. **Input shape, in Salesforce's words.** The desktop's fields renamed: occurrence → elective
   time (`times`), preference → camper's choice (`choices`), the desktop's linked
   `elective_choices` → `linkedChoices` and `linkedChoiceTimes`, locked assignment → `locks`,
   capacity → `seats`. A choice names an offering by `key` (the caller decides what the key is:
   slice E7 will pass the activity's Id) or a linked choice by `linkedChoiceId`. A choice by key
   reaches every linked choice with that key, because a linked choice offered to two divisions
   arrives as one per division (D4); building those per-division linked choices from
   `LinkedChoice__c` is slice E8's. Seats come back as `{ camperId, timeId, activityId, key,
   rank, flags, notRequestedReason?, locked?, linkedChoiceId? }`.
4. **Seat limits, as the plan states them.** `noLimit` true is no limit; otherwise `seats`, and
   **0 means closed**. A limited offering with blank seats stops the whole assignment with the
   desktop's words, "Fill blank capacities first.", and the offerings' names, rather than
   closing it quietly. On the desktop that refusal lives in the screen (`buildOfferings` /
   `AssignmentPanel`); here it is in the engine, so no caller can skip it.
5. **Determinism.** Every list is put in a total order over ids before solving: campers by id;
   elective times by date, then block order, then division order, then id (the desktop sorts by
   its derived ids; Salesforce Ids carry no meaning, so the plan's chronological order is used,
   and findings come out in the order a director reads the week); offerings by key, then
   activity id; locks, linked choices and their times by id. Text is compared by code unit, never
   by locale. Nothing is drawn at random, so there is no seed: the desktop's solver has no
   chance in it, unlike the schedule generator (ADR 0010 §8).
6. **One change for speed, none in result.** The desktop's assignment searches from every
   unseated camper on every step, which is fine for "tens of campers" but took seconds per time
   at camp sizes. The port finds the same camper with one backwards search from the offerings
   with room, then runs the desktop's own search for that camper alone, so ties break exactly as
   before. A test runs both on 3,000 random tables and requires identical answers; a one-off
   check during this work ran the whole port against the desktop engine on 3,150 random camps
   with identical results. If the backwards search ever fails to settle, the step falls back to
   the desktop's way.
7. **Findings**, the desktop's kinds and words, with the offering's or linked choice's name (the
   desktop puts an internal key in and swaps it for the name on screen): `NO_OFFERINGS`,
   `NO_CAMPERS` (with the camp's word for division, through `c/shoreshTerms`), `NO_CAPACITY`,
   `UNPLACED_AFTER_DECLINE`, `BELOW_MINIMUM`, `KEPT_BELOW_MINIMUM`, `UNSUPPORTED_LINKED_CHOICE`.
   Each also carries ids and counts, so slice E7 can show it where it happened. The flags
   (`NOT_REQUESTED`, `NOT_TOP_CHOICE` only on evidence the sheet had an order) and the reasons a
   camper got something they didn't ask for are the desktop's. How the screen words them is
   E7's.
8. **Code layout** (`force-app/main/default/lwc/shoreshElectiveEngine`): `shoreshElectiveEngine.js`
   (the entry and the solve), `minCostAssign.js` (the matching), `rankKind.js` (whether a rank
   came from an order). NOTICE names the adapted desktop files.

## Not carried over

The desktop's adapters from its own tables to the engine's input (`deriveOccurrences`,
`buildOfferings`, `deriveChoices`, `buildAttendance`, `resolvePreferenceCoordinates`) read
desktop data shapes Salesforce doesn't have; each has a Salesforce counterpart in a later slice
(E1 objects, E6 choices, E7 seats, E8 linked choices), built against those objects. The desktop
test that runs a real choices sheet through its reader (`test/perCellSolvePlacement.test.js`)
waits for that reader (E3a/E6). Solver generation markers and the other sync machinery are not
needed (plan §2, "Desktop machinery not carried over").

## Tests

- The desktop's engine tests, ported with their bodies unchanged (`ported.test.js`,
  `portedMinimumToRun.test.js`, `portedNotRequestedReason.test.js`, `rankKind.test.js`, 78 tests),
  reaching the engine through `__tests__/data/desktopShape.js`, which only renames fields. They
  include the case greedy-by-rank gets wrong, locks, linked choices and the per-division
  rank collision, minimum to run and its cascade, and the 100-camper repeat distribution, which
  prints its table to the test output (the condition on owner ruling Q3).
- `minCostAssign.test.js`: the same seats as the desktop's own function (kept as test data) on
  3,000 random tables, and optimal against brute force on 1,500 small ones.
- `properties.test.js`: 600 random camps (two divisions, per-time and whole-week choices,
  unordered choices, no limit, closed, minimums, campers away, locks, linked choices): one seat
  per camper per time; never over an offering's seats except where locks alone fill it; locks
  back exactly; seats only where a camper attends and in something offered and running; every
  attending camper seated or named as unplaced, and unplaced only when everything running is
  full; a linked choice all of its times or none; inputs left as they were.
- `determinism.test.js`: 20 shuffled input orders give identical output, for a 100-camper camp
  and three random ones; the 100-camper camp's result is pinned (counts by rank, findings and a
  fingerprint of every seat).
- `assignSeats.test.js`: the seat limits, time order, the camp's words, names in findings, and
  which linked choice a seat came from.
- `performance.test.js`, the size check: 500 campers, 12 offerings, 10 times. About 3 s on a
  laptop with all 500 at every time (the worst case: one division of 500), under 1 s in four
  divisions of 125. Bounds are loose for slower CI runners. E7 decides whether the screen needs
  a progress state for the worst case.
