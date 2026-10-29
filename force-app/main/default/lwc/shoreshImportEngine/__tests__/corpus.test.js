// "Import last year" against made-up level-1 camps (docs/import/corpus.md). Today's numbers are a
// ceiling: a change may ask fewer questions or read fewer things wrong, never more. When a change
// improves them, lower the numbers here (npm run score:import prints the full corpus).
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import * as engine from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { ordinaryCamps } from "../../../../../../scripts/import-corpus/camps";
import { variedCamps } from "../../../../../../scripts/import-corpus/level2";
import { travellingCamps } from "../../../../../../scripts/import-corpus/travel";
import { hardCamps } from "../../../../../../scripts/import-corpus/level3";
import {
  decisionCamps,
  everyWeekCamps,
  veryHardCamps
} from "../../../../../../scripts/import-corpus/level4";
import {
  decisionCamps5,
  scoreWeirdCamp,
  weirdCamp,
  weirdCamps
} from "../../../../../../scripts/import-corpus/level5";
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
  wrong: { groups: 23, fixed: 2, activities: 21, availability: 2, cells: 406 }
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

// Level 4, very hard: two programs, overnight evenings, weekends, several weeks, a mid-week special
// day, with level 3's traits. The first 80 camps, ten of each layout. Baseline 2026-10-28: 56
// perfect (evenings without am/pm asked or read as morning; a doubled cell in a week with a
// special day on the wrong blocks). After INGEST-2.10 and INGEST-4.10: all 80 perfect.
const CEILING_4 = {
  perfectAtLeast: 80,
  errors: 0,
  questions: {},
  wrong: {}
};

describe("Import last year on very hard made-up camps (level 4)", () => {
  const results = veryHardCamps(80).map((camp) =>
    scoreCamp(camp, {
      engine,
      XLSX,
      terms: buildTerms([]),
      record: nsRecord
    })
  );
  const totals = summarise(results);

  it("reads at least as many camps perfectly, asks and reads wrong no more than it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING_4.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING_4.perfectAtLeast);
    for (const key of ["questions", "wrong"]) {
      for (const [kind, n] of Object.entries(totals[key])) {
        expect({ key, kind, n }).toEqual({
          key,
          kind,
          n: Math.min(n, CEILING_4[key][kind] || 0)
        });
      }
    }
  });
});

// Greg's level-4 decision 3 (2026-10-28): a special day in a camp of two programs covers both
// programs (INGEST-4.11). The first 40 such camps, five of each layout: every one perfect, every
// group of both programs in its special day.
describe("Import last year on two-program camps with a special day (level 4, Greg's decisions)", () => {
  const results = decisionCamps(40).map((camp) =>
    scoreCamp(camp, {
      engine,
      XLSX,
      terms: buildTerms([]),
      record: nsRecord
    })
  );
  const totals = summarise(results);

  it("reads every camp perfectly, the special day covering both programs", () => {
    expect(totals.errors).toBe(0);
    expect(totals.perfect).toBe(40);
    expect(results.every((r) => r.camp.programs.length === 2)).toBe(true);
    expect(results.every((r) => r.camp.special)).toBe(true);
  });
});

// Greg's level-4 decisions 1 and 2 (2026-10-29, INGEST-4.12): a weekend day on its own times every
// week, and a one-week file's mid-week day answered "Every week": one special day, on that day of
// every week. All 16 camps, two of each layout.
describe("Import last year on a day with its own times every week (level 4, Greg's decisions 1 and 2)", () => {
  const results = everyWeekCamps(16).map((camp) =>
    scoreCamp(camp, {
      engine,
      XLSX,
      terms: buildTerms([]),
      record: nsRecord
    })
  );
  const totals = summarise(results);

  it("INGEST-4.12: reads every camp perfectly, one special day on that day of every week", () => {
    expect(totals.errors).toBe(0);
    expect(totals.perfect).toBe(16);
    expect(results.every((r) => r.camp.own)).toBe(true);
  });
});

// Level 5, really weird: one weird trait per camp (level5.js). The first 40 camps, four of each
// trait. Baseline 2026-10-28, before any engine change for them: 14 perfect. After INGEST-2.11 to
// 2.19 (a grid on its side, times in cells, letter codes, Hebrew names, one group, a colour key,
// two activities in a cell) and the one-day truth corrected (Greg's decision 3, INGEST-3.4): all
// 40 right, asking only where the director must say (a colour key, "Swim/Art").
const CEILING_5 = {
  perfectAtLeast: 40,
  errors: 0,
  questions: { colour: 4, list: 4 },
  wrong: {}
};

describe("Import last year on really weird made-up camps (level 5)", () => {
  const deps = { engine, XLSX, terms: buildTerms([]) };
  const results = weirdCamps(40).map((camp) =>
    scoreWeirdCamp(camp, deps, scoreCamp)
  );
  const totals = summarise(results);

  it("reads at least as many camps right, asks and reads wrong no more than it did", () => {
    expect(totals.errors).toBeLessThanOrEqual(CEILING_5.errors);
    expect(totals.perfect).toBeGreaterThanOrEqual(CEILING_5.perfectAtLeast);
    for (const key of ["questions", "wrong"]) {
      for (const [kind, n] of Object.entries(totals[key])) {
        expect({ key, kind, n }).toEqual({
          key,
          kind,
          n: Math.min(n, CEILING_5[key][kind] || 0)
        });
      }
    }
  });

  it("scores asking as the right read where only the director can say", () => {
    const camp = weirdCamp(10); // multiActivity: "Swim/Art" cells
    expect(camp.truth.mustAsk).toBe(true);
    const asked = scoreWeirdCamp(camp, deps, () => ({
      questions: { similar: 1 },
      wrong: { cells: 0 }
    }));
    expect(asked.perfect).toBe(true);
    const silent = scoreWeirdCamp(camp, deps, () => ({
      questions: {},
      wrong: { cells: 0 }
    }));
    expect(silent).toMatchObject({ perfect: false, wrong: { silent: 1 } });
  });
});

// Greg's level-5 decisions 1 and 2 (2026-10-28): "🏊 Swim" is Swim with the emoji kept in the
// notes (INGEST-2.20); "Art (Barn)" is Art at the Barn when two activities are there, else one
// name (INGEST-2.21). The first 32 such camps, half of each: 8 of 32 right before the engine read
// them (only the one-name brackets), every one now.
describe("Import last year on emoji and places in brackets (level 5, Greg's decisions)", () => {
  const deps = { engine, XLSX, terms: buildTerms([]) };
  const results = decisionCamps5(32).map((camp) =>
    scoreWeirdCamp(camp, deps, scoreCamp)
  );
  const totals = summarise(results);

  it("reads every camp right: plain names, the emoji in the notes, shared places as places", () => {
    expect(totals.errors).toBe(0);
    expect(totals.perfect).toBe(32);
    expect(totals.questions).toEqual({});
    const traits = results.map((r) => r.camp.variations[0]);
    expect(traits.filter((t) => t === "emoji")).toHaveLength(16);
    expect(results.some((r) => (r.camp.truth.places || []).length)).toBe(true);
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
