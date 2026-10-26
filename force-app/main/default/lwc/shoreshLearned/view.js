/**
 * The rows and groups of "What Shoresh has learned" (desktop learnedView.js buildLearnedGroups,
 * matchesQuery): pure, so the same answers always show the same screen.
 */
import { GROUPS, describe } from "./kinds";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-07-03" -> "3 Jul" (desktop shortDate). */
export function shortDate(iso) {
  const [, month, day] = String(iso || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name && Number(day) ? `${Number(day)} ${name}` : "";
}

function whoLine(row, group) {
  const who = row.byYou ? "you" : row.byName || "someone";
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
      (p.divisions || []).flatMap((d) => [d.division, ...(d.groups || [])])
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

/**
 * The groups that have rows, in the desktop's order, each { key, label, rows }, rows newest
 * first (the server's order kept for answers of one day).
 */
export function learnedGroups(rows) {
  return GROUPS.map((g) => ({
    ...g,
    rows: rows
      .filter((r) => r.group === g.key)
      .map((r, i) => ({ r, i }))
      .sort(
        (x, y) =>
          (x.r.answeredOn < y.r.answeredOn) -
            (x.r.answeredOn > y.r.answeredOn) || x.i - y.i
      )
      .map((x) => x.r)
  })).filter((g) => g.rows.length > 0);
}

/** Whether a row matches what was typed in search: its title or who answered it. */
export function matches(row, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  return !q || [row.title, row.who].some((s) => s.toLowerCase().includes(q));
}
