import { checkWeek } from "../checks";
import { buildTerms } from "c/shoreshTerms";
import { dayName, weekOf } from "./data/checkWeeks";

// Scenario tests for checks.js; the seeded property test is checks.property.test.js.

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true }
]);
const words = { t, dayName };

function activity(id, extra = {}) {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    locationId: null,
    min: 0,
    max: null,
    atOnce: null,
    sameDivision: false,
    early: null,
    ...extra
  };
}

function model(activities, extra = {}) {
  return {
    activities: new Map(activities.map((a) => [a.id, a])),
    locations: new Map(),
    divisions: new Map(),
    setTimeLocations: new Map(),
    notFor: new Map(),
    ...extra
  };
}

const MON = "2026-06-29";
const TUE = "2026-06-30";
const lines = (result) => result.overlapping.map((o) => o.text);
const WED = "2026-07-01";
const THU = "2026-07-02";

describe("checks: the bronze dots", () => {
  // GEN-9.2
  it("over its weekly limit dots only the sessions past it, the latest in the week; at the limit, none", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "", ""],
        ["A:swim", "", ""]
      ],
      [TUE]: [
        ["A:swim", "", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim", { max: 1 })]),
      words
    );
    expect(result.flags.has(`${MON}|g1|t1`)).toBe(false);
    expect(result.flags.get(`${TUE}|g1|t1`)).toBe("Over its weekly limit");
    expect(result.flags.has(`${MON}|g2|t1`)).toBe(false);
  });

  it("past the limit goes by time of day, not by row order: the later block on the same day", () => {
    // Period 2 (10:00) comes before Period 1 (9:00) in this day's list of blocks.
    const days = weekOf(
      { [MON]: [["A:swim", "A:swim"]] },
      {
        blocks: [
          { id: "t2", name: "Period 2", startTime: "10:00", endTime: "11:00" },
          { id: "t1", name: "Period 1", startTime: "09:00", endTime: "10:00" }
        ]
      }
    );
    const result = checkWeek(
      days,
      model([activity("swim", { max: 1 })]),
      words
    );
    expect(result.flags.get(`${MON}|g1|t2`)).toBe(
      "Over its weekly limit · Twice in a day"
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe("Twice in a day");
  });

  it("twice in a day dots both; once on each of two days, neither", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "", "A:swim"],
        ["A:swim", "", ""]
      ],
      [TUE]: [
        ["", "", ""],
        ["A:swim", "", ""]
      ]
    });
    const result = checkWeek(days, model([activity("swim")]), words);
    expect(result.flags.get(`${MON}|g1|t1`)).toBe("Twice in a day");
    expect(result.flags.get(`${MON}|g1|t3`)).toBe("Twice in a day");
    expect(result.flags.size).toBe(2);
  });

  // GEN-3.3
  it("a multi-block placement is one placement, not twice in a day", () => {
    const days = weekOf({
      [MON]: [
        ["A:hike", "^A:hike", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("hike", { max: 1 })]),
      words
    );
    expect(result.flags.size).toBe(0);
  });

  it("an activity not set up for the bunk says so", () => {
    const days = weekOf({
      [MON]: [
        ["", "", ""],
        ["A:swim", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim")], { notFor: new Map([["swim", ["g2"]]]) }),
      words
    );
    expect(result.flags.get(`${MON}|g2|t1`)).toBe("Not set up for Bunk 2");
  });

  it("more bunks at an activity than its limit dots each; each bunk's cell is one overlap", () => {
    const days = weekOf({
      [MON]: [
        ["A:archery", "^A:archery", ""],
        ["", "A:archery", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("archery", { atOnce: 1 })]),
      words
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe(
      "Over its limit of 1 Bunk at once"
    );
    expect(result.flags.get(`${MON}|g2|t2`)).toBe(
      "Over its limit of 1 Bunk at once"
    );
    // Bunk 1's archery runs two periods but clashes only in Period 2: one cell.
    expect(result.overlapping).toEqual([
      {
        dateValue: MON,
        groupId: "g1",
        blockId: "t2",
        rules: ["groupsAtOnce"],
        text: "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
      },
      {
        dateValue: MON,
        groupId: "g2",
        blockId: "t2",
        rules: ["groupsAtOnce"],
        text: "Bunk 2 · Monday · Period 2: Over its limit of 1 Bunk at once"
      }
    ]);
  });

  it("more bunks at a place than fit dots the activities, never the fixed activity", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "", ""],
        ["F:flag", "", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim", { locationId: "pool" })], {
        locations: new Map([["pool", { name: "Pool", fit: 1 }]]),
        setTimeLocations: new Map([["flag", "pool"]])
      }),
      words
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe(
      "More Bunks at Pool than fit"
    );
    expect(result.flags.has(`${MON}|g2|t1`)).toBe(false);
    expect(lines(result)).toEqual([
      "Bunk 1 · Monday · Period 1: More Bunks at Pool than fit"
    ]);
  });

  // DIV-4.2
  it("a one-division activity at a place shares it with no other division", () => {
    const days = weekOf({
      [MON]: [
        ["A:tennis", "A:soccer", ""],
        ["A:soccer", "", ""],
        ["", "A:tennis", ""]
      ]
    });
    const result = checkWeek(
      days,
      model(
        [
          activity("tennis", { locationId: "court", sameDivision: true }),
          activity("soccer", { locationId: "court" })
        ],
        {
          locations: new Map([["court", { name: "Court", fit: 3 }]]),
          divisions: new Map([
            ["g1", "juniors"],
            ["g2", "seniors"],
            ["g3", "juniors"]
          ])
        }
      ),
      words
    );
    // Period 1: Bunk 1 (Juniors) and Bunk 2 (Seniors) at the court. Period 2: one division.
    expect(result.flags.get(`${MON}|g1|t1`)).toBe(
      "Shares Court with another Unit"
    );
    expect(result.flags.get(`${MON}|g2|t1`)).toBe(
      "Shares Court with another Unit"
    );
    expect(result.flags.has(`${MON}|g1|t2`)).toBe(false);
    expect(result.flags.has(`${MON}|g3|t2`)).toBe(false);
    expect(lines(result)).toEqual([
      "Bunk 1 · Monday · Period 1: Shares Court with another Unit",
      "Bunk 2 · Monday · Period 1: Shares Court with another Unit"
    ]);
  });

  // DIV-4.2
  it("a one-division activity with no place: two divisions at once", () => {
    const days = weekOf({
      [MON]: [
        ["A:drama", "", ""],
        ["A:drama", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("drama", { sameDivision: true })], {
        divisions: new Map([
          ["g1", "juniors"],
          ["g2", "seniors"]
        ])
      }),
      words
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe(
      "With another Unit at the same time"
    );
    expect(lines(result)).toEqual([
      "Bunk 1 · Monday · Period 1: With another Unit at the same time",
      "Bunk 2 · Monday · Period 1: With another Unit at the same time"
    ]);
  });

  it("a bunk busy in two time blocks that overlap; blocks that only touch are fine", () => {
    const blocks = [
      { id: "t1", name: "Period 1", startTime: "09:00", endTime: "10:00" },
      { id: "t2", name: "Snack", startTime: "09:30", endTime: "10:15" },
      { id: "t3", name: "Period 2", startTime: "10:15", endTime: "11:00" }
    ];
    const days = weekOf(
      { [MON]: [["A:swim", "A:arts", "A:hike"]] },
      { blocks }
    );
    const result = checkWeek(
      days,
      model([activity("swim"), activity("arts"), activity("hike")]),
      words
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe("Already busy then");
    expect(result.flags.get(`${MON}|g1|t2`)).toBe("Already busy then");
    expect(result.flags.has(`${MON}|g1|t3`)).toBe(false);
    expect(lines(result)).toEqual([
      "Bunk 1 · Monday · Period 1: Already busy then",
      "Bunk 1 · Monday · Snack: Already busy then"
    ]);
  });

  it("one cell breaking several shared rules is one overlap, its reasons in give-way order", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "", ""],
        ["A:swim", "", ""],
        ["A:swim", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim", { locationId: "pool", atOnce: 2 })], {
        locations: new Map([["pool", { name: "Pool", fit: 2 }]])
      }),
      words
    );
    expect(result.overlapping.map((o) => [o.groupId, o.rules])).toEqual([
      ["g1", ["groupsAtOnce", "placeCapacity"]],
      ["g2", ["groupsAtOnce", "placeCapacity"]],
      ["g3", ["groupsAtOnce", "placeCapacity"]]
    ]);
    expect(lines(result)[0]).toBe(
      "Bunk 1 · Monday · Period 1: Over its limit of 2 Bunks at once · More Bunks at Pool than fit"
    );
  });

  it("lists cells by day, then period, then the grid's group order; a fixed activity never has one", () => {
    const days = weekOf({
      [MON]: [
        ["A:arts", "A:swim", ""],
        ["F:flag", "A:swim", ""]
      ],
      [TUE]: [
        ["A:arts", "", ""],
        ["A:arts", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model(
        [
          activity("swim", { atOnce: 1 }),
          activity("arts", { locationId: "hall" })
        ],
        {
          locations: new Map([["hall", { name: "Hall", fit: 1 }]]),
          setTimeLocations: new Map([["flag", "hall"]])
        }
      ),
      words
    );
    // Monday Period 1: Bunk 2's flag fills the hall; only Bunk 1's arts is listed.
    expect(lines(result)).toEqual([
      "Bunk 1 · Monday · Period 1: More Bunks at Hall than fit",
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
      "Bunk 2 · Monday · Period 2: Over its limit of 1 Bunk at once",
      "Bunk 1 · Tuesday · Period 1: More Bunks at Hall than fit",
      "Bunk 2 · Tuesday · Period 1: More Bunks at Hall than fit"
    ]);
  });

  it("a rule only one placement breaks (weekly limit, twice in a day, not set up) is no overlap", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "A:swim", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim", { max: 1 })], {
        notFor: new Map([["swim", ["g1"]]])
      }),
      words
    );
    expect(result.flags.size).toBe(2);
    expect(result.overlapping).toEqual([]);
  });

  it("several reasons on one placement are joined, in the order rules give way", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "A:swim", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("swim", { max: 1 })], {
        notFor: new Map([["swim", ["g1"]]])
      }),
      words
    );
    // The second swim is past the limit; both are twice in a day and not set up for Bunk 1.
    expect(result.flags.get(`${MON}|g1|t2`)).toBe(
      "Over its weekly limit · Twice in a day · Not set up for Bunk 1"
    );
    expect(result.flags.get(`${MON}|g1|t1`)).toBe(
      "Twice in a day · Not set up for Bunk 1"
    );
  });

  it("a day that can't be read is left out", () => {
    const days = weekOf({
      [MON]: [
        ["A:swim", "A:swim", ""],
        ["", "", ""]
      ],
      [TUE]: [
        ["A:swim", "", ""],
        ["", "", ""]
      ]
    });
    days[0] = { ...days[0], problem: "unreadable" };
    const result = checkWeek(
      days,
      model([activity("swim", { max: 1 })]),
      words
    );
    expect(result.flags.size).toBe(0);
  });
});

describe("checks: still to place and the counters", () => {
  // GEN-9.4
  it("still needed: each activity and bunk short of its minimum; a long placement counts once", () => {
    const days = weekOf({
      [MON]: [
        ["A:hike", "^A:hike", ""],
        ["", "", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("hike", { min: 2 })], {
        notFor: new Map([["hike", ["g3"]]])
      }),
      words
    );
    expect(result.stillNeeded).toEqual([
      "Hike · Bunk 1: 1 still needed",
      "Hike · Bunk 2: 2 still needed"
    ]);
    // The same as data, entry for entry.
    expect(result.stillNeededBy).toEqual([
      { activityId: "hike", groupId: "g1", missing: 1 },
      { activityId: "hike", groupId: "g2", missing: 2 }
    ]);
  });

  it("spread across the week as data: entry i is line i", () => {
    const early = { count: 2, byDay: 3 };
    const days = weekOf(
      { [MON]: [["A:swim"], [""]], [THU]: [[""], [""]] },
      { width: 1 }
    );
    const result = checkWeek(days, model([activity("swim", { early })]), words);
    expect(result.spread).toEqual([
      "Swim · Bunk 1: 1 still needed by Wednesday",
      "Swim · Bunk 2: 2 still needed by Wednesday"
    ]);
    expect(result.spreadBy).toEqual([
      { activityId: "swim", groupId: "g1", missing: 1, byDay: "Wednesday" },
      { activityId: "swim", groupId: "g2", missing: 2, byDay: "Wednesday" }
    ]);
  });

  // WEEK-4.1, GEN-9.4
  it("spread across the week: short of its early-week goal, by that day inclusive", () => {
    const early = { count: 1, byDay: 3 };
    const thursday = weekOf(
      { [MON]: [[""]], [TUE]: [[""]], [WED]: [[""]], [THU]: [["A:swim"]] },
      { width: 1 }
    );
    expect(
      checkWeek(thursday, model([activity("swim", { early })]), words).spread
    ).toEqual(["Swim · Bunk 1: 1 still needed by Wednesday"]);
    const wednesday = weekOf(
      { [MON]: [[""]], [WED]: [["A:swim"]] },
      { width: 1 }
    );
    expect(
      checkWeek(wednesday, model([activity("swim", { early })]), words).spread
    ).toEqual([]);
  });

  // WEEK-4.1, GEN-3.12, GEN-9.5
  it("a week that starts after the goal's day counts its own first days (Greg, 2026-10-25)", () => {
    // A Thursday-only week, by Wednesday: its first day counts, and it is short.
    const days = weekOf({ [THU]: [[""]] }, { width: 1 });
    const result = checkWeek(
      days,
      model([activity("swim", { early: { count: 1, byDay: 3 } })]),
      words
    );
    expect(result.spread).toEqual([
      "Swim · Bunk 1: 1 still needed by Wednesday"
    ]);
    expect(result.noEarlyDay).toBeUndefined();
  });

  it("filled: cells filled of the cells to fill, leaving out fixed activities and not at camp", () => {
    const days = weekOf({
      [MON]: [
        ["F:flag", "A:hike", "^A:hike"],
        ["F:flag", "", "E:Chugim"]
      ]
    });
    const result = checkWeek(
      days,
      model([activity("hike")], {
        isAway: (groupId, blockId) => groupId === "g2" && blockId === "t2"
      }),
      words
    );
    expect(result.cells).toEqual({ filled: 3, total: 3 });
  });
});

describe("checks: nothing to say", () => {
  it("an empty week has no marks", () => {
    const days = weekOf({
      [MON]: [
        ["", "", ""],
        ["", "", ""]
      ]
    });
    const result = checkWeek(days, model([activity("swim")]), words);
    expect(result.flags.size).toBe(0);
    expect(result.overlapping).toEqual([]);
    expect(result.cells).toEqual({ filled: 0, total: 6 });
  });
});

describe("checks: which targets the camp has set", () => {
  it("says whether any activity has a weekly minimum or an early-week goal", () => {
    const days = weekOf({});
    const none = checkWeek(days, model([activity("swim")]), words);
    expect(none.hasCoverageTargets).toBe(false);
    expect(none.hasSpreadTargets).toBe(false);
    const both = checkWeek(
      days,
      model([
        activity("swim", { min: 1 }),
        activity("art", { early: { count: 1, byDay: 2 } })
      ]),
      words
    );
    expect(both.hasCoverageTargets).toBe(true);
    expect(both.hasSpreadTargets).toBe(true);
  });
});
