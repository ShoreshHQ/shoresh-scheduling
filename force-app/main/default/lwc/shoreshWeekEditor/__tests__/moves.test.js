import { REFUSED, inverse, moveEdit, removeEdit, resizeEdit } from "../moves";
import { day } from "./data/draftFixture";

const SWIM = "A:a1";
const BOATING = "A:a2";
const SOCCER = "A:a3";
const ITEMS = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a1", name: "Swim", gone: false },
  { kind: "A", id: "a2", name: "Boating", gone: false },
  { kind: "A", id: "a3", name: "Soccer", gone: false }
];
const nowhereAway = () => false;
const at = (d, group, block) => ({ day: d, group, block });

// Monday: Bunk 1 Flagpole, Swim, Open; Bunk 2 Flagpole, Boating over Period 2 and Lunch.
// Tuesday: Bunk 1 Flagpole, Open, Open; Bunk 2 Flagpole, Soccer, Open.
const week = () => [
  day("2026-06-29", ITEMS, ["1,2,", "1,3,^"]),
  day("2026-06-30", ITEMS, ["1,,", "1,4,"])
];

describe("moves", () => {
  it("onto an Open slot of another day it moves, leaving Open behind", () => {
    const result = moveEdit(week(), at(0, 0, 1), at(1, 0, 2), nowhereAway);
    expect(result.runs).toEqual([
      { day: 0, group: 0, first: 1, before: [SWIM], after: [""] },
      { day: 1, group: 0, first: 2, before: [""], after: [SWIM] }
    ]);
  });

  it("a multi-block activity moved two blocks down is one run on its row", () => {
    const days = [day("2026-06-29", ITEMS, ["1,3,^,,", "1,,,,"])];
    days[0].blocks = [
      ...days[0].blocks,
      { id: "t4", name: "Period 4" },
      { id: "t5", name: "Period 5" }
    ];
    // Flagpole, Boating, Boating, Open, Open: Boating dropped on block 3 runs blocks 3 and 4.
    const result = moveEdit(days, at(0, 0, 1), at(0, 0, 3), nowhereAway);
    expect(result.runs).toEqual([
      {
        day: 0,
        group: 0,
        first: 1,
        before: [BOATING, `^${BOATING}`, "", ""],
        after: ["", "", BOATING, `^${BOATING}`]
      }
    ]);
    // Dropped on the last block it wouldn't fit: refused, not shortened.
    expect(moveEdit(days, at(0, 0, 1), at(0, 0, 4), nowhereAway)).toEqual({
      refused: REFUSED.NO_ROOM
    });
    // Dropped on itself: nothing to do.
    expect(moveEdit(days, at(0, 0, 1), at(0, 0, 2), nowhereAway)).toBeNull();
  });

  it("onto a filled slot two single-block activities swap", () => {
    const result = moveEdit(week(), at(0, 0, 1), at(1, 1, 1), nowhereAway);
    expect(result.runs).toEqual([
      { day: 0, group: 0, first: 1, before: [SWIM], after: [SOCCER] },
      { day: 1, group: 1, first: 1, before: [SOCCER], after: [SWIM] }
    ]);
  });

  it("refuses a swap with a multi-block activity, a fixed activity, or an away slot", () => {
    expect(moveEdit(week(), at(0, 0, 1), at(0, 1, 2), nowhereAway)).toEqual({
      refused: REFUSED.SWAP_LONG
    });
    expect(moveEdit(week(), at(0, 0, 1), at(0, 1, 0), nowhereAway)).toEqual({
      refused: REFUSED.SET_TIME
    });
    expect(
      moveEdit(week(), at(0, 0, 1), at(1, 0, 2), (p) => p.block === 2)
    ).toEqual({ refused: REFUSED.AWAY });
    // Fixed activities themselves don't move.
    expect(moveEdit(week(), at(0, 0, 0), at(1, 0, 2), nowhereAway)).toBeNull();
  });

  it("dragged back to the list, a placement is taken out whole", () => {
    expect(removeEdit(week(), at(0, 1, 2)).runs).toEqual([
      {
        day: 0,
        group: 1,
        first: 1,
        before: [BOATING, `^${BOATING}`],
        after: ["", ""]
      }
    ]);
  });

  it("shortens and lengthens over Open slots only", () => {
    expect(resizeEdit(week(), at(0, 1, 1), 1, nowhereAway).runs).toEqual([
      {
        day: 0,
        group: 1,
        first: 1,
        before: [BOATING, `^${BOATING}`],
        after: [BOATING, ""]
      }
    ]);
    expect(resizeEdit(week(), at(0, 0, 1), 2, nowhereAway).runs).toEqual([
      {
        day: 0,
        group: 0,
        first: 1,
        before: [SWIM, ""],
        after: [SWIM, `^${SWIM}`]
      }
    ]);
    expect(resizeEdit(week(), at(0, 0, 1), 2, () => true)).toEqual({
      refused: REFUSED.NO_ROOM
    });
    expect(resizeEdit(week(), at(0, 0, 1), 1, nowhereAway)).toBeNull();
  });

  it("undo runs go back in reverse order", () => {
    const runs = [
      { day: 0, group: 0, first: 1, before: [SWIM], after: [""] },
      { day: 1, group: 0, first: 2, before: [""], after: [SWIM] }
    ];
    expect(inverse(runs)).toEqual([
      { day: 1, group: 0, first: 2, before: [SWIM], after: [""] },
      { day: 0, group: 0, first: 1, before: [""], after: [SWIM] }
    ]);
  });

  it("never swaps something into a block where the bunk isn't at camp", () => {
    expect(
      moveEdit(week(), at(0, 0, 1), at(1, 1, 1), (p) => p.group === 1)
    ).toEqual({ refused: REFUSED.AWAY, at: at(1, 1, 1) });
    // Nor the other way: the dragged one's own cell is where its bunk isn't at camp.
    expect(
      moveEdit(week(), at(0, 0, 1), at(1, 1, 1), (p) => p.group === 0)
    ).toEqual({ refused: REFUSED.AWAY, at: at(0, 0, 1) });
  });

  it("never swaps with an elective set or a special event placed on the grid (ADR 0018 E5)", () => {
    const placed = [
      ...ITEMS,
      { kind: "E", id: "a0X000000000001AAA", name: "Chugim", gone: false },
      { kind: "S", id: "a0E000000000001AAA", name: "Carnival", gone: false }
    ];
    const days = [day("2026-06-29", placed, ["1,2,", "1,5,6"])];
    expect(moveEdit(days, at(0, 0, 1), at(0, 1, 1), nowhereAway)).toEqual({
      refused: REFUSED.NO_SWAP
    });
    expect(moveEdit(days, at(0, 0, 1), at(0, 1, 2), nowhereAway)).toEqual({
      refused: REFUSED.NO_SWAP
    });
    // A set noted from a file by name stays where it is, as before.
    const noted = [
      ...ITEMS,
      { kind: "E", id: "", name: "Chugim", gone: false }
    ];
    const fromFile = [day("2026-06-29", noted, ["1,2,", "1,5,"])];
    expect(moveEdit(fromFile, at(0, 0, 1), at(0, 1, 1), nowhereAway)).toEqual({
      refused: REFUSED.FIXED_HERE
    });
  });
});
