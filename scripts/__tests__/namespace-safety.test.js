const fs = require("fs");
const path = require("path");
const {
  scan,
  scanJs,
  scanHtml,
  scanApex,
  counts,
  compare,
  lowered
} = require("../namespace-safety");

const texts = (hits) => hits.map((h) => h.text);

describe("namespace-safety scanner", () => {
  it("counts names, strings and template text in LWC JavaScript, not comments", () => {
    const hits = scanJs(`
      // StartDate__c in a comment
      /* EndDate__c too */
      import { LightningElement, api } from "lwc";
      export default class X extends LightningElement {
        @api recordId;
        get start() { return this.week.StartDate__c; }
        save() { return { sobjectType: "Week__c", [\`\${this.day}__c\`]: true }; }
      }
      const re = /Fake__c/;
    `);
    expect(texts(hits)).toEqual(["StartDate__c", "Week__c", "__c"]);
    expect(hits[0].line).toBe(7);
  });

  it("counts relationship names", () => {
    expect(scanJs("const rows = a.Coverages__r || [];")).toHaveLength(1);
  });

  it("counts names in LWC templates, not comments", () => {
    const hits = scanHtml(`<template>
      <!-- {rec.Notes__c} -->
      <c-table object-api-name="Week__c" data-field="StartDate__c"></c-table>
    </template>`);
    expect(texts(hits)).toEqual(["Week__c", "StartDate__c"]);
    expect(hits[0].line).toBe(3);
  });

  it("counts Apex string literals and getName(), not typed references or comments", () => {
    const hits = scanApex(`public with sharing class X {
      // 'Week__c' in a comment
      /* row.get('EndDate__c') */
      void a(SObject row, String day) {
        row.put('StartDate__c', Date.today());
        row.put(day + '__c', true);
        Week__c w = new Week__c(StartDate__c = Date.today());
        Object o = Week__c.StartDate__c;
        String s = 'it\\'s fine';
        String t = Week__c.SObjectType.getDescribe().getName();
      }
    }`);
    expect(texts(hits)).toEqual(["'StartDate__c'", "'__c'", ".getName()"]);
    expect(hits.map((h) => h.line)).toEqual([5, 6, 10]);
  });

  it("skips Apex test classes", () => {
    expect(
      scanApex(
        `/** doc */\n@IsTest\nprivate class XTest { String s = 'Week__c'; }`
      )
    ).toBeNull();
    expect(
      scanApex(
        `@isTest(SeeAllData=false)\npublic class Data { String s = 'Week__c'; }`
      )
    ).toBeNull();
  });
});

describe("namespace-safety ratchet", () => {
  it("passes at the baseline", () => {
    expect(compare({ a: 2 }, { a: 2 })).toEqual([]);
  });

  it("fails when a file gains a name, including a new file", () => {
    expect(compare({ a: 3 }, { a: 2 })).toHaveLength(1);
    expect(compare({ b: 1 }, {})[0]).toContain("baseline allows 0");
  });

  it("asks for the baseline to be lowered when a file improves", () => {
    expect(compare({ a: 1 }, { a: 2 })[0]).toContain("--update");
    expect(compare({}, { a: 2 })[0]).toContain("down to 0");
  });

  it("refuses a baseline raised above the base branch's", () => {
    expect(compare({ a: 3 }, { a: 3 }, { a: 2 })[0]).toContain(
      "only goes down"
    );
    expect(compare({ new: 1 }, { new: 1 }, {})[0]).toContain("only goes down");
    expect(compare({ a: 2 }, { a: 2 }, { a: 2 })).toEqual([]);
  });

  it("only ever lowers the baseline when updating", () => {
    expect(lowered({ a: 1, b: 5, c: 2 }, { a: 2, b: 3 })).toEqual({
      a: 1,
      b: 3,
      c: 0
    });
  });

  it("holds for the repository: no file is above or below its committed baseline", () => {
    const baseline = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../namespace-safety-baseline.json"),
        "utf8"
      )
    );
    expect(compare(counts(scan()), baseline)).toEqual([]);
  });

  it("never scans the schema homes or tests", () => {
    const files = Object.keys(scan());
    expect(files.some((f) => f.includes("/shoreshSchema/"))).toBe(false);
    expect(files.some((f) => f.endsWith("ShoreshSchema.cls"))).toBe(false);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
    expect(files.some((f) => /Test\.cls$/.test(f))).toBe(false);
  });
});
