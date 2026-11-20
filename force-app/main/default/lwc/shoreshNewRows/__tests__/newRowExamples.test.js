/**
 * The shared new-row examples (staticresources/ShoreshNewRowExamples.json), which Apex must also
 * pass (NewRowExamplesTest): a new location or activity starts the same on Camp Setup's Add row,
 * from a list import, and on the server (Greg, 2026-10-16).
 */
import { newRow } from "c/shoreshNewRows";
import { buildTerms } from "c/shoreshTerms";
import { csvFile } from "c/shoreshImportEngine";
import { bareRecord } from "shoresh-jest/namespace";
import {
  listPlan,
  listProposal
} from "../../shoreshLists/__tests__/data/lists";

const { rows } = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../../staticresources/ShoreshNewRowExamples.json"
    ),
    "utf8"
  )
);

describe("shared new-row examples", () => {
  it.each(rows.map((r) => [r.kind, r]))("a new %s", (kind, example) => {
    expect(bareRecord(newRow(kind))).toEqual(example.fields);
  });

  it("a list import's new activity, and the new location it names, start the same", () => {
    const proposal = listProposal({
      screenKey: "activities",
      file: csvFile("list.csv", "Activity,Location\nCanoeing,Lake"),
      setup: {
        season: { Id: "a00000000000001AAA", Name: "Summer", Camp__c: "c1" },
        weeks: [],
        weekExceptions: [],
        locationTypes: [],
        locations: [],
        activities: [],
        programs: [],
        schedules: [],
        labels: []
      },
      terms: buildTerms([]),
      answers: {}
    });
    const plan = listPlan(proposal, {}, "s1", "f");
    rows.forEach((example) => {
      const record = plan.records.find((r) => r.kind === example.kind);
      expect(record.fields).toMatchObject(example.fields);
    });
  });
});
