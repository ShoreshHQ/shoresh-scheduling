import { NOW, nowOf, tell } from "./progress";
import { check } from "./weekOptions";
import { PREFERENCES } from "./weekRules";

/**
 * Step 8, part 2, the last pass (protocol 8.24-8.28): moves between days, for weekly minimums.
 * The search before it (weekSearch.js) rearranges one day at a time, so a group short of an
 * activity can't be helped there when the room for it is on another day. Here a short chain of
 * moves across the whole week is tried for each group and activity it is short of:
 *
 *   - the activity goes into the group's cells on a day it doesn't have it yet (its whole length);
 *   - what was there moves to another of the group's days, and so on, until what is taken out is
 *     one the group has more of than its minimum (then it simply goes);
 *   - when the activity (or its place) is full then, another group's session of it there may make
 *     room: that group's cells are filled with something else allowed for it (and its session,
 *     if it needs it for a minimum, moves to another of its days the same way).
 *
 * A chain is kept only when it leaves fewer sessions short of a weekly minimum and no group
 * newly short (or further short) of one, and no day with more Open cells than before: every cell
 * it takes something out of is filled again, or left Open only when it fills an Open cell of the
 * same day (so the week never has fewer cells filled). The search then looks again at every day
 * a chain changed (searchWeek): what fits its Open cells may have changed. Every placement is checked against every limit (who it's for, once a day, groups at
 * once, groups that fit, same division, length, overlaps, closures); only a weekly max may bend.
 * Only generated placements in free cells move: locks, hand edits, fixed and set-time items,
 * specials and electives stay where they are.
 *
 * Of the chains that work for a group and activity, the one kept has (in order) fewer sessions
 * short, fewer Open cells, fewer sessions over a weekly max, more early-week goals met, fewer same-activity sessions on back-to-back days
 * (spread), fewer moves; still a tie, the first found (days, time blocks, groups and activities in
 * the build's order). Work is counted in moves tried, against the search's budget and the run's,
 * never time, so the same inputs give the same week on any machine.
 *
 * Minimums first, as a last resort (Greg, 2026-10-26; protocol 8.29-8.32): once every way that
 * keeps each cell filled has been tried (this pass, then the search again), the pass runs once
 * more for each group and activity still short, now letting a chain leave a cell Open, but only
 * another group's cell, whose group has nothing allowed left there (no activity, over its weekly max included),
 * and never more Open cells than the sessions short it saves. Of those chains, fewest Open cells
 * first. Each such cell is kept in st.tradeOpen with the group and activity it was left Open for,
 * and says so ("Open, so Bunk 3 gets Swim").
 */

// Steps of one chain (each places one activity), moves tried for one group and activity, and
// for the whole pass in one build.
const CHAIN_STEPS = 4;
const PAIR_WORK = 3000;
const PASS_WORK = 60000;
// Moves tried between pauses, so the screen keeps the tab responsive.
const PAUSE_EVERY = 200;

/** The bends placing `act` here would need: null when a limit forbids it. */
function allowed(st, act, g, d, b) {
  const bends = check(st, act, g, d, b, true);
  if (bends === null || bends.some((r) => !PREFERENCES.includes(r))) {
    return null;
  }
  return bends;
}

const movable = (st, k) => st.freeSlotByKey.has(k) && !st.keptKeys.has(k);

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

/** The placement covering cell k: { act, g, d, b, keys }, or null when the cell is empty. */
function placementAt(st, k) {
  if (!st.assigned.has(k)) {
    return null;
  }
  const hk = headOf(st, k);
  const [g, d, b] = st.splitKey(hk);
  const act = st.actById.get(st.assigned.get(hk));
  const keys = st.ownBlocks(act, g, d, b).map((id) => st.cellKey(g, d, id));
  return { act, g, d, b, keys };
}

/** Whether the group is short of its minimum of act (after a session was taken out). */
const needs = (st, g, act) =>
  st.eligibility.get(act.id).has(g) && st.getCount(g, act.id) < act.min;

/** The day's free cells nothing is in. */
const openOn = (st, d) =>
  st.freeByDay[d].filter((s) => !st.assigned.has(st.keyOf(s))).length;

/** Sessions short of a minimum, per "group|activity", for these groups. */
function shortOf(st, groups) {
  const short = new Map();
  for (const g of groups) {
    for (const act of st.acts) {
      const missing = act.min - st.getCount(g, act.id);
      if (missing > 0 && st.eligibility.get(act.id).has(g)) {
        short.set(`${g}|${act.id}`, missing);
      }
    }
  }
  return short;
}

const total = (short) => [...short.values()].reduce((n, x) => n + x, 0);

/** Sessions over a weekly max, for these groups. */
function overMax(st, groups) {
  let n = 0;
  for (const g of groups) {
    for (const act of st.acts) {
      if (act.max != null) {
        n += Math.max(0, st.getCount(g, act.id) - act.max);
      }
    }
  }
  return n;
}

/** How many of these groups' early-week goals are met as the week stands. */
function earlyMet(st, groups) {
  let met = 0;
  for (const g of groups) {
    for (const act of st.acts) {
      const days = act.early ? st.earlyDays.get(`${act.id}|${g}`) : null;
      if (!days || !days.size) {
        continue;
      }
      let n = 0;
      for (const d of days) {
        n += st.dailyUsage.get(`${g}|${d}|${act.id}`) || 0;
      }
      if (n >= act.early.count) {
        met++;
      }
    }
  }
  return met;
}

/** Same-activity sessions on back-to-back days, for these groups. */
function backToBack(st, groups) {
  let n = 0;
  for (const g of groups) {
    for (const act of st.acts) {
      for (let d = 1; d < st.days.length; d++) {
        if (st.onDay(g, d - 1, act.id) && st.onDay(g, d, act.id)) {
          n++;
        }
      }
    }
  }
  return n;
}

function lessThan(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}

/**
 * The search for one group and activity: every chain up to CHAIN_STEPS, the best kept (see
 * above). Returns the chain's moves ({ g, d, b, from, to } per cell changed, in the order made)
 * applied to the week, or null with the week as it was.
 */
function* bestChain(st, g0, need, budget, outOfWork, at, trade = false) {
  const journal = [];
  const doPlace = (act, g, d, b) => {
    st.place(act, g, d, b);
    journal.push({ act, g, d, b, placed: true });
  };
  const doUnplace = (p) => {
    st.unplace(p.act, p.g, p.d, p.b);
    journal.push({ act: p.act, g: p.g, d: p.d, b: p.b, placed: false });
  };
  const undoTo = (mark) => {
    while (journal.length > mark) {
      const j = journal.pop();
      if (j.placed) {
        st.unplace(j.act, j.g, j.d, j.b);
      } else {
        st.place(j.act, j.g, j.d, j.b);
      }
    }
  };

  const groups = new Set([g0]);
  const before = shortOf(st, st.model.groupIds);
  const beforeTotal = total(before);
  const emptyBefore = st.emptyCells;
  const openBefore = st.days.map((_, d) => openOn(st, d));
  let work = 0;
  let best = null;
  const spent = () => work >= budget || outOfWork(st);
  // One move tried: charged to the search's budget at once, and every PAUSE_EVERY a pause, so
  // the screen keeps the tab responsive (the week is mid-chain then; only watch.now is read).
  function* tried() {
    work++;
    st.searchWorkLeft--;
    if (work % PAUSE_EVERY === 0) {
      yield at;
    }
  }

  const finish = () => {
    // No day ends with more Open cells than it had: a cell is left Open only for another of the
    // same day filled, so what the search found about each day still holds. The last resort
    // (trade) may leave cells Open, each one saving at least one session short (checked below).
    const opened = st.emptyCells - emptyBefore;
    if (!trade) {
      if (opened > 0) {
        return;
      }
      for (const d of new Set(journal.map((j) => j.d))) {
        if (openOn(st, d) > openBefore[d]) {
          return;
        }
      }
    }
    const now = shortOf(st, groups);
    let nowTotal = beforeTotal;
    for (const g of groups) {
      for (const [k, missing] of before) {
        if (k.startsWith(`${g}|`)) {
          nowTotal -= missing;
        }
      }
    }
    nowTotal += total(now);
    if (nowTotal >= beforeTotal || opened > beforeTotal - nowTotal) {
      return;
    }
    for (const [k, missing] of now) {
      if (missing > (before.get(k) || 0)) {
        return;
      }
    }
    const list = [...groups];
    // The last resort leaves as few cells Open as it can, then saves the most.
    const rank = [
      trade ? st.emptyCells : nowTotal,
      trade ? nowTotal : st.emptyCells,
      overMax(st, list),
      -earlyMet(st, list),
      backToBack(st, list),
      journal.length
    ];
    if (!best || lessThan(rank, best.rank)) {
      best = { rank, journal: journal.map((j) => ({ ...j })) };
    }
  };

  // The three kinds of step, defined below (each calls the others through run).
  const step = {};

  // tasks: what is still to do, first first: { place: act, g } or { fill: key }.
  const run = function* (tasks, steps) {
    if (spent()) {
      return;
    }
    if (!tasks.length) {
      finish();
      return;
    }
    // Sessions to put back first, then the emptied cells: a cell is refilled once nothing else
    // is going to take it.
    const i = Math.max(
      0,
      tasks.findIndex((t) => t.place)
    );
    const task = tasks[i];
    const rest = [...tasks.slice(0, i), ...tasks.slice(i + 1)];
    if (task.fill) {
      yield* step.fill(task.fill, rest, steps);
    } else if (steps > 0) {
      yield* step.place(task.place, task.g, rest, steps - 1);
    }
  };

  // An emptied cell gets any one-block activity allowed for its group there (counts only rise).
  step.fill = function* (k, rest, steps) {
    if (st.assigned.has(k)) {
      yield* run(rest, steps);
      return;
    }
    const [g, d, b] = st.splitKey(k);
    let any = false;
    for (const act of st.acts) {
      if (spent()) {
        return;
      }
      if (!st.eligibility.get(act.id).has(g)) {
        continue;
      }
      // The last resort leaves a cell Open only when nothing allowed is left for its group there,
      // a longer activity starting there included.
      if (act.span !== 1) {
        if (trade && !any) {
          yield* tried();
          any = allowed(st, act, g, d, b) !== null;
        }
        continue;
      }
      yield* tried();
      if (allowed(st, act, g, d, b)) {
        any = true;
        const mark = journal.length;
        doPlace(act, g, d, b);
        yield* run(rest, steps);
        undoTo(mark);
      }
    }
    // Or left Open, when the chain fills another cell in its place (finish counts them); in the
    // last resort, only another group's cell, and only when nothing allowed fits it.
    if (!spent() && !(trade && (any || g === g0))) {
      yield* run(rest, steps);
    }
  };

  // The group's cells that `act` could start in, in day and block order.
  const starts = (act, g) => {
    const out = [];
    for (let d = 0; d < st.days.length; d++) {
      if (st.onDay(g, d, act.id)) {
        continue;
      }
      const blocks = st.blocksOf(d);
      for (let i = 0; i + act.span <= blocks.length; i++) {
        const keys = [];
        for (let j = 0; j < act.span; j++) {
          keys.push(st.cellKey(g, d, blocks[i + j].id));
        }
        if (keys.every((k) => movable(st, k))) {
          out.push({ d, b: blocks[i].id, keys });
        }
      }
    }
    return out;
  };

  step.place = function* (act, g, rest, steps) {
    for (const s of starts(act, g)) {
      if (spent()) {
        return;
      }
      yield* tried();
      const mark = journal.length;
      // Take out what is in the cells (whole placements; one reaching a kept cell can't move).
      const out = [];
      let ok = true;
      for (const k of s.keys) {
        const p = placementAt(st, k);
        if (!p) {
          continue;
        }
        if (!p.keys.every((x) => movable(st, x))) {
          ok = false;
          break;
        }
        if (p.act.id === act.id) {
          ok = false;
          break;
        }
        doUnplace(p);
        out.push(p);
      }
      if (ok) {
        // What the chain must still do: refill cells a taken-out placement covered beyond these,
        // and put back what the group needs for a minimum.
        const more = [];
        for (const p of out) {
          for (const x of p.keys) {
            if (!s.keys.includes(x)) {
              more.push({ fill: x });
            }
          }
          if (needs(st, g, p.act)) {
            more.push({ place: p.act, g });
          }
        }
        if (allowed(st, act, g, s.d, s.b)) {
          doPlace(act, g, s.d, s.b);
          yield* run([...more, ...rest], steps);
        } else if (steps > 0) {
          yield* step.makeRoom(act, g, s, [...more, ...rest], steps);
        }
      }
      undoTo(mark);
    }
  };

  // The activity, or its place, is full then: another group's session there makes room.
  step.makeRoom = function* (act, g, s, rest, steps) {
    const seen = new Set();
    for (const h of st.model.groupIds) {
      if (h === g) {
        continue;
      }
      for (const k of s.keys) {
        const [, , b] = st.splitKey(k);
        const p = placementAt(st, st.cellKey(h, s.d, b));
        if (!p || seen.has(p.keys[0])) {
          continue;
        }
        seen.add(p.keys[0]);
        const sharesPlace =
          act.locationId != null && p.act.locationId === act.locationId;
        if (p.act.id !== act.id && !sharesPlace) {
          continue;
        }
        if (!p.keys.every((x) => movable(st, x)) || spent()) {
          continue;
        }
        yield* tried();
        const mark = journal.length;
        doUnplace(p);
        if (allowed(st, act, g, s.d, s.b)) {
          doPlace(act, g, s.d, s.b);
          const hadH = groups.has(h);
          groups.add(h);
          const more = p.keys.map((x) => ({ fill: x }));
          if (needs(st, h, p.act)) {
            more.push({ place: p.act, g: h });
          }
          yield* run([...more, ...rest], steps - 1);
          if (!hadH) {
            groups.delete(h);
          }
        }
        undoTo(mark);
      }
    }
  };

  yield* run([{ place: need, g: g0 }], CHAIN_STEPS);
  if (!best) {
    return { work, moves: null };
  }
  // Put the best chain in, and say each cell it changed.
  const was = new Map();
  for (const j of best.journal) {
    for (const id of st.ownBlocks(j.act, j.g, j.d, j.b)) {
      const k = st.cellKey(j.g, j.d, id);
      if (!was.has(k)) {
        was.set(k, st.assigned.has(k) ? st.assigned.get(k) : null);
      }
    }
    if (j.placed) {
      st.place(j.act, j.g, j.d, j.b);
    } else {
      st.unplace(j.act, j.g, j.d, j.b);
    }
  }
  const moves = [];
  for (const [k, from] of was) {
    const to = st.assigned.has(k) ? st.assigned.get(k) : null;
    if (from !== to && !st.spanTails.has(k)) {
      const [g, d, b] = st.splitKey(k);
      moves.push({ g, d, b, from, to });
    }
  }
  return { work, moves };
}

/**
 * The pass over every group, in the build's order, and every activity it is short of, in setup's
 * order; each kept chain is applied, recorded in st.searchMoves (why "minimum", nothing to fill)
 * and told to the progress screen. A group and activity no chain helps is not tried again.
 * Returns the days a chain changed.
 */
export function* moveAcrossDays(st, at, outOfWork, trade = false) {
  // Days a chain changed: what can go in their Open cells may have changed with it.
  const changed = new Set();
  let left = PASS_WORK;
  const tried = new Set();
  for (const g of st.model.groupIds) {
    let helped = true;
    while (helped && left > 0 && !outOfWork(st)) {
      helped = false;
      for (const need of st.acts) {
        const k = `${g}|${need.id}`;
        if (
          tried.has(k) ||
          st.getCount(g, need.id) >= need.min ||
          !st.eligibility.get(need.id).has(g)
        ) {
          continue;
        }
        if (left <= 0 || outOfWork(st)) {
          break;
        }
        tell(
          st,
          NOW.SHORT,
          8,
          { dayIndex: null, groupId: g, blockId: null },
          need.id
        );
        yield at;
        const r = yield* bestChain(
          st,
          g,
          need,
          Math.min(PAIR_WORK, left),
          outOfWork,
          at,
          trade
        );
        left -= r.work;
        if (!r.moves) {
          tried.add(k);
          continue;
        }
        r.moves.forEach((m) => changed.add(m.d));
        if (trade) {
          noteTrades(st, g, need, r.moves);
        }
        yield* tellAndRecord(st, g, need, r.moves, at, trade);
        helped = true;
        break;
      }
    }
  }
  return changed;
}

/** The cells a last-resort chain left Open, kept with the group and activity they were left for. */
function noteTrades(st, g, need, moves) {
  for (const m of moves) {
    if (m.from != null && m.to == null) {
      st.tradeOpen.set(st.cellKey(m.g, m.d, m.b), {
        groupId: g,
        activityId: need.id
      });
    }
  }
}

function* tellAndRecord(st, g, need, moves, at, trade = false) {
  for (const m of moves) {
    st.searchMoves.push({
      groupId: m.g,
      dayIndex: m.d,
      blockId: m.b,
      from: m.from,
      to: m.to,
      why: "minimum",
      toFill: []
    });
  }
  // The screen: one of the group's activities moved from one day to another, so it gets `need`
  // once more; else the cell `need` went into.
  const mine = moves.filter((m) => m.g === g);
  const put = mine.find((m) => m.to === need.id) || moves[0];
  const moved = mine.find(
    (m) =>
      m.to != null &&
      m.to !== need.id &&
      m.d !== put.d &&
      mine.some((x) => x.d === put.d && x.from === m.to)
  );
  const left = trade && moves.find((m) => m.from != null && m.to == null);
  st.watch.now = left
    ? {
        ...nowOf(NOW.TRADE, 8, left.d, left.g, left.b, null, need.id),
        forGroupId: g
      }
    : moved
      ? nowOf(
          NOW.ACROSS,
          8,
          put.d,
          g,
          moved.b,
          moved.to,
          need.id,
          moved.d,
          st.getCount(g, need.id)
        )
      : put.from == null
        ? nowOf(NOW.PLACE, 8, put.d, put.g, put.b, put.to)
        : nowOf(NOW.MOVE, 8, put.d, put.g, put.b, put.from, put.to);
  yield at;
}
