/**
 * The CORE protocol's terms and rules (docs/protocol/core.md), each proved on its own against the
 * real engine: what the definition says a build does with the word. Synthetic camps only.
 */
import { checkGeneratedWeek, generateWeek } from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { sharedCamp } from "./data/sharedCamp";

const run = (spec) => generateWeek(camp(spec));
const ids = (result, d, groupId) =>
  cellsOf(result.days)[d][groupId].map((c) => (c ? c.id : null));
const lock = (day, groupId, blockId) => ({
  date: dateAt(day),
  groupId,
  blockId
});
const handEdited = (spec) =>
  run({
    ...spec,
    locks: (spec.cells || []).map((c) => lock(c.day, c.group, c.block))
  });

describe("CORE layer 1: terms", () => {
  // CORE-1.0
  it("CORE-1.0: the camp's own word is the word the build uses", () => {
    const terms = buildTerms([
      { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
    ]);
    const result = generateWeek({
      ...camp({ activities: [activity("swim")] }),
      days: [],
      terms
    });
    expect(result).toEqual({
      ok: false,
      error: "This Session has no days to build."
    });
  });

  // CORE-1.1
  it("CORE-1.1: any day of the week is planned, weekends included", () => {
    // dateAt(5) and dateAt(6) are Saturday and Sunday.
    const result = run({
      days: [dateAt(5), dateAt(6)],
      activities: [activity("swim"), activity("arts")]
    });
    expect(result.days.map((d) => d.dateValue)).toEqual([dateAt(5), dateAt(6)]);
    expect(result.openCells).toEqual([]);
    expect(result.cells).toEqual({ filled: 2, total: 2 });
  });

  // CORE-1.5
  it("CORE-1.5: a day is one date the week's grid has; nothing is built on any other", () => {
    const result = run({
      days: [dateAt(0), dateAt(2)],
      activities: [activity("swim"), activity("arts")]
    });
    expect(result.days.map((d) => d.dateValue)).toEqual([dateAt(0), dateAt(2)]);
  });

  // CORE-1.7
  it("CORE-1.7: a morning-only group is given nothing in the afternoon", () => {
    const result = run({
      groups: [group("g1", { availability: "MorningOnly" })],
      blocks: [block(0), block(5)],
      activities: [activity("swim"), activity("arts")]
    });
    expect(ids(result, 0, "g1")).toEqual([expect.any(String), null]);
    expect(result.cells.total).toBe(1);
  });

  // CORE-1.8, CORE-3.5
  it("CORE-1.8 CORE-3.5: nothing ticked is every group; a division ticked is exactly its groups", () => {
    const result = run({
      groups: [
        group("g1", { division: "juniors" }),
        group("g2", { division: "juniors" }),
        group("g3", { division: "seniors" })
      ],
      activities: [
        activity("swim", { atOnce: null }),
        activity("arts", { atOnce: null, eligible: ["seniors"] })
      ],
      days: 2
    });
    for (const g of ["g1", "g2"]) {
      expect([at(result, 0, g, 0), at(result, 1, g, 0)]).not.toContain("arts");
      expect([at(result, 0, g, 0), at(result, 1, g, 0)]).toContain("swim");
    }
    expect([at(result, 0, "g3", 0), at(result, 1, "g3", 0)].sort()).toEqual([
      "arts",
      "swim"
    ]);
  });

  // CORE-1.10
  it("CORE-1.10: a location holds only as many groups as fit; blank fits 1", () => {
    const groups = [group("g1"), group("g2"), group("g3")];
    const fits2 = run({
      groups,
      locations: [{ id: "field", fit: 2 }],
      activities: [activity("soccer", { atOnce: null, location: "field" })]
    });
    expect(
      groups.filter((g) => at(fits2, 0, g.id, 0) === "soccer")
    ).toHaveLength(2);
    const blank = run({
      groups,
      locations: [{ id: "field", fit: null }],
      activities: [activity("soccer", { atOnce: null, location: "field" })]
    });
    expect(
      groups.filter((g) => at(blank, 0, g.id, 0) === "soccer")
    ).toHaveLength(1);
  });

  // CORE-1.11
  it("CORE-1.11: groups at once limits an activity, and the smaller of it and groups fit governs", () => {
    const groups = [group("g1"), group("g2"), group("g3")];
    const result = run({
      groups,
      locations: [{ id: "field", fit: 3 }],
      activities: [activity("soccer", { atOnce: 2, location: "field" })]
    });
    expect(
      groups.filter((g) => at(result, 0, g.id, 0) === "soccer")
    ).toHaveLength(2);
  });

  // CORE-1.12
  it("CORE-1.12: the build places only activities, never a fixed or recurring activity", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1), block(2)],
      fixed: [{ id: "lunch", block: "b1" }],
      recurring: [{ id: "flag", block: "b2", groups: ["g1"] }],
      activities: [activity("swim", { atOnce: null }), activity("arts")]
    });
    const kinds = cellsOf(result.days)[0];
    // Every cell the build filled holds an activity; the set-time cells are only where set.
    expect(kinds.g1.map((c) => c && c.kind)).toEqual(["A", "F", "R"]);
    expect(kinds.g2.map((c) => c && c.kind)).toEqual(["A", "F", "A"]);
  });

  // CORE-1.13
  it("CORE-1.13: nothing else is ever put in a fixed activity's block", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      days: 3,
      fixed: [{ id: "lunch", block: "b1" }],
      activities: [
        activity("swim", { atOnce: null, min: 5 }),
        activity("arts", { atOnce: null, min: 5 })
      ]
    });
    for (let d = 0; d < 3; d++) {
      for (const g of ["g1", "g2"]) {
        expect(at(result, d, g, 1)).toBe("lunch");
      }
    }
  });

  // CORE-1.14
  it("CORE-1.14: a recurring activity leaves its block free for the groups it isn't for", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      fixed: [],
      recurring: [{ id: "lunch", block: "b0", groups: ["g1"] }],
      activities: [activity("swim")]
    });
    expect(at(result, 0, "g1", 0)).toBe("lunch");
    expect(at(result, 0, "g2", 0)).toBe("swim");
  });

  // CORE-1.15
  it("CORE-1.15: set-time cells, fixed and recurring alike, are decided before building and kept", () => {
    const spec = {
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      days: 2,
      fixed: [{ id: "lunch", block: "b0" }],
      recurring: [{ id: "flag", block: "b1", groups: ["g2"] }],
      activities: [activity("swim", { atOnce: null, min: 2 })]
    };
    const result = run(spec);
    for (let d = 0; d < 2; d++) {
      expect(ids(result, d, "g1")).toEqual(["lunch", "swim"]);
      expect(ids(result, d, "g2")).toEqual(["lunch", "flag"]);
    }
    // g2 is short of swim rather than losing its set time.
    expect(result.stillNeededBy).toEqual([
      { activityId: "swim", groupId: "g2", missing: 2 }
    ]);
  });

  // CORE-1.17
  it("CORE-1.17: a special day takes the regular day's place: its date is not built", () => {
    const input = camp({
      days: 2,
      activities: [activity("swim"), activity("arts")]
    });
    const result = generateWeek({ ...input, replacedDates: [dateAt(1)] });
    expect(result.days[1]).toEqual(input.days[1]);
    expect(at(result, 1, "g1", 0)).toBeNull();
    expect(result.cells.total).toBe(1);
  });

  // CORE-1.18
  it("CORE-1.18: a placement is one group, one activity, one run of blocks, one day", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("hike", { span: 2, min: 1 })]
    });
    const row = cellsOf(result.days)[0].g1;
    expect(row).toEqual([
      { kind: "A", id: "hike", head: true },
      { kind: "A", id: "hike", head: false }
    ]);
    expect(result.stillNeededBy).toEqual([]);
  });

  // CORE-1.19, CORE-5.9
  it("CORE-1.19 CORE-5.9: a short week keeps the minimum by default, and shows what is short as still needed", () => {
    const result = run({
      days: 2,
      activities: [activity("swim", { min: 3 }), activity("arts")]
    });
    expect(result.minimums).toEqual([
      ["swim", 3],
      ["arts", 0]
    ]);
    expect(result.stillNeededBy).toEqual([
      { activityId: "swim", groupId: "g1", missing: 1 }
    ]);
    expect(result.stillNeeded).toEqual(["swim · Bunk g1: 1 still needed"]);
  });

  // CORE-1.20
  it("CORE-1.20: the maximum is the limit the build may exceed, and it says so where it does", () => {
    const result = run({ days: 3, activities: [activity("swim", { max: 1 })] });
    expect([0, 1, 2].map((d) => at(result, d, "g1", 0))).toEqual([
      "swim",
      "swim",
      "swim"
    ]);
    expect(result.flags.map((f) => f.reason)).toEqual([
      "Over its weekly limit",
      "Over its weekly limit"
    ]);
  });

  // CORE-1.22
  it("CORE-1.22: a locked placement and a locked open cell stay when the week is built again", () => {
    const result = run({
      blocks: [block(0), block(1)],
      days: 2,
      cells: [{ day: 0, group: "g1", block: "b0", act: "arts" }],
      locks: [lock(0, "g1", "b0"), lock(1, "g1", "b1")],
      activities: [
        activity("swim", { min: 2 }),
        activity("arts"),
        activity("drama")
      ]
    });
    expect(at(result, 0, "g1", 0)).toBe("arts");
    expect(at(result, 1, "g1", 1)).toBeNull();
    expect(at(result, 1, "g1", 0)).not.toBeNull();
  });

  // CORE-1.23
  it("CORE-1.23: a hand edit is always kept, even one that breaks a limit, and is shown", () => {
    const result = handEdited({
      groups: [group("g1"), group("g2")],
      activities: [activity("swim", { atOnce: 1 })],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g2", block: "b0", act: "swim" }
      ]
    });
    expect([at(result, 0, "g1", 0), at(result, 0, "g2", 0)]).toEqual([
      "swim",
      "swim"
    ]);
    expect(result.overlapping.map((o) => o.groupId)).toEqual(["g1", "g2"]);
  });

  // CORE-1.24
  it("CORE-1.24: a closed activity, or one at a closed location, does not run that week", () => {
    const result = run({
      days: 3,
      locations: [{ id: "pool", fit: 1 }],
      activities: [
        activity("swim", { location: "pool", min: 3 }),
        activity("arts", { min: 3 }),
        activity("drama")
      ],
      weekExceptions: [
        { Id: "we1", Week__c: "week1", Location__c: "pool" },
        { Id: "we2", Week__c: "week1", Activity__c: "arts" }
      ]
    });
    const placed = [0, 1, 2].map((d) => at(result, d, "g1", 0));
    expect(placed).not.toContain("swim");
    expect(placed).not.toContain("arts");
    expect(result.minimums.map(([id]) => id)).toEqual(["drama"]);
  });

  // CORE-1.25
  it("CORE-1.25: an away group's cells do not exist for building", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      days: 2,
      away: { g2: [1] },
      activities: [
        activity("swim", { atOnce: null }),
        activity("arts", { atOnce: null })
      ]
    });
    expect(result.cells.total).toBe(3);
    expect(result.days[1].groups.map((g) => g.id)).toEqual(["g1"]);
  });

  // CORE-1.29, CORE-6.1
  it("CORE-1.29 CORE-6.1: two groups at one location at once is a conflict, kept and shown on both", () => {
    const result = handEdited({
      groups: [group("g1"), group("g2")],
      locations: [{ id: "pool", fit: 1 }],
      activities: [
        activity("swim", { atOnce: null, location: "pool" }),
        activity("dive", { atOnce: null, location: "pool" })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g2", block: "b0", act: "dive" }
      ]
    });
    expect([at(result, 0, "g1", 0), at(result, 0, "g2", 0)]).toEqual([
      "swim",
      "dive"
    ]);
    expect(result.overlapping.map((o) => o.groupId)).toEqual(["g1", "g2"]);
    expect(result.overlapping.every((o) => o.text)).toBe(true);
  });

  // CORE-1.30
  it("CORE-1.30: an open cell is one no activity fills, and it carries its reason", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("swim")]
    });
    expect(result.openCells).toHaveLength(1);
    expect(
      at(result, 0, "g1", result.openCells[0].blockId === "b0" ? 0 : 1)
    ).toBeNull();
    expect(result.openCells[0].reason).toEqual(expect.any(String));
    expect(result.openCells[0].reason.length).toBeGreaterThan(0);
  });

  // CORE-1.31
  it("CORE-1.31: still needed is how many placements a group is short of a minimum", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      days: 2,
      activities: [
        activity("swim", { min: 2, atOnce: 1 }),
        activity("arts", { atOnce: null })
      ]
    });
    // Two days, one at a time: swim can give 2 placements in all, of the 4 the groups need.
    const missing = result.stillNeededBy.reduce((n, s) => n + s.missing, 0);
    expect(missing).toBe(2);
    expect(result.stillNeededBy.every((s) => s.activityId === "swim")).toBe(
      true
    );
  });

  // CORE-1.32, CORE-5.4
  it("CORE-1.32 CORE-5.4: back-to-back days are fine; spread never costs a minimum", () => {
    // Swim's minimum of 2 needs both days of a two-day week: back to back.
    const result = run({
      days: 2,
      activities: [activity("swim", { min: 2 }), activity("arts", { min: 0 })]
    });
    expect([at(result, 0, "g1", 0), at(result, 1, "g1", 0)]).toEqual([
      "swim",
      "swim"
    ]);
    expect(result.stillNeededBy).toEqual([]);
  });

  // CORE-1.32, CORE-5.4
  it("CORE-1.32 CORE-5.4: spread never costs a High priority placement", () => {
    // Early in the week by Monday: one High activity that only fits the last day.
    const result = run({
      days: 2,
      groups: [group("g1")],
      cells: [{ day: 0, group: "g1", block: "b0", act: "arts" }],
      locks: [lock(0, "g1", "b0")],
      activities: [
        activity("swim", {
          priority: "High",
          early: { count: 1, day: "Monday" }
        }),
        activity("arts", { priority: "Low" })
      ]
    });
    expect(at(result, 1, "g1", 0)).toBe("swim");
  });
});

describe("CORE layer 5: placement order", () => {
  // CORE-5.2
  it("CORE-5.2: a minimum is placed before a High priority activity with none", () => {
    const result = run({
      activities: [
        activity("swim", { priority: "High", min: 0 }),
        activity("arts", { priority: "Low", min: 1 })
      ]
    });
    expect(at(result, 0, "g1", 0)).toBe("arts");
    expect(result.stillNeededBy).toEqual([]);
  });
});

describe("CORE layer 6: explanation", () => {
  // CORE-6.7
  it("CORE-6.7: problems are worked out from the week as it stands; nothing stored is read", () => {
    const spec = {
      days: 2,
      activities: [activity("swim", { min: 1 }), activity("arts")]
    };
    const has = camp({
      ...spec,
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }]
    });
    expect(checkGeneratedWeek(has).checked.stillNeeded).toEqual([]);
    // The same week with swim taken out: the problem appears, from the cells alone.
    const without = camp({
      ...spec,
      cells: [{ day: 0, group: "g1", block: "b0", act: "arts" }]
    });
    expect(checkGeneratedWeek(without).checked.stillNeeded).toEqual([
      "swim · Bunk g1: 1 still needed"
    ]);
  });
});

describe("GEN rules", () => {
  // GEN-1.8
  it("GEN-1.8: a length below 1 block is 1; a minimum below 0 is 0", () => {
    const result = run({
      activities: [activity("swim", { span: 0, min: -2 })]
    });
    expect(result.minimums).toEqual([["swim", 0]]);
    expect(cellsOf(result.days)[0].g1).toEqual([
      { kind: "A", id: "swim", head: true }
    ]);
  });

  // GEN-6.2
  it("GEN-6.2: the group that has had an activity least gets it first; nothing spaces it across days", () => {
    // g1 has swim on day 0 (locked); on day 1 swim (one at a time) goes to g2, who has had none.
    const result = run({
      groups: [group("g1"), group("g2")],
      days: 2,
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }],
      locks: [lock(0, "g1", "b0")],
      activities: [
        activity("swim", { atOnce: 1 }),
        activity("arts", { atOnce: null })
      ]
    });
    expect(at(result, 1, "g2", 0)).toBe("swim");
    // One group, nothing else to do: the same activity on back-to-back days.
    const alone = run({ days: 2, activities: [activity("swim")] });
    expect([at(alone, 0, "g1", 0), at(alone, 1, "g1", 0)]).toEqual([
      "swim",
      "swim"
    ]);
  });

  // GEN-7.4
  it("GEN-7.4: past every weekly limit, high priority goes over first", () => {
    const result = run({
      days: 3,
      activities: [
        activity("arts", { priority: "Low", max: 1 }),
        activity("swim", { priority: "High", max: 1 })
      ]
    });
    const placed = [0, 1, 2].map((d) => at(result, d, "g1", 0));
    expect(placed.filter((p) => p === "swim")).toHaveLength(2);
    expect(placed.filter((p) => p === "arts")).toHaveLength(1);
  });

  // GEN-8.16
  it("GEN-8.16: a gap kept so a minimum is met names the group and activity it would leave short", () => {
    // Random camp 40 (desktopDifferential.test.js) has such a gap.
    const spec = sharedCamp(40);
    const result = generateWeek(camp(spec));
    const kept = result.openCells.filter((c) =>
      c.reason.startsWith("Filling it would leave")
    );
    expect(kept.length).toBeGreaterThan(0);
    for (const c of kept) {
      const g = spec.groups.find((x) => x.id === c.shortGroupId);
      const a = spec.activities.find((x) => x.id === c.shortActivityId);
      expect(c.reason).toBe(
        `Filling it would leave ${g.name} short of ${a.name}`
      );
    }
  });
});
