/**
 * Elective sets in the engine (repo ADR 0018 slice E5; desktop engine/electiveOccupancy.js and
 * buildSchedule.js registerOverlayOccupancy): a placed set is kept like a lock (never filled over,
 * moved or counted as placed), and takes up the places of its confirmed, open offerings, so the
 * generator puts nothing else there that would not fit and the check dots what doesn't.
 */
import {
  checkGeneratedWeek,
  generateWeek,
  readElectivePlaces
} from "c/shoreshEngine";
import { nsRecord } from "shoresh-jest/namespace";
import { activity, block, camp, cellsOf } from "./data/camp";

const SET = "a0X000000000001AAA";

// Chugim offers Archery (at the Range, which fits one bunk); Pottery is only proposed and Drama is
// closed, so neither takes up its place.
const OFFERINGS = nsRecord([
  { Id: "o1", ElectiveSet__c: SET, Activity__c: "archery", Proposed__c: false },
  { Id: "o2", ElectiveSet__c: SET, Activity__c: "pottery", Proposed__c: true },
  {
    Id: "o3",
    ElectiveSet__c: SET,
    Activity__c: "drama",
    Seats__c: 0,
    NoSeatLimit__c: false,
    Proposed__c: false
  }
]);

const spec = {
  groups: [{ id: "g1" }, { id: "g2" }].map((g) => ({
    id: g.id,
    name: `Bunk ${g.id}`,
    division: "div1",
    availability: "AllDay"
  })),
  days: 1,
  blocks: [block(1), block(2)],
  locations: [
    { id: "range", name: "Range", fit: 1 },
    { id: "studio", name: "Studio", fit: 1 },
    { id: "stage", name: "Stage", fit: 1 }
  ],
  activities: [
    activity("archery", { location: "range", min: 0, max: 5 }),
    activity("pottery", { location: "studio", min: 0, max: 5 }),
    activity("drama", { location: "stage", min: 0, max: 5 })
  ],
  // Chugim for Bunk g1 in Period 2.
  cells: [{ day: 0, group: "g1", block: "b1", act: SET, kind: "E", length: 1 }]
};

function input(over = {}) {
  const result = camp({ ...spec, ...over });
  result.days.forEach((day) =>
    day.items.forEach((item) => {
      if (item.kind === "E") {
        item.name = "Chugim";
      }
    })
  );
  return { ...result, electiveOfferings: OFFERINGS };
}

describe("c-shoresh-engine: elective sets", () => {
  it("reads a set's places from its confirmed, open offerings, each place once", () => {
    const places = readElectivePlaces(
      [
        ...OFFERINGS,
        ...nsRecord([{ ElectiveSet__c: SET, Activity__c: "archery" }])
      ],
      nsRecord([
        { Id: "archery", Location__c: "range" },
        { Id: "pottery", Location__c: "studio" },
        { Id: "drama", Location__c: "stage" }
      ])
    );
    expect([...places]).toEqual([[SET, ["range"]]]);
    expect(readElectivePlaces(undefined, undefined).size).toBe(0);
  });

  it("keeps a placed set where it is, and builds around it", () => {
    const result = generateWeek(input());
    expect(result.ok).toBe(true);
    const day = cellsOf(result.days)[0];
    expect(day.g1[0]).toEqual({ kind: "E", id: SET, head: true });
  });

  it("knows the set has the place: a bunk sent there anyway is a bend, said", () => {
    // Archery alone, at the Range that fits one bunk: g2's Period 2 gets it only by bending the
    // place's limit, since Chugim (g1) has the Range then.
    const result = generateWeek(
      input({
        activities: [activity("archery", { location: "range", min: 0, max: 5 })]
      })
    );
    expect(result.ok).toBe(true);
    const flag = result.flags.find(
      (f) => f.groupId === "g2" && f.blockId === "b1"
    );
    expect(flag.bends).toContain("placeCapacity");
    const free = generateWeek({
      ...input({
        activities: [activity("archery", { location: "range", min: 0, max: 5 })]
      }),
      electiveOfferings: []
    });
    const freeFlag = free.flags.find(
      (f) => f.groupId === "g2" && f.blockId === "b1"
    );
    expect((freeFlag && freeFlag.bends) || []).not.toContain("placeCapacity");
  });

  it("dots an activity at the set's place, never the set, and leaves the set out of placed", () => {
    const week = checkGeneratedWeek(
      input({
        cells: [
          ...spec.cells,
          { day: 0, group: "g2", block: "b1", act: "archery" }
        ]
      })
    );
    const dotted = week.checked.flags;
    expect(dotted.get(`${week.days[0].dateValue}|g2|b1`)).toBe(
      "More groups at Range than fit"
    );
    expect(dotted.has(`${week.days[0].dateValue}|g1|b1`)).toBe(false);
    // 2 bunks × 2 blocks = 4 cells, less the set's one; Archery is the one filled.
    expect(week.checked.cells).toEqual({ filled: 1, total: 3 });
  });

  it("counts nothing at a place when there are no offerings", () => {
    const week = checkGeneratedWeek({
      ...input({
        cells: [
          ...spec.cells,
          { day: 0, group: "g2", block: "b1", act: "archery" }
        ]
      }),
      electiveOfferings: []
    });
    expect(week.checked.flags.size).toBe(0);
  });
});
