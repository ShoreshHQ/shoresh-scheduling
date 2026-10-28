/**
 * Step 8's moves between days (weekAcross.js, protocol 8.24-8.28): a group short of a weekly
 * minimum gets it by a short chain of moves across days, never breaking a limit (once a day
 * included), never leaving a group short of a minimum it met, never leaving a day with more
 * Open cells, the same week every time.
 */
import { NOW, generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { camp, cellsOf } from "./data/camp";
import { problems } from "./data/check";
import { sharedCamp } from "./data/sharedCamp";
import { sampled } from "shoresh-jest/sample";

// The same engine with the moves between days switched off, for comparing a week with and
// without them (mockAcross.off); the engine itself has no such switch.
const mockAcross = { off: false };
jest.mock("../weekAcross", () => {
  const actual = jest.requireActual("../weekAcross");
  return {
    ...actual,
    *moveAcrossDays(...args) {
      if (mockAcross.off) {
        return new Set();
      }
      return yield* actual.moveAcrossDays(...args);
    }
  };
});

// The differential's camps (data/sharedCamp.js): CI checks the first 60, the full run 200.
const SEEDS = sampled(200, 60);
// Differential camps where a group's minimum is met only by moving sessions between days.
const ACROSS_SEEDS = [123, 58];

/** Sessions per "group|activity" and per "group|day|activity", from the grid alone. */
function countsOf(days) {
  const week = new Map();
  const day = new Map();
  cellsOf(days).forEach((byGroup, d) => {
    for (const [g, row] of Object.entries(byGroup)) {
      for (const cell of row) {
        if (cell && cell.kind === "A" && cell.head) {
          const k = `${g}|${cell.id}`;
          week.set(k, (week.get(k) || 0) + 1);
          const dk = `${g}|${d}|${cell.id}`;
          day.set(dk, (day.get(dk) || 0) + 1);
        }
      }
    }
  });
  return { week, day };
}

const minimumMoves = (result) =>
  result.moved.filter((m) => m.why === "minimum");

// GEN-8.24
describe("moves between days for a weekly minimum", () => {
  it.each(ACROSS_SEEDS)(
    "camp %i: a group's sessions move between days so it meets a minimum",
    (seed) => {
      const spec = sharedCamp(seed);
      const result = generateWeek(camp(spec));
      expect(result.ok).toBe(true);
      // One group's cells change on more than one day.
      const datesByGroup = new Map();
      for (const m of minimumMoves(result)) {
        if (!datesByGroup.has(m.groupId)) {
          datesByGroup.set(m.groupId, new Set());
        }
        datesByGroup.get(m.groupId).add(m.date);
      }
      expect([...datesByGroup.values()].some((dates) => dates.size > 1)).toBe(
        true
      );
    }
  );

  it("pins what it reaches on those camps (fewer groups short than before it)", () => {
    // Before this pass: camp 123 had 11 lines still needed. Camp 58 replaced camp 210 when rule
    // 9.10 put the activities in settings order (2026-10-27): 210 no longer needs the moves.
    const short = ACROSS_SEEDS.map(
      (seed) => generateWeek(camp(sharedCamp(seed))).stillNeededBy.length
    );
    expect(short).toEqual([10, 5]);
  });
});

describe("the rules it keeps", () => {
  const rows = [];
  beforeAll(() => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = sharedCamp(seed);
      const input = camp(spec);
      const result = generateWeek(input);
      if (result.ok && minimumMoves(result).length) {
        rows.push({ seed, spec, input, result });
      }
    }
  });

  it("moves on some camps", () => {
    expect(rows.length).toBeGreaterThan(3);
  });

  // GEN-8.25, GEN-8.26
  it("never breaks once a day or any other limit; only a weekly max may bend", () => {
    for (const { seed, spec, input, result } of rows) {
      const { day } = countsOf(result.days);
      const twice = [...day].filter(([, n]) => n > 1).map(([k]) => k);
      expect([seed, twice]).toEqual([seed, []]);
      expect([seed, problems(spec, input, result)]).toEqual([seed, []]);
      const bends = new Set(result.flags.flatMap((f) => f.bends));
      bends.delete("weeklyMax");
      expect([seed, [...bends]]).toEqual([seed, []]);
    }
  });

  it("never moves a kept cell: each cell it moves was one the build fills", () => {
    for (const { seed, input, result } of rows) {
      const before = cellsOf(input.days);
      for (const m of minimumMoves(result)) {
        const d = input.days.findIndex((x) => x.dateValue === m.date);
        const b = input.days[d].blocks.findIndex((x) => x.id === m.blockId);
        const was = before[d][m.groupId] ? before[d][m.groupId][b] : null;
        expect([seed, !was || was.kind === "A"]).toEqual([seed, true]);
      }
    }
  });
});

describe("the same week every time", () => {
  it.each(ACROSS_SEEDS)(
    "camp %i builds the same, at once or in steps",
    (seed) => {
      const once = generateWeek(camp(sharedCamp(seed)));
      const again = generateWeek(camp(sharedCamp(seed)));
      expect(JSON.stringify(again)).toBe(JSON.stringify(once));
      const watch = {};
      const steps = generateWeekSteps(camp(sharedCamp(seed)), watch);
      const told = [];
      let step = steps.next();
      while (!step.done) {
        if (watch.now) {
          told.push({ ...watch.now });
        }
        step = steps.next();
      }
      expect(JSON.stringify(step.value)).toBe(JSON.stringify(once));
      // It says a move between days, naming both days and how often the group gets it now
      // (camp 123: the short group's own session moves; in 210 another group's does, said as a
      // move in one cell).
      const across = told.filter((now) => now.code === NOW.ACROSS);
      expect(across.length > 0).toBe(seed === 123);
      for (const now of across) {
        expect(now.step).toBe(8);
        expect(typeof now.date).toBe("string");
        expect(typeof now.toDate).toBe("string");
        expect(now.toDate).not.toBe(now.date);
        expect(now.times).toBeGreaterThan(0);
      }
    }
  );
});

/** Sessions short per "group|activity" (who it's for and minimums from the spec), from the grid. */
function shortBy(spec, days) {
  const { week } = countsOf(days);
  const short = new Map();
  for (const g of spec.groups) {
    for (const a of spec.activities) {
      const forGroup =
        !a.eligible.length ||
        a.eligible.includes(g.id) ||
        a.eligible.includes(g.division);
      const missing = a.min - (week.get(`${g.id}|${a.id}`) || 0);
      if (forGroup && missing > 0) {
        short.set(`${g.id}|${a.id}`, missing);
      }
    }
  }
  return short;
}

/** Open cells per date, the last resort's own (why "trade", left Open for a minimum) aside. */
function openByDate(result) {
  const n = new Map();
  for (const c of result.openCells.filter((x) => x.why !== "trade")) {
    const { date } = c;
    n.set(date, (n.get(date) || 0) + 1);
  }
  return n;
}

describe("with and without the moves between days", () => {
  // GEN-8.25, GEN-8.26
  it("never leaves a group newly or further short, never a day with more Open cells but the last resort's", () => {
    let fewer = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = sharedCamp(seed);
      mockAcross.off = true;
      const without = generateWeek(camp(spec));
      mockAcross.off = false;
      const withIt = generateWeek(camp(spec));
      if (!without.ok) {
        continue;
      }
      const a = shortBy(spec, without.days);
      const b = shortBy(spec, withIt.days);
      const worse = [...b].filter(([k, n]) => n > (a.get(k) || 0));
      expect([seed, worse]).toEqual([seed, []]);
      const total = (m) => [...m.values()].reduce((x, y) => x + y, 0);
      expect(total(b)).toBeLessThanOrEqual(total(a));
      // Each cell the last resort left Open saved at least one session short (cells the minimum
      // repair left, Open without the moves too, aside).
      const key = (c) => `${c.date}|${c.groupId}|${c.blockId}`;
      const openWithout = new Set(without.openCells.map(key));
      const traded = withIt.openCells.filter(
        (c) => c.why === "trade" && !openWithout.has(key(c))
      ).length;
      expect([seed, total(a) - total(b) >= traded]).toEqual([seed, true]);
      if (total(b) < total(a)) {
        fewer++;
      }
      const openA = openByDate(without);
      const moreOpen = [...openByDate(withIt)].filter(
        ([date, n]) => n > (openA.get(date) || 0)
      );
      expect([seed, moreOpen]).toEqual([seed, []]);
    }
    expect(fewer).toBeGreaterThan(0);
  });
});

// Camp 40: a last-resort chain filled an Open cell (Bunk g1, b1) and left Bunk g4's cell at the
// same time Open instead: that Open cell moved, it isn't a new one, so only the cell the chain
// added says it is Open for Bunk g5's minimum (protocol 8.31). Before, both said so: two Open
// cells "for" one session.
describe("a last-resort chain's Open cells", () => {
  it("camp 40: each says it is Open for a minimum only if the chain added it", () => {
    const spec = sharedCamp(40);
    mockAcross.off = true;
    const without = generateWeek(camp(spec));
    mockAcross.off = false;
    const withIt = generateWeek(camp(spec));
    const before = countsOf(without.days).week;
    const after = countsOf(withIt.days).week;
    // The minimum repair's own such cells, Open without the moves too, aside.
    const cell = (c) => `${c.date}|${c.groupId}|${c.blockId}`;
    const openWithout = new Set(without.openCells.map(cell));
    const trades = new Map();
    for (const c of withIt.openCells.filter(
      (x) => x.why === "trade" && !openWithout.has(cell(x))
    )) {
      const k = `${c.shortGroupId}|${c.shortActivityId}`;
      trades.set(k, (trades.get(k) || 0) + 1);
    }
    for (const [k, n] of trades) {
      const gained = (after.get(k) || 0) - (before.get(k) || 0);
      expect([k, n <= gained]).toEqual([k, true]);
    }
    expect(
      withIt.openCells.some(
        (c) =>
          c.why === "trade" &&
          c.date === "2026-07-08" &&
          c.groupId === "g4" &&
          c.blockId === "b1"
      )
    ).toBe(false);
  });
});

describe("kept cells never move", () => {
  const SEED = 123;
  const spec = sharedCamp(SEED);
  const built = generateWeek(camp(spec));
  const dates = camp(spec).days.map((d) => d.dateValue);
  // What the moves between days changed, put back by hand where they took something out.
  const handEdits = minimumMoves(built)
    .filter((m) => m.from)
    .map((m) => ({
      day: dates.indexOf(m.date),
      group: m.groupId,
      block: m.blockId,
      act: m.from
    }));

  // GEN-8.25
  it("leaves a locked hand edit where the director put it", () => {
    expect(handEdits.length).toBeGreaterThan(0);
    const locked = {
      ...spec,
      cells: handEdits,
      locks: handEdits.map((c) => ({
        date: dates[c.day],
        groupId: c.group,
        blockId: c.block
      }))
    };
    const input = camp(locked);
    const result = generateWeek(input);
    const grid = cellsOf(result.days);
    for (const c of handEdits) {
      const b = spec.blocks.findIndex((x) => x.id === c.block);
      expect([c, grid[c.day][c.group][b].id]).toEqual([c, c.act]);
    }
    const isLocked = new Set(
      input.locks.map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
    );
    for (const m of result.moved) {
      expect(isLocked.has(`${m.date}|${m.groupId}|${m.blockId}`)).toBe(false);
    }
  });

  // GEN-8.25
  it("in fill the open cells, keeps every filled cell as it was", () => {
    // The built week with the cells it moved emptied: every other cell is kept.
    const moved = new Set(
      minimumMoves(built).map(
        (m) => `${dates.indexOf(m.date)}|${m.groupId}|${m.blockId}`
      )
    );
    const cells = [];
    cellsOf(built.days).forEach((byGroup, d) => {
      for (const [g, row] of Object.entries(byGroup)) {
        row.forEach((cell, b) => {
          const block = spec.blocks[b].id;
          if (
            cell &&
            cell.kind === "A" &&
            cell.head &&
            !moved.has(`${d}|${g}|${block}`)
          ) {
            cells.push({ day: d, group: g, block, act: cell.id });
          }
        });
      }
    });
    const result = generateWeek(camp({ ...spec, cells, mode: "fillOpen" }));
    const grid = cellsOf(result.days);
    for (const c of cells) {
      const b = spec.blocks.findIndex((x) => x.id === c.block);
      expect([c, grid[c.day][c.group][b].id]).toEqual([c, c.act]);
    }
  });
});
