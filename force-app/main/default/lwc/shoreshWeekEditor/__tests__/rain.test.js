import { nsRecord } from "shoresh-jest/namespace";
import {
  RAIN_PLAN_FULL,
  isMarked,
  isSwitched,
  markOf,
  marksAfter,
  planRain,
  rainModel,
  rainReceipt,
  switchedOf
} from "../rain";
import { replan, toolRuns } from "../tools";
import { slots } from "../slotEdits";

// Rainy day (repo docs/adr/0019; desktop src/utils/rainyDay.js) on a made-up day: Period 1,
// Period 2, Lunch; Bunk 1 to Bunk 4. Soccer and Hiking and Boating are outdoors; Soccer's rain
// plan is Gym games (the Gym fits 2 bunks), Boating's is Crafts (2 blocks long, so left as it
// is), Hiking has none, and Canoeing's rain plan is outdoors too. Synthetic data only.

const BLOCKS = [
  { id: "t1", name: "Period 1", startTime: "09:00", endTime: "09:45" },
  { id: "t2", name: "Period 2", startTime: "10:00", endTime: "10:45" },
  { id: "t3", name: "Lunch", startTime: "12:00", endTime: "12:45" }
];
const GROUPS = ["g1", "g2", "g3", "g4"].map((id, i) => ({
  id,
  name: `Bunk ${i + 1}`
}));
const ITEMS = [
  { kind: "A", id: "soccer", name: "Soccer" },
  { kind: "A", id: "gym", name: "Gym games" },
  { kind: "A", id: "hike", name: "Hiking" },
  { kind: "A", id: "boat", name: "Boating" },
  { kind: "A", id: "canoe", name: "Canoeing" },
  { kind: "F", id: "f1", name: "Assembly" },
  { kind: "S", id: "ev1", name: "Carnival" },
  { kind: "E", id: null, name: "Chugim" }
];
// Item numbers in rows: 1 Soccer, 2 Gym games, 3 Hiking, 4 Boating, 5 Canoeing, 6 Assembly,
// 7 Carnival (an event), 8 Chugim (an elective).

const RECORDS = nsRecord({
  activities: [
    {
      Id: "soccer",
      Name: "Soccer",
      Outdoor__c: true,
      RainPlan__c: "gym",
      Location__c: "field",
      GroupsAtOnce__c: 4
    },
    {
      Id: "gym",
      Name: "Gym games",
      Location__c: "gymnasium",
      GroupsAtOnce__c: 3
    },
    { Id: "hike", Name: "Hiking", Outdoor__c: true, NoGroupLimit__c: true },
    {
      Id: "boat",
      Name: "Boating",
      Outdoor__c: true,
      RainPlan__c: "crafts",
      Length__c: 2
    },
    { Id: "crafts", Name: "Crafts", NoGroupLimit__c: true, Length__c: 2 },
    {
      Id: "canoe",
      Name: "Canoeing",
      Outdoor__c: true,
      RainPlan__c: "hike",
      NoGroupLimit__c: true
    }
  ],
  locations: [
    { Id: "field", Name: "Field", GroupsThatFit__c: 4 },
    { Id: "gymnasium", Name: "Gym", GroupsThatFit__c: 2 }
  ],
  fixed: [{ Id: "f1", Name: "Assembly", Location__c: "gymnasium" }]
});

function draft(extra = {}) {
  return {
    activityRecords: RECORDS.activities,
    locationRecords: RECORDS.locations,
    fixedActivityRecords: RECORDS.fixed,
    recurringActivityRecords: [],
    otherPrograms: [],
    ...extra
  };
}

const day = (rows, dateValue = "2026-06-29") => ({
  dateValue,
  problem: null,
  blocks: BLOCKS,
  groups: GROUPS,
  items: ITEMS,
  rows
});

const plan = (rows, options, extra) => {
  const d = day(rows);
  return planRain(d, rainModel(draft(extra), [d]), options);
};
const at = (list) => list.map(({ g, b }) => `${g}|${b}`);

describe("planRain", () => {
  // CLOSE-4.5
  it("switches an outdoor activity to its rain plan where there is room", () => {
    const result = plan([",1,", ",,", ",,", ",,"]);
    expect(result.switches).toEqual([
      { g: 0, b: 1, from: "soccer", to: "gym" }
    ]);
    expect(result.full).toEqual([]);
  });

  // CLOSE-4.6
  it("marks full once the rain plan's place is full, counting what switched before it", () => {
    // The Gym fits 2: Bunk 1 and Bunk 2 switch (block by block, bunk by bunk); Bunk 3 can't.
    const result = plan([",1,", ",1,", ",1,", ",,"]);
    expect(at(result.switches)).toEqual(["0|1", "1|1"]);
    expect(result.full).toEqual([{ g: 2, b: 1, activityId: "soccer" }]);
  });

  // CLOSE-4.6
  it("counts what stays in the place: a fixed activity there and the rain plan already placed", () => {
    // Assembly (in the Gym) for Bunk 4 and Gym games for Bunk 3 fill the Gym in Period 2.
    const result = plan([",1,", ",,", ",2,", ",6,"]);
    expect(result.switches).toEqual([]);
    expect(at(result.full)).toEqual(["0|1"]);
  });

  // CLOSE-4.6
  it("marks full when the rain plan's groups at once are taken", () => {
    const one = nsRecord({ GroupsAtOnce__c: 1 });
    const records = RECORDS.activities.map((r) => {
      return r.Id === "gym" ? { ...r, ...one } : r;
    });
    const result = plan(
      [",1,", ",1,", ",,", ",,"],
      {},
      {
        activityRecords: records,
        locationRecords: []
      }
    );
    expect(at(result.switches)).toEqual(["0|1"]);
    expect(at(result.full)).toEqual(["1|1"]);
  });

  // PROG-4.1, CLOSE-4.6
  it("counts other programs' groups in the place at that time", () => {
    const result = plan(
      [",1,", ",,", ",,", ",,"],
      {},
      {
        otherPrograms: [
          {
            dateValue: "2026-06-29",
            startTime: "10:00",
            endTime: "10:45",
            locationId: "gymnasium",
            activityId: null,
            groups: 2,
            names: ["Swim team"]
          }
        ]
      }
    );
    expect(result.switches).toEqual([]);
    expect(at(result.full)).toEqual(["0|1"]);
  });

  // CLOSE-4.5, CLOSE-4.9
  it("leaves a longer one, and one without an indoor rain plan where nothing indoors fits, and says each", () => {
    // Gym games is the only indoor activity one block long, and it isn't for Bunk 1 or Bunk 2.
    const result = plan(
      ["4,^,3", ",5,", ",,", ",,"],
      {},
      {
        activities: [{ id: "gym", notFor: ["g1", "g2"] }]
      }
    );
    expect(at(result.spans)).toEqual(["0|0"]);
    expect(at(result.noPlan)).toEqual(["1|1", "0|2"]);
    expect(result.switches).toEqual([]);
    expect(result.full).toEqual([]);
  });

  // CLOSE-4.5
  it("never touches a fixed activity, an event, an elective or an indoor activity", () => {
    const result = plan(["6,7,8", ",2,", ",,", ",,"]);
    expect(result).toEqual({
      switches: [],
      full: [],
      noPlan: [],
      spans: [],
      locked: []
    });
  });

  // CLOSE-4.5 LOCK-4.5
  it("leaves a locked cell, someone else's, and one where the bunk isn't at camp", () => {
    const result = plan([",1,", ",1,", ",1,", ",,"], {
      isLocked: (g, b) => g === 0 && b === 1,
      skip: (g) => g === 1,
      isAway: (g) => g === 2
    });
    expect(at(result.locked)).toEqual(["0|1"]);
    expect(result.switches).toEqual([]);
    expect(result.full).toEqual([]);
  });

  // CLOSE-4.9: the camp's Art room fits 1 bunk.
  const withArt = {
    activityRecords: [
      ...RECORDS.activities,
      ...nsRecord({
        activities: [
          { Id: "art", Name: "Art", Location__c: "artroom", GroupsAtOnce__c: 1 }
        ]
      }).activities
    ],
    locationRecords: [
      ...RECORDS.locations,
      ...nsRecord({
        locations: [{ Id: "artroom", Name: "Art room", GroupsThatFit__c: 1 }]
      }).locations
    ]
  };

  // CLOSE-4.9
  it("prefers the rain plan, and once it is full switches to another indoor activity that fits", () => {
    // The Gym fits 2: Bunk 1 and Bunk 2 get Gym games, Bunk 3 the Art room, Bunk 4 nothing fits.
    const result = plan([",1,", ",1,", ",1,", ",1,"], {}, withArt);
    expect(result.switches).toEqual([
      { g: 0, b: 1, from: "soccer", to: "gym" },
      { g: 1, b: 1, from: "soccer", to: "gym" },
      { g: 2, b: 1, from: "soccer", to: "art" }
    ]);
    expect(result.full).toEqual([{ g: 3, b: 1, activityId: "soccer" }]);
  });

  // CLOSE-4.9
  it("never gives a bunk the same activity twice in a day", () => {
    // Bunk 1 has Gym games in Period 1: its rainy Soccer goes to Art, not Gym games again.
    expect(plan(["2,1,", ",,", ",,", ",,"], {}, withArt).switches).toEqual([
      { g: 0, b: 1, from: "soccer", to: "art" }
    ]);
    // Nothing else indoors: it keeps Soccer and is marked, rather than a second Gym games.
    const alone = plan(["2,1,", ",,", ",,", ",,"]);
    expect(alone.switches).toEqual([]);
    expect(alone.full).toEqual([{ g: 0, b: 1, activityId: "soccer" }]);
    // Nor twice from the switch itself: Soccer in both periods gives Gym games, then Art.
    expect(plan(["1,1,", ",,", ",,", ",,"], {}, withArt).switches).toEqual([
      { g: 0, b: 0, from: "soccer", to: "gym" },
      { g: 0, b: 1, from: "soccer", to: "art" }
    ]);
  });

  // CLOSE-4.9
  it("switches one without a rain plan to an indoor activity that fits, one set up for the bunk and one block long", () => {
    // Hiking has no rain plan; Crafts is two blocks long; Gym games isn't for Bunk 1.
    const result = plan(
      [",3,", ",3,", ",,", ",,"],
      {},
      {
        ...withArt,
        activities: [{ id: "gym", notFor: ["g1"] }]
      }
    );
    expect(result.switches).toEqual([
      { g: 0, b: 1, from: "hike", to: "art" },
      { g: 1, b: 1, from: "hike", to: "gym" }
    ]);
  });

  // CLOSE-4.2, CLOSE-4.9
  it("never switches to an activity closed this week, or one at a place closed this week", () => {
    // Gym games is closed: Bunk 1 goes to Art. The Art room closed too: nothing fits.
    expect(
      plan([",1,", ",,", ",,", ",,"], {}, { ...withArt, closed: ["gym"] })
        .switches
    ).toEqual([{ g: 0, b: 1, from: "soccer", to: "art" }]);
    const both = plan(
      [",1,", ",,", ",,", ",,"],
      {},
      {
        ...withArt,
        closed: ["gym", "artroom"]
      }
    );
    expect(both.switches).toEqual([]);
    expect(both.full).toEqual([{ g: 0, b: 1, activityId: "soccer" }]);
  });

  // CLOSE-5.1
  it("the same day always gives the same switch", () => {
    const rows = [",1,", ",1,", ",1,", ",1,"];
    expect(plan(rows)).toEqual(plan(rows));
  });
});

describe("the receipt and the marks", () => {
  // CLOSE-6.3
  it("says what the desktop says", () => {
    expect(
      rainReceipt("Rainy Monday", {
        switches: [1, 2, 3],
        full: [1],
        noPlan: [1, 2],
        spans: [1],
        locked: []
      })
    ).toBe(
      "Rainy Monday: 3 switched to rain plans, 1 full, 2 without a rain plan, 1 longer than one block, left as is"
    );
    expect(
      rainReceipt("Rainy Monday", {
        switches: [],
        full: [],
        noPlan: [],
        spans: [],
        locked: [1]
      })
    ).toBe("Rainy Monday: 1 locked, left as is");
    expect(
      rainReceipt("Rainy Tuesday", {
        switches: [],
        full: [],
        noPlan: [],
        spans: [],
        locked: []
      })
    ).toBe("Rainy Tuesday: nothing outdoors to switch");
  });

  it("a mark matches its cell whichever length its Ids are written in", () => {
    const d = {
      rain: [markOf("a0Ba0000001AbCdEAA", "t2", "soccer")]
    };
    expect(isMarked(d, "a0Ba0000001AbCd", "t2", "soccer")).toBe(true);
    expect(isMarked(d, "a0Ba0000001AbCd", "t2", "gym")).toBe(false);
    expect(RAIN_PLAN_FULL).toBe("Rain plan full: choose another");
  });

  it("a switched mark is told apart from a full one (issue #129)", () => {
    const d = {
      rain: [
        switchedOf("a0Ba0000001AbCdEAA", "t2", "gym"),
        markOf("g2", "t2", "soccer")
      ]
    };
    expect(isSwitched(d, "a0Ba0000001AbCd", "t2", "gym")).toBe(true);
    expect(isMarked(d, "a0Ba0000001AbCd", "t2", "gym")).toBe(false);
    expect(isSwitched(d, "g2", "t2", "soccer")).toBe(false);
    expect(isMarked(d, "g2", "t2", "soccer")).toBe(true);
    expect(isSwitched(null, "g2", "t2", "soccer")).toBe(false);
  });

  it("a second rainy day keeps the marks the day had, once each", () => {
    const before = [
      switchedOf("g1", "t1", "gym"),
      markOf("g2", "t2", "soccer")
    ];
    expect(
      marksAfter(before, [
        markOf("g2", "t2", "soccer"),
        switchedOf("g3", "t2", "gym")
      ])
    ).toEqual([
      switchedOf("g1", "t1", "gym"),
      markOf("g2", "t2", "soccer"),
      switchedOf("g3", "t2", "gym")
    ]);
    expect(marksAfter(undefined, [])).toEqual([]);
  });
});

describe("the rainy day as a tool", () => {
  const week = (rows) => [
    day(rows),
    day([",,", ",,", ",,", ",,"], "2026-06-30")
  ];
  const tool = (days, extra = {}) => ({
    kind: "rain",
    dates: ["2026-06-29"],
    label: "Rainy Monday",
    model: rainModel(draft(), days),
    locks: null,
    ...extra
  });

  it("is one edit: the switched cells, and the full cells as marks", () => {
    const days = week([",1,", ",1,", ",1,", ",,"]);
    const result = toolRuns(tool(days), days);
    expect(result.runs).toEqual([
      { day: 0, group: 0, first: 1, before: ["A:soccer"], after: ["A:gym"] },
      { day: 0, group: 1, first: 1, before: ["A:soccer"], after: ["A:gym"] }
    ]);
    // The switched cells are marked too, for the Schedules page's raindrop (issue #129).
    expect(result.marks).toEqual([
      markOf("g3", "t2", "soccer"),
      switchedOf("g1", "t2", "gym"),
      switchedOf("g2", "t2", "gym")
    ]);
  });

  // CLOSE-4.5
  it("only the day chosen changes", () => {
    const days = [
      day([",1,", ",,", ",,", ",,"]),
      day([",1,", ",,", ",,", ",,"], "2026-06-30")
    ];
    const result = toolRuns(tool(days), days);
    expect(result.runs.every((run) => run.day === 0)).toBe(true);
  });

  it("a cell locked when it was chosen stays, and is counted", () => {
    const days = week([",1,", ",,", ",,", ",,"]);
    const result = toolRuns(
      tool(days, { locks: new Set(["2026-06-29|g1|t2"]) }),
      days
    );
    expect(result.runs).toEqual([]);
    expect(at(result.rain.locked)).toEqual(["0|1"]);
  });

  it("worked out again after someone else's change, leaves their cell and switches the rest", () => {
    const seen = week([",1,", ",1,", ",,", ",,"]);
    // Meanwhile someone put Hiking in Bunk 1's Period 2.
    const saved = week([",3,", ",1,", ",,", ",,"]);
    const t = tool(seen);
    const result = replan(t, seen, saved, new Set(), () => false);
    expect(result.runs).toEqual([
      { day: 0, group: 1, first: 1, before: ["A:soccer"], after: ["A:gym"] }
    ]);
    expect(result.missedPlacements).toBe(1);
    expect(slots(saved[0], 0)[1]).toBe("A:hike");
  });
});
