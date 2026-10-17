/**
 * A large camp, 12 groups x 5 days x 8 blocks (480 cells), builds well under 2 seconds, whether
 * the week fits or not (the repair passes have budgets so a week that can't fit gives up fast).
 */
import { generateWeek } from "c/shoreshEngine";
import { activity, block, camp, group } from "./data/camp";
import { problems } from "./data/check";

const groups = Array.from({ length: 12 }, (_, i) =>
  group(`g${String(i).padStart(2, "0")}`, { division: `div${i % 3}` })
);
const blocks = Array.from({ length: 8 }, (_, i) => block(i));
const locations = [
  { id: "pool", fit: 2 },
  { id: "field", fit: 3 },
  { id: "hall", fit: 2 }
];

function bigCamp(activities) {
  return {
    groups,
    days: 5,
    blocks,
    activities,
    locations,
    fixed: [{ id: "lunch", name: "Lunch", block: "b4" }]
  };
}

const fitting = [
  activity("swim", { min: 2, max: 3, atOnce: 2, location: "pool" }),
  activity("soccer", { min: 2, max: 4, atOnce: 3, location: "field" }),
  activity("arts", { min: 2, max: 4, atOnce: 2, location: "hall" }),
  activity("hike", { min: 1, max: 2, span: 2, atOnce: 3, priority: "Low" }),
  activity("drama", { min: 1, max: 3, atOnce: 2, sameDivision: true }),
  activity("archery", { min: 1, max: 3, atOnce: 2 }),
  activity("boats", { min: 1, max: 3, atOnce: 2, priority: "Low" }),
  activity("music", { min: 1, max: 4, atOnce: 3, priority: "Low" }),
  activity("climb", {
    min: 1,
    max: 2,
    atOnce: 1,
    early: { count: 1, day: "Wednesday" }
  }),
  activity("nature", { min: 0, max: 5, atOnce: 4, priority: "Low" })
];

// Ten activities owed four times a week each (40 sessions in 35 cells), one group at a time.
const overfull = Array.from({ length: 10 }, (_, i) =>
  activity(`a${i}`, {
    min: 4,
    max: 4,
    atOnce: 1,
    priority: i % 2 ? "Low" : "High"
  })
);

function timed(spec) {
  const input = camp(spec);
  const started = Date.now();
  const result = generateWeek(input);
  return { input, result, ms: Date.now() - started };
}

describe("generateWeek on a large camp", () => {
  it("builds a week that fits well under 2 seconds, keeping every rule", () => {
    const spec = bigCamp(fitting);
    const { input, result, ms } = timed(spec);
    expect(ms).toBeLessThan(1500);
    expect(problems(spec, input, result)).toEqual([]);
  });

  it("gives up on a week that can't fit well under 2 seconds, still leaving nothing blank", () => {
    const spec = bigCamp(overfull);
    const { input, result, ms } = timed(spec);
    expect(ms).toBeLessThan(1500);
    expect(problems(spec, input, result)).toEqual([]);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.stillNeeded.length).toBeGreaterThan(0);
  });
});
