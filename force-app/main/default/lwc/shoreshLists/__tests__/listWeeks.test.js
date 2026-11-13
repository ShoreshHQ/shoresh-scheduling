// INGEST-1.8: "Download this list" writes every field its screen shows, in the screen's words,
// and reads back through the screen's own Import a list with nothing to change; a week taken off
// or put back, and a fixed activity's early start changed, are exactly what it shows. Made-up
// camp only (data/camp.js).
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import { setDayNaming } from "c/shoreshDayNames";
import { workbookFile } from "c/shoreshImportEngine";
import {
  CHANGE,
  LIST_SCREENS,
  campWorkbookSheets,
  listPlan,
  listProposal,
  listRows,
  questionCards,
  sheetName,
  waitingFor
} from "./data/lists";
import { camp } from "./data/camp";

const terms = buildTerms(camp().labels);

/** The camp, with an elective set and the Special events screen's items too. */
function fullCamp() {
  return {
    ...camp(),
    electives: {
      sets: [{ Id: "es1", Name: "Chugim" }],
      offerings: [
        {
          Id: "o1",
          ElectiveSet__c: "es1",
          Activity__c: "a1",
          Seats__c: 12,
          NoSeatLimit__c: false,
          MinimumToRun__c: 2,
          Proposed__c: false
        }
      ]
    },
    special: {
      specialDays: [{ Id: "sd1", Name: "Color war", Notes__c: "All day" }],
      specialEvents: [{ Id: "se1", Name: "Carnival", Location__c: "l1" }]
    }
  };
}

// Every list a setup screen downloads and imports.
const EVERY_LIST = [...LIST_SCREENS, "electives", "specialEvents"];

/** Writes rows to an .xlsx and reads it back as Import a list does. */
function asFile(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows),
    sheetName("List")
  );
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return workbookFile(XLSX, "list.xlsx", new Uint8Array(data));
}

function readBack(screenKey, rows, setup = fullCamp(), answers = {}) {
  return listProposal({
    screenKey,
    file: asFile(rows),
    setup,
    terms,
    answers
  });
}

/**
 * Every difference answered Change, as "Use the file's for all" does: { p (read again with the
 * answers), answers }.
 */
function changeAll(screenKey, rows, setup) {
  const answers = changeAnswers(readBack(screenKey, rows, setup));
  return { p: readBack(screenKey, rows, setup, answers), answers };
}

function changeAnswers(p) {
  const answers = {};
  p.rows
    .filter((r) => r.status === "changed")
    .forEach((r) =>
      r.differences.forEach((d) => {
        answers[d.id] = CHANGE;
      })
    );
  return answers;
}

function cellOf(rows, name, heading, rowName) {
  const column = rows[0].indexOf(heading);
  const at = rows.findIndex(
    (r, i) => i > 0 && r[rows[0].indexOf(name)] === rowName
  );
  return { row: at, column };
}

describe("INGEST-1.8: Download this list reads back with nothing to change", () => {
  EVERY_LIST.forEach((screenKey) => {
    it(`INGEST-1.8: ${screenKey}: every row reads back unchanged, nothing asked or lost`, () => {
      const rows = listRows(screenKey, fullCamp(), terms);
      const p = readBack(screenKey, rows);
      expect(p.rows.length).toBe(rows.length - 1);
      expect([
        screenKey,
        p.rows.filter((r) => r.status !== "unchanged").map((r) => r.name)
      ]).toEqual([screenKey, []]);
      // Every column the download writes is one the import reads.
      expect(p.mapping.headings.filter((h) => !h.column)).toEqual([]);
      expect(questionCards(p, terms, {})).toEqual([]);
      expect(waitingFor(p, terms, {})).toEqual(["Nothing to change"]);
    });
  });

  it("INGEST-1.8: each list with weeks writes them as its screen says them", () => {
    const weeksOf = (screenKey) => {
      const rows = listRows(screenKey, fullCamp(), terms);
      const at = rows[0].indexOf("Weeks");
      return rows.slice(1).map((r) => r[at]);
    };
    expect(weeksOf("groups")).toEqual([
      "Every week",
      "Off Week 1",
      "Every week",
      "Every week"
    ]);
    // A place is closed, not off.
    expect(weeksOf("locations")).toEqual(["Every week", "Closed Week 2"]);
    expect(weeksOf("activities")).toEqual(["Every week", "Off Week 2"]);
    expect(weeksOf("fixedActivities")).toEqual(["Every week", "Off Week 1"]);
    expect(weeksOf("recurringActivities")).toEqual(["Off Week 2"]);
    // No weeks, and runs of weeks, as the screen writes them.
    const s = fullCamp();
    s.weeks.push({ Id: "w3", Name: "Week 3", StartDate__c: "2027-07-12" });
    s.weekExceptions.push(
      { Id: "x6", Week__c: "w1", Activity__c: "a2" },
      { Id: "x7", Week__c: "w3", Activity__c: "a2" },
      { Id: "x8", Week__c: "w1", Activity__c: "a1" },
      { Id: "x9", Week__c: "w2", Activity__c: "a1" }
    );
    const rows = listRows("activities", s, terms);
    const at = rows[0].indexOf("Weeks");
    expect(rows.slice(1).map((r) => r[at])).toEqual([
      "Off Weeks 1–2",
      "No weeks"
    ]);
    const p = readBack("activities", rows, s);
    expect(p.rows.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("INGEST-1.8: a fixed activity's early start is written as its details say it", () => {
    const rows = listRows("fixedActivities", fullCamp(), terms);
    expect(rows[0]).toEqual(
      expect.arrayContaining(["Starts earlier on", "Time blocks earlier"])
    );
    const main = rows.find((r) => r[0] === "Main");
    expect(main).toEqual(expect.arrayContaining(["Wednesday", 1]));
  });

  // WEEK-2.6
  it("INGEST-1.8: a numbered-days season writes the early day as Day 3 and reads it back unchanged", () => {
    setDayNaming({ numbered: true, firstDay: 1 });
    try {
      const rows = listRows("fixedActivities", fullCamp(), terms);
      const at = rows[0].indexOf("Starts earlier on");
      expect(rows[1][at]).toBe("Day 3");
      const p = readBack("fixedActivities", rows);
      expect(p.rows.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
    } finally {
      setDayNaming(null);
    }
  });

  it("INGEST-1.8: the camp workbook's lists leave the weeks to its Which weeks sheet", () => {
    const sheets = campWorkbookSheets(fullCamp(), terms);
    const lists = sheets.filter((s) => s.name !== "Which weeks");
    lists.forEach((s) => expect(s.rows[0]).not.toContain("Weeks"));
  });
});

describe("INGEST-1.8: a list's changed weeks and early start are exactly what it shows", () => {
  it("INGEST-1.8: a week taken off, a week put back, and an early start changed", () => {
    const s = fullCamp();
    const activities = listRows("activities", s, terms);
    // Swim off Week 1; Board games back on in Week 2.
    let at = cellOf(activities, "Activity", "Weeks", "Swim");
    activities[at.row][at.column] = "Off Week 1";
    at = cellOf(activities, "Activity", "Weeks", "Board games");
    activities[at.row][at.column] = "Every week";
    const p = readBack("activities", activities, s);
    expect(
      p.rows
        .filter((r) => r.status === "changed")
        .map((r) => [
          r.name,
          r.differences.map((d) => [d.heading, d.from, d.to])
        ])
    ).toEqual([
      ["Swim", [["Weeks", { off: [], of: 2 }, { off: [1], of: 2 }]]],
      ["Board games", [["Weeks", { off: [2], of: 2 }, { off: [], of: 2 }]]]
    ]);
    const edited = changeAll("activities", activities, s);
    expect(waitingFor(edited.p, terms, edited.answers)).toEqual([]);
    expect(listPlan(edited.p, edited.answers, "s1", "f").records).toEqual([
      {
        kind: "WeekException",
        key: "WeekException:a1:w1",
        fields: {},
        refs: { Week__c: "w1", Activity__c: "a1" }
      },
      { kind: "WeekException", id: "x1", remove: true, fields: {} }
    ]);

    // Lunch (Main) starts earlier on Thursday, by two time blocks; and is off Week 2.
    const fixed = listRows("fixedActivities", s, terms);
    const main = fixed.findIndex((r) => r[0] === "Main");
    fixed[main][fixed[0].indexOf("Starts earlier on")] = "Thu";
    fixed[main][fixed[0].indexOf("Time blocks earlier")] = 2;
    fixed[main][fixed[0].indexOf("Weeks")] = "Off Week 2";
    const q = readBack("fixedActivities", fixed, s);
    const changed = q.rows.filter((r) => r.status === "changed");
    expect(
      changed.map((r) => [
        r.programName,
        r.name,
        r.differences.map((d) => d.heading)
      ])
    ).toEqual([
      ["Main", "Lunch", ["Starts earlier on", "Time blocks earlier", "Weeks"]]
    ]);
    const all = changeAll("fixedActivities", fixed, s);
    const plan = listPlan(all.p, all.answers, "s1", "f");
    expect(plan.records).toEqual([
      {
        kind: "FixedActivity",
        id: "f1",
        fields: { EarlyDay__c: "Thursday", EarlyBlocks__c: 2 },
        refs: {}
      },
      {
        kind: "WeekException",
        key: "WeekException:f1:w2",
        fields: {},
        refs: { Week__c: "w2", FixedActivity__c: "f1" }
      }
    ]);
  });

  it("INGEST-1.8: a blank early day clears it; a new row's weeks come with it", () => {
    const s = fullCamp();
    const fixed = listRows("fixedActivities", s, terms);
    const main = fixed.findIndex((r) => r[0] === "Main");
    fixed[main][fixed[0].indexOf("Starts earlier on")] = "";
    fixed[main][fixed[0].indexOf("Time blocks earlier")] = "";
    fixed.push(["Main", "Swim test", "Period 1", 1, "", "", "", "Off Week 2"]);
    const all = changeAll("fixedActivities", fixed, s);
    const plan = listPlan(all.p, all.answers, "s1", "f");
    expect(plan.records).toEqual([
      expect.objectContaining({
        kind: "FixedActivity",
        id: "f1",
        fields: { EarlyDay__c: null, EarlyBlocks__c: null }
      }),
      expect.objectContaining({
        kind: "FixedActivity",
        key: "FixedActivity:p1:Swim test"
      }),
      {
        kind: "WeekException",
        key: "WeekException:FixedActivity:p1:Swim test:w2",
        fields: {},
        refs: { Week__c: "w2", FixedActivity__c: "FixedActivity:p1:Swim test" }
      }
    ]);
  });

  it("INGEST-1.8: a week the season doesn't have, or words that aren't weeks, can't be read", () => {
    const s = fullCamp();
    const groups = listRows("groups", s, terms);
    groups[1][groups[0].indexOf("Weeks")] = "Off Week 5";
    groups[2][groups[0].indexOf("Weeks")] = "Sometimes";
    const p = readBack("groups", groups, s);
    expect(p.rows.slice(0, 2).map((r) => r.problems)).toEqual([
      ["Weeks: there's no Week 5"],
      ['Weeks: "Sometimes" isn\'t like "Every week" or "Off Week 2"']
    ]);
  });

  it("INGEST-1.8: only the Weeks heading the list writes is its weeks column", () => {
    const s = fullCamp();
    ["Runs in", "Open in", "Weeks off", "Which weeks"].forEach((heading) => {
      const groups = listRows("groups", s, terms);
      const at = groups[0].indexOf("Weeks");
      groups[0][at] = heading;
      groups[1][at] = "Week 1, Week 2";
      const p = readBack("groups", groups, s);
      expect([heading, p.mapping.headings[at].how]).toEqual([
        heading,
        "unknown"
      ]);
      expect(p.rows.filter((r) => r.problems.length)).toEqual([]);
    });
  });

  it("INGEST-1.8: a Weeks column that never says which weeks is left unread, said once", () => {
    const s = fullCamp();
    const groups = listRows("groups", s, terms);
    const at = groups[0].indexOf("Weeks");
    groups.slice(1).forEach((row, i) => {
      row[at] = i === 1 ? "" : "8";
    });
    const p = readBack("groups", groups, s);
    expect(p.mapping.headings[at]).toEqual(
      expect.objectContaining({
        column: null,
        how: "notRead",
        note: "Weeks column not read: it doesn't say which weeks"
      })
    );
    expect(p.rows.filter((r) => r.status !== "unchanged")).toEqual([]);
    expect(waitingFor(p, terms, {})).toEqual(["Nothing to change"]);
  });

  it("INGEST-1.8: a Weeks column where some cells say weeks reads each row on its own", () => {
    const s = fullCamp();
    const groups = listRows("groups", s, terms);
    const at = groups[0].indexOf("Weeks");
    groups[1][at] = "8";
    const p = readBack("groups", groups, s);
    expect(p.mapping.headings[at].how).toBe("matched");
    expect(p.rows[0].problems).toEqual([
      'Weeks: "8" isn\'t like "Every week" or "Off Week 2"'
    ]);
    expect(p.rows.slice(1).filter((r) => r.problems.length)).toEqual([]);
  });

  it("INGEST-1.8: weeks are read in other words too: Closed, Not in, the week word on each", () => {
    const s = fullCamp();
    const groups = listRows("groups", s, terms);
    const at = groups[0].indexOf("Weeks");
    groups[1][at] = "not in week 1 and week 2";
    groups[2][at] = "Closed Wk 1";
    groups[3][at] = "";
    const p = readBack("groups", groups, s);
    expect(
      p.rows.slice(0, 3).map((r) => [r.status, r.differences.map((d) => d.to)])
    ).toEqual([
      ["changed", [{ off: [1, 2], of: 2 }]],
      ["unchanged", []],
      ["unchanged", []]
    ]);
  });
});
