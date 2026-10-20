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
} from "./data/lists";
import { camp } from "./data/camp";
import { CHILDREN, FIELD } from "c/shoreshSchema";
import { nsRecord } from "shoresh-jest/namespace";
import { withRecords } from "../workbook";

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
  const keys = new Set([
    ...plan.records.map((r) => r.key).filter((k) => k),
    ...(plan.fillWeeks || []).map((w) => `Week:${w.start}`)
  ]);
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
      // A week off of each kind of item.
      WeekException: 5
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
    // Board games is off in week 2, as it was (and each other item off its week).
    expect(
      plan.records.find((r) => r.kind === "WeekException" && r.refs.Activity__c)
        .refs
    ).toEqual({
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
    expect(p.unused).toEqual([{ name: "Notes", why: "" }]);
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
    // The unknown week is said once; the other columns are still read.
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      status: "unreadable",
      problems: ['"Week 9" isn\'t a week of the worksheet that can be read']
    });
    expect(rows.find((r) => r.name === "Kayak").problems).toEqual([
      "No activity “Kayak”"
    ]);
    expect(rows.filter((r) => r.status === "unchanged").length).toBeGreaterThan(
      0
    );
  });
});

// Greg, 2026-10-17: a workbook from another season is paired with this season's weeks by
// order, as opening a new season copies weeks; the season keeps its own dates.
describe("a workbook from another season", () => {
  function nextYear(count) {
    const s = freshSeason();
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-08-11"
    };
    const mondays = ["2028-06-26", "2028-07-03", "2028-07-10", "2028-07-17"];
    s.weeks = mondays.slice(0, count).map((start, i) => ({
      Id: `n${i + 1}`,
      Name: `Week ${i + 1}`,
      StartDate__c: start,
      EndDate__c: start.replace(
        /-(\d\d)$/,
        (m, d) => `-${String(+d + 4).padStart(2, "0")}`
      ),
      SortOrder__c: i + 1
    }));
    return s;
  }

  function approveWords(s, workbook) {
    const p = propose(s, workbook);
    const answers = {};
    p.sections
      .find((x) => x.key === "campWords")
      .rows.forEach((r) =>
        r.differences.forEach((d) => {
          answers[d.id] = "change";
        })
      );
    return { p: propose(s, workbook, answers), answers };
  }

  it("pairs weeks by order, shows the pairing, and Runs in follows it", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const s = nextYear(3);
    const { p, answers } = approveWords(s, workbook);
    const weeks = p.sections.find((x) => x.key === "weeks");
    expect(
      weeks.lists.map((l) => [l.heading, l.lines.map((x) => x.pairing)])
    ).toEqual([
      [
        "Matched by order",
        [
          "Week 1 (Jun 28 2027) → Week 1 (Jun 26 2028)",
          "Week 2 (Jul 5 2027) → Week 2 (Jul 3 2028)"
        ]
      ],
      ["Not in the worksheet", ["Week 3 (Jul 10 2028)"]]
    ]);
    expect(weeks.rows.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
    const plan = workbookPlan(p, answers);
    expect(plan.records.filter((r) => r.kind === "Week")).toEqual([]);
    // Each item off last year's week 1 or 2 is off this year's week 1 or 2 (Board games was
    // off week 2; a bunk, the gym, the Teens' lunch and the meeting are off one week each).
    expect(
      plan.records.filter((r) => r.kind === "WeekException").map((r) => r.refs)
    ).toEqual([
      { Group__c: "Group:Program:Main:Juniors:Bunk 2", Week__c: "n1" },
      {
        RecurringActivity__c: "RecurringActivity:Program:Main:Meeting",
        Week__c: "n2"
      },
      { FixedActivity__c: "FixedActivity:Program:Teens:Lunch", Week__c: "n1" },
      { Location__c: "Location:Gym", Week__c: "n2" },
      { Activity__c: "Activity:Board games", Week__c: "n2" }
    ]);
  });

  it("a workbook week past the season's last is left out, and its ticks aren't read", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const s = nextYear(1);
    const { p, answers } = approveWords(s, workbook);
    const weeks = p.sections.find((x) => x.key === "weeks");
    expect(weeks.rows.map((r) => [r.name, r.status, r.reason])).toEqual([
      ["Week 1", "unchanged", undefined],
      ["Week 2", "leftOut", "no week of this season left for it"]
    ]);
    expect(workbookWaiting(p, answers)).toEqual([]);
    // Only week 1's ticks are read: the bunk and the Teens' lunch off week 1, nothing off week 2.
    expect(
      workbookPlan(p, answers)
        .records.filter((r) => r.kind === "WeekException")
        .map((r) => r.refs)
    ).toEqual([
      { Group__c: "Group:Program:Main:Juniors:Bunk 2", Week__c: "n1" },
      { FixedActivity__c: "FixedActivity:Program:Teens:Lunch", Week__c: "n1" }
    ]);
  });

  it("a workbook week inside the season's dates: matched by start date as before", () => {
    const s = camp();
    s.season = {
      ...s.season,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-08-06"
    };
    const p = propose(s, file(campWorkbookSheets(s, buildTerms(s.labels))));
    expect(p.weeks.byOrder).toBe(false);
    expect(workbookWaiting(p, {})).toEqual(["Nothing to change"]);
  });

  it("this season's workbook with a week outside its dates: that week is left out, said", () => {
    const s = camp();
    s.season = {
      ...s.season,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-09"
    };
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.push(["Week 9", "2027-08-23", "2027-08-27"]);
        sheets["Runs in"][0].push("Week 9");
        sheets["Runs in"].slice(1).forEach((r) => r.push("No"));
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.name, r.status, r.reason])).toEqual([
      ["Week 1", "unchanged", undefined],
      ["Week 2", "unchanged", undefined],
      ["Week 9", "leftOut", "starts outside this season's dates"]
    ]);
    // Its ticks (all No) aren't read: nothing changes.
    expect(workbookWaiting(p, {})).toEqual(["Nothing to change"]);
  });
});

describe("own review of PR D", () => {
  it("H1: by order, a week row that can't be read pairs nothing, rather than shift the rest", () => {
    const from = camp();
    const sheets = campWorkbookSheets(from, buildTerms(from.labels));
    sheets.find((x) => x.name === "Weeks").rows[1][1] = "2027-13-40";
    const s = freshSeason();
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-08-11"
    };
    s.weeks = [
      {
        Id: "n1",
        Name: "Week 1",
        StartDate__c: "2028-06-26",
        EndDate__c: "2028-06-30"
      },
      {
        Id: "n2",
        Name: "Week 2",
        StartDate__c: "2028-07-03",
        EndDate__c: "2028-07-07"
      }
    ];
    const p = propose(s, file(sheets));
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.name, r.status, r.problems])).toEqual([
      ["Week 1", "unreadable", ['Start: "2027-13-40" isn\'t a date']],
      ["Week 2", "unreadable", ["Matched by order once row 2 can be read"]]
    ]);
    expect(weeks.some((r) => r.differences.length)).toBe(false);
  });

  it("H2: a workbook that only changes camp words can be saved", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets["Camp words"][1] = ["Group", "Cabin", "Cabins"];
      })
    );
    const id = p.sections.find((x) => x.key === "campWords").rows[0]
      .differences[0].id;
    const answers = { [id]: "change" };
    expect(
      workbookWaiting(propose(s, workbookOf(s), answers), answers)
    ).toEqual([]);
    function workbookOf(x) {
      return edited(x, (sheets) => {
        sheets["Camp words"][1] = ["Group", "Cabin", "Cabins"];
      });
    }
  });

  it("M1: one item on two Runs in rows: the same ticks are one row; different ticks are both said", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        const rows = sheets["Runs in"];
        const games = rows.find((r) => r[3] === "Board games");
        rows.push([...games]);
        const swim = rows.find((r) => r[3] === "Swim");
        rows.push([...swim.slice(0, 4), "Yes", "No"]);
      })
    );
    const rows = p.sections.find((x) => x.key === "runsIn").rows;
    const games = rows.filter((r) => r.name === "Board games");
    expect(games.map((r) => r.status)).toEqual(["unchanged", "leftOut"]);
    const swims = rows.filter((r) => r.name === "Swim");
    expect(swims.map((r) => [r.status, r.problems.length])).toEqual([
      ["unreadable", 1],
      ["unreadable", 1]
    ]);
    expect(workbookPlan(p, {}).records).toEqual([]);
  });

  it("M2: two sheets fitting one list as well as each other: neither read, both said", () => {
    const s = camp();
    const sheets = campWorkbookSheets(s, buildTerms(s.labels));
    const bunks = sheets.find((x) => x.name === "Bunks");
    const p = propose(
      s,
      file([...sheets, { name: "Bunks old", rows: bunks.rows }])
    );
    expect(p.sections.some((x) => x.key === "groups")).toBe(false);
    expect(p.unused.map((u) => u.name).sort()).toEqual(["Bunks", "Bunks old"]);
    expect(p.unused[0].why).toContain("could both be Bunks");
  });

  it("M3: two weeks starting the same day are both said, whatever their order", () => {
    const s = camp();
    [false, true].forEach((reverse) => {
      const p = propose(
        s,
        edited(s, (sheets) => {
          const extra = [
            ["Week 3", "2027-07-12", "2027-07-16"],
            ["Week 3b", "2027-07-12", "2027-07-16"]
          ];
          sheets.Weeks.push(...(reverse ? extra.reverse() : extra));
        })
      );
      const rows = p.sections.find((x) => x.key === "weeks").rows.slice(2);
      expect(rows.map((r) => r.status)).toEqual(["unreadable", "unreadable"]);
      expect(workbookPlan(p, {}).records).toEqual([]);
    });
  });
});

describe("independent review of PR D", () => {
  it("a new week overlapping a week already set up is said, never added on top", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.push(["Week 2b", "2027-07-07", "2027-07-13"]);
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.name, r.status, r.problems])).toEqual([
      ["Week 1", "unchanged", []],
      ["Week 2", "unchanged", []],
      ["Week 2b", "unreadable", ["Overlaps Week 2 (Jul 5 2027)"]]
    ]);
    expect(
      workbookPlan(p, {}).records.filter((r) => r.kind === "Week")
    ).toEqual([]);
  });

  it("a week's new end running into the next week is said on that row", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks[1][2] = "2027-07-06";
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.name, r.status, r.problems])).toEqual([
      ["Week 1", "unreadable", ["Overlaps Week 2 (Jul 5 2027)"]],
      ["Week 2", "unchanged", []]
    ]);
  });
  it("two Runs in columns for one week: neither is read, both are said", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        const rows = sheets["Runs in"];
        rows[0].push("Week 1 (2027-06-28)");
        rows.slice(1).forEach((r) => r.push(r[4] === "Yes" ? "No" : "Yes"));
      })
    );
    const runsIn = p.sections.find((x) => x.key === "runsIn");
    expect(runsIn.rows[0].problems).toEqual([
      '"Week 1" and "Week 1 (2027-06-28)" are the same week'
    ]);
    expect(runsIn.rows.some((r) => r.differences.length)).toBe(false);
  });
});

describe("coordinator's review of PR D", () => {
  /** Another season's workbook into a season with dates and no weeks yet. */
  function emptySeason() {
    const s = freshSeason();
    s.weeks = [];
    // Monday Jun 26 to Wednesday Jul 12 2028: two full weeks and a short third.
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-07-12"
    };
    return s;
  }

  it("fills the season's weeks from its dates, pairs by order, and says so", () => {
    const from = camp();
    const p = propose(
      emptySeason(),
      file(campWorkbookSheets(from, buildTerms(from.labels)))
    );
    expect(p.weeks.byOrder).toBe(true);
    const lists = Object.fromEntries(
      p.weeks.lists.map((l) => [l.key, l.lines.map((x) => x.pairing)])
    );
    expect(lists.filled).toEqual([
      "Week 1 (Jun 26 2028)",
      "Week 2 (Jul 3 2028)",
      "Week 3 (Jul 10 2028)"
    ]);
    expect(lists.paired).toEqual([
      "Week 1 (Jun 28 2027) → Week 1 (Jun 26 2028)",
      "Week 2 (Jul 5 2027) → Week 2 (Jul 3 2028)"
    ]);
    expect(lists.untouched).toEqual([]);
    const plan = workbookPlan(p, {});
    expect(plan.fillWeeks).toEqual([
      { start: "2028-06-26", name: "Week 1" },
      { start: "2028-07-03", name: "Week 2" },
      { start: "2028-07-10", name: "Week 3" }
    ]);
    expect(plan.records.filter((r) => r.kind === "Week")).toEqual([]);
    expect(linksResolve(plan)).toEqual([]);
    // Runs in ticks follow the pairing onto the weeks filled in.
    const weeksOff = plan.records
      .filter((r) => r.kind === "WeekException")
      .map((r) => r.refs.Week__c);
    expect(weeksOff.length).toBeGreaterThan(0);
    weeksOff.forEach((w) =>
      expect(["Week:2028-06-26", "Week:2028-07-03"]).toContain(w)
    );
  });

  it("a week filled in takes the workbook's name on Change", () => {
    const from = camp();
    const sheets = campWorkbookSheets(from, buildTerms(from.labels));
    const weeksSheet = sheets.find((x) => x.name === "Weeks");
    weeksSheet.rows[1][0] = "Opening week";
    sheets.find((x) => x.name === "Runs in").rows[0][4] = "Opening week";
    const s = emptySeason();
    const first = propose(s, file(sheets));
    const row = first.weeks.rows[0];
    expect(
      row.differences.map((d) => d.text || `${d.from} → ${d.to}`)
    ).toHaveLength(1);
    const answers = { [row.differences[0].id]: "change" };
    const p = propose(s, file(sheets), answers);
    expect(workbookPlan(p, answers).fillWeeks[0]).toEqual({
      start: "2028-06-26",
      name: "Opening week"
    });
    expect(p.weeks.lists[0].lines[0].pairing).toBe(
      "Opening week (Jun 26 2028)"
    );
  });

  it("the way weeks are matched is decided once: setting an overlap aside can't flip it", () => {
    const s = camp();
    s.season = {
      ...s.season,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-09"
    };
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.splice(
          1,
          2,
          ["Pre-camp", "2027-06-21", "2027-06-25"],
          ["Week X", "2027-07-07", "2027-07-13"]
        );
      })
    );
    expect(p.weeks.byOrder).toBe(false);
    expect(
      p.weeks.rows.map((r) => [r.name, r.status, r.reason || r.problems])
    ).toEqual([
      ["Pre-camp", "leftOut", "starts outside this season's dates"],
      ["Week X", "unreadable", ["Overlaps Week 2 (Jul 5 2027)"]]
    ]);
  });

  it("a left-out week's bare name never skips a week read under the same name", () => {
    const from = camp();
    const sheets = campWorkbookSheets(from, buildTerms(from.labels));
    const weeksSheet = sheets.find((x) => x.name === "Weeks");
    weeksSheet.rows.push(["Week 1", "2027-07-12", "2027-07-16"]);
    const s = freshSeason();
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-07-14"
    };
    const p = propose(s, file(sheets));
    expect(p.weeks.rows.map((r) => r.status)).toEqual([
      "unchanged",
      "unchanged",
      "leftOut"
    ]);
    // "Week 1" heads a column but two weeks have that name: said, never skipped quietly.
    expect(p.runsIn.rows[0].problems).toEqual([
      '"Week 1" isn\'t a week of the worksheet that can be read'
    ]);
  });

  it("says weeks and seasons in the camp's words", () => {
    const s = camp();
    s.labels = [
      ...s.labels,
      {
        term: "Week",
        modelSingular: "Week",
        singular: "Session",
        plural: "Sessions",
        isCustom: true
      },
      {
        term: "Season",
        modelSingular: "Season",
        singular: "Summer",
        plural: "Summers",
        isCustom: true
      }
    ];
    s.season = {
      ...s.season,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-09"
    };
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Sessions.push(["Late", "2027-08-23", "2027-08-27"]);
        sheets.Sessions.push(["Twin", "2027-06-28", "2027-07-02"]);
      })
    );
    const rows = Object.fromEntries(p.weeks.rows.map((r) => [r.name, r]));
    expect(rows.Late.reason).toBe("starts outside this Summer's dates");
    expect(rows.Twin.problems).toEqual(["Another Session starts Jun 28 2027"]);
  });
});

describe("import security hardening", () => {
  it("a season with only a first day says it needs both, rather than leave every week out", () => {
    const from = camp();
    const s = freshSeason();
    s.weeks = [];
    s.season = { ...s.season, StartDate__c: "2028-06-26" };
    const p = propose(
      s,
      file(campWorkbookSheets(from, buildTerms(from.labels)))
    );
    expect(p.weeks.rows.map((r) => [r.status, r.reason])).toEqual([
      ["leftOut", "this season needs its first and last day"],
      ["leftOut", "this season needs its first and last day"]
    ]);
  });
  it("a season with only a last day says so too", () => {
    const from = camp();
    const s = freshSeason();
    s.weeks = [];
    s.season = { ...s.season, EndDate__c: "2028-08-11" };
    const p = propose(
      s,
      file(campWorkbookSheets(from, buildTerms(from.labels)))
    );
    expect(p.weeks.rows.map((r) => r.reason)).toEqual([
      "this season needs its first and last day",
      "this season needs its first and last day"
    ]);
  });
});

describe("a week set up with no end", () => {
  it("is a difference the workbook shows with Keep or Change, never a crash", () => {
    const s = camp();
    // The workbook as written before the end went missing: Week 1 ends Jul 2.
    const workbook = file(campWorkbookSheets(camp(), buildTerms(s.labels)));
    delete s.weeks[0].EndDate__c;
    const p = propose(s, workbook);
    const week1 = p.sections.find((x) => x.key === "weeks").rows[0];
    expect(week1.status).toBe("changed");
    expect(week1.differences.map((d) => [d.heading, d.from, d.to])).toEqual([
      ["End", "none", "Jul 2 2027"]
    ]);
    const answers = { [week1.differences[0].id]: "change" };
    expect(
      workbookPlan(propose(s, workbook, answers), answers).records
    ).toEqual([
      { kind: "Week", id: "w1", fields: { EndDate__c: "2027-07-02" } }
    ]);
    expect(workbookPlan(p, {}).records).toEqual([]);
  });
});

describe("namespace safety: what the workbook reads and writes", () => {
  it("a week's new end is a Keep or Change, remembered by the field's own name", () => {
    const s = camp();
    const workbook = (x) =>
      edited(x, (sheets) => {
        sheets.Weeks[1][2] = "2027-07-01";
      });
    const p = propose(s, workbook(s));
    const [end] = p.sections.find((x) => x.key === "weeks").rows[0].differences;
    // The same answer key before and after the package has its namespace.
    expect(end.id).toBe("change|weeks|w1|EndDate__c|2027-07-01");
    expect([end.heading, end.from, end.to]).toEqual([
      "End",
      "Jul 2 2027",
      "Jul 1 2027"
    ]);
    const answers = { [end.id]: "change" };
    expect(
      workbookPlan(propose(s, workbook(s), answers), answers).records
    ).toEqual([
      { kind: "Week", id: "w1", fields: { EndDate__c: "2027-07-01" } }
    ]);
  });

  it("a week the workbook adds is saved with its dates", () => {
    const s = camp();
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.push(["Week 3", "2027-07-12", "2027-07-16"]);
      })
    );
    expect(
      workbookPlan(p, {}).records.filter((r) => r.kind === "Week")
    ).toEqual([
      {
        kind: "Week",
        key: "Week:2027-07-12",
        fields: {
          Name: "Week 3",
          StartDate__c: "2027-07-12",
          EndDate__c: "2027-07-16"
        }
      }
    ]);
  });

  it("another season's weeks pair in date order, whatever order the season lists them in", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const s = freshSeason();
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-08-11"
    };
    s.weeks = [
      {
        Id: "n2",
        Name: "Second",
        StartDate__c: "2028-07-03",
        EndDate__c: "2028-07-07",
        SortOrder__c: 3
      },
      // Two weeks starting the same day (never saved so, but read in a set order): by place.
      {
        Id: "n1b",
        Name: "First b",
        StartDate__c: "2028-06-26",
        EndDate__c: "2028-06-30",
        SortOrder__c: 2
      },
      {
        Id: "n1",
        Name: "First",
        StartDate__c: "2028-06-26",
        EndDate__c: "2028-06-30",
        SortOrder__c: 1
      }
    ];
    const p = propose(s, workbook);
    expect(
      p.sections
        .find((x) => x.key === "weeks")
        .lists.find((l) => l.key === "paired")
        .lines.map((x) => x.pairing)
    ).toEqual([
      "Week 1 (Jun 28 2027) → First (Jun 26 2028)",
      "Week 2 (Jul 5 2027) → First b (Jun 26 2028)"
    ]);
  });

  it("each sheet sees what the sheets before it add: who can do it, and block times", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const p = propose(freshSeason(), workbook);
    const seen = p.sections.find((x) => x.key === "recurringActivities")
      .proposal.setup;
    const swim = seen.activities.find((a) => a.Name === "Swim");
    const who = FIELD.ActivityEligibility;
    expect(
      swim[CHILDREN.Activity.Eligibilities].map(
        (r) => r[who.Division] || r[who.Group]
      )
    ).toEqual([
      "Division:Program:Main:Juniors",
      "Group:Program:Main:Seniors:Bunk 3"
    ]);
    const block = seen.programs
      .find((e) => e.program.Name === "Main")
      .timeBlocks.find((b) => b.Name === "Period 1");
    expect([
      block[FIELD.TimeBlock.StartTime],
      block[FIELD.TimeBlock.EndTime]
    ]).toEqual([9 * 60 * 60000, (9 * 60 + 45) * 60000]);
  });

  it("a new week over the day a week with no end starts is said, never added on top", () => {
    const s = camp();
    delete s.weeks[1].EndDate__c;
    const p = propose(
      s,
      edited(s, (sheets) => {
        sheets.Weeks.splice(2, 1);
        // Not Week 2's start: a week to add, running over the day Week 2 starts.
        sheets.Weeks.push(["Week 2b", "2027-07-04", "2027-07-08"]);
      })
    );
    const weeks = p.sections.find((x) => x.key === "weeks").rows;
    expect(weeks.map((r) => [r.name, r.problems])).toEqual([
      ["Week 1", []],
      ["Week 2b", ["Overlaps Week 2 (Jul 5 2027)"]]
    ]);
  });

  it("weeks sharing a start day keep their places in order", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const s = freshSeason();
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-08-11"
    };
    const week = (Id, Name, StartDate__c, SortOrder__c) => ({
      Id,
      Name,
      StartDate__c,
      EndDate__c: "2028-06-30",
      SortOrder__c
    });
    s.weeks = [
      week("c", "Third", "2028-06-26", 3),
      week("a", "First", "2028-06-26", 1),
      week("late", "Later", "2028-07-03", 4),
      week("b", "Second", "2028-06-26", 2)
    ];
    const lists = propose(s, workbook).sections.find(
      (x) => x.key === "weeks"
    ).lists;
    expect(lists.map((l) => [l.key, l.lines.map((x) => x.pairing)])).toEqual([
      [
        "paired",
        [
          "Week 1 (Jun 28 2027) → First (Jun 26 2028)",
          "Week 2 (Jul 5 2027) → Second (Jun 26 2028)"
        ]
      ],
      ["untouched", ["Third (Jun 26 2028)", "Later (Jul 3 2028)"]]
    ]);
  });

  it("the season the next sheets see: who rows, covered by, and block times", () => {
    const setup = nsRecord(camp());
    const seen = withRecords(setup, [
      {
        kind: "TimeBlock",
        id: "tb1",
        fields: {
          [FIELD.TimeBlock.StartTime]: "08:30",
          [FIELD.TimeBlock.EndTime]: "09:15"
        }
      },
      { kind: "Activity", id: "a2", fields: {}, who: ["d2", "g1"] },
      { kind: "RecurringActivity", id: "r1", fields: {}, who: ["g3"] }
    ]);
    const main = seen.programs.find((e) => e.program.Id === "p1");
    const block = main.timeBlocks.find((b) => b.Id === "tb1");
    expect([
      block[FIELD.TimeBlock.StartTime],
      block[FIELD.TimeBlock.EndTime]
    ]).toEqual([(8 * 60 + 30) * 60000, (9 * 60 + 15) * 60000]);
    const games = seen.activities.find((a) => a.Id === "a2");
    expect(games[CHILDREN.Activity.Eligibilities]).toEqual([
      { [FIELD.ActivityEligibility.Division]: "d2" },
      { [FIELD.ActivityEligibility.Group]: "g1" }
    ]);
    const meeting = main.recurringActivities.find((r) => r.Id === "r1");
    expect(meeting[CHILDREN.RecurringActivity.Coverages]).toEqual([
      { [FIELD.Coverage.Group]: "g3" }
    ]);
  });

  it("a season with one date only: another season's weeks would go by order (and all wait)", () => {
    const from = camp();
    const workbook = file(campWorkbookSheets(from, buildTerms(from.labels)));
    const startOnly = freshSeason();
    startOnly.season = { ...startOnly.season, StartDate__c: "2028-06-26" };
    const endOnly = freshSeason();
    endOnly.season = { ...endOnly.season, EndDate__c: "2026-08-01" };
    // Neither season has a week starting within its dates, so both read the workbook by order;
    // with one date only, every week is left out until the season has both.
    expect(propose(startOnly, workbook).weeks.byOrder).toBe(true);
    expect(propose(endOnly, workbook).weeks.byOrder).toBe(true);
  });

  it("the weeks filled in from the season's dates are what the later sheets see", () => {
    const from = camp();
    const s = freshSeason();
    s.weeks = [];
    s.season = {
      ...s.season,
      StartDate__c: "2028-06-26",
      EndDate__c: "2028-07-12"
    };
    const p = propose(
      s,
      file(campWorkbookSheets(from, buildTerms(from.labels)))
    );
    const seen = p.sections.find((x) => x.key === "programs").proposal.setup;
    expect(
      seen.weeks.map((w) => [
        w.Name,
        w[FIELD.Week.StartDate],
        w[FIELD.Week.EndDate],
        w[FIELD.Week.SortOrder]
      ])
    ).toEqual([
      ["Week 1", "2028-06-26", "2028-06-30", 1],
      ["Week 2", "2028-07-03", "2028-07-07", 2],
      ["Week 3", "2028-07-10", "2028-07-12", 3]
    ]);
  });
});
