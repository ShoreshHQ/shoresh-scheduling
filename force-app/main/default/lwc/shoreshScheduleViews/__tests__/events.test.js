// A special event placed on the grid (ADR 0014 slice 4; decision 47.3): its record, its quiet
// flag, and one cell across bunks side by side; one noted from a file stays "not set up yet".
import {
  dailyGrid,
  isEventItem,
  isSetUpItem,
  itemKey
} from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";

const t = buildTerms([]);
const PLACED = { kind: "S", id: "a0E000000000001AAA", name: "Carnival" };
const NOTED = { kind: "S", id: "", name: "Color War" };

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

describe("c/shoreshScheduleViews: special events", () => {
  it("tells a placed event from one noted from a file", () => {
    expect(isSetUpItem(PLACED)).toBe(true);
    expect(isEventItem(PLACED)).toBe(true);
    expect(isSetUpItem(NOTED)).toBe(false);
    expect(isEventItem(NOTED)).toBe(false);
    expect(isSetUpItem({ kind: "A", id: "a1", name: "Swim" })).toBe(true);
    expect(itemKey(PLACED)).toBe("S:a0E000000000001AAA");
    expect(itemKey(NOTED)).toBe("S:Color War");
  });

  it("draws a placed event with its flag and a merge key per block run", () => {
    const grid = dailyGrid(view([PLACED, NOTED], ["1,^", "1,^"]), 0, t);
    const events = grid.cells.filter((c) => c.event);
    expect(events.map((c) => [c.key, c.text, c.className])).toEqual([
      ["0-0", "Carnival", "cell cell_event"],
      ["1-0", "Carnival", "cell cell_event"]
    ]);
    expect(events[0].mergeKey).toBe(events[1].mergeKey);
    expect(events[0].title).toBe("Carnival: Special event");
  });

  it("keeps an event noted from a file as not set up yet", () => {
    const grid = dailyGrid(view([NOTED], ["1,", ","]), 0, t);
    const noted = grid.cells.find((c) => c.text === "Color War");
    expect(noted.notSetUp).toBe(true);
    expect(noted.mergeKey).toBeUndefined();
  });
});
