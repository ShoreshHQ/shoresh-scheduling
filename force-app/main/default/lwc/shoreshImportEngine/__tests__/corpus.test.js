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
import { hardCamps } from "../../../../../../scripts/import-corpus/level3";
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
  perfectAtLeast: 80,
  errors: 0,
  questions: {},
  wrong: {}
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

// Level 1, divisions travel together (travel.js): all 40 camps. Baseline 2026-10-27 with rule 8
// (Greg: a division whose bunks always move together is one group): 39 perfect. Still wrong: one
// by-activity camp with no divisions in the file (four of six bunks together twice read as most
// of the camp), and its two "mostly at a set time" questions.
const CEILING_T = {
  perfectAtLeast: 39,
  errors: 0,
  questions: { kind: 2 },
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

// Baseline 2026-10-27, on these 40 camps, after the week rules (docs/import/weeks.md): all 40
// read perfectly, nothing asked (was 23 perfect, 2023 "the files disagree" questions after the
// classification rules). Every kind not listed is 0.
const CEILING_2 = {
  perfectAtLeast: 40,
  weeksExactAtLeast: 40,
  errors: 0,
  questions: {},
  wrong: {}
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

// Level 3, hard: doubles, trips, half days, gaps, spelling slips, note lines. The first 80 camps,
// ten of each layout. Baseline 2026-10-28 after INGEST-2.7 and 2.8 (was 60 perfect, 171 "the
// files disagree" questions, before them): 79 perfect. Still wrong: L3-030, a by-activity file
// whose afternoon blocks miss the half-day division on every day, so every page is unsure and its
// layout is asked (rule 6); unanswered, it is read all-camp.
const CEILING_3 = {
  perfectAtLeast: 79,
  errors: 0,
  questions: { layout: 1 },
  wrong: { groups: 23, fixed: 2, activities: 21, cells: 406 }
};

describe("Import last year on hard made-up camps (level 3)", () => {
  const results = hardCamps(80).map((camp) =>
    scoreCamp(camp, { engine, XLSX, terms: buildTerms([]) })
  );
  const totals = summarise(results);

  it("reads at least as many camps perfectly, asks and reads wrong no more than it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING_3.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING_3.perfectAtLeast);
    for (const key of ["questions", "wrong"]) {
      for (const [kind, n] of Object.entries(totals[key])) {
        expect({ key, kind, n }).toEqual({
          key,
          kind,
          n: Math.min(n, CEILING_3[key][kind] || 0)
        });
      }
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

  // 2026-10-27, after the classification rules and docs/import/names-and-divisions.md: read
  // perfectly, nothing asked. CIT is its own division (rule 1); "Lunch2" and "Swim Returning"
  // are read as Lunch 2 and Swim Return and shown in the notes (rules 2 and 3).
  it("reads it perfectly and asks nothing", () => {
    const ceiling = { questions: {}, wrong: {} };
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
