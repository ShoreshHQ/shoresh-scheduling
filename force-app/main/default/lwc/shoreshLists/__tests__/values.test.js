// Every screen's list saves the same VALUES whatever the row order (coordinator, after #20's
// review): repeats with the same details, rows that differ (asked, answered the same way by
// what they say, not by row number), similar names, and names to add.
import { buildTerms } from "c/shoreshTerms";
import { csvFile, LEAVE_OUT } from "c/shoreshImportEngine";
import { CHANGE, listPlan, listProposal, questionCards } from "./data/lists";

const terms = buildTerms([]);
const MS = 60000;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function setup() {
  const program = { Id: "p1", Name: "Main" };
  DAYS.forEach((d) => {
    program[`${d}__c`] = true;
  });
  return {
    season: { Id: "s1", Camp__c: "c1" },
    locationTypes: [{ Id: "lt1", Name: "Field" }],
    locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }],
    activities: [
      {
        Id: "a1",
        Name: "Music",
        Length__c: 1,
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 2,
        Priority__c: "Low",
        GroupsAtOnce__c: 1
      }
    ],
    programs: [
      {
        program,
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
          }
        ],
        fixedActivities: [],
        recurringActivities: []
      }
    ]
  };
}

function quote(cell) {
  return /[,"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function orders(rows) {
  const result = [rows, [...rows].reverse()];
  for (let seed = 1; seed <= 5; seed++) {
    let x = seed * 7907;
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

/** Answers every question the same way whatever the order: by what an option says. */
const asked = new Set();

function policy(card) {
  if (card.id.startsWith("rowsDiffer|")) {
    asked.add(card.id.split("|")[1]);
    const byText = card.options
      .filter((o) => o.value !== LEAVE_OUT)
      .sort((x, y) =>
        x.label
          .replace(/^Row \d+: /, "")
          .localeCompare(y.label.replace(/^Row \d+: /, ""))
      );
    return byText[0].value;
  }
  if (card.daysQuestion) {
    return "Monday,Tuesday";
  }
  if (card.timesQuestion) {
    return "14:00-14:30";
  }
  return card.options[0].value;
}

/** The saved values, keys and names lower-cased (spelling is settled by its own rule). */
function saved(screenKey, heading, body) {
  const answers = {};
  let p;
  for (let round = 0; round < 6; round++) {
    p = listProposal({
      screenKey,
      file: csvFile(
        "l.csv",
        [heading, ...body].map((r) => r.map(quote).join(",")).join("\n")
      ),
      setup: setup(),
      terms,
      answers
    });
    const open = questionCards(p, terms, answers).filter((c) => !c.answer);
    p.rows
      .filter((r) => r.status === "changed")
      .forEach((r) =>
        r.differences.forEach((d) => {
          if (!answers[d.id]) {
            answers[d.id] = CHANGE;
            open.push(d);
          }
        })
      );
    if (!open.length) {
      break;
    }
    open.forEach((c) => {
      if (c.options) {
        answers[c.id] = policy(c);
      }
    });
  }
  return JSON.stringify(
    listPlan(p, answers, "s1", "f")
      .records.map((r) => ({ ...r, key: r.key && r.key.toLowerCase() }))
      .sort((a, b) => (a.key || a.id).localeCompare(b.key || b.id)),
    (k, v) => (typeof v === "string" ? v.toLowerCase() : v)
  );
}

const LISTS = {
  programs: [
    ["Program", "Runs on"],
    [
      ["Main", "Mon-Fri"],
      ["main", "Mon-Fri"],
      ["Teens", "Mon/Wed"],
      ["teens", "Tue"],
      ["Hikers", "M-W-F"],
      ["hikers", "Mon - Wed - Fri"],
      ["Rovers", "T-Th"],
      ["rovers", "Tue-Thu"]
    ]
  ],
  divisions: [
    ["Division"],
    [["Juniors"], ["Middlers"], ["middlers"], ["Middler"]]
  ],
  groups: [
    ["Division", "Group", "Availability"],
    [
      ["Juniors", "Bunk 1", "All day"],
      ["Juniors", "bunk 1", "Morning only"],
      ["Seniors", "Bunk 9", "All day"],
      ["seniors", "Bunk 9", "All day"]
    ]
  ],
  timeBlocks: [
    ["Time block", "Start", "End"],
    [
      ["Period 1", "9:15", "10:00"],
      ["period 1", "9:30", "10:00"],
      ["Rest", "1:00 PM", "1:30 PM"]
    ]
  ],
  locations: [
    ["Location", "Location type", "Groups that fit"],
    [
      ["Gym", "Field", "2"],
      ["gym", "Field", "3"],
      ["Barn", "Indoors", "1"],
      ["Shed", "indoors", "1"]
    ]
  ],
  activities: [
    ["Activity", "Location", "Rain plan", "Who can do it"],
    [
      ["Swim", "Pool", "Musik", "Juniors"],
      ["swim", "Pool", "Musik", "Juniors"],
      ["Golf", "pool", "", "Middlers"],
      ["golf", "Gym", "", "Middlers"]
    ]
  ],
  fixedActivities: [
    ["Fixed activity", "Time block", "Location"],
    [
      ["Lunch", "Period 1", "Gym"],
      ["lunch", "Snack break", "Gym"],
      ["Snack", "Snack break", "Hall"]
    ]
  ],
  recurringActivities: [
    ["Recurring activity", "Time block", "Runs on", "Who"],
    [
      ["Flag", "Period 1", "Mon", "Juniors"],
      ["flag", "Period 1", "Tue", "Seniors"],
      ["Swim", "Period 1", "Mon", "Juniors"],
      ["Golf", "Period 1", "M-W-F", "Juniors"],
      ["Tennis", "Period 1", "T-Th", "Juniors"],
      ["tennis", "Period 1", "T", "Juniors"],
      ["Archery", "Period 1", "M-W/Tu-Th", "Juniors"],
      ["archery", "Period 1", "M\u2014W/Tu\u2011Th", "Juniors"],
      ["Chess", "Period 1", "MW-F", "Juniors"]
    ]
  ]
};

describe("saved values in any row order", () => {
  Object.entries(LISTS).forEach(([screenKey, [heading, body]]) => {
    it(`${screenKey}`, () => {
      const results = orders(body).map((b) => saved(screenKey, heading, b));
      results.forEach((r) => expect(r).toEqual(results[0]));
      expect(JSON.parse(results[0]).length).toBeGreaterThan(0);
    });
  });

  it("asked about differing rows on the screens whose lists have them", () => {
    expect([...asked].sort()).toEqual(
      [
        "groups",
        "locations",
        "programs",
        "timeBlocks",
        "fixedActivities",
        "recurringActivities",
        "activities"
      ].sort()
    );
  });
});
