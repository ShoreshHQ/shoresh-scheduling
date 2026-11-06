// The Special events screen's list (docs/protocol/special.md SPECIAL-2.3 to 2.7): special days
// and events in one list, by Name and Type, an event's place and both kinds' notes; Download this
// list reads back with no changes. Made-up camps only.
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
  LIST_SCREENS,
  listPlan,
  listProposal,
  listRows,
  questionCards,
  waitingFor
} from "./data/lists";

const terms = buildTerms([]);

function csv(rows) {
  return csvFile("special.csv", rows.map((r) => r.join(",")).join("\n"));
}

function setup({ specialDays, specialEvents } = {}) {
  return {
    season: { Id: "s1", Name: "Summer", Camp__c: "c1" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [],
    locations: [
      { Id: "l1", Name: "Lake", GroupsThatFit__c: 2 },
      { Id: "l2", Name: "Field", GroupsThatFit__c: 4 }
    ],
    activities: [],
    programs: [],
    schedules: [],
    labels: [],
    special: {
      specialDays: specialDays || [
        { Id: "sd1", Name: "Color War", Notes__c: "Wear team colors" },
        { Id: "sd2", Name: "Visiting Day", Notes__c: null }
      ],
      specialEvents: specialEvents || [
        { Id: "se1", Name: "Carnival", Location__c: "l2", Notes__c: null },
        { Id: "se2", Name: "Color War", Location__c: null, Notes__c: "Finale" }
      ],
      briefs: []
    }
  };
}

function read(rows, answers = {}, given = setup()) {
  return listProposal({
    screenKey: "specialEvents",
    file: csv(rows),
    setup: given,
    terms,
    answers
  });
}

const row = (p, name, type) =>
  p.rows.find((r) => r.name === name && (!type || r.programName === type));

describe("the Special events list", () => {
  it("is not a sheet of the camp workbook (items stay in their season)", () => {
    expect(LIST_SCREENS).not.toContain("specialEvents");
  });

  it("SPECIAL-2.3: downloads special days then events, by Name and Type, with an event's place and both kinds' notes", () => {
    expect(listRows("specialEvents", setup(), terms)).toEqual([
      ["Name", "Type", "Where", "Notes"],
      ["Color War", "Special day", "", "Wear team colors"],
      ["Visiting Day", "Special day", "", ""],
      ["Carnival", "Event", "Field", ""],
      ["Color War", "Event", "", "Finale"]
    ]);
  });

  it("SPECIAL-2.3: reads its own download back with no changes (Excel and CSV)", () => {
    const rows = listRows("specialEvents", setup(), terms);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "List");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    [
      workbookFile(XLSX, "special.xlsx", new Uint8Array(data)),
      csv(rows)
    ].forEach((file) => {
      const p = listProposal({
        screenKey: "specialEvents",
        file,
        setup: setup(),
        terms,
        answers: {}
      });
      expect(p.rows.map((r) => [r.name, r.status])).toEqual([
        ["Color War", "unchanged"],
        ["Visiting Day", "unchanged"],
        ["Carnival", "unchanged"],
        ["Color War", "unchanged"]
      ]);
      expect(questionCards(p, terms, {})).toEqual([]);
      expect(waitingFor(p, terms, {})).toEqual(["Nothing to change"]);
    });
  });

  it("SPECIAL-2.3: a special day and an event of one name are two items, each matched within its kind", () => {
    const p = read([
      ["Name", "Type", "Notes"],
      ["Color War", "Event", "Finale at the lake"],
      ["Color War", "special day", "Wear team colors"]
    ]);
    expect(row(p, "Color War", "Event").status).toBe("changed");
    expect(row(p, "Color War", "Event").id).toBe("se2");
    expect(row(p, "Color War", "Special day").status).toBe("unchanged");
    expect(row(p, "Color War", "Special day").id).toBe("sd1");
  });

  it("SPECIAL-2.3: adds each new row as the kind its Type says, an event at the place named", () => {
    const p = read([
      ["Name", "Type", "Where", "Notes"],
      ["Maccabiah", "Special day", "", "Three days"],
      ["Talent Show", "Event", "Lake", ""]
    ]);
    expect(p.rows.map((r) => r.status)).toEqual(["new", "new"]);
    const plan = listPlan(p, {}, "s1", "special.csv");
    expect(plan.screen).toBe("specialEvents");
    expect(plan.records).toEqual([
      {
        kind: "SpecialDay",
        key: "SpecialItem:SpecialDay:Maccabiah",
        fields: { Name: "Maccabiah", Notes__c: "Three days" },
        refs: {}
      },
      {
        kind: "SpecialEvent",
        key: "SpecialItem:SpecialEvent:Talent Show",
        fields: { Name: "Talent Show", Notes__c: null },
        refs: { Location__c: "l1" }
      }
    ]);
  });

  it("SPECIAL-2.3: a place the season doesn't have is added with the list, as on Activities", () => {
    const p = read([
      ["Name", "Type", "Where"],
      ["Talent Show", "Event", "Amphitheater"]
    ]);
    expect(p.alsoAdd.location).toEqual(["Amphitheater"]);
    const plan = listPlan(p, {}, "s1", "special.csv");
    expect(plan.records.map((r) => [r.kind, r.key, r.refs])).toEqual([
      ["Location", "Location:Amphitheater", undefined],
      [
        "SpecialEvent",
        "SpecialItem:SpecialEvent:Talent Show",
        { Location__c: "Location:Amphitheater" }
      ]
    ]);
  });

  it("SPECIAL-2.3: shows each difference for Keep or Change; a blank Where clears an event's place", () => {
    const p = read([
      ["Name", "Type", "Where", "Notes"],
      ["Carnival", "Event", "", "Bring tickets"]
    ]);
    const carnival = row(p, "Carnival");
    expect(
      carnival.differences.map((d) => [d.column, d.from, d.to, d.clears])
    ).toEqual([
      ["where", "Field", null, true],
      ["notes", null, "Bring tickets", false]
    ]);
    const answers = Object.fromEntries(
      carnival.differences.map((d) => [d.id, CHANGE])
    );
    const plan = listPlan(
      read(
        [
          ["Name", "Type", "Where", "Notes"],
          ["Carnival", "Event", "", "Bring tickets"]
        ],
        answers
      ),
      answers,
      "s1",
      "special.csv"
    );
    expect(plan.records).toEqual([
      {
        kind: "SpecialEvent",
        id: "se1",
        fields: { Notes__c: "Bring tickets" },
        refs: { Location__c: null }
      }
    ]);
  });

  it("SPECIAL-2.3: a name like one of its own kind is asked about in the screen's words", () => {
    const p = read([
      ["Name", "Type"],
      ["Carnivale", "Event"]
    ]);
    expect(questionCards(p, terms, {}).map((c) => c.title)).toEqual([
      "Are “Carnivale” and “Carnival” the same event?"
    ]);
  });

  it("SPECIAL-2.4: a Type that is neither, or blank, can't be read, never guessed", () => {
    const p = read([
      ["Name", "Type"],
      ["Overnight", "Trip"],
      ["Carnival", ""]
    ]);
    expect(row(p, "Overnight").status).toBe("unreadable");
    expect(row(p, "Overnight").problems).toEqual([
      'Type: "Trip" isn\'t Special day or Event'
    ]);
    expect(row(p, "Carnival").status).toBe("unreadable");
    expect(row(p, "Carnival").problems).toEqual(["Type is blank"]);
  });

  it("SPECIAL-2.4: a list without a Type column can't be read", () => {
    const p = read([["Name"], ["Carnival"]]);
    expect(p.blocked).toBe(true);
  });

  it("SPECIAL-2.4: reads the camp's own words for each kind", () => {
    const camp = buildTerms([
      {
        term: "SpecialEvent",
        singular: "Program event",
        plural: "Program events"
      },
      { term: "SpecialDay", singular: "Theme day", plural: "Theme days" }
    ]);
    expect(listRows("specialEvents", setup(), camp)[1]).toEqual([
      "Color War",
      "Theme day",
      "",
      "Wear team colors"
    ]);
    const p = listProposal({
      screenKey: "specialEvents",
      file: csv([
        ["Name", "Type"],
        ["Carnival", "program event"],
        ["Visiting Day", "Theme Day"]
      ]),
      setup: setup(),
      terms: camp,
      answers: {}
    });
    expect(p.rows.map((r) => [r.name, r.status])).toEqual([
      ["Carnival", "unchanged"],
      ["Visiting Day", "unchanged"]
    ]);
  });

  it("SPECIAL-2.5: a special day is the whole camp: a place in its Where can't be read", () => {
    const p = read([
      ["Name", "Type", "Where"],
      ["Visiting Day", "Special day", "Lake"],
      ["Color War", "Special day", "Whole camp"]
    ]);
    expect(row(p, "Visiting Day").status).toBe("unreadable");
    expect(row(p, "Visiting Day").problems).toEqual([
      "Where: a special day is the whole camp"
    ]);
    expect(row(p, "Color War").status).toBe("unchanged");
    // Nothing is added for a place only a special day named.
    expect(p.alsoAdd.location || []).toEqual([]);
  });

  it("SPECIAL-2.7: a special day or event deleted before is left out, with Bring back", () => {
    const gone = deletedKey("SpecialEvent", "", "Talent Show");
    const rows = [
      ["Name", "Type"],
      ["Talent Show", "Event"],
      ["Talent Show", "Special day"]
    ];
    const p = read(rows, { [gone]: DELETED });
    expect(row(p, "Talent Show", "Event").status).toBe("deleted");
    // Only the event was deleted: a special day of that name is added.
    expect(row(p, "Talent Show", "Special day").status).toBe("new");
    expect(p.deleted).toEqual([
      { key: gone, kind: "SpecialEvent", name: "Talent Show", program: "" }
    ]);
    const back = read(rows, { [gone]: BRING_BACK });
    expect(row(back, "Talent Show", "Event").status).toBe("new");
    const plan = listPlan(back, { [gone]: BRING_BACK }, "s1", "special.csv");
    expect(plan.forget).toContain(gone);
  });
});
