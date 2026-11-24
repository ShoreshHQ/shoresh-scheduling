/**
 * A saved row (wiki data model, compact grid format: "" Open, a number for an item of the day's
 * list from 1, "^" carries on), read and written in one place (c/shoreshSavedRow, which the
 * engine re-exports) for every screen and the engine. What doesn't read as that format is Open, everywhere.
 */
import { readRow, writeRow } from "c/shoreshSavedRow";
import { slots } from "c/shoreshEngine";

const SWIM = { kind: "A", id: "a1", name: "Swim" };
const FLAG = { kind: "F", id: "f1", name: "Flagpole" };
const ITEMS = [FLAG, SWIM];

describe("a saved row", () => {
  it("reads Open, an item by its number, and an item carrying on", () => {
    expect(readRow("1,2,^,", ITEMS)).toEqual([
      { item: FLAG, number: 1, carriesOn: false },
      { item: SWIM, number: 2, carriesOn: false },
      { item: SWIM, number: 2, carriesOn: true },
      null
    ]);
  });

  it("reads anything else as Open: no such item, not a number, and carrying on from nothing", () => {
    expect(readRow("^,3,x,0,^,2,^", ITEMS)).toEqual([
      null,
      null,
      null,
      null,
      null,
      { item: SWIM, number: 2, carriesOn: false },
      { item: SWIM, number: 2, carriesOn: true }
    ]);
    expect(readRow(undefined, ITEMS)).toEqual([null]);
    expect(readRow("1", undefined)).toEqual([null]);
  });

  it("writes back what it read, and a damaged row as Open", () => {
    expect(writeRow(readRow("1,2,^,", ITEMS))).toBe("1,2,^,");
    expect(writeRow(readRow("^,3,x,2,^", ITEMS))).toBe(",,,2,^");
  });

  it("is what each cell holds, as an identity, for the screens' edits", () => {
    const day = { items: ITEMS, rows: ["1,2,^", "^,9,2"] };
    expect(slots(day, 0)).toEqual(["F:f1", "A:a1", "^A:a1"]);
    expect(slots(day, 1)).toEqual(["", "", "A:a1"]);
  });
});
