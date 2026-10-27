/**
 * Special days and events in the engine (ADR 0014 slice 4; desktop ADRs
 * 2026-08-22-events-overlay-placement §6 and 2026-10-09-special-day-binds-to-a-week-day D4): a
 * placed special event is kept like a lock (never filled over, moved or counted), and a day a
 * special day replaces is never built, checked or counted, and comes back exactly as sent.
 */
import { checkGeneratedWeek, generateWeek } from "c/shoreshEngine";
import { activity, block, camp, cellsOf, dateAt, group } from "./data/camp";

const EVENT = "a0E000000000001AAA";

const spec = {
  groups: [group("g1"), group("g2")],
  days: 3,
  blocks: [block(1), block(2), block(3)],
  activities: [
    // Two bunks at once, so both can swim in day 1's one free block (once a day is a limit).
    activity("swim", { min: 2, max: 3, atOnce: 2 }),
    activity("arts", { min: 1, max: 3 })
  ],
  // Carnival over both bunks, Period 2 and 3 of the first day.
  cells: [
    { day: 0, group: "g1", block: "b2", act: EVENT, kind: "S", length: 2 },
    { day: 0, group: "g2", block: "b2", act: EVENT, kind: "S", length: 2 }
  ]
};

function withEventName(input) {
  input.days.forEach((day) =>
    day.items.forEach((item) => {
      if (item.kind === "S") {
        item.name = "Carnival";
      }
    })
  );
  return input;
}

describe("c-shoresh-engine: special days and events", () => {
  it("keeps a placed event where it is, and builds around it", () => {
    const result = generateWeek(withEventName(camp(spec)));
    expect(result.ok).toBe(true);
    const day = cellsOf(result.days)[0];
    ["g1", "g2"].forEach((g) => {
      expect(day[g][1]).toEqual({ kind: "S", id: EVENT, head: true });
      expect(day[g][2]).toEqual({ kind: "S", id: EVENT, head: false });
      expect(day[g][0].kind).toBe("A");
    });
  });

  it("leaves a placed event out of the cells to fill", () => {
    const input = withEventName(camp(spec));
    const week = checkGeneratedWeek(input);
    // 2 bunks × 3 days × 3 blocks = 18 cells, less the event's 4.
    expect(week.checked.cells.total).toBe(14);
    expect(week.checked.cells.filled).toBe(0);
  });

  it("never builds on a day a special day replaces, and sends it back as it was", () => {
    const input = withEventName(camp(spec));
    const replaced = input.days[1];
    const result = generateWeek({ ...input, replacedDates: [dateAt(1)] });
    expect(result.ok).toBe(true);
    expect(result.days.map((d) => d.dateValue)).toEqual([
      dateAt(0),
      dateAt(1),
      dateAt(2)
    ]);
    expect(result.days[1]).toBe(replaced);
    expect(result.days[1].rows).toEqual(["", ""].map(() => ",,"));
    // Swim's two a week are met on the days that run (day 1 and 3), not counted on day 2.
    const cells = cellsOf(result.days);
    ["g1", "g2"].forEach((g) => {
      const swims = [0, 2]
        .flatMap((d) => cells[d][g])
        .filter((c) => c && c.head && c.id === "swim").length;
      expect(swims).toBeGreaterThanOrEqual(2);
    });
  });

  // SPECIAL-6.2
  it("leaves a replaced day out of the check, but shows it", () => {
    const input = withEventName(camp(spec));
    const week = checkGeneratedWeek({ ...input, replacedDates: [dateAt(1)] });
    expect(week.days.map((d) => d.dateValue)).toEqual([
      dateAt(0),
      dateAt(1),
      dateAt(2)
    ]);
    expect(week.checkedDays.map((d) => d.dateValue)).toEqual([
      dateAt(0),
      dateAt(2)
    ]);
    expect(week.checked.cells.total).toBe(8);
  });

  it("says so when every day is a special day", () => {
    const input = withEventName(camp({ ...spec, days: 1, cells: [] }));
    const result = generateWeek({ ...input, replacedDates: [dateAt(0)] });
    expect(result).toEqual({
      ok: false,
      error:
        "Every day this week is a special day, so there is nothing to generate."
    });
  });
});
