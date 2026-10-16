import {
  activityCards,
  activityGrid,
  clock,
  dailyGrid,
  dayLabel,
  days,
  groupCells,
  groupGrid,
  groups,
  kindLabel
} from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";
import { LABELS, opened } from "./data/scheduleFixture";

const t = buildTerms(LABELS);

describe("c/shoreshScheduleViews", () => {
  it("names days and times the way a camp reads them", () => {
    expect(dayLabel("2026-06-29")).toEqual({ label: "Monday", sub: "Jun 29" });
    expect(clock("09:00")).toBe("9:00 AM");
    expect(clock("12:30")).toBe("12:30 PM");
    expect(clock("00:15")).toBe("12:15 AM");
  });

  it("reads a group's row: what starts where, and how long it runs", () => {
    const cells = groupCells(opened().days[0], 0);
    expect(cells.map((c) => [c.blockIndex, c.length, c.item.name])).toEqual([
      [0, 2, "Swim"],
      [2, 1, "Lunch"]
    ]);
    const tuesday = groupCells(opened().days[1], 0);
    expect(tuesday[0].item).toBeNull();
  });

  it("Daily View: a column per group, a two-block activity spanning two rows", () => {
    const grid = dailyGrid(opened(), 0, t);
    expect(grid.columns.map((c) => c.label)).toEqual(["Bunk 1", "Bunk 2"]);
    expect(grid.rows.map((r) => r.name)).toEqual([
      "Period 1",
      "Period 2",
      "Lunch"
    ]);
    expect(grid.rows[0].timeLines.map((l) => l.text)).toEqual([
      "9:00 AM –",
      "9:45 AM"
    ]);
    const swim = grid.cells.find((c) => c.key === "0-0");
    expect(swim.text).toBe("Swim");
    expect(swim.style).toContain("grid-row: 1 / span 2");
    expect(swim.className).toContain("cell_activity");
    const lunch = grid.cells.find((c) => c.key === "0-2");
    expect(lunch.className).toContain("cell_set-time");
    expect(lunch.title).toBe("Lunch: Fixed activity");
  });

  it("marks what is not set up yet and what has been deleted since", () => {
    const grid = dailyGrid(opened(), 0, t);
    const chugim = grid.cells.find((c) => c.key === "1-0");
    expect(chugim.className).toContain("cell_not-set-up");
    expect(chugim.note).toBe("not set up yet");
    expect(chugim.title).toBe("Chugim: Chug, not set up in Shoresh yet");
    const pottery = grid.cells.find((c) => c.key === "1-1");
    expect(pottery.note).toBe("deleted since");
  });

  it("calls a trip by the camp's own word", () => {
    const camp = buildTerms([
      ...LABELS,
      { term: "Trip", singular: "Tiyul", plural: "Tiyulim", isCustom: true }
    ]);
    expect(kindLabel("T", camp)).toBe("Tiyul");
    expect(kindLabel("T", t)).toBe("Trip");
    const view = opened();
    view.days[0].items = [
      ...view.days[0].items.slice(0, 2),
      { kind: "T", id: "", name: "Zoo trip", gone: false },
      view.days[0].items[3]
    ];
    const zoo = dailyGrid(view, 0, camp).cells.find((c) => c.key === "1-0");
    expect(zoo.title).toBe("Zoo trip: Tiyul, not set up in Shoresh yet");
    expect(zoo.note).toBe("not set up yet");
  });

  it("shows nothing placed as Open", () => {
    const grid = dailyGrid(opened(), 1, t);
    expect(grid.cells.find((c) => c.key === "0-0").text).toBe("Open");
  });

  it("gives no grid for a day that could not be read", () => {
    expect(dailyGrid(opened(), 2, t)).toBeNull();
    expect(days(opened())[2].problem).toBe("it is not in the grid format");
  });

  it("Group View: one group's week, a column per day, an unreadable day said so", () => {
    expect(groups(opened()).map((g) => g.name)).toEqual(["Bunk 1", "Bunk 2"]);
    const grid = groupGrid(opened(), "g1", t);
    expect(grid.columns.map((c) => c.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday"
    ]);
    expect(grid.cells.find((c) => c.key === "0-0").text).toBe("Swim");
    expect(grid.cells.find((c) => c.key === "1-0").text).toBe("Open");
    expect(grid.cells.find((c) => c.key === "1-1").text).toBe("Swim");
    const problem = grid.cells.find((c) => c.key === "2-problem");
    expect(problem.text).toBe("Could not be read");
    expect(problem.style).toContain("grid-row: 1 / span 3");
  });

  it("a week where no day could be read still says so in Group View", () => {
    const view = opened();
    view.days = [view.days[2]];
    const grid = groupGrid(view, "g1", t);
    expect(grid.rows).toHaveLength(1);
    expect(grid.cells.map((c) => [c.row, c.text])).toEqual([
      [0, "Could not be read"]
    ]);
  });

  it("Activity View: the catalogue's cards with how often each runs, and one opened", () => {
    const cards = activityCards(
      opened(),
      [
        { Id: "a1", Name: "Swim" },
        { Id: "a2", Name: "Archery" }
      ],
      t
    );
    expect(cards.map((c) => [c.name, c.summary])).toEqual([
      ["Swim", "2 Bunks · 3 times this week"],
      ["Archery", "0 Bunks · 0 times this week"],
      ["Pottery", "1 Bunk · 1 time this week"]
    ]);
    expect(cards[2].gone).toBe(true);

    const grid = activityGrid(opened(), "a1");
    // Monday: Bunk 1 in Period 1 and Period 2 (one two-block Swim).
    expect(
      grid.cells.find((c) => c.key === "0-0").names.map((n) => n.name)
    ).toEqual(["Bunk 1"]);
    expect(
      grid.cells.find((c) => c.key === "0-1").names.map((n) => n.name)
    ).toEqual(["Bunk 1"]);
    expect(grid.cells.find((c) => c.key === "0-2").title).toBe("Not scheduled");
    // Tuesday: Bunk 2 in Period 1, Bunk 1 in Period 2.
    expect(
      grid.cells.find((c) => c.key === "1-0").names.map((n) => n.name)
    ).toEqual(["Bunk 2"]);
  });
});
