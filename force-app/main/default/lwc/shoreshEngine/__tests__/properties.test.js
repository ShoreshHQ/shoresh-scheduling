/**
 * Seeded property test: random small camps, each built and checked by an independent checker
 * (data/check.js). On every camp: no hard rule is broken unless a flag on a generated cell names
 * it; no at-camp, unlocked, open cell is left blank unless the result says nothing can go there;
 * locked, fixed and not-at-camp cells come back as they went in; and building twice gives the
 * same week.
 */
import {
  checkWeek,
  generateWeek,
  readActivities,
  readLocations
} from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { camp } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";
import { problems } from "./data/check";

const SEEDS = 300;

/**
 * checkWeek on the engine's finished week, its model built here from the camp spec rather than
 * by the engine, so the engine's flags must be what the one rules module says about its output.
 */
function checkedApart(spec, input, result) {
  const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dates = result.days.map((d) => d.dateValue);
  const blocks = new Map(spec.blocks.map((b) => [b.id, b]));
  return checkWeek(
    result.days,
    {
      activities: readActivities(input.activities),
      locations: readLocations(input.locations),
      divisions: new Map(spec.groups.map((g) => [g.id, g.division])),
      setTimeLocations: new Map(
        [...spec.fixed, ...spec.recurring].map((f) => [
          f.id,
          f.location || null
        ])
      ),
      notFor: new Map(
        spec.activities.map((a) => [
          a.id,
          spec.groups
            .filter(
              (g) =>
                a.eligible.length &&
                !a.eligible.includes(g.id) &&
                !a.eligible.includes(g.division)
            )
            .map((g) => g.id)
        ])
      ),
      dotShorter: true,
      othersAt: (kind, id, d, blockId) =>
        spec.otherPrograms
          .filter(
            (o) =>
              kind === "place" &&
              o.locationId === id &&
              o.date === dates[d] &&
              minutesOf(o.startTime) < minutesOf(blocks.get(blockId).endTime) &&
              minutesOf(blocks.get(blockId).startTime) < minutesOf(o.endTime)
          )
          .reduce((n, o) => n + (o.groups || 1), 0)
    },
    { t: buildTerms([]), dayName: () => "" }
  );
}

/** Each dotted cell's words, from checkWeek's placements. */
function dotsByCell(checked) {
  const out = {};
  for (const p of checked.placements) {
    if (checked.flags.has(p.key)) {
      const [date] = p.key.split("|");
      for (let b = p.first; b < p.first + p.length; b++) {
        out[`${date}|${p.groupId}|${b}`] = checked.flags.get(p.key);
      }
    }
  }
  return out;
}

function dotsOf(result) {
  const out = {};
  for (const f of result.flags) {
    const day = result.days.find((d) => d.dateValue === f.date);
    const b = day.blocks.findIndex((x) => x.id === f.blockId);
    out[`${f.date}|${f.groupId}|${b}`] = f.reason;
  }
  return out;
}

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
      const apart = checkedApart(spec, input, result);
      if (
        JSON.stringify(dotsByCell(apart)) !== JSON.stringify(dotsOf(result))
      ) {
        bad.push(`seed ${seed}: the engine's dots aren't checkWeek's`);
      }
      if (
        JSON.stringify([apart.stillNeeded, apart.spread]) !==
        JSON.stringify([result.stillNeeded, result.spread])
      ) {
        bad.push(
          `seed ${seed}: the engine's still-needed lines aren't checkWeek's`
        );
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
    // The camps are tight enough that the never-blank pass really runs.
    expect(flagged).toBeGreaterThan(0);
  });
});
