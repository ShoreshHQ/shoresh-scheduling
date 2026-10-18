import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import { FIELD } from "c/shoreshSchema";
import { generateWeek } from "c/shoreshEngine";
import { nsRecord } from "shoresh-jest/namespace";
import {
  ACTION,
  CONFLICT,
  REFUSED,
  SAVED,
  loadWeek,
  saveWeek
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

// Made-up camp: two bunks, two periods, Flagpole fixed in Period 1.
const DAY = {
  dateValue: "2026-06-29",
  problem: null,
  blocks: [
    {
      id: "a0B000000000001AAA",
      name: "Period 1",
      startTime: "09:00",
      endTime: "10:00",
      gone: false
    },
    {
      id: "a0B000000000002AAA",
      name: "Period 2",
      startTime: "10:00",
      endTime: "11:00",
      gone: false
    }
  ],
  groups: [
    { id: "a0G000000000001AAA", name: "Bunk 1", gone: false },
    { id: "a0G000000000002AAA", name: "Bunk 2", gone: false }
  ],
  items: [
    { id: "a0F000000000001AAA", name: "Flagpole", kind: "F", gone: false }
  ],
  rows: ["1,", "1,"]
};

const PROGRAM = "a0P000000000001AAA";
const WEEK = "a0K000000000001AAA";

const SERVER_INPUTS = {
  programId: PROGRAM,
  weekId: WEEK,
  scheduleId: null,
  revision: "",
  option: null,
  days: [DAY],
  notPlaced: ["Rest · Bunk 2 · Monday"],
  groups: [
    {
      Id: "a0G000000000001AAA",
      Name: "Bunk 1",
      Division__c: "a0D000000000001AAA",
      Availability__c: "AllDay",
      SortOrder__c: 1
    }
  ],
  timeBlocks: [
    {
      Id: "a0B000000000001AAA",
      Name: "Period 1",
      PartOfDay__c: "Morning",
      SortOrder__c: 1
    }
  ],
  activities: [
    {
      Id: "a0A000000000001AAA",
      Name: "Swim",
      Length__c: 2,
      TimesPerWeekMin__c: 1,
      Location__c: "a0L000000000001AAA"
    }
  ],
  eligibilities: [
    {
      Id: "a0E000000000001AAA",
      Activity__c: "a0A000000000001AAA",
      Group__c: "a0G000000000001AAA"
    }
  ],
  locations: [{ Id: "a0L000000000001AAA", Name: "Pool", GroupsThatFit__c: 1 }],
  fixedActivities: [
    { Id: "a0F000000000001AAA", Name: "Flagpole", Location__c: null }
  ],
  recurringActivities: [
    {
      Id: "a0R000000000001AAA",
      Name: "Rest",
      Location__c: "a0L000000000001AAA"
    }
  ],
  weekExceptions: [
    {
      Id: "a0W000000000001AAA",
      Week__c: "a0K000000000001AAA",
      Activity__c: "a0A000000000001AAA"
    }
  ]
};

describe("c/shoreshGeneratedWeek", () => {
  afterEach(() => jest.clearAllMocks());

  it("loads a week not generated yet as the engine's input, records as the server sends them", async () => {
    getInputs.mockResolvedValue(nsRecord(SERVER_INPUTS));
    // The screen may hold 15-character Ids; the engine gets the server's own.
    const loaded = await loadWeek(PROGRAM.slice(0, 15), WEEK.slice(0, 15));

    expect(getInputs).toHaveBeenCalledWith({
      programId: PROGRAM.slice(0, 15),
      weekId: WEEK.slice(0, 15)
    });
    expect(loaded.notPlaced).toEqual(["Rest · Bunk 2 · Monday"]);
    expect(
      loaded.input.recurringActivities[0][FIELD.RecurringActivity.Location]
    ).toBe("a0L000000000001AAA");
    expect(loaded.scheduleId).toBeNull();
    expect(loaded.revision).toBe("");
    expect(loaded.option).toBe(1);
    expect(loaded.input.programId).toBe(PROGRAM);
    expect(loaded.input.weekId).toBe(WEEK);
    expect(loaded.input.days).toEqual([DAY]);
    expect(loaded.input.locks).toEqual([]);
    expect(loaded.input.otherPrograms).toEqual([]);
    // The engine reads fields through c/shoreshSchema: they must be there under those names.
    const swim = loaded.input.activities[0];
    expect(swim[FIELD.Activity.Length]).toBe(2);
    expect(swim[FIELD.Activity.Location]).toBe("a0L000000000001AAA");
    expect(loaded.input.groups[0][FIELD.Group.Availability]).toBe("AllDay");
    expect(loaded.input.timeBlocks[0][FIELD.TimeBlock.PartOfDay]).toBe(
      "Morning"
    );
    expect(loaded.input.eligibilities[0][FIELD.ActivityEligibility.Group]).toBe(
      "a0G000000000001AAA"
    );
    expect(loaded.input.locations[0][FIELD.Location.GroupsThatFit]).toBe(1);
    expect(loaded.input.weekExceptions[0][FIELD.WeekException.Week]).toBe(WEEK);
    expect(loaded.input.fixedActivities[0].Id).toBe("a0F000000000001AAA");
  });

  it("keeps the draft, its revision and its option when the week has been generated", async () => {
    getInputs.mockResolvedValue(
      nsRecord({
        ...SERVER_INPUTS,
        scheduleId: "a0S000000000001AAA",
        revision: "2026-06-29:3",
        option: 4
      })
    );
    const loaded = await loadWeek(PROGRAM, WEEK);
    expect(loaded.scheduleId).toBe("a0S000000000001AAA");
    expect(loaded.revision).toBe("2026-06-29:3");
    expect(loaded.option).toBe(4);
  });

  it("passes on a week that can't be opened", async () => {
    getInputs.mockRejectedValue({
      body: { message: "Add time blocks to Main first." }
    });
    await expect(loadWeek(PROGRAM, WEEK)).rejects.toEqual({
      body: { message: "Add time blocks to Main first." }
    });
  });

  it("sends the whole week with what it was loaded at, and only what the server reads", async () => {
    getInputs.mockResolvedValue(
      nsRecord({
        ...SERVER_INPUTS,
        scheduleId: "a0S000000000001AAA",
        revision: "2026-06-29:3"
      })
    );
    const loaded = await loadWeek(PROGRAM, WEEK);
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: "a0S000000000001AAA",
      revision: "2026-06-29:4",
      versionId: "a0S000000000002AAA"
    });
    const built = {
      ...DAY,
      items: [
        ...DAY.items,
        { id: "a0A000000000001AAA", name: "Swim", kind: "A" }
      ],
      rows: ["1,2", "1,"]
    };
    const result = await saveWeek(loaded, {
      action: ACTION.REBUILD,
      option: 2,
      days: [built]
    });

    expect(saveWeekOnServer).toHaveBeenCalledWith({
      request: {
        programId: PROGRAM,
        weekId: WEEK,
        scheduleId: "a0S000000000001AAA",
        revision: "2026-06-29:3",
        action: "Rebuild",
        option: 2,
        days: [
          {
            dateValue: "2026-06-29",
            blockIds: ["a0B000000000001AAA", "a0B000000000002AAA"],
            groupIds: ["a0G000000000001AAA", "a0G000000000002AAA"],
            items: [
              { kind: "F", id: "a0F000000000001AAA", name: "Flagpole" },
              { kind: "A", id: "a0A000000000001AAA", name: "Swim" }
            ],
            rows: ["1,2", "1,"]
          }
        ]
      }
    });
    expect(result).toEqual({
      status: SAVED,
      scheduleId: "a0S000000000001AAA",
      revision: "2026-06-29:4",
      versionId: "a0S000000000002AAA"
    });
  });

  it("sends a first Generate with no draft, and an item not set up yet with an empty id", async () => {
    getInputs.mockResolvedValue(nsRecord(SERVER_INPUTS));
    const loaded = await loadWeek(PROGRAM, WEEK);
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: "a0S000000000001AAA",
      revision: "2026-06-29:1"
    });
    const built = {
      ...DAY,
      items: [{ kind: "T", id: null, name: "Zoo trip" }],
      rows: ["1,^", ","]
    };
    const result = await saveWeek(loaded, {
      action: ACTION.GENERATE,
      option: 1,
      days: [built]
    });
    const { request } = saveWeekOnServer.mock.calls[0][0];
    expect(request.scheduleId).toBeNull();
    expect(request.revision).toBe("");
    expect(request.action).toBe("Generate");
    expect(request.days[0].items).toEqual([
      { kind: "T", id: "", name: "Zoo trip" }
    ]);
    expect(result).toEqual({
      status: SAVED,
      scheduleId: "a0S000000000001AAA",
      revision: "2026-06-29:1",
      versionId: null
    });
  });

  it("says when someone else saved the week since it was loaded", async () => {
    getInputs.mockResolvedValue(nsRecord(SERVER_INPUTS));
    const loaded = await loadWeek(PROGRAM, WEEK);
    saveWeekOnServer.mockResolvedValue({
      conflict: true,
      message:
        "Someone else changed this schedule since you opened it. Open it again to see their changes, then make yours."
    });
    const result = await saveWeek(loaded, {
      action: ACTION.GENERATE,
      option: 1,
      days: [DAY]
    });
    expect(result.status).toBe(CONFLICT);
    expect(result.message).toMatch(/^Someone else changed this schedule/);
  });

  it("gives the server's sentence when it refuses the week", async () => {
    getInputs.mockResolvedValue(nsRecord(SERVER_INPUTS));
    const loaded = await loadWeek(PROGRAM, WEEK);
    saveWeekOnServer.mockRejectedValue({
      body: {
        message:
          "Fixed activities and recurring activities stay where they are set up."
      }
    });
    const result = await saveWeek(loaded, {
      action: ACTION.FILL_OPEN,
      option: 1,
      days: [DAY]
    });
    expect(result).toEqual({
      status: REFUSED,
      message:
        "Fixed activities and recurring activities stay where they are set up."
    });
  });
  it("feeds the engine as loaded, and saves what it built", async () => {
    // Both bunks, both periods, two activities: enough for a whole week of Period 2.
    getInputs.mockResolvedValue(
      nsRecord({
        ...SERVER_INPUTS,
        groups: [
          {
            Id: "a0G000000000001AAA",
            Name: "Bunk 1",
            Division__c: "a0D000000000001AAA",
            Availability__c: "AllDay",
            SortOrder__c: 1
          },
          {
            Id: "a0G000000000002AAA",
            Name: "Bunk 2",
            Division__c: "a0D000000000001AAA",
            Availability__c: "AllDay",
            SortOrder__c: 2
          }
        ],
        timeBlocks: [
          {
            Id: "a0B000000000001AAA",
            Name: "Period 1",
            PartOfDay__c: "Morning",
            SortOrder__c: 1
          },
          {
            Id: "a0B000000000002AAA",
            Name: "Period 2",
            PartOfDay__c: "Morning",
            SortOrder__c: 2
          }
        ],
        activities: [
          {
            Id: "a0A000000000001AAA",
            Name: "Swim",
            Length__c: 1,
            TimesPerWeekMin__c: 0,
            TimesPerWeekMax__c: 5,
            GroupsAtOnce__c: 1,
            Location__c: "a0L000000000001AAA",
            SortOrder__c: 1
          },
          {
            Id: "a0A000000000002AAA",
            Name: "Soccer",
            Length__c: 1,
            TimesPerWeekMin__c: 0,
            TimesPerWeekMax__c: 5,
            GroupsAtOnce__c: 1,
            SortOrder__c: 2
          }
        ],
        eligibilities: [],
        weekExceptions: []
      })
    );
    const loaded = await loadWeek(PROGRAM, WEEK);
    const built = generateWeek({ ...loaded.input, option: loaded.option });

    expect(built.ok).toBe(true);
    expect(built.openCells).toEqual([]);
    // Flagpole stays in Period 1; each bunk gets one of the two activities in Period 2.
    const day = built.days[0];
    const names = day.rows.map((row) =>
      row
        .split(",")
        .map((cell) => (cell ? day.items[Number(cell) - 1].name : ""))
    );
    expect(names.map((cells) => cells[0])).toEqual(["Flagpole", "Flagpole"]);
    expect(names.map((cells) => cells[1]).sort()).toEqual(["Soccer", "Swim"]);

    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: "a0S000000000001AAA",
      revision: "2026-06-29:1"
    });
    await saveWeek(loaded, {
      action: ACTION.GENERATE,
      option: loaded.option,
      days: built.days
    });
    const sent = saveWeekOnServer.mock.calls[0][0].request.days[0];
    expect(sent.blockIds).toEqual(["a0B000000000001AAA", "a0B000000000002AAA"]);
    expect(sent.groupIds).toEqual(["a0G000000000001AAA", "a0G000000000002AAA"]);
    expect(sent.rows).toEqual(day.rows);
    expect(sent.items).toEqual(
      day.items.map(({ kind, id, name }) => ({ kind, id: id || "", name }))
    );
  });

  it("passes on other programs' use of places and activities in the engine's shape", async () => {
    getInputs.mockResolvedValue(
      nsRecord({
        ...SERVER_INPUTS,
        otherPrograms: [
          {
            dateValue: "2026-06-29",
            startTime: "10:00",
            endTime: "11:00",
            locationId: "a0L000000000001AAA",
            activityId: "a0A000000000001AAA",
            groups: 2
          },
          {
            dateValue: "2026-06-29",
            startTime: "09:00",
            endTime: "09:30",
            locationId: "a0L000000000001AAA",
            groups: 1
          }
        ]
      })
    );
    const loaded = await loadWeek(PROGRAM, WEEK);
    expect(loaded.input.otherPrograms).toEqual([
      {
        date: "2026-06-29",
        startTime: "10:00",
        endTime: "11:00",
        locationId: "a0L000000000001AAA",
        activityId: "a0A000000000001AAA",
        groups: 2
      },
      {
        date: "2026-06-29",
        startTime: "09:00",
        endTime: "09:30",
        locationId: "a0L000000000001AAA",
        activityId: null,
        groups: 1
      }
    ]);
  });

  describe("another program at the Pool (G5)", () => {
    // Bunk 1 and Bunk 2 have Period 2 (10:00 to 11:00) to fill; Swim is at the Pool, which fits
    // one; Soccer has no place and no limit on bunks at once.
    const camp = (otherPrograms) =>
      nsRecord({
        ...SERVER_INPUTS,
        groups: [1, 2].map((n) => ({
          Id: `a0G00000000000${n}AAA`,
          Name: `Bunk ${n}`,
          Division__c: "a0D000000000001AAA",
          Availability__c: "AllDay",
          SortOrder__c: n
        })),
        timeBlocks: [1, 2].map((n) => ({
          Id: `a0B00000000000${n}AAA`,
          Name: `Period ${n}`,
          PartOfDay__c: "Morning",
          SortOrder__c: n
        })),
        activities: [
          {
            Id: "a0A000000000001AAA",
            Name: "Swim",
            Length__c: 1,
            TimesPerWeekMin__c: 1,
            TimesPerWeekMax__c: 5,
            Priority__c: "High",
            NoGroupLimit__c: true,
            Location__c: "a0L000000000001AAA",
            SortOrder__c: 1
          },
          {
            Id: "a0A000000000002AAA",
            Name: "Soccer",
            Length__c: 1,
            TimesPerWeekMin__c: 0,
            TimesPerWeekMax__c: 5,
            NoGroupLimit__c: true,
            SortOrder__c: 2
          }
        ],
        eligibilities: [],
        weekExceptions: [],
        otherPrograms
      });
    const period2 = (built) => {
      const day = built.days[0];
      return day.rows.map((row) => {
        const cell = row.split(",")[1];
        return cell ? day.items[Number(cell) - 1].name : "";
      });
    };
    const atPool = (startTime, endTime, groups) => ({
      dateValue: "2026-06-29",
      startTime,
      endTime,
      locationId: "a0L000000000001AAA",
      activityId: null,
      groups
    });
    const build = async (otherPrograms) => {
      getInputs.mockResolvedValue(camp(otherPrograms));
      const loaded = await loadWeek(PROGRAM, WEEK);
      return generateWeek({ ...loaded.input, option: loaded.option });
    };

    it("with the Pool free, one bunk swims there", async () => {
      const built = await build([]);
      expect(built.ok).toBe(true);
      expect(period2(built).sort()).toEqual(["Soccer", "Swim"]);
      expect(built.flags).toEqual([]);
    });

    it("its published schedule filling the Pool at an overlapping time: the build swims nowhere then", async () => {
      // Another program's grid: its Period 3, 10:30 to 11:15, overlaps this Period 2.
      const built = await build([atPool("10:30", "11:15", 1)]);
      expect(built.ok).toBe(true);
      expect(period2(built)).toEqual(["Soccer", "Soccer"]);
      expect(built.flags).toEqual([]);
      expect(built.overlapping).toEqual([]);
    });

    it("a time that only touches, or a place with room left, doesn't block", async () => {
      expect(
        period2(await build([atPool("11:00", "11:45", 1)])).sort()
      ).toEqual(["Soccer", "Swim"]);
      expect(
        period2(await build([atPool("09:00", "10:00", 1)])).sort()
      ).toEqual(["Soccer", "Swim"]);
      // A draft of another program is never sent (the server reads only published schedules),
      // so with nothing sent the Pool is free; a count of 0 takes no room either.
      expect(
        period2(await build([atPool("10:00", "11:00", 0)])).sort()
      ).toEqual(["Soccer", "Swim"]);
    });
  });
});
