// A final run as ElectiveDownloads.forRun sends it, for the downloads' tests. Every name is made
// up. The run of data/run.js, finalized on 14 Oct by Greg: each seat carries the names copied at
// Finalize, and each bunk's week is Flag at 9:00, Chugim at 12:30, and (Aspen only) Swim across
// Period 2 and Period 3.
import { MONDAY, TUESDAY, assignedView, runView } from "./run";

const FINAL_RUN = {
  ...runView().run,
  status: "Final",
  finalizedAt: "2027-10-14T15:00:00.000Z",
  finalizedBy: "Greg Feitel"
};

const NAMES = { o1: "Archery", o2: "Drama", o3: "Pottery" };
const BUNKS = { c1: "Aspen", c2: "Aspen", c3: "Willow" };

const day = (date) => ({
  day: date,
  blocks: [
    { id: "b0", name: "Morning", startTime: "09:00" },
    { id: "b1", name: "Period 1", startTime: "12:30" },
    { id: "b2", name: "Period 2", startTime: "14:00" },
    { id: "b3", name: "Period 3", startTime: "15:00" }
  ],
  bunks: [
    {
      groupId: "g1",
      cells: [
        { blockId: "b0", name: "Flag", kind: "F", blocks: 1, thisSet: false },
        { blockId: "b1", name: "Chugim", kind: "E", blocks: 1, thisSet: true },
        { blockId: "b2", name: "Swim", kind: "A", blocks: 2, thisSet: false }
      ]
    },
    {
      groupId: "g2",
      cells: [
        { blockId: "b0", name: "Flag", kind: "F", blocks: 1, thisSet: false },
        { blockId: "b1", name: "Chugim", kind: "E", blocks: 1, thisSet: true }
      ]
    }
  ]
});

/** The final run's view: its seats named as they were finalized. */
export function finalView(overrides = {}) {
  const assigned = assignedView();
  const campers = assigned.campers.map((c) => {
    return c.id === "c1"
      ? { ...c, camperNumber: "SYN-1001" }
      : c.id === "c3"
        ? {
            ...c,
            camperNumber: "SYN-1003",
            // A choice for one period, beside the week's list.
            choices: JSON.stringify([
              { n: "Archery", a: "a1", r: 1, k: "ranked" },
              {
                n: "Drama",
                a: "a2",
                r: 1,
                k: "cell",
                d: "Tuesday",
                p: "Period 1"
              }
            ])
          }
        : c;
  });
  return {
    ...assigned,
    run: FINAL_RUN,
    revision: 3,
    campers,
    seats: assigned.seats.map((s) => ({
      ...s,
      activityName: NAMES[s.offeringId],
      locationName: null,
      groupName: BUNKS[s.camperId] || null
    })),
    ...overrides
  };
}

export function finalDownload(overrides = {}) {
  return {
    view: finalView(),
    weekName: "Week 1",
    days: [day(MONDAY), day(TUESDAY)],
    ...overrides
  };
}
