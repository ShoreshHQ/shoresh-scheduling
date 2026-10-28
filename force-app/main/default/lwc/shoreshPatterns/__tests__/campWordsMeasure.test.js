// INGEST-3.10: how often what Shoresh already knew suggests the true kind, on questions the import
// really asks. The corpus asks nothing (docs/import/corpus.md), so each made-up camp is nudged
// into asking: one set-time name is missing for one group on one day (rule 9, ask C), or is there
// once more for one group at another time (ask A). The truth is the camp's own: its fixed and
// recurring names. Made-up camps only; the numbers are printed and held as a floor.
import * as XLSX from "xlsx";
import * as engine from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { builtInSuggestion } from "c/shoreshPatterns";
import { ordinaryCamps } from "../../../../../../scripts/import-corpus/camps";
import { travellingCamps } from "../../../../../../scripts/import-corpus/travel";
import { scoreCamp } from "../../../../../../scripts/import-corpus/score";

const terms = buildTerms([]);

// Baseline 2026-10-28: 423 asked, 122 with a suggestion, all 122 the true kind. A change to the
// list may raise these, never lower them silently. Many of these names (the openings, the
// activities) are the corpus's own vocabulary, so this checks the mechanism more than the list.
const FLOOR = { suggestedAtLeast: 122, wrongAtMost: 0 };

/** The camp with `name` nudged one way, or null when it cannot be (no free cell to use). */
function nudged(camp, name, how) {
  const at = [];
  camp.groups.forEach((_, g) =>
    camp.days.forEach((_d, d) =>
      camp.blocks.forEach((_b, b) => {
        if (camp.cell(g, d, b) === name) at.push({ g, d, b });
      })
    )
  );
  if (at.length === 0) return null;
  const setBlocks = new Set(at.map((x) => x.b));
  const first = at[0];
  const other = camp.blocks.findIndex(
    (bl, b) => !setBlocks.has(b) && !bl.fixed
  );
  const swap =
    how === "missing"
      ? { g: first.g, d: 1, b: first.b, to: camp.activities[0] }
      : other < 0
        ? null
        : { g: first.g, d: 1, b: other, to: name };
  if (!swap) return null;
  const cell = (g, d, b) => {
    const hit = g === swap.g && d === swap.d && b === swap.b;
    return hit ? swap.to : camp.cell(g, d, b);
  };
  return { ...camp, cell };
}

function measure() {
  const camps = [...ordinaryCamps(80), ...travellingCamps(40)];
  const out = { asked: 0, suggested: 0, right: 0, wrong: [], byWord: {} };
  for (const camp of camps) {
    const truth = new Map([
      ...camp.fixed.map((n) => [n, "fixed"]),
      ...(camp.recurring || []).map((n) => [n, "recurring"]),
      ...camp.activities.map((n) => [n, "activity"])
    ]);
    for (const name of [...camp.fixed, ...(camp.recurring || [])]) {
      for (const how of ["missing", "elsewhere"]) {
        const c = nudged(camp, name, how);
        if (!c) continue;
        const r = scoreCamp(c, { engine, XLSX, terms, keepProposal: true });
        if (r.error) continue;
        const cards = engine
          .questionCards(r.proposal, terms, {})
          .filter((k) => k.id.startsWith("kind|") && k.answer === null);
        for (const card of cards) {
          const asked = card.id.slice(5).split("|")[0];
          out.asked++;
          const s = builtInSuggestion(card);
          if (!s) continue;
          out.suggested++;
          const w = (out.byWord[asked] = out.byWord[asked] || {
            right: 0,
            wrong: 0
          });
          if (s.value === truth.get(asked)) {
            out.right++;
            w.right++;
          } else {
            w.wrong++;
            out.wrong.push(
              `${camp.id} ${asked}: ${s.value}, truly ${truth.get(asked)}`
            );
          }
        }
      }
    }
  }
  return out;
}

describe("INGEST-3.10: what Shoresh already knew, on questions the import asks", () => {
  const m = measure();

  it("INGEST-3.10: measures how often the suggestion is the true kind (printed)", () => {
    console.log(
      `Camp words on asked questions: ${m.asked} asked, ${m.suggested} with a suggestion, ` +
        `${m.right} right, ${m.suggested - m.right} wrong\n` +
        Object.entries(m.byWord)
          .sort(([a], [b]) => a.localeCompare(b, "en"))
          .map(([w, v]) => `  ${w}: ${v.right} right, ${v.wrong} wrong`)
          .join("\n")
    );
    expect(m.asked).toBeGreaterThan(0);
    expect(m.suggested).toBeGreaterThanOrEqual(FLOOR.suggestedAtLeast);
    expect(m.wrong.slice(0, 5)).toEqual([]);
    expect(m.suggested - m.right).toBeLessThanOrEqual(FLOOR.wrongAtMost);
  });

  it("INGEST-3.10: the same camps give the same numbers", () => {
    expect(measure()).toEqual(m);
  });
});
