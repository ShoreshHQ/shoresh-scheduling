import { LEFT_OUT, pasteEdit, replan } from "../tools";
import { slots } from "../slotEdits";
import { day } from "./data/draftFixture";

// Paste (Greg decision 45) on the made-up week (draftFixture): Period 1, Period 2, Lunch; Bunk 1
// and Bunk 2; Flagpole (fixed) in Period 1. By Copy day to…'s rules (tools.js pasteEdit).

const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const ITEMS = [FLAGPOLE, SWIM, BOATING, SOCCER];
const MON = "2026-06-29";
const TUE = "2026-06-30";

const week = (monday, tuesday) => [
  day(MON, ITEMS, monday),
  day(TUE, ITEMS, tuesday)
];

function after(days, runs) {
  const rows = days.map((d) => d.groups.map((g, i) => slots(d, i)));
  runs.forEach((run) => {
    run.after.forEach((slot, i) => {
      rows[run.day][run.group][run.first + i] = slot;
    });
  });
  return rows;
}

const item = (date, groupId, blockIds, slot, name, gone = false) => ({
  date,
  groupId,
  blockIds,
  slot,
  name,
  gone
});
const paste = (items, opens = [], outside = []) => ({
  kind: "paste",
  dates: [
    ...new Set([
      ...items.map((i) => i.date),
      ...opens.map((k) => k.split("|")[0])
    ])
  ],
  items,
  opens,
  outside
});
const why = (list) => list.map((o) => [o.name, o.why]);

describe("Paste", () => {
  it("puts what was copied on another bunk, clearing what is there whole, fixed activities staying", () => {
    // Bunk 2 has Boating over Period 2 and Lunch; Swim is pasted into its Period 2.
    const days = week(["1,2,", "1,3,^"], ["1,,", "1,,"]);
    const { runs, leftOut } = pasteEdit(
      days,
      paste([item(MON, "g2", ["t2"], "A:a1", "Swim")])
    );
    expect(after(days, runs)[0][1]).toEqual(["F:f1", "A:a1", ""]);
    expect(leftOut).toEqual([]);
    // Bunk 1 is untouched.
    expect(runs.every((run) => run.group === 1)).toBe(true);
  });

  it("a placement running several blocks goes in whole, onto another day", () => {
    const days = week(["1,3,^", "1,,"], ["1,4,", "1,,"]);
    const { runs } = pasteEdit(
      days,
      paste([item(TUE, "g1", ["t2", "t3"], "A:a2", "Boating")])
    );
    expect(after(days, runs)[1][0]).toEqual(["F:f1", "A:a2", "^A:a2"]);
  });

  it("a copied Open cell clears the cell it goes onto", () => {
    const days = week(["1,2,4", "1,,"], ["1,,", "1,,"]);
    const { runs } = pasteEdit(days, paste([], [`${MON}|g1|t2`]));
    expect(after(days, runs)[0][0]).toEqual(["F:f1", "", "A:a3"]);
  });

  it("leaves out, and says why, what can't go: away, set up there, removed, not set up, no room", () => {
    const days = week(["1,,", "1,,"], ["1,,", "1,,"]);
    const isAway = (d, g, b) => g === 1 && b === 2;
    const { runs, leftOut } = pasteEdit(
      days,
      paste(
        [
          item(MON, "g2", ["t3"], "A:a1", "Swim"),
          item(MON, "g1", ["t1"], "A:a3", "Soccer"),
          item(TUE, "g1", ["t2"], "A:a2", "Boating", true),
          item(TUE, "g2", ["t2"], "E:Chugim", "Chugim"),
          item(TUE, "g1", ["t3", "t1"], "A:a1", "Swim")
        ],
        [],
        [{ slot: "A:a3", name: "Soccer" }]
      ),
      { isAway }
    );
    expect(runs).toEqual([]);
    expect(why(leftOut)).toEqual([
      ["Soccer", LEFT_OUT.NO_ROOM],
      ["Swim", LEFT_OUT.NO_ROOM],
      ["Swim", LEFT_OUT.AWAY],
      ["Soccer", LEFT_OUT.TAKEN],
      ["Boating", LEFT_OUT.GONE],
      ["Chugim", LEFT_OUT.NOT_SET_UP]
    ]);
    const taken = leftOut.find((o) => o.why === LEFT_OUT.TAKEN);
    expect(taken.blocking).toBe("F:f1");
    expect(taken).toMatchObject({ day: 0, group: 0, block: 0 });
  });

  it("the same activity already there needs nothing", () => {
    const days = week(["1,2,", "1,,"], ["1,,", "1,,"]);
    expect(
      pasteEdit(days, paste([item(MON, "g1", ["t2"], "A:a1", "Swim")])).runs
    ).toEqual([]);
  });

  it("leaves a cell someone else changed as it is, and counts it", () => {
    const days = week(["1,,", "1,4,"], ["1,,", "1,,"]);
    const skip = (d, g, b) => d === 0 && g === 1 && b === 1;
    const { runs, skipped } = pasteEdit(
      days,
      paste([item(MON, "g2", ["t2"], "A:a1", "Swim")]),
      { skip }
    );
    expect(runs).toEqual([]);
    expect(skipped).toBe(1);
  });

  describe("worked out again (replan)", () => {
    it("someone else's change is kept, the rest goes in", () => {
      // The director pasted Swim into both bunks' Period 2; someone else put Soccer in Bunk 2's.
      const tool = paste([
        item(MON, "g1", ["t2"], "A:a1", "Swim"),
        item(MON, "g2", ["t2"], "A:a1", "Swim")
      ]);
      const seen = week(["1,,", "1,,"], ["1,,", "1,,"]);
      const saved = week(["1,,", "1,4,"], ["1,,", "1,,"]);
      const result = replan(tool, seen, saved, new Set(), () => false);
      expect(after(saved, result.runs)[0]).toEqual([
        ["F:f1", "A:a1", ""],
        ["F:f1", "A:a3", ""]
      ]);
      expect(result.missed).toBe(1);
    });

    it("a pasted placement with one locked cell is left out whole, and named as locked", () => {
      const tool = paste([item(TUE, "g1", ["t2", "t3"], "A:a2", "Boating")]);
      const seen = week(["1,,", "1,,"], ["1,,", "1,,"]);
      const result = replan(
        tool,
        seen,
        seen,
        new Set(),
        () => false,
        new Set([`${TUE}|g1|t3`])
      );
      expect(result.runs).toEqual([]);
      expect(result.lockedCells).toEqual([
        { key: `${TUE}|g1|t2`, slot: "A:a2" }
      ]);
      expect(result.missed).toBe(0);
    });
  });
});
