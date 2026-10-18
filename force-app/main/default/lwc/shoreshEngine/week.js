import { streamFor } from "./random";
import { atCamp } from "./setup";

/**
 * Generated Schedule's week builder: the desktop generator (src/engine/buildSchedule.js,
 * scheduleCohort) ported to Salesforce's shapes (ADR 0010). One program's week; the cells it may
 * fill are the at-camp cells that are Open after locks and fixed and recurring activities are in.
 *
 * Fill order, as the desktop's: kept cells first (locked cells, fixed and recurring activities,
 * and in "fill the open cells" every filled cell); multi-block activities first in each priority;
 * the tight-week matching of capped activities; greedy fewest-choices, high priority then low;
 * then three repair passes (a reshuffle per empty cell, raising weekly minimums, moving a blocking
 * session), each step of which is undone unless it ends whole. Then, new here, nothing is left
 * blank: a cell no activity fits cleanly gets the least-bad one, flagged with the rule it bends.
 */

/** The rules a placement can bend, by name. */
export const RULE = Object.freeze({
  WEEKLY_MAX: "weeklyMax",
  ONCE_A_DAY: "onceADay",
  ELIGIBILITY: "eligibility",
  GROUPS_AT_ONCE: "groupsAtOnce",
  SAME_DIVISION: "sameDivision",
  PLACE_CAPACITY: "placeCapacity"
});

/**
 * The order rules give way when nothing fits (Greg and the coordinator, 2026-10-17): weekly max
 * first, then once a day, then who it's set up for, then groups at once, then the place last.
 * Same division only gives way just before the place's capacity (Greg, 2026-10-17). Locks, fixed and recurring activities and not-at-camp cells never give way.
 */
export const RELAX_ORDER = Object.freeze([
  RULE.WEEKLY_MAX,
  RULE.ONCE_A_DAY,
  RULE.ELIGIBILITY,
  RULE.GROUPS_AT_ONCE,
  RULE.SAME_DIVISION,
  RULE.PLACE_CAPACITY
]);
// Most serious first, for comparing two bends.
const SEVERITY = [...RELAX_ORDER].reverse();

/** Not rules that bend, but why a cell stays Open: the group holds something at an overlapping
 * time, or no activity's length fits the gap. */
export const BUSY = "busy";
export const NO_FIT = "noFit";

// Why nothing can go in a cell at all: no room for the activity's full length, or the group is
// already somewhere at an overlapping time. These never give way.
export const LENGTH = "length";
export const OVERLAP = "overlap";

// Repair limits, as the desktop's (they bound the work on a week that cannot be filled).
const REPAIR_DEPTH = 3;
const REPAIR_LIFTS_PER_CELL = 300;
const MIN_REPAIR_DEPTH = 3;
const SPAN_LIFT_WORK = 5000;
const MIN_REPAIR_BUDGET = 1500;
const FILL_REPAIR_DEPTH = 4;
const PRIORITY_RANK = { high: 0, low: 1 };

/** Block id -> ids of the day's blocks whose clock times overlap it (touching ones don't). */
function overlappingPeers(blocks) {
  const peers = new Map();
  const timed = blocks.filter(
    (b) => b.start != null && b.end != null && b.end > b.start
  );
  for (const x of timed) {
    for (const y of timed) {
      if (x.id !== y.id && x.start < y.end && y.start < x.end) {
        if (!peers.has(x.id)) {
          peers.set(x.id, []);
        }
        peers.get(x.id).push(y.id);
      }
    }
  }
  return peers;
}

export function lockKey(date, groupId, blockId) {
  return `${date}|${groupId}|${blockId}`;
}

/**
 * model: { days, groups, groupIds, acts, eligibility, fit, setTimeLocation, locks, mode, seed,
 *          otherPlace, otherActivity } (shoreshEngine.js builds it).
 */
export function scheduleWeek(model) {
  const { days, groups, acts, eligibility, fit, setTimeLocation, locks } =
    model;
  const fillOpenOnly = model.mode === "fillOpen";
  // The minimum repair may leave a cell for never-blank (model.strictRepair turns it off), and
  // whether any chain it kept did so.
  const lenientRepair = !model.strictRepair;
  let leftForNeverBlank = false;
  // How many times a placement was checked against the rules: the build's work, the same on any
  // machine (the performance test bounds it; a screen can use it to show progress).
  let ruleChecks = 0;
  const actById = new Map(acts.map((a) => [a.id, a]));
  const cellKey = (g, d, b) => `${g}|${d}|${b}`;
  const keyOf = (s) => cellKey(s.groupId, s.dayIndex, s.blockId);
  const splitKey = (k) => {
    const [g, d, b] = k.split("|");
    return [g, Number(d), b];
  };
  const blocksOf = (d) => days[d].blocks;
  const blockIdx = (d, b) => days[d].blockIndex.get(b);
  const peersByDay = days.map((day) => overlappingPeers(day.blocks));
  const getMin = (actId) => actById.get(actId).min;

  // ── Ledgers ────────────────────────────────────────────────────────────────
  const assigned = new Map(); // cell -> activity id (kept and generated)
  const spanTails = new Set(); // cells that carry on a multi-block placement
  const keptKeys = new Set(); // cells the generator may not change, whatever they hold
  const keptCells = new Map(); // kept cell -> { item, head } as the grid had it
  const usageCount = new Map(); // "group|activity" -> sessions this week
  const dailyUsage = new Map(); // "group|day|activity" -> sessions that day
  const placeUsage = new Map(); // "location|day|block" -> occupants
  const activityUsers = new Map(); // "activity|day|block" -> groups doing it
  const otherPlace = model.otherPlace || new Map();
  const otherActivity = model.otherActivity || new Map();

  const getCount = (g, actId) => usageCount.get(`${g}|${actId}`) || 0;
  const onDay = (g, d, actId) =>
    (dailyUsage.get(`${g}|${d}|${actId}`) || 0) > 0;
  function bump(map, key, by) {
    const n = (map.get(key) || 0) + by;
    if (n > 0) {
      map.set(key, n);
    } else {
      map.delete(key);
    }
  }
  const divisionOf = (g) => (groups.has(g) ? groups.get(g).division : null);

  function occupy(locId, g, d, b, act) {
    if (locId == null) {
      return;
    }
    const k = `${locId}|${d}|${b}`;
    const list = placeUsage.get(k) || [];
    list.push({
      groupId: g,
      division: divisionOf(g),
      actId: act ? act.id : null,
      sameDivision: Boolean(act && act.sameDivision)
    });
    placeUsage.set(k, list);
  }
  function joinActivity(act, g, d, b) {
    const k = `${act.id}|${d}|${b}`;
    const list = activityUsers.get(k) || [];
    list.push({ groupId: g, division: divisionOf(g) });
    activityUsers.set(k, list);
  }
  function release(map, k, matches) {
    const list = map.get(k);
    const i = list ? list.findIndex(matches) : -1;
    if (i >= 0) {
      list.splice(i, 1);
    }
  }

  let openSlotByKey = null; // the cells the generator fills, once the grid is read

  /** The blocks a placement of `act` at block `b` covers (its head and whatever of its tail fits). */
  function ownBlocks(act, g, d, b) {
    const own = [b];
    const idx = blockIdx(d, b);
    for (let i = 1; i < act.span; i++) {
      const next = blocksOf(d)[idx + i];
      if (next) {
        own.push(next.id);
      }
    }
    return own;
  }

  // Open cells nothing is in yet: the repairs may trade one for another, never add one.
  let emptyCells = 0;
  const isOpenSlot = (k) => openSlotByKey && openSlotByKey.has(k);

  function place(act, g, d, b) {
    assigned.set(cellKey(g, d, b), act.id);
    bump(usageCount, `${g}|${act.id}`, 1);
    bump(dailyUsage, `${g}|${d}|${act.id}`, 1);
    ownBlocks(act, g, d, b).forEach((blockId, i) => {
      const k = cellKey(g, d, blockId);
      if (isOpenSlot(k)) {
        emptyCells--;
      }
      if (i > 0) {
        assigned.set(k, act.id);
        spanTails.add(k);
      }
      occupy(act.locationId, g, d, blockId, act);
      joinActivity(act, g, d, blockId);
    });
  }

  // Exact inverse of place(), span tails included. Only the repair passes call it.
  function unplace(act, g, d, b) {
    bump(usageCount, `${g}|${act.id}`, -1);
    bump(dailyUsage, `${g}|${d}|${act.id}`, -1);
    for (const blockId of ownBlocks(act, g, d, b)) {
      const k = cellKey(g, d, blockId);
      if (isOpenSlot(k)) {
        emptyCells++;
      }
      assigned.delete(k);
      spanTails.delete(k);
      if (act.locationId != null) {
        release(
          placeUsage,
          `${act.locationId}|${d}|${blockId}`,
          (o) => o.groupId === g && o.actId === act.id
        );
      }
      release(
        activityUsers,
        `${act.id}|${d}|${blockId}`,
        (u) => u.groupId === g
      );
    }
  }

  // ── Pass 1: read the grid ──────────────────────────────────────────────────
  const openSlots = [];
  const busyThen = new Set(); // Open cells left Open: the group is busy at an overlapping time
  const lockedOpen = new Set();
  const away = new Set();

  function keepRun(day, groupId, run) {
    const act = run.item.kind === "A" ? actById.get(run.item.id) : null;
    for (let i = 0; i < run.length; i++) {
      const blockId = day.blocks[run.first + i].id;
      const k = cellKey(groupId, day.index, blockId);
      keptKeys.add(k);
      keptCells.set(k, { item: run.item, head: i === 0 });
      if (run.item.kind === "F" || run.item.kind === "R") {
        occupy(setTimeLocation.get(run.item.id), groupId, day.index, blockId);
      } else if (act) {
        assigned.set(k, act.id);
        if (i > 0) {
          spanTails.add(k);
        }
        occupy(act.locationId, groupId, day.index, blockId, act);
        joinActivity(act, groupId, day.index, blockId);
      }
    }
    if (act) {
      bump(usageCount, `${groupId}|${act.id}`, 1);
      bump(dailyUsage, `${groupId}|${day.index}|${act.id}`, 1);
    }
  }

  function readRow(day, groupId, row) {
    const group = groups.get(groupId) || null;
    const runs = [];
    let current = null;
    row.forEach((token, b) => {
      if (token === "^" && current) {
        current.length += 1;
        return;
      }
      const item = /^\d+$/.test(token) ? day.items[Number(token) - 1] : null;
      current = item ? { first: b, length: 1, item } : null;
      if (current) {
        runs.push(current);
      }
    });
    const covered = new Set();
    for (const run of runs) {
      let locked = !group;
      for (let i = 0; i < run.length && !locked; i++) {
        locked = locks.has(
          lockKey(day.date, groupId, day.blocks[run.first + i].id)
        );
      }
      // A full build clears every activity that isn't locked; everything else stays.
      if (run.item.kind === "A" && !locked && !fillOpenOnly) {
        continue;
      }
      keepRun(day, groupId, run);
      for (let i = 0; i < run.length; i++) {
        covered.add(run.first + i);
      }
    }
    const open = [];
    row.forEach((token, b) => {
      if (covered.has(b)) {
        return;
      }
      const block = day.blocks[b];
      const k = cellKey(groupId, day.index, block.id);
      if (!group || locks.has(lockKey(day.date, groupId, block.id))) {
        lockedOpen.add(k);
      } else if (!atCamp(group, block.partOfDay)) {
        away.add(k);
      } else {
        open.push(b);
      }
    });
    const chosen = fillable(day, open, covered);
    for (const b of open) {
      if (chosen.has(b)) {
        openSlots.push({
          groupId,
          dayIndex: day.index,
          blockId: day.blocks[b].id,
          eligibleActs: acts.filter((a) => eligibility.get(a.id).has(groupId))
        });
      } else {
        busyThen.add(cellKey(groupId, day.index, day.blocks[b].id));
      }
    }
  }

  /**
   * Of a group's Open cells on a day (block indexes, in order), the ones to fill. Where blocks
   * overlap in time a group can be in only one of them, so this keeps the most cells that can all
   * be filled: none overlapping a kept cell, then earliest end first (which leaves the fewest
   * Open). The same cells whatever order anything is filled in.
   */
  function fillable(day, open, covered) {
    const peers = peersByDay[day.index];
    const overlapsAny = (b, list) =>
      (peers.get(day.blocks[b].id) || []).some((peerId) =>
        list.has(day.blockIndex.get(peerId))
      );
    const free = open.filter((b) => !overlapsAny(b, covered));
    const timed = free
      .filter((b) => peers.has(day.blocks[b].id))
      .sort(
        (x, y) =>
          day.blocks[x].end - day.blocks[y].end ||
          day.blocks[x].start - day.blocks[y].start ||
          x - y
      );
    const chosen = new Set(free.filter((b) => !peers.has(day.blocks[b].id)));
    for (const b of timed) {
      if (!overlapsAny(b, chosen)) {
        chosen.add(b);
      }
    }
    return chosen;
  }

  for (const groupId of model.groupIds) {
    for (const day of days) {
      if (day.tokens.has(groupId)) {
        readRow(day, groupId, day.tokens.get(groupId));
      }
    }
  }

  openSlotByKey = new Map(openSlots.map((s) => [keyOf(s), s]));
  emptyCells = openSlots.length;
  const openSlotsByGroup = new Map();
  const openSlotsByPeriod = new Map();
  for (const s of openSlots) {
    if (!openSlotsByGroup.has(s.groupId)) {
      openSlotsByGroup.set(s.groupId, []);
    }
    openSlotsByGroup.get(s.groupId).push(s);
    const pk = `${s.dayIndex}|${s.blockId}`;
    if (!openSlotsByPeriod.has(pk)) {
      openSlotsByPeriod.set(pk, []);
    }
    openSlotsByPeriod.get(pk).push(s);
  }

  // Stable tie-break keys, drawn once per (cell, activity) from a stream seeded by the program,
  // week, option and cell: never a random sort comparator (ADR 0010).
  const tieKeys = new Map();
  for (const s of openSlots) {
    const next = streamFor(
      `${model.seed}|${days[s.dayIndex].date}|${s.groupId}|${s.blockId}`
    );
    for (const a of acts) {
      tieKeys.set(`${keyOf(s)}|${a.id}`, next());
    }
  }
  const tieOf = (s, act) => tieKeys.get(`${keyOf(s)}|${act.id}`);

  // ── The rules ──────────────────────────────────────────────────────────────

  /** Why the place can't take `act` for this group at this block: [] when it can. */
  function placeProblems(act, group, d, b) {
    const locId = act.locationId;
    if (locId == null || !fit.has(locId)) {
      return [];
    }
    const found = [];
    const occupants = placeUsage.get(`${locId}|${d}|${b}`) || [];
    const others = otherPlace.get(`${locId}|${d}|${b}`) || 0;
    if (occupants.length + others >= fit.get(locId)) {
      found.push(RULE.PLACE_CAPACITY);
    }
    // Same division only holds whoever arrived first, so the result can't depend on order.
    if (
      (act.sameDivision &&
        (others > 0 || occupants.some((o) => o.division !== group.division))) ||
      occupants.some((o) => o.sameDivision && o.division !== group.division)
    ) {
      found.push(RULE.SAME_DIVISION);
    }
    return found;
  }

  /** Why the activity itself can't take one more group at this block: [] when it can. */
  function activityProblems(act, group, d, b) {
    const found = [];
    const users = activityUsers.get(`${act.id}|${d}|${b}`) || [];
    const others = otherActivity.get(`${act.id}|${d}|${b}`) || 0;
    if (act.atOnce != null && users.length + others >= act.atOnce) {
      found.push(RULE.GROUPS_AT_ONCE);
    }
    if (
      act.sameDivision &&
      (others > 0 || users.some((u) => u.division !== group.division))
    ) {
      found.push(RULE.SAME_DIVISION);
    }
    return found;
  }

  /**
   * Whether `act` can start at this cell. With `all` false: null when it can, else the first
   * reason it can't (the desktop's blockedBy order). With `all` true: null when it can't go here
   * at all (LENGTH or OVERLAP), else every rule it would bend ([] when none).
   */
  function check(act, g, d, b, all) {
    ruleChecks++;
    const span = act.span;
    const found = [];
    const note = (code) => {
      if (!found.includes(code)) {
        found.push(code);
      }
    };
    const group = groups.get(g);
    if (act.max != null && getCount(g, act.id) >= act.max) {
      if (!all) {
        return RULE.WEEKLY_MAX;
      }
      note(RULE.WEEKLY_MAX);
    }
    if (onDay(g, d, act.id)) {
      if (!all) {
        return RULE.ONCE_A_DAY;
      }
      note(RULE.ONCE_A_DAY);
    }
    let problems = placeProblems(act, group, d, b);
    if (problems.length) {
      if (!all) {
        return problems[0];
      }
      problems.forEach(note);
    }
    const own = [b];
    if (span > 1) {
      const idx = blockIdx(d, b);
      for (let i = 1; i < span; i++) {
        const next = blocksOf(d)[idx + i];
        const nk = next ? cellKey(g, d, next.id) : null;
        // A multi-block activity needs its whole length in consecutive Open, at-camp cells.
        if (!next || !openSlotByKey.has(nk) || assigned.has(nk)) {
          return all ? null : LENGTH;
        }
        problems = placeProblems(act, group, d, next.id);
        if (problems.length) {
          if (!all) {
            return problems[0];
          }
          problems.forEach(note);
        }
        own.push(next.id);
      }
    }
    // One placement per group across time-overlapping blocks.
    for (const o of own) {
      for (const peer of peersByDay[d].get(o) || []) {
        const pk = cellKey(g, d, peer);
        if (!own.includes(peer) && (assigned.has(pk) || keptKeys.has(pk))) {
          return all ? null : OVERLAP;
        }
      }
    }
    for (const o of own) {
      problems = activityProblems(act, group, d, o);
      if (problems.length) {
        if (!all) {
          return problems[0];
        }
        problems.forEach(note);
      }
    }
    if (all && !eligibility.get(act.id).has(g)) {
      note(RULE.ELIGIBILITY);
    }
    return all ? found : null;
  }

  const blockedBy = (act, g, d, b) => check(act, g, d, b, false);
  const canPlace = (act, g, d, b) => check(act, g, d, b, false) === null;

  // Early in the week (EarlyWeekCount by EarlyWeekByDay): the last day index that counts.
  const earlyEnd = new Map();
  for (const act of acts) {
    if (act.early) {
      let end = -1;
      days.forEach((day, i) => {
        if (day.weekday != null && day.weekday <= act.early.byDay) {
          end = i;
        }
      });
      earlyEnd.set(act.id, end);
    }
  }
  /** -1 while a group still needs it early and this day counts, 1 once that day has passed. */
  function earlyScore(act, g, d) {
    if (!act.early || earlyEnd.get(act.id) < 0) {
      return 0;
    }
    // Only sessions on the days that count: a locked Friday session doesn't meet a Tuesday goal.
    let early = 0;
    for (let day = 0; day <= earlyEnd.get(act.id); day++) {
      early += dailyUsage.get(`${g}|${day}|${act.id}`) || 0;
    }
    if (early >= act.early.count) {
      return 0;
    }
    return d <= earlyEnd.get(act.id) ? -1 : 1;
  }

  // ── Pass 2: place ──────────────────────────────────────────────────────────

  // Multi-block activities go first in their round: once single-block activities have taken
  // cells there is rarely a run of free blocks left. Round-robin over groups, one session per
  // group per sweep, up to the weekly minimum; the head is the free fit that best keeps the early
  // goal, then whose day holds fewest of this activity so far, then the stable key.
  function placeSpansFirst(slotsToFill, priority) {
    const spanActs = acts
      .filter((a) => a.priority === priority && a.span > 1)
      .sort((a, b) => b.span - a.span);
    const actDayLoad = new Map();
    for (const act of spanActs) {
      const min = getMin(act.id);
      for (let session = 0; session < min; session++) {
        for (const groupId of model.groupIds) {
          if (getCount(groupId, act.id) >= min) {
            continue;
          }
          let best = null;
          let bestRank = null;
          for (const s of openSlotsByGroup.get(groupId) || []) {
            if (
              slotsToFill.has(keyOf(s)) &&
              !assigned.has(keyOf(s)) &&
              s.eligibleActs.includes(act) &&
              canPlace(act, s.groupId, s.dayIndex, s.blockId)
            ) {
              const rank = [
                earlyScore(act, s.groupId, s.dayIndex),
                actDayLoad.get(`${act.id}|${s.dayIndex}`) || 0,
                tieOf(s, act)
              ];
              if (!bestRank || lexLess(rank, bestRank)) {
                best = s;
                bestRank = rank;
              }
            }
          }
          if (best) {
            place(act, best.groupId, best.dayIndex, best.blockId);
            const lk = `${act.id}|${best.dayIndex}`;
            actDayLoad.set(lk, (actDayLoad.get(lk) || 0) + 1);
          }
        }
      }
    }
  }

  // The desktop's T380 matching: in a tight week, activities capped to a few groups at once
  // compete for the same cells (a Latin-square problem no per-cell rule solves). Each period in
  // turn gets a bipartite matching of its free groups to the scarce activities they still owe.
  function isScarce(act) {
    return (
      act.span === 1 &&
      act.atOnce != null &&
      getMin(act.id) > 0 &&
      act.atOnce < eligibility.get(act.id).size
    );
  }

  function spareCells() {
    const spare = new Map();
    for (const groupId of model.groupIds) {
      let free = 0;
      for (const s of openSlotsByGroup.get(groupId) || []) {
        if (!assigned.has(keyOf(s))) {
          free++;
        }
      }
      let need = 0;
      for (const a of acts) {
        if (eligibility.get(a.id).has(groupId)) {
          need += Math.max(0, getMin(a.id) - getCount(groupId, a.id)) * a.span;
        }
      }
      if (openSlotsByGroup.has(groupId)) {
        spare.set(groupId, free - need);
      }
    }
    return spare;
  }

  function placeScarceSessions(slotsToFill) {
    const scarce = acts.filter(isScarce);
    if (!scarce.length) {
      return;
    }
    const spare = [...spareCells().values()];
    if (!spare.length || Math.min(...spare) > 0) {
      return;
    }
    placeSpansFirst(slotsToFill, "low");
    const matchRand = streamFor(`${model.seed}|match`);
    const tie = new Map(
      [...scarce.map((a) => a.id), ...model.groupIds].map((id) => [
        id,
        matchRand()
      ])
    );
    const owed = (act, groupId) => {
      let n = getMin(act.id) - getCount(groupId, act.id);
      if (act.max != null) {
        n = Math.min(n, act.max - getCount(groupId, act.id));
      }
      return n;
    };
    const periods = [];
    days.forEach((day, d) => {
      for (const block of day.blocks) {
        const cells = openSlotsByPeriod.get(`${d}|${block.id}`);
        if (cells) {
          periods.push(cells);
        }
      }
    });
    for (let p = 0; p < periods.length; p++) {
      const urgency = new Map(
        scarce.map((a) => {
          let owedTotal = 0;
          for (const groupId of model.groupIds) {
            if (eligibility.get(a.id).has(groupId)) {
              owedTotal += Math.max(0, owed(a, groupId));
            }
          }
          return [a.id, owedTotal / (a.atOnce * (periods.length - p))];
        })
      );
      const cellsLeft = new Map();
      for (let q = p; q < periods.length; q++) {
        for (const s of periods[q]) {
          if (!assigned.has(keyOf(s))) {
            cellsLeft.set(s.groupId, (cellsLeft.get(s.groupId) || 0) + 1);
          }
        }
      }
      const slack = new Map(
        model.groupIds.map((groupId) => {
          let need = 0;
          for (const a of scarce) {
            if (eligibility.get(a.id).has(groupId)) {
              need += Math.max(0, owed(a, groupId));
            }
          }
          return [groupId, (cellsLeft.get(groupId) || 0) - need];
        })
      );
      const free = periods[p]
        .filter((s) => !assigned.has(keyOf(s)) && slotsToFill.has(keyOf(s)))
        .sort(
          (x, y) =>
            slack.get(x.groupId) - slack.get(y.groupId) ||
            tie.get(x.groupId) - tie.get(y.groupId)
        );
      const candidates = new Map();
      for (const s of free) {
        candidates.set(
          s.groupId,
          scarce
            .filter(
              (a) =>
                s.eligibleActs.includes(a) &&
                owed(a, s.groupId) > 0 &&
                canPlace(a, s.groupId, s.dayIndex, s.blockId)
            )
            .sort(
              (x, y) =>
                earlyScore(x, s.groupId, s.dayIndex) -
                  earlyScore(y, s.groupId, s.dayIndex) ||
                urgency.get(y.id) - urgency.get(x.id) ||
                tie.get(x.id) - tie.get(y.id)
            )
        );
      }
      const holders = new Map();
      const slotOf = new Map(free.map((s) => [s.groupId, s]));
      const roomOf = (a, s) =>
        a.atOnce -
        (activityUsers.get(`${a.id}|${s.dayIndex}|${s.blockId}`) || []).length -
        (otherActivity.get(`${a.id}|${s.dayIndex}|${s.blockId}`) || 0);
      // A shared location's capacity is a limit across activities.
      const locationHasRoom = (a, s) => {
        const loc = a.locationId;
        if (loc == null || !fit.has(loc)) {
          return true;
        }
        let n =
          (placeUsage.get(`${loc}|${s.dayIndex}|${s.blockId}`) || []).length +
          (otherPlace.get(`${loc}|${s.dayIndex}|${s.blockId}`) || 0);
        for (const [actId, gs] of holders) {
          if (actById.get(actId).locationId === loc) {
            n += gs.length;
          }
        }
        return n < fit.get(loc);
      };
      let critical = null;
      const assign = (groupId, seen) => {
        for (const a of candidates.get(groupId)) {
          if ((critical && !critical.has(a.id)) || seen.has(a.id)) {
            continue;
          }
          seen.add(a.id);
          const held = holders.get(a.id) || [];
          const s = slotOf.get(groupId);
          if (held.length < roomOf(a, s) && locationHasRoom(a, s)) {
            holders.set(a.id, [...held, groupId]);
            return true;
          }
          for (let i = 0; i < held.length; i++) {
            if (assign(held[i], seen)) {
              const now = holders.get(a.id) || [];
              holders.set(a.id, [...now.filter((x) => x !== held[i]), groupId]);
              return true;
            }
          }
        }
        return false;
      };
      critical = new Set(
        scarce.filter((a) => urgency.get(a.id) >= 1 - 1e-9).map((a) => a.id)
      );
      const matched = new Set();
      if (critical.size) {
        for (const s of free) {
          if (assign(s.groupId, new Set())) {
            matched.add(s.groupId);
          }
        }
      }
      critical = null;
      for (const s of free) {
        if (!matched.has(s.groupId)) {
          assign(s.groupId, new Set());
        }
      }
      const pick = new Map();
      for (const [actId, gs] of holders) {
        for (const groupId of gs) {
          pick.set(groupId, actById.get(actId));
        }
      }
      for (const s of free) {
        const a = [pick.get(s.groupId), ...candidates.get(s.groupId)].find(
          (x) => x && canPlace(x, s.groupId, s.dayIndex, s.blockId)
        );
        if (a) {
          place(a, s.groupId, s.dayIndex, s.blockId);
        }
      }
    }
  }

  function candidatesFor(s, priority) {
    return s.eligibleActs.filter(
      (a) =>
        a.priority === priority && canPlace(a, s.groupId, s.dayIndex, s.blockId)
    );
  }

  // Greedy: the cells with the fewest choices first; in each, the activity that best keeps the
  // early goal, then the one the group has had least, then the stable key.
  function runRound(slots, priority) {
    const slotsToFill = new Set(slots.map(keyOf));
    placeSpansFirst(slotsToFill, priority);
    if (priority === "high") {
      placeScarceSessions(slotsToFill);
    }
    const choices = new Map();
    const roundSlots = slots.filter((s) => {
      const n = candidatesFor(s, priority).length;
      choices.set(keyOf(s), n);
      return n > 0;
    });
    roundSlots.sort((a, b) => choices.get(keyOf(a)) - choices.get(keyOf(b)));
    for (const slot of roundSlots) {
      if (assigned.has(keyOf(slot))) {
        continue;
      }
      const candidates = candidatesFor(slot, priority);
      if (!candidates.length) {
        continue;
      }
      candidates.sort(
        (a, b) =>
          earlyScore(a, slot.groupId, slot.dayIndex) -
            earlyScore(b, slot.groupId, slot.dayIndex) ||
          getCount(slot.groupId, a.id) - getCount(slot.groupId, b.id) ||
          tieOf(slot, a) - tieOf(slot, b)
      );
      place(candidates[0], slot.groupId, slot.dayIndex, slot.blockId);
    }
  }

  // Repair 1 (tryFill): fill a stranded cell directly, or lift one placement in its way (same
  // group, or same period), fill the cell and refill the lifted cell, up to REPAIR_DEPTH deep.
  // Every step that doesn't end filled is undone; nothing is lifted below its weekly minimum.
  const fits = (s) =>
    s.eligibleActs
      .filter((a) => canPlace(a, s.groupId, s.dayIndex, s.blockId))
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          getCount(s.groupId, a.id) - getCount(s.groupId, b.id)
      );

  let liftBudget = 0;
  function tryFill(u, depth, held) {
    if (assigned.has(keyOf(u))) {
      return true;
    }
    const direct = fits(u)[0];
    if (direct) {
      place(direct, u.groupId, u.dayIndex, u.blockId);
      return true;
    }
    if (depth === 0) {
      return false;
    }
    held.add(keyOf(u));
    for (const s of openSlots) {
      if (liftBudget <= 0) {
        break;
      }
      const key = keyOf(s);
      if (held.has(key) || spanTails.has(key)) {
        continue;
      }
      if (
        s.groupId !== u.groupId &&
        (s.dayIndex !== u.dayIndex || s.blockId !== u.blockId)
      ) {
        continue;
      }
      const lifted = actById.get(assigned.get(key));
      if (
        !lifted ||
        lifted.span !== 1 ||
        getCount(s.groupId, lifted.id) <= getMin(lifted.id)
      ) {
        continue;
      }
      liftBudget--;
      unplace(lifted, s.groupId, s.dayIndex, s.blockId);
      for (const a of fits(u)) {
        place(a, u.groupId, u.dayIndex, u.blockId);
        if (tryFill(s, depth - 1, held)) {
          held.delete(keyOf(u));
          return true;
        }
        unplace(a, u.groupId, u.dayIndex, u.blockId);
      }
      place(lifted, s.groupId, s.dayIndex, s.blockId);
    }
    held.delete(keyOf(u));
    return false;
  }

  function repair() {
    let filled = true;
    // Each productive sweep fills at least one cell, so this many sweeps is always enough; the
    // cap is a guard so a future edit can never freeze the browser.
    for (let sweep = 0; filled && sweep <= openSlots.length; sweep++) {
      filled = false;
      for (const u of openSlots) {
        if (assigned.has(keyOf(u))) {
          continue;
        }
        liftBudget = REPAIR_LIFTS_PER_CELL;
        if (tryFill(u, REPAIR_DEPTH, new Set())) {
          filled = true;
        }
      }
    }
  }

  // Repairs 2 and 3 share a journal: a chain that doesn't end whole is rolled back.
  const REPAIR_WORK_PER_PASS = 20000 + 200 * openSlots.length;
  let repairWorkLeft = REPAIR_WORK_PER_PASS;
  let minRepairBudget = 0;
  const journal = [];
  function jPlace(act, g, d, b) {
    place(act, g, d, b);
    journal.push([act, g, d, b, true]);
  }
  function jUnplace(act, g, d, b) {
    unplace(act, g, d, b);
    journal.push([act, g, d, b, false]);
  }
  function rollback(mark) {
    while (journal.length > mark) {
      const [act, g, d, b, placed] = journal.pop();
      if (placed) {
        unplace(act, g, d, b);
      } else {
        place(act, g, d, b);
      }
    }
  }
  // Only generated single-block placements move: never a kept cell (they aren't open slots).
  const movable = (k) =>
    assigned.has(k) &&
    openSlotByKey.has(k) &&
    !spanTails.has(k) &&
    actById.get(assigned.get(k)).span === 1;

  function spanHeadKey(k) {
    if (!spanTails.has(k)) {
      return k;
    }
    const [g, d, b] = splitKey(k);
    for (let i = blockIdx(d, b) - 1; i >= 0; i--) {
      const hk = cellKey(g, d, blocksOf(d)[i].id);
      if (assigned.get(hk) !== assigned.get(k)) {
        return null;
      }
      if (!spanTails.has(hk)) {
        return hk;
      }
    }
    return null;
  }
  function movableSpanHead(k) {
    if (!assigned.has(k)) {
      return null;
    }
    const hk = spanHeadKey(k);
    if (!hk || !openSlotByKey.has(hk)) {
      return null;
    }
    return actById.get(assigned.get(hk)).span > 1 ? hk : null;
  }
  function spanKeys(hk) {
    const [g, d, b] = splitKey(hk);
    const act = actById.get(assigned.get(hk));
    return ownBlocks(act, g, d, b).map((blockId) => cellKey(g, d, blockId));
  }

  // Repair 2 (raise): one more session of `act` for a group short of its weekly minimum, by an
  // ejection chain: lift what sits in the cells it needs, place it, re-place anything left short.
  // `lenient` (the minimum repair only): a cell the chain empties may stay Open for never-blank to
  // fill, provided the whole chain, checked at the top (`limit`), leaves no more Open cells than
  // it found. What never-blank then puts there can still bend more than the move saves, so a
  // build that used this is weighed against one without it (`leftForNeverBlank`; ADR 0010).
  function raise(
    act,
    groupId,
    depth,
    held,
    liftSpans,
    lenient = false,
    limit = null
  ) {
    for (const head of openSlotsByGroup.get(groupId) || []) {
      if (minRepairBudget-- <= 0 || repairWorkLeft-- <= 0) {
        return false;
      }
      if (!head.eligibleActs.includes(act)) {
        continue;
      }
      const d = head.dayIndex;
      const idx = blockIdx(d, head.blockId);
      const keys = [];
      for (let i = 0; i < act.span; i++) {
        const blk = blocksOf(d)[idx + i];
        if (!blk) {
          break;
        }
        keys.push(cellKey(groupId, d, blk.id));
      }
      if (
        keys.length !== act.span ||
        keys.some((k) => held.has(k) || !openSlotByKey.has(k))
      ) {
        continue;
      }
      const spanHeads = new Set();
      let blocked = false;
      for (const k of keys) {
        if (!assigned.has(k) || movable(k)) {
          if (assigned.get(k) === act.id) {
            blocked = true;
          }
          continue;
        }
        const hk = liftSpans ? movableSpanHead(k) : null;
        if (
          !hk ||
          assigned.get(hk) === act.id ||
          spanKeys(hk).some((x) => held.has(x))
        ) {
          blocked = true;
          break;
        }
        spanHeads.add(hk);
      }
      if (blocked) {
        continue;
      }
      const mark = journal.length;
      const lifted = [];
      const vacated = [];
      for (const hk of spanHeads) {
        const l = actById.get(assigned.get(hk));
        for (const x of spanKeys(hk)) {
          if (!keys.includes(x)) {
            vacated.push(x);
          }
        }
        const s = openSlotByKey.get(hk);
        jUnplace(l, s.groupId, s.dayIndex, s.blockId);
        lifted.push(l);
      }
      for (const k of keys) {
        if (!assigned.has(k)) {
          continue;
        }
        const l = actById.get(assigned.get(k));
        const s = openSlotByKey.get(k);
        jUnplace(l, s.groupId, s.dayIndex, s.blockId);
        lifted.push(l);
      }
      const nextHeld = new Set([...held, ...keys]);
      const moved = [];
      if (
        blockedBy(act, groupId, d, head.blockId) === RULE.GROUPS_AT_ONCE &&
        depth > 0
      ) {
        for (const peer of openSlotsByPeriod.get(`${d}|${head.blockId}`) ||
          []) {
          const pk = keyOf(peer);
          if (
            peer.groupId === groupId ||
            assigned.get(pk) !== act.id ||
            !movable(pk) ||
            held.has(pk)
          ) {
            continue;
          }
          jUnplace(act, peer.groupId, peer.dayIndex, peer.blockId);
          moved.push(peer);
          nextHeld.add(pk);
          if (canPlace(act, groupId, d, head.blockId)) {
            break;
          }
        }
      }
      if (canPlace(act, groupId, d, head.blockId)) {
        jPlace(act, groupId, d, head.blockId);
        let ok = true;
        for (const l of lifted) {
          if (getCount(groupId, l.id) >= getMin(l.id)) {
            continue;
          }
          if (
            depth === 0 ||
            !raise(l, groupId, depth - 1, nextHeld, liftSpans, lenient)
          ) {
            ok = false;
            break;
          }
        }
        for (const x of vacated) {
          if (!ok) {
            break;
          }
          if (assigned.has(x)) {
            continue;
          }
          const v = openSlotByKey.get(x);
          const fill = v ? fits(v)[0] : null;
          if (fill) {
            jPlace(fill, v.groupId, v.dayIndex, v.blockId);
          } else if (lenient) {
            leftForNeverBlank = true;
          } else {
            ok = false;
          }
        }
        for (const peer of moved) {
          if (!ok) {
            break;
          }
          if (getCount(peer.groupId, act.id) >= getMin(act.id)) {
            continue;
          }
          if (
            !raise(act, peer.groupId, depth - 1, nextHeld, liftSpans, lenient)
          ) {
            ok = false;
          }
        }
        for (const peer of moved) {
          if (!ok) {
            break;
          }
          if (assigned.has(keyOf(peer))) {
            continue;
          }
          const fill = fits(peer)[0];
          if (fill) {
            jPlace(fill, peer.groupId, peer.dayIndex, peer.blockId);
          } else if (lenient) {
            leftForNeverBlank = true;
          } else {
            ok = false;
          }
        }
        if (ok && (limit == null || emptyCells <= limit)) {
          return true;
        }
      }
      rollback(mark);
    }
    return false;
  }

  // Repair 3 (fillCell): an empty cell every fitting activity is kept out of by one of its own
  // sessions (already on that day, at its weekly max, or another group holds its last seat):
  // move that session into the cell and fill the cell it left, up to FILL_REPAIR_DEPTH steps.
  function fillCell(u, depth, held) {
    if (assigned.has(keyOf(u))) {
      return true;
    }
    const direct = fits(u)[0];
    if (direct) {
      jPlace(direct, u.groupId, u.dayIndex, u.blockId);
      return true;
    }
    if (depth === 0) {
      return false;
    }
    held.add(keyOf(u));
    const candidates = u.eligibleActs
      .filter((a) => a.span === 1)
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          getCount(u.groupId, a.id) - getCount(u.groupId, b.id)
      );
    for (const act of candidates) {
      if (minRepairBudget-- <= 0 || repairWorkLeft-- <= 0) {
        break;
      }
      const blocker = blockedBy(act, u.groupId, u.dayIndex, u.blockId);
      const vacates = [];
      const pool =
        blocker === RULE.GROUPS_AT_ONCE
          ? openSlotsByPeriod.get(`${u.dayIndex}|${u.blockId}`) || []
          : openSlotsByGroup.get(u.groupId) || [];
      for (const s of pool) {
        const k = keyOf(s);
        if (held.has(k) || assigned.get(k) !== act.id || !movable(k)) {
          continue;
        }
        if (
          (blocker === RULE.ONCE_A_DAY || blocker === RULE.WEEKLY_MAX) &&
          s.groupId === u.groupId
        ) {
          vacates.push(s);
        } else if (
          blocker === RULE.GROUPS_AT_ONCE &&
          s.groupId !== u.groupId &&
          s.dayIndex === u.dayIndex &&
          s.blockId === u.blockId
        ) {
          vacates.push(s);
        }
      }
      vacates.sort(
        (a, b) =>
          (a.dayIndex === u.dayIndex ? 0 : 1) -
          (b.dayIndex === u.dayIndex ? 0 : 1)
      );
      for (const vacate of vacates) {
        if (minRepairBudget-- <= 0 || repairWorkLeft-- <= 0) {
          break;
        }
        const mark = journal.length;
        jUnplace(act, vacate.groupId, vacate.dayIndex, vacate.blockId);
        if (canPlace(act, u.groupId, u.dayIndex, u.blockId)) {
          jPlace(act, u.groupId, u.dayIndex, u.blockId);
          if (
            fillCell(vacate, depth - 1, held) &&
            (getCount(vacate.groupId, act.id) >= getMin(act.id) ||
              raise(act, vacate.groupId, depth - 1, held, false))
          ) {
            held.delete(keyOf(u));
            return true;
          }
        }
        rollback(mark);
      }
    }
    held.delete(keyOf(u));
    return false;
  }

  function fillRepair() {
    repairWorkLeft = REPAIR_WORK_PER_PASS;
    for (const u of openSlots) {
      if (assigned.has(keyOf(u))) {
        continue;
      }
      minRepairBudget = MIN_REPAIR_BUDGET;
      journal.length = 0;
      fillCell(u, FILL_REPAIR_DEPTH, new Set());
    }
  }

  function minRepair() {
    for (const act of acts) {
      for (const groupId of model.groupIds) {
        if (!eligibility.get(act.id).has(groupId)) {
          continue;
        }
        // Each pass raises the count by one, so the minimum bounds the passes (a guard as above).
        for (
          let pass = 0;
          pass <= getMin(act.id) && getCount(groupId, act.id) < getMin(act.id);
          pass++
        ) {
          minRepairBudget = MIN_REPAIR_BUDGET;
          journal.length = 0;
          if (
            raise(
              act,
              groupId,
              MIN_REPAIR_DEPTH,
              new Set(),
              false,
              lenientRepair,
              emptyCells
            )
          ) {
            continue;
          }
          // Only when that fails may the chain lift a multi-block placement, on its own budget.
          minRepairBudget = MIN_REPAIR_BUDGET;
          journal.length = 0;
          const sharedWorkLeft = repairWorkLeft;
          repairWorkLeft = SPAN_LIFT_WORK;
          const raised = raise(
            act,
            groupId,
            MIN_REPAIR_DEPTH,
            new Set(),
            true,
            lenientRepair,
            emptyCells
          );
          repairWorkLeft = sharedWorkLeft;
          if (!raised) {
            break;
          }
        }
      }
    }
  }

  // Never blank (Greg, 2026-10-17): a cell nothing fits cleanly gets the least-bad activity, the
  // one whose most serious bend is least serious (RELAX_ORDER). Weekly maximums are soft in
  // practice (Greg: "I write 2 art periods, but I'd accept 3"), so going over one is tried before
  // any other bend, and among those the smallest overage wins: a third Art for several bunks
  // before a fifth for one. Then high priority, then the one the group has had least, then the
  // stable key. An activity is never shortened (Greg): a cell where the group is busy at an
  // overlapping time, or a gap no activity's length fits, stays Open.
  const openCells = [];
  function neverBlank() {
    for (const u of openSlots) {
      const k = keyOf(u);
      if (assigned.has(k)) {
        continue;
      }
      let best = null;
      let bestRank = null;
      for (const act of acts) {
        const bends = check(act, u.groupId, u.dayIndex, u.blockId, true);
        if (bends === null) {
          continue;
        }
        const over = bends.includes(RULE.WEEKLY_MAX)
          ? getCount(u.groupId, act.id) + 1 - act.max
          : 0;
        const rank = [
          ...SEVERITY.map((rule) => (bends.includes(rule) ? 1 : 0)),
          over,
          PRIORITY_RANK[act.priority],
          getCount(u.groupId, act.id),
          tieOf(u, act)
        ];
        if (!bestRank || lexLess(rank, bestRank)) {
          best = act;
          bestRank = rank;
        }
      }
      if (best) {
        // Its dots come from checkWeek on the finished week (checks.js), like any other cell's.
        place(best, u.groupId, u.dayIndex, u.blockId);
      } else {
        openCells.push({ key: k, why: LENGTH });
      }
    }
    for (const k of busyThen) {
      openCells.push({ key: k, why: OVERLAP });
    }
  }

  runRound(openSlots, "high");
  runRound(
    openSlots.filter((s) => !assigned.has(keyOf(s))),
    "low"
  );
  repair();
  minRepair();
  fillRepair();
  neverBlank();

  return {
    assigned,
    spanTails,
    keptCells,
    openCells,
    leftForNeverBlank,
    ruleChecks,
    usageCount,
    away,
    lockedOpen,
    placeUsage,
    activityUsers,
    keyOf,
    splitKey,
    cellKey,
    actById,
    openSlotByKey
  };
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}
