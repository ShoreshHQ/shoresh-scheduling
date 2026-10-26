import { NOW, nowOf, tell } from "./progress";
import { check } from "./weekOptions";
import {
  BUDGET,
  FULL,
  LENGTH,
  MIN_COST,
  NONE_FOR,
  OVERLAP,
  PREFERENCES,
  PRIORITY_RANK,
  SEARCHED,
  lexLess
} from "./weekRules";

/**
 * Step 8 of the protocol (docs/engine/protocol.md), part 2 (rules 8.10-8.18): search before
 * giving up. Runs after never-blank (part 1, the desktop's three repairs, is weekRepair.js), on every cell still Open, and ends with each Open cell filled, proven unfillable
 * (with the proof's reason), or marked as left when the search's work ran out (BUDGET: never
 * silent, never called a proof).
 *
 * A day at a time: every limit that can't bend (once a day, groups at once, groups that fit, same
 * division, a multi-block activity's length, overlapping blocks) is about one day. Days touch only
 * through weekly counts: the maximum bends (a preference) and the minimums, which a move keeps
 * (it never leaves more groups short, or more sessions short, than before). So the most a day can
 * hold is the day's own question, and a proof is about a whole day: a gap is unfillable when the
 * day already holds the most it can, never because one group's day, or one time block, is full
 * on its own (the rest of the day could move).
 *
 * For each day, cheapest first:
 *   1. Cells nothing can ever go in: kept time overlaps them, nothing is set up for the group, or
 *      no activity's length fits (OVERLAP, NONE_FOR, LENGTH).
 *   2. The day already holds as much as a limit on the whole day allows (each group's day on its
 *      own, added up; or each time block's seats, added up): proven, no search needed.
 *   3. For each other Open cell: an exact search of a small region (the group's day and that
 *      time block for every group), everything else held still.
 *   4. The whole day, exactly: branch and bound over its cells, bounded by groups, time blocks
 *      and a flow from groups to activities to places. Ended: proven (SEARCHED, said as FULL when
 *      nothing allowed fits the cell as the week stands), or a fuller day exists only by leaving a
 *      minimum short (MIN_COST). Out of work: BUDGET.
 * Searches 3 and 4 want more filled cells first, then fewer weekly-maximum bends, then the fewest
 * cells changed (so priority-first placement and spread are kept wherever filling allows), and
 * try each cell's current activity first. Then a second pass rearranges days that can leave fewer
 * groups short of a minimum with as many cells filled, never taking a minimum a group meets.
 * Locks, hand edits, fixed and set-time items, and any placement that reaches a kept cell never
 * move. Work is counted in search steps and cells looked at, never time, so the same inputs give
 * the same week on any machine.
 */

// Work, counted in search steps (each step decides one cell of the exact search): a region's
// search, a whole day's, the polish after a fuller day is found, the minimums pass per day, and
// the whole build's. Calibrated in docs/engine/protocol.md, "Step 8 budget".
const REGION_WORK = 2000;
const DAY_WORK = 60000;
const POLISH_WORK = 2000;
// The first try at a fuller day, in the order that finds the fills leaving fewest short: 99% of
// fuller days are found within this; past it, the proving order takes over.
const FIND_WORK = 20000;
const MINIMUM_WORK = 5000;
const TOTAL_WORK = 2000000;
// And the ceiling on time, whatever the camp's size: cells looked at over the whole build. About
// 400,000 a second in Node (docs/engine/protocol.md, "Step 8 budget"), so a week built twice
// stays well under the 3-minute ceiling in a browser.
const LOOK_LIMIT = 15000000;
// Steps between pauses inside one search, so the screen keeps the tab responsive.
const PAUSE_EVERY = 200;
// Steps a group's day may take to be measured on its own before that proof is skipped.
const GROUP_DAY_WORK = 20000;

const EMPTY = null;

// The whole run's work (weekState.js runWorkLeft): rule checks, and cells looked at here.
const overRun = (st) =>
  st.ruleChecks + LOOK_LIMIT - st.searchLooksLeft >= st.runWorkLeft;

const outOfWork = (st) =>
  st.searchWorkLeft <= 0 || st.searchLooksLeft <= 0 || overRun(st);

/** Prepares the search: every free cell is one it may fill, and its work budget. */
function startSearch(st) {
  st.searchWorkLeft = TOTAL_WORK;
  st.searchLooksLeft = LOOK_LIMIT;
  st.searchMoves = [];
  // What the search found for each day it could not fill further (SEARCHED, MIN_COST or
  // BUDGET): a proof is about the whole day, so it holds for whichever of its cells end Open.
  st.dayWhy = new Map();
  // Each day's most, without search (dayHoldsMost), once worked out.
  st.dayLimit = new Map();
  // For a MIN_COST day: the group and activity a fuller day would leave short.
  st.dayCost = new Map();
  // Every free cell, the ones left out for an overlapping cell included, is the search's to fill.
  for (const s of st.busyThen.values()) {
    const k = st.keyOf(s);
    if (!st.openSlotByKey.has(k)) {
      st.openSlots.push(s);
      st.openSlotByKey.set(k, s);
      st.emptyCells++;
    }
  }
  st.busyThen.clear();
  st.freeByDay = st.days.map(() => []);
  st.freeSlotByKey = new Map();
  for (const s of st.freeSlots) {
    st.freeByDay[s.dayIndex].push(s);
    st.freeSlotByKey.set(st.keyOf(s), s);
  }
  st.groupRank = new Map(st.model.groupIds.map((g, i) => [g, i]));
  // Activities each group holds in a kept cell, by day (once a day counts them).
  st.keptActs = new Map();
  for (const [k, { item }] of st.keptCells) {
    if (item.kind === "A") {
      const [g, d] = st.splitKey(k);
      const gd = `${g}|${d}`;
      if (!st.keptActs.has(gd)) {
        st.keptActs.set(gd, new Set());
      }
      st.keptActs.get(gd).add(item.id);
    }
  }
}

/** The bends placing `act` here would need: null when a limit forbids it. */
function allowed(st, act, g, d, b) {
  const bends = check(st, act, g, d, b, true);
  if (bends === null || bends.some((r) => !PREFERENCES.includes(r))) {
    return null;
  }
  return bends;
}

const overlapsKept = (st, g, d, b) =>
  (st.peersByDay[d].get(b) || []).some((p) =>
    st.keptKeys.has(st.cellKey(g, d, p))
  );

const busyAt = (st, g, d, b) =>
  (st.peersByDay[d].get(b) || []).some((p) => {
    const pk = st.cellKey(g, d, p);
    return st.assigned.has(pk) || st.keptKeys.has(pk);
  });

/** The head cell of the placement covering k (k itself unless it is a tail). */
function headOf(st, k) {
  if (!st.spanTails.has(k)) {
    return k;
  }
  const [g, d, b] = st.splitKey(k);
  for (let i = st.blockIdx(d, b) - 1; i >= 0; i--) {
    const hk = st.cellKey(g, d, st.blocksOf(d)[i].id);
    if (!st.spanTails.has(hk)) {
      return hk;
    }
  }
  return k;
}

function cellsOfHead(st, hk) {
  const [g, d, b] = st.splitKey(hk);
  const act = st.actById.get(st.assigned.get(hk));
  return st.ownBlocks(act, g, d, b).map((id) => st.cellKey(g, d, id));
}

// ── Proofs that need no search ─────────────────────────────────────────────

/**
 * The most cells a group's day can hold on its own, other groups aside: each activity it is set
 * up for and doesn't already have that day in a kept cell, at most once, at its full length, in
 * free cells whose times don't overlap. null when that takes too long to be sure. Its steps are
 * charged to the build's work.
 */
function groupDayMost(st, g, d) {
  const blocks = st.blocksOf(d);
  const free = new Set(
    st.freeByDay[d]
      .filter((s) => s.groupId === g && !overlapsKept(st, g, d, s.blockId))
      .map((s) => s.blockId)
  );
  const cells = blocks.filter((x) => free.has(x.id)).map((x) => x.id);
  if (!cells.length) {
    return 0;
  }
  const kept = st.keptActs.get(`${g}|${d}`) || new Set();
  const acts = st.freeSlotByKey
    .get(st.cellKey(g, d, cells[0]))
    .eligibleActs.filter((a) => !kept.has(a.id));
  const taken = new Set();
  const used = new Set();
  const clashes = (id) =>
    taken.has(id) || (st.peersByDay[d].get(id) || []).some((p) => taken.has(p));
  let best = 0;
  let work = 0;
  const go = (i, filled, room) => {
    if (++work > GROUP_DAY_WORK) {
      throw new Error("budget");
    }
    if (filled > best) {
      best = filled;
    }
    if (
      i === cells.length ||
      filled + Math.min(cells.length - i, room) <= best
    ) {
      return;
    }
    const b = cells[i];
    if (!clashes(b)) {
      const idx = st.blockIdx(d, b);
      for (const act of acts) {
        if (used.has(act.id)) {
          continue;
        }
        const own = [];
        for (let k = 0; k < act.span; k++) {
          const x = blocks[idx + k];
          if (!x || !free.has(x.id) || clashes(x.id)) {
            break;
          }
          if (own.some((o) => (st.peersByDay[d].get(o) || []).includes(x.id))) {
            break;
          }
          own.push(x.id);
        }
        if (own.length !== act.span) {
          continue;
        }
        used.add(act.id);
        own.forEach((x) => taken.add(x));
        go(i + 1, filled + act.span, room - act.span);
        own.forEach((x) => taken.delete(x));
        used.delete(act.id);
      }
    }
    go(i + 1, filled, room);
  };
  try {
    go(
      0,
      0,
      acts.reduce((n, a) => n + a.span, 0)
    );
  } catch {
    best = null;
  }
  st.searchWorkLeft -= work;
  st.searchLooksLeft -= work;
  return best;
}

/** Most units from s to t (unit-step augmenting paths; the graphs here are a few dozen nodes). */
function maxFlow(n, edges, s, t) {
  const adj = Array.from({ length: n }, () => []);
  const to = [];
  const cap = [];
  for (const [u, v, c] of edges) {
    adj[u].push(to.length);
    to.push(v);
    cap.push(c);
    adj[v].push(to.length);
    to.push(u);
    cap.push(0);
  }
  let total = 0;
  for (;;) {
    const seen = new Array(n).fill(false);
    const push = (u) => {
      if (u === t) {
        return true;
      }
      seen[u] = true;
      for (const e of adj[u]) {
        if (cap[e] > 0 && !seen[to[e]] && push(to[e])) {
          cap[e]--;
          cap[e ^ 1]++;
          return true;
        }
      }
      return false;
    };
    if (!push(s)) {
      return total;
    }
    total++;
  }
}

/**
 * The most groups a time block can hold, by a flow: each group with a free cell then to an
 * activity it is set up for, each activity up to its groups at once, each place up to its groups
 * that fit, after kept cells and other programs. Once a day and same division are left out, so
 * this is never less than the truth.
 */
function periodMost(st, d, b) {
  const here = st.freeByDay[d].filter(
    (s) => s.blockId === b && !overlapsKept(st, s.groupId, d, b)
  );
  const keptIn = (list) =>
    (list || []).filter((u) => st.keptKeys.has(st.cellKey(u.groupId, d, b)))
      .length;
  const many = here.length;
  // Nodes: 0 source, 1 sink, then groups, activities, places.
  const ids = new Map();
  const node = (k) => {
    if (!ids.has(k)) {
      ids.set(k, ids.size + 2);
    }
    return ids.get(k);
  };
  const edges = [];
  for (const act of st.acts) {
    const left =
      act.atOnce == null
        ? many
        : act.atOnce -
          (st.otherActivity.get(`${act.id}|${d}|${b}`) || 0) -
          keptIn(st.activityUsers.get(`${act.id}|${d}|${b}`));
    const loc = act.locationId;
    const out = loc != null && st.fit.has(loc) ? node(`p|${loc}`) : 1;
    edges.push([node(`a|${act.id}`), out, Math.max(0, Math.min(left, many))]);
  }
  for (const loc of new Set(st.acts.map((a) => a.locationId))) {
    if (loc != null && st.fit.has(loc)) {
      const left =
        st.fit.get(loc) -
        (st.otherPlace.get(`${loc}|${d}|${b}`) || 0) -
        keptIn(st.placeUsage.get(`${loc}|${d}|${b}`));
      edges.push([node(`p|${loc}`), 1, Math.max(0, left)]);
    }
  }
  for (const s of here) {
    const g = node(`g|${s.groupId}`);
    edges.push([0, g, 1]);
    for (const act of s.eligibleActs) {
      edges.push([g, node(`a|${act.id}`), 1]);
    }
  }
  return maxFlow(ids.size + 2, edges, 0, 1);
}

/**
 * How far these groups are from their weekly minimums: { count: [pairs short, sessions short],
 * short: the "group|activity" pairs short }. A move never takes a group below a minimum it meets,
 * and never makes either count larger; a group already short may trade a short session for
 * another group's.
 */
function shortfall(st, groups) {
  let pairs = 0;
  let sessions = 0;
  const short = new Map();
  for (const g of groups) {
    for (const act of st.acts) {
      const missing = act.min - st.getCount(g, act.id);
      if (missing > 0 && st.eligibility.get(act.id).has(g)) {
        pairs++;
        sessions += missing;
        short.set(`${g}|${act.id}`, missing);
      }
    }
  }
  return { count: [pairs, sessions], short };
}
/** The first group and activity (in the build's order) further short now than before. */
function costOf(now, before) {
  for (const [k, missing] of now.short) {
    if (missing > (before.short.get(k) || 0)) {
      const [groupId, activityId] = k.split("|");
      return { groupId, activityId };
    }
  }
  return null;
}
const worseShort = (now, before) =>
  now.count[0] > before.count[0] || now.count[1] > before.count[1];
// A group newly short of a minimum it met.
const lostMinimum = (now, before) =>
  [...now.short.keys()].some((k) => !before.short.has(k));

/**
 * The most sessions of one activity a day can hold: each `span` blocks long, starting only at
 * `starts` (block indexes), at most caps[t] at once in block t, and at most `most` in all. Exact
 * (every count of sessions at each start is weighed), so it is never more than the truth for the
 * week as it stands; long activities only (a one-block activity's answer is just the caps' sum).
 */
function sessionsMost(span, caps, starts, most) {
  if (span === 1) {
    let total = 0;
    starts.forEach((t) => {
      total += caps[t];
    });
    return Math.min(most, total);
  }
  const T = caps.length;
  const memo = new Map();
  // running: sessions started at each of the last span-1 blocks, oldest first.
  const go = (t, running, used) => {
    if (t === T || used >= most) {
      return 0;
    }
    const key = `${t}|${running.join(",")}|${used}`;
    if (memo.has(key)) {
      return memo.get(key);
    }
    const active = running.reduce((n, x) => n + x, 0);
    let best = 0;
    const room = starts.has(t) && t + span <= T ? caps[t] - active : 0;
    for (let n = 0; n <= Math.min(room, most - used); n++) {
      // Each block a new session covers must have room for it and the ones still running.
      let fits = true;
      for (let k = 1; k < span && fits; k++) {
        const still = running.slice(k).reduce((x, y) => x + y, 0) + n;
        fits = still <= caps[t + k];
      }
      if (!fits) {
        break;
      }
      const next = [...running.slice(1), n];
      best = Math.max(best, n + go(t + 1, next, used + n));
    }
    memo.set(key, best);
    return best;
  };
  return go(0, new Array(span - 1).fill(0), 0);
}

// ── Exact search over a set of cells ───────────────────────────────────────

/**
 * Re-solves `keys` (free cells of day d) exactly, everything else held still: the arrangement
 * with more cells filled than now, then fewer weekly-maximum bends, then fewest cells changed.
 * guard: a move may not leave more groups, or more sessions, short of a weekly minimum. Puts the
 * best arrangement found in (or the original back) and returns { improved, exhausted, moves }.
 * apply false: only asks whether one exists; the week is left as it was. A generator: it pauses
 * every PAUSE_EVERY steps, yielding `at` (how far the build is) for the screen. minimums: the second
 * pass (as many cells, fewer short, no minimum met given up). split: decide a multi-block
 * activity one start at a time (it starts here, or not), the order that proves days soonest.
 * spansFirst: branch first where a
 * multi-block activity could start.
 */
function* solve(
  st,
  d,
  keys,
  {
    guard,
    budget,
    at,
    apply = true,
    minimums = false,
    spansFirst = true,
    split = false
  }
) {
  // Placements that reach outside the cells searched stay where they are.
  const inside = new Set(keys);
  const heads = new Set();
  const fixed = new Set();
  for (const k of keys) {
    if (!st.assigned.has(k)) {
      continue;
    }
    const hk = headOf(st, k);
    const cells = cellsOfHead(st, hk);
    if (cells.every((x) => inside.has(x) && !st.keptKeys.has(x))) {
      heads.add(hk);
    } else {
      cells.forEach((x) => fixed.add(x));
    }
  }
  const vars = keys
    .filter((k) => !fixed.has(k))
    .map((k) => st.freeSlotByKey.get(k))
    .sort(
      (x, y) =>
        st.blockIdx(d, x.blockId) - st.blockIdx(d, y.blockId) ||
        st.groupRank.get(x.groupId) - st.groupRank.get(y.groupId)
    );
  const isVar = new Set(vars.map((s) => st.keyOf(s)));
  const was = new Map(
    vars.map((s) => [st.keyOf(s), st.assigned.get(st.keyOf(s)) || EMPTY])
  );
  const wasHeads = [...heads].map((hk) => [
    st.actById.get(st.assigned.get(hk)),
    st.freeSlotByKey.get(hk)
  ]);
  const filledBefore = vars.filter((s) => st.assigned.has(st.keyOf(s))).length;
  const groupsIn = [...new Set(vars.map((s) => s.groupId))];
  const shortBefore = shortfall(st, groupsIn);
  for (const [act, s] of wasHeads) {
    st.unplace(act, s.groupId, s.dayIndex, s.blockId);
  }

  // Cells decided Open on this branch (nothing can reach them any more), and cells where nothing
  // may start (a longer activity starting earlier may still cover them).
  const emptied = new Set();
  const noStart = new Set();
  // A multi-block activity ruled out of starting in a cell on this branch (cell -> activity ids);
  // the cell stays open to everything else.
  const banned = new Map();
  // Work done: steps (each a look() at the undecided cells).
  let work = 0;
  let best = null;
  let exhausted = true;
  let filled = 0;
  let bends = 0;
  let changes = 0;
  // Filling: more cells than now. Minimums (the second pass): as many cells, fewer short.
  const need = () => {
    if (minimums) {
      return filledBefore;
    }
    return best ? best.filled : filledBefore + 1;
  };
  // Among equally full days a filling search also weighs minimums (below), which can still get
  // better further down a branch, so only the bare question (no guard) prunes on bends and
  // changes.
  const pruned = (ub) =>
    ub < need() ||
    (!minimums &&
      !guard &&
      best &&
      ub === best.filled &&
      !lexLess([bends, changes], [best.bends, best.changes]));

  // What a cell's options depend on, counted up on every change: its group's day (once a day,
  // overlaps, weekly counts, cells decided) and who is where in the blocks it could cover. A
  // cell's options are worked out again only when one of those has moved.
  const groupTurn = new Map();
  const blockTurn = new Map();
  const turn = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  const longest = Math.max(...st.acts.map((a) => a.span));
  const known = new Map();
  function stamp(s) {
    const idx = st.blockIdx(d, s.blockId);
    const parts = [groupTurn.get(s.groupId) || 0];
    for (let k = 0; k < longest; k++) {
      const x = st.blocksOf(d)[idx + k];
      if (x) {
        parts.push(blockTurn.get(x.id) || 0);
      }
    }
    return parts.join(",");
  }
  function moved(act, g, b) {
    turn(groupTurn, g);
    st.ownBlocks(act, g, d, b).forEach((id) => turn(blockTurn, id));
  }
  function optionsAt(s) {
    const k = st.keyOf(s);
    const now = stamp(s);
    const seen = known.get(k);
    if (seen && seen.stamp === now) {
      return seen.opts;
    }
    const opts = workOutOptions(s);
    known.set(k, { stamp: now, opts });
    return opts;
  }

  /** The activities that may start in cell s now, every cell they cover being one searched and still undecided. */
  function workOutOptions(s) {
    const opts = [];
    if (noStart.has(st.keyOf(s))) {
      return opts;
    }
    const out = banned.get(st.keyOf(s));
    for (const act of s.eligibleActs) {
      if (out && out.has(act.id)) {
        continue;
      }
      const bend = allowed(st, act, s.groupId, d, s.blockId);
      if (!bend) {
        continue;
      }
      const own = st.ownBlocks(act, s.groupId, d, s.blockId);
      if (
        own.some((id) => {
          const c = st.cellKey(s.groupId, d, id);
          return !isVar.has(c) || emptied.has(c);
        })
      ) {
        continue;
      }
      opts.push({ act, bend: bend.length ? 1 : 0 });
    }
    return opts;
  }

  /** Groups `act` can still take at block b, and groups place `loc` can still hold then. */
  function seatLeft(act, b) {
    if (act.atOnce == null) {
      return Infinity;
    }
    return (
      act.atOnce -
      (st.activityUsers.get(`${act.id}|${d}|${b}`) || []).length -
      (st.otherActivity.get(`${act.id}|${d}|${b}`) || 0)
    );
  }
  const fitLeft = (loc, b) =>
    st.fit.get(loc) -
    (st.placeUsage.get(`${loc}|${d}|${b}`) || []).length -
    (st.otherPlace.get(`${loc}|${d}|${b}`) || 0);
  function sharedPlace(act) {
    return act.locationId != null && st.fit.has(act.locationId)
      ? act.locationId
      : null;
  }

  /** Seats left at block b for these activities: groups at once, then the places they share. */
  function seatsAt(b, acts) {
    let seats = 0;
    const byPlace = new Map();
    for (const act of acts) {
      const loc = sharedPlace(act);
      if (loc != null) {
        byPlace.set(loc, (byPlace.get(loc) || 0) + seatLeft(act, b));
      } else {
        seats += seatLeft(act, b);
      }
    }
    for (const [loc, want] of byPlace) {
      seats += Math.min(want, fitLeft(loc, b));
    }
    return seats;
  }

  /**
   * The most more cells the day can fill, by a flow from groups to activities to places: each
   * group no more than its cells left, each activity once per group (its length in cells), each
   * activity no more whole sessions than its seats left over the day allow, and each place's
   * activities together no more than the place holds. Never less than the truth.
   */
  function byFlow(byBlock, byGroup, startsOf) {
    const ids = new Map();
    const node = (k) => {
      if (!ids.has(k)) {
        ids.set(k, ids.size + 2);
      }
      return ids.get(k);
    };
    const edges = [];
    const groupsWith = new Map();
    for (const [g, x] of byGroup) {
      edges.push([0, node(`g|${g}`), x.cells]);
      for (const act of x.acts) {
        edges.push([node(`g|${g}`), node(`a|${act.id}`), act.span]);
        groupsWith.set(act, (groupsWith.get(act) || 0) + 1);
      }
    }
    const places = new Set();
    for (const [act, groups] of groupsWith) {
      const caps = st.blocksOf(d).map((x) => {
        const there = byBlock.get(x.id);
        return there && there.acts.has(act)
          ? Math.max(0, Math.min(seatLeft(act, x.id), there.cells))
          : 0;
      });
      const cells =
        act.span * sessionsMost(act.span, caps, startsOf.get(act), groups);
      const loc = sharedPlace(act);
      edges.push([
        node(`a|${act.id}`),
        loc == null ? 1 : node(`p|${loc}`),
        cells
      ]);
      if (loc != null) {
        places.add(loc);
      }
    }
    for (const loc of places) {
      let room = 0;
      for (const [b, x] of byBlock) {
        if ([...x.acts].some((a) => sharedPlace(a) === loc)) {
          room += Math.min(Math.max(0, fitLeft(loc, b)), x.cells);
        }
      }
      edges.push([node(`p|${loc}`), 1, room]);
    }
    return maxFlow(ids.size + 2, edges, 0, 1);
  }

  /**
   * Looks at every undecided cell: its options, which cells can still be reached (a cell with no
   * option of its own may be the tail of a longer activity), the most more cells could be filled,
   * and the cell to branch on. Cells nothing can reach are decided Open (listed, to undo).
   */
  function look() {
    const open = vars.filter(
      (s) => !st.assigned.has(st.keyOf(s)) && !emptied.has(st.keyOf(s))
    );
    work++;
    st.searchLooksLeft -= open.length;
    const optsOf = new Map();
    const reach = new Set();
    for (const s of open) {
      const opts = optionsAt(s);
      optsOf.set(s, opts);
      for (const o of opts) {
        st.ownBlocks(o.act, s.groupId, d, s.blockId).forEach((id) =>
          reach.add(st.cellKey(s.groupId, d, id))
        );
      }
    }
    const forced = open.filter((s) => !reach.has(st.keyOf(s)));
    const live = open.filter((s) => reach.has(st.keyOf(s)));
    // Bounds: by group (once a day: each activity at most once) and by time block (seats).
    const byGroup = new Map();
    const byBlock = new Map();
    for (const s of live) {
      const g = byGroup.get(s.groupId) || { cells: 0, acts: new Set() };
      g.cells++;
      optsOf.get(s).forEach((o) => g.acts.add(o.act));
      byGroup.set(s.groupId, g);
      const p = byBlock.get(s.blockId) || { cells: 0, acts: new Set() };
      p.cells++;
      byBlock.set(s.blockId, p);
    }
    for (const s of live) {
      for (const o of optsOf.get(s)) {
        st.ownBlocks(o.act, s.groupId, d, s.blockId).forEach((id) => {
          const p = byBlock.get(id);
          if (p) {
            p.acts.add(o.act);
          }
        });
      }
    }
    let groupMost = 0;
    for (const x of byGroup.values()) {
      let span = 0;
      x.acts.forEach((a) => {
        span += a.span;
      });
      groupMost += Math.min(x.cells, span);
    }
    let blockMost = 0;
    for (const [b, x] of byBlock) {
      blockMost += Math.min(x.cells, seatsAt(b, x.acts));
    }
    let ub = Math.min(groupMost, blockMost);
    // The per-activity bound costs more: worked out only when the others leave the branch open.
    if (!pruned(filled + ub)) {
      const startsOf = new Map();
      for (const s of live) {
        for (const o of optsOf.get(s)) {
          if (!startsOf.has(o.act)) {
            startsOf.set(o.act, new Set());
          }
          startsOf.get(o.act).add(st.blockIdx(d, s.blockId));
        }
      }
      ub = Math.min(ub, byFlow(byBlock, byGroup, startsOf));
    }
    // Decide multi-block activities first, one start at a time: does it start in this cell or
    // not (the bounds count its cells as if they could be shared out between groups, so settling
    // who gets it is what tightens them). Then the cell with fewest options. Either way every
    // arrangement stays reachable; this order only reaches the answer sooner.
    const rank = (x) => [
      spansFirst && optsOf.get(x).some((o) => o.act.span > 1) ? 0 : 1,
      optsOf.get(x).length
    ];
    let pick = null;
    for (const s of live) {
      if (optsOf.get(s).length && (!pick || lexLess(rank(s), rank(pick)))) {
        pick = s;
      }
    }
    const span =
      pick && spansFirst && split
        ? optsOf.get(pick).find((o) => o.act.span > 1) || null
        : null;
    return { forced, ub, pick, span, opts: pick ? optsOf.get(pick) : [] };
  }

  // Of equally full days: fewer groups short of a minimum, fewer sessions short, fewer weekly-max
  // bends, then fewest cells changed (missed sessions matter most, Greg).
  function rankNow() {
    return guard
      ? [...shortfall(st, groupsIn).count, bends, changes]
      : [bends, changes];
  }

  function leaf() {
    if (minimums) {
      const short = filled >= need() ? shortfall(st, groupsIn) : null;
      if (
        short &&
        !worseShort(short, shortBefore) &&
        !lostMinimum(short, shortBefore) &&
        lexLess(short.count, shortBefore.count) &&
        (!best ||
          lexLess(
            [...short.count, bends, changes],
            [...best.short.count, best.bends, best.changes]
          ))
      ) {
        best = {
          short,
          filled,
          bends,
          changes,
          placed: vars
            .filter(
              (s) =>
                st.assigned.has(st.keyOf(s)) && !st.spanTails.has(st.keyOf(s))
            )
            .map((s) => [st.actById.get(st.assigned.get(st.keyOf(s))), s])
        };
      }
      return;
    }
    if (
      filled >= need() &&
      (!guard || !worseShort(shortfall(st, groupsIn), shortBefore)) &&
      (!best ||
        filled > best.filled ||
        (filled === best.filled && lexLess(rankNow(), best.rank)))
    ) {
      best = {
        filled,
        bends,
        changes,
        rank: rankNow(),
        // Without the guard: who the fuller day would leave short, and of what.
        cost: guard ? null : costOf(shortfall(st, groupsIn), shortBefore),
        placed: vars
          .filter(
            (s) =>
              st.assigned.has(st.keyOf(s)) && !st.spanTails.has(st.keyOf(s))
          )
          .map((s) => [st.actById.get(st.assigned.get(st.keyOf(s))), s])
      };
    }
  }

  // Decides cells forced Open; returns what to undo.
  function decideOpen(cells) {
    let changed = 0;
    for (const s of cells) {
      emptied.add(st.keyOf(s));
      turn(groupTurn, s.groupId);
      changed += was.get(st.keyOf(s)) === EMPTY ? 0 : 1;
    }
    changes += changed;
    return changed;
  }
  function undoOpen(cells, changed) {
    cells.forEach((s) => {
      emptied.delete(st.keyOf(s));
      turn(groupTurn, s.groupId);
    });
    changes -= changed;
  }

  /** A frame: the cell branched on, its options (EMPTY last), the one it holds, the cells it forced Open. */
  function enter() {
    const v = look();
    const changed = decideOpen(v.forced);
    const f = { forced: v.forced, forcedChanged: changed, at: -1, opts: [] };
    if (pruned(filled + v.ub)) {
      return f;
    }
    if (!v.pick) {
      leaf();
      return f;
    }
    const s = v.pick;
    const before = was.get(st.keyOf(s));
    f.s = s;
    if (v.span) {
      // It starts here, or it doesn't (and the cell stays open to everything else).
      f.opts = [v.span, { act: EMPTY, bend: 0, ban: v.span.act }];
      return f;
    }
    f.opts = v.opts.sort(
      (x, y) =>
        (x.act.id === before ? 0 : 1) - (y.act.id === before ? 0 : 1) ||
        x.bend - y.bend ||
        PRIORITY_RANK[x.act.priority] - PRIORITY_RANK[y.act.priority] ||
        st.getCount(s.groupId, x.act.id) - st.getCount(s.groupId, y.act.id) ||
        st.tieOf(s, x.act) - st.tieOf(s, y.act)
    );
    f.opts.push({ act: EMPTY, bend: 0 });
    return f;
  }
  function put(f) {
    const s = f.s;
    const o = f.opts[f.at];
    f.cells = [];
    f.changed = 0;
    if (o.act) {
      st.place(o.act, s.groupId, d, s.blockId);
      moved(o.act, s.groupId, s.blockId);
      f.cells = st
        .ownBlocks(o.act, s.groupId, d, s.blockId)
        .map((id) => st.cellKey(s.groupId, d, id));
      for (const c of f.cells) {
        f.changed += was.get(c) === o.act.id ? 0 : 1;
      }
    } else if (o.ban) {
      const k = st.keyOf(s);
      banned.set(k, new Set([...(banned.get(k) || []), o.ban.id]));
      turn(groupTurn, s.groupId);
    } else {
      // Nothing starts here; whether it ends Open is decided once nothing can reach it.
      noStart.add(st.keyOf(s));
      turn(groupTurn, s.groupId);
    }
    filled += f.cells.length;
    bends += o.bend;
    changes += f.changed;
  }
  function take(f) {
    const s = f.s;
    const o = f.opts[f.at];
    if (o.act) {
      st.unplace(o.act, s.groupId, d, s.blockId);
      moved(o.act, s.groupId, s.blockId);
    } else if (o.ban) {
      const k = st.keyOf(s);
      banned.get(k).delete(o.ban.id);
      turn(groupTurn, s.groupId);
    } else {
      noStart.delete(st.keyOf(s));
      turn(groupTurn, s.groupId);
    }
    filled -= f.cells.length;
    bends -= o.bend;
    changes -= f.changed;
  }

  const stack = [enter()];
  // Once a fuller arrangement is found, a few more steps look for one that changes less.
  let foundAt = null;
  let pausedAt = 0;
  while (stack.length) {
    // The screen gets the tab back now and then, even inside one day's search: pausing here
    // changes nothing (nothing else touches the week until the search goes on).
    if (work - pausedAt >= PAUSE_EVERY) {
      pausedAt = work;
      yield at;
    }
    if (best && foundAt == null) {
      foundAt = work;
    }
    if (
      work > budget ||
      st.searchLooksLeft <= 0 ||
      overRun(st) ||
      (foundAt != null && work > foundAt + POLISH_WORK)
    ) {
      exhausted = false;
      break;
    }
    const top = stack[stack.length - 1];
    if (top.holding) {
      take(top);
      top.holding = false;
    }
    top.at++;
    if (top.at >= top.opts.length) {
      undoOpen(top.forced, top.forcedChanged);
      stack.pop();
      continue;
    }
    put(top);
    top.holding = true;
    stack.push(enter());
  }
  // Unwind whatever the search still holds.
  while (stack.length) {
    const top = stack.pop();
    if (top.holding) {
      take(top);
    }
    undoOpen(top.forced, top.forcedChanged);
  }
  st.searchWorkLeft -= work;

  const moves = [];
  const result = best && apply ? best.placed : wasHeads;
  for (const [act, s] of result) {
    st.place(act, s.groupId, s.dayIndex, s.blockId);
  }
  if (best && apply) {
    for (const s of vars) {
      const k = st.keyOf(s);
      const now = st.assigned.get(k) || EMPTY;
      if (now !== was.get(k)) {
        moves.push({ key: k, from: was.get(k), to: now });
      }
    }
  }
  return {
    improved: Boolean(best),
    exhausted,
    moves,
    cost: best ? best.cost : null
  };
}

// ── The search, day by day ─────────────────────────────────────────────────

/**
 * Whether day d already holds the most it can, proven without search: as many cells filled as
 * the smaller of two limits on the whole day, each group's day on its own (groupDayMost) added
 * up, or each time block on its own (periodMost) added up. Only the whole day can be proven this
 * way: a group's day, or a time block, being full on its own does not make any one of its Open
 * cells unfillable, since the rest of the day may move.
 */
function* dayHoldsMost(st, d, at) {
  const free = st.freeByDay[d];
  const filled = free.filter((s) => st.assigned.has(st.keyOf(s))).length;
  // Both limits read only what never moves (free cells, kept cells, other programs), so each
  // day's is worked out once, pausing between groups, its work charged to the build's.
  if (!st.dayLimit.has(d)) {
    let byGroup = 0;
    for (const g of new Set(free.map((s) => s.groupId))) {
      if (outOfWork(st)) {
        byGroup = Infinity;
        break;
      }
      yield at;
      const most = groupDayMost(st, g, d);
      if (most == null) {
        byGroup = Infinity;
        break;
      }
      byGroup += most;
    }
    let byBlock = 0;
    for (const b of new Set(free.map((s) => s.blockId))) {
      byBlock += periodMost(st, d, b);
      st.searchWorkLeft--;
      st.searchLooksLeft -= free.length;
    }
    st.dayLimit.set(d, Math.min(byGroup, byBlock));
  }
  return filled >= st.dayLimit.get(d);
}

/** A cell nothing can go in on its own: kept time overlaps it, nothing is for the group, no length fits. */
function plainlyOpen(st, s) {
  return (
    overlapsKept(st, s.groupId, s.dayIndex, s.blockId) ||
    !s.eligibleActs.length ||
    !fitsAlone(st, s)
  );
}

/** Whether any activity set up for the group fits this cell's gap at its full length, alone. */
function fitsAlone(st, s) {
  const { groupId: g, dayIndex: d, blockId: b } = s;
  const blocks = st.blocksOf(d);
  const idx = st.blockIdx(d, b);
  return s.eligibleActs.some((act) => {
    const own = [];
    for (let k = 0; k < act.span; k++) {
      const x = blocks[idx + k];
      if (!x || !st.freeSlotByKey.has(st.cellKey(g, d, x.id))) {
        return false;
      }
      if (own.some((o) => (st.peersByDay[d].get(o) || []).includes(x.id))) {
        return false;
      }
      own.push(x.id);
    }
    return true;
  });
}

/**
 * record, then the progress screen is told one of the changes: a group moved from one activity
 * to another if there is one, else a cell filled.
 */
function* recordAndTell(st, d, moves, why, at) {
  record(st, moves, why);
  const m =
    moves.find((x) => x.from !== EMPTY && x.to !== EMPTY) ||
    moves.find((x) => x.to !== EMPTY);
  if (m) {
    const [groupId, , blockId] = st.splitKey(m.key);
    st.watch.now =
      m.from === EMPTY
        ? nowOf(NOW.PLACE, 8, d, groupId, blockId, m.to)
        : nowOf(NOW.MOVE, 8, d, groupId, blockId, m.from, m.to);
    yield at;
  }
}

/**
 * Each cell a rearrangement changed, why ("fill": to fill cells; "minimum": to leave fewer
 * groups short of a weekly minimum), and the cells it filled (Open before, filled now).
 */
function record(st, moves, why) {
  const filled = moves.filter((m) => m.from === EMPTY).map((m) => m.key);
  for (const m of moves) {
    const [groupId, dayIndex, blockId] = st.splitKey(m.key);
    st.searchMoves.push({
      groupId,
      dayIndex,
      blockId,
      from: m.from,
      to: m.to,
      why,
      toFill: filled
    });
  }
}

/**
 * Step 8 over every day. It tells st.watch what it is working on as it goes (progress.js), for a
 * progress screen to put in words.
 */
export function* searchWeek(st, from, share) {
  startSearch(st);
  for (let d = 0; d < st.days.length; d++) {
    yield* fillDay(st, d, from + (share * d) / st.days.length);
  }
  yield* raiseMinimums(st, from + share);
  // Moves since may have lifted the minimum that kept a day from filling: such days again.
  for (let d = 0; d < st.days.length; d++) {
    if (st.dayWhy.get(d) === MIN_COST) {
      st.dayWhy.delete(d);
      yield* fillDay(st, d, from + share);
    }
  }
  st.looksUsed = LOOK_LIMIT - st.searchLooksLeft;
}

/** Step 8 for one day: fills what it can, then says what it found (st.dayWhy). */
function* fillDay(st, d, at) {
  // Each pass fills at least one more cell or ends the day, so the free cells bound the passes.
  for (let pass = 0; pass <= st.freeByDay[d].length; pass++) {
    st.watch.now = nowOf(NOW.SEARCH_DAY, 8, d);
    // A cell busy only because of a placement the search may move is still one to fill.
    const open = st.freeByDay[d].filter((s) => !st.assigned.has(st.keyOf(s)));
    const unproven = open.filter((s) => !plainlyOpen(st, s));
    if (!unproven.length) {
      // Every other cell is filled, and these can never be: the day holds its most.
      st.dayWhy.set(d, SEARCHED);
      return;
    }
    if (yield* dayHoldsMost(st, d, at)) {
      st.dayWhy.set(d, SEARCHED);
      return;
    }
    let grew = false;
    for (const u of unproven) {
      if (outOfWork(st)) {
        break;
      }
      tell(st, NOW.SEARCH, 8, u);
      yield at;
      const r = yield* solve(st, d, regionAround(st, u), {
        guard: true,
        spansFirst: false,
        budget: Math.min(REGION_WORK, st.searchWorkLeft),
        at
      });
      if (r.improved) {
        yield* recordAndTell(st, d, r.moves, "fill", at);
        grew = true;
        break;
      }
    }
    if (grew) {
      continue;
    }
    if (outOfWork(st)) {
      st.dayWhy.set(d, BUDGET);
      return;
    }
    st.watch.now = nowOf(NOW.SEARCH_DAY, 8, d);
    yield at;
    const all = st.freeByDay[d].map((s) => st.keyOf(s));
    // The order that finds the fills that leave fewest short first; when it can't settle the
    // day, the order that proves days soonest; then fewest options first throughout.
    let r = yield* solve(st, d, all, {
      guard: true,
      budget: Math.min(FIND_WORK, st.searchWorkLeft),
      at
    });
    if (!r.improved && !r.exhausted && !outOfWork(st)) {
      r = yield* solve(st, d, all, {
        guard: true,
        budget: Math.min(DAY_WORK, st.searchWorkLeft),
        at,
        split: true
      });
    }
    if (!r.improved && !r.exhausted && !outOfWork(st)) {
      r = yield* solve(st, d, all, {
        guard: true,
        budget: Math.min(DAY_WORK, st.searchWorkLeft),
        at,
        spansFirst: false
      });
    }
    if (r.improved) {
      yield* recordAndTell(st, d, r.moves, "fill", at);
      continue;
    }
    // Searched to the end keeping every minimum: a proof only once the same search, minimums
    // aside, ends too. A fuller day that leaves a minimum short: MIN_COST. Not known: BUDGET.
    let why = BUDGET;
    if (r.exhausted && !outOfWork(st)) {
      const relaxed = yield* solve(st, d, all, {
        guard: false,
        budget: Math.min(DAY_WORK, st.searchWorkLeft),
        at,
        apply: false,
        split: true
      });
      if (relaxed.improved) {
        why = MIN_COST;
        st.dayCost.set(d, relaxed.cost);
      } else if (relaxed.exhausted) {
        why = SEARCHED;
      }
    }
    st.dayWhy.set(d, why);
    return;
  }
}

/**
 * The second pass: a day the search can rearrange to fill as many cells while leaving fewer
 * groups short of a weekly minimum (or fewer sessions short) is rearranged so. Never fewer cells
 * filled, never more short; each day at most once per short session, on its own small budget.
 */
function* raiseMinimums(st, at) {
  for (let d = 0; d < st.days.length; d++) {
    const groups = [...new Set(st.freeByDay[d].map((s) => s.groupId))];
    const all = st.freeByDay[d].map((s) => st.keyOf(s));
    for (let pass = 0; pass <= shortfall(st, groups).count[1]; pass++) {
      if (outOfWork(st) || !shortfall(st, groups).count[1]) {
        break;
      }
      st.watch.now = nowOf(NOW.NEEDED, 8, d);
      yield at;
      const r = yield* solve(st, d, all, {
        guard: true,
        minimums: true,
        budget: Math.min(MINIMUM_WORK, st.searchWorkLeft),
        at
      });
      if (!r.improved) {
        break;
      }
      yield* recordAndTell(st, d, r.moves, "minimum", at);
    }
  }
}

/** The cells searched first for an Open cell: its group's day, and its time block for every group. */
function regionAround(st, u) {
  const d = u.dayIndex;
  const times = new Set([
    u.blockId,
    ...(st.peersByDay[d].get(u.blockId) || [])
  ]);
  return st.freeByDay[d]
    .filter((s) => s.groupId === u.groupId || times.has(s.blockId))
    .map((s) => st.keyOf(s));
}

/**
 * Why each cell still Open is Open (st.openCells), in the order a director would look: busy at
 * an overlapping time, nothing set up for the group, no activity's length fits, then what the
 * search proved or that it ran out of work.
 */
export function explainOpen(st) {
  st.openCells = [];
  for (const s of st.freeSlots) {
    const k = st.keyOf(s);
    if (st.assigned.has(k)) {
      continue;
    }
    const proven = st.dayWhy.get(s.dayIndex) || BUDGET;
    const busy = busyAt(st, s.groupId, s.dayIndex, s.blockId);
    let why;
    // Busy at an overlapping time comes first, as a director would look; with something that
    // could move, it is said only when the day is proven to hold its most.
    if (
      overlapsKept(st, s.groupId, s.dayIndex, s.blockId) ||
      (busy && proven === SEARCHED)
    ) {
      why = OVERLAP;
    } else if (!s.eligibleActs.length) {
      why = NONE_FOR;
    } else if (!fitsAlone(st, s)) {
      why = LENGTH;
    } else if (busy) {
      why = proven;
    } else {
      why = proven;
      // Proven by searching the day, and nothing allowed fits it as the week stands: "taken"
      // says it plainly. SEARCHED stays for a cell something would fit only by emptying another.
      if (
        why === SEARCHED &&
        !s.eligibleActs.some((act) =>
          allowed(st, act, s.groupId, s.dayIndex, s.blockId)
        )
      ) {
        why = FULL;
      }
    }
    st.openCells.push({
      key: k,
      why,
      cost: why === MIN_COST ? st.dayCost.get(s.dayIndex) : null
    });
  }
}
