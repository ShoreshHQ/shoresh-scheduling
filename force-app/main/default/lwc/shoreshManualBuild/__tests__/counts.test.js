import { checkWeek, readActivities } from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { countLabel, paletteChips } from "../counts";
import { ACTIVITIES, WITH_SOCCER, schedule } from "./data/draftFixture";

// The fixture's activities as setup records, for the engine's checkWeek (what is placed, over its
// weekly limit and still needed comes from there): Swim 1 to 2 a week, Boating any number,
// Soccer 2 to 3.
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

/** The activity list for a week, with the week checked as the screen checks it. */
function chips(week, groupId, filter = "") {
  const checked = checkWeek(
    week.days,
    {
      activities: readActivities(RECORDS),
      notFor: new Map(ACTIVITIES.map((a) => [a.id, a.notFor]))
    },
    { t: buildTerms([]), dayName: () => "" }
  );
  return paletteChips(week, checked, ACTIVITIES, groupId, filter);
}

describe("activity list counts", () => {
  it("says the counts in the desktop's words", () => {
    expect(countLabel(2, 3, 5)).toBe("2 placed (needs 3–5)");
    expect(countLabel(14, 6, null)).toBe("14 placed (needs 6+)");
    expect(countLabel(4, 0, 5)).toBe("4 placed (up to 5)");
    expect(countLabel(1, 2, 2)).toBe("1 placed (needs 2)");
    expect(countLabel(0, 0, null)).toBe("0 placed");
  });

  it("Daily View counts the camp, against the groups each is set up for", () => {
    // Soccer for Bunk 1 on Monday; Swim is set up for Bunk 1 only.
    const week = schedule(WITH_SOCCER, ["1,2,", "1,,"]);
    const { stillNeeded, placed } = chips(week, null);
    expect(stillNeeded.map((c) => [c.name, c.label])).toEqual([
      ["Soccer", "1 placed (needs 4–6)"],
      ["Swim", "0 placed (needs 1–2)"]
    ]);
    expect(placed.map((c) => [c.name, c.label])).toEqual([
      ["Boating", "0 placed"]
    ]);
  });

  it("Group View counts one bunk; a multi-block placement counts once; over the limit is marked", () => {
    const items = [
      { kind: "F", id: "f1", name: "Flagpole", gone: false },
      { kind: "A", id: "a1", name: "Swim", gone: false },
      { kind: "A", id: "a2", name: "Boating", gone: false }
    ];
    const week = schedule(items, ["1,2,2", "1,3,^"]);
    week.days[1] = { ...week.days[1], items, rows: ["1,2,", "1,,"] };
    const bunk1 = chips(week, "g1");
    const swim = bunk1.placed.find((c) => c.name === "Swim");
    expect(swim.label).toBe("3 placed (needs 1–2)");
    expect(swim.over).toBe(true);
    const bunk2 = chips(week, "g2");
    expect(bunk2.placed.find((c) => c.name === "Boating").label).toBe(
      "1 placed"
    );
  });

  it("the Filter box narrows the list, spaces and capitals aside", () => {
    const week = schedule();
    const { stillNeeded, placed } = chips(week, null, " BOA ");
    expect([...stillNeeded, ...placed].map((c) => c.name)).toEqual(["Boating"]);
  });

  it("in Group View, a bunk an activity isn't set up for needs none of it", () => {
    const { stillNeeded, placed } = chips(schedule(), "g2");
    expect(stillNeeded.map((c) => c.name)).toEqual(["Soccer"]);
    expect(placed.find((c) => c.name === "Swim").label).toBe("0 placed");
  });

  it("Daily View marks an activity over its limit when any bunk is, as the grid's dots do", () => {
    // Bunk 1 has Soccer four times (its limit is 3); the camp's total of 4 is under 3 × 2 bunks.
    const week = schedule(WITH_SOCCER, ["1,2,2", "1,,"]);
    week.days[1] = {
      ...week.days[1],
      items: WITH_SOCCER,
      rows: ["1,2,2", "1,,"]
    };
    const soccer = (list) =>
      [...list.stillNeeded, ...list.placed].find((c) => c.name === "Soccer");
    expect(soccer(chips(week, null)).over).toBe(true);
    expect(soccer(chips(week, "g1")).over).toBe(true);
    expect(soccer(chips(week, "g2")).over).toBe(false);
    // Bunk 2 still needs its two, so the camp's list still has Soccer on top.
    expect(chips(week, null).stillNeeded.map((c) => c.name)).toContain(
      "Soccer"
    );
  });
});
