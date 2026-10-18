import { LEFT_OUT, clearEdit, copyDayEdit } from "../tools";
import { slots } from "../slotEdits";
import { day } from "./data/draftFixture";

// Clear day, Clear week and Copy day to… on the made-up week (draftFixture): Period 1, Period 2,
// Lunch; Bunk 1 and Bunk 2; Flagpole (fixed) in Period 1.

const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const ELECTIVE = { kind: "E", id: null, name: "Chugim", gone: false };
const ITEMS = [FLAGPOLE, SWIM, BOATING, SOCCER, ELECTIVE];

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

const never = () => false;

describe("Clear day and Clear week", () => {
  it("clears the day's activities for every bunk, leaving fixed ones and things not set up", () => {
    const days = week(["1,2,4", "1,4,5"], ["1,2,", "1,,"]);
    const runs = clearEdit(days, [0]);
    expect(after(days, runs)[0]).toEqual([
      ["F:f1", "", ""],
      ["F:f1", "", "E:Chugim"]
    ]);
    // Tuesday is untouched.
    expect(runs.every((run) => run.day === 0)).toBe(true);
  });

  it("clears one bunk's day only", () => {
    const days = week(["1,2,4", "1,4,"], ["1,,", "1,,"]);
    const rows = after(days, clearEdit(days, [0], "g2"));
    expect(rows[0]).toEqual([
      ["F:f1", "A:a1", "A:a3"],
      ["F:f1", "", ""]
    ]);
  });

  it("clears a placement running several blocks whole, in one run", () => {
    const days = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    const runs = clearEdit(days, [0]);
    expect(runs).toEqual([
      {
        day: 0,
        group: 0,
        first: 1,
        before: ["A:a2", "^A:a2"],
        after: ["", ""]
      }
    ]);
  });

  it("Clear week covers every day; nothing to clear gives null", () => {
    const days = week(["1,2,", "1,,"], ["1,,4", "1,,"]);
    const rows = after(days, clearEdit(days, [0, 1]));
    expect(rows[0][0]).toEqual(["F:f1", "", ""]);
    expect(rows[1][0]).toEqual(["F:f1", "", ""]);
    expect(clearEdit(week(["1,,", "1,,"], ["1,,", "1,,"]), [0, 1])).toBeNull();
  });
});

describe("Copy day to…", () => {
  it("each bunk's activities replace its activities on the target day, at the same blocks", () => {
    const days = week(["1,2,", "1,4,"], ["1,4,2", "1,,"]);
    const { runs, leftOut } = copyDayEdit(days, 0, [1], never);
    expect(after(days, runs)[1]).toEqual([
      ["F:f1", "A:a1", ""],
      ["F:f1", "A:a3", ""]
    ]);
    expect(leftOut).toEqual([]);
    // Monday, the source, is untouched.
    expect(runs.every((run) => run.day === 1)).toBe(true);
  });

  it("a placement running several blocks is copied whole", () => {
    const days = week(["1,3,^", "1,,"], ["1,,", "1,,"]);
    const rows = after(days, copyDayEdit(days, 0, [1], never).runs);
    expect(rows[1][0]).toEqual(["F:f1", "A:a2", "^A:a2"]);
  });

  it("leaves out, whole, what would land on a fixed activity or where the bunk isn't at camp", () => {
    // Tuesday: Flagpole runs into Period 2 for Bunk 1; Bunk 2 isn't at camp at Lunch.
    const days = week(["1,2,", "1,,4"], ["1,^,", "1,,"]);
    const isAway = (d, g, b) => g === 1 && b === 2;
    const { runs, leftOut } = copyDayEdit(days, 0, [1], isAway);
    expect(leftOut).toEqual([
      { day: 1, group: 0, block: 1, slot: "A:a1", why: LEFT_OUT.TAKEN },
      { day: 1, group: 1, block: 2, slot: "A:a3", why: LEFT_OUT.AWAY }
    ]);
    expect(after(days, runs)[1]).toEqual([
      ["F:f1", "^F:f1", ""],
      ["F:f1", "", ""]
    ]);
  });

  it("leaves out a bunk that isn't on the target day, and a block it doesn't have", () => {
    const days = week(["1,2,4", "1,4,"], ["1,,", "1,,"]);
    days[1] = {
      ...days[1],
      groups: [days[1].groups[0]],
      rows: ["1,"],
      blocks: days[1].blocks.slice(0, 2)
    };
    const { leftOut } = copyDayEdit(days, 0, [1], never);
    expect(leftOut).toEqual([
      { day: 1, group: 0, block: 2, slot: "A:a3", why: LEFT_OUT.NO_BLOCK },
      { day: 1, group: 1, block: 1, slot: "A:a3", why: LEFT_OUT.NO_GROUP }
    ]);
  });

  it("copies to several days at once, skipping the source day and a day that can't be read", () => {
    const days = [
      ...week(["1,2,", "1,,"], ["1,,", "1,,"]),
      { ...day("2026-07-01", ITEMS, ["1,,", "1,,"]), problem: "unreadable" }
    ];
    const { runs } = copyDayEdit(days, 0, [0, 1, 2], never);
    expect(runs.map((run) => run.day)).toEqual([1]);
  });
});
