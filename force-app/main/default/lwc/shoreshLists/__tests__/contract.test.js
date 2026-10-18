// The save request the screen builds (listPlan) against what the server accepts
// (ImportListSaves, ImportListRows): every kind and field the plan can send must be one the Apex lets a list
// write, or the save would be refused. Reads the Apex source itself, so a rename on either
// side fails here.
import { readFileSync } from "fs";
import { join } from "path";
import { buildTerms } from "c/shoreshTerms";
import { csvFile } from "c/shoreshImportEngine";
import { LIST_SCREENS, listPlan, listProposal, listScreen } from "./data/lists";

const apex = ["ImportListSaves", "ImportListRows", "ImportListWho"]
  .map((name) =>
    readFileSync(
      join(__dirname, "..", "..", "..", "classes", `${name}.cls`),
      "utf8"
    )
  )
  .join("\n");

/**
 * kind -> fields, from one of the Apex maps (PLAIN_FIELDS or LINK_FIELDS). The Apex lists field
 * references (Activity__c.Length__c); the field's name is the part after the dot.
 */
function apexMap(name) {
  const body = apex.slice(apex.indexOf(`${name} =`));
  const end = body.indexOf("};");
  const result = {};
  for (const match of body
    .slice(0, end)
    .matchAll(
      /'(\w+)' => new Set<Schema\.SObjectField>(?:\{([^}]*)\}|\(\))/g
    )) {
    result[match[1]] = [...(match[2] || "").matchAll(/\w+\.(\w+)/g)].map(
      (m) => m[1]
    );
  }
  return result;
}

const terms = buildTerms([]);

function setup() {
  return {
    season: { Id: "s1", Camp__c: "c1" },
    locationTypes: [],
    locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }],
    activities: [],
    programs: [
      {
        program: {
          Id: "p1",
          Name: "Main",
          Monday__c: true,
          Tuesday__c: true,
          Wednesday__c: true,
          Thursday__c: true,
          Friday__c: true
        },
        timeBlocks: [{ Id: "tb1", Name: "Period 1" }],
        divisions: [{ division: { Id: "d1", Name: "Juniors" }, groups: [] }]
      }
    ]
  };
}

/** A list with every column of the screen filled, as Shoresh writes it. */
function fullList(screen) {
  const values = {
    name: "Thing",
    type: "Indoors",
    fit: "2",
    notes: "x",
    location: "Lake",
    length: "1",
    min: "1",
    max: "No maximum",
    priority: "High",
    outdoors: "Yes",
    rainPlan: "Other",
    groupsAtOnce: "No limit",
    sameDivision: "Yes",
    early: "2 by Wednesday",
    who: "Juniors",
    program: "Main",
    days: "Monday; Wednesday",
    division: "Juniors",
    availability: "All day",
    start: "9:00 AM",
    end: "9:45 AM",
    partOfDay: "Morning",
    timeBlock: "Period 1"
  };
  const columns = screen.columns;
  const row = columns.map((c) => values[c.key]);
  // A second row, like the first but its own name and no rain plan.
  const other = columns.map((c) => {
    if (c.key === "name") {
      return "Other";
    }
    return c.key === "rainPlan" ? "" : values[c.key];
  });
  return csvFile(
    "list.csv",
    [
      columns.map((c) => c.heading).join(","),
      row.join(","),
      other.join(",")
    ].join("\n")
  );
}

describe("the save request and ImportListSaves agree", () => {
  const plain = apexMap("PLAIN_FIELDS");
  const links = apexMap("LINK_FIELDS");

  it("reads the server's lists (not an empty match)", () => {
    expect(Object.keys(plain)).toHaveLength(11);
    expect(plain.Activity).toEqual(
      expect.arrayContaining(["Name", "Length__c", "Notes__c"])
    );
    expect(plain.WeekException).toEqual([]);
    expect(links.Activity).toEqual(["Location__c", "RainPlan__c"]);
  });

  LIST_SCREENS.forEach((key) => {
    it(`${key}: every field sent is one the server writes`, () => {
      const p = listProposal({
        screenKey: key,
        file: fullList(listScreen(key, terms)),
        setup: setup(),
        terms,
        answers: {}
      });
      const plan = listPlan(p, {}, "s1", "list.csv");
      expect(plan.records.length).toBeGreaterThan(1);
      plan.records.forEach((record) => {
        expect(Object.keys(plain)).toContain(record.kind);
        Object.keys(record.fields).forEach((field) => {
          expect([record.kind, plain[record.kind]]).toEqual([
            record.kind,
            expect.arrayContaining([field])
          ]);
        });
        Object.keys(record.refs || {}).forEach((field) => {
          expect([record.kind, links[record.kind]]).toEqual([
            record.kind,
            expect.arrayContaining([field])
          ]);
        });
      });
    });
  });

  it("the server reads the lists the plan sends", () => {
    const plan = listPlan(
      listProposal({
        screenKey: "locations",
        file: csvFile("l.csv", "Location\nBarn"),
        setup: setup(),
        terms,
        answers: {}
      }),
      {},
      "s1",
      "l.csv"
    );
    ["records", "remember", "forget", "files", "seasonId"].forEach((name) => {
      expect(Object.keys(plan)).toContain(name);
    });
    expect(apex).toContain("plan.entries('records')");
    expect(apex).toContain("entry.valuesOf('fields')");
    expect(apex).toContain("entry.valuesOf('refs')");
    expect(apex).toContain("entry.texts('who')");
  });
});
