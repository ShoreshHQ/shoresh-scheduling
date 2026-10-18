import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import { generateWeek } from "c/shoreshEngine";
import { nsRecord } from "shoresh-jest/namespace";
import {
  LOCK,
  REFUSED,
  SAVED,
  loadWeek,
  locksOf,
  saveEdits,
  setLocks
} from "c/shoreshGeneratedWeek";

jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveWeek",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveSlots",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.setLocks",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// Made-up camp: two bunks, two periods, Flagpole fixed in Period 1; Swim in Bunk 1's Period 2,
// locked (a hand edit).
const B1 = "a0B000000000001AAA";
const B2 = "a0B000000000002AAA";
const G1 = "a0G000000000001AAA";
const G2 = "a0G000000000002AAA";
const SWIM = "a0A000000000001AAA";
const DAY = {
  dateValue: "2026-06-29",
  blocks: [
    { id: B1, name: "Period 1", startTime: "09:00", endTime: "10:00" },
    { id: B2, name: "Period 2", startTime: "10:00", endTime: "11:00" }
  ],
  groups: [
    { id: G1, name: "Bunk 1" },
    { id: G2, name: "Bunk 2" }
  ],
  items: [
    { kind: "F", id: "a0F000000000001AAA", name: "Flagpole" },
    { kind: "A", id: SWIM, name: "Swim" }
  ],
  rows: ["1,2", "1,"],
  locks: [",1", ","]
};
const group = (id, name, order) => ({
  Id: id,
  Name: name,
  Division__c: "a0D000000000001AAA",
  Availability__c: "AllDay",
  SortOrder__c: order
});
const activity = (id, name, order) => ({
  Id: id,
  Name: name,
  Length__c: 1,
  TimesPerWeekMin__c: 0,
  TimesPerWeekMax__c: 5,
  GroupsAtOnce__c: 2,
  SortOrder__c: order
});
const SERVER_INPUTS = {
  programId: "a0P000000000001AAA",
  weekId: "a0K000000000001AAA",
  scheduleId: "a0S000000000001AAA",
  revision: "2026-06-29:2",
  option: 1,
  days: [DAY],
  notPlaced: [],
  groups: [group(G1, "Bunk 1", 1), group(G2, "Bunk 2", 2)],
  timeBlocks: [
    { Id: B1, Name: "Period 1", PartOfDay__c: "Morning", SortOrder__c: 1 },
    { Id: B2, Name: "Period 2", PartOfDay__c: "Morning", SortOrder__c: 2 }
  ],
  activities: [
    activity(SWIM, "Swim", 1),
    activity("a0A000000000002AAA", "Soccer", 2),
    activity("a0A000000000003AAA", "Archery", 3)
  ],
  eligibilities: [],
  locations: [],
  fixedActivities: [{ Id: "a0F000000000001AAA", Name: "Flagpole" }],
  recurringActivities: [],
  weekExceptions: []
};

const nameAt = (day, g, b) => {
  const cell = day.rows[g].split(",")[b];
  return cell ? day.items[Number(cell) - 1].name : "";
};

describe("c/shoreshGeneratedWeek locks", () => {
  afterEach(() => jest.clearAllMocks());

  it("reads the stored lock rows as the engine's locks", () => {
    expect(locksOf([DAY])).toEqual([
      { date: "2026-06-29", groupId: G1, blockId: B2 }
    ]);
    expect(locksOf([{ ...DAY, locks: [] }])).toEqual([]);
    expect(locksOf([{ ...DAY, locks: undefined }])).toEqual([]);
  });

  it("hands the locks to the engine, which keeps a locked cell in every option", async () => {
    getInputs.mockResolvedValue(nsRecord(SERVER_INPUTS));
    const loaded = await loadWeek("a0P000000000001AAA", "a0K000000000001AAA");
    expect(loaded.input.locks).toEqual([
      { date: "2026-06-29", groupId: G1, blockId: B2 }
    ]);
    for (const option of [1, 2, 3, 4, 5]) {
      const built = generateWeek({ ...loaded.input, option });
      expect(built.ok).toBe(true);
      expect(nameAt(built.days[0], 0, 1)).toBe("Swim");
      expect(nameAt(built.days[0], 0, 0)).toBe("Flagpole");
    }
  });

  it("saves hand edits through the Generated draft and gives back the new revision", async () => {
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: { days: [DAY] },
      revision: "2026-06-29:3"
    });
    const edits = [{ runs: [{ day: "2026-06-29", groupId: G2 }] }];
    const result = await saveEdits({ scheduleId: "a0S000000000001AAA" }, edits);
    expect(saveSlots).toHaveBeenCalledWith({
      scheduleId: "a0S000000000001AAA",
      edits
    });
    expect(result).toEqual({
      status: SAVED,
      conflicts: [],
      schedule: { days: [DAY] },
      revision: "2026-06-29:3"
    });
  });

  it("locks a day, a group or a cell, and passes on a refusal", async () => {
    setLocksOnServer.mockResolvedValue({
      schedule: { days: [DAY] },
      revision: "2026-06-29:4"
    });
    const changes = [
      { action: LOCK, dateValue: "2026-06-29" },
      { action: LOCK, groupId: G2 },
      { action: LOCK, dateValue: "2026-06-29", groupId: G1, blockId: B2 }
    ];
    const result = await setLocks(
      { scheduleId: "a0S000000000001AAA" },
      changes
    );
    expect(setLocksOnServer).toHaveBeenCalledWith({
      scheduleId: "a0S000000000001AAA",
      changes
    });
    expect(result).toEqual({
      status: SAVED,
      schedule: { days: [DAY] },
      revision: "2026-06-29:4"
    });
    setLocksOnServer.mockRejectedValue({
      body: { message: "A saved version can't be changed." }
    });
    expect(await setLocks({ scheduleId: "x" }, changes)).toEqual({
      status: REFUSED,
      message: "A saved version can't be changed."
    });
  });
});
