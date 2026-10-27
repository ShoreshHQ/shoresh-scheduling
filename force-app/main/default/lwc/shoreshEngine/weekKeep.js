import { readGrid } from "./weekFixed";
import { check } from "./weekOptions";
import { createWeekState } from "./weekState";

/**
 * Keep the week (protocol 10.1-10.9, Greg 2026-10-27): a Rebuild of a week that already has a
 * generated schedule starts from the week as it is, not from a blank grid. Every activity still
 * allowed under setup as it is now stays exactly where it is; one setup no longer allows is
 * emptied, with why; the emptied cells are filled by the normal steps ("fill the open cells");
 * and only when a weekly minimum still can't be met may a cell that was kept change, one at a
 * time, each one said. Locks, hand edits (a hand edit locks its cells), fixed and recurring
 * activities, special events and electives are kept as in any build.
 */

/** Why an activity's cells were emptied: codes, worded by words.js keepNote. */
export const KEEP_WHY = Object.freeze({
  GONE: "gone", // the activity was deleted, or is closed or its place is closed this week
  LENGTH: "length", // its length changed
  NOT_FOR: "notFor", // no longer set up for that group
  AWAY: "away", // the group isn't at camp then, or the cell is locked empty, or taken
  WEEKLY_MAX: "weeklyMax",
  ONCE_A_DAY: "onceADay",
  GROUPS_AT_ONCE: "groupsAtOnce",
  SAME_DIVISION: "sameDivision",
  PLACE_CAPACITY: "placeCapacity"
});

const BEND_WHY = new Map([
  ["weeklyMax", KEEP_WHY.WEEKLY_MAX],
  ["onceADay", KEEP_WHY.ONCE_A_DAY],
  ["eligibility", KEEP_WHY.NOT_FOR],
  ["groupsAtOnce", KEEP_WHY.GROUPS_AT_ONCE],
  ["sameDivision", KEEP_WHY.SAME_DIVISION],
  ["placeCapacity", KEEP_WHY.PLACE_CAPACITY]
]);

/**
 * The week's activity placements (model.days, readDays' shape) in a fixed order: day, then group
 * in build order, then time block. { d, groupId, b, blockId, actId, name, length }.
 */
export function activityPlacements(model) {
  const out = [];
  model.days.forEach((day, d) => {
    for (const groupId of model.groupIds) {
      const tokens = day.tokens.get(groupId) || [];
      tokens.forEach((token, b) => {
        const item = /^\d+$/.test(token) ? day.items[Number(token) - 1] : null;
        if (!item || item.kind !== "A") {
          return;
        }
        let length = 1;
        while (tokens[b + length] === "^") {
          length += 1;
        }
        out.push({
          d,
          groupId,
          b,
          blockId: day.blocks[b].id,
          actId: item.id,
          name: item.name,
          length
        });
      });
    }
  });
  return out;
}

/** Why setup no longer allows placement p in the ledgers so far, or null when it does. */
function whyNot(st, p) {
  const act = st.actById.get(p.actId);
  if (!act) {
    return KEEP_WHY.GONE;
  }
  if (act.span !== p.length) {
    return KEEP_WHY.LENGTH;
  }
  if (!st.eligibility.get(act.id).has(p.groupId)) {
    return KEEP_WHY.NOT_FOR;
  }
  const k = st.cellKey(p.groupId, p.d, p.blockId);
  if (!st.openSlotByKey.has(k) || st.assigned.has(k)) {
    return KEEP_WHY.AWAY;
  }
  const bends = check(st, act, p.groupId, p.d, p.blockId, true);
  if (bends === null) {
    return KEEP_WHY.AWAY;
  }
  // A limit broken says that limit; the weekly max (a preference) only when it is all.
  const limit = bends.find((r) => r !== "weeklyMax");
  return bends.length ? BEND_WHY.get(limit || bends[0]) : null;
}

/**
 * Step 10b for the weekly max, a preference (rule 7.1): a session over it stays, dotted, unless
 * another activity fits its cell bending nothing (never-blank bends the max only when nothing
 * else fits). Latest first, so the earlier sessions keep it. Those that go are added to emptied.
 */
function reviewOverMax(st, over, emptied) {
  for (const p of [...over].reverse()) {
    const act = st.actById.get(p.actId);
    st.unplace(act, p.groupId, p.d, p.blockId);
    const better = st.acts.some((a) => {
      const bends =
        a.id !== act.id && st.eligibility.get(a.id).has(p.groupId)
          ? check(st, a, p.groupId, p.d, p.blockId, true)
          : null;
      return bends !== null && !bends.length;
    });
    if (better) {
      emptied.push({ ...p, why: KEEP_WHY.WEEKLY_MAX });
    } else {
      st.place(act, p.groupId, p.d, p.blockId);
    }
  }
}

/**
 * Step 10a-b: the week with every activity setup still allows kept and every other one emptied.
 * Placements are taken in the fixed order above, so when a new limit leaves room for fewer, the
 * earlier ones stay (the same every time). Returns { days (DayView, to fill the open cells of),
 * emptied: [{ d, groupId, blockId, actId, name, length, why }], kept: the number kept, state:
 * the ledgers, whose keptCells are only what any build keeps (locks, fixed and recurring), so a
 * weekly-limit dot lands where the screen puts it }.
 */
export function keepWhatStillFits(model, writeDays) {
  const st = createWeekState({ ...model, mode: "full" });
  readGrid(st);
  // A cell left out only because the group could be at an overlapping block instead (busyThen)
  // may keep what it holds; the rules still keep a group in one place at a time.
  st.openSlotByKey = new Map([...st.openSlotByKey, ...st.busyThen]);
  const emptied = [];
  const over = [];
  let kept = 0;
  for (const p of activityPlacements(model)) {
    const k = st.cellKey(p.groupId, p.d, p.blockId);
    if (st.keptKeys.has(k)) {
      // Locked (or a group setup no longer has): kept as in any build.
      continue;
    }
    const why = whyNot(st, p);
    if (why && why !== KEEP_WHY.WEEKLY_MAX) {
      emptied.push({ ...p, why });
    } else {
      st.place(st.actById.get(p.actId), p.groupId, p.d, p.blockId);
      kept += 1;
      if (why) {
        over.push(p);
      }
    }
  }
  replaceLikeForLike(st, model, emptied);
  reviewOverMax(st, over, emptied);
  kept -= emptied.filter((p) => p.why === KEEP_WHY.WEEKLY_MAX).length;
  return { days: writeDays(model, st), emptied, kept, state: st };
}

/**
 * Step 10c, first: a cell emptied because its activity is gone takes an activity new to the week
 * (running, in none of the week's cells) where every rule allows it, the new ones in settings
 * order (sameness.js): a director who deletes Drama and adds Adventure Baseball sees Adventure
 * Baseball where Drama was. Each one so placed is marked with: its activity's Id.
 */
function replaceLikeForLike(st, model, emptied) {
  const inWeek = new Set(activityPlacements(model).map((p) => p.actId));
  const fresh = st.acts.filter((a) => !inWeek.has(a.id));
  if (!fresh.length) {
    return;
  }
  for (const p of emptied) {
    if (p.why !== KEEP_WHY.GONE) {
      continue;
    }
    const act = fresh.find(
      (a) =>
        a.span === p.length &&
        st.eligibility.get(a.id).has(p.groupId) &&
        whyNot(st, { ...p, actId: a.id }) === null
    );
    if (act) {
      st.place(act, p.groupId, p.d, p.blockId);
      p.with = act.id;
    }
  }
}

/** Whether a placement may change for a minimum: unlocked, one block like the activity short. */
function swappable(st, p, act) {
  const from = st.actById.get(p.actId);
  return (
    from &&
    from.id !== act.id &&
    p.length === 1 &&
    act.span === 1 &&
    !st.keptKeys.has(st.cellKey(p.groupId, p.d, p.blockId)) &&
    st.getCount(p.groupId, from.id) > from.min
  );
}

/** Puts act in place of p if every rule allows it; true when it did. */
function trySwap(st, p, act) {
  const from = st.actById.get(p.actId);
  st.unplace(from, p.groupId, p.d, p.blockId);
  const bends = check(st, act, p.groupId, p.d, p.blockId, true);
  if (bends && !bends.length) {
    st.place(act, p.groupId, p.d, p.blockId);
    return true;
  }
  st.place(from, p.groupId, p.d, p.blockId);
  return false;
}

/**
 * Step 10c's last resort: for each group still short of a weekly minimum (stillNeededBy, in
 * checkWeek's order), one cell at a time of that group changes to the activity it is short of,
 * where every rule allows it and the activity there stays at or above its own minimum: the cells
 * just refilled first (refilled: "g|d|b" keys), then any other, each in week order. Returns
 * { days, moved: [{ d, groupId, blockId, from, to, shortGroupId, shortActivityId, count }] }
 * (count: the activity's weekly minimum, for the words) or null when nothing could change.
 */
export function swapForMinimums(model, stillNeededBy, refilled, writeDays) {
  const st = createWeekState({ ...model, mode: "full" });
  readGrid(st);
  const placements = activityPlacements(model).filter((p) => {
    const act = st.actById.get(p.actId);
    if (!act || st.keptKeys.has(st.cellKey(p.groupId, p.d, p.blockId))) {
      return false;
    }
    st.place(act, p.groupId, p.d, p.blockId);
    return true;
  });
  const keyOf = (p) => `${p.groupId}|${p.d}|${p.blockId}`;
  const moved = [];
  for (const need of stillNeededBy) {
    const act = st.actById.get(need.activityId);
    if (!act) {
      continue;
    }
    const mine = placements.filter((p) => p.groupId === need.groupId);
    const order = [
      ...mine.filter((p) => refilled.has(keyOf(p))),
      ...mine.filter((p) => !refilled.has(keyOf(p)))
    ];
    let missing = need.missing;
    for (const p of order) {
      if (missing <= 0) {
        break;
      }
      if (swappable(st, p, act) && trySwap(st, p, act)) {
        moved.push({
          d: p.d,
          groupId: p.groupId,
          blockId: p.blockId,
          from: p.actId,
          to: act.id,
          shortGroupId: need.groupId,
          shortActivityId: act.id,
          count: act.min
        });
        p.actId = act.id;
        missing -= 1;
      }
    }
  }
  return moved.length ? { days: writeDays(model, st), moved } : null;
}
