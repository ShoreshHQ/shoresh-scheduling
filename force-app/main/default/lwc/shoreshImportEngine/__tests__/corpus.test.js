// "Import last year" against made-up level-1 camps (docs/import/corpus.md). Today's numbers are a
// ceiling: a change may ask fewer questions or read fewer things wrong, never more. When a change
// improves them, lower the numbers here (npm run score:import prints the full corpus).
import * as XLSX from "xlsx";
import * as engine from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { ordinaryCamps } from "../../../../../../scripts/import-corpus/camps";
import {
  scoreCamp,
  summarise,
  summaryTable
} from "../../../../../../scripts/import-corpus/score";

// The first 80 camps: ten of each layout, a few seconds. The node script scores all of them.
const SAMPLE = 80;

// Baseline 2026-10-27, on these 80 camps. Every kind not listed is 0.
const CEILING = {
  perfectAtLeast: 62,
  errors: 0,
  questions: {},
  wrong: { days: 18, groups: 17, fixed: 1, activities: 16, cells: 2242 }
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
