// Things you delete stay deleted (Greg, decision 45), on the per-screen list imports and the
// camp workbook: made-up camps only.
import { buildTerms } from "c/shoreshTerms";
import {
  BRING_BACK,
  DELETED,
  csvFile,
  deletedKey
} from "c/shoreshImportEngine";
import {
  listPlan,
  listProposal,
  questionCards,
  waitingFor
} from "./data/lists";

const terms = buildTerms([]);

function csv(rows) {
  return csvFile("list.csv", rows.map((r) => r.join(",")).join("\n"));
}

function setup() {
  return {
    season: { Id: "s1", Name: "Summer", Camp__c: "c1" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [],
    locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }],
    activities: [],
    programs: [
      {
        program: { Id: "p1", Name: "Main" },
        timeBlocks: [],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
          }
        ],
        fixedActivities: [],
        recurringActivities: []
      }
    ],
    schedules: [],
    labels: []
  };
}

function read(screenKey, rows, answers = {}) {
  return listProposal({
    screenKey,
    file: csv(rows),
    setup: setup(),
    terms,
    answers
  });
}

const row = (p, name) => p.rows.find((r) => r.name === name);

describe("a list naming something the camp deleted", () => {
  const swim = deletedKey("Activity", "", "Swim");

  it("leaves the row out as deleted, not new, and lists it once", () => {
    const rows = [["Activity"], ["Swim"], ["Canoeing"]];
    const p = read("activities", rows, { [swim]: DELETED });
    expect(row(p, "Swim").status).toBe("deleted");
    expect(row(p, "Canoeing").status).toBe("new");
    expect(p.deleted).toEqual([
      { key: swim, kind: "Activity", name: "Swim", program: "" }
    ]);
    const plan = listPlan(p, { [swim]: DELETED }, "s1", "f");
    expect(plan.records.map((r) => r.fields.Name)).toEqual(["Canoeing"]);
    expect(plan.forget).toEqual([]);
    expect(plan.remember.map((r) => r.key)).not.toContain(swim);
  });

  it("compares names as similar names do", () => {
    const p = read("activities", [["Activity"], ["swim"]], {
      [swim]: DELETED
    });
    expect(row(p, "swim").status).toBe("deleted");
  });

  it("Bring back adds it, and the save forgets the deletion", () => {
    const rows = [["Activity"], ["Swim"]];
    const answers = { [swim]: BRING_BACK };
    const p = read("activities", rows, answers);
    expect(row(p, "Swim").status).toBe("new");
    expect(p.deleted).toEqual([]);
    const plan = listPlan(p, answers, "s1", "f");
    expect(plan.records.map((r) => r.fields.Name)).toEqual(["Swim"]);
    expect(plan.forget).toEqual([swim]);
  });

  it("something the camp has wins: a deleted name set up again by hand is matched", () => {
    const p = read("locations", [["Location"], ["Gym"]], {
      [deletedKey("Location", "", "Gym")]: DELETED
    });
    expect(row(p, "Gym").status).toBe("unchanged");
    expect(p.deleted).toEqual([]);
  });

  it("a program's own items are deleted per program", () => {
    const rows = [
      ["Division", "Group", "Availability"],
      ["Juniors", "Bunk 7", "All day"]
    ];
    const other = read("groups", rows, {
      [deletedKey("Group", "Teens", "Bunk 7")]: DELETED
    });
    expect(row(other, "Bunk 7").status).toBe("new");
    const key = deletedKey("Group", "Main", "Bunk 7");
    const p = read("groups", rows, { [key]: DELETED });
    expect(row(p, "Bunk 7").status).toBe("deleted");
    expect(p.deleted).toEqual([
      { key, kind: "Group", name: "Bunk 7", program: "Main" }
    ]);
  });

  it("a deleted place a row names is not added: the row is saved without it, and the rest of the list saves", () => {
    const rows = [
      ["Activity", "Location"],
      ["Canoeing", "Lake"],
      ["Sailing", "Lake"],
      ["Archery", "Gym"]
    ];
    const lake = deletedKey("Location", "", "Lake");
    const gone = { [lake]: DELETED };
    const p = read("activities", rows, gone);
    expect(p.alsoAdd.location).toEqual([]);
    // Listed once, with Bring back.
    expect(p.deleted).toEqual([
      { key: lake, kind: "Location", name: "Lake", program: "" }
    ]);
    expect(row(p, "Canoeing")).toMatchObject({
      status: "new",
      droppedPlace: { kind: "Location", name: "Lake" }
    });
    expect(waitingFor(p, terms, gone)).toEqual([]);
    const plan = listPlan(p, gone, "s1", "f");
    expect(
      plan.records.map((r) => [
        r.kind,
        r.fields.Name,
        Object.values(r.refs).filter((v) => v)
      ])
    ).toEqual([
      ["Activity", "Canoeing", []],
      ["Activity", "Sailing", []],
      ["Activity", "Archery", ["l1"]]
    ]);
    expect(plan.forget).toEqual([]);
    // Brought back: added with the list, and the save forgets the deletion.
    const answers = { [lake]: BRING_BACK };
    const back = read("activities", rows, answers);
    expect(back.alsoAdd.location).toEqual(["Lake"]);
    expect(back.deleted).toEqual([]);
    expect(row(back, "Canoeing").droppedPlace).toBeNull();
    const backPlan = listPlan(back, answers, "s1", "f");
    expect(backPlan.records.map((r) => [r.kind, r.fields.Name])).toEqual([
      ["Location", "Lake"],
      ["Activity", "Canoeing"],
      ["Activity", "Sailing"],
      ["Activity", "Archery"]
    ]);
    expect(backPlan.forget).toEqual([lake]);
  });

  it("an item the camp has keeps its place when the file names a deleted one", () => {
    const s = setup();
    s.activities = [{ Id: "a1", Name: "Canoeing", Location__c: "l1" }];
    const lake = deletedKey("Location", "", "Lake");
    const p = listProposal({
      screenKey: "activities",
      file: csv([
        ["Activity", "Location"],
        ["Canoeing", "Lake"]
      ]),
      setup: s,
      terms,
      answers: { [lake]: DELETED }
    });
    expect(row(p, "Canoeing").status).toBe("unchanged");
    expect(p.deleted.map((d) => d.name)).toEqual(["Lake"]);
    expect(waitingFor(p, terms, { [lake]: DELETED })).toEqual([
      "Nothing to change"
    ]);
  });

  it("a deleted kind of place: the location is saved without it", () => {
    const outdoor = deletedKey("LocationType", "", "Outdoor");
    const gone = { [outdoor]: DELETED };
    const p = read(
      "locations",
      [
        ["Location", "Location type"],
        ["Field", "Outdoor"]
      ],
      gone
    );
    expect(p.alsoAdd.locationType).toEqual([]);
    expect(p.deleted).toEqual([
      { key: outdoor, kind: "LocationType", name: "Outdoor", program: "" }
    ]);
    expect(waitingFor(p, terms, gone)).toEqual([]);
    const plan = listPlan(p, gone, "s1", "f");
    expect(plan.records.map((r) => [r.kind, r.fields.Name])).toEqual([
      ["Location", "Field"]
    ]);
    expect(Object.values(plan.records[0].refs).filter((v) => v)).toEqual([]);
  });
});

describe("a list naming a program, division or time block the camp deleted", () => {
  it("a deleted program is not asked about or added: its rows are left out until it is brought back", () => {
    const rows = [
      ["Program", "Division"],
      ["Main", "Middlers"],
      ["Teens", "Hikers"]
    ];
    const teens = deletedKey("Program", "", "Teens");
    const remembered = deletedKey("ProgramGroup", "Teens", "Bunk 9");
    const gone = { [teens]: DELETED, [remembered]: DELETED };
    const p = read("divisions", rows, gone);
    expect(questionCards(p, terms, gone)).toEqual([]);
    expect(row(p, "Hikers")).toMatchObject({
      status: "leftOut",
      reason: "its program was deleted before; not brought back"
    });
    expect(p.deleted).toEqual([
      { key: teens, kind: "Program", name: "Teens", program: "" }
    ]);
    expect(
      listPlan(p, gone, "s1", "f").records.map((r) => r.fields.Name)
    ).toEqual(["Middlers"]);
    // Brought back: asked which days, as any new program, then added.
    const back = { ...gone, [teens]: BRING_BACK };
    const [card] = questionCards(read("divisions", rows, back), terms, back);
    expect(card.title).toBe("“Teens” is a new program. Which days?");
    const answers = { ...back, [card.id]: "Monday" };
    const done = read("divisions", rows, answers);
    expect(done.deleted).toEqual([]);
    const plan = listPlan(done, answers, "s1", "f");
    expect(plan.records.map((r) => [r.kind, r.fields.Name])).toEqual([
      ["Program", "Teens"],
      ["Division", "Middlers"],
      ["Division", "Hikers"]
    ]);
    // Forgotten with the groups remembered with it.
    expect(plan.forget).toEqual([remembered, teens].sort());
  });

  it("a deleted division a row names is not added: the row is left out until it is brought back", () => {
    const rows = [
      ["Division", "Group", "Availability"],
      ["Seniors", "Bunk 7", "All day"],
      ["Juniors", "Bunk 8", "All day"]
    ];
    const seniors = deletedKey("Division", "Main", "Seniors");
    const p = read("groups", rows, { [seniors]: DELETED });
    expect(row(p, "Bunk 7")).toMatchObject({
      status: "leftOut",
      reason: "its division was deleted before; not brought back"
    });
    expect(p.alsoAdd.division).toEqual([]);
    expect(p.deleted).toEqual([
      { key: seniors, kind: "Division", name: "Seniors", program: "Main" }
    ]);
    const answers = { [seniors]: BRING_BACK };
    const back = read("groups", rows, answers);
    expect(back.deleted).toEqual([]);
    expect(back.alsoAdd.division.map((d) => d.name)).toEqual(["Seniors"]);
    expect(listPlan(back, answers, "s1", "f").forget).toEqual([seniors]);
  });

  it("a deleted time block is not asked when it is: the row is left out until it is brought back", () => {
    const rows = [
      ["Fixed activity", "Time block"],
      ["Snack", "Period 9"]
    ];
    const period = deletedKey("TimeBlock", "Main", "Period 9");
    const p = read("fixedActivities", rows, { [period]: DELETED });
    expect(questionCards(p, terms, { [period]: DELETED })).toEqual([]);
    expect(row(p, "Snack")).toMatchObject({
      status: "leftOut",
      reason: "its time block was deleted before; not brought back"
    });
    expect(p.deleted).toEqual([
      { key: period, kind: "TimeBlock", name: "Period 9", program: "Main" }
    ]);
    const back = { [period]: BRING_BACK };
    const [card] = questionCards(
      read("fixedActivities", rows, back),
      terms,
      back
    );
    expect(card.title).toBe(
      "“Period 9” is a new time block in Main. When is it?"
    );
    const answers = { ...back, [card.id]: "14:00-14:30" };
    const plan = listPlan(
      read("fixedActivities", rows, answers),
      answers,
      "s1",
      "f"
    );
    expect(plan.records.map((r) => [r.kind, r.fields.Name])).toEqual([
      ["TimeBlock", "Period 9"],
      ["FixedActivity", "Snack"]
    ]);
    expect(plan.forget).toEqual([period]);
  });
});

describe("a rain plan naming an activity the camp deleted (PR 127 review)", () => {
  const swim = deletedKey("Activity", "", "Swim");
  const answers = { [swim]: DELETED };
  // Every link between records of the save is to a record the save adds.
  const linksResolve = (plan) => {
    const keys = new Set(plan.records.map((r) => r.key).filter((k) => k));
    plan.records.forEach((r) =>
      Object.values(r.refs || {})
        .filter((v) => v && v.includes(":"))
        .forEach((v) => expect([r.key, keys.has(v)]).toEqual([r.key, true]))
    );
  };

  it("a row of the list deleted before: the row naming it is saved without its rain plan", () => {
    const p = read(
      "activities",
      [
        ["Activity", "Rain plan"],
        ["Swim", ""],
        ["Canoeing", "Swim"]
      ],
      answers
    );
    expect(row(p, "Swim").status).toBe("deleted");
    expect(row(p, "Canoeing")).toMatchObject({
      status: "new",
      droppedPlan: "Swim"
    });
    expect(p.deleted).toEqual([
      { key: swim, kind: "Activity", name: "Swim", program: "" }
    ]);
    expect(p.alsoAdd.activity).toEqual([]);
    const plan = listPlan(p, answers, "s1", "f");
    linksResolve(plan);
    expect(plan.records.map((r) => r.fields.Name)).toEqual(["Canoeing"]);
  });

  it("not in the list: it is not added again as by hand, and is listed with Bring back", () => {
    const p = read(
      "activities",
      [
        ["Activity", "Rain plan"],
        ["Canoeing", "Swim"]
      ],
      answers
    );
    expect(row(p, "Canoeing")).toMatchObject({
      status: "new",
      droppedPlan: "Swim"
    });
    expect(p.alsoAdd.activity).toEqual([]);
    expect(p.deleted).toEqual([
      { key: swim, kind: "Activity", name: "Swim", program: "" }
    ]);
    const plan = listPlan(p, answers, "s1", "f");
    linksResolve(plan);
    expect(plan.records.map((r) => r.fields.Name)).toEqual(["Canoeing"]);
  });

  it("brought back: the row and the rain plan naming it are saved, linked", () => {
    const back = { [swim]: BRING_BACK };
    const p = read(
      "activities",
      [
        ["Activity", "Rain plan"],
        ["Swim", ""],
        ["Canoeing", "Swim"]
      ],
      back
    );
    expect(row(p, "Swim").status).toBe("new");
    const plan = listPlan(p, back, "s1", "f");
    linksResolve(plan);
    expect(plan.records.find((r) => r.fields.Name === "Canoeing").refs).toEqual(
      expect.objectContaining({ RainPlan__c: "Activity:Swim" })
    );
  });
});
