import { streamFor } from "./random";
import { canPlace, earlyScore } from "./weekOptions";
import { lexLess } from "./weekRules";

/**
 * Steps 4, 5 and 6 of the protocol (docs/engine/protocol.md): place by priority. A round for
 * high-priority activities, then one for low. Each round puts multi-block activities first, up to
 * each group's weekly minimum, spread across days; in the high round, scarce activities next (a
 * matching per period); then every cell still empty, fewest choices first, each taking the
 * activity that best keeps the early-week goal, then the one the group has had least (spread
 * and topping up toward the weekly maximum happen here: a cell takes any activity under its max).
 */

// Multi-block activities go first in their round: once single-block activities have taken
// cells there is rarely a run of free blocks left. Round-robin over groups, one session per
// group per sweep, up to the weekly minimum; the head is the free fit that best keeps the early
// goal, then whose day holds fewest of this activity so far, then the stable key.
function placeSpansFirst(st, slotsToFill, priority) {
  const spanActs = st.acts
    .filter((a) => a.priority === priority && a.span > 1)
    .sort((a, b) => b.span - a.span);
  const actDayLoad = new Map();
  for (const act of spanActs) {
    const min = st.getMin(act.id);
    for (let session = 0; session < min; session++) {
      for (const groupId of st.model.groupIds) {
        if (st.getCount(groupId, act.id) >= min) {
          continue;
        }
        let best = null;
        let bestRank = null;
        for (const s of st.openSlotsByGroup.get(groupId) || []) {
          if (
            slotsToFill.has(st.keyOf(s)) &&
            !st.assigned.has(st.keyOf(s)) &&
            s.eligibleActs.includes(act) &&
            canPlace(st, act, s.groupId, s.dayIndex, s.blockId)
          ) {
            const rank = [
              earlyScore(st, act, s.groupId, s.dayIndex),
              actDayLoad.get(`${act.id}|${s.dayIndex}`) || 0,
              st.tieOf(s, act)
            ];
            if (!bestRank || lexLess(rank, bestRank)) {
              best = s;
              bestRank = rank;
            }
          }
        }
        if (best) {
          st.place(act, best.groupId, best.dayIndex, best.blockId);
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
function isScarce(st, act) {
  return (
    act.span === 1 &&
    act.atOnce != null &&
    st.getMin(act.id) > 0 &&
    act.atOnce < st.eligibility.get(act.id).size
  );
}

function spareCells(st) {
  const spare = new Map();
  for (const groupId of st.model.groupIds) {
    let free = 0;
    for (const s of st.openSlotsByGroup.get(groupId) || []) {
      if (!st.assigned.has(st.keyOf(s))) {
        free++;
      }
    }
    let need = 0;
    for (const a of st.acts) {
      if (st.eligibility.get(a.id).has(groupId)) {
        need +=
          Math.max(0, st.getMin(a.id) - st.getCount(groupId, a.id)) * a.span;
      }
    }
    if (st.openSlotsByGroup.has(groupId)) {
      spare.set(groupId, free - need);
    }
  }
  return spare;
}

function placeScarceSessions(st, slotsToFill) {
  const { acts, days, eligibility, activityUsers, otherActivity, actById } = st;
  const groupIds = st.model.groupIds;
  const scarce = acts.filter((a) => isScarce(st, a));
  if (!scarce.length) {
    return;
  }
  const spare = [...spareCells(st).values()];
  if (!spare.length || Math.min(...spare) > 0) {
    return;
  }
  placeSpansFirst(st, slotsToFill, "low");
  const matchRand = streamFor(`${st.model.seed}|match`);
  const tie = new Map(
    [...scarce.map((a) => a.id), ...groupIds].map((id) => [id, matchRand()])
  );
  const owed = (act, groupId) => {
    let n = st.getMin(act.id) - st.getCount(groupId, act.id);
    if (act.max != null) {
      n = Math.min(n, act.max - st.getCount(groupId, act.id));
    }
    return n;
  };
  const periods = [];
  days.forEach((day, d) => {
    for (const block of day.blocks) {
      const cells = st.openSlotsByPeriod.get(`${d}|${block.id}`);
      if (cells) {
        periods.push(cells);
      }
    }
  });
  for (let p = 0; p < periods.length; p++) {
    const urgency = new Map(
      scarce.map((a) => {
        let owedTotal = 0;
        for (const groupId of groupIds) {
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
        if (!st.assigned.has(st.keyOf(s))) {
          cellsLeft.set(s.groupId, (cellsLeft.get(s.groupId) || 0) + 1);
        }
      }
    }
    const slack = new Map(
      groupIds.map((groupId) => {
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
      .filter(
        (s) => !st.assigned.has(st.keyOf(s)) && slotsToFill.has(st.keyOf(s))
      )
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
              canPlace(st, a, s.groupId, s.dayIndex, s.blockId)
          )
          .sort(
            (x, y) =>
              earlyScore(st, x, s.groupId, s.dayIndex) -
                earlyScore(st, y, s.groupId, s.dayIndex) ||
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
      if (loc == null || !st.fit.has(loc)) {
        return true;
      }
      let n =
        (st.placeUsage.get(`${loc}|${s.dayIndex}|${s.blockId}`) || []).length +
        (st.otherPlace.get(`${loc}|${s.dayIndex}|${s.blockId}`) || 0);
      for (const [actId, gs] of holders) {
        if (actById.get(actId).locationId === loc) {
          n += gs.length;
        }
      }
      return n < st.fit.get(loc);
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
        (x) => x && canPlace(st, x, s.groupId, s.dayIndex, s.blockId)
      );
      if (a) {
        st.place(a, s.groupId, s.dayIndex, s.blockId);
      }
    }
  }
}

function candidatesFor(st, s, priority) {
  return s.eligibleActs.filter(
    (a) =>
      a.priority === priority &&
      canPlace(st, a, s.groupId, s.dayIndex, s.blockId)
  );
}

// Greedy: the cells with the fewest choices first; in each, the activity that best keeps the
// early goal, then the one the group has had least, then the stable key.
export function* runRound(st, slots, priority, from) {
  const slotsToFill = new Set(slots.map(st.keyOf));
  placeSpansFirst(st, slotsToFill, priority);
  yield from;
  if (priority === "high") {
    placeScarceSessions(st, slotsToFill);
    yield from;
  }
  const choices = new Map();
  const roundSlots = slots.filter((s) => {
    const n = candidatesFor(st, s, priority).length;
    choices.set(st.keyOf(s), n);
    return n > 0;
  });
  roundSlots.sort(
    (a, b) => choices.get(st.keyOf(a)) - choices.get(st.keyOf(b))
  );
  for (const slot of roundSlots) {
    if (st.assigned.has(st.keyOf(slot))) {
      continue;
    }
    yield from;
    const candidates = candidatesFor(st, slot, priority);
    if (!candidates.length) {
      continue;
    }
    candidates.sort(
      (a, b) =>
        earlyScore(st, a, slot.groupId, slot.dayIndex) -
          earlyScore(st, b, slot.groupId, slot.dayIndex) ||
        st.getCount(slot.groupId, a.id) - st.getCount(slot.groupId, b.id) ||
        st.tieOf(slot, a) - st.tieOf(slot, b)
    );
    st.place(candidates[0], slot.groupId, slot.dayIndex, slot.blockId);
  }
}
