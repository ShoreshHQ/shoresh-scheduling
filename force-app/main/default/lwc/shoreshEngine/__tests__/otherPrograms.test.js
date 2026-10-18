import { otherProgramsAt } from "c/shoreshEngine";

// Other programs counted against this program's blocks (ADR 0010 G5, §23): the most groups at a
// place or activity at any one moment of a block, since programs keep their own time grids.
// Made-up camp: this program's Period 2 runs 10:00 to 10:45 on Monday.
const MONDAY = "2026-06-29";
const DAYS = [
  {
    dateValue: MONDAY,
    blocks: [
      { id: "p1", name: "Period 1", startTime: "09:00", endTime: "09:45" },
      { id: "p2", name: "Period 2", startTime: "10:00", endTime: "10:45" }
    ],
    groups: [{ id: "g1", name: "Bunk 1" }],
    items: [],
    rows: [","]
  }
];
const at = (startTime, endTime, groups, extra = {}) => ({
  date: MONDAY,
  startTime,
  endTime,
  locationId: "pool",
  activityId: "swim",
  groups,
  ...extra
});
const counted = (entries) => {
  const { othersAt } = otherProgramsAt(entries, DAYS);
  return {
    place: othersAt("place", "pool", 0, "p2"),
    activity: othersAt("activity", "swim", 0, "p2")
  };
};

describe("other programs, counted at their busiest moment", () => {
  it("one group across two of their shorter blocks is one group", () => {
    // Their two-block Swim, sent as one entry per block.
    expect(counted([at("10:00", "10:20", 1), at("10:20", "10:45", 1)])).toEqual(
      { place: 1, activity: 1 }
    );
  });

  it("two groups one after the other are one at a time", () => {
    expect(
      counted([
        at("09:50", "10:20", 1),
        at("10:20", "10:50", 1, { locationId: "pool", activityId: "swim" })
      ])
    ).toEqual({ place: 1, activity: 1 });
  });

  it("groups there at the same time add up, at the moment most are there", () => {
    // 2 from 10:00, 1 more from 10:15 to 10:30, and 3 from 10:30: never more than 3 at once.
    expect(
      counted([
        at("10:00", "10:30", 2),
        at("10:15", "10:30", 1),
        at("10:30", "11:00", 3)
      ])
    ).toEqual({ place: 3, activity: 3 });
  });

  it("the same whatever order the entries come in", () => {
    const entries = [
      at("10:00", "10:30", 2),
      at("10:15", "10:40", 1),
      at("10:20", "10:25", 1)
    ];
    expect(counted(entries)).toEqual({ place: 4, activity: 4 });
    expect(counted([...entries].reverse())).toEqual({ place: 4, activity: 4 });
  });

  it("one group leaving as another arrives is one, whichever is listed first", () => {
    // The arriving group listed first: only ends counted before starts at the same minute
    // keep this at one (a plain sort by time would see both there at 10:20).
    const leaving = at("09:50", "10:20", 1);
    const arriving = at("10:20", "10:50", 1);
    expect(counted([arriving, leaving])).toEqual({ place: 1, activity: 1 });
    expect(counted([leaving, arriving])).toEqual({ place: 1, activity: 1 });
    // Two leaving as one arrives: two, never three.
    const two = at("09:50", "10:20", 2);
    expect(counted([arriving, two])).toEqual({ place: 2, activity: 2 });
  });

  it("names what they are doing at the place in the block, once each, in order", () => {
    const { otherNamesAt } = otherProgramsAt(
      [
        at("10:00", "10:20", 1, { names: ["Teen swim"] }),
        at("10:20", "10:45", 1, { names: ["Teen swim"] }),
        at("10:00", "10:45", 1, {
          activityId: null,
          names: ["Lunch", "Choir"]
        }),
        // Before the block, and at another place: not named here.
        at("09:00", "09:45", 1, { names: ["Diving"] }),
        at("10:00", "10:45", 1, { locationId: "gym", names: ["Archery"] }),
        // One the user can't read comes with no name, and names nothing.
        at("10:00", "10:45", 1, { names: [] })
      ],
      DAYS
    );
    expect(otherNamesAt("pool", 0, "p2")).toEqual([
      "Choir",
      "Lunch",
      "Teen swim"
    ]);
    expect(otherNamesAt("pool", 0, "p1")).toEqual(["Diving"]);
    expect(otherNamesAt("lake", 0, "p2")).toEqual([]);
  });

  it("places and activities are counted apart", () => {
    const entries = [
      at("10:00", "10:45", 2, { activityId: null }),
      at("10:00", "10:45", 1, { locationId: null })
    ];
    expect(counted(entries)).toEqual({ place: 2, activity: 1 });
  });

  it("a time that only touches the block, another day, or a count of 0 takes no room", () => {
    expect(
      counted([
        at("09:00", "10:00", 2),
        at("10:45", "11:30", 2),
        { ...at("10:00", "10:45", 2), date: "2026-06-30" },
        at("10:00", "10:45", 0)
      ])
    ).toEqual({ place: 0, activity: 0 });
  });
});
