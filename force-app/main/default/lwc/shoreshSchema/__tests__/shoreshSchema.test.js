import {
  CHILDREN,
  FIELD,
  NAMESPACE_PREFIX,
  OBJECT,
  PARENT,
  localName
} from "c/shoreshSchema";
import { nsName, nsRecord } from "shoresh-jest/namespace";

const { execFileSync } = require("child_process");
const path = require("path");

const GENERATOR = path.resolve(
  __dirname,
  "../../../../../../scripts/generate-shoresh-schema.js"
);

// Set by jest.namespaced.config.js, where every schema import carries the shoresh__ prefix.
const NAMESPACED = globalThis.SHORESH_JEST_NAMESPACED === true;

describe("c/shoreshSchema", () => {
  it("is up to date with the object metadata (run scripts/generate-shoresh-schema.js)", () => {
    // Prettier can't load inside Jest, so the generator checks the file in its own process.
    expect(() =>
      execFileSync("node", [GENERATOR, "--check"], { stdio: "pipe" })
    ).not.toThrow();
  });

  it("has the namespace prefix of the run: none today, shoresh__ in the namespaced run", () => {
    expect(NAMESPACE_PREFIX).toBe(NAMESPACED ? "shoresh__" : "");
  });

  it("names objects, fields, parents and child lists with the prefix", () => {
    expect(OBJECT.Week).toBe(`${NAMESPACE_PREFIX}Week__c`);
    expect(FIELD.Week.StartDate).toBe(`${NAMESPACE_PREFIX}StartDate__c`);
    expect(FIELD.Program.Monday).toBe(`${NAMESPACE_PREFIX}Monday__c`);
    expect(PARENT.Season.CopiedFrom).toBe(`${NAMESPACE_PREFIX}CopiedFrom__r`);
    expect(CHILDREN.Activity.Eligibilities).toBe(
      `${NAMESPACE_PREFIX}Eligibilities__r`
    );
    expect(CHILDREN.RecurringActivity.Coverages).toBe(
      `${NAMESPACE_PREFIX}Coverages__r`
    );
  });

  it("names the special day and event objects for the screens to come (ADR 0014)", () => {
    expect(OBJECT.SpecialDay).toBe(`${NAMESPACE_PREFIX}SpecialDay__c`);
    expect(OBJECT.SpecialEvent).toBe(`${NAMESPACE_PREFIX}SpecialEvent__c`);
    expect(OBJECT.SpecialDate).toBe(`${NAMESPACE_PREFIX}SpecialDate__c`);
    expect(OBJECT.PlanPart).toBe(`${NAMESPACE_PREFIX}PlanPart__c`);
    expect(FIELD.SpecialDate.Day).toBe(`${NAMESPACE_PREFIX}Day__c`);
    expect(FIELD.SpecialEvent.Location).toBe(`${NAMESPACE_PREFIX}Location__c`);
    expect(FIELD.PlanPart.Plan).toBe(`${NAMESPACE_PREFIX}Plan__c`);
    expect(CHILDREN.SpecialDay.SpecialDates).toBe(
      `${NAMESPACE_PREFIX}SpecialDates__r`
    );
    expect(CHILDREN.SpecialEvent.PlanParts).toBe(
      `${NAMESPACE_PREFIX}PlanParts__r`
    );
  });

  it("gives every name the prefix exactly once", () => {
    const names = [
      ...Object.values(OBJECT),
      ...[FIELD, PARENT, CHILDREN].flatMap((group) =>
        Object.values(group).flatMap((byObject) => Object.values(byObject))
      )
    ];
    expect(names.length).toBeGreaterThan(130);
    for (const name of names) {
      expect(name).toMatch(/__(c|r)$/);
      expect(name.startsWith(NAMESPACE_PREFIX)).toBe(true);
      expect(name.slice(NAMESPACE_PREFIX.length)).not.toContain("shoresh__");
    }
  });

  it("gives a name's local form, the same with or without the namespace", () => {
    expect(localName(FIELD.Week.EndDate)).toBe("EndDate__c");
    expect(localName(OBJECT.Week)).toBe("Week__c");
    expect(localName("Name")).toBe("Name");
  });

  it("cannot be changed by a screen", () => {
    expect(Object.isFrozen(FIELD)).toBe(true);
    expect(Object.isFrozen(FIELD.Week)).toBe(true);
    expect(() => {
      FIELD.Week.StartDate = "x";
    }).toThrow();
  });
});

describe("namespace-safe fixtures (shoresh-jest/namespace)", () => {
  const fixture = {
    Id: "a01",
    Name: "Archery",
    Length__c: 2,
    Location__r: { Name: "Range" },
    Eligibilities__r: [{ Group__c: "g1" }]
  };

  it("renames custom keys and object names the way the namespace will", () => {
    const record = nsRecord(fixture);
    expect(record.Id).toBe("a01");
    expect(record.Name).toBe("Archery");
    expect(record[FIELD.Activity.Length]).toBe(2);
    expect(record[PARENT.Activity.Location].Name).toBe("Range");
    expect(
      record[CHILDREN.Activity.Eligibilities][0][
        FIELD.ActivityEligibility.Group
      ]
    ).toBe("g1");
    expect(nsRecord({ sobjectType: "Week__c" }).sobjectType).toBe(OBJECT.Week);
    expect(nsName("Name")).toBe("Name");
    expect(nsName(nsName("Week__c"))).toBe(OBJECT.Week);
  });

  it("catches a bare name in the namespaced run (the point of the run)", () => {
    const record = nsRecord(fixture);
    // A component that spells the name as text reads nothing once the namespace is on.
    expect(record.Length__c).toBe(NAMESPACED ? undefined : 2);
  });
});
