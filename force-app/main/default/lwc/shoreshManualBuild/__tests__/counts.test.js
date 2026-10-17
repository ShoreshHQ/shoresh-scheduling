import { countLabel, paletteChips } from "../counts";
import { ACTIVITIES, WITH_SOCCER, schedule } from "./data/draftFixture";

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
    const { stillNeeded, placed } = paletteChips(week, ACTIVITIES, null, "");
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
    const bunk1 = paletteChips(week, ACTIVITIES, "g1", "");
    const swim = bunk1.placed.find((c) => c.name === "Swim");
    expect(swim.label).toBe("3 placed (needs 1–2)");
    expect(swim.over).toBe(true);
    const bunk2 = paletteChips(week, ACTIVITIES, "g2", "");
    expect(bunk2.placed.find((c) => c.name === "Boating").label).toBe(
      "1 placed"
    );
  });

  it("the Filter box narrows the list, spaces and capitals aside", () => {
    const week = schedule();
    const { stillNeeded, placed } = paletteChips(
      week,
      ACTIVITIES,
      null,
      " BOA "
    );
    expect([...stillNeeded, ...placed].map((c) => c.name)).toEqual(["Boating"]);
  });

  it("in Group View, a bunk an activity isn't set up for needs none of it", () => {
    const { stillNeeded, placed } = paletteChips(
      schedule(),
      ACTIVITIES,
      "g2",
      ""
    );
    expect(stillNeeded.map((c) => c.name)).toEqual(["Soccer"]);
    expect(placed.find((c) => c.name === "Swim").label).toBe("0 placed");
  });
});
