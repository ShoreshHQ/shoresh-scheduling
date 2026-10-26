/**
 * The note an import card shows for an answer filled in from memory (desktop learnedView.js
 * memoryStripText): who gave it and when, from the record's Created By and date (ImportAnswers,
 * repo ADR 0021). Pure, so the same answer always reads the same.
 */
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-07-03" -> "3 Jul" (desktop shortDate). */
function shortDate(iso) {
  const [, month, day] = String(iso || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name && Number(day) ? `${Number(day)} ${name}` : "";
}

function whose(row) {
  if (row.byYou) {
    return "your";
  }
  const first = String(row.byName || "")
    .trim()
    .split(/\s+/)[0];
  return first ? `${first}'s` : "a former user's";
}

/** "Remembered from your answer on 3 Jul", "Remembered from Dana's answer on 3 Jul". */
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
