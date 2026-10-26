/**
 * Minimums first, as a last resort (Greg, 2026-10-26; protocol 8.29-8.32): when a group is short of
 * a weekly minimum and the only way to give it that session leaves another group with nothing
 * allowed in its cell, the engine gives the short group its session and leaves that cell Open,
 * saying so ("Open, so Bunk 3 gets Swim"). Only when every way that keeps each cell filled fails.
 * A cell the minimum repair (before never-blank) left Open for another group says the same.
 */
import { NOW, generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { notesOf, readNotes, whyOf } from "../notes";
import { activity, at, block, camp, group } from "./data/camp";
import { sharedCamp } from "./data/sharedCamp";

// Two days, two periods. Swim takes one group at a time; Bunk 3 must have it once. Bunk 5 can
// only Swim or play Games (Games once a day); Archery is Bunk 3's alone. Every other way to give
// Bunk 3 its Swim leaves somebody with nothing allowed.
const pool = {
  groups: [
    group("g5", { name: "Bunk 5", division: "div2" }),
    group("g3", { name: "Bunk 3", division: "div1" }),
    group("g4", { name: "Bunk 4", division: "div3" })
  ],
  blocks: [block(0), block(1)],
  days: 2,
  activities: [
    activity("swim", { name: "Swim", min: 1, max: 2 }),
    activity("games", {
      name: "Games",
      max: null,
      atOnce: null,
      priority: "Low"
    }),
    activity("archery", {
      name: "Archery",
      max: 2,
      atOnce: null,
      eligible: ["div1"]
    })
  ],
  programId: "p15799",
  weekId: "w1",
  option: 1,
  mode: "full"
};

/** Every cell as "day|group|block" -> activity id or null. */
function grid(result, spec) {
  const out = {};
  for (let d = 0; d < spec.days; d++) {
    for (const g of spec.groups) {
      spec.blocks.forEach((b, i) => {
        out[`${d}|${g.id}|${b.id}`] = at(result, d, g.id, i) || null;
      });
    }
  }
  return out;
}

describe("minimums first, as a last resort", () => {
  const result = generateWeek(camp(pool));

  it("gives Bunk 3 its Swim and leaves Bunk 5's cell Open, naming the trade", () => {
    expect(result.ok).toBe(true);
    expect(grid(result, pool)).toEqual({
      "0|g5|b0": null,
      "0|g5|b1": "games",
      "0|g3|b0": "swim",
      "0|g3|b1": "games",
      "0|g4|b0": "games",
      "0|g4|b1": "swim",
      "1|g5|b0": "swim",
      "1|g5|b1": "games",
      "1|g3|b0": "archery",
      "1|g3|b1": "games",
      "1|g4|b0": "games",
      "1|g4|b1": "swim"
    });
    expect(result.openCells).toEqual([
      {
        date: "2026-07-06",
        groupId: "g5",
        blockId: "b0",
        reason: "Open, so Bunk 3 gets Swim",
        why: "trade",
        shortGroupId: "g3",
        shortActivityId: "swim"
      }
    ]);
    expect(result.stillNeededBy).toEqual([]);
    // The move is listed: Bunk 3 into Swim, Bunk 5 out of it.
    expect(
      result.moved.map((m) => [m.groupId, m.blockId, m.from, m.to, m.why])
    ).toEqual([
      ["g3", "b0", "archery", "swim", "minimum"],
      ["g5", "b0", "swim", null, "minimum"]
    ]);
  });

  it("keeps the reason with the saved week, in the same words", () => {
    const notes = readNotes(JSON.stringify(notesOf(result)));
    expect(notes.open).toEqual([
      ["2026-07-06", "g5", "b0", "trade", "g3", "swim"]
    ]);
    const why = whyOf(notes, camp(pool));
    expect(why.open.get("2026-07-06|g5|b0")).toBe("Open, so Bunk 3 gets Swim");
  });

  it("says the trade while it builds", () => {
    const watch = {};
    const steps = generateWeekSteps(camp(pool), watch);
    const told = [];
    let step = steps.next();
    while (!step.done) {
      if (watch.now && watch.now.code === NOW.TRADE) {
        told.push({ ...watch.now });
      }
      step = steps.next();
    }
    expect(told.length).toBeGreaterThan(0);
    expect(told[0]).toMatchObject({
      code: NOW.TRADE,
      groupId: "g5",
      blockId: "b0",
      toActivityId: "swim",
      forGroupId: "g3",
      date: "2026-07-06"
    });
    expect(JSON.stringify(step.value)).toBe(JSON.stringify(result));
  });

  it("builds the same week every time", () => {
    expect(JSON.stringify(generateWeek(camp(pool)))).toBe(
      JSON.stringify(result)
    );
  });

  it("leaves nothing Open when a way that keeps every cell filled exists", () => {
    // Crafts gives Bunk 5 something else allowed then: Bunk 3 still gets Swim, no cell Open.
    const spec = {
      ...pool,
      activities: [
        ...pool.activities,
        activity("crafts", {
          name: "Crafts",
          max: null,
          atOnce: null,
          priority: "Low"
        })
      ]
    };
    const r = generateWeek(camp(spec));
    expect(r.openCells).toEqual([]);
    expect(r.stillNeededBy).toEqual([]);
    expect(r.cells.filled).toBe(12);
  });

  it("never moves a locked hand edit for it", () => {
    // Bunk 5's Monday Swim locked where the director put it: it stays, and the trade (if any)
    // is another cell's, never the locked one.
    const spec = {
      ...pool,
      cells: [{ day: 0, group: "g5", block: "b0", act: "swim" }],
      locks: [{ date: "2026-07-06", groupId: "g5", blockId: "b0" }]
    };
    const r = generateWeek(camp(spec));
    expect(at(r, 0, "g5", 0)).toBe("swim");
    const traded = r.openCells.filter((c) => c.why === "trade");
    expect(traded.map((c) => [c.date, c.groupId, c.blockId])).toEqual([
      ["2026-07-06", "g4", "b1"]
    ]);
    expect(
      r.moved.some(
        (m) =>
          m.date === "2026-07-06" && m.groupId === "g5" && m.blockId === "b0"
      )
    ).toBe(false);
  });

  it("the imported week's floor still wins: a fuller imported week is kept", () => {
    // The imported week filled every cell (Bunk 3 short of Swim): the build from it is fuller
    // than the trade, so it is kept (8.22), and nothing is left Open.
    const full = [
      { day: 0, group: "g5", block: "b0", act: "swim" },
      { day: 0, group: "g5", block: "b1", act: "games" },
      { day: 0, group: "g3", block: "b0", act: "archery" },
      { day: 0, group: "g3", block: "b1", act: "games" },
      { day: 0, group: "g4", block: "b0", act: "games" },
      { day: 0, group: "g4", block: "b1", act: "swim" },
      { day: 1, group: "g5", block: "b0", act: "swim" },
      { day: 1, group: "g5", block: "b1", act: "games" },
      { day: 1, group: "g3", block: "b0", act: "archery" },
      { day: 1, group: "g3", block: "b1", act: "games" },
      { day: 1, group: "g4", block: "b0", act: "games" },
      { day: 1, group: "g4", block: "b1", act: "swim" }
    ];
    const r = generateWeek({
      ...camp(pool),
      imported: camp({ ...pool, cells: full }).days,
      importedName: "Week 1"
    });
    expect(r.floor).toMatchObject({ imported: 12, built: 12, used: "seeded" });
    expect(r.openCells).toEqual([]);
    expect(r.stillNeededBy.map((n) => [n.groupId, n.activityId])).toEqual([
      ["g3", "swim"]
    ]);
  });
});

describe("a cell the minimum repair empties for a minimum says the same", () => {
  // Differential-style camp 1546 in camp names: Swim takes one group at a time; Bunk 3 gets its
  // one Swim on Monday in Period 2 by the repair before never-blank (step 8, part 1), which
  // leaves Bunk 5 (Arts already that morning) with nothing allowed then.
  const base = sharedCamp(1546);
  const names = { g0: "Bunk 5", g1: "Bunk 1", g2: "Bunk 3" };
  const spec = {
    ...base,
    groups: base.groups.map((g) => ({ ...g, name: names[g.id] })),
    activities: base.activities.map((a) => ({
      ...a,
      name: a.id === "a1" ? "Swim" : "Arts"
    }))
  };
  const result = generateWeek(camp(spec));

  it("names the group and activity that gained, never 'everything is taken'", () => {
    expect(at(result, 0, "g2", 1)).toBe("a1");
    const cell = result.openCells.find(
      (c) => c.date === "2026-07-06" && c.groupId === "g0" && c.blockId === "b1"
    );
    expect(cell).toEqual({
      date: "2026-07-06",
      groupId: "g0",
      blockId: "b1",
      reason: "Open, so Bunk 3 gets Swim",
      why: "trade",
      shortGroupId: "g2",
      shortActivityId: "a1"
    });
    // Not a move of the step 8 search: the repair did it.
    expect(result.moved.some((m) => m.groupId === "g0" && m.to == null)).toBe(
      false
    );
    // Kept with the saved week, in the same words.
    const notes = readNotes(JSON.stringify(notesOf(result)));
    expect(notes.open).toContainEqual([
      "2026-07-06",
      "g0",
      "b1",
      "trade",
      "g2",
      "a1"
    ]);
    expect(whyOf(notes, camp(spec)).open.get("2026-07-06|g0|b1")).toBe(
      "Open, so Bunk 3 gets Swim"
    );
  });

  it("builds the same week every time", () => {
    expect(JSON.stringify(generateWeek(camp(spec)))).toBe(
      JSON.stringify(result)
    );
  });
});
