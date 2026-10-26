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

// The differential's camps (data/sharedCamp.js): CI checks the first 60, the full run 200.
const SEEDS = sampled(200, 60);
// Differential camps where a group's minimum is met only by moving sessions between days.
const ACROSS_SEEDS = [123, 210];

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
    // Before this pass: camp 123 had 11 lines still needed, camp 210 had 9.
    const short = ACROSS_SEEDS.map(
      (seed) => generateWeek(camp(sharedCamp(seed))).stillNeededBy.length
    );
    expect(short).toEqual([10, 8]);
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
