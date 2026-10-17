// The save request the screen builds (planFor) against what the server reads
// (ImportPlan, ImportStructureWrites, ImportItemWrites): every list and field name the Apex reads
// must be one the plan sends (PR 15 review, test gap). Reads the Apex source itself, so a
// rename on either side fails here.
import { readFileSync } from "fs";
import { join } from "path";
import { buildProposal, planFor } from "c/shoreshImportEngine";
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
const apex = ["ImportStructureWrites", "ImportItemWrites"].map((name) =>
  readFileSync(join(CLASSES, `${name}.cls`), "utf8")
);

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
    activities: [{ Id: "a1", Name: "Boating", Length__c: 1 }]
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
    "season1"
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

describe("the save request matches what the server reads", () => {
  const plan = fullPlan();
  const sent = new Set(
    [plan, placesPlan()].flatMap((one) =>
      Object.values(one)
        .filter(Array.isArray)
        .flatMap((list) => list.flatMap((entry) => Object.keys(entry)))
    )
  );

  it("every list the server reads is in the plan", () => {
    for (const list of readByApex(/plan\.entries\('(\w+)'\)/g)) {
      expect(Object.keys(plan)).toContain(list);
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
    for (const [name, list] of Object.entries(plan).filter(([, v]) =>
      Array.isArray(v)
    )) {
      for (const entry of list) {
        // ImportPlan.Entry.isNew() is "no id": every entry says, one way or the other.
        expect(`${name}:${"id" in entry}`).toBe(`${name}:true`);
        const needsKey = entry.id === null && !/Activities$/.test(name);
        expect(needsKey ? !!entry.key : true).toBe(true);
      }
    }
  });
});
