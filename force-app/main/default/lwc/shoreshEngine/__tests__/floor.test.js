/**
 * Step 8's floor (care plan step 8, Greg 2026-10-25; protocol 8.19-8.23): a full build is never
 * emptier than the week as it was imported. The imported week is the floor; locks and hand edits
 * still win; what the import holds that a limit no longer allows is skipped, never placed; an
 * import whose days, time blocks or groups have changed isn't compared, and that is said.
 */
import { generateWeek } from "c/shoreshEngine";
import { activity, at, block, camp, dateAt, group } from "./data/camp";

/** The imported week: the same camp's days with these cells in the grid. */
const importOf = (spec, cells) => camp({ ...spec, cells }).days;

// One place that fits one group: Bunk g1 needs its double period of Swim there (its only day),
// and Bunk g2's only activity is Arts there. The engine gives g1 its Swim and leaves g2 Open
// (filling it would leave g1 short of Swim): 2 cells filled. The imported week filled 3: g1 at
// Canoe and Hike, g2 at Arts.
const tight = {
  groups: [group("g1"), group("g2")],
  blocks: [block(0), block(1)],
  locations: [{ id: "pool", name: "Pool", fit: 1 }],
  activities: [
    activity("swim", { min: 1, span: 2, location: "pool", eligible: ["g1"] }),
    activity("arts", { location: "pool", eligible: ["g2"] }),
    activity("canoe", { eligible: ["g1"] }),
    activity("hike", { eligible: ["g1"] })
  ]
};
const fuller = [
  { day: 0, group: "g1", block: "b0", act: "canoe" },
  { day: 0, group: "g1", block: "b1", act: "hike" },
  { day: 0, group: "g2", block: "b0", act: "arts" }
];

describe("never emptier than the imported week (step 8's floor)", () => {
  it("builds from the imported week when it is fuller, and is never emptier", () => {
    const plain = generateWeek(camp(tight));
    expect(plain.floor.used).toBe("none");
    const result = generateWeek({
      ...camp(tight),
      imported: importOf(tight, fuller),
      importedName: "Week 1 (imported)"
    });
    expect(plain.cells.filled).toBe(2);
    expect(result.floor).toEqual({
      importedName: "Week 1 (imported)",
      imported: 3,
      built: 3,
      used: "seeded",
      reason: null
    });
    expect(at(result, 0, "g1", 0)).toBe("canoe");
    expect(at(result, 0, "g1", 1)).toBe("hike");
    expect(at(result, 0, "g2", 0)).toBe("arts");
    expect(result.cells.filled).toBe(3);
  });

  it("skips an imported cell a limit no longer allows: it is never placed", () => {
    // Arts is now only for g2; the imported week had g1 at Arts.
    const spec = {
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      activities: [
        activity("arts", { eligible: ["g2"], atOnce: null }),
        activity("canoe", { eligible: ["g1"], max: 1 })
      ]
    };
    const imported = importOf(
      {
        ...spec,
        activities: [
          activity("arts", { atOnce: null }),
          activity("canoe", { eligible: ["g1"] })
        ]
      },
      [
        { day: 0, group: "g1", block: "b0", act: "canoe" },
        { day: 0, group: "g1", block: "b1", act: "arts" },
        { day: 0, group: "g2", block: "b0", act: "arts" },
        { day: 0, group: "g2", block: "b1", act: "arts" }
      ]
    );
    const result = generateWeek({ ...camp(spec), imported });
    expect(at(result, 0, "g1", 1)).not.toBe("arts");
    expect(at(result, 0, "g1", 0)).not.toBe("arts");
    expect(result.flags.filter((f) => f.bends.includes("eligibility"))).toEqual(
      []
    );
    // Fewer filled than the import: said with both counts, and each Open cell keeps its reason.
    expect(result.floor.used).not.toBe("none");
    expect(result.floor.built).toBeLessThan(result.floor.imported);
    expect(result.floor.reason).toBe(
      `This week has ${result.floor.built} filled, the imported week ${result.floor.imported}.`
    );
    expect(result.openCells.every((c) => c.reason)).toBe(true);
  });

  it("keeps a locked cell over the imported week", () => {
    const spec = {
      ...tight,
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }],
      // The lock on Swim's first cell keeps the whole double period.
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b0" }]
    };
    const result = generateWeek({
      ...camp(spec),
      imported: importOf(tight, fuller)
    });
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(at(result, 0, "g1", 1)).toBe("swim");
    expect(at(result, 0, "g2", 0)).toBeNull();
    expect(result.floor.used).toBe("first");
    expect(result.floor.reason).toBe(
      "This week has 2 filled, the imported week 3."
    );
  });

  it("doesn't compare an imported week whose set-up has changed, and says so", () => {
    const imported = importOf(
      { ...tight, blocks: [block(0), block(1), block(2)] },
      []
    );
    const result = generateWeek({
      ...camp(tight),
      imported,
      importedName: "Week 1 (imported)"
    });
    expect(result.floor.used).toBe("none");
    expect(result.floor.reason).toBe(
      "The imported week (\"Week 1 (imported)\") no longer matches this week's days, time blocks or groups, so it wasn't compared."
    );
  });

  it("builds the same week with no import as before, and with one no fuller", () => {
    const a = generateWeek(camp(tight));
    const b = generateWeek({ ...camp(tight), imported: [] });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const c = generateWeek({
      ...camp(tight),
      imported: importOf(tight, [fuller[1]])
    });
    expect(c.days).toEqual(a.days);
    expect(c.floor.used).toBe("none");
  });

  it("leaves fill-the-open-cells builds to the director's cells", () => {
    const result = generateWeek({
      ...camp({ ...tight, mode: "fillOpen" }),
      imported: importOf(tight, fuller)
    });
    expect(result.floor.used).toBe("none");
  });
});
