/**
 * Step 8, the search before giving up (weekSearch.js): a gap is a bug unless proven unfillable.
 * Its proofs are checked against an exhaustive search written without the engine's code
 * (data/settledRules.js), and its moves against the rules it must keep.
 */
import { NOW, generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { activity, block, camp, cellsOf, group } from "./data/camp";
import { randomCamp } from "./data/randomCamp";
import { settledRules } from "./data/settledRules";
import { sampled } from "shoresh-jest/sample";

// CI checks the first 50; the full run 150 (jest/sample.js).
const SEEDS = sampled(150, 50);
// Reasons that are proofs; BUDGET is the one that isn't, and MIN_COST says a fuller week exists
// only by leaving a minimum short.
const PROOFS = ["overlap", "noneFor", "length", "full", "searched"];

describe("its proofs hold against an exhaustive search", () => {
  const rows = [];
  beforeAll(() => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = randomCamp(seed);
      const input = camp(spec);
      const result = generateWeek(input);
      if (!result.ok) {
        continue;
      }
      const found = settledRules({ spec }, input, result, { exhaustive: true });
      rows.push({ seed, result, found });
    }
  });

  it("builds the camps, and checks real proofs (the exhaustive search finishes on camps with gaps)", () => {
    expect(rows.length).toBeGreaterThan(SEEDS * 0.9);
    const checked = rows.filter(
      (r) =>
        r.result.openCells.some((c) => ["full", "searched"].includes(c.why)) &&
        !r.found.gapIsABug.some((line) => /ran out of budget/.test(line))
    );
    expect(checked.length).toBeGreaterThan(10);
  });

  it("leaves no cell Open that something allowed could go in as it stands", () => {
    const bad = rows.filter((r) =>
      r.found.gapIsABug.some((line) => / Open, but /.test(line))
    );
    expect(bad.map((r) => [r.seed, r.found.gapIsABug])).toEqual([]);
  });

  it("where every Open cell claims a proof, no week fills more within the hard limits", () => {
    const bad = rows.filter(
      (r) =>
        r.result.openCells.every((c) => PROOFS.includes(c.why)) &&
        r.found.gapIsABug.some((line) => /a week exists that fills/.test(line))
    );
    expect(bad.map((r) => [r.seed, r.found.gapIsABug])).toEqual([]);
  });

  it("never breaks a hard limit to fill", () => {
    expect(
      rows.filter((r) => r.found.hardLimits.length).map((r) => r.seed)
    ).toEqual([]);
  });

  it("says plainly when it ran out of work (never silent)", () => {
    for (const r of rows) {
      for (const c of r.result.openCells) {
        expect(c.reason).toBeTruthy();
        expect([...PROOFS, "minCost", "budget"]).toContain(c.why);
      }
    }
  });
});

describe("fills by rearranging what the earlier steps placed", () => {
  const moved = [];
  beforeAll(() => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = randomCamp(seed);
      const input = camp(spec);
      const result = generateWeek(input);
      if (result.ok && result.moved.length) {
        moved.push({ spec, input, result });
      }
    }
  });

  // The cell (date, group, block) in a grid, as cellsOf reads it.
  const cellAt = (spec, days, at) => {
    const d = days.findIndex((x) => x.dateValue === at.date);
    const b = spec.blocks.findIndex((x) => x.id === at.blockId);
    return cellsOf(days)[d][at.groupId][b];
  };

  it("moves things on some camps, says why, and the grid shows each cell's last move", () => {
    expect(moved.length).toBeGreaterThan(5);
    for (const { spec, result } of moved) {
      // A cell may move more than once: its last move is what the week shows.
      const last = new Map(
        result.moved.map((m) => [`${m.date}|${m.groupId}|${m.blockId}`, m])
      );
      for (const m of last.values()) {
        const now = cellAt(spec, result.days, m);
        expect(now ? now.id : null).toBe(m.to);
      }
      for (const m of result.moved) {
        expect(m.from === null && m.to === null).toBe(false);
        expect(["fill", "minimum"]).toContain(m.why);
        // A move to fill names the cells it filled (one for a minimum may swap which is Open).
        expect(m.why === "minimum" || m.toFill.length > 0).toBe(true);
        // Each cell it filled is one of its own moves from Open to an activity (a later move may
        // change it again; the grid's state is checked by each cell's last move above).
        for (const at of m.toFill) {
          expect(
            result.moved.some(
              (x) =>
                x.date === at.date &&
                x.groupId === at.groupId &&
                x.blockId === at.blockId &&
                x.from === null &&
                x.to !== null
            )
          ).toBe(true);
        }
      }
    }
  });

  it("never moves a locked cell or anything kept (fixed, set-time, special)", () => {
    for (const { spec, input, result } of moved) {
      const locked = new Set(
        (input.locks || []).map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
      );
      for (const m of result.moved) {
        expect(locked.has(`${m.date}|${m.groupId}|${m.blockId}`)).toBe(false);
        const was = cellAt(spec, input.days, m);
        expect(!was || was.kind === "A").toBe(true);
      }
    }
  });
});

describe("a gap it can prove", () => {
  it("says every arrangement of the day was tried when the day can't hold more", () => {
    // Three bunks, one block, two activities that fit one bunk each: one bunk must stay Open.
    const result = generateWeek(
      camp({
        groups: [group("g1"), group("g2"), group("g3")],
        days: 1,
        blocks: [block(0)],
        activities: [
          activity("swim", { min: 0, max: 1, atOnce: 1 }),
          activity("arts", { min: 0, max: 1, atOnce: 1 })
        ]
      })
    );
    expect(result.openCells).toHaveLength(1);
    expect(result.openCells[0].why).toBe("full");
  });
});

describe("progress", () => {
  it("says which day and group the search is working on, and the steps never change the week", () => {
    const spec = randomCamp(7);
    const watch = {};
    const seen = [];
    const steps = generateWeekSteps(camp(spec), watch);
    let step = steps.next();
    while (!step.done) {
      if (watch.now) {
        seen.push(watch.now);
      }
      step = steps.next();
    }
    expect(JSON.stringify(step.value)).toBe(
      JSON.stringify(generateWeek(camp(spec)))
    );
    const searching = seen.filter((now) =>
      [NOW.SEARCH, NOW.SEARCH_DAY, NOW.NEEDED].includes(now.code)
    );
    // Every code, and that each kind is said somewhere: progress.test.js.
    for (const now of searching) {
      expect(now.step).toBe(8);
      expect(typeof now.date).toBe("string");
    }
  });
});
