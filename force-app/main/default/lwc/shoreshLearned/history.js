/**
 * "What Shoresh has learned" as one row per answer, newest first (repo ADR 0023, as changed by
 * the word walk of 2026-11-12: no history log on screen). Each row says what is learned now in
 * camp words, when, and its state: "Answered as before", "Asks first" once forgotten, "Guessed in
 * an import", a pattern's band. Pure: the same history and answers always give the same rows
 * (MEMO-7.6).
 *
 * The rows come from the camp's stored events (LearnedEvents.cls: answered, changed, forgotten,
 * undone, auto). A remembered answer older than the events has none: it is read as answered
 * when it was saved. The patterns' steps (became Suggested, became Steady, demoted) are not
 * stored: they are worked out by replaying the events in order and reading the patterns
 * (c/shoreshPatterns) after each save, as the import would have read them then. Only the newest
 * line of each question and of each pattern is kept: its state now. The row of the answer
 * remembered now carries Change and Forget; a pattern's row there is now carries its progress
 * and Forget pattern.
 */
import { PATTERN_PREFIX, keyParts, patternsOf } from "c/shoreshPatterns";
import { shortDate } from "c/shoreshTerms";
import { learnedRow, patternRow } from "./view";

const time = (row) => Date.parse(row.savedAt || "") || 0;
const isMarker = (question) =>
  String(question || "").startsWith(PATTERN_PREFIX);
const RANK = { none: 0, ask: 0, suggest: 1, established: 2 };
const HOLDS = new Set(["answered", "changed", "undone"]);
// The events that make a line (an auto-applied answer has one of its own).
const LINES = new Set([...HOLDS, "forgotten"]);
// Greg's picks (2026-11-12): an answer remembered is "Answered as before"; one forgotten "Asks
// first". A deleted thing or a guess forgotten is no question the import asks.
const FORGOTTEN = {
  deleted: "Can come back",
  guessed: "No longer guessed"
};

function who(row) {
  return row.byYou ? "you" : row.byName || "a former user";
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** What holds now: an answer's state, in words (MEMO-7.2). */
function heldBy(row, group) {
  if (group === "deleted") {
    return `Deleted by ${who(row)}`;
  }
  if (group === "guessed") {
    return "Guessed in an import";
  }
  // Greg's pick (2026-11-12): the import's own words, "Answered as before", and whose.
  return row.byYou ? "Answered as before" : `Answered as before · ${who(row)}`;
}

/** A line's state, in words: what its newest event left. */
function howOf(kind, row, group, extra = {}) {
  switch (kind) {
    case "answered":
    case "changed":
    case "undone":
      return group === null ? `Undone by ${who(row)}` : heldBy(row, group);
    case "forgotten":
      return FORGOTTEN[group] || "Asks first";
    case "auto":
      return `Auto-applied in the ${shortDate(row.answeredOn)} import`;
    case "suggested":
      return `Became Suggested (after ${extra.count} answers)`;
    case "steady":
      return `Became Steady (after ${extra.count} answers)`;
    case "demoted":
      return "Demoted (an answer disagreed)";
    default:
      return "";
  }
}

/** The events, with a remembered answer that has none read as answered when it was saved. */
function allEvents(events, answers) {
  // An answer the history saw saved (an Undo or Forget of it does not say when it was saved).
  const known = new Set(
    (events || [])
      .filter(
        (e) =>
          e.what === "answered" ||
          e.what === "changed" ||
          (e.what === "forgotten" && isMarker(e.question))
      )
      .map((e) => e.answerId)
      .filter(Boolean)
  );
  const older = (answers || [])
    .filter((a) => !known.has(a.id))
    .map((a) => ({
      ...a,
      what: isMarker(a.question)
        ? "forgotten"
        : a.fromLearned
          ? "changed"
          : "answered",
      answerId: a.id,
      older: true
    }));
  // In one second (a save's time is kept to the second), what came before the history first,
  // then the stored events in the order they were saved.
  return [...(events || []), ...older].sort(
    (a, b) =>
      time(a) - time(b) ||
      (a.older ? 0 : 1) - (b.older ? 0 : 1) ||
      compare(String(a.id), String(b.id))
  );
}

/** The answer an event leaves remembered, as the patterns read it. */
function rowOf(e) {
  return {
    id: e.answerId,
    question: e.question,
    answer: e.answer,
    shape: e.shape || null,
    fromSuggestion: !!e.fromSuggestion,
    fromLearned: e.what === "changed",
    savedAt: e.savedAt,
    byYou: !!e.byYou,
    byName: e.byName,
    answeredOn: e.answeredOn
  };
}

const patternId = (p) => `pattern:${p.template}:${p.antecedent}`;

function markerId(question) {
  const [, template, antecedent] = keyParts(question);
  return `pattern:${template}:${antecedent}`;
}

/**
 * The rows, newest first, one per question and pattern, without what Shoresh already knew (the screen adds
 * it last). events: LearnedEvents.forCamp; answers: LearnedAnswers.forCamp (what is remembered
 * now). Each line { key, kind, title, how, when, time, question, answerId, pattern, ...,
 * current, answer (the row Change and Forget act on), patternNow (the pattern row) }.
 */
export function historyLines(events, answers, t, spell) {
  const state = new Map();
  const byAnswer = new Map();
  const titles = new Map();
  // Each pattern after the last save: { band, disagree }.
  let bands = new Map();
  // An answer brought back that the history never saw saved (older than it): as it is now.
  const live = new Map((answers || []).map((a) => [a.id, a]));
  const lines = [];
  const ordered = allEvents(events, answers);
  let at = 0;
  while (at < ordered.length) {
    const step = time(ordered[at]);
    let end = at;
    while (end < ordered.length && time(ordered[end]) === step) {
      end += 1;
    }
    const group = ordered.slice(at, end);
    at = end;
    const markers = new Set();
    for (const e of group) {
      const row = rowOf(e);
      const marker = isMarker(e.question);
      // Whose answer the line says holds: an Undo brings back the answer as it was.
      let source = e;
      if (e.what === "answered" || e.what === "changed") {
        state.set(e.question, row);
        byAnswer.set(e.answerId, row);
      } else if (e.what === "forgotten") {
        if (marker) {
          state.set(e.question, row);
          byAnswer.set(e.answerId, row);
          markers.add(markerId(e.question));
        } else {
          state.delete(e.question);
        }
      } else if (e.what === "undone") {
        const back =
          e.answerId &&
          (byAnswer.get(e.answerId) ||
            (live.has(e.answerId) &&
              rowOf({ ...live.get(e.answerId), answerId: e.answerId })) ||
            (marker ? null : row));
        if (back) {
          source = back;
          state.set(e.question, back);
          byAnswer.set(e.answerId, back);
        } else {
          state.delete(e.question);
        }
        if (marker) {
          markers.add(markerId(e.question));
        }
      }
      if (!LINES.has(e.what) && e.what !== "auto") {
        continue;
      }
      if (marker) {
        const id = markerId(e.question);
        lines.push({
          key: `e:${e.id}`,
          kind: e.what,
          title: titles.get(id) || keyParts(e.question)[2] || "",
          how: howOf(e.what, e, null),
          when: shortDate(e.answeredOn),
          time: step,
          question: e.question,
          answerId: e.answerId || null,
          pattern: id
        });
        continue;
      }
      const shown = learnedRow(row, t, spell);
      lines.push({
        key: `e:${e.id}`,
        kind: e.what,
        title: shown.title,
        how: howOf(e.what, source, shown.group),
        when: shortDate(e.answeredOn),
        time: step,
        question: e.question,
        answerId: e.what === "auto" ? null : e.answerId || null,
        group: shown.group
      });
    }
    if (group.every((e) => e.what === "auto")) {
      continue;
    }
    // The patterns after this save, as the next import would read them.
    const now = new Map();
    for (const p of patternsOf([...state.values()])) {
      const id = patternId(p);
      const row = patternRow(p, t);
      titles.set(id, row.title);
      now.set(id, { band: p.progress.band, disagree: p.disagree });
      const was = bands.get(id) || { band: "none", disagree: 0 };
      const before = RANK[was.band];
      const after = RANK[p.progress.band];
      let kind = null;
      if (after > before) {
        kind = p.progress.band === "established" ? "steady" : "suggested";
      } else if (
        after < before &&
        !markers.has(id) &&
        p.disagree > was.disagree
      ) {
        // Only an answer this save added that disagrees demotes (MEMO-4.1).
        kind = "demoted";
      }
      if (kind) {
        lines.push({
          key: `p:${id}:${step}`,
          kind,
          title: row.title,
          how: howOf(kind, group[0], null, { count: p.progress.agreeing }),
          when: shortDate(group[0].answeredOn),
          time: step,
          pattern: id,
          template: p.template,
          antecedent: p.antecedent,
          derived: true
        });
      }
    }
    bands = now;
  }
  return finish(lines, answers, t, spell);
}

/** Orders newest first, keeps each question's and pattern's newest line, and finds the rows
 * that act on what is now. */
function finish(lines, answers, t, spell) {
  const kept = new Set();
  const sorted = lines
    .map((line, i) => ({ line, i }))
    .sort(
      (a, b) =>
        b.line.time - a.line.time ||
        (a.line.derived ? 0 : 1) - (b.line.derived ? 0 : 1) ||
        compare(a.line.title, b.line.title) ||
        a.i - b.i
    )
    .map((x) => x.line)
    .filter((line) => {
      // One row per question and per pattern: its newest line, the state it is in now.
      const id = line.pattern || line.question;
      if (!id || kept.has(id)) {
        return !id;
      }
      kept.add(id);
      return true;
    });

  // The line of each answer remembered now (Change, Forget), and of each pattern there is now.
  const live = new Map(
    (answers || [])
      .filter((a) => !isMarker(a.question))
      .map((a) => [a.id, learnedRow(a, t, spell)])
  );
  const patterns = new Map(
    patternsOf(answers || []).map((p) => [patternId(p), patternRow(p, t)])
  );
  const seen = new Set();
  for (const line of sorted) {
    if (HOLDS.has(line.kind) && live.has(line.answerId)) {
      if (!seen.has(line.answerId)) {
        line.current = true;
        line.answer = live.get(line.answerId);
      }
      seen.add(line.answerId);
    } else if (line.derived && patterns.has(line.pattern)) {
      if (!seen.has(line.pattern)) {
        line.current = true;
        line.patternNow = patterns.get(line.pattern);
      }
      seen.add(line.pattern);
    }
  }
  return sorted;
}
