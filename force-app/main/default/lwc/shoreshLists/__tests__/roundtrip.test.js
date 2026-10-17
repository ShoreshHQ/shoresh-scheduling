// Slice 4c part C: whatever Shoresh writes reads back with no changes (Greg, #5), for every
// screen's list and for the camp workbook. A made-up camp with two programs, so names that two
// programs share are written so they can't be mistaken.
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import { workbookFile } from "c/shoreshImportEngine";
import {
  LIST_SCREENS,
  campWorkbookSheets,
  listProposal,
  listRows,
  questionCards,
  sheetName,
  waitingFor
} from "c/shoreshLists";

const MS = 60000;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const at = (h, m = 0) => (h * 60 + m) * MS;

function program(id, name, runs, parts) {
  const record = { Id: id, Name: name };
  DAYS.forEach((d) => {
    record[`${d}__c`] = runs.includes(d);
  });
  return { program: record, ...parts };
}

function camp() {
  const block = (id, name, h, m, h2, m2, part) => ({
    Id: id,
    Name: name,
    StartTime__c: at(h, m),
    EndTime__c: at(h2, m2),
    PartOfDay__c: part
  });
  return {
    season: { Id: "s1", Camp__c: "c1" },
    labels: [
      {
        term: "Group",
        modelSingular: "Group",
        singular: "Bunk",
        plural: "Bunks",
        isCustom: true
      },
      {
        term: "Division",
        modelSingular: "Division",
        singular: "Unit",
        plural: "Units",
        isCustom: true
      }
    ],
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      },
      {
        Id: "w2",
        Name: "Week 2",
        StartDate__c: "2027-07-05",
        EndDate__c: "2027-07-09"
      }
    ],
    weekExceptions: [{ Week__c: "w2", Activity__c: "a2" }],
    locationTypes: [
      { Id: "lt1", Name: "Waterfront" },
      { Id: "lt2", Name: "Unused type" }
    ],
    locations: [
      {
        Id: "l1",
        Name: "Pool",
        GroupsThatFit__c: 2,
        LocationType__c: "lt1",
        Notes__c: "=Shallow end"
      },
      { Id: "l2", Name: "Gym", GroupsThatFit__c: 1 }
    ],
    activities: [
      {
        Id: "a1",
        Name: "Swim",
        Location__c: "l1",
        Length__c: 2,
        TimesPerWeekMin__c: 2,
        TimesPerWeekMax__c: 3,
        NoWeeklyMax__c: false,
        Priority__c: "High",
        Outdoor__c: true,
        RainPlan__c: "a2",
        GroupsAtOnce__c: 2,
        NoGroupLimit__c: false,
        SameDivisionOnly__c: true,
        EarlyWeekCount__c: 1,
        EarlyWeekByDay__c: "Wednesday",
        Notes__c: "+Bring towels",
        Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g3" }]
      },
      {
        Id: "a2",
        Name: "Board games",
        Length__c: 1,
        TimesPerWeekMin__c: 0,
        NoWeeklyMax__c: true,
        Priority__c: "Low",
        Outdoor__c: false,
        NoGroupLimit__c: true,
        Eligibilities__r: []
      }
    ],
    programs: [
      program("p1", "Main", DAYS, {
        timeBlocks: [
          block("tb1", "Period 1", 9, 0, 9, 45, "Morning"),
          block("tb2", "Lunch", 12, 0, 12, 45, "Afternoon")
        ],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" },
              { Id: "g2", Name: "Bunk 2", Availability__c: "MorningOnly" }
            ]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g3", Name: "Bunk 3", Availability__c: "AllDay" }]
          }
        ],
        fixedActivities: [
          {
            Id: "f1",
            Name: "Lunch",
            TimeBlock__c: "tb2",
            Length__c: 1,
            Location__c: "l2"
          }
        ],
        recurringActivities: [
          {
            Id: "r1",
            Name: "Meeting",
            TimeBlock__c: "tb1",
            Length__c: 1,
            Monday__c: true,
            Wednesday__c: true,
            Coverages__r: [{ Division__c: "d2" }]
          }
        ]
      }),
      program("p2", "Teens", ["Monday", "Tuesday"], {
        timeBlocks: [block("tb3", "Period 1", 10, 0, 10, 50, "Morning")],
        divisions: [
          {
            division: { Id: "d3", Name: "Juniors" },
            groups: [
              { Id: "g4", Name: "Bunk 1", Availability__c: "AfternoonOnly" }
            ]
          }
        ],
        fixedActivities: [
          { Id: "f2", Name: "Lunch", TimeBlock__c: "tb3", Length__c: 1 }
        ],
        recurringActivities: []
      })
    ]
  };
}

const terms = buildTerms(camp().labels);

/** Writes sheets to an .xlsx and reads it back as the import does. */
function roundTrip(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName(name)
    );
  });
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return workbookFile(XLSX, "camp.xlsx", new Uint8Array(data));
}

function expectNoChanges(screenKey, file) {
  const p = listProposal({
    screenKey,
    file,
    setup: camp(),
    terms,
    answers: {}
  });
  expect([screenKey, p.rows.filter((r) => r.status !== "unchanged")]).toEqual([
    screenKey,
    []
  ]);
  expect(questionCards(p, terms, {})).toEqual([]);
  expect(waitingFor(p, terms, {})).toEqual(["Nothing to change"]);
  return p;
}

describe("round trip", () => {
  LIST_SCREENS.forEach((screenKey) => {
    it(`${screenKey}: "Download this list" reads back with no changes`, () => {
      const rows = listRows(screenKey, camp(), terms);
      const p = expectNoChanges(screenKey, roundTrip([{ name: "List", rows }]));
      expect(p.rows.length).toBeGreaterThan(0);
    });
  });

  it("the camp workbook: every screen finds its own sheet and reads back with no changes", () => {
    const file = roundTrip(campWorkbookSheets(camp(), terms));
    expect(file.sheets.map((s) => s.name)).toEqual([
      "Programs",
      "Units",
      "Bunks",
      "Time blocks",
      "Locations",
      "Activities",
      "Fixed activities",
      "Recurring activities",
      "Location types",
      "Camp words",
      "Weeks",
      "Runs in"
    ]);
    LIST_SCREENS.forEach((screenKey) => expectNoChanges(screenKey, file));
  });

  it("names two programs share are written with what tells them apart", () => {
    const rows = listRows("activities", camp(), terms);
    const who = rows[0].indexOf("Who can do it");
    expect(rows[1][who]).toBe("Bunk 3, Juniors (Main)");
  });

  it("text a spreadsheet would run is written with an apostrophe, and read back without", () => {
    const rows = listRows("locations", camp(), terms);
    expect(rows[1]).toEqual(["Pool", "Waterfront", 2, "'=Shallow end"]);
  });

  it("the extra sheets carry what has no list: types, words, weeks, and the weeks items run", () => {
    const sheets = Object.fromEntries(
      campWorkbookSheets(camp(), terms).map((s) => [s.name, s.rows])
    );
    expect(sheets["Location types"]).toEqual([
      ["Location type"],
      ["Waterfront"],
      ["Unused type"]
    ]);
    expect(sheets["Camp words"]).toEqual([
      ["Shoresh word", "Camp word", "Camp word (more than one)"],
      ["Group", "Bunk", "Bunks"],
      ["Division", "Unit", "Units"]
    ]);
    expect(sheets.Weeks[1]).toEqual(["Week 1", "2027-06-28", "2027-07-02"]);
    expect(sheets["Runs in"][0]).toEqual([
      "Kind",
      "Program",
      "Name",
      "Week 1",
      "Week 2"
    ]);
    expect(sheets["Runs in"]).toContainEqual([
      "Activity",
      "",
      "Board games",
      "Yes",
      "No"
    ]);
  });
});

describe("an empty list is the template", () => {
  it("headings only, in the camp's words", () => {
    const empty = { ...camp(), activities: [], locations: [], programs: [] };
    expect(listRows("groups", empty, terms)).toEqual([
      ["Program", "Unit", "Bunk", "Availability"]
    ]);
  });
});
