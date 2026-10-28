/**
 * The rows and groups of "What Shoresh has learned" (desktop learnedView.js buildLearnedGroups,
 * matchesQuery): pure, so the same answers always show the same screen.
 */

import { holdsNoDivision } from "c/shoreshImportEngine";
import {
  AUTO_ANSWER,
  LEARNING_BAR,
  PATTERN_PREFIX,
  inOrder,
  joinNames
} from "c/shoreshPatterns";
import { GROUPS, describe } from "./kinds";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-07-03" -> "3 Jul" (desktop shortDate). */
export function shortDate(iso) {
  const [, month, day] = String(iso || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name && Number(day) ? `${Number(day)} ${name}` : "";
}

function whoLine(row, group) {
  const who = row.byYou ? "you" : row.byName || "a former user";
  const on = shortDate(row.answeredOn);
  if (group === "deleted") {
    return `Deleted by ${who} on ${on}`;
  }
  if (group === "guessed") {
    return `Guessed in an import by ${who} on ${on}`;
  }
  return `Answered by ${who} on ${on}`;
}

const loose = (name) =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * The names the camp has set up now, in the season the page has open (its setup, already read:
 * no query of its own): programs, time blocks, divisions, groups, set-time items, places and
 * activities, weeks.
 */
function setupRecords(setup) {
  if (!setup) {
    return [];
  }
  const programs = setup.programs || [];
  const records = [
    ...programs.map((p) => p.program),
    ...programs.flatMap((p) => [
      ...(p.timeBlocks || []),
      ...(p.fixedActivities || []),
      ...(p.recurringActivities || [])
    ]),
    ...programs.flatMap((p) =>
      // DIV-1.1: a holding record is no division of its own.
      (p.divisions || []).flatMap((d) => [
        ...(holdsNoDivision(d.division) ? [] : [d.division]),
        ...(d.groups || [])
      ])
    ),
    ...(setup.locationTypes || []),
    ...(setup.locations || []),
    ...(setup.activities || []),
    ...(setup.weeks || [])
  ];
  return records.filter((r) => r && r.Name);
}

/**
 * A key part as the camp writes that name now: matched ignoring capitals and spacing (as the
 * import's own keys are made), else as stored. Ties: the first in setup order.
 */
export function speller(setup) {
  const byLoose = new Map();
  const byId = new Map();
  setupRecords(setup).forEach((r) => {
    if (!byLoose.has(loose(r.Name))) {
      byLoose.set(loose(r.Name), r.Name);
    }
    if (r.Id) {
      byId.set(r.Id, r.Name);
    }
  });
  const spell = (part) => byId.get(part) ?? byLoose.get(loose(part)) ?? part;
  // A record by its Id (weeks, items), or null: never shown as an Id.
  spell.nameOf = (id) => byId.get(id) ?? null;
  // Whether a name is one the camp has set up (ignoring capitals and spacing).
  spell.isCamp = (name) => byLoose.has(loose(name));
  return spell;
}

/** One answer from the server ({ id, question, answer, byYou, byName, answeredOn }) as a row. */
export function learnedRow(row, t, spell) {
  const kind = describe(row.question, row.answer, t, spell);
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    group: kind.group,
    name: kind.name,
    title: `${kind.name}: ${kind.answer}`,
    who: whoLine(row, kind.group),
    choices: kind.choices,
    forgotten: kind.forgotten,
    answeredOn: row.answeredOn || ""
  };
}

/** A forgotten pattern's marker (c/shoreshPatterns): no answer, never a row of its own. */
export function isAnswer(row) {
  return !String(row.question || "").startsWith(PATTERN_PREFIX);
}

// ---------- patterns (desktop learnedView.js patternRow, progressLine, patternFlag) ----------

const PATTERN_GROUP = {
  numbered: "classify",
  meal: "classify",
  spelling: "split",
  list: "split",
  together: "split"
};

const MISSING_TEXT = {
  another_import: "needs one more import",
  explicit: "needs one answer you picked yourself"
};
const SUGGEST_AGAIN_ANSWERS = 2;
const PATTERN_FORGOTTEN = "It won't be suggested again. Its answers stay.";

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function article(word) {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/** What a pattern's answers say, in the words the answers' own rows use (kinds.js). */
function verdictWords(template, verdict, t) {
  if (template === "numbered" || template === "meal") {
    const term = {
      fixed: "FixedActivity",
      recurring: "RecurringActivity",
      activity: "Activity"
    }[verdict];
    return capital(article(t.sIn(term)));
  }
  if (template === "spelling") {
    return verdict === "same" ? "The same name" : "Different names";
  }
  if (template === "list") {
    return verdict === "one"
      ? `Kept as one ${t.sIn("Activity")}`
      : "Split into choices";
  }
  return verdict === "split"
    ? `Split into its ${t.pIn("Group")}`
    : `Kept as one ${t.sIn("Group")}`;
}

/**
 * How close a pattern is to pre-selecting on its own merits (MEMO-6.7): counts and what is
 * missing, in words, never a percentage. "2 of 3 answers - needs one more import".
 */
export function progressLine(p) {
  const { agreeing, needed, missing, band } = p.progress;
  const count =
    agreeing > needed
      ? `${agreeing} answers (${needed} needed)`
      : `${agreeing} of ${needed} answers`;
  if (band === "ask" && p.disagree > 0) {
    return `Your latest answer disagrees - ${SUGGEST_AGAIN_ANSWERS} more agreeing answers to suggest again`;
  }
  const still = missing.map((m) => MISSING_TEXT[m]).filter(Boolean);
  if (band === "established" && still.length === 0) {
    // MEMO-5.1: only a steady "fixed activity" pattern fills in on its own; the rest suggest.
    return `${count} - ${fillsIn(p) ? "fills in on its own" : "suggested every time"}`;
  }
  return still.length ? `${count} - ${still.join(", ")}` : count;
}

/** Whether a steady pattern fills in its questions on its own (MEMO-5.1, c/shoreshPatterns). */
function fillsIn(p) {
  return (
    (p.template === "numbered" || p.template === "meal") &&
    p.verdict === AUTO_ANSWER
  );
}

/** The pattern's band as a flag: what it does at the next import. */
export function patternFlag(band, p = {}) {
  if (band === "established") {
    return fillsIn(p)
      ? "Steady: fills in on its own; Undo in the import"
      : "Steady: suggested every time";
  }
  return band === "suggest" ? "Suggested" : "Still asks";
}

function whoOf(row) {
  return row.byYou ? "you" : row.byName || "a former user";
}

/** One pattern (c/shoreshPatterns patternsOf) as a row of its group. */
export function patternRow(p, t) {
  // A pattern whose latest import disagrees has no supporters: it names what was answered.
  const shown = p.supporters.length ? p.supporters : p.instances;
  const names = inOrder(shown.map((r) => r.name));
  const authors = [...new Set(shown.map(whoOf))];
  const latest = shown.reduce(
    (m, r) => (String(r.answeredOn || "") > m ? String(r.answeredOn) : m),
    ""
  );
  const disagree = p.disagree > 0 ? `, ${p.disagree} earlier disagreed` : "";
  return {
    id: `pattern:${p.template}:${p.antecedent}`,
    pattern: true,
    template: p.template,
    antecedent: p.antecedent,
    group: PATTERN_GROUP[p.template],
    title: `${verdictWords(p.template, p.verdict, t)}: ${joinNames(names)}`,
    who: `Answered by ${joinNames(authors)}, latest ${shortDate(latest)}`,
    progress: progressLine(p),
    confidence: `${p.agree} agree${disagree}`,
    meter: Math.min(p.progress.agreeing, LEARNING_BAR.instances),
    band: p.progress.band,
    flag: patternFlag(p.progress.band, p),
    forgotten: PATTERN_FORGOTTEN,
    answeredOn: latest
  };
}

/**
 * The groups that have rows, in the desktop's order, each { key, label, knew (what Shoresh
 * knew before: its own rules), patterns, rows (answers, newest first, the server's order kept
 * for answers of one day) }.
 */
export function learnedGroups(rows, patterns = [], knew = []) {
  return GROUPS.map((g) => ({
    ...g,
    knew: knew.filter((r) => r.group === g.key),
    patterns: patterns.filter((r) => r.group === g.key),
    rows: rows
      .filter((r) => r.group === g.key)
      .map((r, i) => ({ r, i }))
      .sort(
        (x, y) =>
          (x.r.answeredOn < y.r.answeredOn) -
            (x.r.answeredOn > y.r.answeredOn) || x.i - y.i
      )
      .map((x) => x.r)
  })).filter((g) => g.rows.length + g.patterns.length + g.knew.length > 0);
}

/** Whether a row matches what was typed in search: its title or who answered it. */
export function matches(row, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  return !q || [row.title, row.who].some((s) => s.toLowerCase().includes(q));
}
