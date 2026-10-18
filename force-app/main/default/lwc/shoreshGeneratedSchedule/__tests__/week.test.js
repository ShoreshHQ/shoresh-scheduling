import { buildTerms } from "c/shoreshTerms";
import { clearedDays, isLit, litCells, openCells } from "../week";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

// A made-up Monday: Flagpole fixed, a two-block Hike, an elective (not set up yet), Swim.
const DAY = {
  dateValue: "2026-06-29",
  blocks: [
    { id: "b1", name: "Flag", startTime: "08:30", endTime: "09:00" },
    { id: "b2", name: "Period 1", startTime: "09:00", endTime: "10:00" },
    { id: "b3", name: "Period 2", startTime: "10:00", endTime: "11:00" },
    { id: "b4", name: "Period 3", startTime: "11:00", endTime: "12:00" }
  ],
  groups: [
    { id: "g1", name: "Bunk 1" },
    { id: "g2", name: "Bunk 2" }
  ],
  items: [
    { kind: "F", id: "f1", name: "Flagpole" },
    { kind: "A", id: "a1", name: "Hike" },
    { kind: "E", id: "", name: "Electives" },
    { kind: "A", id: "a2", name: "Swim" }
  ],
  rows: ["1,2,^,4", "1,3,4,"]
};

describe("clearedDays (Start over)", () => {
  it("clears every activity, a multi-block one whole, and keeps fixed and not-set-up items", () => {
    const [day] = clearedDays([DAY]);
    expect(day.rows).toEqual(["1,,,", "1,2,,"]);
    expect(day.items).toEqual([
      { kind: "F", id: "f1", name: "Flagpole" },
      { kind: "E", id: "", name: "Electives" }
    ]);
    // The frame is the day's own.
    expect(day.blocks).toBe(DAY.blocks);
    expect(day.groups).toBe(DAY.groups);
  });

  it("leaves a week with nothing to clear as it is", () => {
    const [day] = clearedDays([{ ...DAY, rows: ["1,,,", "1,3,,"] }]);
    expect(day.rows).toEqual(["1,,,", "1,2,,"]);
  });
});

describe("openCells", () => {
  const atCamp = () => false;

  it("lists each Open cell where the bunk is at camp, in the camp's words", () => {
    expect(openCells([DAY], atCamp, terms)).toEqual([
      {
        dateValue: "2026-06-29",
        groupId: "g2",
        blockId: "b4",
        text: "Bunk 2 · Monday · Period 3"
      }
    ]);
  });

  it("leaves out cells where the bunk isn't at camp", () => {
    const away = (groupId, blockId) => groupId === "g2" && blockId === "b4";
    expect(openCells([DAY], away, terms)).toEqual([]);
  });

  it("says Already busy then when the bunk holds something at an overlapping time", () => {
    const overlapping = {
      ...DAY,
      blocks: [
        ...DAY.blocks.slice(0, 3),
        { id: "b4", name: "Late", startTime: "10:30", endTime: "11:30" }
      ]
    };
    expect(openCells([overlapping], atCamp, terms)[0].text).toBe(
      "Bunk 2 · Monday · Late: Already busy then"
    );
  });

  it("skips a day that could not be read", () => {
    expect(openCells([{ ...DAY, problem: "bad row" }], atCamp, terms)).toEqual(
      []
    );
  });
});

describe("litCells", () => {
  const checked = {
    placements: [
      { d: 0, groupId: "g1", kind: "A", id: "a1", first: 1, length: 2 },
      { d: 0, groupId: "g1", kind: "A", id: "a2", first: 3, length: 1 },
      { d: 0, groupId: "g2", kind: "A", id: "a2", first: 2, length: 1 }
    ]
  };

  it("lights every placement of a still needed line's activity for its bunk, each block", () => {
    const lit = litCells(
      [{ kind: "stillNeeded", groupId: "g1", activityId: "a1" }],
      checked,
      [DAY]
    );
    expect([...lit]).toEqual(["2026-06-29|g1|b2", "2026-06-29|g1|b3"]);
  });

  it("lights an Open or overlapping line's own cell", () => {
    const lit = litCells(
      [{ kind: "open", dateValue: "2026-06-29", groupId: "g2", blockId: "b4" }],
      checked,
      [DAY]
    );
    expect([...lit]).toEqual(["2026-06-29|g2|b4"]);
  });

  it("a grid cell is lit when any block it covers is", () => {
    const lit = new Set(["2026-06-29|g1|b3"]);
    expect(isLit(lit, [DAY], { day: 0, group: 0, block: 1 })).toBe(true);
    expect(isLit(lit, [DAY], { day: 0, group: 0, block: 3 })).toBe(false);
    expect(isLit(new Set(), [DAY], { day: 0, group: 0, block: 1 })).toBe(false);
  });
});
