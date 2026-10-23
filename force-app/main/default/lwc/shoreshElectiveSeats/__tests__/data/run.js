// A run as ElectiveSeats.open sends it, for the seats screen's tests. Every name is made up.
// Chugim in Period 1 on Monday and Tuesday (12:30) for Aspen and Willow (one division, Juniors):
// Archery (2 seats), Drama (no limit), Pottery (10 seats, at least 3), Ceramics (proposed).

export const MONDAY = "2027-07-05";
export const TUESDAY = "2027-07-06";

const time = (day) => ({
  key: `${day}|b1|d1`,
  day,
  blockId: "b1",
  blockName: "Period 1",
  startTime: "12:30",
  blockOrder: 0,
  divisionId: "d1",
  divisionOrder: 1,
  groupIds: ["g1", "g2"],
  offeringIds: ["o1", "o2", "o3"]
});

const choices = (list) => JSON.stringify(list);

export function runView(overrides = {}) {
  return {
    run: {
      id: "r1",
      name: "Chugim · Week 1",
      setId: "e1",
      weekId: "w1",
      scheduleId: "s1",
      status: "Committed",
      createdAt: "2027-06-20T14:00:00.000Z",
      finalizedAt: null,
      finalizedBy: null,
      newVersionOf: null
    },
    revision: 1,
    setName: "Chugim",
    sourceFile: "chugim.xlsx",
    assigned: false,
    scheduleChanged: false,
    times: [time(MONDAY), time(TUESDAY)],
    offerings: [
      {
        id: "o1",
        activityId: "a1",
        name: "Archery",
        seats: 2,
        noLimit: false,
        minimum: null,
        proposed: false
      },
      {
        id: "o4",
        activityId: "a4",
        name: "Ceramics",
        seats: 5,
        noLimit: false,
        minimum: null,
        proposed: true
      },
      {
        id: "o2",
        activityId: "a2",
        name: "Drama",
        seats: null,
        noLimit: true,
        minimum: null,
        proposed: false
      },
      {
        id: "o3",
        activityId: "a3",
        name: "Pottery",
        seats: 10,
        noLimit: false,
        minimum: 3,
        proposed: false
      }
    ],
    groups: [
      { id: "g1", name: "Aspen", divisionId: "d1", divisionName: "Juniors" },
      { id: "g2", name: "Willow", divisionId: "d1", divisionName: "Juniors" }
    ],
    campers: [
      {
        id: "c1",
        name: "Maya Fernwood",
        groupId: "g1",
        choices: choices([
          { n: "Archery", a: "a1", r: 1, k: "ranked" },
          { n: "Drama", a: "a2", r: 2, k: "ranked" }
        ])
      },
      {
        id: "c2",
        name: "Ari Brookfield",
        groupId: "g1",
        comment: "Ari would love to be with his cousin for at least one chug.",
        choices: choices([
          { n: "Archery", a: "a1", r: 1, k: "ranked" },
          { n: "Pottery", a: "a3", r: 2, k: "ranked" }
        ])
      },
      {
        id: "c3",
        name: "Eli Marblecrest",
        groupId: "g2",
        choices: choices([{ n: "Archery", a: "a1", r: 1, k: "ranked" }])
      },
      {
        id: "c4",
        name: "Bea Stonebridge",
        groupId: null,
        choices: choices([
          { n: "Drama", a: "a2", k: "unordered" },
          { n: "Pottery", a: "a3", k: "unordered" }
        ])
      }
    ],
    seats: [],
    dropped: null,
    unreadable: [],
    ...overrides
  };
}

export const seat = (id, camperId, day, offeringId, extra = {}) => ({
  id,
  camperId,
  day,
  blockId: "b1",
  offeringId,
  locked: false,
  byHand: false,
  ...extra
});

/** The run once seats are assigned: Archery full on Monday, the rest as the engine places them. */
export function assignedView(overrides = {}) {
  return runView({
    assigned: true,
    revision: 2,
    seats: [
      seat("x1", "c1", MONDAY, "o1"),
      seat("x2", "c2", MONDAY, "o1", { locked: true, byHand: true }),
      seat("x3", "c3", MONDAY, "o2"),
      seat("x4", "c4", MONDAY, "o2"),
      seat("x5", "c1", TUESDAY, "o1"),
      seat("x6", "c2", TUESDAY, "o3"),
      seat("x7", "c3", TUESDAY, "o1")
    ],
    ...overrides
  });
}
