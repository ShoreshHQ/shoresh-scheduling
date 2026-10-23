import { nsRecord } from "shoresh-jest/namespace";
import {
  RAIN_PLAN_FULL,
  isMarked,
  markOf,
  planRain,
  rainModel,
  rainReceipt
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
    { Id: "crafts", Name: "Crafts", NoGroupLimit__c: true },
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
  it("switches an outdoor activity to its rain plan where there is room", () => {
    const result = plan([",1,", ",,", ",,", ",,"]);
    expect(result.switches).toEqual([
      { g: 0, b: 1, from: "soccer", to: "gym" }
    ]);
    expect(result.full).toEqual([]);
  });

  it("marks full once the rain plan's place is full, counting what switched before it", () => {
    // The Gym fits 2: Bunk 1 and Bunk 2 switch (block by block, bunk by bunk); Bunk 3 can't.
    const result = plan([",1,", ",1,", ",1,", ",,"]);
    expect(at(result.switches)).toEqual(["0|1", "1|1"]);
    expect(result.full).toEqual([{ g: 2, b: 1, activityId: "soccer" }]);
  });

  it("counts what stays in the place: a fixed activity there and the rain plan already placed", () => {
    // Assembly (in the Gym) for Bunk 4 and Gym games for Bunk 3 fill the Gym in Period 2.
    const result = plan([",1,", ",,", ",2,", ",6,"]);
    expect(result.switches).toEqual([]);
    expect(at(result.full)).toEqual(["0|1"]);
  });

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

  it("leaves a longer one, one without a rain plan, and one whose rain plan is outdoors, and says each", () => {
    const result = plan(["4,^,3", ",5,", ",,", ",,"]);
    expect(at(result.spans)).toEqual(["0|0"]);
    expect(at(result.noPlan)).toEqual(["1|1", "0|2"]);
    expect(result.switches).toEqual([]);
  });

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

  it("the same day always gives the same switch", () => {
    const rows = [",1,", ",1,", ",1,", ",1,"];
    expect(plan(rows)).toEqual(plan(rows));
  });
});

describe("the receipt and the marks", () => {
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
      rainFull: [markOf("a0Ba0000001AbCdEAA", "t2", "soccer")]
    };
    expect(isMarked(d, "a0Ba0000001AbCd", "t2", "soccer")).toBe(true);
    expect(isMarked(d, "a0Ba0000001AbCd", "t2", "gym")).toBe(false);
    expect(RAIN_PLAN_FULL).toBe("Rain plan full: choose another");
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
    expect(result.marks).toEqual([markOf("g3", "t2", "soccer")]);
  });

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
