import { blockedBy, canPlace } from "./engine.shoreshEngine.weekOptions.mjs";
import { PRIORITY_RANK, RULE } from "./engine.shoreshEngine.weekRules.mjs";
import { NOW, tell } from "./engine.shoreshEngine.progress.mjs";
import { outOfRunWork } from "./engine.shoreshEngine.weekState.mjs";

/**
 * Step 8 of the protocol (docs/engine/protocol.md), part 1 (rules 8.1-8.8): search before giving
 * up. The desktop's three repairs, run after the rounds and before never-blank (part 2, the exact
 * search after never-blank, is weekSearch.js): a reshuffle per empty cell (repair), raising weekly
 * minimums by ejection chains (minRepair), and moving a blocking session (fillRepair). Each step
 * of a repair is undone unless it ends whole.
 */

// Repair limits, as the desktop's (they bound the work on a week that cannot be filled).
const REPAIR_DEPTH = 3;
const REPAIR_LIFTS_PER_CELL = 300;
const MIN_REPAIR_DEPTH = 3;
const SPAN_LIFT_WORK = 5000;
const MIN_REPAIR_BUDGET = 1500;
const FILL_REPAIR_DEPTH = 4;

/** Sets the repairs' budgets once the grid is read (they scale with the cells to fill). */
export function startRepairs(st) {
  st.repairWorkPerPass = 20000 + 200 * st.openSlots.length;
  st.repairWorkLeft = st.repairWorkPerPass;
  st.minRepairBudget = 0;
  st.liftBudget = 0;
  // Repairs 2 and 3 share a journal: a chain that doesn't end whole is rolled back.
  st.journal = [];
  // Cells the minimum repair left Open for never-blank, in the chain being tried: { key, at
  // (the journal's length then) }, so a rollback drops them with the moves.
  st.repairLeft = [];
  // Cells a kept minimum-repair chain left Open in another group's row: key -> { groupId,
  // activityId }, the group that gained and what (said as a trade if the cell ends Open).
  st.repairTrade = new Map();
  st.repairFor = null;
}

// The activities that fit a cell cleanly, high priority first, then the one the group has had least.
export const fits = (st, s) =>
  s.eligibleActs
    .filter((a) => canPlace(st, a, s.groupId, s.dayIndex, s.blockId))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        st.getCount(s.groupId, a.id) - st.getCount(s.groupId, b.id)
    );

// Repair 1 (tryFill): fill a stranded cell directly, or lift one placement in its way (same
// group, or same period), fill the cell and refill the lifted cell, up to REPAIR_DEPTH deep.
// Every step that doesn't end filled is undone; nothing is lifted below its weekly minimum.
function tryFill(st, u, depth, held) {
  if (st.assigned.has(st.keyOf(u))) {
    return true;
  }
  const direct = fits(st, u)[0];
  if (direct) {
    st.place(direct, u.groupId, u.dayIndex, u.blockId);
    return true;
  }
  if (depth === 0) {
    return false;
  }
  held.add(st.keyOf(u));
  for (const s of st.openSlots) {
    if (st.liftBudget <= 0) {
      break;
    }
    const key = st.keyOf(s);
    if (held.has(key) || st.spanTails.has(key)) {
      continue;
    }
    if (
      s.groupId !== u.groupId &&
      (s.dayIndex !== u.dayIndex || s.blockId !== u.blockId)
    ) {
      continue;
    }
    const lifted = st.actById.get(st.assigned.get(key));
    if (
      !lifted ||
      lifted.span !== 1 ||
      st.getCount(s.groupId, lifted.id) <= st.getMin(lifted.id)
    ) {
      continue;
    }
    st.liftBudget--;
    st.unplace(lifted, s.groupId, s.dayIndex, s.blockId);
    for (const a of fits(st, u)) {
      st.place(a, u.groupId, u.dayIndex, u.blockId);
      if (tryFill(st, s, depth - 1, held)) {
        held.delete(st.keyOf(u));
        return true;
      }
      st.unplace(a, u.groupId, u.dayIndex, u.blockId);
    }
    st.place(lifted, s.groupId, s.dayIndex, s.blockId);
  }
  held.delete(st.keyOf(u));
  return false;
}

export function* repair(st, from) {
  let filled = true;
  // Each productive sweep fills at least one cell, so this many sweeps is always enough; the
  // cap is a guard so a future edit can never freeze the browser.
  for (let sweep = 0; filled && sweep <= st.openSlots.length; sweep++) {
    filled = false;
    for (const u of st.openSlots) {
      if (st.assigned.has(st.keyOf(u))) {
        continue;
      }
      if (outOfRunWork(st)) {
        return;
      }
      tell(st, NOW.FILL, 8, u);
      yield from;
      st.liftBudget = REPAIR_LIFTS_PER_CELL;
      if (tryFill(st, u, REPAIR_DEPTH, new Set())) {
        filled = true;
      }
    }
  }
}

function jPlace(st, act, g, d, b) {
  st.place(act, g, d, b);
  st.journal.push([act, g, d, b, true]);
}
function jUnplace(st, act, g, d, b) {
  st.unplace(act, g, d, b);
  st.journal.push([act, g, d, b, false]);
}
function rollback(st, mark) {
  if (st.repairLeft && st.repairLeft.length) {
    st.repairLeft = st.repairLeft.filter((x) => x.at <= mark);
  }
  while (st.journal.length > mark) {
    const [act, g, d, b, placed] = st.journal.pop();
    if (placed) {
      st.unplace(act, g, d, b);
    } else {
      st.place(act, g, d, b);
    }
  }
}
// Only generated single-block placements move: never a kept cell (they aren't open slots).
const movable = (st, k) =>
  st.assigned.has(k) &&
  st.openSlotByKey.has(k) &&
  !st.spanTails.has(k) &&
  st.actById.get(st.assigned.get(k)).span === 1;

function spanHeadKey(st, k) {
  if (!st.spanTails.has(k)) {
    return k;
  }
  const [g, d, b] = st.splitKey(k);
  for (let i = st.blockIdx(d, b) - 1; i >= 0; i--) {
    const hk = st.cellKey(g, d, st.blocksOf(d)[i].id);
    if (st.assigned.get(hk) !== st.assigned.get(k)) {
      return null;
    }
    if (!st.spanTails.has(hk)) {
      return hk;
    }
  }
  return null;
}
function movableSpanHead(st, k) {
  if (!st.assigned.has(k)) {
    return null;
  }
  const hk = spanHeadKey(st, k);
  if (!hk || !st.openSlotByKey.has(hk)) {
    return null;
  }
  return st.actById.get(st.assigned.get(hk)).span > 1 ? hk : null;
}
function spanKeys(st, hk) {
  const [g, d, b] = st.splitKey(hk);
  const act = st.actById.get(st.assigned.get(hk));
  return st.ownBlocks(act, g, d, b).map((blockId) => st.cellKey(g, d, blockId));
}

// Repair 2 (raise): one more session of `act` for a group short of its weekly minimum, by an
// ejection chain: lift what sits in the cells it needs, place it, re-place anything left short.
// `lenient` (the minimum repair only): a cell the chain empties may stay Open for never-blank to
// fill, provided the whole chain, checked at the top (`limit`), leaves no more Open cells than
// it found. What never-blank then puts there can still bend more than the move saves, so a
// build that used this is weighed against one without it (`leftForNeverBlank`; ADR 0010).
function raise(
  st,
  act,
  groupId,
  depth,
  held,
  liftSpans,
  lenient = false,
  limit = null
) {
  for (const head of st.openSlotsByGroup.get(groupId) || []) {
    if (st.minRepairBudget-- <= 0 || st.repairWorkLeft-- <= 0) {
      return false;
    }
    if (!head.eligibleActs.includes(act)) {
      continue;
    }
    const d = head.dayIndex;
    const idx = st.blockIdx(d, head.blockId);
    const keys = [];
    for (let i = 0; i < act.span; i++) {
      const blk = st.blocksOf(d)[idx + i];
      if (!blk) {
        break;
      }
      keys.push(st.cellKey(groupId, d, blk.id));
    }
    if (
      keys.length !== act.span ||
      keys.some((k) => held.has(k) || !st.openSlotByKey.has(k))
    ) {
      continue;
    }
    const spanHeads = new Set();
    let blocked = false;
    for (const k of keys) {
      if (!st.assigned.has(k) || movable(st, k)) {
        if (st.assigned.get(k) === act.id) {
          blocked = true;
        }
        continue;
      }
      const hk = liftSpans ? movableSpanHead(st, k) : null;
      if (
        !hk ||
        st.assigned.get(hk) === act.id ||
        spanKeys(st, hk).some((x) => held.has(x))
      ) {
        blocked = true;
        break;
      }
      spanHeads.add(hk);
    }
    if (blocked) {
      continue;
    }
    const mark = st.journal.length;
    const lifted = [];
    const vacated = [];
    for (const hk of spanHeads) {
      const l = st.actById.get(st.assigned.get(hk));
      for (const x of spanKeys(st, hk)) {
        if (!keys.includes(x)) {
          vacated.push(x);
        }
      }
      const s = st.openSlotByKey.get(hk);
      jUnplace(st, l, s.groupId, s.dayIndex, s.blockId);
      lifted.push(l);
    }
    for (const k of keys) {
      if (!st.assigned.has(k)) {
        continue;
      }
      const l = st.actById.get(st.assigned.get(k));
      const s = st.openSlotByKey.get(k);
      jUnplace(st, l, s.groupId, s.dayIndex, s.blockId);
      lifted.push(l);
    }
    const nextHeld = new Set([...held, ...keys]);
    const moved = [];
    if (
      blockedBy(st, act, groupId, d, head.blockId) === RULE.GROUPS_AT_ONCE &&
      depth > 0
    ) {
      for (const peer of st.openSlotsByPeriod.get(`${d}|${head.blockId}`) ||
        []) {
        const pk = st.keyOf(peer);
        if (
          peer.groupId === groupId ||
          st.assigned.get(pk) !== act.id ||
          !movable(st, pk) ||
          held.has(pk)
        ) {
          continue;
        }
        jUnplace(st, act, peer.groupId, peer.dayIndex, peer.blockId);
        moved.push(peer);
        nextHeld.add(pk);
        if (canPlace(st, act, groupId, d, head.blockId)) {
          break;
        }
      }
    }
    if (canPlace(st, act, groupId, d, head.blockId)) {
      jPlace(st, act, groupId, d, head.blockId);
      let ok = true;
      for (const l of lifted) {
        if (st.getCount(groupId, l.id) >= st.getMin(l.id)) {
          continue;
        }
        if (
          depth === 0 ||
          !raise(st, l, groupId, depth - 1, nextHeld, liftSpans, lenient)
        ) {
          ok = false;
          break;
        }
      }
      for (const x of vacated) {
        if (!ok) {
          break;
        }
        if (st.assigned.has(x)) {
          continue;
        }
        const v = st.openSlotByKey.get(x);
        const fill = v ? fits(st, v)[0] : null;
        if (fill) {
          jPlace(st, fill, v.groupId, v.dayIndex, v.blockId);
        } else if (lenient) {
          st.leftForNeverBlank = true;
          st.repairLeft.push({ key: x, at: st.journal.length });
        } else {
          ok = false;
        }
      }
      for (const peer of moved) {
        if (!ok) {
          break;
        }
        if (st.getCount(peer.groupId, act.id) >= st.getMin(act.id)) {
          continue;
        }
        if (
          !raise(st, act, peer.groupId, depth - 1, nextHeld, liftSpans, lenient)
        ) {
          ok = false;
        }
      }
      for (const peer of moved) {
        if (!ok) {
          break;
        }
        if (st.assigned.has(st.keyOf(peer))) {
          continue;
        }
        const fill = fits(st, peer)[0];
        if (fill) {
          jPlace(st, fill, peer.groupId, peer.dayIndex, peer.blockId);
        } else if (lenient) {
          st.leftForNeverBlank = true;
          st.repairLeft.push({ key: st.keyOf(peer), at: st.journal.length });
        } else {
          ok = false;
        }
      }
      if (ok && (limit == null || st.emptyCells <= limit)) {
        return true;
      }
    }
    rollback(st, mark);
  }
  return false;
}

// Repair 3 (fillCell): an empty cell every fitting activity is kept out of by one of its own
// sessions (already on that day, at its weekly max, or another group holds its last seat):
// move that session into the cell and fill the cell it left, up to FILL_REPAIR_DEPTH steps.
function fillCell(st, u, depth, held) {
  if (st.assigned.has(st.keyOf(u))) {
    return true;
  }
  const direct = fits(st, u)[0];
  if (direct) {
    jPlace(st, direct, u.groupId, u.dayIndex, u.blockId);
    return true;
  }
  if (depth === 0) {
    return false;
  }
  held.add(st.keyOf(u));
  const candidates = u.eligibleActs
    .filter((a) => a.span === 1)
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        st.getCount(u.groupId, a.id) - st.getCount(u.groupId, b.id)
    );
  for (const act of candidates) {
    if (st.minRepairBudget-- <= 0 || st.repairWorkLeft-- <= 0) {
      break;
    }
    const blocker = blockedBy(st, act, u.groupId, u.dayIndex, u.blockId);
    const vacates = [];
    const pool =
      blocker === RULE.GROUPS_AT_ONCE
        ? st.openSlotsByPeriod.get(`${u.dayIndex}|${u.blockId}`) || []
        : st.openSlotsByGroup.get(u.groupId) || [];
    for (const s of pool) {
      const k = st.keyOf(s);
      if (held.has(k) || st.assigned.get(k) !== act.id || !movable(st, k)) {
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
      if (st.minRepairBudget-- <= 0 || st.repairWorkLeft-- <= 0) {
        break;
      }
      const mark = st.journal.length;
      jUnplace(st, act, vacate.groupId, vacate.dayIndex, vacate.blockId);
      if (canPlace(st, act, u.groupId, u.dayIndex, u.blockId)) {
        jPlace(st, act, u.groupId, u.dayIndex, u.blockId);
        if (
          fillCell(st, vacate, depth - 1, held) &&
          (st.getCount(vacate.groupId, act.id) >= st.getMin(act.id) ||
            raise(st, act, vacate.groupId, depth - 1, held, false))
        ) {
          held.delete(st.keyOf(u));
          // The move that filled the cell, for the progress screen (the outermost one is last).
          st.lastMove = { act, vacate, blocker };
          return true;
        }
      }
      rollback(st, mark);
    }
  }
  held.delete(st.keyOf(u));
  return false;
}

/** Repair 3 over every empty cell. `share` is this pass's part of the progress bar. */
export function* fillRepair(st, from, share) {
  st.repairWorkLeft = st.repairWorkPerPass;
  for (let i = 0; i < st.openSlots.length; i++) {
    const u = st.openSlots[i];
    if (st.assigned.has(st.keyOf(u))) {
      continue;
    }
    if (outOfRunWork(st)) {
      return;
    }
    const at = from + (share * i) / st.openSlots.length;
    tell(st, NOW.FILL, 8, u);
    yield at;
    st.minRepairBudget = MIN_REPAIR_BUDGET;
    st.journal.length = 0;
    st.lastMove = null;
    if (fillCell(st, u, FILL_REPAIR_DEPTH, new Set()) && st.lastMove) {
      yield* tellMove(st, u, at);
    }
  }
}

/**
 * The move fillCell made to fill u, told to the progress screen: another group had the
 * activity's last room then, so that group moved to another activity in its cell (FULL); or the
 * group's own session of it moved into u (SHIFT).
 */
function* tellMove(st, u, at) {
  const { act, vacate, blocker } = st.lastMove;
  const now = st.assigned.get(st.keyOf(vacate));
  if (blocker === RULE.GROUPS_AT_ONCE && now) {
    tell(st, NOW.FULL, 8, vacate, act.id, now);
  } else {
    tell(st, NOW.SHIFT, 8, u, act.id);
  }
  yield at;
}

/** Repair 2 for every group short of an activity's weekly minimum. */
/**
 * A kept chain's cells left Open in another group's row are remembered with the group that
 * gained and its activity: if never-blank and the search can't fill one, it says the trade
 * ("Open, so Bunk 3 gets Swim"), as the last resort's cells do (protocol 8.31). A group's own
 * cells keep their own reason.
 */
function keepRepairLeft(st, groupId, act) {
  for (const { key } of st.repairLeft) {
    if (st.splitKey(key)[0] !== groupId && !st.assigned.has(key)) {
      // The group's count of it then: said as a trade only while it still has as many.
      st.repairTrade.set(key, {
        groupId,
        activityId: act.id,
        count: st.getCount(groupId, act.id)
      });
    }
  }
  st.repairLeft = [];
}

export function* minRepair(st, from, share) {
  const pairs = st.acts.length * st.model.groupIds.length || 1;
  let pair = 0;
  for (const act of st.acts) {
    for (const groupId of st.model.groupIds) {
      const at = from + (share * pair++) / pairs;
      if (!st.eligibility.get(act.id).has(groupId)) {
        continue;
      }
      // Each pass raises the count by one, so the minimum bounds the passes (a guard as above).
      for (
        let pass = 0;
        pass <= st.getMin(act.id) &&
        st.getCount(groupId, act.id) < st.getMin(act.id);
        pass++
      ) {
        if (outOfRunWork(st)) {
          return;
        }
        tell(
          st,
          NOW.SHORT,
          8,
          { dayIndex: null, groupId, blockId: null },
          act.id
        );
        yield at;
        st.minRepairBudget = MIN_REPAIR_BUDGET;
        st.journal.length = 0;
        st.repairLeft = [];
        if (
          raise(
            st,
            act,
            groupId,
            MIN_REPAIR_DEPTH,
            new Set(),
            false,
            st.lenientRepair,
            st.emptyCells
          )
        ) {
          keepRepairLeft(st, groupId, act);
          continue;
        }
        // Only when that fails may the chain lift a multi-block placement, on its own budget.
        st.minRepairBudget = MIN_REPAIR_BUDGET;
        st.journal.length = 0;
        st.repairLeft = [];
        const sharedWorkLeft = st.repairWorkLeft;
        st.repairWorkLeft = SPAN_LIFT_WORK;
        const raised = raise(
          st,
          act,
          groupId,
          MIN_REPAIR_DEPTH,
          new Set(),
          true,
          st.lenientRepair,
          st.emptyCells
        );
        st.repairWorkLeft = sharedWorkLeft;
        if (!raised) {
          break;
        }
        keepRepairLeft(st, groupId, act);
      }
    }
  }
}
