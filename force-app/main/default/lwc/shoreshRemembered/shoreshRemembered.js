/**
 * The note an import card shows for an answer filled in from memory (desktop learnedView.js
 * memoryStripText): who gave it and when, from the record's Created By and date (ImportAnswers,
 * repo ADR 0021). Pure, so the same answer always reads the same.
 */
import { FIELD } from "c/shoreshSchema";
import { shortDate } from "c/shoreshTerms";

/** Whose answer it was: nobody named when it was yours. */
function byWhom(row) {
  if (row.byYou) {
    return "";
  }
  const first = String(row.byName || "")
    .trim()
    .split(/\s+/)[0];
  return first || "a former user";
}

/** Greg's pick (2026-11-12): "Answered as before", then who (when not you) and when. */
export const ANSWERED_AS_BEFORE = "Answered as before";

/** "Answered as before · Jul 3", "Answered as before · Dana, Jul 3". */
export function rememberedNote(row) {
  if (!row) {
    return ANSWERED_AS_BEFORE;
  }
  const tail = [byWhom(row), shortDate(row.answeredOn)]
    .filter(Boolean)
    .join(", ");
  return tail ? `${ANSWERED_AS_BEFORE} · ${tail}` : ANSWERED_AS_BEFORE;
}

/** The camp's remembered answers by question: { answers: key -> answer, notes: key -> note }. */
export function rememberedByKey(rows) {
  const answers = {};
  const notes = {};
  (rows || []).forEach((row) => {
    answers[row.key] = row.answer;
    notes[row.key] = rememberedNote(row);
  });
  return { answers, notes };
}

/**
 * What this camp answered before, read with `read` (ImportController.getAnswers). Without them an
 * import still works: everything is asked.
 */
export async function rememberedFor(setup, read) {
  const campId = setup && setup.season && setup.season[FIELD.Season.Camp];
  let rows = [];
  try {
    rows = (campId ? await read({ campId }) : []) || [];
  } catch {
    rows = [];
  }
  return { ...rememberedByKey(rows), rows };
}
