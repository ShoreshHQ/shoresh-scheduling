import {
  buildProposal,
  planFor,
  questionCards,
  foundLists,
  unplacedLines
} from "./data/engine";
import {
  csv,
  existingSetup,
  program as campProgram,
  terms
} from "./data/samples";
import {
  BRING_BACK,
  DELETED,
  deletedKey,
  deletionsIn,
  deletedAs,
  broughtBack
} from "../deleted";

/** A program deleted on its setup screen, remembered with its groups (Apex SetupDeletions). */
function deletedProgram(name, groups, value = DELETED) {
  const answers = { [deletedKey("Program", "", name)]: value };
  groups.forEach((g) => {
    answers[deletedKey("ProgramGroup", name, g)] = DELETED;
  });
  return answers;
}

// Things you delete stay deleted (Greg, decision 45): a setup item deleted on a setup screen is
// remembered as an answer, and a later import leaves it out and says so, until brought back.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function files() {
  const rows = [
    ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
    ["9:00-9:45", "Swim (Pool)", "Art (Art room)", "Swim (Pool)"],
    ["10:00-10:45", "Art (Art room)", "Swim (Pool)", "Archery"],
    ["12:00-12:45", "Lunch (Hall)", "Lunch (Hall)", "Lunch (Hall)"]
  ];
  return DAYS.map((d) => csv(`${d}.csv`, rows));
}

/** A season with its first week, so last year's week has somewhere to go. */
function season(extra = {}) {
  return existingSetup({
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      }
    ],
    ...extra
  });
}

function propose(answers, existing = season()) {
  return buildProposal({ files: files(), existing, terms, answers });
}

/** Every question answered as the director would, so the import can be saved. */
function answered(answers) {
  const all = { ...answers };
  for (let i = 0; i < 4; i++) {
    const p = propose(all);
    for (const card of questionCards(p, terms, all)) {
      if (!all[card.id] && card.options && card.options.length) {
        all[card.id] =
          card.preselected ||
          (card.id.startsWith("kind|") ? "activity" : card.options[0].value);
      }
    }
  }
  return all;
}

describe("things you delete stay deleted", () => {
  it("keys compare as similar names do, and only an answer of deleted counts", () => {
    const key = deletedKey("Group", "Main", "Bunk 1");
    expect(key).toBe("deleted|Group|Main|Bunk 1");
    const deletions = deletionsIn({
      [key]: DELETED,
      [deletedKey("Activity", "", "Swim")]: BRING_BACK,
      "kind|Swim": DELETED
    });
    expect(deletedAs(deletions, "Group", "main", "bunk-1")).toBe(key);
    expect(deletedAs(deletions, "Group", "Seniors", "Bunk 1")).toBeNull();
    expect(deletedAs(deletions, "Activity", "", "Swim")).toBeNull();
    expect(
      broughtBack({ [deletedKey("Activity", "", "Swim")]: BRING_BACK })
    ).toEqual(["deleted|Activity||Swim"]);
  });

  // MEMO-4.2
  it("leaves out a deleted activity, group, and place, and lists each once as deleted before", () => {
    const before = propose({});
    const program = before.timetables[0].name;
    const answers = {
      [deletedKey("Activity", "", "Archery")]: DELETED,
      [deletedKey("Group", program, "Bunk 3")]: DELETED,
      [deletedKey("Location", "", "Pool")]: DELETED,
      "place|Pool": "add",
      "place|Hall": "add"
    };
    const p = propose(answers);
    expect(p.deleted.map((d) => [d.kind, d.name])).toEqual([
      ["Group", "Bunk 3"],
      ["Location", "Pool"]
    ]);
    // Archery is only Bunk 3's: with Bunk 3 left out, the file has no Archery to add.
    expect(p.activities.map((a) => a.name)).not.toContain("Archery");
    expect(p.groups.find((g) => g.name === "Bunk 3")).toMatchObject({
      leftOut: true,
      deleted: deletedKey("Group", program, "Bunk 3")
    });
    // Never silently: the deleted place is not offered, not even with its remembered tick.
    expect(p.offeredPlaces.map((x) => x.name)).toEqual(["Art room", "Hall"]);
    expect(p.locations.map((l) => l.name)).toEqual(["Hall"]);
    // No question about a deleted group's division.
    expect(p.asks.some((a) => a.id === "division|Bunk 3")).toBe(false);
    const groups = foundLists(p, terms).find((l) => l.key === "groups");
    expect(groups.items.find((i) => i.name === "Bunk 3").tag).toBe(
      "deleted before"
    );
    const lines = unplacedLines(p, terms);
    expect(lines.find((l) => l.name === "Archery").why).toBe(
      "its group was deleted before; not brought back"
    );
  });

  it("leaves out a deleted activity and says why its placements are not in the version", () => {
    const answers = answered({
      [deletedKey("Activity", "", "Archery")]: DELETED
    });
    const p = propose(answers);
    expect(p.deleted).toEqual([
      {
        key: deletedKey("Activity", "", "Archery"),
        kind: "Activity",
        name: "Archery",
        program: ""
      }
    ]);
    expect(p.activities.map((a) => a.name)).not.toContain("Archery");
    expect(p.leftOutNames).not.toContain("Archery");
    expect(p.asks.some((a) => a.id.startsWith("kind|Archery"))).toBe(false);
    const archery = unplacedLines(p, terms).find((l) => l.name === "Archery");
    expect(archery.why).toBe("deleted before; not brought back");
    const plan = planFor(p, season(), "s", { answers });
    expect(plan.activities.map((a) => a.name)).not.toContain("Archery");
    // Nothing about the deletion is remembered again or forgotten.
    expect(plan.remember.map((r) => r.key)).not.toContain(
      deletedKey("Activity", "", "Archery")
    );
    expect(plan.forget).toEqual([]);
  });

  it("a deleted fixed or recurring activity of the program is left out the same way", () => {
    const program = propose({}).timetables[0].name;
    const p = propose({
      [deletedKey("FixedActivity", program, "Lunch")]: DELETED
    });
    expect(p.deleted.map((d) => [d.kind, d.name, d.program])).toEqual([
      ["FixedActivity", "Lunch", program]
    ]);
    expect(p.fixed.map((f) => f.name)).not.toContain("Lunch");
    // Another program's Lunch is not this one.
    const other = propose({
      [deletedKey("FixedActivity", "Seniors", "Lunch")]: DELETED
    });
    expect(other.deleted).toEqual([]);
  });

  it("a deleted time block is left out with what is in it", () => {
    const program = propose({}).timetables[0].name;
    const block = propose({}).timetables[0].blocks[1].name;
    const p = propose({ [deletedKey("TimeBlock", program, block)]: DELETED });
    expect(p.timetables[0].blocks[1]).toMatchObject({ leftOut: true });
    expect(p.deleted.map((d) => [d.kind, d.name])).toEqual([
      ["TimeBlock", block]
    ]);
    const lines = unplacedLines(p, terms);
    expect(lines.length).toBeGreaterThan(0);
    expect(
      lines.every(
        (l) => l.why === "its time block was deleted before; not brought back"
      )
    ).toBe(true);
  });

  it("what the camp has wins over a deletion: only an item the import would add is left out", () => {
    const existing = season({
      activities: [{ Id: "a1", Name: "Archery", Length__c: 1 }]
    });
    const p = propose(
      { [deletedKey("Activity", "", "Archery")]: DELETED },
      existing
    );
    expect(p.deleted).toEqual([]);
  });

  it("Bring back adds it as any other item, and the save forgets the deletion", () => {
    const key = deletedKey("Activity", "", "Archery");
    const answers = answered({ [key]: BRING_BACK });
    const p = propose(answers);
    expect(p.deleted).toEqual([]);
    // Bunk 3 has Archery at the same time every day: back as its set time, a recurring activity.
    expect(p.recurring.map((a) => a.name)).toContain("Archery");
    const plan = planFor(p, season(), "s", { answers });
    expect(plan.recurringActivities.map((a) => a.name)).toContain("Archery");
    expect(plan.forget).toEqual([key]);
  });
});

describe("a deleted program stays deleted", () => {
  const juniors = deletedKey("Program", "", "Juniors");
  const bunks = ["Bunk 1", "Bunk 2", "Bunk 3"];

  it("last year's timetable for its groups is left out whole, under its own name, without asking", () => {
    const answers = deletedProgram("Juniors", bunks);
    const p = propose(answers);
    expect(p.timetables[0]).toMatchObject({
      name: "Juniors",
      leftOut: true,
      deleted: juniors
    });
    expect(p.asks.some((a) => a.type === "program")).toBe(false);
    expect(p.deleted).toEqual([
      { key: juniors, kind: "Program", name: "Juniors", program: "" }
    ]);
    expect(p.groups.filter((g) => !g.leftOut)).toEqual([]);
    const lines = unplacedLines(p, terms);
    expect(lines.length).toBeGreaterThan(0);
    expect(
      lines.every(
        (l) => l.why === "its program was deleted before; not brought back"
      )
    ).toBe(true);
    const plan = planFor(p, season(), "s", { answers });
    expect(plan.programs).toEqual([]);
    expect(plan.forget).toEqual([]);
  });

  it("is known by any of its groups, and not by a program the camp has", () => {
    // One group in common is enough when no program of the camp's has any of them.
    expect(
      propose(deletedProgram("Juniors", ["Bunk 2", "Bunk 9"])).timetables[0]
        .deleted
    ).toBe(juniors);
    // Groups remembered with another program: not this timetable's.
    expect(
      propose(deletedProgram("Juniors", ["Bunk 7"])).timetables[0].deleted
    ).toBeUndefined();
    // A program of that name set up again by hand: what the camp has wins.
    const again = season({ programs: [campProgram("p1", "Juniors")] });
    const p = propose(deletedProgram("Juniors", bunks), again);
    expect(p.timetables[0].leftOut).toBe(false);
    expect(p.deleted).toEqual([]);
    // Its groups in a program the camp has: that program's, not the deleted one's.
    const owned = season({
      programs: [
        campProgram("p2", "Main", {
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
        })
      ]
    });
    expect(
      propose(deletedProgram("Juniors", bunks), owned).timetables[0].name
    ).toBe("Main");
  });

  it("Bring back adds it again under its own name, and the save forgets it with its groups", () => {
    const answers = answered(deletedProgram("Juniors", bunks, BRING_BACK));
    const p = propose(answers);
    expect(p.timetables[0]).toMatchObject({ name: "Juniors", leftOut: false });
    expect(p.deleted).toEqual([]);
    const plan = planFor(p, season(), "s", { answers });
    expect(plan.programs.map((x) => x.name)).toEqual(["Juniors"]);
    expect(plan.forget).toEqual(
      [
        juniors,
        ...bunks.map((g) => deletedKey("ProgramGroup", "Juniors", g))
      ].sort()
    );
  });
});
