/**
 * Patterns in a camp's remembered answers (repo ADR 0021 choices 10-15; desktop
 * src/ingest/answerPatterns.js and docs/adr/2026-10-11-import-answer-memory.md §3.4). Nothing is
 * stored but the answers: every pattern is worked out from them each time, so the same answers
 * always give the same patterns (MEMO-3.4). Pure.
 *
 * A remembered answer (ImportAnswers / LearnedAnswers): { id, key or question, answer, savedAt
 * (when it was saved: one import's answers are saved together), shape (the question's shape
 * when it was answered), fromSuggestion (it agreed with a suggestion shown on its card), byYou,
 * byName, answeredOn }.
 *
 * A template is a fixed menu entry, never a search (MEMO-3.1). Each reads a question's key and
 * says which pattern it belongs to (its antecedent) and what the answer says (its verdict):
 *
 * | Template  | Questions                    | Same pattern when            | Verdicts             |
 * | --------- | ---------------------------- | ---------------------------- | -------------------- |
 * | numbered  | kind\| (fixed/recurring/act.) | the name without its number  | fixed/recurring/act. |
 * | meal      | kind\|                        | a meal's name                | fixed/recurring/act. |
 * | spelling  | similar\|                     | the same kind of difference  | same / different     |
 * | list      | list\| (one or a choice)      | the same mark between names  | one / several        |
 * | together  | split\| (a group of bunks)    | any group read as one        | split / keep         |
 *
 * "All camp except..." has no template: Salesforce asks no such question, so there is nothing
 * to learn from.
 */
import { similarity } from "c/shoreshImportEngine";

/** The bar (desktop LEARNING_BAR, Greg 2026-10-11: three, not four). */
export const LEARNING_BAR = Object.freeze({
  instances: 3,
  imports: 2,
  explicit: 1
});

/** The key of a forgotten pattern: "pattern|<template>|<antecedent>". */
export const PATTERN_PREFIX = "pattern|";
export const TEMPLATES = Object.freeze([
  "numbered",
  "meal",
  "spelling",
  "list",
  "together"
]);

const MEAL = /^(lunch|menucha|breakfast|dinner|snack)(\s*\d+)?$/i;
const MIN_STEM = 3;

/** The parts of a key; "\|" and "\\" stand for themselves (c/shoreshLists adds.js keyPart). */
/**
 * One part of a key, escaped so a "|" or "\\" in a name can't run into the next part (c/shoreshLists
 * adds.js keyPart; LearnedAnswers.cls partOf does the same). keyParts reads it back.
 */
export function keyPart(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

/** A forgotten pattern's marker key, as the server saves it (LearnedAnswers.forgetPattern). */
export function patternKey(template, antecedent) {
  return `${PATTERN_PREFIX}${keyPart(template)}|${keyPart(antecedent)}`;
}

export function keyParts(key) {
  const parts = [];
  let part = "";
  for (let i = 0; i < key.length; i += 1) {
    if (key[i] === "\\" && i + 1 < key.length) {
      i += 1;
      part += key[i];
    } else if (key[i] === "|") {
      parts.push(part);
      part = "";
    } else {
      part += key[i];
    }
  }
  parts.push(part);
  return parts;
}

const loose = (text) =>
  String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * A numbered name's stem: "Lunch 2" -> "lunch". Only a trailing number goes; "Group 2A" has
 * none (a code, not a number), and a stem under three letters, or one with a digit, is none.
 */
export function stem(name) {
  const m = /^(.*?)\s*\d+$/.exec(loose(name));
  if (!m) {
    return null;
  }
  const base = m[1].trim();
  return base.length >= MIN_STEM && !/\d/.test(base) ? base : null;
}

/** A meal's name, the whole name only: "Lunch", "Lunch 3"; not "Snack Shack". */
export function isMeal(name) {
  return MEAL.test(String(name || "").trim());
}

/** The mark a list cell's names are split by (c/shoreshImportEngine electives.js listShape). */
function listMark(text) {
  const value = String(text || "");
  const mark = [";", ",", " / "].find((d) => value.includes(d));
  if (mark) {
    return mark.trim();
  }
  return /\S\/\S/.test(value) ? "/" : null;
}

/** What a similar-names answer says: the same name, or two. */
function sameOrDifferent(answer) {
  if (answer === "a" || answer === "b") {
    return "same";
  }
  return answer === "different" ? "different" : null;
}

/**
 * The patterns a question belongs to, each { template, antecedent, verdict, name }: name is the
 * question in camp words, for the examples. answer: the answer given (null for a question not
 * yet answered: its verdict is then null).
 */
export function templatesOf(question, answer) {
  const key = String(question || "");
  const p = keyParts(key);
  const out = [];
  // A kind key is written unescaped (items.js): the name to the first "|", then the program.
  if (key.startsWith("kind|")) {
    const rest = key.slice(5);
    const cut = rest.indexOf("|");
    p[1] = cut < 0 ? rest : rest.slice(0, cut);
    p[2] = cut < 0 ? "" : rest.slice(cut + 1);
  }
  if (p[0] === "kind" && p[1]) {
    const verdict = ["fixed", "recurring", "activity"].includes(answer)
      ? answer
      : null;
    const program = p[2] ? `|${keyPart(loose(p[2]))}` : "";
    const name = p[2] ? `${p[1]} (${p[2]})` : p[1];
    const s = stem(p[1]);
    if (s) {
      out.push({
        template: "numbered",
        antecedent: `${keyPart(s)}${program}`,
        verdict,
        name
      });
    }
    if (isMeal(p[1])) {
      out.push({
        template: "meal",
        antecedent: `meal${program}`,
        verdict,
        name
      });
    }
  } else if (p[0] === "similar" && p[4] && p[5]) {
    const reason = similarity(p[4], p[5]);
    if (reason) {
      out.push({
        template: "spelling",
        antecedent: `${p[1]}|${reason}`,
        verdict: sameOrDifferent(answer),
        name: `“${p[4]}” / “${p[5]}”`
      });
    }
  } else if (p[0] === "list" && p[1]) {
    const mark = listMark(p[1]);
    if (mark) {
      out.push({
        template: "list",
        antecedent: mark,
        verdict: ["one", "several"].includes(answer) ? answer : null,
        name: p[1]
      });
    }
  } else if (p[0] === "split" && p[1]) {
    out.push({
      template: "together",
      antecedent: "group",
      verdict: ["split", "keep"].includes(answer) ? answer : null,
      name: p[1]
    });
  }
  return out;
}

const SEP = "\u0000";
const groupKey = (template, antecedent) => `${template}${SEP}${antecedent}`;
const time = (row) => Date.parse(row.savedAt || "") || 0;
const questionOf = (row) => String(row.key ?? row.question ?? "");

/** Newest first; answers saved together in question order, so the order never varies. */
function newestFirst(a, b) {
  const t = time(b) - time(a);
  if (t !== 0) {
    return t;
  }
  const qa = questionOf(a);
  const qb = questionOf(b);
  return qa < qb ? -1 : qa > qb ? 1 : 0;
}

/** When each pattern was last forgotten: Map(group key -> time). */
function forgottenAt(rows) {
  const at = new Map();
  for (const row of rows) {
    const q = questionOf(row);
    if (q.startsWith(PATTERN_PREFIX)) {
      const [, template, antecedent] = keyParts(q);
      at.set(groupKey(template, antecedent), time(row));
    }
  }
  return at;
}

/**
 * Every pattern the answers show, each { template, antecedent, instances (one per question,
 * newest first) }, in a fixed order. Answers saved at or before the pattern was last forgotten
 * do not count toward it (MEMO-4.5); they stay remembered as answers.
 */
export function patternGroups(rows) {
  const list = (rows || []).filter(Boolean);
  const vetoed = forgottenAt(list);
  const groups = new Map();
  for (const row of [...list].sort(newestFirst)) {
    for (const t of templatesOf(questionOf(row), row.answer)) {
      if (!t.verdict) {
        continue;
      }
      const gk = groupKey(t.template, t.antecedent);
      if (vetoed.has(gk) && time(row) <= vetoed.get(gk)) {
        continue;
      }
      if (!groups.has(gk)) {
        groups.set(gk, {
          template: t.template,
          antecedent: t.antecedent,
          instances: []
        });
      }
      groups
        .get(gk)
        .instances.push({ ...row, verdict: t.verdict, name: t.name });
    }
  }
  return [...groups.keys()].sort().map((gk) => groups.get(gk));
}

/**
 * A pattern's band (desktop evaluateGroup): "established" when the three newest agree, from two
 * imports at least, one of them an answer picked without a suggestion; "suggest" when the two
 * newest agree; else "ask" (one example, or the newest disagrees with the one before: one
 * disagreement demotes, MEMO-4.1). With what is still missing for "established".
 */
export function evaluate(group) {
  const { instances } = group;
  const newest = instances[0];
  const verdict = newest.verdict;
  // Answers saved together have no order: the newest import's answers must all agree, and a
  // run stops before an import whose answers disagree (MEMO-4.1), whatever their keys' order.
  let run = 0;
  while (run < instances.length) {
    const at = time(instances[run]);
    let end = run;
    while (end < instances.length && time(instances[end]) === at) {
      end += 1;
    }
    if (instances.slice(run, end).some((r) => r.verdict !== verdict)) {
      break;
    }
    run = end;
  }
  const supporters = instances.slice(0, run);
  const window = supporters.slice(0, LEARNING_BAR.instances);
  // Only an import's answers count as imports and as picked yourself: a change on "What
  // Shoresh has learned" agrees, but adds neither (fromLearned).
  const imported = window.filter((r) => !r.fromLearned);
  const imports = new Set(imported.map(time)).size;
  const explicit = imported.filter((r) => !r.fromSuggestion).length;
  let band = "ask";
  if (instances.length >= 2 && run >= 2) {
    band =
      run >= LEARNING_BAR.instances &&
      imports >= LEARNING_BAR.imports &&
      explicit >= LEARNING_BAR.explicit
        ? "established"
        : "suggest";
  }
  const missing = [];
  if (run < LEARNING_BAR.instances) {
    missing.push("more_answers");
  }
  if (imports < LEARNING_BAR.imports) {
    missing.push("another_import");
  }
  if (explicit < LEARNING_BAR.explicit) {
    missing.push("explicit");
  }
  const shapes = new Set(window.map((r) => r.shape || ""));
  const agree = instances.filter((r) => r.verdict === verdict).length;
  return {
    band,
    verdict,
    agree,
    disagree: instances.length - agree,
    supporters,
    progress: {
      agreeing: run,
      needed: LEARNING_BAR.instances,
      imports,
      explicit,
      missing,
      band
    },
    // One shape for all the answers behind it, or none (mixed, or saved before shapes were).
    shape: shapes.size === 1 && !shapes.has("") ? [...shapes][0] : null
  };
}

/** Every pattern of two questions or more, with its band, for "What Shoresh has learned". */
export function patternsOf(rows) {
  return patternGroups(rows)
    .filter((g) => g.instances.length >= 2)
    .map((g) => ({ ...g, ...evaluate(g) }));
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-07-03" -> "3 Jul" (desktop shortDate). */
export function shortDate(iso) {
  const [, month, day] = String(iso || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name && Number(day) ? `${Number(day)} ${name}` : "";
}

function firstName(row) {
  return String(row.byName || "")
    .trim()
    .split(/\s+/)[0];
}

/** Whose answer (as PR 2's cards say it): "your", "Dana's", "a former user's". */
export function whose(row) {
  if (row.byYou) {
    return "your";
  }
  const first = firstName(row);
  return first ? `${first}'s` : "a former user's";
}

/** "A, B and C", or "A, B, C and 2 more". */
export function joinNames(names, total = names.length) {
  const shown = names.slice(0, 3);
  const more = Math.max(0, total - shown.length);
  if (more > 0) {
    return `${shown.join(", ")} and ${more} more`;
  }
  return shown.length > 1
    ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
    : shown[0] || "";
}

/** Names in reading order: "Lunch 2" before "Lunch 10". */
export function inOrder(names) {
  return [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function joinWords(words) {
  return joinNames(words, words.length);
}

/**
 * Whose answers and when, as PR 2's cards word one answer: "your answers for Lunch 1, Lunch 2
 * and Lunch 3 on 3 Jul and 12 Oct"; when people differ, each with theirs: "answers for ...
 * (yours 3 Jul, Dana's 12 Oct)".
 */
export function fromAnswers(supporters) {
  const shown = supporters.slice(0, LEARNING_BAR.instances);
  const names = joinNames(inOrder(shown.map((r) => r.name)), supporters.length);
  const people = [...new Set(shown.map(whose))];
  if (people.length === 1) {
    const dates = [
      ...new Set(shown.map((r) => shortDate(r.answeredOn)))
    ].filter(Boolean);
    return `${people[0]} answers for ${names}${dates.length ? ` on ${joinWords(dates)}` : ""}`;
  }
  const stamps = [];
  for (const r of shown) {
    const who = whose(r);
    const stamp =
      `${who === "your" ? "yours" : who} ${shortDate(r.answeredOn)}`.trim();
    if (!stamps.includes(stamp)) {
      stamps.push(stamp);
    }
  }
  return `answers for ${names} (${stamps.join(", ")})`;
}

/**
 * The answer a pattern suggests for a question card, or null: { value, band, text, template,
 * antecedent }. card: { id, options: [{ value }], learn: { shape, same } } (learn.same: the
 * option a "same" similar-names answer is). Only a pattern at "suggest" or better suggests, and
 * only an answer the card offers. A question of another shape than the pattern's answers is
 * held at "suggest" (MEMO-3.3). It is a suggestion: pre-selected, never applied (MEMO-6.5).
 */
export function suggestionFor(card, rows) {
  return suggest(card, groupsByKey(rows));
}

function groupsByKey(rows) {
  return new Map(
    patternGroups(rows).map((g) => [groupKey(g.template, g.antecedent), g])
  );
}

function suggest(card, groups) {
  const learn = card.learn || {};
  const values = new Set((card.options || []).map((o) => o.value));
  let best = null;
  for (const t of templatesOf(card.id, null)) {
    const group = groups.get(groupKey(t.template, t.antecedent));
    if (!group) {
      continue;
    }
    const ev = evaluate(group);
    if (ev.band === "ask") {
      continue;
    }
    const value =
      t.template === "spelling" && ev.verdict === "same"
        ? learn.same
        : ev.verdict;
    if (!value || !values.has(value)) {
      continue;
    }
    const sameShape = ev.shape !== null && ev.shape === (learn.shape || null);
    const band = ev.band === "established" && !sameShape ? "suggest" : ev.band;
    const rank = band === "established" ? 2 : 1;
    const newest = time(ev.supporters[0]);
    if (
      !best ||
      rank > best.rank ||
      (rank === best.rank && newest > best.newest)
    ) {
      best = { rank, newest, value, band, t, ev };
    }
  }
  if (!best) {
    return null;
  }
  return {
    value: best.value,
    band: best.band,
    template: best.t.template,
    antecedent: best.t.antecedent,
    from: fromAnswers(best.ev.supporters),
    text: `Suggested from ${fromAnswers(best.ev.supporters)}`
  };
}

/**
 * The cards' suggestions, by card id: only for a card not answered yet (a remembered exact
 * answer is the card's own and wins). rows: the camp's remembered answers as this import read
 * them before any answer was given here, so a suggestion stays the same while answering.
 */
export function suggestionsFor(cards, rows, remembered = {}) {
  const out = {};
  const groups = groupsByKey(rows);
  for (const card of cards || []) {
    if (remembered[card.id] === undefined) {
      const s = suggest(card, groups);
      if (s) {
        out[card.id] = s;
      }
    }
  }
  return out;
}

/** The only answer Shoresh fills in on its own (MEMO-5.1; desktop AUTO_APPLY_ELIGIBLE). */
export const AUTO_ANSWER = "fixed";
const AUTO_TEMPLATES = new Set(["numbered", "meal"]);

/**
 * Whether a suggestion is one Shoresh applies on its own (MEMO-5.1): only a steady
 * (established, same-shape) pattern that a name is a fixed activity, on a kind question.
 * Everything else stays a suggestion and still asks.
 */
export function appliesOnItsOwn(card, suggestion) {
  return (
    !!suggestion &&
    String(card.id || "").startsWith("kind|") &&
    suggestion.band === "established" &&
    suggestion.value === AUTO_ANSWER &&
    AUTO_TEMPLATES.has(suggestion.template)
  );
}

/**
 * The answers Shoresh fills in on its own for this import (MEMO-5.1), by card id: each
 * { value, template, antecedent, from, text }. Only for a card not answered yet and not undone in
 * this import (undone: ids). Same rows, same cards, same answers.
 */
export function autoAnswersFor(cards, rows, remembered = {}, undone = []) {
  const skip = new Set(undone);
  const suggestions = suggestionsFor(cards, rows, remembered);
  const out = {};
  for (const card of cards || []) {
    const s = suggestions[card.id];
    if (!card.answer && !skip.has(card.id) && appliesOnItsOwn(card, s)) {
      out[card.id] = { ...s, text: `Auto-applied from ${s.from}` };
    }
  }
  return out;
}

/**
 * The auto-applied answers whose question is no longer asked (it only came from another auto
 * answer that was undone or changed): their ids, sorted. None may stay hidden in the answers.
 */
export function staleAuto(auto, cards) {
  const asked = new Set((cards || []).map((c) => c.id));
  return Object.keys(auto || {})
    .filter((id) => !asked.has(id))
    .sort();
}

/**
 * The answers to remember, each with what the pattern layer needs: the question's shape when
 * it was answered, and whether the answer agreed with the suggestion its card showed (it then
 * does not count as an answer picked yourself, MEMO-3.2). remember: [{ key, answer }].
 * auto: the answers Shoresh filled in on its own (autoAnswersFor), left out: an answer no one
 * gave is no evidence, so a pattern never feeds itself (MEMO-5.1).
 */
export function withLearning(remember, cards, suggestions, auto = {}) {
  const byId = new Map((cards || []).map((c) => [c.id, c]));
  return (remember || [])
    .filter(
      (entry) => !(auto[entry.key] && auto[entry.key].value === entry.answer)
    )
    .map((entry) => {
      const card = byId.get(entry.key);
      const shape = card && card.learn ? card.learn.shape : null;
      const s = (suggestions || {})[entry.key];
      return {
        ...entry,
        ...(shape ? { shape } : {}),
        ...(s && s.value === entry.answer ? { suggested: true } : {})
      };
    });
}
