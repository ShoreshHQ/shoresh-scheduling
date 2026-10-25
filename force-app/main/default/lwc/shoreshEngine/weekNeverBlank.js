import { check } from "./weekOptions";
import {
  FULL,
  LENGTH,
  NONE_FOR,
  OVERLAP,
  PREFERENCES,
  PRIORITY_RANK,
  RULE,
  SEVERITY,
  lexLess
} from "./weekRules";

/**
 * Step 7 of the protocol (docs/engine/protocol.md): never blank. Runs last, after the repairs
 * (weekRepair.js), on every cell still empty; then says why each cell still Open is Open.
 */

// Never blank (Greg, 2026-10-17; care plan step 7, 2026-10-25): a cell nothing fits cleanly
// gets an activity the group is set up for that fits every limit (once a day, groups at once,
// groups that fit, same division), bending only its weekly max (Greg: "max is a preference;
// going over is fine"), smallest overage first: a third Art for several bunks before a fifth
// for one. Then high priority, then the one the group has had
// least, then the stable key. Nothing allowed fits: the cell stays Open, saying so (FULL). An
// activity is never shortened (Greg): a cell where the group is busy at an overlapping time, or
// a gap no activity's length fits, stays Open.
export function* neverBlank(st, slots, from) {
  for (const u of slots) {
    const k = st.keyOf(u);
    if (st.assigned.has(k)) {
      continue;
    }
    yield from;
    let best = null;
    let bestRank = null;
    let full = false;
    let any = false;
    for (const act of st.acts) {
      if (!st.eligibility.get(act.id).has(u.groupId)) {
        continue;
      }
      any = true;
      const bends = check(st, act, u.groupId, u.dayIndex, u.blockId, true);
      if (bends === null) {
        continue;
      }
      if (bends.some((rule) => !PREFERENCES.includes(rule))) {
        full = true;
        continue;
      }
      const over = bends.includes(RULE.WEEKLY_MAX)
        ? st.getCount(u.groupId, act.id) + 1 - act.max
        : 0;
      const rank = [
        ...SEVERITY.map((rule) => (bends.includes(rule) ? 1 : 0)),
        over,
        PRIORITY_RANK[act.priority],
        st.getCount(u.groupId, act.id),
        st.tieOf(u, act)
      ];
      if (!bestRank || lexLess(rank, bestRank)) {
        best = act;
        bestRank = rank;
      }
    }
    if (best) {
      // Its dots come from checkWeek on the finished week (checks.js), like any other cell's.
      st.place(best, u.groupId, u.dayIndex, u.blockId);
    } else if (full) {
      st.fullThen.add(k);
    } else if (!any) {
      st.noneFor.add(k);
    }
  }
}

/** Why a cell is still Open, in the order a director would look: busy, nothing for the group,
 * all of it taken (full, or held for another division), too short a gap. */
function openWhy(st, s) {
  const k = st.keyOf(s);
  if (busyAt(st, s)) {
    return OVERLAP;
  }
  if (st.noneFor.has(k)) {
    return NONE_FOR;
  }
  return st.fullThen.has(k) ? FULL : LENGTH;
}

/** Whether the group holds anything at a time overlapping this cell. */
function busyAt(st, s) {
  return (st.peersByDay[s.dayIndex].get(s.blockId) || []).some((peer) => {
    const pk = st.cellKey(s.groupId, s.dayIndex, peer);
    return st.assigned.has(pk) || st.keptKeys.has(pk);
  });
}

/**
 * A cell left out for an overlapping one that stayed Open isn't busy after all: it is filled
 * now. Each round frees at least one cell, so the rounds end. Then every cell still Open says
 * why: the group is busy then, everything set up for it is taken then, or no activity's length
 * fits (st.openCells).
 */
export function* finishOpen(st, from) {
  st.openCells = [];
  for (let round = 0; round <= st.freeSlots.length; round++) {
    const freed = [...st.busyThen.values()].filter((s) => !busyAt(st, s));
    if (!freed.length) {
      break;
    }
    for (const s of freed) {
      st.busyThen.delete(st.keyOf(s));
      st.openSlots.push(s);
      st.openSlotByKey.set(st.keyOf(s), s);
      st.emptyCells++;
    }
    yield* neverBlank(st, freed, from);
  }
  for (const s of st.freeSlots) {
    if (!st.assigned.has(st.keyOf(s))) {
      st.openCells.push({
        key: st.keyOf(s),
        why: openWhy(st, s)
      });
    }
  }
}
