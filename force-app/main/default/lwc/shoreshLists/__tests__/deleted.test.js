// Things you delete stay deleted (Greg, decision 45), on the per-screen list imports and the
// camp workbook: made-up camps only.
import { buildTerms } from "c/shoreshTerms";
import {
  BRING_BACK,
  DELETED,
  csvFile,
  deletedKey
} from "c/shoreshImportEngine";
import { listPlan, listProposal, waitingFor } from "./data/lists";

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

  it("a deleted place a row names is not added with the list: the row waits until it is brought back", () => {
    const rows = [
      ["Activity", "Location"],
      ["Canoeing", "Lake"]
    ];
    const lake = deletedKey("Location", "", "Lake");
    const p = read("activities", rows, { [lake]: DELETED });
    expect(p.alsoAdd.location).toEqual([]);
    expect(p.deleted).toEqual([
      { key: lake, kind: "Location", name: "Lake", program: "" }
    ]);
    expect(waitingFor(p, terms, { [lake]: DELETED })).toContain(
      "Review here: Canoeing"
    );
    const answers = { [lake]: BRING_BACK };
    const back = read("activities", rows, answers);
    expect(back.alsoAdd.location).toEqual(["Lake"]);
    expect(back.deleted).toEqual([]);
    const plan = listPlan(back, answers, "s1", "f");
    expect(plan.records.map((r) => [r.kind, r.fields.Name])).toEqual([
      ["Location", "Lake"],
      ["Activity", "Canoeing"]
    ]);
    expect(plan.forget).toEqual([lake]);
  });
});
