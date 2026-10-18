import { LEFT_OUT, clearEdit, copyDayEdit, replan } from "../tools";
import { slots } from "../slotEdits";
import { BLOCKS, day } from "./data/draftFixture";

// Clear day, Clear week and Copy day to… on the made-up week (draftFixture): Period 1, Period 2,
// Lunch; Bunk 1 and Bunk 2; Flagpole (fixed) in Period 1.

const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const ELECTIVE = { kind: "E", id: null, name: "Chugim", gone: false };
const ITEMS = [FLAGPOLE, SWIM, BOATING, SOCCER, ELECTIVE];
const SWIM_GONE = ITEMS.map((i) => (i.id === "a1" ? { ...i, gone: true } : i));

const week = (monday, tuesday) => [
  day("2026-06-29", ITEMS, monday),
  day("2026-06-30", ITEMS, tuesday)
];

/** The rows after the runs, as slot identities ("" Open, "A:a1", "^A:a2"). */
function after(days, runs) {
  const rows = days.map((d) => d.groups.map((g, i) => slots(d, i)));
  runs.forEach((run) => {
    run.after.forEach((slot, i) => {
      rows[run.day][run.group][run.first + i] = slot;
    });
  });
  return rows;
}

const why = (list) => list.map((o) => [o.slot, o.why]);

describe("Clear day and Clear week", () => {
  it("clears the day's activities for every bunk, and says what stays and why", () => {
    const days = week(["1,2,4", "1,4,5"], ["1,2,", "1,,"]);
    const { runs, stayed } = clearEdit(days, [0]);
    expect(after(days, runs)[0]).toEqual([
      ["F:f1", "", ""],
      ["F:f1", "", "E:Chugim"]
    ]);
    // Fixed activities aren't listed; the elective is.
    expect(why(stayed)).toEqual([["E:Chugim", LEFT_OUT.NOT_SET_UP]]);
    expect(runs.every((run) => run.day === 0)).toBe(true);
  });

  it("clears one bunk's day only", () => {
    const days = week(["1,2,4", "1,4,"], ["1,,", "1,,"]);
    const rows = after(days, clearEdit(days, [0], { groupId: "g2" }).runs);
    expect(rows[0]).toEqual([
      ["F:f1", "A:a1", "A:a3"],
      ["F:f1", "", ""]
    ]);
  });

  it("clears a placement running several blocks whole, in one run", () => {
    const days = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    expect(clearEdit(days, [0]).runs).toEqual([
      {
        day: 0,
        group: 0,
        first: 1,
        before: ["A:a2", "^A:a2"],
        after: ["", ""]
      }
    ]);
  });

  it("Clear week covers every day; nothing to clear gives no runs", () => {
    const days = week(["1,2,", "1,,"], ["1,,4", "1,,"]);
    const rows = after(days, clearEdit(days, [0, 1]).runs);
    expect(rows[0][0]).toEqual(["F:f1", "", ""]);
    expect(rows[1][0]).toEqual(["F:f1", "", ""]);
    expect(
      clearEdit(week(["1,,", "1,,"], ["1,,", "1,,"]), [0, 1]).runs
    ).toEqual([]);
  });

  it("leaves, and lists, an activity deleted since and one partly where its bunk is away", () => {
    const days = week(["1,2,", "1,3,^"], ["1,,", "1,,"]);
    days[0] = { ...days[0], items: SWIM_GONE };
    // Bunk 2 is no longer at camp at Lunch: Boating's second block.
    const isAway = (d, g, b) => g === 1 && b === 2;
    const { runs, stayed } = clearEdit(days, [0], { isAway });
    expect(runs).toEqual([]);
    expect(why(stayed)).toEqual([
      ["A:a1", LEFT_OUT.GONE],
      ["A:a2", LEFT_OUT.AWAY]
    ]);
  });

  it("leaves a placement in a cell someone else changed, and counts it", () => {
    const days = week(["1,2,", "1,4,"], ["1,,", "1,,"]);
    const skip = (d, g, b) => g === 0 && b === 1;
    const { runs, skipped } = clearEdit(days, [0], { skip });
    expect(after(days, runs)[0]).toEqual([
      ["F:f1", "A:a1", ""],
      ["F:f1", "", ""]
    ]);
    expect(skipped).toBe(1);
  });
});

describe("Copy day to…", () => {
  it("each bunk's activities replace its activities on the target day, at the same blocks", () => {
    const days = week(["1,2,", "1,4,"], ["1,4,2", "1,,"]);
    const { runs, leftOut } = copyDayEdit(days, 0, [1]);
    expect(after(days, runs)[1]).toEqual([
      ["F:f1", "A:a1", ""],
      ["F:f1", "A:a3", ""]
    ]);
    expect(leftOut).toEqual([]);
    expect(runs.every((run) => run.day === 1)).toBe(true);
  });

  it("a placement running several blocks is copied whole", () => {
    const days = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    const rows = after(days, copyDayEdit(days, 0, [1]).runs);
    expect(rows[1][0]).toEqual(["F:f1", "A:a2", "^A:a2"]);
  });

  it("a several-block copy is left out when a fixed activity or an away time is in its second block", () => {
    const days = week(["1,3,^", "1,3,^"], ["1,,1", "1,,"]);
    // Tuesday: Flagpole also at Lunch for Bunk 1; Bunk 2 isn't at camp at Lunch.
    const isAway = (d, g, b) => d === 1 && g === 1 && b === 2;
    const { runs, leftOut } = copyDayEdit(days, 0, [1], { isAway });
    expect(runs).toEqual([]);
    expect(leftOut.map((o) => [o.group, o.why, o.blocking])).toEqual([
      [0, LEFT_OUT.TAKEN, "F:f1"],
      [1, LEFT_OUT.AWAY, undefined]
    ]);
  });

  it("the target's activities where its bunk is away now stay (Undo couldn't put them back)", () => {
    const days = week(["1,,", "1,,"], ["1,,4", "1,,"]);
    const isAway = (d, g, b) => d === 1 && g === 0 && b === 2;
    expect(copyDayEdit(days, 0, [1], { isAway }).runs).toEqual([]);
  });

  it("matches time blocks by Id: another order, or a block inserted inside a placement", () => {
    const days = week(["1,3,^", "1,2,"], ["1,,", "1,,"]);
    // Tuesday's blocks: Period 2, an Assembly, Period 1, Lunch.
    const assembly = {
      id: "t9",
      name: "Assembly",
      startTime: "10:50",
      endTime: "11:00",
      gone: false
    };
    days[1] = {
      ...days[1],
      blocks: [BLOCKS[1], assembly, BLOCKS[0], BLOCKS[2]],
      rows: [",,1,", ",,1,"]
    };
    const { runs, leftOut } = copyDayEdit(days, 0, [1]);
    // Swim (Period 2) goes to Period 2, wherever it is; Boating (Period 2 and Lunch) doesn't sit
    // next to each other on Tuesday: left out, naming Lunch, the block that isn't next.
    expect(after(days, runs)[1][1]).toEqual(["A:a1", "", "F:f1", ""]);
    expect(
      leftOut.map((o) => [o.slot, o.why, days[0].blocks[o.missing].name])
    ).toEqual([["A:a2", LEFT_OUT.NO_BLOCK, "Lunch"]]);
  });

  it("names the block the target day lacks, not the placement's first", () => {
    const days = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    days[1] = { ...days[1], blocks: BLOCKS.slice(0, 2), rows: ["1,", "1,"] };
    const { leftOut } = copyDayEdit(days, 0, [1]);
    expect(days[0].blocks[leftOut[0].missing].name).toBe("Lunch");
  });

  it("leaves out a bunk that isn't on the target day", () => {
    const days = week(["1,2,", "1,4,"], ["1,,", "1,,"]);
    days[1] = { ...days[1], groups: [days[1].groups[0]], rows: ["1,,"] };
    expect(why(copyDayEdit(days, 0, [1]).leftOut)).toEqual([
      ["A:a3", LEFT_OUT.NO_GROUP]
    ]);
  });

  it("lists a deleted activity and something not set up yet only when the target differs", () => {
    const days = week(["1,2,5", "1,,5"], ["1,,", "1,,5"]);
    days[0] = { ...days[0], items: SWIM_GONE };
    const { runs, leftOut } = copyDayEdit(days, 0, [1]);
    expect(runs).toEqual([]);
    // Bunk 2 already has Chugim at Lunch on Tuesday: not listed.
    expect(why(leftOut)).toEqual([
      ["A:a1", LEFT_OUT.GONE],
      ["E:Chugim", LEFT_OUT.NOT_SET_UP]
    ]);
  });

  it("leaves cells someone else changed as they are, and counts them", () => {
    const days = week(["1,2,", "1,4,"], ["1,4,", "1,2,"]);
    const skip = (d, g, b) => d === 1 && g === 1 && b === 1;
    const { runs, skipped } = copyDayEdit(days, 0, [1], { skip });
    expect(after(days, runs)[1]).toEqual([
      ["F:f1", "A:a1", ""],
      ["F:f1", "A:a1", ""]
    ]);
    expect(skipped).toBe(1);
  });

  it("copies to several days at once, skipping the source day and a day that can't be read", () => {
    const days = [
      ...week(["1,2,", "1,,"], ["1,,", "1,,"]),
      { ...day("2026-07-01", ITEMS, ["1,,", "1,,"]), problem: "unreadable" }
    ];
    const { runs } = copyDayEdit(days, 0, [0, 1, 2]);
    expect(runs.map((run) => run.day)).toEqual([1]);
  });
});

describe("worked out again after someone else's change (replan)", () => {
  const COPY = { kind: "copy", from: "2026-06-29", dates: ["2026-06-30"] };

  it("a copy whose source cell someone else changed leaves that target cell as it is", () => {
    // The director saw Swim in Bunk 1's Monday Period 2 and copied Monday to Tuesday, where
    // Bunk 1 has Soccer. Someone else made Monday's cell Boating.
    const seen = week(["1,2,", "1,,"], ["1,4,", "1,,"]);
    const saved = week(["1,3,", "1,,"], ["1,4,", "1,,"]);
    const result = replan(COPY, seen, saved, new Set(), () => false);
    // Tuesday keeps Soccer: neither the Swim the director saw nor their Boating is copied.
    expect(after(saved, result.runs)[1][0]).toEqual(["F:f1", "A:a3", ""]);
    expect(result.kept.has("2026-06-30|g1|t2")).toBe(true);
    expect(result.missed).toBe(1);
  });

  it("a placement made shorter is someone else's in every cell it covered", () => {
    // Bunk 1's Boating ran Period 2 and Lunch; someone else shortened it to Period 2.
    const seen = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    const saved = week(["1,3,", "1,,"], ["1,,", "1,,"]);
    const clear = { kind: "clear", dates: ["2026-06-29"] };
    const result = replan(clear, seen, saved, new Set(), () => false);
    expect(result.runs).toEqual([]);
    expect(result.kept.has("2026-06-29|g1|t2")).toBe(true);
    expect(result.kept.has("2026-06-29|g1|t3")).toBe(true);
  });
});
