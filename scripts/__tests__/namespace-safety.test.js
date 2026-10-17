const fs = require("fs");
const os = require("os");
const path = require("path");
const { scan, scanJs, scanHtml, scanApex } = require("../namespace-safety");

const texts = (hits) => hits.map((h) => h.text);

describe("namespace-safety scanner", () => {
  it("counts names, strings, template text and regexes in LWC JavaScript, not comments", () => {
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
    expect(texts(hits)).toEqual(["StartDate__c", "Week__c", "__c", "Fake__c"]);
    expect(hits[0].line).toBe(7);
  });

  it("counts every suffix the namespace goes in front of", () => {
    expect(
      texts(
        scanJs(
          'const a = ["Setting__mdt", "Order__e", "Big__b", "Ext__x"]; const s = r.Season__Share; const h = r.Week__History;'
        )
      )
    ).toEqual([
      "Setting__mdt",
      "Order__e",
      "Big__b",
      "Ext__x",
      "Season__Share",
      "Week__History"
    ]);
    expect(texts(scanHtml("<p>{a.Thing__x} Big__b</p>"))).toEqual([
      "Thing__x",
      "Big__b"
    ]);
    expect(
      texts(scanApex("String s = 'SELECT Id FROM setting__MDT';"))
    ).toEqual(["'SELECT Id FROM setting__MDT'"]);
  });

  it("does not count look-alikes", () => {
    expect(scanJs("const m = mod.__esModule; const b = a__bc;")).toEqual([]);
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

  it("counts Apex names in any case, as Apex and SOQL read them", () => {
    expect(texts(scanApex("String q = 'SELECT Id FROM week__C';"))).toEqual([
      "'SELECT Id FROM week__C'"
    ]);
  });

  it("skips Apex test classes", () => {
    expect(
      scanApex(
        `@SuppressWarnings('PMD.ApexDoc')\n@IsTest\nprivate class YTest { String s = 'Week__c'; }`
      )
    ).toBeNull();
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

describe("namespace-safety check", () => {
  it("holds for the repository: no field or object name written as text", () => {
    expect(scan()).toEqual({});
  });

  /** A made-up source tree: { "relative/path": "contents" }. */
  function tree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "namespace-safety-"));
    for (const [rel, text] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    return root;
  }

  it("finds a name in any component or class, and never scans the schema homes or tests", () => {
    const src = "force-app/main/default";
    const root = tree({
      [`${src}/lwc/thing/thing.js`]: "const a = r.Length__c;",
      [`${src}/lwc/thing/thing.html`]: "<p>{r.Notes__c}</p>",
      [`${src}/classes/Thing.cls`]:
        "public class Thing { String s = 'Week__c'; }",
      [`${src}/lwc/thing/__tests__/thing.test.js`]: 'const a = "Week__c";',
      [`${src}/lwc/shoreshSchema/shoreshSchema.js`]: 'const a = "Week__c";',
      [`${src}/classes/ShoreshSchema.cls`]:
        "public class ShoreshSchema { String s = 'Week__c'; }",
      [`${src}/classes/ThingTest.cls`]:
        "@IsTest\nprivate class ThingTest { String s = 'Week__c'; }"
    });
    expect(Object.keys(scan(root)).sort()).toEqual([
      `${src}/classes/Thing.cls`,
      `${src}/lwc/thing/thing.html`,
      `${src}/lwc/thing/thing.js`
    ]);
  });
});
