/**
 * The note an import card shows for an answer filled in from memory (desktop learnedView.js
 * memoryStripText): who gave it and when, from the record's Created By and date (ImportAnswers,
 * repo ADR 0021). Pure, so the same answer always reads the same.
 */
import { shortDate } from "c/shoreshTerms";

function whose(row) {
  if (row.byYou) {
    return "your";
  }
  const first = String(row.byName || "")
    .trim()
    .split(/\s+/)[0];
  return first ? `${first}'s` : "a former user's";
}

/** "Remembered from your answer on Jul 3", "Remembered from Dana's answer on Jul 3". */
export function rememberedNote(row) {
  if (!row) {
    return "Remembered";
  }
  const on = shortDate(row.answeredOn);
  return `Remembered from ${whose(row)} answer${on ? ` on ${on}` : ""}`;
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
