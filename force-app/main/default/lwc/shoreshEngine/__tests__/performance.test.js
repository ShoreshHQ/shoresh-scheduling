/**
 * A large camp, 12 groups x 5 days x 8 blocks (480 cells), whether the week fits or not (the
 * repair passes have budgets so a week that can't fit gives up). Time depends on the machine, so
 * each case is bounded by its work, the rule checks the build makes (the same on any machine,
 * with headroom over what it does today), and by wall time only loosely, with room for slower
 * CI runners: a week that fits takes about 20 ms on a laptop; one that can't fit about 0.7 s on a
 * laptop and 1.6 s on CI, since it is often built twice (ADR 0010).
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

// The fastest of three builds of the same week (the result is the same each time), so other test
// files running alongside can't make it look slow.
function timed(spec) {
  const input = camp(spec);
  let result;
  let ms = Infinity;
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    result = generateWeek(input);
    ms = Math.min(ms, Date.now() - started);
  }
  return { input, result, ms };
}

describe("generateWeek on a large camp", () => {
  it("builds a week that fits with little work, keeping every rule", () => {
    const spec = bigCamp(fitting);
    const { input, result, ms } = timed(spec);
    // The work of options 1 to 5, middle one: about 23,000 today. One option's draws can strand
    // more cells for the first repair (weekRepair.js tryFill) to fill: option 1 takes about
    // 46,000 since rule 9.10 put the activities in settings order, as option 6 took about 29,500
    // before it (12 options: 21,500 on average before, 23,700 after). The middle one is what
    // tells a slower engine from an unlucky draw.
    const work = [1, 2, 3, 4, 5]
      .map((option) => generateWeek({ ...input, option }).ruleChecks)
      .sort((a, b) => a - b);
    expect(work[2]).toBeLessThan(30000);
    // And no one draw blows up: every option 1 to 12 within twice that (46,156 the most today).
    for (let option = 1; option <= 12; option++) {
      const checks = generateWeek({ ...input, option }).ruleChecks;
      expect([option, checks <= 60000]).toEqual([option, true]);
    }
    // About 80 ms alone. ruleChecks above counts how many checks run, not how long each takes,
    // so this ceiling is what catches a slower check (roughly 10x or worse); 1 s leaves room
    // for a loaded machine, and the fastest of three builds is what is measured.
    expect(ms).toBeLessThan(1000);
    expect(problems(spec, input, result)).toEqual([]);
  });

  // GEN-8.8
  it("gives up on a week that can't fit within its work budget, still leaving nothing blank", () => {
    const spec = bigCamp(overfull);
    const { input, result, ms } = timed(spec);
    // About 1,735,000 today: 1,070,000 before step 8's exact search (PR 4a), 1,640,000 before
    // its moves between days.
    expect(result.ruleChecks).toBeLessThan(2500000);
    // About 6 s alone since the cross-day passes (#157, #159), ~10 s on CI's runners.
    // ruleChecks above counts how many checks run, not how long each takes, so this ceiling is
    // what catches a much slower check (roughly 4x or worse); a smaller slowdown can still pass.
    expect(ms).toBeLessThan(25000);
    expect(problems(spec, input, result)).toEqual([]);
    // Only a weekly max ever bends (one cell did before the moves between days; none now).
    expect(
      result.flags.every((f) => f.bends.every((b) => b === "weeklyMax"))
    ).toBe(true);
    expect(result.stillNeeded.length).toBeGreaterThan(0);
  });

  // GEN-8.8
  it("counts the same work every time (it doesn't depend on the machine)", () => {
    const spec = bigCamp(overfull);
    expect(generateWeek(camp(spec)).ruleChecks).toBe(
      generateWeek(camp(spec)).ruleChecks
    );
  });
});
