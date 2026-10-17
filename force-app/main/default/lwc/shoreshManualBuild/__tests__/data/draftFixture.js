// A made-up Manual Build draft, as ManualBuildController.getDraft sends it. Synthetic data only.
// Two days; Period 1, Period 2, Lunch; Bunk 1 and Bunk 2 (Bunk 2 goes home before Lunch);
// Flagpole (a fixed activity) for everyone in Period 1. Swim is not set up for Bunk 2; Boating
// runs two blocks.

export const BLOCKS = [
  {
    id: "t1",
    name: "Period 1",
    startTime: "09:00",
    endTime: "09:45",
    gone: false
  },
  {
    id: "t2",
    name: "Period 2",
    startTime: "10:00",
    endTime: "10:45",
    gone: false
  },
  { id: "t3", name: "Lunch", startTime: "12:00", endTime: "12:45", gone: false }
];

export const GROUPS = [
  { id: "g1", name: "Bunk 1", gone: false },
  { id: "g2", name: "Bunk 2", gone: false }
];

export const ACTIVITIES = [
  { id: "a1", name: "Swim", length: 1, notFor: ["g2"] },
  { id: "a2", name: "Boating", length: 2, notFor: [] },
  { id: "a3", name: "Soccer", length: 1, notFor: [] }
];

export function day(dateValue, items, rows) {
  return {
    dateValue,
    problem: null,
    blocks: BLOCKS,
    groups: GROUPS,
    items,
    rows
  };
}

const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };

export function schedule(mondayItems, mondayRows) {
  return {
    status: "Draft",
    schedule: {
      id: "d1",
      name: "Manual Build",
      origin: "Manual",
      reason: null,
      savedAt: "2026-10-17T14:00:00.000Z"
    },
    days: [
      day(
        "2026-06-29",
        mondayItems || [FLAGPOLE],
        mondayRows || ["1,,", "1,,"]
      ),
      day("2026-06-30", [FLAGPOLE], ["1,,", "1,,"])
    ]
  };
}

export function draft(mondayItems, mondayRows) {
  return {
    schedule: schedule(mondayItems, mondayRows),
    activities: ACTIVITIES,
    away: [{ groupId: "g2", blockIds: ["t3"] }]
  };
}

export const WITH_SOCCER = [
  FLAGPOLE,
  { kind: "A", id: "a3", name: "Soccer", gone: false }
];

export const WITH_SWIM = [
  FLAGPOLE,
  { kind: "A", id: "a1", name: "Swim", gone: false }
];
