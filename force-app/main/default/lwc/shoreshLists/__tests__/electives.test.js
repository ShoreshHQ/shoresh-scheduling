// The Electives screen's list (plan §6.2): offerings named by their activity, in an elective
// set, proposed when a list adds them; Download this list reads back with no changes. Made-up
// camps only.
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import {
  BRING_BACK,
  DELETED,
  csvFile,
  deletedKey,
  workbookFile
} from "c/shoreshImportEngine";
import {
  CHANGE,
  KEEP,
  LIST_SCREENS,
  listPlan,
  listProposal,
  listRows,
  questionCards,
  waitingFor
} from "./data/lists";

const terms = buildTerms([]);

function csv(rows) {
  return csvFile("offerings.csv", rows.map((r) => r.join(",")).join("\n"));
}

function setup({ sets, offerings } = {}) {
  return {
    season: { Id: "s1", Name: "Summer", Camp__c: "c1" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [],
    locations: [],
    activities: [
      { Id: "a1", Name: "Archery" },
      { Id: "a2", Name: "Drama" },
      { Id: "a3", Name: "Pottery" },
      { Id: "a4", Name: "Kayaking" }
    ],
    programs: [],
    schedules: [],
    labels: [],
    electives: {
      sets: sets || [
        { Id: "es1", Name: "Bechirot" },
        { Id: "es2", Name: "Chugim" }
      ],
      offerings: offerings || [
        {
          Id: "o1",
          ElectiveSet__c: "es2",
          Activity__c: "a1",
          Seats__c: 12,
          NoSeatLimit__c: false,
          MinimumToRun__c: null,
          Proposed__c: false
        },
        {
          Id: "o2",
          ElectiveSet__c: "es2",
          Activity__c: "a3",
          Seats__c: null,
          NoSeatLimit__c: true,
          MinimumToRun__c: 4,
          Proposed__c: true
        },
        {
          Id: "o3",
          ElectiveSet__c: "es1",
          Activity__c: "a4",
          Seats__c: null,
          NoSeatLimit__c: false,
          MinimumToRun__c: null,
          Proposed__c: false
        },
        {
          Id: "o4",
          ElectiveSet__c: "es1",
          Activity__c: "a2",
          Seats__c: 0,
          NoSeatLimit__c: false,
          MinimumToRun__c: null,
          Proposed__c: false
        }
      ]
    }
  };
}

function read(rows, answers = {}, given = setup()) {
  return listProposal({
    screenKey: "electives",
    file: csv(rows),
    setup: given,
    terms,
    answers
  });
}

const row = (p, name) => p.rows.find((r) => r.name === name);

describe("the Electives list", () => {
  it("is not a sheet of the camp workbook", () => {
    expect(LIST_SCREENS).not.toContain("electives");
  });

  it("downloads every offering by set and activity, seats as the screen says them", () => {
    expect(listRows("electives", setup(), terms)).toEqual([
      ["Elective set", "Activity", "Seats", "Minimum", "Proposed"],
      ["Bechirot", "Drama", 0, "", "No"],
      ["Bechirot", "Kayaking", "", "", "No"],
      ["Chugim", "Archery", 12, "", "No"],
      ["Chugim", "Pottery", "No limit", 4, "Yes"]
    ]);
  });

  it("reads its own download back with no changes (Excel and CSV)", () => {
    const rows = listRows("electives", setup(), terms);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "List");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    [
      workbookFile(XLSX, "electives.xlsx", new Uint8Array(data)),
      csv(rows)
    ].forEach((file) => {
      const p = listProposal({
        screenKey: "electives",
        file,
        setup: setup(),
        terms,
        answers: {}
      });
      expect(p.rows.map((r) => r.status)).toEqual([
        "unchanged",
        "unchanged",
        "unchanged",
        "unchanged"
      ]);
      expect(questionCards(p, terms, {})).toEqual([]);
      expect(waitingFor(p, terms, {})).toEqual(["Nothing to change"]);
    });
  });

  it("downloads into an empty season and reads back as the same offerings, all new", () => {
    const rows = listRows("electives", setup(), terms);
    const empty = setup({ sets: [], offerings: [] });
    const p = read(rows, {}, empty);
    expect(waitingFor(p, terms, {})).toEqual([]);
    const plan = listPlan(p, {}, "s2", "offerings.csv");
    expect(plan.records.filter((r) => r.kind === "ElectiveSet")).toEqual([
      {
        kind: "ElectiveSet",
        key: "ElectiveSet:Bechirot",
        fields: { Name: "Bechirot" }
      },
      {
        kind: "ElectiveSet",
        key: "ElectiveSet:Chugim",
        fields: { Name: "Chugim" }
      }
    ]);
    const offerings = plan.records.filter((r) => r.kind === "Offering");
    expect(offerings.map((r) => [r.key, r.fields, r.refs])).toEqual([
      [
        "Offering:ElectiveSet:Bechirot:Drama",
        {
          NoSeatLimit__c: false,
          Seats__c: 0,
          MinimumToRun__c: null,
          Proposed__c: false
        },
        { Activity__c: "a2", ElectiveSet__c: "ElectiveSet:Bechirot" }
      ],
      [
        "Offering:ElectiveSet:Bechirot:Kayaking",
        {
          NoSeatLimit__c: false,
          Seats__c: null,
          MinimumToRun__c: null,
          Proposed__c: false
        },
        { Activity__c: "a4", ElectiveSet__c: "ElectiveSet:Bechirot" }
      ],
      [
        "Offering:ElectiveSet:Chugim:Archery",
        {
          NoSeatLimit__c: false,
          Seats__c: 12,
          MinimumToRun__c: null,
          Proposed__c: false
        },
        { Activity__c: "a1", ElectiveSet__c: "ElectiveSet:Chugim" }
      ],
      [
        "Offering:ElectiveSet:Chugim:Pottery",
        {
          NoSeatLimit__c: true,
          Seats__c: null,
          MinimumToRun__c: 4,
          Proposed__c: true
        },
        { Activity__c: "a3", ElectiveSet__c: "ElectiveSet:Chugim" }
      ]
    ]);
  });

  it("proposes what it adds, with no seat limit, when the file has only names (as the desktop's import)", () => {
    const p = read(
      [["Activity"], ["Drama"]],
      {},
      setup({
        sets: [{ Id: "es2", Name: "Chugim" }],
        offerings: []
      })
    );
    expect(row(p, "Drama").status).toBe("new");
    const plan = listPlan(p, {}, "s1", "offerings.csv");
    expect(plan.records).toEqual([
      {
        kind: "Offering",
        key: "Offering:es2:Drama",
        fields: {
          NoSeatLimit__c: true,
          Seats__c: null,
          MinimumToRun__c: null,
          Proposed__c: true
        },
        refs: { ElectiveSet__c: "es2", Activity__c: "a2" }
      }
    ]);
  });

  it("asks which set when the season has several and the file doesn't say", () => {
    const p = read([["Activity"], ["Drama"]]);
    expect(row(p, "Drama").status).toBe("unreadable");
    expect(row(p, "Drama").problems).toEqual(["Elective set is blank"]);
  });

  it("matches an offering by its set and activity, and shows each difference for Keep or Change", () => {
    const p = read([
      ["Elective set", "Activity", "Seats", "Minimum", "Proposed"],
      ["Chugim", "archery", "15", "", "No"],
      ["Chugim", "Pottery", "No limit", "4", "No"]
    ]);
    expect(row(p, "Archery").status).toBe("changed");
    expect(
      row(p, "Archery").differences.map((d) => [d.column, d.from, d.to])
    ).toEqual([["seats", 12, 15]]);
    // Confirming by the file is the director's call, never silent.
    expect(
      row(p, "Pottery").differences.map((d) => [d.column, d.from, d.to])
    ).toEqual([["proposed", true, false]]);
    const answers = {
      [row(p, "Archery").differences[0].id]: CHANGE,
      [row(p, "Pottery").differences[0].id]: KEEP
    };
    const plan = listPlan(
      read(
        [
          ["Elective set", "Activity", "Seats", "Minimum", "Proposed"],
          ["Chugim", "archery", "15", "", "No"],
          ["Chugim", "Pottery", "No limit", "4", "No"]
        ],
        answers
      ),
      answers,
      "s1",
      "offerings.csv"
    );
    expect(plan.records).toEqual([
      {
        kind: "Offering",
        id: "o1",
        fields: { NoSeatLimit__c: false, Seats__c: 15 },
        refs: {}
      }
    ]);
  });

  it("clearing seats on an offering set up leaves them not filled in, and asks first", () => {
    const p = read([
      ["Elective set", "Activity", "Seats"],
      ["Chugim", "Archery", ""]
    ]);
    const difference = row(p, "Archery").differences[0];
    expect([difference.from, difference.to, difference.clears]).toEqual([
      12,
      null,
      true
    ]);
  });

  it("the same activity in two sets is two offerings", () => {
    const p = read([
      ["Elective set", "Activity"],
      ["Chugim", "Kayaking"],
      ["Bechirot", "Kayaking"]
    ]);
    expect(p.rows.map((r) => r.status)).toEqual(["new", "unchanged"]);
  });

  it("an activity the season doesn't have is added with the list; one like a name it has is asked", () => {
    const p = read([
      ["Elective set", "Activity"],
      ["Chugim", "Woodworking"],
      ["Chugim", "Dramma"]
    ]);
    expect(p.alsoAdd.offeredActivity).toEqual(["Woodworking"]);
    const card = questionCards(p, terms, {}).find((c) =>
      c.title.includes("Dramma")
    );
    expect(card.title).toBe("Are “Dramma” and “Drama” the same activity?");
    const answered = read(
      [
        ["Elective set", "Activity"],
        ["Chugim", "Woodworking"],
        ["Chugim", "Dramma"]
      ],
      { [card.id]: "b" }
    );
    expect(row(answered, "Drama").status).toBe("new");
    const plan = listPlan(answered, { [card.id]: "b" }, "s1", "offerings.csv");
    const activity = plan.records.find((r) => r.kind === "Activity");
    expect(activity.key).toBe("Activity:Woodworking");
    expect(activity.fields.Name).toBe("Woodworking");
    // The activity is saved before the offering that names it (ImportListSaves.ORDER).
    expect(
      plan.records.find((r) => r.key === "Offering:es2:Woodworking").refs
    ).toEqual({
      ElectiveSet__c: "es2",
      Activity__c: "Activity:Woodworking"
    });
  });

  it("a set the season doesn't have is added, shown before the save", () => {
    const p = read([
      ["Elective set", "Activity"],
      ["Tzrif", "Drama"]
    ]);
    expect(p.alsoAdd.electiveSet).toEqual([{ name: "Tzrif" }]);
    expect(row(p, "Drama").status).toBe("new");
  });

  it("a set name like one the season has is asked about, never guessed", () => {
    const p = read([
      ["Elective set", "Activity"],
      ["Chugimm", "Drama"]
    ]);
    expect(row(p, "Drama").status).toBe("asked");
    expect(questionCards(p, terms, {})[0].title).toBe(
      "Are “Chugimm” and “Chugim” the same elective set?"
    );
  });

  describe("things you delete stay deleted (#101)", () => {
    it("an offering deleted on the screen is left out, with Bring back", () => {
      const key = deletedKey("Offering", "Chugim", "Drama");
      const p = read(
        [
          ["Elective set", "Activity"],
          ["Chugim", "Drama"]
        ],
        { [key]: DELETED }
      );
      expect(row(p, "Drama").status).toBe("deleted");
      expect(p.deleted).toEqual([
        { key, kind: "Offering", name: "Drama", program: "Chugim" }
      ]);
      const back = read(
        [
          ["Elective set", "Activity"],
          ["Chugim", "Drama"]
        ],
        { [key]: BRING_BACK }
      );
      expect(row(back, "Drama").status).toBe("new");
      expect(listPlan(back, { [key]: BRING_BACK }, "s1", "f").forget).toEqual([
        key
      ]);
    });

    it("a set deleted on the screen is not made again: its rows are left out, with Bring back", () => {
      const key = deletedKey("ElectiveSet", "", "Tzrif");
      const p = read(
        [
          ["Elective set", "Activity"],
          ["Tzrif", "Drama"]
        ],
        { [key]: DELETED }
      );
      expect(row(p, "Drama").status).toBe("leftOut");
      expect(row(p, "Drama").reason).toBe(
        "its elective set was deleted before; not brought back"
      );
      expect(p.alsoAdd.electiveSet).toEqual([]);
      expect(p.deleted).toEqual([
        { key, kind: "ElectiveSet", name: "Tzrif", program: "" }
      ]);
      const back = read(
        [
          ["Elective set", "Activity"],
          ["Tzrif", "Drama"]
        ],
        { [key]: BRING_BACK }
      );
      expect(back.alsoAdd.electiveSet).toEqual([{ name: "Tzrif" }]);
      expect(listPlan(back, { [key]: BRING_BACK }, "s1", "f").forget).toEqual([
        key
      ]);
    });

    it("an activity deleted on its screen is not added again for an offering", () => {
      const key = deletedKey("Activity", "", "Woodworking");
      const p = read(
        [
          ["Elective set", "Activity"],
          ["Chugim", "Woodworking"]
        ],
        { [key]: DELETED }
      );
      expect(row(p, "Woodworking").status).toBe("leftOut");
      expect(p.alsoAdd.offeredActivity).toEqual([]);
      expect(p.deleted.map((d) => d.kind)).toEqual(["Activity"]);
      const back = read(
        [
          ["Elective set", "Activity"],
          ["Chugim", "Woodworking"]
        ],
        { [key]: BRING_BACK }
      );
      expect(back.alsoAdd.offeredActivity).toEqual(["Woodworking"]);
      expect(listPlan(back, { [key]: BRING_BACK }, "s1", "f").forget).toEqual([
        key
      ]);
    });
  });

  it("reads 300 offerings into one set without a question", () => {
    const names = Array.from({ length: 300 }, (_, i) => `Elective ${1000 + i}`);
    const p = read([
      ["Elective set", "Activity", "Seats"],
      ...names.map((n) => ["Chugim", n, "10"])
    ]);
    expect(p.rows.filter((r) => r.status === "new")).toHaveLength(300);
    expect(questionCards(p, terms, {})).toEqual([]);
  });
});
