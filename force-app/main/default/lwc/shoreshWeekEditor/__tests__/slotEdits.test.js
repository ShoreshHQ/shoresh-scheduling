import {
  OPEN,
  applyRun,
  diffRun,
  editRun,
  identity,
  placement,
  rebaseRun,
  slots
} from "../slotEdits";
import { WITH_SOCCER, day } from "./data/draftFixture";

const FLAGPOLE = "F:f1";
const BOATING = "A:a2";
const SOCCER = "A:a3";
const nowhereAway = () => false;

// Bunk 1: Flagpole, Soccer, Open. Bunk 2: Flagpole, Boating over Period 2 and Lunch.
const monday = () =>
  day(
    "2026-06-29",
    [...WITH_SOCCER, { kind: "A", id: "a2", name: "Boating", gone: false }],
    ["1,2,", "1,3,^"]
  );

describe("slot edits", () => {
  it("names what each slot holds, by kind and record", () => {
    expect(slots(monday(), 0)).toEqual([FLAGPOLE, SOCCER, OPEN]);
    expect(slots(monday(), 1)).toEqual([FLAGPOLE, BOATING, `^${BOATING}`]);
    expect(identity({ kind: "T", id: "", name: "Zoo trip" })).toBe(
      "T:Zoo trip"
    );
  });

  it("finds the whole placement a slot is part of", () => {
    expect(placement(monday(), 1, 2)).toEqual({
      first: 1,
      length: 2,
      slot: BOATING
    });
    expect(placement(monday(), 0, 2)).toEqual({
      first: 2,
      length: 1,
      slot: OPEN
    });
  });

  it("a multi-block activity fills its length over Open slots", () => {
    const blank = day("2026-06-29", [], [",,", ",,"]);
    expect(editRun(blank, 0, 1, BOATING, 2, nowhereAway)).toEqual({
      first: 1,
      before: [OPEN, OPEN],
      after: [BOATING, `^${BOATING}`]
    });
  });

  it("stops at a filled slot, a slot the group is away, or the day's end", () => {
    const blank = day("2026-06-29", [...WITH_SOCCER], [",1,", ",,"]);
    expect(editRun(blank, 0, 0, BOATING, 2, nowhereAway)).toEqual({
      first: 0,
      before: [OPEN],
      after: [BOATING]
    });
    expect(editRun(blank, 1, 1, BOATING, 2, (b) => b === 2)).toEqual({
      first: 1,
      before: [OPEN],
      after: [BOATING]
    });
    expect(editRun(blank, 1, 2, BOATING, 2, nowhereAway).after).toEqual([
      BOATING
    ]);
  });

  it("replacing or clearing a multi-block placement takes all of it", () => {
    expect(editRun(monday(), 1, 2, SOCCER, 1, nowhereAway)).toEqual({
      first: 1,
      before: [BOATING, `^${BOATING}`],
      after: [SOCCER, OPEN]
    });
    expect(editRun(monday(), 1, 1, OPEN, 1, nowhereAway)).toEqual({
      first: 1,
      before: [BOATING, `^${BOATING}`],
      after: [OPEN, OPEN]
    });
  });

  it("leaves fixed activities, away slots, and no-change edits alone", () => {
    expect(editRun(monday(), 0, 0, SOCCER, 1, nowhereAway)).toBeNull();
    expect(editRun(monday(), 0, 2, SOCCER, 1, () => true)).toBeNull();
    expect(editRun(monday(), 0, 1, SOCCER, 1, nowhereAway)).toBeNull();
  });

  it("shows an edit on the day at once, adding a new item to its list", () => {
    const changed = applyRun(
      monday(),
      0,
      { first: 2, after: ["A:a1"] },
      () => ({ kind: "A", id: "a1", name: "Swim" })
    );
    expect(changed.rows[0]).toBe("1,2,4");
    expect(changed.items[3]).toEqual({
      kind: "A",
      id: "a1",
      name: "Swim",
      gone: false
    });
    expect(slots(changed, 1)).toEqual(slots(monday(), 1));
  });

  it("a run covers what changed, widened to whole placements", () => {
    expect(
      diffRun([FLAGPOLE, BOATING, `^${BOATING}`], [FLAGPOLE, BOATING, OPEN])
    ).toEqual({
      first: 1,
      before: [BOATING, `^${BOATING}`],
      after: [BOATING, OPEN]
    });
    expect(diffRun([FLAGPOLE], [FLAGPOLE])).toBeNull();
  });

  it("use yours makes exactly your run, replacing all of anything of theirs it overlaps", () => {
    expect(rebaseRun([FLAGPOLE, BOATING, `^${BOATING}`], 2, [SOCCER])).toEqual({
      first: 1,
      before: [BOATING, `^${BOATING}`],
      after: [OPEN, SOCCER]
    });
    expect(
      rebaseRun([FLAGPOLE, OPEN, SOCCER], 1, [BOATING, `^${BOATING}`])
    ).toEqual({
      first: 1,
      before: [OPEN, SOCCER],
      after: [BOATING, `^${BOATING}`]
    });
  });

  it("use yours on a run past the day's end changes nothing", () => {
    expect(rebaseRun([FLAGPOLE, OPEN], 1, [BOATING, `^${BOATING}`])).toBeNull();
  });
});
