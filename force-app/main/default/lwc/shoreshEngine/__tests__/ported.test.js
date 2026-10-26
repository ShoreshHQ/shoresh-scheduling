/**
 * The desktop generator's tests (Scheduling-Project- src/engine/buildSchedule*.test.js), ported
 * to Salesforce's shapes. Desktop words map as: UNDERSERVED -> a "still needed" line;
 * UNFILLABLE -> a flagged cell (Generated Schedule never leaves one blank); max_groups_per_slot
 * -> Groups at once; a camp seed -> the option number; preplaced slots -> locked cells.
 */
import { generateWeek } from "c/shoreshEngine";
import { mulberry32 } from "../random";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { problems } from "./data/check";
import { camp166, camp93 } from "./data/repairCamps";
import { sampled } from "shoresh-jest/sample";

const run = (spec) => generateWeek(camp(spec));
const short = (result) => ({
  stillNeeded: result.stillNeeded.length,
  flagged: result.flags.length
});
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** A group's runs of one activity: [{ day, blocks: [index...] }]. */
function runsOf(result, groupId, actId) {
  const out = [];
  cellsOf(result.days).forEach((byGroup, d) => {
    (byGroup[groupId] || []).forEach((cell, b) => {
      if (cell && cell.id === actId) {
        if (cell.head) {
          out.push({ day: d, blocks: [b] });
        } else {
          out[out.length - 1].blocks.push(b);
        }
      }
    });
  });
  return out;
}

// buildSchedule.test.js, "repair pass fills a tight but feasible week" (audit #20): 4 groups x
// 20 cells, 4 activities each up to 5 a week and one group at a time. Exactly 20 placements per
// group exist (a Latin square each day); greedy alone left 6 blank.
describe("repair pass fills a tight but feasible week", () => {
  const spec = {
    groups: ids("g", 4).map((id) => group(id)),
    days: 5,
    blocks: ids("", 4).map((_, i) => block(i)),
    activities: ["arts", "boat", "climb", "dance"].map((id) =>
      activity(id, { max: 5, atOnce: 1 })
    )
  };

  it("bends nothing and keeps every hard rule", () => {
    const input = camp(spec);
    const result = generateWeek(input);
    expect(result.flags).toEqual([]);
    expect(problems(spec, input, result)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(run(spec)).toEqual(run(spec));
  });

  it("does not leave a weekly minimum short to fill a cell", () => {
    const withMins = {
      ...spec,
      activities: spec.activities.map((a, i) => ({
        ...a,
        min: i === 0 ? 5 : 0,
        priority: i === 0 ? "High" : "Low"
      }))
    };
    expect(short(run(withMins)).stillNeeded).toBe(0);
  });

  it("never lifts an activity below its minimum to fill another group", () => {
    // h holds A (min 1) in the one shared place; g can only do C there.
    const result = run({
      groups: [group("h"), group("g")],
      locations: [{ id: "P", name: "Pool", fit: 1 }],
      activities: [
        activity("A", { min: 1, location: "P", atOnce: null, eligible: ["h"] }),
        activity("C", { location: "P", atOnce: null, eligible: ["g"] }),
        activity("D", { priority: "Low", atOnce: null, eligible: ["h"] })
      ]
    });
    expect(short(result).stillNeeded).toBe(0);
  });
});

// buildSchedule.capacityMatching.test.js (T380): in a week that fits exactly, activities capped to
// one group at a time compete for the same cells; the slot-by-slot matching must fill it.
describe("capped activities in an exactly fitting week (T380)", () => {
  const N = 8;
  const groups = ids("g", N).map((id) => group(id));
  const blocks = [block(1), block(2)];
  const singles = ids("a", N).map((id, i) =>
    activity(id, {
      min: 1,
      max: 1,
      atOnce: 1,
      priority: i % 2 ? "Low" : "High"
    })
  );
  const spec = (over = {}) => ({
    groups,
    days: 4,
    blocks,
    activities: singles,
    ...over
  });

  it("8 groups x 8 cells x 8 one-group-at-a-time activities: nothing short on options 1..100", () => {
    const bad = [];
    for (let option = 1; option <= 100; option++) {
      const r = short(run(spec({ option })));
      if (r.stillNeeded || r.flagged) {
        bad.push(`option ${option}: ${JSON.stringify(r)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("never moves a locked cell", () => {
    const cells = [{ day: 2, group: "g3", block: "b2", act: "a5" }];
    const locks = [{ date: dateAt(2), groupId: "g3", blockId: "b2" }];
    for (let option = 1; option <= 30; option++) {
      expect(at(run(spec({ option, cells, locks })), 2, "g3", 1)).toBe("a5");
    }
  });

  it("a double-block activity among the capped ones stays one contiguous session", () => {
    const ropes = activity("ropes", { span: 2, atOnce: 4, min: 1, max: 1 });
    const bad = [];
    for (let option = 1; option <= 30; option++) {
      const result = run(
        spec({ option, activities: [...singles.slice(0, N - 2), ropes] })
      );
      for (const g of groups) {
        const runs = runsOf(result, g.id, "ropes");
        if (runs.length !== 1 || runs[0].blocks.length !== 2) {
          bad.push(`option ${option} ${g.id}: ${JSON.stringify(runs)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("a low-priority capped activity never starves a high-priority uncapped minimum (options 1..100)", () => {
    const swim = activity("swim", { min: 2, max: 2, atOnce: null });
    const capped = singles
      .slice(0, N - 2)
      .map((a) => ({ ...a, priority: "Low" }));
    const bad = [];
    for (let option = 1; option <= 100; option++) {
      const result = run(spec({ option, activities: [swim, ...capped] }));
      const swimShort = groups.filter(
        (g) => runsOf(result, g.id, "swim").length < 2
      ).length;
      const r = short(result);
      if (swimShort || r.stillNeeded || r.flagged) {
        bad.push(
          `option ${option}: swimShort ${swimShort} ${JSON.stringify(r)}`
        );
      }
    }
    expect(bad).toEqual([]);
  });

  // CI tries options 1..25; the full run 1..100 (jest/sample.js).
  const spareOptions = sampled(100, 25);
  it(`one spare cell per group (9 cells, 8 capped activities) still meets every minimum (options 1..${spareOptions})`, () => {
    const bad = [];
    for (let option = 1; option <= spareOptions; option++) {
      const r = short(
        run(spec({ option, days: 3, blocks: [block(1), block(2), block(3)] }))
      );
      if (r.stillNeeded) {
        bad.push(`option ${option}: ${JSON.stringify(r)}`);
      }
    }
    // The minimum repair may leave the cell a move empties for never-blank to fill, as long as
    // no more cells are left Open than before (ADR 0010): 0 of 1,000 options short.
    expect(bad).toEqual([]);
  });

  it("option 139 (the review's repro): the minimum repair makes the move", () => {
    const r = run(
      spec({ option: 139, days: 3, blocks: [block(1), block(2), block(3)] })
    );
    expect(r.stillNeeded).toEqual([]);
  });

  it("capped activities sharing a location with a tight capacity still fill (options 1..100)", () => {
    const half = singles.map((a, i) => ({
      ...a,
      atOnce: 2,
      location: i < 4 ? "locA" : "locB"
    }));
    const locations = [
      { id: "locA", fit: 4 },
      { id: "locB", fit: 4 }
    ];
    const bad = [];
    for (let option = 1; option <= 100; option++) {
      const r = short(run(spec({ option, activities: half, locations })));
      if (r.stillNeeded || r.flagged) {
        bad.push(`option ${option}: ${JSON.stringify(r)}`);
      }
    }
    // The desktop pins this at 2 of 100 short (a location's capacity is checked per seat, with
    // no swap through it). Pinned here so it cannot get worse.
    expect(bad.length).toBeLessThanOrEqual(2);
  });
});

// buildSchedule.minRepair.test.js: greedy can fill every cell yet leave an activity below its
// weekly minimum; the min repair lifts surplus placements and gives the cells to the short one.
describe("no activity left below its minimum when the week can hold it", () => {
  const spec = (activities) => ({ blocks: [block(1), block(2)], activities });
  const a = (id, over) => activity(id, { max: 5, atOnce: null, ...over });

  it("a low-priority two-block activity displaces high-priority singles that have no minimum", () => {
    const result = run(
      spec([
        a("Archery"),
        a("Drama"),
        a("Hike", { priority: "Low", span: 2, min: 1 })
      ])
    );
    expect(result.stillNeeded).toEqual([]);
    expect(runsOf(result, "g1", "Hike")).toEqual([{ day: 0, blocks: [0, 1] }]);
  });

  it("a single-block activity short of its minimum takes a cell from one above its own", () => {
    const result = run(
      spec([a("Archery"), a("Drama"), a("Swim", { priority: "Low", min: 1 })])
    );
    expect(result.stillNeeded).toEqual([]);
  });

  it("never lifts an activity below its own minimum to do it", () => {
    const result = run(
      spec([
        a("Archery", { min: 1 }),
        a("Drama", { min: 1 }),
        a("Hike", { priority: "Low", span: 2, min: 1 })
      ])
    );
    expect(result.stillNeeded).toEqual(["Hike · Bunk g1: 1 still needed"]);
  });

  it("doesn't meet a minimum by leaving a cell Open that wasn't (no extra bend for it)", () => {
    // Lifting the hike to fit swim would leave its second block for never-blank to bend.
    const result = run({
      blocks: [block(1), block(2)],
      activities: [
        a("Hike", { span: 2, max: 1 }),
        a("Swim", { priority: "Low", min: 1, max: 1 })
      ]
    });
    expect(runsOf(result, "g1", "Hike")).toEqual([{ day: 0, blocks: [0, 1] }]);
    expect(result.flags).toEqual([]);
    expect(result.stillNeeded).toEqual(["Swim · Bunk g1: 1 still needed"]);
  });

  // ADR 0010: when the minimum repair left a cell for never-blank, the engine keeps that week only
  // if it is no worse than the week built without the leniency.
  it("camp 166 (coordinator's review): no extra bends from the minimum repair", () => {
    const result = run(camp166);
    expect(result.flags).toEqual([]);
    // 26 before step 8's search (PR 4a); it meets two more by rearranging days, and one more
    // by moving sessions between days.
    expect(result.stillNeeded).toHaveLength(23);
  });

  it("camp 93: the week without the leniency has fewer bends for the same minimums", () => {
    // Lenient alone: two sessions past their weekly limits; without it, one. Step 8's search
    // (PR 4a) then meets the last minimum by rearranging a day.
    const result = run(camp93);
    expect(result.stillNeeded).toHaveLength(0);
    expect(
      result.flags.map((f) => [f.groupId, f.activityId, f.reason])
    ).toEqual([["g1", "a3", "Over its weekly limit"]]);
  });

  // The desktop's acceptance rule in miniature: build a full week, read the rules off it the way
  // an import does (min = lowest weekly count, max = highest; groups at once = most seen
  // together; who = groups seen), then Generate must place every minimum.
  function feasibleWeek(seed) {
    const r = mulberry32(seed);
    const nG = 2 + Math.floor(r() * 4);
    const nD = 2 + Math.floor(r() * 3);
    const nB = 2 + Math.floor(r() * 3);
    const nA = nB * nD + Math.floor(r() * 3);
    const groups = ids("g", nG).map((id) => group(id));
    const blocks = ids("", nB).map((_, i) => block(i + 1));
    const names = ids("A", nA);
    const week = [];
    for (const g of groups) {
      for (let d = 0; d < nD; d++) {
        const pool = names.slice();
        for (const b of blocks) {
          const k = Math.floor(r() * pool.length);
          week.push({ g: g.id, d, b: b.id, a: pool.splice(k, 1)[0] });
        }
      }
    }
    const count = new Map();
    const share = new Map();
    const seen = new Map();
    for (const c of week) {
      count.set(`${c.a}|${c.g}`, (count.get(`${c.a}|${c.g}`) || 0) + 1);
      share.set(
        `${c.a}|${c.d}|${c.b}`,
        (share.get(`${c.a}|${c.d}|${c.b}`) || 0) + 1
      );
      if (!seen.has(c.a)) {
        seen.set(c.a, new Set());
      }
      seen.get(c.a).add(c.g);
    }
    const activities = names
      .filter((n) => seen.has(n))
      .map((n) => {
        const per = [...seen.get(n)].map((g) => count.get(`${n}|${g}`));
        const cap = Math.max(
          ...[...share].filter(([k]) => k.startsWith(`${n}|`)).map(([, v]) => v)
        );
        return activity(n, {
          min: Math.min(...per),
          max: Math.max(...per),
          atOnce: cap,
          eligible: [...seen.get(n)]
        });
      });
    return {
      spec: {
        groups,
        days: nD,
        blocks,
        activities,
        programId: `feasible-${seed}`
      },
      week
    };
  }

  it("places every minimum on 1000 seeded weeks known to be feasible", () => {
    const misses = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const { spec: base, week } = feasibleWeek(seed);
      // Every fifth week locks each group's first cell to what the known week holds there.
      const lockFirst = seed % 5 === 0;
      const cells = lockFirst
        ? base.groups.map((g) => ({
            day: 0,
            group: g.id,
            block: "b1",
            act: week.find((c) => c.g === g.id && c.d === 0 && c.b === "b1").a
          }))
        : [];
      const locks = cells.map((c) => ({
        date: dateAt(0),
        groupId: c.group,
        blockId: "b1"
      }));
      const result = run({ ...base, cells, locks });
      for (const c of cells) {
        if (at(result, 0, c.group, 0) !== c.act) {
          misses.push(`${seed}: lock ${c.group} moved`);
        }
      }
      const r = short(result);
      if (r.stillNeeded || r.flagged) {
        misses.push(`${seed}: ${JSON.stringify(r)}`);
      }
    }
    expect(misses).toEqual([]);
  });
});

// buildSchedule.spansFirst.test.js (F5): a multi-block activity is one session of N contiguous
// blocks, placed first in its priority round, and the repair fills one whole, never split.
describe("multi-block activities are placed first, contiguously, as one session", () => {
  const groups = ids("g", 6).map((id) => group(id));
  const blocks = ids("", 6).map((_, i) => block(i));
  const a = (id, over = {}) =>
    activity(id, { min: 4, max: 6, atOnce: 2, ...over });
  const singles = ids("s", 6).map((id) => a(id));
  const ropes = a("ropes", { span: 2, min: 2, max: 4, atOnce: 3 });
  // A fixed activity at each listed block, every day: at blocks 1 and 4 of 6 the only two-block
  // run left in a day is blocks 2-3.
  const fixedAt = (list) =>
    list.map((b) => ({ id: `fe${b}`, name: "Lunch", block: `b${b}` }));
  const spec = (activities, fixed = [1, 4], bl = blocks) => ({
    groups,
    days: 5,
    blocks: bl,
    activities,
    fixed: fixedAt(fixed)
  });

  it("every group gets its weekly minimum of sessions, each a contiguous run in one day", () => {
    const result = run(spec([...singles, ropes]));
    for (const g of groups) {
      const runs = runsOf(result, g.id, "ropes");
      expect(runs).toHaveLength(2);
      for (const r of runs) {
        expect(r.blocks).toHaveLength(2);
        expect(r.blocks[1] - r.blocks[0]).toBe(1);
      }
    }
    expect(
      result.stillNeeded.filter((line) => line.startsWith("ropes ·"))
    ).toEqual([]);
  });

  it("a 3-block activity goes in the only 3-block runs a day has (either side of a midday fixed activity)", () => {
    const wild = a("wild", { span: 3, min: 1, max: 3 });
    const seven = ids("", 7).map((_, i) => block(i));
    const result = run(spec([...singles, wild], [3], seven));
    for (const g of groups) {
      const runs = runsOf(result, g.id, "wild");
      expect(runs).toHaveLength(1);
      const [first] = runs[0].blocks;
      expect(runs[0].blocks).toEqual([first, first + 1, first + 2]);
    }
  });

  it("repair fills empty cells with a whole multi-block activity, never a split one", () => {
    const capped = ["s1", "s2"].map((id) =>
      a(id, { min: 0, max: 1, atOnce: 1 })
    );
    const span = a("span", {
      span: 2,
      min: 0,
      max: 2,
      atOnce: 1,
      priority: "Low"
    });
    const result = run({
      groups: [groups[0]],
      days: 2,
      blocks: blocks.slice(0, 3),
      activities: [...capped, span]
    });
    expect(result.flags).toEqual([]);
    const runs = runsOf(result, "g0", "span");
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.blocks[1] - r.blocks[0]).toBe(1);
    }
  });

  it("is deterministic", () => {
    expect(run(spec([...singles, ropes]))).toEqual(
      run(spec([...singles, ropes]))
    );
  });

  const cases = [];
  for (const length of [2, 3]) {
    for (const fixed of [[], [1], [2], [1, 4], [3]]) {
      for (const min of [1, 2, 3]) {
        cases.push([length, fixed, min]);
      }
    }
  }
  it.each(cases)(
    "groups at once holds in every block it covers, unless flagged (length %i, fixed at %j, min %i)",
    (length, fixed, min) => {
      const tight = a("ropes", { span: length, min, max: 5, atOnce: 1 });
      const s = spec([...singles.slice(0, 3), tight], fixed);
      const input = camp(s);
      expect(problems(s, input, generateWeek(input))).toEqual([]);
    }
  );

  it("keeps an early-in-the-week goal: both sessions by Tuesday when there is room", () => {
    const early = a("ropes", {
      span: 2,
      min: 2,
      max: 4,
      atOnce: 6,
      early: { count: 2, day: "Tuesday" }
    });
    const result = run(spec([...singles, early]));
    for (const g of groups) {
      expect(runsOf(result, g.id, "ropes").map((r) => r.day)).toEqual([0, 1]);
    }
    expect(result.spread).toEqual([]);
  });
});

// buildSchedule.overlappingBlocks.test.js (audit A6): blocks that overlap in clock time hold one
// placement per group.
describe("time-overlapping blocks", () => {
  const early = block(0, { id: "e", startTime: "09:00", endTime: "10:00" });
  const late = block(1, { id: "l", startTime: "09:30", endTime: "10:30" });
  const base = {
    groups: [group("g1"), group("g2")],
    blocks: [early, late],
    activities: ["a", "b", "c"].map((id) =>
      activity(id, { max: 10, atOnce: null })
    )
  };
  const filled = (result, g) =>
    cellsOf(result.days)[0][g].filter(Boolean).length;

  it("never places a group in both of two overlapping blocks", () => {
    const result = run(base);
    expect([filled(result, "g1"), filled(result, "g2")]).toEqual([1, 1]);
  });

  it("does not place an activity overlapping a fixed activity", () => {
    const result = run({
      ...base,
      fixed: [{ id: "fe", name: "Flagpole", block: "e" }]
    });
    expect(cellsOf(result.days)[0].g1).toEqual([
      { kind: "F", id: "fe", head: true },
      null
    ]);
  });

  it("does not let a multi-block activity's later block overlap another placement", () => {
    const b0 = block(0, { id: "b0", startTime: "08:00", endTime: "09:00" });
    const b1 = block(1, { id: "b1", startTime: "09:00", endTime: "10:00" });
    const b2 = block(2, { id: "b2", startTime: "09:30", endTime: "10:30" });
    const result = run({
      groups: [group("g1")],
      blocks: [b0, b1, b2],
      activities: [
        activity("a", { max: 10 }),
        activity("dbl", { span: 2, max: 10 })
      ],
      cells: [{ day: 0, group: "g1", block: "b2", act: "a" }],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b2" }]
    });
    expect(at(result, 0, "g1", 1)).toBeNull();
  });

  it("treats blocks that merely touch as not overlapping", () => {
    const touching = block(1, {
      id: "t",
      startTime: "10:00",
      endTime: "11:00"
    });
    expect(filled(run({ ...base, blocks: [early, touching] }), "g1")).toBe(2);
  });
});
