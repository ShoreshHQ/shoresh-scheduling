// An elective set placed on the grid (repo ADR 0018 slice E5; decision 53.2): its record, and one
// cell across bunks side by side for each time block; one noted from a file stays "not set up
// yet". Synthetic data only.
import {
  dailyGrid,
  isElectiveItem,
  isSetUpItem,
  itemKey
} from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";

const t = buildTerms([]);
const PLACED = { kind: "E", id: "a0X000000000001AAA", name: "Chugim" };
const NOTED = { kind: "E", id: "", name: "Bechirot" };

function view(items, rows) {
  return {
    days: [
      {
        dateValue: "2026-06-29",
        problem: null,
        blocks: [
          { id: "t1", name: "Period 1", startTime: "09:00", endTime: "09:45" },
          { id: "t2", name: "Period 2", startTime: "10:00", endTime: "10:45" }
        ],
        groups: [
          { id: "g1", name: "Bunk 1" },
          { id: "g2", name: "Bunk 2" }
        ],
        items,
        rows
      }
    ]
  };
}

describe("c/shoreshScheduleViews: elective sets", () => {
  it("tells a placed set from one noted from a file", () => {
    expect(isSetUpItem(PLACED)).toBe(true);
    expect(isElectiveItem(PLACED)).toBe(true);
    expect(isSetUpItem(NOTED)).toBe(false);
    expect(isElectiveItem(NOTED)).toBe(false);
    expect(itemKey(PLACED)).toBe("E:a0X000000000001AAA");
    expect(itemKey(NOTED)).toBe("E:Bechirot");
  });

  it("draws a placed set with its mark, one merge key per time block", () => {
    const grid = dailyGrid(view([PLACED], ["1,1", "1,1"]), 0, t);
    const sets = grid.cells.filter((c) => c.elective);
    expect(sets.map((c) => [c.key, c.text, c.className])).toEqual([
      ["0-0", "Chugim", "cell cell_event"],
      ["0-1", "Chugim", "cell cell_event"],
      ["1-0", "Chugim", "cell cell_event"],
      ["1-1", "Chugim", "cell cell_event"]
    ]);
    const byKey = new Map(sets.map((c) => [c.key, c.mergeKey]));
    expect(byKey.get("0-0")).toBe(byKey.get("1-0"));
    expect(byKey.get("0-1")).toBe(byKey.get("1-1"));
    expect(byKey.get("0-0")).not.toBe(byKey.get("0-1"));
    expect(sets[0].title).toBe("Chugim: Elective set");
  });

  it("keeps a set noted from a file as not set up yet", () => {
    const grid = dailyGrid(view([NOTED], ["1,", ","]), 0, t);
    const noted = grid.cells.find((c) => c.text === "Bechirot");
    expect(noted.notSetUp).toBe(true);
    expect(noted.mergeKey).toBeUndefined();
  });
});
