/**
 * generateWeekSteps (ADR 0010 §22): the build in steps, so the screen can run a big week a little
 * at a time and show how far it has got. The steps never change the week: it is the same as
 * generateWeek's, and the progress only goes up, from 0 to 1.
 */
import { MODE, generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { activity, block, camp, group } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";

function runSteps(input) {
  const steps = generateWeekSteps(input);
  const progress = [];
  let step = steps.next();
  while (!step.done) {
    progress.push(step.value);
    step = steps.next();
  }
  return { result: step.value, progress };
}

const groups = Array.from({ length: 12 }, (_, i) =>
  group(`g${String(i).padStart(2, "0")}`, { division: `div${i % 3}` })
);
const blocks = Array.from({ length: 8 }, (_, i) => block(i));

// Ten activities owed four times a week each (40 sessions in 35 cells): a week that can't fit,
// built twice (the minimum repair's leniency), the slowest kind there is.
const overfull = camp({
  groups,
  days: 5,
  blocks,
  activities: Array.from({ length: 10 }, (_, i) =>
    activity(`a${i}`, {
      min: 4,
      max: 4,
      atOnce: 1,
      priority: i % 2 ? "Low" : "High"
    })
  ),
  fixed: [{ id: "lunch", name: "Lunch", block: "b4" }]
});

describe("generateWeekSteps", () => {
  it("builds the same week as generateWeek, a week that can't fit included", () => {
    const { result, progress } = runSteps(overfull);
    expect(result).toEqual(generateWeek(overfull));
    expect(result.ok).toBe(true);
    // Many small steps, not one long one.
    expect(progress.length).toBeGreaterThan(100);
  });

  it("only goes up, from 0 to at most 1", () => {
    const { progress } = runSteps(overfull);
    expect(progress[0]).toBe(0);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
    expect(progress[progress.length - 1]).toBeLessThanOrEqual(1);
    // A week built twice gets past halfway.
    expect(progress[progress.length - 1]).toBeGreaterThan(0.5);
  });

  it("never runs long between steps", () => {
    const steps = generateWeekSteps(overfull);
    let longest = 0;
    let last = Date.now();
    let step = steps.next();
    while (!step.done) {
      const now = Date.now();
      longest = Math.max(longest, now - last);
      last = now;
      step = steps.next();
    }
    // About 10 ms on a laptop; loose, for slower CI runners.
    expect(longest).toBeLessThan(250);
  });

  it("is the same as generateWeek on random camps, both modes", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = camp(withHistory(randomCamp(seed), seed));
      for (const mode of [MODE.FULL, MODE.FILL_OPEN]) {
        const asked = { ...input, mode };
        expect(runSteps(asked).result).toEqual(generateWeek(asked));
      }
    }
  });

  it("answers an error the same way, with no steps", () => {
    const none = camp({ groups, days: 5, blocks, activities: [] });
    const { result, progress } = runSteps(none);
    expect(result).toEqual(generateWeek(none));
    expect(result.ok).toBe(false);
    expect(progress).toEqual([]);
  });
});
