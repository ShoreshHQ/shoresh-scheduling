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
} from "./data/lists";

import { at, camp } from "./data/camp";

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

describe("PR C own review: what the probes found", () => {
  function back(screenKey, setup, t = terms) {
    const file = roundTrip([
      { name: "List", rows: listRows(screenKey, setup, t) }
    ]);
    const p = listProposal({ screenKey, file, setup, terms: t, answers: {} });
    return {
      changed: p.rows.filter((r) => r.status !== "unchanged"),
      questions: questionCards(p, t, {}).map((c) => c.title)
    };
  }

  it("a bunk whose name leaves a bracket open reads back in a who list", () => {
    const s = camp();
    s.programs[0].divisions[0].groups.push({
      Id: "g9",
      Name: "Bunk (A",
      Availability__c: "AllDay"
    });
    s.activities[1].Eligibilities__r = [{ Group__c: "g9" }, { Group__c: "g1" }];
    expect(back("activities", s)).toEqual({ changed: [], questions: [] });
  });

  it("notes longer than a spreadsheet cell holds are refused, naming the item, never cut", () => {
    const s = camp();
    s.locations[1].Notes__c = "x".repeat(32768);
    expect(() => listRows("locations", s, terms)).toThrow(
      "Notes for “Gym” is longer than a spreadsheet cell holds."
    );
    // The apostrophe the guard adds counts too.
    s.locations[1].Notes__c = `=${"x".repeat(32766)}`;
    expect(() => listRows("locations", s, terms)).toThrow("“Gym”");
    s.locations[1].Notes__c = "x".repeat(32767);
    expect(() => listRows("locations", s, terms)).not.toThrow();
  });

  it("notes with Windows line breaks, or only spaces, read back unchanged", () => {
    const s = camp();
    s.locations[1].Notes__c = "One\r\nTwo";
    s.locations.push({
      Id: "l5",
      Name: "Barn",
      GroupsThatFit__c: 1,
      Notes__c: "   "
    });
    expect(back("locations", s)).toEqual({ changed: [], questions: [] });
  });

  it("a name starting with two apostrophes before = reads back as it is", () => {
    const s = camp();
    s.locations[1].Name = "''=Gym";
    expect(back("locations", s)).toEqual({ changed: [], questions: [] });
  });

  it.each([
    ["Kids'", "Kids"],
    ["'Quoted'", "Quoted"],
    ["History", "History sheet"],
    ["history", "history sheet"],
    [`${"a".repeat(30)}\u{1F600}`, "a".repeat(30)],
    ["''", "Sheet"]
  ])("sheet name %s becomes %s", (name, expected) => {
    expect(sheetName(name)).toBe(expected);
  });

  it("camp words ending in an apostrophe or called History still make a workbook", () => {
    const t = buildTerms([
      {
        term: "Group",
        modelSingular: "Group",
        singular: "Kid",
        plural: "Kids'",
        isCustom: true
      },
      {
        term: "Activity",
        modelSingular: "Activity",
        singular: "History",
        plural: "History",
        isCustom: true
      }
    ]);
    const file = roundTrip(campWorkbookSheets(camp(), t));
    expect(file.sheets.map((x) => x.name)).toEqual(
      expect.arrayContaining(["Kids", "History sheet"])
    );
    ["groups", "activities"].forEach((screenKey) => {
      const p = listProposal({
        screenKey,
        file,
        setup: camp(),
        terms: t,
        answers: {}
      });
      expect(p.rows.filter((r) => r.status !== "unchanged")).toEqual([]);
    });
  });

  it("two weeks of one name are told apart on Runs in by their start dates", () => {
    const s = camp();
    s.weeks[1].Name = "Week 1";
    const runsIn = campWorkbookSheets(s, terms).find(
      (x) => x.name === "Runs in"
    ).rows[0];
    expect(runsIn.slice(4)).toEqual([
      "Week 1 (2027-06-28)",
      "Week 1 (2027-07-05)"
    ]);
  });

  it("two activities of exactly one name are asked which is which: shown, never guessed (a known limit)", () => {
    const s = camp();
    s.activities.push({ ...s.activities[1], Id: "a8" });
    expect(back("activities", s).questions).toContain("Which “Board games”?");
  });
});

// What each download says for the made-up camp, cell by cell: every field read from the season
// as the package sends it (a round trip alone would read a misnamed field the same way twice).
const DOWNLOADS = {
  programs: [
    ["Program", "Runs on"],
    ["Main", "Monday, Tuesday, Wednesday, Thursday, Friday"],
    ["Teens", "Monday, Tuesday"]
  ],
  divisions: [
    ["Program", "Unit"],
    ["Main", "Juniors"],
    ["Main", "Seniors"],
    ["Teens", "Juniors"]
  ],
  groups: [
    ["Program", "Unit", "Bunk", "Availability"],
    ["Main", "Juniors", "Bunk 1", "All day"],
    ["Main", "Juniors", "Bunk 2", "Morning only"],
    ["Main", "Seniors", "Bunk 3", "All day"],
    ["Teens", "Juniors", "Bunk 1", "Afternoon only"]
  ],
  timeBlocks: [
    ["Program", "Time block", "Start", "End", "Part of day"],
    ["Main", "Period 1", "9:00 AM", "9:45 AM", "Morning"],
    ["Main", "Lunch", "12:00 PM", "12:45 PM", "Afternoon"],
    ["Teens", "Period 1", "10:00 AM", "10:50 AM", "Morning"]
  ],
  locations: [
    ["Location", "Location type", "Groups that fit", "Notes"],
    ["Pool", "Waterfront", 2, "'=Shallow end"],
    ["Gym", "", 1, ""]
  ],
  activities: [
    [
      "Activity",
      "Location",
      "Length",
      "Times per week: at least",
      "Times per week: at most",
      "Priority",
      "Outdoors",
      "Rain plan",
      "Groups at once",
      "Same Unit only",
      "Early in the week",
      "Who can do it",
      "Notes"
    ],
    [
      "Swim",
      "Pool",
      2,
      2,
      3,
      "High",
      "Yes",
      "Board games",
      2,
      "Yes",
      "1 by Wednesday",
      "Bunk 3, Juniors (Main)",
      "'+Bring towels"
    ],
    [
      "Board games",
      "",
      1,
      0,
      "No maximum",
      "Low",
      "No",
      "",
      "No limit",
      "No",
      "",
      "Everyone",
      ""
    ]
  ],
  fixedActivities: [
    ["Program", "Fixed activity", "Time block", "Length", "Location"],
    ["Main", "Lunch", "Lunch", 1, "Gym"],
    ["Teens", "Lunch", "Period 1", 1, ""]
  ],
  recurringActivities: [
    [
      "Program",
      "Recurring activity",
      "Time block",
      "Length",
      "Location",
      "Runs on",
      "Who"
    ],
    [
      "Main",
      "Meeting",
      "Period 1",
      1,
      "",
      "Monday, Wednesday",
      '"Bunk 1 (Juniors, Main)", Seniors'
    ]
  ]
};

const WORKBOOK_WEEKS = [
  {
    name: "Weeks",
    rows: [
      ["Week", "Start", "End"],
      ["Week 1", "2027-06-28", "2027-07-02"],
      ["Week 2", "2027-07-05", "2027-07-09"]
    ]
  },
  {
    name: "Runs in",
    rows: [
      ["Kind", "Program", "Unit", "Name", "Week 1", "Week 2"],
      ["Bunk", "Main", "Juniors", "Bunk 1", "Yes", "Yes"],
      ["Bunk", "Main", "Juniors", "Bunk 2", "No", "Yes"],
      ["Bunk", "Main", "Seniors", "Bunk 3", "Yes", "Yes"],
      ["Fixed activity", "Main", "", "Lunch", "Yes", "Yes"],
      ["Recurring activity", "Main", "", "Meeting", "Yes", "No"],
      ["Bunk", "Teens", "Juniors", "Bunk 1", "Yes", "Yes"],
      ["Fixed activity", "Teens", "", "Lunch", "No", "Yes"],
      ["Location", "", "", "Pool", "Yes", "Yes"],
      ["Location", "", "", "Gym", "Yes", "No"],
      ["Activity", "", "", "Swim", "Yes", "Yes"],
      ["Activity", "", "", "Board games", "Yes", "No"]
    ]
  }
];

describe("the downloads say the season as it is", () => {
  it("every screen's list", () => {
    LIST_SCREENS.forEach((screenKey) => {
      expect([screenKey, listRows(screenKey, camp(), terms)]).toEqual([
        screenKey,
        DOWNLOADS[screenKey]
      ]);
    });
  });

  it("the workbook's weeks and the weeks each item runs in", () => {
    expect(
      campWorkbookSheets(camp(), terms).filter((sheet) =>
        ["Weeks", "Runs in"].includes(sheet.name)
      )
    ).toEqual(WORKBOOK_WEEKS);
  });
});
