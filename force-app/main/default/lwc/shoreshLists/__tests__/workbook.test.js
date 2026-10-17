// Slice 4c part D: the camp workbook, imported on Roots in one go.
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import { workbookFile } from "c/shoreshImportEngine";
import {
  campWorkbookSheets,
  findSheets,
  sheetName,
  workbookCards,
  workbookPlan,
  workbookProposal,
  workbookWaiting
} from "c/shoreshLists";
import { camp } from "./data/camp";

function file(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) =>
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName(name)
    )
  );
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return workbookFile(XLSX, "camp.xlsx", new Uint8Array(data));
}

const labelsOf = (s) => s.labels;

function propose(setup, workbook, answers = {}) {
  return workbookProposal({
    file: workbook,
    setup,
    terms: buildTerms(labelsOf(setup)),
    labels: labelsOf(setup),
    answers
  });
}

function notUnchanged(p) {
  return p.sections.flatMap((s) =>
    (s.extra ? s.rows : s.proposal.rows || [])
      .filter((r) => r.status !== "unchanged")
      .map((r) => [s.key, r.rowNumber, r.name, r.status, r.problems])
  );
}

describe("the camp's own workbook", () => {
  it("finds every sheet by what it holds", () => {
    const s = camp();
    const found = findSheets(
      file(campWorkbookSheets(s, buildTerms(s.labels))),
      buildTerms(s.labels)
    );
    expect(found).toEqual({
      campWords: "Camp words",
      weeks: "Weeks",
      runsIn: "Runs in",
      lists: {
        programs: "Programs",
        divisions: "Units",
        groups: "Bunks",
        timeBlocks: "Time blocks",
        locationTypes: "Location types",
        locations: "Locations",
        activities: "Activities",
        fixedActivities: "Fixed activities",
        recurringActivities: "Recurring activities"
      },
      unused: []
    });
  });

  it("reads back with nothing to do", () => {
    const s = camp();
    const p = propose(s, file(campWorkbookSheets(s, buildTerms(s.labels))));
    expect(notUnchanged(p)).toEqual([]);
    expect(workbookCards(p, {})).toEqual([]);
    expect(workbookWaiting(p, {})).toEqual(["Nothing to change"]);
    expect(workbookPlan(p, {}).records).toEqual([]);
  });
});

/** A fresh season of the same camp: its weeks only, nothing set up, Shoresh's own words. */
function freshSeason() {
  const s = camp();
  return {
    season: { Id: "s2", Camp__c: "c1", Name: "Summer 2028" },
    labels: s.labels.map((l) => ({
      ...l,
      singular: l.modelSingular,
      plural: `${l.modelSingular}s`,
      isCustom: false
    })),
    weeks: s.weeks.map((w) => ({ ...w, Id: `${w.Id}-new` })),
    weekExceptions: [],
    locationTypes: [],
    locations: [],
    activities: [],
    programs: []
  };
}

/** Every link in the request names a record in it, or one set up. */
function linksResolve(plan) {
  const keys = new Set(plan.records.map((r) => r.key).filter((k) => k));
  const bad = [];
  plan.records.forEach((r) => {
    const links = [...Object.values(r.refs || {}), ...(r.who || [])];
    links
      .filter((v) => typeof v === "string" && v.includes(":"))
      .forEach((v) => {
        if (!keys.has(v)) bad.push([r.key || r.id, v]);
      });
  });
  return bad;
}

describe("rebuilding a camp in a fresh season", () => {
  it("adds everything, asks only about the camp's words, and every link resolves", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const s = freshSeason();
    const p = propose(s, workbook);
    expect(workbookCards(p, {}).map((c) => c.title)).toEqual([]);
    expect(
      p.sections
        .find((x) => x.key === "campWords")
        .rows.map((r) => [r.name, r.status])
    ).toEqual([
      ["Group", "changed"],
      ["Division", "changed"]
    ]);
    expect(workbookWaiting(p, {})).toEqual(["Camp words: Keep or Change"]);
    const answers = {};
    p.sections
      .find((x) => x.key === "campWords")
      .rows.forEach((r) =>
        r.differences.forEach((d) => {
          answers[d.id] = "change";
        })
      );
    const done = propose(s, workbook, answers);
    expect(workbookWaiting(done, answers)).toEqual([]);
    const plan = workbookPlan(done, answers);
    expect(linksResolve(plan)).toEqual([]);
    const count = (kind) => plan.records.filter((r) => r.kind === kind).length;
    expect({
      Program: count("Program"),
      Division: count("Division"),
      Group: count("Group"),
      TimeBlock: count("TimeBlock"),
      LocationType: count("LocationType"),
      Location: count("Location"),
      Activity: count("Activity"),
      FixedActivity: count("FixedActivity"),
      RecurringActivity: count("RecurringActivity"),
      Week: count("Week"),
      WeekException: count("WeekException")
    }).toEqual({
      Program: 2,
      Division: 3,
      Group: 4,
      TimeBlock: 3,
      LocationType: 2,
      Location: 2,
      Activity: 2,
      FixedActivity: 2,
      RecurringActivity: 1,
      Week: 0,
      WeekException: 1
    });
    expect(plan.campWords).toEqual([
      {
        kind: "CampLabel",
        term: "Group",
        fields: { Singular__c: "Bunk", Plural__c: "Bunks" }
      },
      {
        kind: "CampLabel",
        term: "Division",
        fields: { Singular__c: "Unit", Plural__c: "Units" }
      }
    ]);
    // Board games is off in week 2, as it was.
    expect(plan.records.find((r) => r.kind === "WeekException").refs).toEqual({
      Week__c: "w2-new",
      Activity__c: "Activity:Board games"
    });
  });
});

/** The camp's own workbook as sheets, one changed by edit(rowsBySheetName). */
function edited(s, edit) {
  const sheets = campWorkbookSheets(s, buildTerms(s.labels));
  const byName = Object.fromEntries(sheets.map((x) => [x.name, x.rows]));
  edit(byName);
  return file(sheets.map((x) => ({ name: x.name, rows: byName[x.name] })));
}

describe("a camp's workbook, edited", () => {
  it("a week renamed is a Keep or Change; its new name heads Runs in too", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks[1][0] = "Opening week";
        sheets["Runs in"][0][4] = "Opening week";
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks");
    expect(
      weeks.rows[0].differences.map((d) => [d.heading, d.from, d.to])
    ).toEqual([["Name", "Week 1", "Opening week"]]);
    expect(notUnchanged(p)).toEqual([
      ["weeks", 2, "Opening week", "changed", []]
    ]);
    const answers = { [weeks.rows[0].differences[0].id]: "change" };
    function workbook(x) {
      return edited(x, (sheets) => {
        sheets.Weeks[1][0] = "Opening week";
        sheets["Runs in"][0][4] = "Opening week";
      });
    }
    const done = propose(s, workbook(s), answers);
    expect(workbookPlan(done, answers).records).toEqual([
      { kind: "Week", id: "w1", fields: { Name: "Opening week" } }
    ]);
  });

  it("a tick changed on Runs in is a Keep or Change, both ways", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        const rows = sheets["Runs in"];
        const games = rows.find((r) => r[3] === "Board games");
        games[5] = "Yes";
        const swim = rows.find((r) => r[3] === "Swim");
        swim[4] = "No";
      })
    );
    const runsIn = p.sections.find((x) => x.key === "runsIn");
    const changed = runsIn.rows.filter((r) => r.status === "changed");
    expect(changed.map((r) => [r.name, r.differences[0].text])).toEqual([
      ["Swim", "Runs in: Week 1: Yes → No"],
      ["Board games", "Runs in: Week 2: No → Yes"]
    ]);
    expect(workbookWaiting(p, {})).toEqual(["Runs in: Keep or Change"]);
    const answers = {};
    changed.forEach((r) => {
      answers[r.differences[0].id] = "change";
    });
    const plan = workbookPlan(
      propose(
        s,
        edited(s, (sheets) => {
          const rows = sheets["Runs in"];
          rows.find((r) => r[3] === "Board games")[5] = "Yes";
          rows.find((r) => r[3] === "Swim")[4] = "No";
        }),
        answers
      ),
      answers
    );
    expect(plan.records).toEqual([
      {
        kind: "WeekException",
        key: "WeekException:a1:w1",
        fields: {},
        refs: { Week__c: "w1", Activity__c: "a1" }
      },
      { kind: "WeekException", id: "x1", remove: true, fields: {} }
    ]);
  });

  it("finds a sheet renamed, or named by a camp word twice, by what it holds", () => {
    const s = camp();
    const sheets = campWorkbookSheets(s, buildTerms(s.labels)).map((x) => ({
      ...x,
      name:
        x.name === "Weeks"
          ? "Weeks (2)"
          : x.name === "Bunks"
            ? "Sheet7"
            : x.name
    }));
    const found = findSheets(file(sheets), buildTerms(s.labels));
    expect([found.weeks, found.lists.groups]).toEqual(["Weeks (2)", "Sheet7"]);
  });

  it("a sheet nothing reads is shown, never guessed", () => {
    const s = camp();
    const workbook = file([
      ...campWorkbookSheets(s, buildTerms(s.labels)),
      { name: "Notes", rows: [["Remember"], ["Bring sunscreen"]] }
    ]);
    const p = propose(s, workbook);
    expect(p.unused).toEqual(["Notes"]);
    expect(workbookWaiting(p, {})).toEqual(["Nothing to change"]);
  });

  it.each([
    ["7/5/2027", ['Start: "7/5/2027" could be read two ways']],
    ["Jul 5, 2027", []],
    ["5-Jul-27", []],
    ["2027-07-05", []],
    ["2027-02-30", ['Start: "2027-02-30" isn\'t a date']]
  ])("reads a start date %s only when certain", (start, problems) => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.push(["Week 3", start, "2027-07-09"]);
      })
    );
    const row = p.sections.find((x) => x.key === "weeks").rows[2];
    expect(row.problems.filter((x) => x.startsWith("Start"))).toEqual(problems);
  });

  it("a column of dates that shows its order reads the rest that way", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks[1] = ["Week 1", "6/28/2027", "7/2/2027"];
        sheets.Weeks[2] = ["Week 2", "7/5/2027", "7/9/2027"];
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.start, r.end, r.status])).toEqual([
      ["2027-06-28", "2027-07-02", "unchanged"],
      ["2027-07-05", "2027-07-09", "unchanged"]
    ]);
  });

  it("a Runs in row naming nothing, or a week not in the workbook, can't be read", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets["Runs in"].push(["Activity", "", "", "Kayak", "Yes", "Yes"]);
        sheets["Runs in"][0].push("Week 9");
        sheets["Runs in"].slice(1).forEach((r) => r.push("Yes"));
      })
    );
    const rows = p.sections.find((x) => x.key === "runsIn").rows;
    expect(rows.find((r) => r.name === "Kayak").problems).toEqual([
      '"Week 9" isn\'t a week in the workbook',
      "No activity “Kayak”"
    ]);
  });
});
