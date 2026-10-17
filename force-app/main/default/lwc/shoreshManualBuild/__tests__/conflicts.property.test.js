/**
 * The promise behind "keep theirs or use yours" (ADR 0008 §21), over generated weeks:
 *
 *   Use yours may leave unlisted only the director's own cells that still hold what the director
 *   saw there. Every other cell it changes is listed, and every listed cell is changed.
 *
 * The test keeps its own record of what the director saw (by day, group, and time block Id),
 * updated from the questions it is shown, rather than trusting the code under test for it.
 * Seeded (mulberry32), so every run is the same.
 */
import { intentOf, plan, withSeen } from "../conflicts";
import { editRun, slots } from "../slotEdits";
import { inverse, moveEdit, removeEdit, resizeEdit } from "../moves";

const DATES = ["2026-06-29", "2026-06-30"];
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" },
  { id: "g3", name: "Bunk 3" }
];
const ACTIVITIES = ["A:a1", "A:a2", "A:a3", "A:a4"];
const FIXED = "F:f1";
const RECURRING = "R:r1";
const SET_TIME = [FIXED, RECURRING];
/** A fixed or recurring activity (or a block of one): it stays where setup puts it. */
const isSetTime = (slot) => /^\^?[FR]:/.test(slot);
const SEEDS = 3000;

// ---------- weeks from rows of identities ----------

function dayOf(date, blocks, rows) {
  const items = [];
  const tokens = rows.map((row) =>
    row
      .map((slot) => {
        if (slot === "") {
          return "";
        }
        if (slot.startsWith("^")) {
          return "^";
        }
        const [kind, id] = slot.split(":");
        let i = items.findIndex((it) => it.kind === kind && it.id === id);
        if (i < 0) {
          items.push({ kind, id, name: id });
          i = items.length - 1;
        }
        return String(i + 1);
      })
      .join(",")
  );
  return {
    dateValue: date,
    blocks: blocks.map((id) => ({ id, name: id })),
    groups: GROUPS,
    items,
    rows: tokens
  };
}

const rowsOf = (day) => day.groups.map((_, g) => slots(day, g));
const blockIds = (day) => day.blocks.map((b) => b.id);
const copyWeek = (days) =>
  days.map((d) => dayOf(d.dateValue, blockIds(d), rowsOf(d)));

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const int = (rnd, n) => Math.floor(rnd() * n);

/** Rows with Open cells, fixed activities, and activities one to three blocks long. */
function randomRow(rnd, width) {
  const row = [];
  while (row.length < width) {
    const r = rnd();
    const room = width - row.length;
    if (r < 0.3) {
      row.push("");
    } else if (r < 0.38) {
      row.push(pick(rnd, SET_TIME));
    } else {
      const a = pick(rnd, ACTIVITIES);
      const length = Math.min(room, 1 + int(rnd, 3));
      row.push(a);
      for (let i = 1; i < length; i++) {
        row.push(`^${a}`);
      }
    }
  }
  return row;
}

function randomWeek(rnd) {
  return DATES.map((date) => {
    const width = 4 + int(rnd, 3);
    const blocks = Array.from({ length: width }, (_, i) => `${date}-t${i + 1}`);
    return dayOf(
      date,
      blocks,
      GROUPS.map(() => randomRow(rnd, width))
    );
  });
}

// ---------- the server: compare and set, as SlotSaves and SlotRules do ----------

function ownerAt(row, b) {
  let first = b;
  while (first > 0 && row[first].startsWith("^")) {
    first -= 1;
  }
  return row[first];
}

function valid(row) {
  return row.every(
    (slot, b) =>
      !slot.startsWith("^") ||
      (b > 0 && (row[b - 1] === slot.slice(1) || row[b - 1] === slot))
  );
}

/** Makes an edit's runs if each still finds what it names; false (a conflict) otherwise. */
function serverApply(state, runs) {
  const rowsByDay = state.days.map(rowsOf);
  for (const run of runs) {
    const d = state.days.findIndex((day) => day.dateValue === run.day);
    const day = state.days[d];
    const g = day ? day.groups.findIndex((grp) => grp.id === run.groupId) : -1;
    const first = day ? blockIds(day).indexOf(run.firstBlockId) : -1;
    if (g < 0 || first < 0 || first + run.before.length > day.blocks.length) {
      return false;
    }
    const row = rowsByDay[d][g];
    if (run.before.some((slot, i) => row[first + i] !== slot)) {
      return false;
    }
    if (row[first].startsWith("^")) {
      return false;
    }
    const was = [...row];
    run.after.forEach((slot, i) => {
      row[first + i] = slot;
    });
    const kept = row.every(
      (slot, b) =>
        (b >= first && b < first + run.after.length) ||
        ownerAt(row, b) === ownerAt(was, b)
    );
    if (!kept) {
      return false;
    }
    // Fixed and recurring activities stay where setup puts them (SlotRules).
    if (
      was.some(
        (slot, b) =>
          b >= first &&
          b < first + run.after.length &&
          isSetTime(slot) &&
          row[b] !== slot
      )
    ) {
      throw new Error("a fixed activity was changed");
    }
  }
  rowsByDay.forEach((rows) =>
    rows.forEach((row) => {
      if (!valid(row)) {
        throw new Error(`the server would refuse a broken row: ${row}`);
      }
    })
  );
  state.days = state.days.map((day, d) =>
    dayOf(day.dateValue, blockIds(day), rowsByDay[d])
  );
  return true;
}

// ---------- other people ----------

let blockSeq = 1000;

/** Someone else's change somewhere in the week, or near the cells an edit is about. */
function otherChange(rnd, state, near) {
  const d0 = int(rnd, state.days.length);
  let d = d0;
  let g = int(rnd, GROUPS.length);
  let b = int(rnd, state.days[d].blocks.length);
  if (near && near.length) {
    const run = pick(rnd, near);
    d = state.days.findIndex((day) => day.dateValue === run.day);
    g = GROUPS.findIndex((grp) => grp.id === run.groupId);
    const first = blockIds(state.days[d]).indexOf(run.firstBlockId);
    b = Math.min(
      state.days[d].blocks.length - 1,
      Math.max(0, first + int(rnd, run.after.length + 2) - 1)
    );
  }
  const day = state.days[d];
  const blocks = blockIds(day);
  const rows = rowsOf(day);
  const row = rows[g];
  const placementAt = (at) => {
    let first = at;
    while (first > 0 && row[first].startsWith("^")) {
      first -= 1;
    }
    let length = 1;
    while (first + length < row.length && row[first + length].startsWith("^")) {
      length += 1;
    }
    return { first, length };
  };
  const clearAt = (at) => {
    const p = placementAt(at);
    for (let i = p.first; i < p.first + p.length; i++) {
      row[i] = "";
    }
  };
  const isFixed = (at) => isSetTime(ownerAt(row, at));
  const r = rnd();
  if (r < 0.3) {
    // A new activity, one to three blocks, over whatever was there (not fixed activities).
    // Sometimes it is a fixed or recurring one (setup changed).
    const setTime = rnd() < 0.25;
    const length = setTime ? 1 : 1 + int(rnd, 3);
    if (b + length > row.length) {
      return;
    }
    for (let i = b; i < b + length; i++) {
      if (isFixed(i)) {
        return;
      }
    }
    for (let i = b; i < b + length; i++) {
      clearAt(i);
    }
    const a = setTime ? pick(rnd, SET_TIME) : pick(rnd, ACTIVITIES);
    row[b] = a;
    for (let i = b + 1; i < b + length; i++) {
      row[i] = `^${a}`;
    }
  } else if (r < 0.45) {
    if (!isFixed(b)) {
      clearAt(b);
    }
  } else if (r < 0.65) {
    // Someone makes an activity longer or shorter.
    if (row[b] === "" || isFixed(b)) {
      return;
    }
    const p = placementAt(b);
    const head = row[p.first];
    if (rnd() < 0.5 && p.length > 1) {
      row[p.first + p.length - 1] = "";
    } else {
      const after = p.first + p.length;
      if (after < row.length && row[after] === "") {
        row[after] = `^${head}`;
      }
    }
  } else if (r < 0.85) {
    // A time block added, anywhere, even inside a placement (which then runs through it).
    blockSeq += 1;
    blocks.splice(b, 0, `${day.dateValue}-n${blockSeq}`);
    rows.forEach((each) => {
      const carry = b > 0 && b < each.length && each[b].startsWith("^");
      each.splice(b, 0, carry ? each[b] : "");
    });
  } else {
    // A time block removed: what started there starts in the next block instead.
    if (blocks.length <= 3) {
      return;
    }
    blocks.splice(b, 1);
    rows.forEach((each) => {
      const head = each[b];
      each.splice(b, 1);
      if (b < each.length && each[b].startsWith("^") && !head.startsWith("^")) {
        each[b] = each[b].slice(1);
      }
    });
  }
  state.days[d] = dayOf(day.dateValue, blocks, rows);
}

// ---------- the director ----------

function toServer(days, run) {
  const day = days[run.day];
  return {
    day: day.dateValue,
    groupId: day.groups[run.group].id,
    firstBlockId: day.blocks[run.first].id,
    before: run.before,
    after: run.after,
    // Each cell's block, as the screen keeps it with a step for Undo and Redo.
    blockIds: day.blocks
      .slice(run.first, run.first + run.after.length)
      .map((b) => b.id)
  };
}

/** A random edit on the week the director sees: { days (seen), runs (server shape) }. */
function directorEdit(rnd, days) {
  const at = () => {
    const day = int(rnd, days.length);
    return {
      day,
      group: int(rnd, GROUPS.length),
      block: int(rnd, days[day].blocks.length)
    };
  };
  const nowhereAway = () => false;
  const kind = int(rnd, 7);
  let runs = null;
  if (kind <= 1) {
    const p = at();
    const next = kind === 0 ? pick(rnd, ACTIVITIES) : "";
    const run = editRun(
      days[p.day],
      p.group,
      p.block,
      next,
      1 + int(rnd, 3),
      nowhereAway
    );
    runs = run ? [{ day: p.day, group: p.group, ...run }] : null;
  } else if (kind <= 3) {
    // A move or swap, within a day or across days and bunks.
    const result = moveEdit(days, at(), at(), nowhereAway);
    runs = result && result.runs;
  } else if (kind === 4) {
    const p = at();
    const result = resizeEdit(days, p, p.block + int(rnd, 4) - 1, nowhereAway);
    runs = result && result.runs;
  } else if (kind === 5) {
    const result = removeEdit(days, at());
    runs = result && result.runs;
  } else {
    // An Undo of a change made and saved earlier (a placement), sent back the other way.
    const p = at();
    const run = editRun(
      days[p.day],
      p.group,
      p.block,
      pick(rnd, ACTIVITIES),
      1 + int(rnd, 2),
      nowhereAway
    );
    if (!run) {
      return null;
    }
    const rows = rowsOf(days[p.day]);
    run.after.forEach((slot, i) => {
      rows[p.group][run.first + i] = slot;
    });
    const changed = days.map((day, d) => {
      return d === p.day ? dayOf(day.dateValue, blockIds(day), rows) : day;
    });
    const runs = inverse([{ day: p.day, group: p.group, ...run }]).map((r) =>
      toServer(changed, r)
    );
    // Half the time the screen has since refreshed to someone else's change, near the step or
    // anywhere: the Undo still expects what the step left.
    if (rnd() < 0.5) {
      const refreshed = { days: copyWeek(changed) };
      const times = 1 + int(rnd, 2);
      for (let i = 0; i < times; i++) {
        otherChange(rnd, refreshed, rnd() < 0.8 ? runs : null);
      }
      return { days: refreshed.days, expects: changed, runs, refreshed: true };
    }
    return { days: changed, expects: changed, runs };
  }
  if (!runs || !runs.length) {
    return null;
  }
  return { days, runs: runs.map((r) => toServer(days, r)) };
}

// ---------- the oracle: kept independently of the code under test ----------

const cellKey = (date, groupId, blockId) => `${date}|${groupId}|${blockId}`;

/** What the director saw, by cell, from the week they made the edit on. */
function seenModelOf(days) {
  const seen = new Map();
  days.forEach((day) =>
    rowsOf(day).forEach((row, g) =>
      row.forEach((slot, b) =>
        seen.set(cellKey(day.dateValue, GROUPS[g].id, day.blocks[b].id), slot)
      )
    )
  );
  return seen;
}

/** The director's own cells: every cell of the edit's runs, by block Id. */
function ownOf(days, runs) {
  const own = new Set();
  runs.forEach((run) => {
    const day = days.find((dd) => dd.dateValue === run.day);
    const first = blockIds(day).indexOf(run.firstBlockId);
    run.after.forEach((_, i) =>
      own.add(cellKey(run.day, run.groupId, day.blocks[first + i].id))
    );
  });
  return own;
}

function expectStrict(made, state, own, seen, failures, seed) {
  const changed = new Set();
  const mayBeUnlisted = new Set();
  made.runs.forEach((run) => {
    const day = state.days.find((dd) => dd.dateValue === run.day);
    const first = blockIds(day).indexOf(run.firstBlockId);
    run.before.forEach((theirs, i) => {
      if (theirs === run.after[i]) {
        return;
      }
      const key = cellKey(run.day, run.groupId, day.blocks[first + i].id);
      changed.add(key);
      if (isSetTime(theirs)) {
        failures.push(`seed ${seed}: plan changes a fixed activity at ${key}`);
      }
      if (own.has(key) && seen.get(key) === theirs) {
        mayBeUnlisted.add(key);
      }
    });
  });
  const listed = new Set(
    made.rows.map((row) => cellKey(row.day, row.groupId, row.blockId))
  );
  changed.forEach((key) => {
    if (!mayBeUnlisted.has(key) && !listed.has(key)) {
      failures.push(`seed ${seed}: ${key} is changed but not listed`);
    }
  });
  listed.forEach((key) => {
    if (!changed.has(key)) {
      failures.push(`seed ${seed}: ${key} is listed but not changed`);
    }
    if (mayBeUnlisted.has(key)) {
      failures.push(
        `seed ${seed}: ${key} is the director's own, unchanged, yet listed`
      );
    }
  });
}

describe("keep theirs or use yours: what is shown is what is sent", () => {
  it(`holds over ${SEEDS} generated weeks, edits, and other people's changes`, () => {
    const failures = [];
    const counts = {
      conflicts: 0,
      again: 0,
      gone: 0,
      changed: 0,
      fixed: 0,
      refreshed: 0,
      missing: 0
    };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = random(seed);
      const start = randomWeek(rnd);
      const edit = directorEdit(rnd, start);
      if (!edit) {
        continue;
      }
      // What the director expects: the screen for an edit, what the step left for an Undo.
      const expects = edit.expects || edit.days;
      const seen = seenModelOf(expects);
      const own = ownOf(expects, edit.runs);
      let intent = intentOf(
        edit.days,
        edit.runs,
        () => "cell",
        () => "row"
      );
      if (intent.missing) {
        // The refreshed screen has lost a block of the step: the screen says so (moving.test).
        counts.missing += 1;
        continue;
      }
      const state = { days: copyWeek(edit.days) };
      const changes = 1 + int(rnd, 3);
      for (let i = 0; i < changes; i++) {
        otherChange(rnd, state, rnd() < 0.6 ? edit.runs : null);
      }
      let runs = edit.runs;
      // Up to three questions in a row about the same edit.
      for (let question = 0; question < 3; question++) {
        if (serverApply(state, runs)) {
          break;
        }
        if (question === 0) {
          counts.conflicts += 1;
          counts.refreshed += edit.refreshed ? 1 : 0;
        } else {
          counts.again += 1;
        }
        const made = plan(state.days, intent);
        if (made.gone || made.changed || made.fixed) {
          counts[made.gone ? "gone" : made.changed ? "changed" : "fixed"] += 1;
          if (made.runs) {
            failures.push(`seed ${seed}: a refusal still has runs to send`);
          }
          break;
        }
        expectStrict(made, state, own, seen, failures, seed);
        // The director has now seen what the question listed (the test's own record).
        made.rows.forEach((row) =>
          seen.set(cellKey(row.day, row.groupId, row.blockId), row.theirs)
        );
        intent = withSeen(intent, made.rows);
        runs = made.runs;
        if (rnd() < 0.5) {
          otherChange(rnd, state, runs);
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    // The generator reaches the hard cases.
    expect(counts.conflicts).toBeGreaterThan(400);
    expect(counts.again).toBeGreaterThan(50);
    expect(counts.changed + counts.gone).toBeGreaterThan(5);
    expect(counts.fixed).toBeGreaterThan(5);
    expect(counts.refreshed).toBeGreaterThan(20);
  });
});
