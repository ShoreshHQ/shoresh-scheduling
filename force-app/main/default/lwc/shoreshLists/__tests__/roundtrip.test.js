// Slice 4c part C: whatever Shoresh writes reads back with no changes (Greg, #5), for every
// screen's list and for the camp workbook. A made-up camp with two programs, so names that two
// programs share are written so they can't be mistaken.
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import { workbookFile } from "c/shoreshImportEngine";
import { listName, splitList } from "../cells";
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
      "Unit",
      "Name",
      "Week 1",
      "Week 2"
    ]);
    expect(sheets["Runs in"]).toContainEqual([
      "Bunk",
      "Main",
      "Juniors",
      "Bunk 1",
      "Yes",
      "Yes"
    ]);
    expect(sheets["Runs in"]).toContainEqual([
      "Activity",
      "",
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

describe("PR C review: harder values still read back unchanged", () => {
  function roundTripOf(screenKey, setup) {
    const file = roundTrip([
      { name: "List", rows: listRows(screenKey, setup, terms) }
    ]);
    return listProposal({ screenKey, file, setup, terms, answers: {} });
  }

  it("notes with line breaks, double spaces, leading spaces, and an apostrophe before =", () => {
    const s = camp();
    s.locations[1].Notes__c = "Line one\nLine two";
    s.locations.push({
      Id: "l3",
      Name: "Barn",
      GroupsThatFit__c: 1,
      Notes__c: "  a  b"
    });
    s.locations.push({
      Id: "l4",
      Name: "Shed",
      GroupsThatFit__c: 1,
      Notes__c: "'=x"
    });
    const p = roundTripOf("locations", s);
    expect(p.rows.filter((r) => r.status !== "unchanged")).toEqual([]);
  });

  it("two activities whose names differ only in capitals stay two", () => {
    const s = camp();
    s.activities.push({ ...s.activities[1], Id: "a9", Name: "board games" });
    const p = roundTripOf("activities", s);
    expect(p.rows.map((r) => [r.name, r.status, r.id])).toEqual([
      ["Swim", "unchanged", "a1"],
      ["Board games", "unchanged", "a2"],
      ["board games", "unchanged", "a9"]
    ]);
  });

  it("a bunk named with a comma, or named Everyone, reads back in a who list", () => {
    const s = camp();
    s.programs[0].divisions[1].groups.push({
      Id: "g7",
      Name: "Bunk 3, Boys",
      Availability__c: "AllDay"
    });
    s.programs[0].divisions[1].groups.push({
      Id: "g8",
      Name: "Everyone",
      Availability__c: "AllDay"
    });
    s.activities[1].Eligibilities__r = [{ Group__c: "g7" }, { Group__c: "g8" }];
    const p = roundTripOf("activities", s);
    expect(p.rows.filter((r) => r.status !== "unchanged")).toEqual([]);
    expect(questionCards(p, terms, {})).toEqual([]);
  });

  it("a name with a double space matches the item set up", () => {
    const s = camp();
    s.activities[1].Name = "Board  games";
    const p = roundTripOf("activities", s);
    expect(p.rows.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("camp words that make two sheets alike: names stay unique, each screen finds its own", () => {
    const words = buildTerms([
      {
        term: "Group",
        modelSingular: "Group",
        singular: "Cabin",
        plural: "Cabins",
        isCustom: true
      },
      {
        term: "Division",
        modelSingular: "Division",
        singular: "Cabin",
        plural: "Cabins",
        isCustom: true
      }
    ]);
    const sheets = campWorkbookSheets(camp(), words);
    const names = sheets.map((x) => x.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const file = roundTrip(sheets);
    ["divisions", "groups"].forEach((screenKey) => {
      const p = listProposal({
        screenKey,
        file,
        setup: camp(),
        terms: words,
        answers: {}
      });
      expect([
        screenKey,
        p.rows.filter((r) => r.status !== "unchanged")
      ]).toEqual([screenKey, []]);
    });
  });
});

// Coordinator, before opening PR C: odd names, the camp's own words for everything, and empty
// lists against full ones. Every download reads back with no changes and no questions.
describe("adversarial downloads read back with nothing to do", () => {
  const word = (term, singular, plural) => ({
    term,
    modelSingular: term,
    singular,
    plural,
    isCustom: true
  });
  const oddTerms = buildTerms([
    word("Program", "Session", "Sessions"),
    word("Division", "Village", "Villages"),
    word("Group", "Cabin", "Cabins"),
    word("TimeBlock", "Period", "Periods"),
    word("Location", "Spot", "Spots"),
    word("LocationType", "Area", "Areas"),
    word("Activity", "Elective", "Electives"),
    word("FixedActivity", "Anchor", "Anchors"),
    word("RecurringActivity", "Routine", "Routines"),
    word("Week", "Session week", "Session weeks")
  ]);

  function oddCamp() {
    const s = camp();
    const [main, teens] = s.programs;
    main.program.Name = 'Main, "East"';
    teens.program.Name = "Teens|Late";
    teens.program.Thursday__c = true;
    main.divisions[0].division.Name = "=Juniors";
    main.divisions[1].division.Name = "Seniors, Boys";
    main.divisions[0].groups[0].Name = "+Bunk 1";
    main.divisions[0].groups[1].Name = "Bunk|2";
    main.divisions[1].groups[0].Name = '@Bunk "3"';
    teens.divisions[0].division.Name = "-Juniors";
    main.timeBlocks[0].Name = "@Period 1";
    main.timeBlocks[1].Name = "Lunch, hot";
    // A 5 o'clock block: written with PM, never asked on the way back.
    main.timeBlocks.push({
      Id: "tb9",
      Name: "Late, pickup",
      StartTime__c: at(17, 0),
      EndTime__c: at(17, 30),
      PartOfDay__c: "Afternoon"
    });
    s.locationTypes[0].Name = "Water, front";
    s.locations[0].Name = "-Pool";
    s.locations[1].Name = 'Gym "B"';
    s.activities[0].Name = "Swim|Laps";
    s.activities[1].Name = "=Board games";
    main.fixedActivities[0].Name = "+Lunch";
    teens.fixedActivities[0].Name = "Lunch, Teens";
    // Days that would be asked if written with a dash: written as names.
    main.recurringActivities[0].Name = '"Meeting", all';
    main.recurringActivities[0].Monday__c = false;
    main.recurringActivities[0].Wednesday__c = false;
    main.recurringActivities[0].Tuesday__c = true;
    main.recurringActivities[0].Thursday__c = true;
    return s;
  }

  function readBack(screenKey, file, setup, t) {
    const p = listProposal({ screenKey, file, setup, terms: t, answers: {} });
    return {
      changed: p.rows
        .filter((r) => r.status !== "unchanged")
        .map((r) => [r.rowNumber, r.name, r.status, r.problems]),
      questions: questionCards(p, t, {}).map((c) => c.title),
      rows: p.rows.length
    };
  }

  [
    ["the default words", terms],
    ["the camp's own words", oddTerms]
  ].forEach(([label, t]) => {
    LIST_SCREENS.forEach((screenKey) => {
      it(`${screenKey}, odd names, ${label}: this list`, () => {
        const s = oddCamp();
        const file = roundTrip([
          { name: "List", rows: listRows(screenKey, s, t) }
        ]);
        const back = readBack(screenKey, file, s, t);
        expect([screenKey, back.changed, back.questions]).toEqual([
          screenKey,
          [],
          []
        ]);
        expect(back.rows).toBeGreaterThan(0);
      });
    });

    it(`the camp workbook, odd names, ${label}`, () => {
      const s = oddCamp();
      const file = roundTrip(campWorkbookSheets(s, t));
      LIST_SCREENS.forEach((screenKey) => {
        const back = readBack(screenKey, file, s, t);
        expect([screenKey, back.changed, back.questions]).toEqual([
          screenKey,
          [],
          []
        ]);
      });
    });
  });

  it("camp words a sheet name can't hold (a slash, past 31 letters): each screen still finds its sheet", () => {
    const t = buildTerms([
      word("Activity", "Art/Craft", "Arts/Crafts"),
      word(
        "RecurringActivity",
        "Every-single-week happening",
        "Every-single-week happenings at camp"
      ),
      word("FixedActivity", "Anchor", "Anchors")
    ]);
    const s = oddCamp();
    const file = roundTrip(campWorkbookSheets(s, t));
    LIST_SCREENS.forEach((screenKey) => {
      const back = readBack(screenKey, file, s, t);
      expect([screenKey, back.changed, back.questions]).toEqual([
        screenKey,
        [],
        []
      ]);
    });
  });

  it("a quote inside a quoted list name is written twice and read back once", () => {
    expect(listName('@Bunk "3"')).toBe('"@Bunk ""3"""');
    expect(splitList('"@Bunk ""3""", Bunk 1')).toEqual(['@Bunk "3"', "Bunk 1"]);
  });

  it("formula-like names are written with an apostrophe and read back without", () => {
    const rows = listRows("activities", oddCamp(), terms);
    expect(rows.map((r) => r[0])).toContain("'=Board games");
  });

  LIST_SCREENS.forEach((screenKey) => {
    it(`${screenKey}: an empty camp's list reads back as nothing, asking nothing`, () => {
      const empty = {
        ...camp(),
        locationTypes: [],
        locations: [],
        activities: [],
        programs: []
      };
      const rows = listRows(screenKey, empty, oddTerms);
      expect(rows.length).toBe(1);
      const back = readBack(
        screenKey,
        roundTrip([{ name: "List", rows }]),
        empty,
        oddTerms
      );
      expect([back.rows, back.questions]).toEqual([0, []]);
    });

    it(`${screenKey}: a full list read into an empty camp adds, and asks only what it must`, () => {
      const empty = {
        ...camp(),
        locationTypes: [],
        locations: [],
        activities: [],
        programs: []
      };
      const rows = listRows(screenKey, oddCamp(), oddTerms);
      const back = readBack(
        screenKey,
        roundTrip([{ name: "List", rows }]),
        empty,
        oddTerms
      );
      expect(back.changed.length).toBe(rows.length - 1);
      // Nothing can't be read: odd names are names.
      expect(back.changed.filter((c) => c[3].length)).toEqual([]);
    });
  });
});
