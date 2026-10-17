/**
 * Same inputs and option, same week, in every browser (ADR 0010): no random comparator, no
 * Math.random, a seeded stream from program + week + option, every input put in SortOrder then
 * Id order. A different week or option gives a different pattern.
 */
import { generateWeek } from "c/shoreshEngine";
import { FIELD } from "c/shoreshSchema";
import { mulberry32 } from "../random";
import { activity, block, camp, cellsOf, dateAt, group } from "./data/camp";

const spec = {
  groups: [
    group("g1"),
    group("g2"),
    group("g3", { division: "div2" }),
    group("g4", { division: "div2", availability: "MorningOnly" })
  ],
  days: 3,
  blocks: [block(1), block(2), block(3), block(5), block(6)],
  locations: [
    { id: "pool", name: "Pool", fit: 2 },
    { id: "hall", name: "Hall", fit: 3 }
  ],
  fixed: [
    {
      id: "lunch",
      name: "Lunch",
      block: "b5",
      location: "hall",
      groups: ["g1", "g2", "g3"]
    }
  ],
  activities: [
    activity("swim", { min: 2, max: 3, atOnce: 2, location: "pool" }),
    activity("arts", { min: 1, max: 3, atOnce: 2, location: "hall" }),
    activity("hike", { min: 1, max: 1, span: 2, atOnce: 2, priority: "Low" }),
    activity("tennis", { min: 1, max: 2, atOnce: 2, sameDivision: true }),
    activity("climb", {
      min: 1,
      max: 2,
      atOnce: 1,
      early: { count: 1, day: "Tuesday" }
    }),
    activity("music", {
      min: 0,
      max: 3,
      atOnce: 3,
      priority: "Low",
      eligible: ["div1"]
    })
  ],
  cells: [{ day: 1, group: "g1", block: "b2", act: "music" }],
  locks: [{ date: dateAt(1), groupId: "g1", blockId: "b2" }],
  otherPrograms: [
    {
      date: dateAt(0),
      startTime: "09:00",
      endTime: "10:00",
      locationId: "pool",
      groups: 1
    }
  ]
};

// The pinned week, captured from this engine when it was written (ADR 0010). A change that
// reorders a call, a draw from the stream, or an input's order breaks it. Re-capture only for a
// deliberate change to how weeks are built, and say why in the commit.
const PINNED_ROWS = [
  {
    items: "A:hike A:swim F:lunch A:climb A:music A:arts A:tennis",
    rows: ["1,^,2,3,4", "5,4,2,3,6", "2,1,^,3,6", "6,2,7,,"]
  },
  {
    items: "A:climb A:music A:tennis F:lunch A:arts A:hike A:swim",
    rows: ["1,2,3,4,5", "6,^,1,4,3", "3,1,7,4,5", "6,^,5,,"]
  },
  {
    items: "A:swim A:arts A:music F:lunch A:tennis A:climb",
    rows: ["1,2,3,4,5", "1,2,3,4,5", "2,1,5,4,6", "2,1,6,,"]
  }
];

function rowsOf(result) {
  return result.days.map((d) => ({
    items: d.items.map((i) => `${i.kind}:${i.id}`).join(" "),
    rows: d.rows
  }));
}

function shuffled(list, r) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The same input with every list in another order (the grid's own group order kept). */
function reordered(input, seed) {
  const r = mulberry32(seed);
  const copy = { ...input };
  for (const key of [
    "groups",
    "timeBlocks",
    "activities",
    "eligibilities",
    "locations",
    "fixedActivities",
    "recurringActivities",
    "weekExceptions",
    "locks",
    "otherPrograms",
    "days"
  ]) {
    copy[key] = shuffled(input[key] || [], r);
  }
  return copy;
}

/** And with each day's groups (and their rows) in another order too. */
function reorderedGrid(input, seed) {
  const r = mulberry32(seed);
  const copy = reordered(input, seed);
  copy.days = copy.days.map((day) => {
    const order = shuffled(
      day.groups.map((_, i) => i),
      r
    );
    return {
      ...day,
      groups: order.map((i) => day.groups[i]),
      rows: order.map((i) => day.rows[i])
    };
  });
  return copy;
}

/** What each group has in each cell, by date, whatever order the grid lists groups in. */
function byGroup(result) {
  const out = {};
  const cells = cellsOf(result.days);
  result.days.forEach((day, d) => {
    out[day.dateValue] = cells[d];
  });
  return out;
}

describe("determinism", () => {
  it("pins the week this engine builds for a fixed camp", () => {
    const result = generateWeek(camp(spec));
    expect(rowsOf(result)).toEqual(PINNED_ROWS);
  });

  it("builds the same week twice, byte for byte", () => {
    const a = generateWeek(camp(spec));
    const b = generateWeek(camp(spec));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("builds the same week whatever order the records arrive in (20 orders)", () => {
    const expected = JSON.stringify(generateWeek(camp(spec)));
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(generateWeek(reordered(camp(spec), seed)))).toBe(
        expected
      );
    }
  });

  it("breaks a tie in sort order by Id, whatever order the records arrive in", () => {
    // Every activity and group with the same SortOrder (or none): only the Id decides.
    const tied = (input) => ({
      ...input,
      activities: input.activities.map((a, i) => ({
        ...a,
        [FIELD.Activity.SortOrder]: i % 2 ? 1 : null
      })),
      groups: input.groups.map((g) => ({ ...g, [FIELD.Group.SortOrder]: 1 }))
    });
    const expected = JSON.stringify(generateWeek(tied(camp(spec))));
    const outcomes = new Set([expected]);
    for (let seed = 1; seed <= 20; seed++) {
      outcomes.add(
        JSON.stringify(generateWeek(reordered(tied(camp(spec)), seed)))
      );
    }
    expect(outcomes.size).toBe(1);
  });

  it("puts the same activities in the same cells whatever order a day lists its groups in", () => {
    const expected = generateWeek(camp(spec));
    for (let seed = 1; seed <= 20; seed++) {
      const result = generateWeek(reorderedGrid(camp(spec), seed));
      expect(byGroup(result)).toEqual(byGroup(expected));
      expect(result.flags).toEqual(expected.flags);
      expect(result.stillToPlace).toEqual(expected.stillToPlace);
    }
  });

  it("never asks Math.random", () => {
    const spy = jest.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random was called");
    });
    try {
      expect(generateWeek(camp(spec)).ok).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("gives a different pattern for another option, and the same one again for the same option", () => {
    const patterns = new Set();
    for (let option = 1; option <= 10; option++) {
      const a = JSON.stringify(rowsOf(generateWeek(camp({ ...spec, option }))));
      const again = JSON.stringify(
        rowsOf(generateWeek(camp({ ...spec, option })))
      );
      expect(again).toBe(a);
      patterns.add(a);
    }
    expect(patterns.size).toBeGreaterThanOrEqual(8);
  });

  it("gives each week, and each program, its own pattern", () => {
    const week = (weekId, programId = "prog1") =>
      JSON.stringify(
        rowsOf(generateWeek(camp({ ...spec, weekId, programId })))
      );
    const weeks = new Set(["w1", "w2", "w3", "w4", "w5"].map((w) => week(w)));
    expect(weeks.size).toBeGreaterThanOrEqual(4);
    expect(week("w1", "progA")).not.toBe(week("w1", "progB"));
  });
});
