/**
 * Rebuild keeps the week (Greg, 2026-10-27; docs/engine/protocol.md section 10): after a setup
 * change, a Rebuild of a week that already has a generated schedule keeps every cell setup still
 * allows, empties and refills only what the change forces, and says each change.
 */
import { generateWeek, MODE } from "c/shoreshEngine";
import { activity, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { problems } from "./data/check";
import { randomCamp } from "./data/randomCamp";
import { sampled } from "shoresh-jest/sample";

// CI builds the first 100 random camps; npm run test:engine:full all 300.
const SEEDS = sampled(300, 100);

const GROUPS = ["g1", "g2", "g3", "g4"].map((id) => group(id));
const BLOCKS = [0, 1, 2, 3].map((i) => block(i));

function spec(over = {}) {
  return {
    groups: GROUPS,
    blocks: BLOCKS,
    days: 5,
    locations: [{ id: "pool", name: "Pool", fit: 1 }],
    activities: [
      activity("swim", { min: 1, max: 3, location: "pool" }),
      activity("arts", { min: 1, max: 4 }),
      activity("sports", { min: 1, max: 4 }),
      activity("drama", { max: 4 }),
      activity("gaga", { max: 4, atOnce: 2 })
    ],
    ...over
  };
}

/** The activities with one changed. */
function withChange(id, over) {
  return spec().activities.map((a) => {
    return a.id === id ? { ...a, ...over } : a;
  });
}

/** Week A, a fresh build; and a Rebuild of it under setup `over`. */
const weekA = generateWeek(camp(spec()));
// As the screen sends it: each weekly minimum as week A was built (notes.mins).
const rebuild = (over = {}, extra = {}) =>
  generateWeek({
    ...camp(spec(over)),
    mode: MODE.KEEP,
    days: weekA.days,
    builtMinimums: weekA.minimums,
    ...extra
  });

/** "d|group|b" -> activity id (or null) for every cell. */
function cells(result) {
  const out = new Map();
  cellsOf(result.days).forEach((day, d) => {
    for (const [g, row] of Object.entries(day)) {
      row.forEach((c, b) => out.set(`${d}|${g}|${b}`, c ? c.id : null));
    }
  });
  return out;
}

function changes(a, b) {
  const before = cells(a);
  return [...cells(b)].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
}

/** A cell the result names, as cells() keys it: "d|group|b" (b: its place among `blocks`). */
const keyIn = (blocks) => (c) =>
  `${[0, 1, 2, 3, 4, 5, 6].find((d) => dateAt(d) === c.date)}|${c.groupId}|${blocks.findIndex((x) => x.id === c.blockId)}`;
const keyOf = keyIn(BLOCKS);

describe("Rebuild keeps the week (protocol section 10)", () => {
  it("builds week A", () => {
    expect(weekA.ok).toBe(true);
    expect(weekA.keep).toBeNull();
  });

  it("10.1: with setup unchanged, a Rebuild changes nothing and says so", () => {
    const b = rebuild();
    expect(changes(weekA, b)).toEqual([]);
    expect(b.keep).toEqual({
      emptied: [],
      moved: [],
      changed: 0,
      filled: 0,
      fresh: false
    });
  });

  it("10.2-10.3: an activity removed empties only its cells, each said, and refilled where anything allowed fits", () => {
    const b = rebuild({
      activities: spec().activities.filter((a) => a.id !== "drama")
    });
    const dramaCells = [...cells(weekA)]
      .filter(([, v]) => v === "drama")
      .map(([k]) => k);
    expect(dramaCells.length).toBeGreaterThan(0);
    // Drama's cells, and any session that was over its weekly max and now has something better.
    const emptied = b.keep.emptied.map(keyOf);
    expect(dramaCells.filter((k) => !emptied.includes(k))).toEqual([]);
    expect(
      b.keep.emptied.filter((e) => !dramaCells.includes(keyOf(e)))
    ).toEqual(
      b.keep.emptied.filter(
        (e) => !dramaCells.includes(keyOf(e)) && e.why === "weeklyMax"
      )
    );
    // Nothing else changed.
    expect(changes(weekA, b).filter((k) => !emptied.includes(k))).toEqual([]);
    // One left Open says why (here: each group has had everything left that day).
    for (const e of b.keep.emptied.filter((x) => !x.refilled)) {
      expect(b.openCells.map(keyOf)).toContain(keyOf(e));
    }
  });

  it("10.3: an activity swapped for a new one lands where the old one was", () => {
    const b = rebuild({
      activities: [
        ...spec().activities.filter((a) => a.id !== "drama"),
        activity("theatre", { max: 4 })
      ]
    });
    const before = cells(weekA);
    for (const [k, v] of cells(b)) {
      expect([k, v]).toEqual([
        k,
        before.get(k) === "drama" ? "theatre" : before.get(k)
      ]);
    }
  });

  it("10.4-10.5: a raised minimum changes only the cells it must, each said", () => {
    const raised = withChange("swim", { min: 4, max: 4 });
    const b = rebuild({ activities: raised });
    const changed = changes(weekA, b);
    expect(b.keep.emptied).toEqual([]);
    expect(changed.sort()).toEqual(b.keep.moved.map(keyOf).sort());
    expect(b.keep.moved.every((m) => m.to === "swim")).toBe(true);
    // As many as the groups were short, no more.
    const swimsA = (g) =>
      [...cells(weekA)].filter(([k, v]) => v === "swim" && k.includes(`|${g}|`))
        .length;
    const short = GROUPS.reduce((n, g) => n + Math.max(0, 4 - swimsA(g.id)), 0);
    expect(b.keep.moved.length).toBeLessThanOrEqual(short);
    expect(b.keep.moved.length).toBeGreaterThan(0);
  });

  it("10.2: a closure added empties and refills only that place's cells", () => {
    const b = rebuild({
      weekExceptions: [{ Id: "we1", Week__c: "week1", Location__c: "pool" }]
    });
    const swimCells = [...cells(weekA)]
      .filter(([, v]) => v === "swim")
      .map(([k]) => k);
    expect(b.keep.emptied.map(keyOf).sort()).toEqual([...swimCells].sort());
    expect(changes(weekA, b).filter((k) => !swimCells.includes(k))).toEqual([]);
    expect([...cells(b).values()]).not.toContain("swim");
  });

  it("10.2: a lowered limit empties only the sessions over it, the later ones", () => {
    const lowered = withChange("gaga", { atOnce: 1 });
    const b = rebuild({ activities: lowered });
    expect(b.keep.emptied.every((e) => e.why === "groupsAtOnce")).toBe(true);
    const emptied = b.keep.emptied.map(keyOf);
    expect(
      changes(weekA, b).filter(
        (k) => !emptied.includes(k) && !b.keep.moved.map(keyOf).includes(k)
      )
    ).toEqual([]);
  });

  it("10.8: locks and hand edits never move", () => {
    const locks = [
      { date: dateAt(0), groupId: "g1", blockId: "b0" },
      { date: dateAt(2), groupId: "g3", blockId: "b2" }
    ];
    const raised = withChange("swim", { min: 4, max: 4 });
    const b = rebuild(
      { activities: raised.filter((a) => a.id !== "arts") },
      { locks }
    );
    const before = cells(weekA);
    const after = cells(b);
    expect(after.get("0|g1|0")).toBe(before.get("0|g1|0"));
    expect(after.get("2|g3|2")).toBe(before.get("2|g3|2"));
    expect(b.keep.moved.map(keyOf)).not.toContain("0|g1|0");
    expect(b.keep.emptied.map(keyOf)).not.toContain("2|g3|2");
  });

  it("10.9: the same Rebuild twice gives the same week, word for word", () => {
    const over = {
      activities: spec()
        .activities.filter((a) => a.id !== "sports")
        .map((a) => (a.id === "swim" ? { ...a, min: 3 } : a))
    };
    expect(JSON.stringify(rebuild(over))).toBe(JSON.stringify(rebuild(over)));
  });

  it("10.1: a week with no activity in it is built in full, as Generate builds it", () => {
    const blank = camp(spec());
    const keep = generateWeek({ ...blank, mode: MODE.KEEP });
    const full = generateWeek(blank);
    expect(keep.days).toEqual(full.days);
    expect(keep.keep).toBeNull();
  });

  it("10.3: two added activities share a deleted one's cells, fewest first", () => {
    const b = rebuild({
      activities: [
        ...spec().activities.filter((a) => a.id !== "drama"),
        activity("theatre", { max: 4 }),
        activity("chess", { max: 4 })
      ]
    });
    // A cell neither fits (once a day, groups at once) is refilled the normal way.
    const took = b.keep.emptied.map((e) => e.with).filter(Boolean);
    const n = (id) => took.filter((x) => x === id).length;
    expect(n("theatre") + n("chess")).toBe(took.length);
    expect(Math.abs(n("theatre") - n("chess"))).toBeLessThanOrEqual(1);
    expect(n("chess")).toBeGreaterThan(0);
  });

  it("10.2: an activity whose place was deleted is emptied, saying so", () => {
    const b = rebuild({ locations: [] });
    const swimCells = [...cells(weekA)]
      .filter(([, v]) => v === "swim")
      .map(([k]) => k);
    expect(b.keep.emptied.map(keyOf).sort()).toEqual([...swimCells].sort());
    expect(b.keep.emptied.every((e) => e.why === "placeGone")).toBe(true);
  });

  it("10.6: a week already short of a minimum, setup unchanged: nothing moves, still listed", () => {
    // Week A built without swim's minimum of 4; the saved week then rebuilt as it was built.
    const short = withChange("swim", { min: 4, max: 4 });
    const saved = generateWeek({
      ...camp(spec({ activities: short })),
      mode: MODE.KEEP,
      days: weekA.days,
      builtMinimums: short.map((a) => [a.id, a.min])
    });
    expect(saved.keep.moved).toEqual([]);
    expect(changes(weekA, saved)).toEqual([]);
    expect(saved.stillNeededBy.some((x) => x.activityId === "swim")).toBe(true);
  });

  it("10.9: a kept week emptier than the imported week is built fresh, and says so", () => {
    // One bunk, one day, three periods: the saved week has Solo in the middle, so a two-period
    // Hike fits nowhere; the imported week has Hike then Solo.
    const s = {
      blocks: [0, 1, 2].map((i) => block(i)),
      activities: [
        activity("hike", { span: 2, max: 5 }),
        activity("solo", { max: 1 })
      ]
    };
    const saved = camp({
      ...s,
      cells: [{ day: 0, group: "g1", block: "b1", act: "solo" }]
    });
    const imported = camp({
      ...s,
      cells: [
        { day: 0, group: "g1", block: "b0", act: "hike" },
        { day: 0, group: "g1", block: "b2", act: "solo" }
      ]
    });
    const b = generateWeek({
      ...camp(s),
      mode: MODE.KEEP,
      days: saved.days,
      imported: imported.days,
      importedName: "Last summer"
    });
    expect(b.keep.fresh).toBe(true);
    expect(b.cells.filled).toBe(3);
  });

  // Random camps (data/randomCamp.js): a Rebuild with setup unchanged changes nothing; with one
  // activity deleted it keeps every other cell, and the week still keeps every rule.
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))(
    "10.1-10.3 on random camp %i",
    (seed) => {
      expect(randomCampFindings(seed)).toEqual([]);
    }
  );
});

/** What a random camp's two Rebuilds break, as lines ([] when nothing). */
function randomCampFindings(seed) {
  const base = { ...randomCamp(seed), mode: "full", locks: [] };
  const a = generateWeek(camp(base));
  if (!a.ok) {
    return [];
  }
  const same = generateWeek({ ...camp(base), mode: MODE.KEEP, days: a.days });
  const out = changes(a, same).map((k) => `unchanged setup moved ${k}`);
  if (same.keep && same.keep.emptied.length) {
    out.push("unchanged setup emptied cells");
  }
  const gone = base.activities[0].id;
  const specB = {
    ...base,
    activities: base.activities.filter((x) => x.id !== gone)
  };
  if (!specB.activities.length) {
    return out;
  }
  const inputB = { ...camp(specB), mode: MODE.KEEP, days: a.days };
  const b = generateWeek(inputB);
  // Every rule holds.
  out.push(...problems(specB, inputB, b));
  if (!b.keep) {
    return out;
  }
  const key = keyIn(base.blocks);
  // Every cell of an emptied placement (a long one says its first cell).
  const said = new Set(b.keep.moved.map(key));
  for (const e of b.keep.emptied) {
    const [d, g, first] = key(e).split("|");
    for (let i = 0; i < e.length; i++) {
      said.add(`${d}|${g}|${Number(first) + i}`);
    }
  }
  const before = cells(a);
  changes(a, b)
    .filter(
      (k) => before.get(k) !== gone && before.get(k) !== null && !said.has(k)
    )
    .forEach((k) => out.push(`changed without a reason: ${k}`));
  return out;
}

// Rule 9.10 with other programs (seed 198): another program doing an activity counts against its
// groups at once, never against its place, so a place the activity has to itself isn't folded
// into groups at once there; the cell is filled, not said to be full.
describe("another program doing an activity at a place it has to itself", () => {
  it("still lets this program's group in up to groups at once", () => {
    const input = camp({
      groups: [group("g1")],
      locations: [{ id: "field", name: "Field", fit: 1 }],
      activities: [activity("hike", { atOnce: 3, location: "field" })],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "09:00",
          activityId: "hike",
          groups: 2
        }
      ]
    });
    const result = generateWeek(input);
    expect(cellsOf(result.days)[0].g1[0]).toEqual(
      expect.objectContaining({ id: "hike" })
    );
    expect(result.openCells).toEqual([]);
  });
});
