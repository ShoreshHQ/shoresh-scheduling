// Slice 4c part B: the lists of what a program holds, on made-up camps only.
import { buildTerms } from "c/shoreshTerms";
import { csvFile, LEAVE_OUT } from "c/shoreshImportEngine";
import {
  CHANGE,
  listPlan,
  listProposal,
  questionCards,
  waitingFor
} from "c/shoreshLists";

const terms = buildTerms([]);
const MS = 60000;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function program(id, name, runs, extra = {}) {
  const record = { Id: id, Name: name };
  DAYS.forEach((d) => {
    record[`${d}__c`] = runs.includes(d);
  });
  return {
    program: record,
    timeBlocks: [],
    divisions: [],
    fixedActivities: [],
    recurringActivities: [],
    ...extra
  };
}

function setup() {
  return {
    season: { Id: "s1", Camp__c: "c1" },
    locationTypes: [],
    locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }],
    activities: [],
    programs: [
      program("p1", "Main", ["Monday", "Tuesday", "Wednesday", "Thursday"], {
        timeBlocks: [
          {
            Id: "tb1",
            Name: "Period 1",
            StartTime__c: 9 * 60 * MS,
            EndTime__c: (9 * 60 + 45) * MS,
            PartOfDay__c: "Morning"
          }
        ],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g2", Name: "Bunk 2", Availability__c: "AllDay" }]
          }
        ],
        fixedActivities: [
          { Id: "f1", Name: "Lunch", TimeBlock__c: "tb1", Length__c: 1 }
        ],
        recurringActivities: [
          {
            Id: "r1",
            Name: "Meeting",
            TimeBlock__c: "tb1",
            Length__c: 1,
            Monday__c: true,
            Coverages__r: [{ Division__c: "d1" }]
          }
        ]
      })
    ]
  };
}

function read(screenKey, rows, answers = {}, s = setup()) {
  return listProposal({
    screenKey,
    file: csvFile("list.csv", rows.map((r) => r.join(",")).join("\n")),
    setup: s,
    terms,
    answers
  });
}

const row = (p, name) => p.rows.find((r) => r.name === name);

describe("program days", () => {
  it("adds a program, compares days, and can't read Saturday", () => {
    const p = read("programs", [
      ["Program", "Runs on"],
      ["Main", "Mon-Fri"],
      ["Teens", "Mon/Wed"],
      ["Weekend", "Saturday"]
    ]);
    expect(row(p, "Main").differences.map((d) => [d.from, d.to])).toEqual([
      [
        ["Monday", "Tuesday", "Wednesday", "Thursday"],
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      ]
    ]);
    expect(row(p, "Teens").status).toBe("new");
    expect(row(p, "Weekend").problems).toEqual([
      "Runs on: Saturday isn't a camp day"
    ]);
    const plan = listPlan(p, {}, "s1", "f");
    expect(plan.records).toEqual([
      {
        kind: "Program",
        key: "Program:Teens",
        fields: {
          Name: "Teens",
          Monday__c: true,
          Tuesday__c: false,
          Wednesday__c: true,
          Thursday__c: false,
          Friday__c: false
        },
        refs: {}
      }
    ]);
  });
});

describe("divisions and a program that isn't set up", () => {
  it("asks a new program's days, then adds it and its division", () => {
    const rows = [
      ["Program", "Division"],
      ["Main", "Juniors"],
      ["Main", "Middlers"],
      ["Teens", "Hikers"]
    ];
    const p = read("divisions", rows);
    const [card] = questionCards(p, terms, {});
    expect(card.title).toBe("“Teens” is a new program. Which days?");
    expect(row(p, "Hikers").status).toBe("asked");
    const answers = { [card.id]: "Monday,Wednesday" };
    const done = read("divisions", rows, answers);
    expect(done.rows.map((r) => [r.name, r.status])).toEqual([
      ["Juniors", "unchanged"],
      ["Middlers", "new"],
      ["Hikers", "new"]
    ]);
    const plan = listPlan(done, answers, "s1", "f");
    expect(plan.records.map((r) => [r.kind, r.key, r.refs])).toEqual([
      ["Program", "Program:Teens", undefined],
      ["Division", "Division:p1:Middlers", { Program__c: "p1" }],
      [
        "Division",
        "Division:Program:Teens:Hikers",
        { Program__c: "Program:Teens" }
      ]
    ]);
    expect(waitingFor(done, terms, answers)).toEqual([]);
  });

  it("with several programs, a row must say which", () => {
    const s = setup();
    s.programs.push(program("p2", "Teens", DAYS));
    const p = read("divisions", [["Division"], ["Middlers"]], {}, s);
    expect(row(p, "Middlers").problems).toEqual(["Program is blank"]);
  });
});

describe("groups", () => {
  it("a group in another division is a difference (a move), a new division is added", () => {
    const p = read("groups", [
      ["Division", "Group", "Availability"],
      ["Seniors", "Bunk 1", "morning"],
      ["Middlers", "Bunk 9", ""]
    ]);
    expect(
      row(p, "Bunk 1").differences.map((d) => [d.column, d.from, d.to])
    ).toEqual([
      ["division", "Juniors", "Seniors"],
      ["availability", "AllDay", "MorningOnly"]
    ]);
    expect(p.alsoAdd.division).toEqual([{ programId: "p1", name: "Middlers" }]);
    const answers = {};
    row(p, "Bunk 1").differences.forEach((d) => {
      answers[d.id] = CHANGE;
    });
    const plan = listPlan(
      read(
        "groups",
        [
          ["Division", "Group", "Availability"],
          ["Seniors", "Bunk 1", "morning"],
          ["Middlers", "Bunk 9", ""]
        ],
        answers
      ),
      answers,
      "s1",
      "f"
    );
    expect(plan.records).toEqual([
      {
        kind: "Division",
        key: "Division:p1:Middlers",
        fields: { Name: "Middlers" },
        refs: { Program__c: "p1" }
      },
      {
        kind: "Group",
        id: "g1",
        fields: { Availability__c: "MorningOnly" },
        refs: { Division__c: "d2" }
      },
      {
        kind: "Group",
        key: "Group:p1:Bunk 9",
        fields: { Name: "Bunk 9", Availability__c: "AllDay" },
        refs: { Division__c: "Division:p1:Middlers" }
      }
    ]);
  });
});

describe("time blocks", () => {
  it("compares times, asks 6 o'clock, and can't read an end before the start", () => {
    const rows = [
      ["Time block", "Start", "End"],
      ["Period 1", "9:15", "10:00"],
      ["Late pickup", "6:00", "6:30"],
      ["Backwards", "10:00", "9:00"]
    ];
    const p = read("timeBlocks", rows);
    expect(
      row(p, "Period 1").differences.map((d) => [d.column, d.from, d.to])
    ).toEqual([
      ["start", 540, 555],
      ["end", 585, 600]
    ]);
    expect(row(p, "Late pickup").status).toBe("asked");
    expect(row(p, "Backwards").problems).toEqual(["End is before Start"]);
    const [card] = questionCards(p, terms, {});
    expect(card.title).toBe("“6:00”: morning or evening?");
    const answers = {};
    questionCards(p, terms, {}).forEach((c) => {
      answers[c.id] = "evening";
    });
    const done = read("timeBlocks", rows, answers);
    expect(row(done, "Late pickup").values).toMatchObject({
      start: 18 * 60,
      partOfDay: "Afternoon"
    });
  });
});

describe("fixed and recurring activities", () => {
  it("a new time block is asked when it is, then added and linked", () => {
    const rows = [
      ["Fixed activity", "Time block"],
      ["Snack", "Period 9"]
    ];
    const p = read("fixedActivities", rows);
    const [card] = questionCards(p, terms, {});
    expect(card.title).toBe(
      "“Period 9” is a new time block in Main. When is it?"
    );
    const answers = { [card.id]: "14:00-14:30" };
    const plan = listPlan(
      read("fixedActivities", rows, answers),
      answers,
      "s1",
      "f"
    );
    expect(plan.records).toEqual([
      {
        kind: "TimeBlock",
        key: "TimeBlock:p1:Period 9",
        fields: {
          Name: "Period 9",
          StartTime__c: "14:00",
          EndTime__c: "14:30",
          PartOfDay__c: "Afternoon"
        },
        refs: { Program__c: "p1" }
      },
      {
        kind: "FixedActivity",
        key: "FixedActivity:p1:Snack",
        fields: { Name: "Snack", Length__c: 1 },
        refs: {
          Program__c: "p1",
          TimeBlock__c: "TimeBlock:p1:Period 9",
          Location__c: null
        }
      }
    ]);
  });

  it("a recurring day the program doesn't run is asked; Add puts the day on the program", () => {
    const rows = [
      ["Recurring activity", "Time block", "Runs on", "Who"],
      ["Meeting", "Period 1", "Monday; Friday", "Seniors"]
    ];
    const p = read("recurringActivities", rows);
    const card = questionCards(p, terms, {}).find((c) =>
      c.id.startsWith("programDay|")
    );
    expect(card.title).toBe("Main doesn't run on Friday: Meeting");
    const answers = { [card.id]: "add" };
    const done = read("recurringActivities", rows, answers);
    done.rows[0].differences.forEach((d) => {
      answers[d.id] = CHANGE;
    });
    const changed = read("recurringActivities", rows, answers);
    const plan = listPlan(changed, answers, "s1", "f");
    expect(plan.records).toEqual([
      {
        kind: "Program",
        id: "p1",
        fields: {
          Monday__c: true,
          Tuesday__c: true,
          Wednesday__c: true,
          Thursday__c: true,
          Friday__c: true
        }
      },
      {
        kind: "RecurringActivity",
        id: "r1",
        fields: {
          Monday__c: true,
          Tuesday__c: false,
          Wednesday__c: false,
          Thursday__c: false,
          Friday__c: true
        },
        refs: {},
        who: ["d2"]
      }
    ]);
  });

  it("a recurring Who names only its own program's divisions and groups", () => {
    const rows = [
      ["Recurring activity", "Time block", "Runs on", "Who"],
      ["Swim", "Period 1", "Monday", "Hikers"]
    ];
    const p = read("recurringActivities", rows);
    const [card] = questionCards(p, terms, {});
    expect(card.title).toBe("“Hikers” is new in Main. What is it?");
    expect(card.options.map((o) => o.value)).toEqual([
      "division|Main",
      "group|Main|Juniors",
      "group|Main|Seniors",
      LEAVE_OUT
    ]);
  });
});

describe("in any row order", () => {
  /** Rows in file order, reversed, and three seeded shuffles. */
  function orders(rows) {
    const result = [rows, [...rows].reverse()];
    for (let seed = 1; seed <= 3; seed++) {
      let x = seed * 7919;
      const shuffled = [...rows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        x = (x * 9301 + 49297) % 233280;
        const j = Math.floor((x / 233280) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      result.push(shuffled);
    }
    return result;
  }

  it("groups with new divisions and programs settle to the same save", () => {
    const heading = ["Program", "Division", "Group"];
    const body = [
      ["Main", "Middlers", "Bunk 9"],
      ["main", "middlers", "bunk 9"],
      ["Teens", "Hikers", "Tent 1"],
      ["Teens", "hikers", "Tent 2"],
      ["Main", "Seniors", "Bunk 1"]
    ];
    const outcomes = orders(body).map((rows) => {
      const answers = {};
      let p;
      for (let round = 0; round < 5; round++) {
        p = read("groups", [heading, ...rows], answers);
        const open = questionCards(p, terms, answers).filter((c) => !c.answer);
        if (!open.length) {
          break;
        }
        open.forEach((c) => {
          answers[c.id] = c.daysQuestion
            ? "Monday,Tuesday"
            : c.options[0].value;
        });
      }
      p.rows
        .filter((r) => r.status === "changed")
        .forEach((r) =>
          r.differences.forEach((d) => {
            answers[d.id] = CHANGE;
          })
        );
      p = read("groups", [heading, ...rows], answers);
      expect(waitingFor(p, terms, answers)).toEqual([]);
      const plan = listPlan(p, answers, "s1", "f");
      const keys = new Set(plan.records.map((r) => r.key).filter((k) => k));
      plan.records.forEach((r) =>
        Object.values(r.refs || {})
          .filter((v) => v && v.includes(":"))
          .forEach((v) => expect(keys.has(v)).toBe(true))
      );
      return plan.records
        .map((r) => `${r.kind} ${(r.id || r.key).toLowerCase()}`)
        .sort();
    });
    outcomes.forEach((o) => expect(o).toEqual(outcomes[0]));
    expect(outcomes[0]).toEqual([
      "Division division:p1:middlers",
      "Division division:program:teens:hikers",
      "Group g1",
      "Group group:p1:bunk 9",
      "Group group:program:teens:tent 1",
      "Group group:program:teens:tent 2",
      "Program program:teens"
    ]);
  });
});

describe("the walkthrough's sample lists for a program (docs/samples/lists)", () => {
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const SAMPLES = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "docs",
    "samples",
    "lists"
  );
  const sample = (name) =>
    csvFile(name, readFileSync(join(SAMPLES, name), "utf8"));
  const at = (h, m) => (h * 60 + m) * MS;

  // Maple Grove after "Import last year" (walkthrough section 14).
  function mapleGrove() {
    const blocks = [
      ["Period 1", 9, 0, 9, 45],
      ["Period 2", 9, 50, 10, 35],
      ["Period 3", 10, 40, 11, 25],
      ["Lunch", 11, 30, 12, 15],
      ["Period 4", 12, 20, 13, 5],
      ["Period 5", 13, 10, 13, 55],
      ["Period 6", 14, 0, 14, 45]
    ].map(([name, h1, m1, h2, m2], i) => ({
      Id: `tb${i + 1}`,
      Name: name,
      StartTime__c: at(h1, m1),
      EndTime__c: at(h2, m2),
      PartOfDay__c: h1 < 12 ? "Morning" : "Afternoon"
    }));
    const division = (id, name, bunks) => ({
      division: { Id: id, Name: name },
      groups: bunks.map((n) => ({
        Id: `g${n}`,
        Name: `Bunk ${n}`,
        Availability__c: "AllDay"
      }))
    });
    return {
      season: { Id: "s1", Camp__c: "c1" },
      locationTypes: [],
      locations: [],
      activities: [],
      programs: [
        program("p1", "Main", DAYS, {
          timeBlocks: blocks,
          divisions: [
            division("d1", "Juniors", [1, 2, 3]),
            division("d2", "Seniors", [4, 5, 6])
          ],
          fixedActivities: [
            { Id: "f1", Name: "Lunch", TimeBlock__c: "tb4", Length__c: 1 }
          ],
          recurringActivities: [
            {
              Id: "r1",
              Name: "Morning meeting",
              TimeBlock__c: "tb1",
              Length__c: 1,
              Monday__c: true,
              Coverages__r: []
            }
          ]
        })
      ]
    };
  }
  const readSample = (screenKey, name) =>
    listProposal({
      screenKey,
      file: sample(name),
      setup: mapleGrove(),
      terms,
      answers: {}
    });
  const statuses = (p) => p.rows.map((r) => [r.name, r.status]);

  it("program days", () => {
    const p = readSample("programs", "maple-grove-program-days.csv");
    expect(statuses(p)).toEqual([
      ["Main", "unchanged"],
      ["Teens", "new"],
      ["Weekend", "unreadable"]
    ]);
  });

  it("units", () => {
    const p = readSample("divisions", "maple-grove-units.csv");
    expect(statuses(p)).toEqual([
      ["Juniors", "unchanged"],
      ["Middlers", "new"],
      ["Hikers", "asked"]
    ]);
    expect(questionCards(p, terms, {}).map((c) => c.title)).toEqual([
      "“Explorers” is a new program. Which days?"
    ]);
  });

  it("bunks", () => {
    const p = readSample("groups", "maple-grove-bunks.csv");
    expect(statuses(p)).toEqual([
      ["Bunk 1", "unchanged"],
      ["Bunk 3", "changed"],
      ["Bunk 7", "new"],
      ["Bunk 8", "unreadable"]
    ]);
    expect(p.alsoAdd.division).toEqual([{ programId: "p1", name: "Middlers" }]);
  });

  it("time blocks", () => {
    const p = readSample("timeBlocks", "maple-grove-time-blocks.csv");
    expect(statuses(p)).toEqual([
      ["Period 1", "unchanged"],
      ["Period 2", "changed"],
      ["Late pickup", "asked"],
      ["Swim time", "unreadable"]
    ]);
  });

  it("fixed activities", () => {
    const p = readSample("fixedActivities", "maple-grove-fixed.csv");
    expect(statuses(p)).toEqual([
      ["Lunch", "changed"],
      ["Snack", "asked"]
    ]);
    expect(questionCards(p, terms, {}).map((c) => c.title)).toEqual([
      "“Snack break” is a new time block in Main. When is it?"
    ]);
  });

  it("recurring activities", () => {
    const p = readSample("recurringActivities", "maple-grove-recurring.csv");
    expect(statuses(p)).toEqual([
      ["Morning meeting", "changed"],
      ["Rest hour", "asked"],
      ["Campfire", "unreadable"]
    ]);
    expect(questionCards(p, terms, {}).map((c) => c.title)).toEqual([
      "“Middlers” is new in Main. What is it?"
    ]);
  });
});
