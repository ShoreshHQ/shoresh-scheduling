// The pure parts of special days and events on a week (specials.js, ADR 0014 slice 4).
import { buildTerms } from "c/shoreshTerms";
import {
  eventRuns,
  mergedWith,
  planGrid,
  replacedDays,
  rowsCovered
} from "../specials";
import { day } from "./data/draftFixture";

const t = buildTerms([]);
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };
const EVENT = "S:a0E000000000001AAA";
const never = () => false;

describe("specials.js", () => {
  it("finds the days a special day replaces, by date", () => {
    const replaced = replacedDays({
      specials: { days: [{ dateValue: "2026-06-30", name: "V" }] }
    });
    expect([...replaced.keys()]).toEqual(["2026-06-30"]);
    expect(replacedDays(null).size).toBe(0);
  });

  it("draws a special day's schedule flat, the same cells side by side as one", () => {
    const plan = day("2026-06-30", [FLAGPOLE, BOATING], ["1,2,^", "1,2,^"]);
    const grid = planGrid({ name: "Visiting Day", plan }, t);
    expect(grid.cells.every((c) => !c.slot)).toBe(true);
    const boating = grid.cells.filter((c) => c.text === "Boating");
    expect(boating.map((c) => c.className)).toEqual([
      "cell cell_plan",
      "cell cell_plan"
    ]);
    expect(boating[0].mergeKey).toBe(boating[1].mergeKey);
    expect(grid.cells.find((c) => c.text === "Flagpole").setTime).toBe(true);
  });

  it("has no grid for a special day that can't be read or has no time blocks", () => {
    expect(planGrid({ plan: { problem: "x", blocks: [] } }, t)).toBeNull();
    expect(planGrid({ plan: { blocks: [] } }, t)).toBeNull();
    expect(planGrid(null, t)).toBeNull();
  });

  it("covers each bunk's run of blocks the chosen cells reach", () => {
    const days = [day("2026-06-29", [FLAGPOLE, BOATING], ["1,2,^", "1,,"])];
    const rows = rowsCovered(days, [
      { slot: { day: 0, group: 0, block: 1 } },
      { slot: { day: 0, group: 1, block: 1 } },
      { slot: { day: 0, group: 1, block: 2 } }
    ]);
    expect(rows).toEqual([
      { day: 0, group: 0, first: 1, last: 2 },
      { day: 0, group: 1, first: 1, last: 2 }
    ]);
  });

  it("puts an event over every block of the rows, whatever was there going in full", () => {
    const days = [day("2026-06-29", [FLAGPOLE, BOATING], ["1,2,^", "1,,"])];
    const result = eventRuns(
      days,
      [
        { day: 0, group: 0, first: 1, last: 1 },
        { day: 0, group: 1, first: 1, last: 2 }
      ],
      EVENT,
      { isAway: never, isLocked: never }
    );
    expect(result.runs).toEqual([
      {
        day: 0,
        group: 0,
        first: 1,
        before: ["A:a2", "^A:a2"],
        after: [EVENT, ""]
      },
      {
        day: 0,
        group: 1,
        first: 1,
        before: ["", ""],
        after: [EVENT, `^${EVENT}`]
      }
    ]);
  });

  it("refuses a fixed activity, a bunk away, or a locked cell, and says where", () => {
    const days = [day("2026-06-29", [FLAGPOLE], ["1,,", "1,,"])];
    const rows = [{ day: 0, group: 0, first: 0, last: 1 }];
    expect(
      eventRuns(days, rows, EVENT, { isAway: never, isLocked: never })
    ).toEqual({ refused: "setTime", at: { day: 0, group: 0, block: 0 } });
    const later = [{ day: 0, group: 1, first: 1, last: 2 }];
    expect(
      eventRuns(days, later, EVENT, {
        isAway: (s) => s.block === 2,
        isLocked: never
      })
    ).toEqual({ refused: "away", at: { day: 0, group: 1, block: 2 } });
    expect(
      eventRuns(days, later, EVENT, { isAway: never, isLocked: () => true })
    ).toEqual({ refused: "locked", at: { day: 0, group: 1, block: 1 } });
  });

  it("finds the cells drawn as one with a cell", () => {
    const cells = [
      { key: "0-1", row: 1, column: 0, mergeKey: "m" },
      { key: "1-1", row: 1, column: 1, mergeKey: "m" },
      { key: "2-1", row: 1, column: 2, mergeKey: "other" },
      { key: "3-1", row: 1, column: 3, mergeKey: "m" }
    ];
    expect(mergedWith(cells, cells[1]).map((c) => c.key)).toEqual([
      "0-1",
      "1-1"
    ]);
    expect(mergedWith(cells, cells[3]).map((c) => c.key)).toEqual(["3-1"]);
    expect(mergedWith(cells, { key: "x" })).toEqual([{ key: "x" }]);
  });
});
