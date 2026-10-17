/**
 * Seeded property test: random small camps, each built and checked by an independent checker
 * (data/check.js). On every camp: no hard rule is broken unless a flag on a generated cell names
 * it; no at-camp, unlocked, open cell is left blank unless the result says nothing can go there;
 * locked, fixed and not-at-camp cells come back as they went in; and building twice gives the
 * same week.
 */
import { generateWeek } from "c/shoreshEngine";
import { camp } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";
import { problems } from "./data/check";

const SEEDS = 300;

describe("generateWeek on random small camps", () => {
  it(`keeps every rule, never leaves a cell blank, and is deterministic (${SEEDS} seeds)`, () => {
    const bad = [];
    let flagged = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = withHistory(randomCamp(seed), seed);
      const input = camp(spec);
      const result = generateWeek(input);
      for (const p of problems(spec, input, result)) {
        bad.push(`seed ${seed}: ${p}`);
      }
      if (JSON.stringify(generateWeek(camp(spec))) !== JSON.stringify(result)) {
        bad.push(`seed ${seed}: not deterministic`);
      }
      flagged += result.flags.length;
    }
    expect(bad.slice(0, 20)).toEqual([]);
    // The camps are tight enough that the never-blank pass really runs.
    expect(flagged).toBeGreaterThan(0);
  });
});
