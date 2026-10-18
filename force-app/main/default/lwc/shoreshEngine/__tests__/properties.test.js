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
import { mulberry32 } from "../random";
import { activity, block, camp, cellsOf, group } from "./data/camp";
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
      locked: keptActivities(spec, input),
      othersAt: (kind, id, d, blockId) =>
        spec.otherPrograms
          .filter(
            (o) =>
              (kind === "place" ? o.locationId : o.activityId) === id &&
              o.date === dates[d] &&
              minutesOf(o.startTime) < minutesOf(blocks.get(blockId).endTime) &&
              minutesOf(blocks.get(blockId).startTime) < minutesOf(o.endTime)
          )
          .reduce((n, o) => n + (o.groups == null ? 1 : o.groups), 0)
    },
    {
      t: buildTerms([]),
      // Written here, not taken from the engine.
      dayName: (date) =>
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ][new Date(`${date}T00:00:00Z`).getUTCDay()]
    }
  );
}

/** The activities the build keeps, by placement: locked ones, or every one in "fill the open cells". */
function keptActivities(spec, input) {
  const keys = new Set();
  const locks = new Set(
    (input.locks || []).map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
  );
  for (const c of spec.cells || []) {
    if ((c.kind || "A") !== "A") {
      continue;
    }
    const date = input.days[c.day].dateValue;
    const first = spec.blocks.findIndex((b) => b.id === c.block);
    const act = spec.activities.find((a) => a.id === c.act);
    const length = c.length || (act ? act.span : 1);
    const run = spec.blocks
      .slice(first, first + length)
      .map((b) => `${date}|${c.group}|${b.id}`);
    if (input.mode === "fillOpen" || run.some((k) => locks.has(k))) {
      keys.add(`${date}|${c.group}|${c.block}`);
    }
  }
  return keys;
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
    let overlaps = 0;
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
        JSON.stringify(apart.overlapping) !== JSON.stringify(result.overlapping)
      ) {
        bad.push(`seed ${seed}: the engine's overlaps aren't checkWeek's`);
      }
      // Each overlapping cell holds a dotted placement that bends the same rules.
      for (const o of result.overlapping) {
        const dot = result.flags.find(
          (f) =>
            f.date === o.dateValue &&
            f.groupId === o.groupId &&
            f.blockId === o.blockId
        );
        if (!dot || !o.rules.every((r) => dot.bends.includes(r))) {
          bad.push(`seed ${seed}: an overlap with no matching dot: ${o.text}`);
        }
      }
      overlaps += result.overlapping.length;
      // Each data entry says what its line says: the activity, the bunk and the number.
      const name = (id) => spec.activities.find((a) => a.id === id).name;
      const bunk = (id) => spec.groups.find((g) => g.id === id).name;
      const lines = [
        ...result.stillNeededBy.map(
          (e) =>
            `${name(e.activityId)} · ${bunk(e.groupId)}: ${e.missing} still needed`
        ),
        ...result.spreadBy.map(
          (e) =>
            `${name(e.activityId)} · ${bunk(e.groupId)}: ${e.missing} still needed by ${e.byDay}`
        )
      ];
      if (
        JSON.stringify(lines) !==
        JSON.stringify([...result.stillNeeded, ...result.spread])
      ) {
        bad.push(`seed ${seed}: the still-needed data doesn't match its lines`);
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
    expect(overlaps).toBeGreaterThan(0);
  });
});

/**
 * Weekly maximums are soft (Greg, 2026-10-17): over them before anything else, smallest overage
 * first. Random camps where only maximums press (one division, no places, no limit at once, every
 * activity for everyone, one block long). A bunk two or more over on an activity is wrong when,
 * at every cell that activity holds for it, another activity was there to take at most one over
 * (at or under its maximum in the finished week, so at most one over when chosen, and not on that
 * day). Counts only grow as the week fills, so the finished week shows what was available.
 */
describe("going over weekly maximums, on random camps", () => {
  it("never puts a bunk 2+ over on an activity while one 1 over was free for the cell (300 seeds)", () => {
    const bad = [];
    let twoOver = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = mulberry32(seed * 7919);
      const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
      const acts = Array.from({ length: int(2, 5) }, (_, i) =>
        activity(`a${i}`, {
          max: r() < 0.15 ? null : int(0, 3),
          atOnce: null,
          priority: r() < 0.5 ? "High" : "Low"
        })
      );
      const spec = {
        groups: Array.from({ length: int(1, 4) }, (_, i) => group(`g${i}`)),
        days: int(1, 5),
        blocks: Array.from({ length: int(2, 5) }, (_, i) => block(i)),
        activities: acts,
        option: int(1, 5)
      };
      const result = generateWeek(camp(spec));
      const cells = cellsOf(result.days);
      for (const g of spec.groups) {
        const count = (id) =>
          cells.reduce(
            (n, d) => n + d[g.id].filter((c) => c && c.id === id).length,
            0
          );
        for (const a of acts) {
          if (a.max === null || count(a.id) - a.max < 2) {
            continue;
          }
          twoOver++;
          const everyCellHadBetter = cells.every((d) =>
            d[g.id].every(
              (c) =>
                !c ||
                c.id !== a.id ||
                acts.some(
                  (b) =>
                    b.id !== a.id &&
                    (b.max === null || count(b.id) <= b.max) &&
                    !d[g.id].some((x) => x && x.id === b.id)
                )
            )
          );
          if (everyCellHadBetter) {
            bad.push(
              `seed ${seed}: ${g.id} is ${count(a.id) - a.max} over on ${a.id}`
            );
          }
        }
      }
    }
    expect(bad).toEqual([]);
    // Not vacuous: the camps really do push bunks two or more over.
    expect(twoOver).toBeGreaterThan(0);
  });
});
