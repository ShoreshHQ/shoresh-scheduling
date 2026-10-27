// Special days and events on the Schedules page (ADR 0014 slice 5): a day a special day replaces
// is its own schedule with its own time blocks, in Daily and Group View; Activity View counts
// nothing there; the events placed on a day are found to open their own schedules.
import {
  activityCards,
  activityGrid,
  dailyGrid,
  days,
  eventPlans,
  eventsOn,
  groupGrid,
  groups,
  withSpecials
} from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";

const t = buildTerms([]);
const SWIM = { kind: "A", id: "act1", name: "Swim" };
const ARCHERY = { kind: "A", id: "act2", name: "Archery" };
const CARNIVAL = { kind: "S", id: "evt1", name: "Carnival" };
const BLOCKS = [
  { id: "t1", name: "Period 1", startTime: "09:00", endTime: "09:45" },
  { id: "t2", name: "Period 2", startTime: "10:00", endTime: "10:45" }
];
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" }
];

function day(dateValue, items, rows) {
  return {
    dateValue,
    problem: null,
    blocks: BLOCKS,
    groups: GROUPS,
    items,
    rows
  };
}

// Field Day's own schedule: Period 1 at the week's times, then a long Relays block of its own.
const FIELD_DAY_PLAN = {
  dateValue: "2026-06-30",
  problem: null,
  blocks: [
    { id: "b1", name: "Period 1", startTime: "09:00", endTime: "09:45" },
    { id: "b2", name: "Relays", startTime: "09:50", endTime: "11:20" }
  ],
  groups: GROUPS,
  items: [ARCHERY],
  rows: ["1,", ",1"]
};

function opened({ plan = FIELD_DAY_PLAN, events = [] } = {}) {
  return {
    schedule: { id: "s1", name: "Version 1" },
    days: [
      day("2026-06-29", [SWIM, CARNIVAL], ["1,2", "1,2"]),
      // The week's own Tuesday, out of sight under Field Day.
      day("2026-06-30", [SWIM], ["1,1", "1,1"])
    ],
    specials: {
      asPublished: false,
      days: [
        {
          dateValue: "2026-06-30",
          day: "Tuesday",
          specialDayId: "sd1",
          name: "Field Day",
          notes: "Wear blue",
          plan
        }
      ],
      events
    }
  };
}

describe("c/shoreshScheduleViews: special days on the Schedules page", () => {
  // SPECIAL-1.1
  it("puts a special day's own schedule in its day's place, marked with its name and notes", () => {
    const view = opened();
    const shown = withSpecials(view);
    expect(shown.days[0]).toBe(view.days[0]);
    const tuesday = shown.days[1];
    expect(tuesday.dateValue).toBe("2026-06-30");
    expect(tuesday.special).toEqual({
      id: "sd1",
      name: "Field Day",
      notes: "Wear blue"
    });
    expect(tuesday.blocks.map((b) => b.name)).toEqual(["Period 1", "Relays"]);
    expect(days(shown).map((d) => d.special)).toEqual([null, "Field Day"]);
  });

  it("leaves a view with nothing replaced as it is", () => {
    const view = { days: [day("2026-06-29", [SWIM], ["1,", ""])] };
    expect(withSpecials(view)).toBe(view);
    expect(withSpecials({ ...view, specials: { days: [] } }).days).toBe(
      view.days
    );
  });

  it("draws a replaced day in Daily View on its own time blocks", () => {
    const grid = dailyGrid(withSpecials(opened()), 1, t);
    expect(grid.rows.map((r) => r.name)).toEqual(["Period 1", "Relays"]);
    expect(
      grid.cells.filter((c) => !c.open).map((c) => [c.key, c.text])
    ).toEqual([
      ["0-0", "Archery"],
      ["1-1", "Archery"]
    ]);
  });

  it("lays a replaced day on its own time blocks in Group View, sharing a row only at the same times", () => {
    const grid = groupGrid(withSpecials(opened()), "g2", t);
    // Period 1 (the week's and Field Day's: the same times), Relays (Field Day's own), Period 2.
    expect(grid.rows.map((r) => r.name)).toEqual([
      "Period 1",
      "Relays",
      "Period 2"
    ]);
    expect(new Set(grid.rows.map((r) => r.key)).size).toBe(3);
    expect(grid.columns.map((c) => c.label)).toEqual([
      "Monday",
      "Tuesday · Field Day"
    ]);
    const tuesday = grid.cells.filter((c) => c.column === 1);
    expect(tuesday.map((c) => [c.row, c.length, c.text])).toEqual([
      [0, 1, "Open"],
      [1, 1, "Archery"]
    ]);
    // Monday's Period 2 runs in the week's own row.
    const monday = grid.cells.filter((c) => c.column === 0);
    expect(monday.map((c) => [c.row, c.text])).toEqual([
      [0, "Swim"],
      [2, "Carnival"]
    ]);
  });

  it("shows a special day with no schedule yet as one cell named for it in Group View", () => {
    const grid = groupGrid(withSpecials(opened({ plan: null })), "g1", t);
    const tuesday = grid.cells.filter((c) => c.column === 1);
    expect(tuesday).toHaveLength(1);
    expect(tuesday[0].text).toBe("Field Day");
    expect(tuesday[0].length).toBe(grid.rows.length);
    expect(tuesday[0].title).toBe("Field Day: Special day");
  });

  // SPECIAL-6.2
  it("counts nothing on a replaced day in Activity View, and names it in the activity's grid", () => {
    const shown = withSpecials(opened());
    const archery = activityCards(shown, [], t).find((c) => c.key === "act2");
    // Archery is only in Field Day's schedule: not counted.
    expect(archery).toBeUndefined();
    const swim = activityCards(shown, [], t).find((c) => c.key === "act1");
    expect(swim.summary).toBe("2 groups · 2 times this week");
    const grid = activityGrid(shown, "act1", t);
    const tuesday = grid.cells.filter((c) => c.column === 1);
    expect(tuesday.map((c) => c.text)).toEqual(["Field Day"]);
    expect(grid.columns[1].label).toBe("Tuesday · Field Day");
  });

  it("keeps the group pills to the week's groups", () => {
    expect(groups(withSpecials(opened())).map((g) => g.name)).toEqual([
      "Bunk 1",
      "Bunk 2"
    ]);
  });

  it("finds the events placed on a day, and those with a schedule of their own to open", () => {
    const plan = {
      dateValue: null,
      problem: null,
      blocks: [
        { id: "b1", name: "Relays", startTime: "09:00", endTime: "10:00" }
      ],
      groups: [{ id: "s1", name: "Blue" }],
      items: [],
      rows: [""]
    };
    const shown = withSpecials(
      opened({
        events: [
          { eventId: "evt1", name: "Carnival", plan },
          { eventId: "evt2", name: "Empty", plan: { ...plan, blocks: [] } },
          {
            eventId: "evt3",
            name: "Broken",
            plan: { ...plan, problem: "it was saved by a newer version" }
          }
        ]
      })
    );
    expect(eventsOn(shown.days[0]).map((e) => e.id)).toEqual(["evt1"]);
    // Not on a replaced day: its own cells are out of sight.
    expect(eventsOn(shown.days[1])).toEqual([]);
    expect(eventPlans(shown).map((e) => e.eventId)).toEqual(["evt1"]);
  });
});
