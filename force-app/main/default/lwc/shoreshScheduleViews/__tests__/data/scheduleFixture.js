// A made-up opened version, as SchedulesController.openSchedule sends it. Synthetic data only.
export const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "ElectiveSet", singular: "Chug", plural: "Chugim", isCustom: true }
];

const blocks = [
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
const items = [
  { kind: "A", id: "a1", name: "Swim", gone: false },
  { kind: "F", id: "f1", name: "Lunch", gone: false },
  { kind: "E", id: "", name: "Chugim", gone: false },
  { kind: "A", id: "a9", name: "Pottery", gone: true }
];

export function opened() {
  return {
    status: "Version",
    schedule: {
      id: "s1",
      name: "Imported from sample-week.xlsx",
      origin: "Imported",
      reason: "Imported",
      savedAt: "2026-10-16T14:00:00.000Z"
    },
    days: [
      {
        dateValue: "2026-06-29",
        problem: null,
        blocks,
        groups: [
          { id: "g1", name: "Bunk 1", gone: false },
          { id: "g2", name: "Bunk 2", gone: false }
        ],
        items,
        rows: ["1,^,2", "3,4,2"]
      },
      {
        dateValue: "2026-06-30",
        problem: null,
        blocks,
        groups: [
          { id: "g1", name: "Bunk 1", gone: false },
          { id: "g2", name: "Bunk 2", gone: false }
        ],
        items,
        rows: [",1,2", "1,,2"]
      },
      {
        dateValue: "2026-07-01",
        problem: "it is not in the grid format",
        blocks: [],
        groups: [],
        items: [],
        rows: []
      }
    ]
  };
}
