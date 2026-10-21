import { measureWeek } from "c/shoreshEngine";

/** One placement of an activity for a bunk, as checkWeek lists them. */
const p = (groupId, id) => ({ kind: "A", groupId, id });
const DAYS = [
  { groups: [{ id: "b1" }, { id: "b2" }, { id: "b3" }] },
  { groups: [{ id: "b1" }, { id: "b2" }, { id: "b3" }] }
];
const act = (id, name, minPerWeek, maxPerWeek = null, notFor = []) => ({
  id,
  name,
  minPerWeek,
  maxPerWeek,
  notFor
});

describe("measureWeek: the counter's and the drawer's one measure", () => {
  it("placed of total and still needed come from the cells to fill", () => {
    const m = measureWeek({ cells: { filled: 29, total: 35 } }, [], DAYS);
    expect(m.placed).toBe(29);
    expect(m.total).toBe(35);
    expect(m.stillNeeded).toBe(6);
    expect(m.offTarget).toBe(false);
  });

  it("under counts each bunk's shortfall: one bunk's extra never makes up another's", () => {
    // Swim twice a week for three bunks: b1 has 3, b2 has 1, b3 none.
    const placements = [
      p("b1", "swim"),
      p("b1", "swim"),
      p("b1", "swim"),
      p("b2", "swim")
    ];
    const m = measureWeek(
      { cells: { filled: 4, total: 6 }, placements },
      [act("swim", "Swim", 2)],
      DAYS
    );
    // Counted toward the goal: 2 + 1 + 0 = 3 of 6; 3 short.
    expect(m.under).toEqual({
      count: 3,
      rows: [{ id: "swim", name: "Swim", placed: 3, goal: 6 }]
    });
    expect(m.byActivity.get("swim")).toEqual({
      placed: 4,
      goal: 6,
      short: 3,
      extra: 0
    });
    expect(m.offTarget).toBe(true);
  });

  it("only the activities the check checked are measured: one closed this week has no goal", () => {
    // Swim is closed this week (the check left it out); Archery runs, one a week, one bunk has it.
    const m = measureWeek(
      {
        cells: { filled: 1, total: 6 },
        placements: [p("b1", "arch")],
        activityIds: ["arch"]
      },
      [act("swim", "Swim", 2, 1), act("arch", "Archery", 1)],
      DAYS
    );
    expect(m.under).toEqual({
      count: 2,
      rows: [{ id: "arch", name: "Archery", placed: 1, goal: 3 }]
    });
    expect(m.hasLimits).toBe(false);
    expect(m.byActivity.has("swim")).toBe(false);
  });

  it("a bunk an activity isn't set up for has no goal for it", () => {
    const m = measureWeek(
      { cells: { filled: 0, total: 6 }, placements: [] },
      [act("ropes", "Ropes", 1, null, ["b3"])],
      DAYS
    );
    expect(m.under.rows).toEqual([
      { id: "ropes", name: "Ropes", placed: 0, goal: 2 }
    ]);
    expect(m.under.count).toBe(2);
  });

  it("over counts only the bunks past the limit: what they have, of what they may have", () => {
    const placements = [
      p("b1", "soccer"),
      p("b1", "soccer"),
      p("b1", "soccer"),
      p("b2", "soccer")
    ];
    const m = measureWeek(
      { cells: { filled: 4, total: 6 }, placements },
      [act("soccer", "Soccer", 0, 2)],
      DAYS
    );
    expect(m.over).toEqual({
      count: 1,
      rows: [{ id: "soccer", name: "Soccer", placed: 3, goal: 2 }]
    });
    expect(m.under.count).toBe(0);
    expect(m.hasLimits).toBe(true);
    expect(m.hasGoals).toBe(false);
  });

  it("rows keep the order the activities are listed in, and the counts add up", () => {
    const m = measureWeek(
      { cells: { filled: 0, total: 6 }, placements: [p("b1", "b")] },
      [act("b", "Boating", 1), act("a", "Archery", 1)],
      DAYS
    );
    expect(m.under.rows.map((r) => r.name)).toEqual(["Boating", "Archery"]);
    expect(m.under.count).toBe(
      m.under.rows.reduce((sum, r) => sum + r.goal - r.placed, 0)
    );
  });

  it("look lists the overlapping cells, then each early-week goal still short", () => {
    const m = measureWeek(
      {
        cells: { filled: 1, total: 1 },
        overlapping: [
          {
            dateValue: "2026-06-29",
            groupId: "b1",
            blockId: "t1",
            text: "Bunk 1 · Monday · Period 1: Over its limit"
          }
        ],
        hasSpreadTargets: true,
        spread: ["Swim · Bunk 2: 1 still needed by Wednesday"],
        spreadBy: [
          { activityId: "swim", groupId: "b2", missing: 1, byDay: "Wednesday" }
        ]
      },
      [],
      DAYS
    );
    expect(m.look.map((l) => [l.kind, l.groupId, l.text])).toEqual([
      ["overlapping", "b1", "Bunk 1 · Monday · Period 1: Over its limit"],
      ["spread", "b2", "Swim · Bunk 2: 1 still needed by Wednesday"]
    ]);
    expect(m.look[0].blockId).toBe("t1");
    expect(m.offTarget).toBe(true);
  });

  it("same inputs, same measure", () => {
    const args = [
      { cells: { filled: 2, total: 6 }, placements: [p("b1", "swim")] },
      [act("swim", "Swim", 2, 3)],
      DAYS
    ];
    const a = measureWeek(...args);
    const b = measureWeek(...args);
    expect({ ...a, byActivity: [...a.byActivity] }).toEqual({
      ...b,
      byActivity: [...b.byActivity]
    });
  });
});
