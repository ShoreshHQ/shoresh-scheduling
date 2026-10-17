// Last year's week as a version (slice 4b part 2): the grids, the week they go to, what could
// not be placed and why, and the answers to remember.
import {
  buildProposal,
  LEAVE_OUT,
  planFor,
  questionCards,
  unplacedLines
} from "c/shoreshImportEngine";
import {
  csv,
  existingSetup,
  samples,
  terms,
  findSamplesFrom
} from "./data/samples";

findSamplesFrom(__dirname);

const WEEK1 = {
  Id: "w1",
  Name: "Week 1",
  StartDate__c: "2027-06-28",
  EndDate__c: "2027-07-02"
};
const WEEK2 = {
  Id: "w2",
  Name: "Week 2",
  StartDate__c: "2027-07-05",
  EndDate__c: "2027-07-09"
};

function propose(files, existing, answers = {}) {
  return buildProposal({ files, existing, terms, answers });
}

/** The rules ScheduleGridRules checks on the server (repo docs/adr/0005), for one grid. */
function checkGrid(grid) {
  expect(grid.r).toHaveLength(grid.g.length);
  grid.r.forEach((row) => {
    const cells = row.split(",");
    expect(cells).toHaveLength(grid.b.length);
    cells.forEach((cell, c) => {
      if (cell === "^") {
        expect(c).toBeGreaterThan(0);
        expect(cells[c - 1]).not.toBe("");
      } else if (cell !== "") {
        expect(Number(cell)).toBeGreaterThanOrEqual(1);
        expect(Number(cell)).toBeLessThanOrEqual(grid.i.length);
      }
    });
  });
  grid.b.forEach(([id, name, start, end]) => {
    expect(id).toBeTruthy();
    expect(name).toBeTruthy();
    expect(start).toMatch(/^\d\d:\d\d$/);
    expect(end).toMatch(/^\d\d:\d\d$/);
  });
  grid.i.forEach(([kind, id, name]) => {
    expect(name).toBeTruthy();
    expect(["A", "F", "R"].includes(kind) ? !!id : id === "").toBe(true);
  });
}

describe("the imported version", () => {
  const answers = {
    "similar|activity|music|musik|Music|Musik": "a",
    "kind|Library time": "recurring"
  };

  it("is one version for the week, named after the file, a grid per day the program runs", () => {
    const p = propose(
      samples("all-camp"),
      existingSetup({ weeks: [WEEK1] }),
      answers
    );
    expect(p.versions).toHaveLength(1);
    const [v] = p.versions;
    expect(v).toMatchObject({
      name: "Imported from maple-grove-2026-all-camp.xlsx",
      weekId: "w1",
      programKey: "P0"
    });
    expect(v.days.map((d) => d.date)).toEqual([
      "2027-06-28",
      "2027-06-29",
      "2027-06-30",
      "2027-07-01",
      "2027-07-02"
    ]);
    v.days.forEach((d) => checkGrid(d.grid));
  });

  it("each cell names what the file had: set-up items by key, the rest as not set up yet", () => {
    const [v] = propose(
      samples("all-camp"),
      existingSetup({ weeks: [WEEK1] }),
      answers
    ).versions;
    const kinds = (day) =>
      new Map(
        v.days[day].grid.i.map(([kind, key, name]) => [name, [kind, key]])
      );
    expect(kinds(0).get("Lunch")).toEqual(["F", "F|P0|Lunch"]);
    expect(kinds(0).get("Morning meeting")[0]).toBe("R");
    expect(kinds(0).get("Swim")).toEqual(["A", "A|Swim"]);
    expect(kinds(1).get("Chugim")).toEqual(["E", ""]);
    expect(kinds(3).get("Zoo trip")).toEqual(["T", ""]);
    expect(kinds(4).get("Field day")).toEqual(["D", ""]);
    // Boating runs two blocks: its second block carries on.
    const monday = v.days[0].grid;
    const bunk4 = monday.g.findIndex(([, name]) => name === "Bunk 4");
    expect(monday.r[bunk4].split(",").slice(1, 3)[1]).toBe("^");
    // Musik was answered "same as Music": the cell says Music.
    expect(v.days[3].grid.i.some(([, , name]) => name === "Musik")).toBe(false);
  });

  it("a week named in the files goes to the season's week of that name, without asking", () => {
    const files = samples("all-camp").map((f) => ({
      ...f,
      name: `Week 2 ${f.name}`
    }));
    const p = propose(files, existingSetup({ weeks: [WEEK1, WEEK2] }), answers);
    expect(p.versions.map((v) => v.weekId)).toEqual(["w2"]);
    expect(
      questionCards(p, terms, answers).some((c) => c.id.startsWith("week|"))
    ).toBe(false);
  });

  it("otherwise asks which week, by its name; leaving it out keeps the setup but no version", () => {
    const existing = existingSetup({ weeks: [WEEK1, WEEK2] });
    const p = propose(samples("all-camp"), existing, answers);
    const card = questionCards(p, terms, answers).find((c) =>
      c.id.startsWith("week|")
    );
    expect(card.title).toBe("Which week is last year's schedule?");
    expect(card.options.map((o) => o.value)).toEqual([
      "Week 1",
      "Week 2",
      LEAVE_OUT
    ]);
    expect(
      propose(samples("all-camp"), existing, {
        ...answers,
        [card.id]: "Week 2"
      }).versions[0].weekId
    ).toBe("w2");
    const left = propose(samples("all-camp"), existing, {
      ...answers,
      [card.id]: LEAVE_OUT
    });
    expect(left.versions).toEqual([]);
    expect(left.fixed.map((f) => f.name)).toEqual(["Lunch"]);
    expect(unplacedLines(left, terms)[0].why).toBe("no week was chosen for it");
  });

  it("a season with no weeks keeps no version, and says so", () => {
    const p = propose(samples("all-camp"), existingSetup(), answers);
    expect(p.versions).toEqual([]);
    expect(p.noWeeks).toBe(true);
  });

  it("placements that cannot be placed are listed with the reason, never dropped", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", "Swim", "Art"],
      ["12:00-12:45", "Lunch", "Lunch"]
    ];
    const files = ["Monday", "Tuesday", "Saturday"].map((d) =>
      csv(`${d}.csv`, rows)
    );
    const p = propose(files, existingSetup({ weeks: [WEEK1] }));
    const lines = unplacedLines(p, terms);
    expect(lines.map((l) => [l.name, l.count, l.why])).toEqual([
      ["Art", 1, "Shoresh plans Monday to Friday"],
      ["Lunch", 2, "Shoresh plans Monday to Friday"],
      ["Swim", 1, "Shoresh plans Monday to Friday"]
    ]);
    expect(lines[0].whereText).toBe("Bunk 2, Saturday, 9:00-9:45");
  });

  it("a name left out for now is not placed, and is listed", () => {
    const p = propose(samples("all-camp"), existingSetup({ weeks: [WEEK1] }), {
      ...answers,
      "kind|Library time": LEAVE_OUT
    });
    const library = unplacedLines(p, terms).find(
      (l) => l.name === "Library time"
    );
    expect(library).toMatchObject({ count: 3, why: "left out for now" });
  });
});

describe("answers to remember", () => {
  it("the save sends the answers given, and forgets the ones left out", () => {
    const given = {
      "similar|activity|music|musik|Music|Musik": "a",
      "kind|Library time": LEAVE_OUT
    };
    const p = propose(
      samples("all-camp"),
      existingSetup({ weeks: [WEEK1] }),
      given
    );
    const plan = planFor(p, existingSetup({ weeks: [WEEK1] }), "s", {
      answers: given,
      fileNames: ["a.xlsx"]
    });
    expect(plan.remember).toEqual([
      { key: "similar|activity|music|musik|Music|Musik", answer: "a" }
    ]);
    expect(plan.forget).toEqual(["kind|Library time"]);
    expect(plan.files).toBe("a.xlsx");
    expect(plan.versions).toHaveLength(1);
  });
});

describe("part 2 review", () => {
  const answers = {
    "similar|activity|music|musik|Music|Musik": "a",
    "kind|Library time": "recurring"
  };
  const existing = existingSetup({ weeks: [WEEK1] });

  it("every key in a version grid is a record the save creates or one the camp has", () => {
    const p = propose(samples("all-camp"), existing, answers);
    const plan = planFor(p, existing, "s", { answers });
    const planned = new Set(
      [
        "programs",
        "timeBlocks",
        "divisions",
        "groups",
        "locations",
        "activities",
        "fixedActivities",
        "recurringActivities"
      ].flatMap((list) => plan[list].map((e) => e.key))
    );
    for (const day of plan.versions.flatMap((v) => v.days)) {
      const keys = [
        ...day.grid.b.map((b) => b[0]),
        ...day.grid.g.map((g) => g[0]),
        ...day.grid.i.map((i) => i[1]).filter(Boolean)
      ];
      keys.forEach((key) => expect(planned.has(key)).toBe(true));
    }
  });

  it("two recurring records differing only in length have their own keys", () => {
    const rows = (span) => [
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", "Swim", "Swim"],
      ["9:50-10:35", span ? "Swim" : "Art", "Soccer"],
      ["12:00-12:45", "Lunch", "Lunch"]
    ];
    const files = ["Monday", "Wednesday"].map((d) =>
      csv(`${d}.csv`, [["", "Juniors", "Seniors"], ...rows(true)])
    );
    files.push(
      ...["Tuesday", "Thursday", "Friday"].map((d) =>
        csv(`${d}.csv`, [["", "Juniors", "Seniors"], ...rows(false)])
      )
    );
    const p = propose(files, existing, { "kind|Swim": "recurring" });
    const swim = p.recurring.filter((r) => r.name === "Swim");
    expect(new Set(swim.map((r) => r.key)).size).toBe(swim.length);
  });

  it("two weeks of the files that go to the same season week: the second is listed, not saved", () => {
    const w1 = samples("all-camp").map((f) => ({
      ...f,
      name: `Week 1 ${f.name}`
    }));
    const w2 = samples("all-camp").map((f) => ({
      ...f,
      name: `Week 2 ${f.name}`
    }));
    const card = (p) =>
      questionCards(p, terms, answers).find((c) => c.id === "week|Week 2");
    const first = propose([...w1, ...w2], existing, answers);
    const p = propose([...w1, ...w2], existing, {
      ...answers,
      [card(first).id]: "Week 1"
    });
    expect(p.versions).toHaveLength(1);
    expect(
      unplacedLines(p, terms).some(
        (l) => l.why === "another week of the files went to the same week"
      )
    ).toBe(true);
  });
});
