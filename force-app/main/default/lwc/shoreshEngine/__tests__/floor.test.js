/**
 * Step 8's floor (care plan step 8, Greg 2026-10-25; protocol 8.19-8.23): a full build is never
 * emptier than the week as it was imported. The imported week is the floor; locks and hand edits
 * still win; what the import holds that a limit no longer allows is skipped, never placed; an
 * import whose days, time blocks or groups have changed isn't compared, and that is said.
 */
import { generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { fuller as keepsSeeded } from "../weekFloor";
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

// GEN-8.9
describe("never emptier than the imported week (step 8's floor)", () => {
  // CORE-5.6, GEN-8.19
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

  // GEN-8.21, GEN-8.23
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
      `This week has ${result.floor.built} cells filled; the imported week has ${result.floor.imported}.`
    );
    expect(result.openCells.every((c) => c.reason)).toBe(true);
  });

  // GEN-8.21
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
      "This week has 2 cells filled; the imported week has 3."
    );
  });

  // GEN-8.20
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

  // GEN-8.23
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

  // GEN-8.19
  it("leaves fill-the-open-cells builds to the director's cells", () => {
    const result = generateWeek({
      ...camp({ ...tight, mode: "fillOpen" }),
      imported: importOf(tight, fuller)
    });
    expect(result.floor.used).toBe("none");
  });

  // GEN-8.19
  it("counts the imported week only where this week counts: a fixed activity there now", () => {
    // Flagpole now holds g2's Period 1, where the imported week had Arts.
    const spec = {
      ...tight,
      fixed: [{ id: "flag", name: "Flagpole", block: "b0", groups: ["g2"] }]
    };
    const result = generateWeek({
      ...camp(spec),
      imported: importOf(tight, fuller)
    });
    expect(result.floor).toEqual({
      importedName: null,
      imported: 2,
      built: 2,
      used: "none",
      reason: null
    });
    expect(JSON.stringify(result.days)).toBe(
      JSON.stringify(generateWeek(camp(spec)).days)
    );
  });

  // GEN-8.21
  it("puts a double period back whole, and skips one whose length has changed", () => {
    const spec = {
      ...tight,
      activities: [
        ...tight.activities.filter((a) => a.id !== "arts"),
        activity("drama", { span: 2, location: "pool", eligible: ["g2"] })
      ]
    };
    const cells = [
      fuller[0],
      fuller[1],
      { day: 0, group: "g2", block: "b0", act: "drama", length: 2 }
    ];
    const result = generateWeek({
      ...camp(spec),
      imported: importOf(spec, cells)
    });
    expect(result.floor.used).toBe("seeded");
    expect(result.floor.imported).toBe(4);
    expect(at(result, 0, "g2", 0)).toBe("drama");
    expect(at(result, 0, "g2", 1)).toBe("drama");
    expect(result.cells.filled).toBe(4);
    // Drama was a single period in the imported week: it isn't put back as it was (the build
    // still fills the cell as it would any other).
    const single = generateWeek({
      ...camp(spec),
      imported: importOf(spec, [
        fuller[0],
        fuller[1],
        { day: 0, group: "g2", block: "b0", act: "drama", length: 1 }
      ])
    });
    expect(single.floor.imported).toBe(3);
    // Drama only ever goes in as the double period it is now, never a single.
    expect(at(single, 0, "g2", 1)).toBe(at(single, 0, "g2", 0));
    expect(single.flags).toEqual([]);
  });

  // GEN-8.22
  it("gives the build from the imported week its own part of the bar", () => {
    const steps = generateWeekSteps({
      ...camp(tight),
      imported: importOf(tight, fuller)
    });
    const seen = [];
    let step = steps.next();
    while (!step.done) {
      seen.push(step.value);
      step = steps.next();
    }
    expect(step.value.floor.used).toBe("seeded");
    seen.forEach((f, i) => expect(f).toBeGreaterThanOrEqual(seen[i - 1] || 0));
    expect(seen.some((f) => f > 0.5 && f < 1)).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

// GEN-8.22
describe("which build is kept (step 8's floor)", () => {
  const week = ({ filled, short = [], maxBends = 0 }) => ({
    cells: { filled },
    stillNeededBy: short.map(([groupId, missing]) => ({
      activityId: "swim",
      groupId,
      missing
    })),
    bends: new Map(
      Array.from({ length: maxBends }, (_, i) => [`p${i}`, ["weeklyMax"]])
    )
  });

  it("keeps the fuller week, whatever it is short of", () => {
    expect(
      keepsSeeded(week({ filled: 5, short: [["g1", 2]] }), week({ filled: 4 }))
    ).toBe(true);
  });

  it("on as many filled: fewer groups short, then fewer sessions short", () => {
    expect(
      keepsSeeded(
        week({ filled: 4, short: [["g1", 2]] }),
        week({
          filled: 4,
          short: [
            ["g1", 1],
            ["g2", 1]
          ]
        })
      )
    ).toBe(true);
    expect(
      keepsSeeded(
        week({ filled: 4, short: [["g1", 2]] }),
        week({ filled: 4, short: [["g1", 1]] })
      )
    ).toBe(false);
  });

  it("on a tie in both, fewer weekly-limit bends decide; a full tie keeps the first build", () => {
    const short = [["g1", 1]];
    expect(
      keepsSeeded(
        week({ filled: 4, short, maxBends: 1 }),
        week({ filled: 4, short, maxBends: 2 })
      )
    ).toBe(true);
    expect(
      keepsSeeded(
        week({ filled: 4, short, maxBends: 2 }),
        week({ filled: 4, short, maxBends: 1 })
      )
    ).toBe(false);
    expect(
      keepsSeeded(
        week({ filled: 4, short, maxBends: 1 }),
        week({ filled: 4, short, maxBends: 1 })
      )
    ).toBe(false);
  });
});
