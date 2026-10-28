/**
 * What each remembered question is, in camp words (repo ADR 0021). A remembered answer's key
 * starts with its family (ADR 0006 §19-21: "kind|Lunch", "deleted|Activity||Riflery"); each
 * family belongs to one of the desktop's groups (learnedView.js GROUPS) where they match, else to
 * one of Salesforce's own ("Things you deleted", "Rules Shoresh guessed") or to Other, so nothing
 * remembered is hidden. Choices are the answers the screen may change it to; LearnedChoices.cls
 * checks the same list on the server. A family answered with a name or a value has none: it can
 * only be forgotten, and the next import asks again.
 */
import { UNUSED, listScreen } from "c/shoreshLists";
import { keyParts } from "c/shoreshPatterns";

export const GROUPS = [
  { key: "classify", label: "Classification" },
  { key: "exclusion", label: "All camp except..." },
  { key: "value", label: "Values" },
  { key: "split", label: "Splits and merges" },
  { key: "pref_label", label: "Elective sheet labels" },
  { key: "pref_columns", label: "Elective sheet columns" },
  { key: "deleted", label: "Things you deleted" },
  { key: "guessed", label: "Rules Shoresh guessed" },
  { key: "other", label: "Other" }
];

// After Forget, what happens next time (desktop LearnedRow.jsx: "Shoresh will ask this question
// again.").
const ASKS_AGAIN = "Shoresh will ask this question again.";
const COMES_BACK = "It can come back next import.";
const NO_LONGER_GUESSED = "It's no longer marked for a look.";

const KEEP_OR_CHANGE = ["keep", "change"];
// Words for answers no family gives its own (a place ticked, a new one).
const PLAIN = {
  add: "Added",
  new: "Added as new",
  keep: "Kept as it is",
  leave: "Left out"
};
// Deleted kinds (ADR 0006 §20) and the camp word for each.
const DELETED_TERM = { ProgramGroup: "Group" };

const quoted = (name) => `“${name}”`;
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
function article(word) {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

function withProgram(name, program) {
  return program ? `${name} (${program})` : name;
}

/** The parts of a key (c/shoreshPatterns, shared with the pattern layer). */
export { keyParts };

function classification(p, t) {
  const words = {
    fixed: capital(article(t.sIn("FixedActivity"))),
    recurring: capital(article(t.sIn("RecurringActivity"))),
    activity: capital(article(t.sIn("Activity")))
  };
  return {
    group: "classify",
    name: withProgram(p[1], p[2]),
    words,
    choices: ["fixed", "recurring", "activity"]
  };
}

// "similar|<kind>|<fold>|<fold>|<name>|<name>". The import's pair puts the file's two names in
// localeCompare order (c/shoreshImportEngine names.js similarPairs): "a" keeps the first, "b"
// the second (mergesFrom). When one of them is a name the camp has, the import keeps the camp's
// spelling whichever "same" is chosen (it asks "b": use the camp's), so there is one "same".
function similar(p, answer, spell) {
  const [first, second] = [p[4] || p[2], p[5] || p[3]].sort((x, y) =>
    x.localeCompare(y)
  );
  const name = `${quoted(first)} and ${quoted(second)}`;
  const different = "Different: keep both";
  const isCamp = spell.isCamp || (() => false);
  const camp = [first, second].find(isCamp);
  if (camp) {
    const same = `Same: keep ${quoted(spell(camp))}`;
    return {
      group: "split",
      name,
      words: { a: same, b: same, different },
      choices: [answer === "a" ? "a" : "b", "different"]
    };
  }
  return {
    group: "split",
    name,
    words: {
      a: `Same: keep ${quoted(first)}`,
      b: `Same: keep ${quoted(second)}`,
      different
    },
    choices: ["a", "b", "different"]
  };
}

function oneOrSeveral(p, t) {
  return {
    group: "split",
    name: p[1],
    words: {
      one: `Kept as one ${t.sIn("Activity")}`,
      several: "Split into choices"
    },
    choices: ["one", "several"]
  };
}

// Import last year's "change|fixed|<timetable>|<name>|..." and Import a list's
// "change|<screen>|<name>|<column>|<to>": kept as it is, or the file's value.
function changeName(p, spell) {
  if (p[1] === "fixed" || p[1] === "recurring") {
    return p[3];
  }
  if (p[1] === "block") {
    return `${p[2]}, ${p[3]}`;
  }
  if (p[1] === "runsIn") {
    return runsInName(p, spell);
  }
  return p[2];
}

// "change|runsIn|<item Id, or a new item's key>|<week Ids>": the item and the weeks by name.
function runsInName(p, spell) {
  const nameOf = spell.nameOf || (() => null);
  const item =
    nameOf(p[2]) || (p[2].includes(":") ? p[2].split(":").pop() : "");
  const weeks = p[3]
    .split(",")
    .map((id) => nameOf(id))
    .filter(Boolean);
  const off = weeks.length
    ? `, off in ${weeks.join(", ")}`
    : ", weeks it runs in";
  return `${item || "An item"}${off}`;
}

function change(p, spell) {
  return {
    group: "value",
    name: changeName(p, spell),
    words: { keep: "Kept the current value", change: "Used the file’s value" },
    choices: p[1] === "block" ? [] : KEEP_OR_CHANGE
  };
}

function valueOf(name, words) {
  return { group: "value", name, words, choices: Object.keys(words) };
}

function choiceName(p, answer) {
  const words = { leave: "Left out" };
  if (answer.startsWith("same|")) {
    words[answer] = `Read as ${answer.slice(5)}`;
  }
  return { group: "pref_label", name: p[1], words, choices: [] };
}

function columns(p, answer, t) {
  let heading = answer === UNUSED ? "Not used" : answer;
  try {
    const column = listScreen(p[1], t).columns.find((c) => c.key === answer);
    heading = column ? column.heading : heading;
  } catch {
    // A screen this version doesn't know: the answer as saved.
  }
  return {
    group: p[1] === "electives" ? "pref_columns" : "other",
    name: p[2],
    words: { [answer]: heading },
    choices: []
  };
}

function deleted(p, t) {
  const term = DELETED_TERM[p[1]] || p[1];
  return {
    group: "deleted",
    name: withProgram(p[3], p[2]),
    words: { deleted: `${t.s(term)} deleted` },
    choices: [],
    forgotten: COMES_BACK
  };
}

// "guessed|<season>|<kind>|<program>|<name>|<field>" answered with the value saved.
function guessedWords(field, answer, t) {
  if (field === "often") {
    const [low, high] = answer.split("-");
    const times = high === "none" ? `${low} or more` : `${low}–${high}`;
    return `${t.s("TimesPerWeek")}: ${times}`;
  }
  if (field === "who") {
    return `Who: ${/^[0-9a-f]{64}$/.test(answer) ? "a long list" : answer}`;
  }
  if (field === "fits") {
    return `${t.s("GroupsThatFit")}: ${answer}`;
  }
  return field === "division" ? `${t.s("Division")}: ${answer}` : answer;
}

function guessed(p, answer, t) {
  return {
    group: "guessed",
    name: withProgram(p[4], p[3]),
    words: { [answer]: guessedWords(p[5], answer, t) },
    choices: [],
    forgotten: NO_LONGER_GUESSED
  };
}

function whoAdd(p, answer, t) {
  const [kind, program, division] = answer.split("|");
  const text =
    kind === "group"
      ? `${capital(article(t.sIn("Group")))} in ${division}`
      : `${capital(article(t.sIn("Division")))} in ${program}`;
  return {
    group: "other",
    name: p[p.length - 1],
    words: { [answer]: text },
    choices: []
  };
}

function named(name, words = {}) {
  return { group: "other", name, words, choices: [] };
}

const FAMILIES = {
  kind: (p, a, t) => classification(p, t),
  similar: (p, a, t, spell) => similar(p, a, spell),
  list: (p, a, t) => oneOrSeveral(p, t),
  change: (p, a, t, spell) => change(p, spell),
  ampm: (p) =>
    valueOf(p[2], { morning: "In the morning", evening: "In the evening" }),
  tueThu: (p) => valueOf(p[2], { Tuesday: "Tuesday", Thursday: "Thursday" }),
  dash: (p) =>
    valueOf(`${p[2]} (${p[3]})`, {
      range: "Every day between",
      list: "Just those two days"
    }),
  programDay: (p) =>
    valueOf(`${p[1]} on ${p[2]}`, {
      add: `Added ${p[2]}`,
      drop: `Without ${p[2]}`
    }),
  cross: (p) => ({ ...named(p.slice(1).join(", ")), group: "value" }),
  choiceName: (p, a) => choiceName(p, a),
  columns: (p, a, t) => columns(p, a, t),
  deleted: (p, a, t) => deleted(p, t),
  guessed: (p, a, t) => guessed(p, a, t),
  whoAdd: (p, a, t) => whoAdd(p, a, t),
  program: (p, a, t) =>
    named(p[1].split(",").join(", "), { new: `A new ${t.sIn("Program")}` }),
  division: (p) => named(p[1]),
  whichGroup: (p) => named(`${p[1]} in ${p[2]}`),
  move: (p) =>
    named(p[1], {
      move: `Moved to ${p[3]}`,
      keep: `Kept in ${p[2]}`,
      new: `A new one in ${p[3]}`
    }),
  week: (p) => named(p[1])
};

/**
 * One remembered answer in camp words: { group, name, answer (its words), choices: [{ value,
 * label }], forgotten (what Forget means) }. answer: the saved answer. spell: a key part as the
 * camp writes that name now (keys keep some names lower-cased), else as stored.
 */
export function describe(key, answer, t, spell = (name) => name) {
  const text = String(answer ?? "");
  const [family0, ...rest] = keyParts(String(key ?? ""));
  // The two names of a similar pair are the question itself: shown as the file wrote them.
  // Runs-in names its item and weeks by Id (runsInName).
  const raw = family0 === "similar" || rest[0] === "runsIn";
  const p = [family0, ...(raw ? rest : rest.map(spell))];
  const family = FAMILIES[p[0]];
  const kind = family
    ? family(p, text, t, spell)
    : named(p.slice(1).join(", "));
  const words = { ...PLAIN, ...kind.words };
  return {
    group: kind.group,
    name: kind.name || p.join(", "),
    answer: words[text] ?? text,
    choices: kind.choices.map((value) => ({
      value,
      label: words[value] ?? value
    })),
    forgotten: kind.forgotten || ASKS_AGAIN
  };
}
