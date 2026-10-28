// The save request the screen builds (planFor) against what the server reads
// (ImportPlan, ImportStructureWrites, ImportItemWrites): every list and field name the Apex reads
// must be one the plan sends (PR 15 review, test gap). Reads the Apex source itself, so a
// rename on either side fails here.
import { autoAppliedIn, withLearning } from "c/shoreshPatterns";
import { readFileSync } from "fs";
import { join } from "path";
import { buildProposal, customKeys, planFor } from "./data/engine";
import { NAMESPACE_PREFIX } from "c/shoreshSchema";
import {
  csv,
  existingSetup,
  program,
  samples,
  terms,
  findSamplesFrom
} from "./data/samples";

findSamplesFrom(__dirname);

const CLASSES = join(__dirname, "..", "..", "..", "classes");
const apex = [
  "ImportStructureWrites",
  "ImportItemWrites",
  "ImportVersionWrites",
  "ImportAnswers",
  "ImportSetupSaves"
].map((name) => readFileSync(join(CLASSES, `${name}.cls`), "utf8"));

function readByApex(pattern) {
  return new Set(
    apex.flatMap((source) => [...source.matchAll(pattern)].map((m) => m[1]))
  );
}

/** A plan with every kind of entry: new records, a change of each kind, a move, a who-list. */
function fullPlan() {
  const at = (h, m = 0) => (h * 60 + m) * 60000;
  const existing = existingSetup({
    programs: [
      program("p1", "Main", {
        blocks: [["tb1", "Period 1", 9 * 60, 9 * 60 + 50]].map(
          ([id, n, s, e]) => [id, n, s, e]
        ),
        days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
        divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]],
        fixed: [{ Id: "f1", Name: "Lunch", TimeBlock__c: "tb1", Length__c: 1 }]
      })
    ],
    activities: [{ Id: "a1", Name: "Boating", Length__c: 1 }],
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      }
    ]
  });
  existing.programs[0].timeBlocks.forEach((b) => {
    b.StartTime__c = at(9);
    b.EndTime__c = at(9, 50);
  });
  const files = samples("all-camp");
  const first = buildProposal({ files, existing, terms, answers: {} });
  const answers = {};
  for (const ask of first.asks) {
    answers[ask.id] = ask.type === "kind" ? "recurring" : "change";
  }
  first.offeredPlaces.forEach((p) => {
    answers[p.id] = "add";
  });
  return planFor(
    buildProposal({ files, existing, terms, answers }),
    existing,
    "season1",
    {
      answers,
      fileNames: files.map((f) => f.name)
    }
  );
}

/** A new camp whose file names places, all ticked: the locations list. */
function placesPlan() {
  const rows = [
    ["Time", "Bunk 1", "Bunk 2"],
    ["9:00-9:45", "Swim (Pool)", "Art (Art room)"],
    ["12:00-12:45", "Lunch (Hall)", "Lunch (Hall)"]
  ];
  const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
  const answers = {
    "place|Pool": "add",
    "place|Art room": "add",
    "place|Hall": "add"
  };
  return planFor(
    buildProposal({ files, existing: null, terms, answers }),
    null,
    "s"
  );
}

/** A new camp whose Bunk 2 is here only for the morning (INGEST-2.9): a group's availability. */
function halfDayPlan() {
  const rows = [
    ["Time", "Bunk 1", "Bunk 2"],
    ["9:00-9:45", "Swim", "Art"],
    ["12:00-12:45", "Art", ""]
  ];
  const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
  return planFor(
    buildProposal({ files, existing: null, terms, answers: {} }),
    null,
    "s"
  );
}

describe("the save request matches what the server reads", () => {
  const plan = fullPlan();

  it("names no field as text: the plan uses its own keys, never a bare field name", () => {
    // Today the import's plan names fields by its own words (name, blockKey...), not field
    // names; if it ever writes one, it must be the package's (prefixed in the namespaced run).
    const written = customKeys([plan, placesPlan()]);
    expect(written.filter((k) => !k.startsWith(NAMESPACE_PREFIX))).toEqual(
      NAMESPACE_PREFIX ? [] : written
    );
    expect(
      customKeys({ a: [{ shoresh__X__c: 1, Name: 2, Y__r: {} }] })
    ).toEqual(["shoresh__X__c", "Y__r"]);
  });
  // The screens add what the pattern layer needs to each answer (c/shoreshPatterns withLearning).
  const learning = {
    remember: withLearning(
      [{ key: "kind|Lunch 2", answer: "recurring" }],
      [{ id: "kind|Lunch 2", learn: { shape: "weeks|some|one" } }],
      { "kind|Lunch 2": { value: "recurring" } }
    ),
    // The setup import adds what it auto-applied (MEMO-7.5), apart from the answers.
    autoApplied: autoAppliedIn([{ key: "kind|Lunch 3", answer: "fixed" }], {
      "kind|Lunch 3": { value: "fixed" }
    })
  };
  const sent = new Set(
    [plan, placesPlan(), halfDayPlan(), learning].flatMap((one) =>
      Object.values(one)
        .filter(Array.isArray)
        .flatMap((list) => list.flatMap((entry) => Object.keys(entry)))
    )
  );

  it("every top-level value the server reads is in the plan", () => {
    for (const name of readByApex(/plan\.texts?\('(\w+)'\)/g)) {
      expect(Object.keys(plan)).toContain(name);
    }
    expect(plan.versions.length).toBeGreaterThan(0);
    expect(plan.remember.length).toBeGreaterThan(0);
  });

  it("every list the server reads is in the plan", () => {
    for (const list of readByApex(/plan\.entries\('(\w+)'\)/g)) {
      expect([...Object.keys(plan), ...Object.keys(learning)]).toContain(list);
    }
  });

  it("every field the server reads is sent", () => {
    const fields = readByApex(
      /entry\w*\.(?:text|whole|texts|clock)\('(\w+)'\)/g
    );
    expect(fields.size).toBeGreaterThan(10);
    for (const field of fields) {
      expect(sent).toContain(field);
    }
  });

  it("new entries carry a key, changes an id", () => {
    const setupLists = [
      "programs",
      "timeBlocks",
      "divisions",
      "groups",
      "locations",
      "activities",
      "fixedActivities",
      "recurringActivities"
    ];
    for (const name of setupLists) {
      for (const entry of plan[name]) {
        // ImportPlan.Entry.isNew() is "no id": every entry says, one way or the other.
        expect(`${name}:${"id" in entry}`).toBe(`${name}:true`);
        const needsKey = entry.id === null && !/Activities$/.test(name);
        expect(needsKey ? !!entry.key : true).toBe(true);
      }
    }
  });
});
