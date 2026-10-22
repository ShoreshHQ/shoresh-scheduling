// Special days and events in the Excel file and the printout (ADR 0014 slice 5; desktop ADR
// 2026-10-09-special-day-binds-to-a-week-day D7): a replaced day is its own schedule with its name
// and notes; each event with a schedule of its own gets a sheet and a page (made-up data).
import { printPages, scheduleSheets } from "c/shoreshScheduleExport";
import { withSpecials } from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";

const t = buildTerms([]);
const SWIM = { kind: "A", id: "act1", name: "Swim" };
const ARCHERY = { kind: "A", id: "act2", name: "Archery" };
const CARNIVAL = { kind: "S", id: "evt1", name: "Carnival" };
const BLOCKS = [
  { id: "t1", name: "Period 1", startTime: "09:00", endTime: "09:45" }
];
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" }
];
const P1 = "Period 1 (9:00 AM – 9:45 AM)";

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

const CARNIVAL_PLAN = {
  dateValue: null,
  problem: null,
  blocks: [{ id: "b1", name: "Relays", startTime: "09:00", endTime: "10:00" }],
  groups: [
    { id: "s1", name: "Blue" },
    { id: "s2", name: "Gold" }
  ],
  items: [{ kind: "A", id: "act3", name: "Tug of war" }],
  rows: ["1", ""]
};

function shown(plan) {
  return withSpecials({
    schedule: { id: "s1", name: "Version 1" },
    days: [
      day("2026-06-29", [SWIM, CARNIVAL], ["1", "2"]),
      day("2026-06-30", [SWIM], ["1", "1"])
    ],
    specials: {
      asPublished: true,
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
      events: [{ eventId: "evt1", name: "Carnival", plan: CARNIVAL_PLAN }]
    }
  });
}

const FIELD_DAY_PLAN = {
  dateValue: "2026-06-30",
  problem: null,
  blocks: [{ id: "b1", name: "Relays", startTime: "09:00", endTime: "10:30" }],
  groups: GROUPS,
  items: [ARCHERY],
  rows: ["1", "1"]
};

describe("c-shoresh-schedule-export: special days and events", () => {
  it("writes a replaced day as its special day's own schedule, its name and notes under it", () => {
    const sheets = scheduleSheets(shown(FIELD_DAY_PLAN), [], t);
    expect(sheets.map((s) => s.name)).toEqual([
      "Monday",
      "Tuesday",
      "Carnival",
      "All Groups",
      "All Activities"
    ]);
    expect(sheets[1].rows).toEqual([
      ["Time block", "Bunk 1", "Bunk 2"],
      ["Relays (9:00 AM – 10:30 AM)", "Archery", "Archery"],
      [],
      ["Field Day (Special day)"],
      ["Wear blue"]
    ]);
  });

  it("writes each event's own schedule on a sheet of its own: time blocks down, stations across", () => {
    const sheets = scheduleSheets(shown(FIELD_DAY_PLAN), [], t);
    expect(sheets[2].rows).toEqual([
      ["Time block", "Blue", "Gold"],
      ["Relays (9:00 AM – 10:00 AM)", "Tug of war", ""]
    ]);
    expect(sheets[2].widths).toEqual([22, 16, 16]);
  });

  it("lists a replaced day's cells with the bunks' week, and leaves it out of the activities'", () => {
    const sheets = scheduleSheets(
      shown(FIELD_DAY_PLAN),
      [
        { Id: "act1", Name: "Swim" },
        { Id: "act2", Name: "Archery" }
      ],
      t
    );
    const allGroups = sheets.find((s) => s.name === "All Groups").rows;
    expect(allGroups).toContainEqual([
      "Bunk 1",
      "Tuesday",
      "Relays (9:00 AM – 10:30 AM)",
      "Archery"
    ]);
    const allActivities = sheets.find((s) => s.name === "All Activities").rows;
    expect(allActivities.map((row) => row[1])).not.toContain("Tuesday");
    expect(allActivities).toContainEqual(["Swim", "Monday", P1, "Bunk 1"]);
  });

  it("prints a replaced day under its name with its notes, then each event's page", () => {
    const pages = printPages(shown(FIELD_DAY_PLAN), "day", [], t);
    expect(pages.map((p) => p.title)).toEqual([
      "Monday, Jun 29",
      "Tuesday, Jun 30 · Field Day",
      "Carnival (Special event)"
    ]);
    expect(pages[1].notes).toBe("Wear blue");
    expect(pages[1].table.rows.map((r) => r.cells.map((c) => c.text))).toEqual([
      ["Archery", "Archery"]
    ]);
    expect(pages[2].table.columns.map((c) => c.label)).toEqual([
      "Blue",
      "Gold"
    ]);
    expect(pages[0].notes).toBeNull();
  });

  it("prints a special day with no schedule yet as saying so, with its notes", () => {
    const pages = printPages(shown(null), "day", [], t);
    expect(pages[1].table).toBeNull();
    expect(pages[1].empty).toBe("Field Day has no schedule yet.");
    expect(pages[1].notes).toBe("Wear blue");
  });

  it("prints a group's week with the special day's own cells in its column", () => {
    const pages = printPages(shown(FIELD_DAY_PLAN), "group", [], t);
    expect(pages.map((p) => p.title)).toEqual(["Bunk 1", "Bunk 2"]);
    expect(pages[0].table.columns.map((c) => c.label)).toEqual([
      "Monday",
      "Tuesday · Field Day"
    ]);
  });
});
