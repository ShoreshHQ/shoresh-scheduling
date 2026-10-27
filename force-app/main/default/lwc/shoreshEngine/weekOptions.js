import { streamFor } from "./random";
import { earlyDates } from "./setup";
import { LENGTH, OVERLAP, RULE, lexLess } from "./weekRules";

/**
 * Step 3 of the protocol (docs/engine/protocol.md): each cell's options. Which of a group's
 * overlapping cells are the ones to fill, whether an activity may start in a cell (and, for
 * never-blank, every rule it would bend there), the early-in-the-week goal, and the stable
 * tie-break keys. Nothing here changes the week; it only answers questions about it.
 */

// Overlapping Open cells in one group's day beyond which every choice isn't weighed.
const MAX_CONTESTED = 12;

/**
 * Of a group's Open cells on a day (block indexes, in order), the ones to fill. Where blocks
 * overlap in time a group can be in only one of them. Cells overlapping a kept cell are left
 * out; among the rest, of every choice of cells that don't overlap, the one that holds the most
 * activity time given the activities' lengths (a multi-block activity needs its cells next to
 * each other), then the most room for this group's multi-block activities, then the earliest
 * ends. The same cells whatever order anything is filled in. A cell left out that turns out not
 * to be busy after all is filled at the end (finishOpen).
 */
export function fillable(st, day, open, covered, eligibleActs) {
  const peers = st.peersByDay[day.index];
  const peerIndexes = (b) =>
    (peers.get(day.blocks[b].id) || []).map((id) => day.blockIndex.get(id));
  const free = open.filter((b) => !peerIndexes(b).some((p) => covered.has(p)));
  const freeSet = new Set(free);
  const contested = free.filter((b) =>
    peerIndexes(b).some((p) => freeSet.has(p))
  );
  if (!contested.length) {
    return freeSet;
  }
  const settled = free.filter((b) => !contested.includes(b));
  if (contested.length > MAX_CONTESTED) {
    return earliestEnds(day, free, settled, peerIndexes);
  }
  const lengths = [...new Set(st.acts.map((a) => a.span))];
  const ownLong = new Set(
    eligibleActs.filter((a) => a.span > 1).map((a) => a.span)
  );
  let best = null;
  let bestRank = null;
  for (let mask = 0; mask < 1 << contested.length; mask++) {
    const picked = contested.filter((_, i) => mask & (1 << i));
    if (picked.some((b) => peerIndexes(b).some((p) => picked.includes(p)))) {
      continue;
    }
    const cells = [...settled, ...picked].sort((x, y) => x - y);
    const [held, long] = holds(cells, lengths, ownLong);
    const ends = picked.reduce((n, b) => n + (day.blocks[b].end || 0), 0);
    const rank = [-held, -long, ends, mask];
    if (!bestRank || lexLess(rank, bestRank)) {
      best = cells;
      bestRank = rank;
    }
  }
  return new Set(best);
}

/** Where there are too many overlapping cells to weigh every choice: earliest end first. */
function earliestEnds(day, free, settled, peerIndexes) {
  const chosen = new Set(settled);
  const order = free
    .filter((b) => !chosen.has(b))
    .sort(
      (x, y) =>
        day.blocks[x].end - day.blocks[y].end ||
        day.blocks[x].start - day.blocks[y].start ||
        x - y
    );
  for (const b of order) {
    if (!peerIndexes(b).some((p) => chosen.has(p))) {
      chosen.add(b);
    }
  }
  return chosen;
}

/**
 * How many of these cells (block indexes, in order) activities of these lengths can hold, each
 * run of cells next to each other tiled by lengths that fit; and of those, how many this group's
 * multi-block activities could hold. [held, long], the most held first.
 */
function holds(cells, lengths, ownLong) {
  let held = 0;
  let long = 0;
  let i = 0;
  while (i < cells.length) {
    let j = i + 1;
    while (j < cells.length && cells[j] === cells[j - 1] + 1) {
      j++;
    }
    const n = j - i;
    const best = [[0, 0]];
    for (let k = 1; k <= n; k++) {
      let pick = best[k - 1];
      for (const len of lengths) {
        if (len <= k) {
          const before = best[k - len];
          const option = [
            before[0] + len,
            before[1] + (ownLong.has(len) ? len : 0)
          ];
          if (
            option[0] > pick[0] ||
            (option[0] === pick[0] && option[1] > pick[1])
          ) {
            pick = option;
          }
        }
      }
      best.push(pick);
    }
    held += best[n][0];
    long += best[n][1];
    i = j;
  }
  return [held, long];
}

/**
 * Stable tie-break keys, drawn once per (cell, activity) from a stream seeded by the program,
 * week, option and cell: never a random sort comparator (ADR 0010).
 */
export function drawTieKeys(st, freeSlots) {
  const tieKeys = new Map();
  for (const s of freeSlots) {
    const next = streamFor(
      `${st.model.seed}|${st.days[s.dayIndex].date}|${s.groupId}|${s.blockId}`
    );
    for (const a of st.acts) {
      tieKeys.set(`${st.keyOf(s)}|${a.id}`, next());
    }
  }
  st.tieOf = (s, act) => tieKeys.get(`${st.keyOf(s)}|${act.id}`);
}

/** Why the place can't take `act` for this group at this block: [] when it can. */
function placeProblems(st, act, group, d, b) {
  const locId = act.locationId;
  if (locId == null || !st.fit.has(locId)) {
    return [];
  }
  const found = [];
  const occupants = st.placeUsage.get(`${locId}|${d}|${b}`) || [];
  const others = st.otherPlace.get(`${locId}|${d}|${b}`) || 0;
  if (occupants.length + others >= st.fit.get(locId)) {
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
function activityProblems(st, act, group, d, b) {
  const found = [];
  const users = st.activityUsers.get(`${act.id}|${d}|${b}`) || [];
  const others = st.otherActivity.get(`${act.id}|${d}|${b}`) || 0;
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
export function check(st, act, g, d, b, all) {
  st.ruleChecks++;
  const span = act.span;
  const found = [];
  const note = (code) => {
    if (!found.includes(code)) {
      found.push(code);
    }
  };
  const group = st.groups.get(g);
  if (act.max != null && st.getCount(g, act.id) >= act.max) {
    if (!all) {
      return RULE.WEEKLY_MAX;
    }
    note(RULE.WEEKLY_MAX);
  }
  if (st.onDay(g, d, act.id)) {
    if (!all) {
      return RULE.ONCE_A_DAY;
    }
    note(RULE.ONCE_A_DAY);
  }
  let problems = placeProblems(st, act, group, d, b);
  if (problems.length) {
    if (!all) {
      return problems[0];
    }
    problems.forEach(note);
  }
  const own = [b];
  if (span > 1) {
    const idx = st.blockIdx(d, b);
    for (let i = 1; i < span; i++) {
      const next = st.blocksOf(d)[idx + i];
      const nk = next ? st.cellKey(g, d, next.id) : null;
      // A multi-block activity needs its whole length in consecutive Open, at-camp cells whose
      // times don't overlap each other (two overlapping blocks are one stretch of time, not two).
      if (
        !next ||
        !st.openSlotByKey.has(nk) ||
        st.assigned.has(nk) ||
        own.some((o) => (st.peersByDay[d].get(o) || []).includes(next.id))
      ) {
        return all ? null : LENGTH;
      }
      problems = placeProblems(st, act, group, d, next.id);
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
    for (const peer of st.peersByDay[d].get(o) || []) {
      const pk = st.cellKey(g, d, peer);
      if (st.assigned.has(pk) || st.keptKeys.has(pk)) {
        return all ? null : OVERLAP;
      }
    }
  }
  for (const o of own) {
    problems = activityProblems(st, act, group, d, o);
    if (problems.length) {
      if (!all) {
        return problems[0];
      }
      problems.forEach(note);
    }
  }
  if (all && !st.eligibility.get(act.id).has(g)) {
    note(RULE.ELIGIBILITY);
  }
  return all ? found : null;
}

export const blockedBy = (st, act, g, d, b) => check(st, act, g, d, b, false);
export const canPlace = (st, act, g, d, b) =>
  check(st, act, g, d, b, false) === null;

/**
 * Early in the week (EarlyWeekCount by EarlyWeekByDay): the day indexes that count, for each
 * goal and group: the first N days of this week's run that the group is at camp (setup.js
 * earlyDates). Special days are already out of the week; a day the group isn't in doesn't count.
 */
export function readEarlyGoals(st) {
  st.earlyDays = new Map();
  for (const act of st.acts) {
    if (act.early) {
      for (const g of st.model.groupIds) {
        const own = st.days.filter((day) => day.tokens.has(g));
        const counts = earlyDates(
          own.map((day) => day.date),
          act.early.byDay,
          st.model.firstDay
        );
        st.earlyDays.set(
          `${act.id}|${g}`,
          new Set(
            own.filter((day) => counts.has(day.date)).map((day) => day.index)
          )
        );
      }
    }
  }
}

/** -1 while a group still needs it early and this day counts, 1 once that day has passed. */
export function earlyScore(st, act, g, d) {
  const days = act.early ? st.earlyDays.get(`${act.id}|${g}`) : null;
  if (!days || !days.size) {
    return 0;
  }
  // Only sessions on the days that count: a locked Friday session doesn't meet a Tuesday goal.
  let early = 0;
  for (const day of days) {
    early += st.dailyUsage.get(`${g}|${day}|${act.id}`) || 0;
  }
  if (early >= act.early.count) {
    return 0;
  }
  return days.has(d) ? -1 : 1;
}
