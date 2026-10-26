import { readGrid } from "./weekFixed";
import { readEarlyGoals, drawTieKeys } from "./weekOptions";
import { runRound } from "./weekPlace";
import { fillRepair, minRepair, repair, startRepairs } from "./weekRepair";
import { finishOpen, neverBlank } from "./weekNeverBlank";
import { explainOpen, searchWeek } from "./weekSearch";
import { createWeekState } from "./weekState";
import { NOW, nowOf } from "./progress";

/**
 * Generated Schedule's week builder: the desktop generator (src/engine/buildSchedule.js,
 * scheduleCohort) ported to Salesforce's shapes (ADR 0010). One program's week; the cells it may
 * fill are the at-camp cells that are Open after locks and fixed and recurring activities are in.
 *
 * Fill order, as the desktop's: kept cells first (locked cells, fixed and recurring activities,
 * special events and elective sets, and in "fill the open cells" every filled cell); multi-block activities first in each priority;
 * the tight-week matching of capped activities; greedy fewest-choices, high priority then low;
 * then three repair passes (a reshuffle per empty cell, raising weekly minimums, moving a blocking
 * session), each step of which is undone unless it ends whole. Then, new here, nothing is left
 * blank: a cell no activity fits cleanly gets one that only goes over a weekly max, flagged; and
 * an exact search rearranges each day to fill what is still Open, or proves it can't be filled.
 *
 * Each part lives in its own file, named by the protocol step it carries out
 * (docs/engine/protocol.md lists every rule and where it lives):
 *   1 read and check setup ........ setup.js, checkInputs.js
 *   2 lay down what's fixed ....... weekFixed.js
 *   3 each cell's options ......... weekOptions.js (rules: weekRules.js)
 *   4-6 place by priority ......... weekPlace.js
 *   8 search before giving up ..... part 1, weekRepair.js: the desktop's three repairs (8.1-8.8),
 *                                   before step 7; part 2, weekSearch.js: the exact search
 *                                   (8.10-8.18), after it; then weekAcross.js, moves
 *                                   between days for weekly minimums (8.24-8.28)
 *   7 never blank ................. weekNeverBlank.js
 *   8 the floor ................... weekFloor.js, from shoreshEngine.js: never emptier than the
 *                                   imported week (8.19-8.23)
 *   9 write the why ............... checks.js, words.js
 * The ledgers every step shares: weekState.js.
 */

export {
  RULE,
  RELAX_ORDER,
  BUSY,
  NO_FIT,
  LENGTH,
  OVERLAP,
  FULL,
  NONE_FOR,
  SEARCHED,
  MIN_COST,
  BUDGET,
  TRADE
} from "./weekRules";
export { lockKey } from "./weekFixed";

/**
 * model: { days, groups, groupIds, acts, eligibility, fit, setTimeLocation, electivePlaces, locks,
 *          mode, seed, otherPlace, otherActivity } (shoreshEngine.js builds it).
 */
export function scheduleWeek(model) {
  const steps = scheduleWeekSteps(model);
  let step = steps.next();
  while (!step.done) {
    step = steps.next();
  }
  return step.value;
}

// How much of a build each pass is, roughly (a 40-bunk week that can't fit spends nearly all of
// it in the two repairs): for the progress the screen shows, never for what is built.
const SHARE = Object.freeze({
  rounds: 0.03,
  repair: 0.02,
  minRepair: 0.3,
  fillRepair: 0.3,
  neverBlank: 0.02,
  search: 0.33
});

/**
 * The same build in steps (ADR 0010 §22): a generator that yields how far it has got (0 to 1)
 * between pieces of work, each piece a cell or a minimum-repair pass, and returns what
 * scheduleWeek returns. The screen runs a few steps at a time so the tab never freezes. The
 * steps only say where the build is; they never change it, so a week built in steps is the
 * same as one built at once. notes, if given, is told once the minimum repair is done whether
 * it left a cell for never-blank (notes.settled, notes.leftForNeverBlank): from then on the
 * caller knows whether the week will be built a second time. notes.now says what the build is
 * doing as it goes (progress.js), for a progress screen.
 */
export function* scheduleWeekSteps(model, notes = {}) {
  const st = createWeekState(model);
  // What it is doing now, for a progress screen (progress.js): told to notes.now.
  st.watch = notes;

  // Step 2: what's fixed goes in; the cells left are the ones to fill.
  notes.now = nowOf(NOW.FIXED, 2);
  yield 0;
  readGrid(st);
  // Step 3: each cell's stable tie-break keys and each activity's early-week days.
  drawTieKeys(st, st.freeSlots);
  startRepairs(st);
  readEarlyGoals(st);

  yield 0;
  // Steps 4-6: high priority, then low.
  yield* runRound(st, st.openSlots, "high", 0);
  yield* runRound(
    st,
    st.openSlots.filter((s) => !st.assigned.has(st.keyOf(s))),
    "low",
    SHARE.rounds / 2
  );
  let at = SHARE.rounds;
  yield at;
  // Step 8, part 1 (protocol 8.1-8.8): the desktop's three repairs, before never-blank.
  yield* repair(st, at);
  at += SHARE.repair;
  yield* minRepair(st, at, SHARE.minRepair);
  at += SHARE.minRepair;
  notes.leftForNeverBlank = st.leftForNeverBlank;
  notes.settled = true;
  yield* fillRepair(st, at, SHARE.fillRepair);
  at += SHARE.fillRepair;
  // Step 7: never blank.
  yield* neverBlank(st, st.openSlots, at);
  yield* finishOpen(st, at);
  at += SHARE.neverBlank;
  // Step 8, part 2 (protocol 8.10-8.18): the exact search; then why each cell still Open is Open.
  yield* searchWeek(st, at, SHARE.search);
  explainOpen(st);

  return {
    assigned: st.assigned,
    spanTails: st.spanTails,
    keptCells: st.keptCells,
    openCells: st.openCells,
    leftForNeverBlank: st.leftForNeverBlank,
    ruleChecks: st.ruleChecks,
    usageCount: st.usageCount,
    away: st.away,
    lockedOpen: st.lockedOpen,
    placeUsage: st.placeUsage,
    activityUsers: st.activityUsers,
    looksUsed: st.looksUsed,
    keyOf: st.keyOf,
    splitKey: st.splitKey,
    cellKey: st.cellKey,
    actById: st.actById,
    openSlotByKey: st.openSlotByKey,
    searchMoves: st.searchMoves
  };
}
