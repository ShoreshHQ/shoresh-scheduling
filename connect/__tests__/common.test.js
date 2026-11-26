/**
 * What the connector's modules share (connect/common.js): a refusal with nothing done, and what a
 * screen reads as the screen gets it.
 */
const {
  refused,
  changedSince,
  asTheScreenReads,
  foldName
} = require("../common");

// The name rule Apex (RuleExamplesTest) and the import (ruleExamples.test.js) pass too.
const { foldedNames } = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../force-app/main/default/staticresources/ShoreshRuleExamples.json"
    ),
    "utf8"
  )
);

describe("What the connector's modules share", () => {
  // API-1.25, INGEST-2.2
  it.each(foldedNames.map((e) => [e.name, e.fold]))(
    "namesFoldAsTheImportAndApexFoldThem: %j reads as %j",
    (name, fold) => {
      expect(foldName(name)).toBe(fold);
    }
  );

  it("refusalsSayNothingWasDone: a refusal is the screen's words with 400, a change since it was read 409", () => {
    expect(refused("Say which week.")).toEqual({
      ok: false,
      status: 400,
      text: "Say which week."
    });
    expect(changedSince()).toMatchObject({ ok: false, status: 409 });
    expect(changedSince().text).toMatch(/nothing was saved/);
    expect(changedSince("Someone changed it.")).toEqual({
      ok: false,
      status: 409,
      text: "Someone changed it."
    });
  });

  // API-1.99
  it("timesAsTheScreenReadsThem: a time block's times from the web address become the screen's milliseconds, at any depth; nothing else changes", () => {
    const read = {
      timeBlocks: [
        {
          Name: "Period 1",
          StartTime__c: "09:00:00.000Z",
          shoresh__EndTime__c: "09:45:30.250Z",
          Notes__c: "09:00:00.000Z"
        }
      ],
      week: "Week 1"
    };
    expect(asTheScreenReads(read)).toEqual({
      timeBlocks: [
        {
          Name: "Period 1",
          StartTime__c: 32400000,
          shoresh__EndTime__c: 35130250,
          Notes__c: "09:00:00.000Z"
        }
      ],
      week: "Week 1"
    });
  });
});
