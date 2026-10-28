// docs/import/review.md INGEST-5.7 and 5.8: a second import updates what an earlier import
// brought in and no one changed since, and lists what the new file lacks with Keep or Remove.
// Made or changed by hand (not in `imported`) is asked as before and never listed.
import {
  buildProposal,
  planFor,
  questionCards,
  readAsGroups
} from "./data/engine";
import {
  existingSetup,
  program,
  samples,
  terms,
  findSamplesFrom
} from "./data/samples";

findSamplesFrom(__dirname);

const at = (h, m = 0) => h * 60 + m;
const BLOCKS = [
  ["tb1", "Period 1", at(9), at(9, 45)],
  ["tb2", "Period 2", at(9, 50), at(10, 35)],
  ["tb3", "Period 3", at(10, 40), at(11, 25)],
  ["tb4", "Lunch", at(11, 30), at(12, 15)],
  ["tb5", "Period 4", at(12, 20), at(13, 5)],
  ["tb6", "Period 5", at(13, 10), at(13, 55)],
  ["tb7", "Period 6", at(14), at(14, 45)]
];

function camp() {
  return existingSetup({
    programs: [
      program("p1", "Main", {
        blocks: BLOCKS,
        fixed: [
          { Id: "f1", Name: "Lunch", TimeBlock__c: "tb5", Length__c: 1 },
          { Id: "f2", Name: "Flag", TimeBlock__c: "tb1", Length__c: 1 }
        ]
      })
    ],
    activities: [
      { Id: "a1", Name: "Boating", Length__c: 1 },
      { Id: "a2", Name: "Pottery", Length__c: 1 }
    ]
  });
}

function propose(imported, answers = {}, existing = camp()) {
  return buildProposal({
    files: samples("all-camp"),
    existing,
    terms,
    answers,
    imported
  });
}

const asked = (p) =>
  questionCards(p, terms, {})
    .filter((c) => c.id.startsWith("change|"))
    .map((c) => c.id.split("|")[1]);

function updatedLines(p) {
  const group = readAsGroups(p, terms, []).find((g) => g.key === "updated");
  return group ? group.lines : [];
}

describe("INGEST-5.7: a second import updates what an earlier import brought in", () => {
  it("INGEST-5.7: untouched since the earlier import: updated without asking, and listed with Keep as it is", () => {
    const p = propose(["f1", "a1"]);
    expect(asked(p)).toEqual([]);
    expect(updatedLines(p).map((l) => [l.name, l.answer])).toEqual([
      ["Lunch", "change"],
      ["Boating", "change"]
    ]);
    const plan = planFor(p, camp(), "s");
    // Marked as made without asking, so the server checks it is still the import's.
    expect(plan.fixedActivities).toEqual([
      { id: "f1", blockKey: "tb4", length: 1, auto: true, name: "Lunch" }
    ]);
    expect(plan.activities.find((a) => a.id === "a1")).toEqual(
      expect.objectContaining({ id: "a1", length: 2, auto: true })
    );
  });

  it("INGEST-5.7: Keep as it is leaves it as it is", () => {
    const lunch = updatedLines(propose(["f1"])).find((l) => l.name === "Lunch");
    const answers = { [lunch.id]: "keep" };
    const p = propose(["f1"], answers);
    expect(planFor(p, camp(), "s").fixedActivities).toEqual([]);
    expect(updatedLines(p).find((l) => l.name === "Lunch").answer).toBe("keep");
    expect(asked(p)).not.toContain("fixed");
  });

  it("INGEST-5.7 counter-case: made or changed by hand: asked, never changed unasked", () => {
    const p = propose([]);
    expect(asked(p).sort()).toEqual(["activity", "fixed"]);
    expect(updatedLines(p)).toEqual([]);
    const plan = planFor(p, camp(), "s");
    expect(plan.fixedActivities).toEqual([]);
    expect(plan.activities.find((a) => a.id === "a1")).toBeUndefined();
  });
});

describe("INGEST-5.8: what an earlier import brought in that the new file lacks", () => {
  it("INGEST-5.8: listed with Keep, the default; Remove sends it to be removed", () => {
    const p = propose(["a2", "f2"]);
    expect(p.missing.map((m) => [m.kind, m.name, m.program, m.answer])).toEqual(
      [
        ["Activity", "Pottery", "", "keep"],
        ["FixedActivity", "Flag", "Main", "keep"]
      ]
    );
    expect(planFor(p, camp(), "s").removals).toEqual([]);
    const pottery = p.missing.find((m) => m.name === "Pottery");
    const removed = propose(["a2", "f2"], { [pottery.key]: "remove" });
    expect(planFor(removed, camp(), "s").removals).toEqual([
      { id: "a2", name: "Pottery" }
    ]);
  });

  it("INGEST-5.8 counter-case: something still uses it: kept with why, and Remove is not taken", () => {
    const reason = "Pottery is in Chugim's choices";
    const run = (answers) =>
      buildProposal({
        files: samples("all-camp"),
        existing: camp(),
        terms,
        answers,
        imported: ["a2"],
        inUse: { a2: reason }
      });
    const listed = run({}).missing[0];
    expect([listed.name, listed.inUse, listed.answer]).toEqual([
      "Pottery",
      reason,
      "keep"
    ]);
    const tried = run({ [listed.key]: "remove" });
    expect(tried.missing[0].answer).toBe("keep");
    expect(planFor(tried, camp(), "s").removals).toEqual([]);
  });

  it("INGEST-5.8 counter-case: made or changed by hand is never listed", () => {
    expect(propose([]).missing).toEqual([]);
    expect(propose(["a1"]).missing).toEqual([]);
  });

  it("INGEST-5.8 counter-case: a program the files do not cover is not listed", () => {
    const existing = camp();
    existing.programs.push(
      program("p2", "Teens", {
        fixed: [{ Id: "f9", Name: "Flag", TimeBlock__c: "x", Length__c: 1 }]
      })
    );
    const p = propose(["f9"], {}, existing);
    expect(p.missing).toEqual([]);
  });
});
