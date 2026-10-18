/**
 * generateWeekSteps (ADR 0010 §22): the build in steps, so the screen can run a big week a little
 * at a time and show how far it has got. The steps never change the week: it is the same as
 * generateWeek's, and the progress only goes up, from 0 to 1. And checkGeneratedWeek, the screen's
 * check of a week as it stands, with the engine's own rules.
 */
import {
  MODE,
  checkGeneratedWeek,
  generateWeek,
  generateWeekSteps
} from "c/shoreshEngine";
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

  it("ends at 1 whether the week is built once or twice, only going up", () => {
    let once = 0;
    let twice = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const input = camp(withHistory(randomCamp(seed), seed));
      const { result, progress } = runSteps(input);
      if (!result.ok) {
        continue;
      }
      expect(progress[progress.length - 1]).toBe(1);
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
      }
      // A week built twice passes through the halfway mark from its first build.
      if (progress.includes(0.5)) {
        twice += 1;
      } else {
        once += 1;
      }
    }
    expect(once).toBeGreaterThan(0);
    expect(once + twice).toBeGreaterThan(30);
    expect(runSteps(overfull).progress.slice(-1)[0]).toBe(1);
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
    // About 10 ms on a laptop. The ceiling is generous because a loaded machine (other tests
    // running alongside) stretches a gap many times over; it only catches a step that has
    // become one long block, which would be seconds.
    expect(longest).toBeLessThan(2000);
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

describe("checkGeneratedWeek", () => {
  it("checks a built week the way the engine checked it (no locks: the same dots and lines)", () => {
    let built = 0;
    let dots = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = { ...camp(randomCamp(seed)), locks: [] };
      const result = generateWeek(input);
      if (!result.ok) {
        continue;
      }
      built += 1;
      dots += result.flags.length;
      const { checked, days } = checkGeneratedWeek({
        ...input,
        days: result.days
      });
      expect(days.map((d) => d.rows)).toEqual(result.days.map((d) => d.rows));
      expect(checked.stillNeeded).toEqual(result.stillNeeded);
      expect(checked.spread).toEqual(result.spread);
      expect(checked.overlapping).toEqual(result.overlapping);
      expect(checked.cells).toEqual(result.cells);
      const heads = new Map(checked.placements.map((p) => [p.key, p.length]));
      const dotted = new Map();
      for (const f of result.flags) {
        const key = `${f.date}|${f.groupId}|${f.blockId}`;
        if (heads.has(key)) {
          dotted.set(key, f.reason);
        }
      }
      expect(new Map(checked.flags)).toEqual(dotted);
    }
    // Not vacuous: most camps build, and some have dots.
    expect(built).toBeGreaterThan(40);
    expect(dots).toBeGreaterThan(0);
  });

  it("with locks, checks a full build the way the engine did (dots skip locked sessions)", () => {
    let locked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // A full build: Fill the open cells keeps every filled cell, so its dots spare them all,
      // while the screen's check spares only what the director locked.
      const input = {
        ...camp(withHistory(randomCamp(seed), seed)),
        mode: MODE.FULL
      };
      const result = generateWeek(input);
      if (!result.ok) {
        continue;
      }
      locked += (input.locks || []).length;
      const { checked } = checkGeneratedWeek({ ...input, days: result.days });
      expect(checked.stillNeeded).toEqual(result.stillNeeded);
      expect(checked.cells).toEqual(result.cells);
      const heads = new Set(checked.placements.map((p) => p.key));
      const dotted = new Map();
      for (const f of result.flags) {
        const key = `${f.date}|${f.groupId}|${f.blockId}`;
        if (heads.has(key)) {
          dotted.set(key, f.reason);
        }
      }
      expect(new Map(checked.flags)).toEqual(dotted);
    }
    expect(locked).toBeGreaterThan(0);
  });

  it("the weekly-limit dot goes on the unlocked session: Swim locked Friday, not Monday, limit 1", () => {
    const input = camp({
      groups: [group("g1")],
      days: 5,
      blocks: [block(0)],
      activities: [activity("swim", { min: 0, max: 1, atOnce: 2 })]
    });
    const item = { kind: "A", id: input.activities[0].Id, name: "swim" };
    // Swim on Monday and on Friday, as reloaded (no build state): only Friday is locked.
    const days = input.days.map((day, d) => ({
      ...day,
      items: [item],
      rows: [d === 0 || d === 4 ? "1" : ""]
    }));
    const monday = days[0].dateValue;
    const friday = days[4].dateValue;
    const locks = [{ date: friday, groupId: "g1", blockId: "b0" }];
    const { checked } = checkGeneratedWeek({ ...input, days, locks });
    const dotted = [...checked.flags.keys()];
    expect(dotted).toContain(`${monday}|g1|b0`);
    expect(dotted).not.toContain(`${friday}|g1|b0`);
    // Locked on Monday instead: the dot moves to Friday.
    const other = checkGeneratedWeek({
      ...input,
      days,
      locks: [{ date: monday, groupId: "g1", blockId: "b0" }]
    }).checked;
    expect([...other.flags.keys()]).toEqual([`${friday}|g1|b0`]);
  });

  it("a group setup no longer has: its placements count as kept, as the engine keeps them", () => {
    // Two groups in the grid, one of them gone from setup; one activity at most once a week,
    // placed twice for each.
    const spec = {
      groups: [group("g1")],
      days: 1,
      blocks: [block(0), block(1)],
      activities: [activity("swim", { min: 0, max: 1, atOnce: 2 })]
    };
    const input = camp(spec);
    const day = input.days[0];
    const days = [
      {
        ...day,
        groups: [...day.groups, { id: "gGone", name: "Bunk gone", gone: true }],
        items: [{ kind: "A", id: input.activities[0].Id, name: "swim" }],
        rows: ["1,1", "1,1"]
      }
    ];
    // The gone group's later session is also locked by hand: the engine keeps both anyway, so
    // its over-the-limit dot goes on the later one, as on screen.
    const locks = [{ date: day.dateValue, groupId: "gGone", blockId: "b1" }];
    const built = generateWeek({ ...input, days, locks, mode: MODE.FULL });
    const { checked } = checkGeneratedWeek({
      ...input,
      locks,
      days: built.days
    });
    expect([...checked.flags.keys()]).toContain(`${day.dateValue}|gGone|b1`);
    const heads = new Set(checked.placements.map((p) => p.key));
    const dotted = new Map();
    for (const f of built.flags) {
      const key = `${f.date}|${f.groupId}|${f.blockId}`;
      if (heads.has(key)) {
        dotted.set(key, f.reason);
      }
    }
    expect(new Map(checked.flags)).toEqual(dotted);
  });

  it("reads a week in date order whatever order its days come in", () => {
    const input = { ...camp(randomCamp(3)), locks: [] };
    const result = generateWeek(input);
    const shuffled = [...result.days].reverse();
    const { days, checked } = checkGeneratedWeek({ ...input, days: shuffled });
    expect(days.map((d) => d.dateValue)).toEqual(
      result.days.map((d) => d.dateValue)
    );
    expect(checked.stillNeeded).toEqual(result.stillNeeded);
  });

  it("says which cells are away from camp, as the engine leaves them", () => {
    const input = camp({
      groups: [group("g1", { availability: "MorningOnly" })],
      days: 1,
      blocks: [block(0), block(5)],
      activities: [activity("swim")]
    });
    const { isAway } = checkGeneratedWeek(input);
    expect(isAway("g1", "b0")).toBe(false);
    expect(isAway("g1", "b5")).toBe(true);
  });
});
