// "Import last year" against made-up level-1 camps (docs/import/corpus.md). Today's numbers are a
// ceiling: a change may ask fewer questions or read fewer things wrong, never more. When a change
// improves them, lower the numbers here (npm run score:import prints the full corpus).
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import * as engine from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { ordinaryCamps } from "../../../../../../scripts/import-corpus/camps";
import { variedCamps } from "../../../../../../scripts/import-corpus/level2";
import { travellingCamps } from "../../../../../../scripts/import-corpus/travel";
import {
  headingReport,
  plantCamp
} from "../../../../../../scripts/import-corpus/plant-camp";
import {
  scoreCamp,
  summarise,
  summaryTable
} from "../../../../../../scripts/import-corpus/score";

// The first 80 camps: ten of each layout, a few seconds. The node script scores all of them.
const SAMPLE = 80;

// Baseline 2026-10-27, on these 80 camps. Every kind not listed is 0.
const CEILING = {
  perfectAtLeast: 79,
  errors: 0,
  questions: {},
  wrong: { groups: 17, fixed: 1, activities: 16, cells: 455 }
};

describe("Import last year on ordinary made-up camps (level 1)", () => {
  const results = ordinaryCamps(SAMPLE).map((camp) =>
    scoreCamp(camp, { engine, XLSX, terms: buildTerms([]) })
  );
  const totals = summarise(results);

  it("reads the same camps the same way every time", () => {
    expect(ordinaryCamps(3).map((c) => c.name)).toEqual(
      ordinaryCamps(3).map((c) => c.name)
    );
    expect(summaryTable(results)).toBe(
      summaryTable(
        ordinaryCamps(SAMPLE).map((camp) =>
          scoreCamp(camp, { engine, XLSX, terms: buildTerms([]) })
        )
      )
    );
  });

  it("reads at least as many camps perfectly as it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING.perfectAtLeast);
  });

  it("asks no more questions of any kind than it did", () => {
    for (const [kind, n] of Object.entries(totals.questions)) {
      expect({ kind, n }).toEqual({
        kind,
        n: Math.min(n, CEILING.questions[kind] || 0)
      });
    }
  });

  it("reads nothing more wrong, kind by kind, than it did", () => {
    for (const [kind, n] of Object.entries(totals.wrong)) {
      expect({ kind, n }).toEqual({
        kind,
        n: Math.min(n, CEILING.wrong[kind] || 0)
      });
    }
  });
});

// Level 1, divisions travel together (travel.js): all 40 camps. Baseline 2026-10-27 after the
// second review (a weak clue never decides silently): before it, 21 perfect and 82 rotation
// activities read as recurring with no question; now 37 perfect, one read wrong (four of six
// groups together twice, with no divisions in the file, read as most of the camp), and two camps
// whose divisions take turns at every activity once or twice a week asked (13 each).
const CEILING_T = {
  perfectAtLeast: 37,
  errors: 0,
  questions: { kind: 28 },
  wrong: { recurring: 1, activities: 1 }
};

describe("Import last year on made-up camps whose divisions travel together (level 1)", () => {
  const results = travellingCamps(40).map((camp) =>
    scoreCamp(camp, { engine, XLSX, terms: buildTerms([]) })
  );
  const totals = summarise(results);

  it("reads at least as many camps perfectly, asks and reads wrong no more than it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING_T.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING_T.perfectAtLeast);
    for (const key of ["questions", "wrong"]) {
      for (const [kind, n] of Object.entries(totals[key])) {
        expect({ key, kind, n }).toEqual({
          key,
          kind,
          n: Math.min(n, CEILING_T[key][kind] || 0)
        });
      }
    }
  });
});

// Level 2: schedules that differ from week to week. The first 40 camps, five of each layout.
const SAMPLE_2 = 40;

// Baseline 2026-10-27, on these 40 camps, after the classification rules
// (docs/import/classification.md). Every kind not listed is 0.
const CEILING_2 = {
  perfectAtLeast: 23,
  weeksExactAtLeast: 30,
  errors: 0,
  questions: { cross: 2023 },
  wrong: {
    programs: 51,
    weeks: 48,
    days: 55,
    blocks: 8,
    groups: 4,
    fixed: 2,
    activities: 8,
    cells: 27516
  }
};

describe("Import last year on made-up camps whose weeks differ (level 2)", () => {
  const results = variedCamps(SAMPLE_2).map((camp) =>
    scoreCamp(camp, { engine, XLSX, terms: buildTerms([]) })
  );
  const totals = summarise(results);

  it("reads at least as many camps, and their weeks, as well as it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING_2.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING_2.perfectAtLeast);
    expect(
      results.filter((r) => r.wrong.weeks === 0).length
    ).toBeGreaterThanOrEqual(CEILING_2.weeksExactAtLeast);
  });

  it("asks no more and reads nothing more wrong, kind by kind, than it did", () => {
    for (const [kind, n] of Object.entries(totals.questions)) {
      expect({ kind, n }).toEqual({
        kind,
        n: Math.min(n, CEILING_2.questions[kind] || 0)
      });
    }
    for (const [kind, n] of Object.entries(totals.wrong)) {
      expect({ kind, n }).toEqual({
        kind,
        n: Math.min(n, CEILING_2.wrong[kind] || 0)
      });
    }
  });
});

// Greg's camp (scripts/import-corpus/fixtures/plant-camp.xlsx), the real ordinary baseline.
describe("Import last year on Greg's camp", () => {
  const bytes = readFileSync(
    join(
      __dirname,
      "../../../../../../scripts/import-corpus/fixtures/plant-camp.xlsx"
    )
  );
  const camp = plantCamp(bytes);
  const result = scoreCamp(camp, {
    engine,
    XLSX,
    terms: buildTerms([]),
    keepProposal: true
  });

  it("reads each sheet's heading as its group and finds the days on the lower row", () => {
    const h = headingReport(camp, result);
    expect(h.headingAsGroup).toBe(14);
    expect(h.headingAsData).toEqual([]);
    expect(h.daysFound).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ]);
    expect(h.firstBlock).toBe("08:40");
    expect(h.shifted).toBe(0);
  });

  // Baseline 2026-10-27, after the classification rules: fixed, recurring and activities all
  // read right with no "set time or activity?" question. Still asked: the two spelling slips
  // (until answered, "Lunch2" and "Swim Returning" stay apart, two activities and two cells
  // wrong); CIT is its own division (Greg) but is not read as one yet.
  it("asks and reads wrong no more than it did", () => {
    const ceiling = {
      questions: { similar: 2, division: 1 },
      wrong: {
        divisions: 1,
        groups: 2,
        activities: 2,
        cells: 2
      }
    };
    expect(result.error).toBeUndefined();
    for (const key of ["questions", "wrong"]) {
      for (const [kind, n] of Object.entries(result[key])) {
        expect({ key, kind, n }).toEqual({
          key,
          kind,
          n: Math.min(n, ceiling[key][kind] || 0)
        });
      }
    }
  });
});
