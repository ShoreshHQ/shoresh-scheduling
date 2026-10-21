import { checkWeek, measureWeek, readActivities } from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { drawerTiles } from "../counts";
import { ACTIVITIES, WITH_SOCCER, schedule } from "./data/draftFixture";

// The fixture's activities as setup records, for the engine's checkWeek (what is placed comes
// from there): Swim 1 to 2 a week, Boating any number, Soccer 2 to 3.
const RECORDS = nsRecord([
  {
    Id: "a1",
    Name: "Swim",
    TimesPerWeekMin__c: 1,
    TimesPerWeekMax__c: 2,
    NoGroupLimit__c: true
  },
  { Id: "a2", Name: "Boating", NoWeeklyMax__c: true, NoGroupLimit__c: true },
  {
    Id: "a3",
    Name: "Soccer",
    TimesPerWeekMin__c: 2,
    TimesPerWeekMax__c: 3,
    NoGroupLimit__c: true
  }
]);

/**
 * The drawer for a week, measured as the screen measures it: the camp (groupId null, Daily View)
 * or one bunk (Group View: the days with only that bunk).
 */
function tiles(week, groupId, filter = "") {
  const checked = checkWeek(
    week.days,
    {
      activities: readActivities(RECORDS),
      notFor: new Map(ACTIVITIES.map((a) => [a.id, a.notFor]))
    },
    { t: buildTerms([]), dayName: () => "" }
  );
  const days = groupId
    ? week.days.map((d) => ({
        ...d,
        groups: d.groups.filter((g) => g.id === groupId)
      }))
    : week.days;
  const measure = measureWeek(checked, ACTIVITIES, days);
  return { measure, tiles: drawerTiles(measure, ACTIVITIES, filter) };
}

const byName = (list, name) => list.find((t) => t.name === name);

describe("the drawer's tiles", () => {
  it("Daily View: under first, then the rest, by name; the numbers are the counter's", () => {
    // Soccer for Bunk 1 on Monday; Swim is set up for Bunk 1 only.
    const week = schedule(WITH_SOCCER, ["1,2,", "1,,"]);
    const { measure, tiles: list } = tiles(week, null);
    expect(list.map((t) => [t.name, t.under, t.words])).toEqual([
      ["Soccer", true, "1 of 4"],
      ["Swim", true, "0 of 1"],
      ["Boating", false, "0 placed"]
    ]);
    // "N under" in the drawer is the counter's number.
    expect(measure.under.count).toBe(4);
    expect(byName(list, "Soccer").said).toBe("Soccer, 1 of 4");
  });

  it("an activity over its weekly limit in a bunk carries the corner, in the counter's words", () => {
    // Bunk 1 has Soccer four times (its limit is 3).
    const week = schedule(WITH_SOCCER, ["1,2,2", "1,,"]);
    week.days[1] = {
      ...week.days[1],
      items: WITH_SOCCER,
      rows: ["1,2,2", "1,,"]
    };
    const soccer = byName(tiles(week, null).tiles, "Soccer");
    expect(soccer.over).toBe(true);
    // The counter's over row: what the bunks past the limit have, of what they may have.
    expect(soccer.words).toBe("4 of 3");
    expect(soccer.said).toBe("Soccer, 4 of 3, Over its weekly limit");
    // Still under its goal: Bunk 2 has none of its two.
    expect(soccer.under).toBe(true);
  });

  it("Group View measures the one bunk", () => {
    const week = schedule(WITH_SOCCER, ["1,2,2", "1,,"]);
    week.days[1] = {
      ...week.days[1],
      items: WITH_SOCCER,
      rows: ["1,2,2", "1,,"]
    };
    expect(byName(tiles(week, "g1").tiles, "Soccer").over).toBe(true);
    const bunk2 = tiles(week, "g2");
    expect(byName(bunk2.tiles, "Soccer")).toMatchObject({
      over: false,
      under: true,
      words: "0 of 2"
    });
    // Swim isn't set up for Bunk 2: no goal there, so nothing under.
    expect(byName(bunk2.tiles, "Swim").under).toBe(false);
  });

  it("exactly at the weekly maximum is not over it", () => {
    const items = [
      { kind: "F", id: "f1", name: "Flagpole", gone: false },
      { kind: "A", id: "a1", name: "Swim", gone: false }
    ];
    const week = schedule(items, ["1,2,", "1,,"]);
    week.days[1] = { ...week.days[1], items, rows: ["1,2,", "1,,"] };
    const swim = byName(tiles(week, "g1").tiles, "Swim");
    expect(swim.over).toBe(false);
    // Past its goal of 1, within its limit of 2: not "2 of 1", which would read as over.
    expect(swim.words).toBe("2 placed");
  });

  it("the Filter box narrows the drawer, spaces and capitals aside", () => {
    const week = schedule();
    expect(tiles(week, null, " BOA ").tiles.map((t) => t.name)).toEqual([
      "Boating"
    ]);
  });

  it("with no measure yet, every activity by name with no numbers", () => {
    expect(
      drawerTiles(null, ACTIVITIES, "").map((t) => [t.name, t.words, t.said])
    ).toEqual([
      ["Boating", "", "Boating"],
      ["Soccer", "", "Soccer"],
      ["Swim", "", "Swim"]
    ]);
  });
});
