/*
 * Bring in choices (electives slice E6): what the review's three cards show, worked out from the
 * reader's reading (c/shoreshChoicesReader) and the camp's setup, and the request that saves what
 * the director confirmed. Pure functions, no server calls. Decisions: docs/adr/0017 (§ E6).
 *
 * The desktop's choices-sheet import is the spec for flow and words (ParseSummary.jsx: names
 * Shoresh doesn't know are settled once each, the same-name refusal names the rows and what tells
 * them apart, everything not read is listed); the cards are Greg's approved mock-ups
 * (design-research/electives-r1, import-read and import-names; decisions 48 and 53).
 */
import { foldName } from "c/shoreshImportEngine";
import { CHOICE_KINDS, sheetLayout } from "c/shoreshChoicesReader";

const { RANKED, UNORDERED } = CHOICE_KINDS;

// Remembered answers about a choice name (ImportAnswers), keyed by the name, never an Id.
export const ANSWER_PREFIX = "choiceName|";

const ORDINALS = ["1st", "2nd", "3rd"];
const SPOKEN = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth"
];
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};

/** "1st", "2nd", "3rd", "4th" ... "11th", "12th", "21st". */
export function ordinal(n) {
  if (n >= 1 && n <= 3) return ORDINALS[n - 1];
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

function spokenRank(n) {
  return n >= 1 && n <= SPOKEN.length
    ? `${SPOKEN[n - 1]} choice`
    : `Choice ${n}`;
}

const shortDay = (day) => (day && SHORT_DAYS[day]) || day || "";

/** "Tue · Period 2", "Period 2", "Tuesday", or "" for a choice for the whole week. */
export function whenOf(choice) {
  return [shortDay(choice.day), choice.period].filter(Boolean).join(" · ");
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// ---------- card 1: how the sheet was read ----------

/** How the choices are laid out, as found: never asked (ADR 0017 §2). */
export function shapeOf(reading) {
  let perPeriod = false;
  let ranked = false;
  let unordered = false;
  for (const camper of reading.campers) {
    for (const c of camper.choices) {
      if (c.day || c.period) perPeriod = true;
      else if (c.kind === UNORDERED) unordered = true;
      else ranked = true;
    }
  }
  if (perPeriod && (ranked || unordered)) return "Both";
  if (perPeriod) return "One per period";
  if (ranked) return "One ranked list";
  if (unordered) return "One list, in no order";
  return "No choices";
}

/** A column's tag over the drawn sheet: what it was read as, in the camp's words. */
function tagOf(read, t) {
  if (!read) return { label: "Not read", kind: "not" };
  switch (read.use) {
    case "name":
      return { label: "Name", kind: "read" };
    case "firstName":
      return { label: "First name", kind: "read" };
    case "lastName":
      return { label: "Last name", kind: "read" };
    case "number":
      return { label: "Camper #", kind: "read" };
    case "division":
      return { label: t.s("Division"), kind: "read" };
    case "bunk":
      return { label: t.s("Group"), kind: "read" };
    case "comment":
      return { label: "Comment", kind: "comment" };
    case "choices":
      return { label: "Choices", kind: "read" };
    case "choiceValue":
      return { label: "Choice", kind: "read" };
    case "rankValue":
      return { label: "Rank", kind: "read" };
    case "dayValue":
      return { label: "Day", kind: "read" };
    case "periodValue":
      return { label: "Period", kind: "read" };
    default: {
      const when = whenOf(read);
      const rank =
        read.kind === RANKED && read.rank ? ordinal(read.rank) : null;
      const label = [when, rank].filter(Boolean).join(" ") || "Choice";
      return { label, kind: "read" };
    }
  }
}

/**
 * The first sheet with a table, drawn as the director's own sheet with Shoresh's reading laid over
 * its columns: { sheet, columns: [{ key, letter, label, kind, heading }], rows: [{ key, number,
 * cells: [{ key, text, notRead }], mine }] }, or null (a planner, one camper's own sheet). A column
 * not read shows its heading only: what it holds is never needed, so it is not drawn (ADR 0017 §3).
 * `mine` marks the row of the camper read back first.
 */
export function sheetPreview(file, reading, t, { maxRows = 10 } = {}) {
  for (const sheet of file.sheets || []) {
    const layout = sheetLayout(sheet);
    if (!layout) continue;
    const columns = layout.columns
      .filter((col) => col.heading || col.read)
      .map((col) => ({
        key: col.letter,
        index: col.index,
        letter: col.letter,
        heading: col.heading,
        ...tagOf(col.read, t)
      }));
    const first = readBacks(reading)[0];
    const mineRow =
      first && first.rows[0] && first.rows[0].sheet === sheet.name
        ? first.rows[0].row
        : null;
    const rows = [];
    for (
      let r = layout.headingRow + 1;
      r < sheet.rows.length && rows.length < maxRows;
      r++
    ) {
      const row = sheet.rows[r] || [];
      if (
        row.every(
          (v) => String(v === null || v === undefined ? "" : v).trim() === ""
        )
      )
        continue;
      rows.push({
        key: `r${r + 1}`,
        number: r + 1,
        mine: r + 1 === mineRow,
        cells: columns.map((col) => {
          const notRead = col.kind === "not";
          const value = row[col.index];
          return {
            key: col.key,
            notRead,
            text: notRead
              ? ""
              : String(
                  value === null || value === undefined ? "" : value
                ).trim()
          };
        })
      });
    }
    return {
      sheet: sheet.name,
      headingNumber: layout.headingRow + 1,
      columns,
      rows
    };
  }
  return null;
}

/** A camper's choices in reading order: ranks first, then a day or period's, then unordered. */
function ordered(choices) {
  const weight = (c) => (c.kind === UNORDERED ? 2 : c.day || c.period ? 1 : 0);
  return [...choices].sort(
    (a, b) => weight(a) - weight(b) || (a.rank || 0) - (b.rank || 0) || 0
  );
}

/**
 * One or two campers read back in words (the mock-up's "Maya Cohen  Aspen  ① Archery ② Drama"):
 * the first with a ranked or per-period choice, and the first with choices in no order, so an
 * unordered cell is seen never to become a rank. [{ key, name, place, rows, choices: [{ key,
 * mark, unordered, when, label, spoken }] }].
 */
export function readBacks(reading) {
  const campers = reading.campers || [];
  const ranked = campers.find((c) =>
    c.choices.some((x) => x.kind !== UNORDERED)
  );
  const unordered = campers.find(
    (c) => c !== ranked && c.choices.some((x) => x.kind === UNORDERED)
  );
  const picked = [ranked, unordered].filter(Boolean);
  if (picked.length === 0 && campers.length) picked.push(campers[0]);
  return picked.map((camper) => ({
    key: camper.key,
    name: camper.name || camper.number,
    place: camper.bunk || camper.division || "",
    rows: camper.rows,
    choices: ordered(camper.choices).map((c, i) => ({
      key: `${camper.key}-${i}`,
      mark: c.kind === UNORDERED ? "" : String(c.rank),
      unordered: c.kind === UNORDERED,
      when: whenOf(c),
      label: c.name,
      spoken:
        c.kind === UNORDERED
          ? "One of their choices:"
          : `${whenOf(c) ? `${whenOf(c)}, ` : ""}${spokenRank(c.rank)}:`
    }))
  }));
}

// ---------- card 2: what needs a person ----------

/** The camp's activities by folded name: { id, name }. */
export function activitiesByFold(activities) {
  const result = new Map();
  for (const a of activities || []) {
    const key = foldName(a.Name);
    if (key && !result.has(key)) result.set(key, { id: a.Id, name: a.Name });
  }
  return result;
}

const words = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * The activity a name most likely means, offered first ("Same as Pottery" for "Pottery Wheel"):
 * one whose words begin the name's, or whose name begins with the name's words. A proposal is
 * offered, never chosen for the director (desktop ParseSummary.jsx).
 */
export function proposalFor(name, activities) {
  const mine = words(name);
  let best = null;
  for (const a of activities || []) {
    const theirs = words(a.Name);
    if (!theirs.length || theirs.join(" ") === mine.join(" ")) continue;
    const [short, long] =
      theirs.length <= mine.length ? [theirs, mine] : [mine, theirs];
    if (short.every((w, i) => long[i] === w)) {
      if (!best || theirs.length > best.words) {
        best = { id: a.Id, name: a.Name, words: theirs.length };
      }
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/**
 * Answers the camp gave before for names on this sheet (ImportAnswers): "same|Pottery" or
 * "leave". Shown as already answered, marked Remembered, and still changeable: never applied
 * without being seen.
 */
export function rememberedAnswers(newNames, answers, activities) {
  const byFold = activitiesByFold(activities);
  const byKey = new Map((answers || []).map((a) => [a.key, a.answer || ""]));
  const result = {};
  for (const item of newNames || []) {
    const key = foldName(item.name);
    const answer = byKey.get(`${ANSWER_PREFIX}${key}`);
    if (!answer) continue;
    if (answer === "leave") {
      result[key] = { kind: "leave", remembered: true };
    } else if (answer.startsWith("same|")) {
      const activity = byFold.get(foldName(answer.slice(5)));
      if (activity) {
        result[key] = {
          kind: "same",
          activityId: activity.id,
          remembered: true
        };
      }
    }
  }
  return result;
}

/** The program's groups by folded name, for the sheet's bunks. */
export function groupsOfProgram(setup, programId) {
  const result = new Map();
  for (const entry of (setup && setup.programs) || []) {
    if (entry.program.Id !== programId) continue;
    for (const d of entry.divisions || []) {
      for (const g of d.groups || []) {
        const key = foldName(g.Name);
        if (key && !result.has(key)) result.set(key, g);
      }
    }
  }
  return result;
}

/** The group the sheet names for a camper, or why there is none ("none" or "unknown"). */
export function bunkOf(camper, groups) {
  if (!camper.bunk) return { groupId: null, problem: "none" };
  const group = groups.get(foldName(camper.bunk));
  return group
    ? { groupId: group.Id, problem: null }
    : { groupId: null, problem: "unknown" };
}

function rowsText(rows) {
  return rows.length === 1
    ? `Row ${rows[0].row}`
    : `Rows ${rows.map((r) => r.row).join(", ")}`;
}

/** "Willow and Oak" from what tells two rows apart: their bunks, else their divisions. */
function apartWords(rows) {
  const seen = [];
  for (const r of rows) {
    const place = r.bunk || r.division;
    if (place && !seen.includes(place)) seen.push(place);
  }
  if (seen.length === 0) return "";
  if (seen.length === 1) return `${seen[0]}.`;
  return `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}.`;
}

/** Campers Shoresh can't tell apart (the one refusal): [{ key, name, where, why }]. */
export function cantTellApartRows(reading) {
  return (reading.cantTellApart || []).map((item, i) => ({
    key: `apart-${i}`,
    name: item.name,
    where: rowsText(item.rows),
    why: ["No camper number.", apartWords(item.rows)].filter(Boolean).join(" ")
  }));
}

const NOT_READ_WORDS = {
  aboveTable: "Above the table",
  noName: "No name",
  noChoices: "No choices",
  notAChoice: "Not a choice",
  sheet: "No choices on this sheet",
  menu: "A list of what is offered",
  outsideTable: "Outside the table"
};

/**
 * Everything not read, by place (the reader's notRead), the campers whose bunk the sheet doesn't
 * give or Shoresh doesn't have, and comments whose camper is not brought in:
 * [{ key, name, where, why }]. Columns not read are named by their heading, never their contents.
 */
export function notReadRows(reading, groups, t) {
  const rows = [];
  (reading.notRead || []).forEach((item, i) => {
    const key = `not-${i}`;
    if (item.kind === "column") {
      rows.push({
        key,
        name: item.heading || `Column ${item.column}`,
        where: `Column ${item.column}`,
        why: "Not read"
      });
    } else if (item.kind === "sheet" || item.kind === "menu") {
      rows.push({
        key,
        name: item.sheet,
        where: "",
        why: NOT_READ_WORDS[item.kind]
      });
    } else if (item.kind === "notAChoice") {
      rows.push({
        key,
        name: `"${item.text}"`,
        where: `Row ${item.row}`,
        why: NOT_READ_WORDS.notAChoice
      });
    } else {
      rows.push({
        key,
        name: item.name || `Row ${item.row}`,
        where: item.name ? `Row ${item.row}` : "",
        why: NOT_READ_WORDS[item.kind] || "Not read"
      });
    }
  });
  (reading.campers || []).forEach((camper) => {
    const { problem } = bunkOf(camper, groups);
    if (!problem) return;
    rows.push({
      key: `bunk-${camper.key}`,
      name: camper.name || camper.number,
      where: rowsText(camper.rows.slice(0, 1)),
      why:
        problem === "none"
          ? `No ${t.sIn("Group")}`
          : `No ${t.sIn("Group")} "${camper.bunk}"`
    });
  });
  (reading.notKept || [])
    .filter((note) => !note.camper)
    .forEach((note, i) => {
      rows.push({
        key: `note-${i}`,
        name: note.name,
        where: `Row ${note.row}`,
        why: "Comment not kept: not brought in"
      });
    });
  return rows;
}

/** What was read but deserves a look (the reader's toCheck), in words: [{ key, name, where, why }]. */
export function toCheckRows(reading, t) {
  return (reading.toCheck || []).map((item, i) => {
    const key = `check-${i}`;
    const where = item.row ? `Row ${item.row}` : "";
    switch (item.kind) {
      case "listInOneCell":
        return {
          key,
          name: `"${item.text}"`,
          where,
          why: "Read as choices in no order"
        };
      case "sameRankTwice":
        return item.columns
          ? {
              key,
              name: `Columns ${item.columns.join(", ")}`,
              where: "",
              why: `All say ${ordinal(item.rank)}: read as choices in no order`
            }
          : {
              key,
              name: item.number ? `#${item.number}` : where,
              where,
              why: "Another choice for a rank already given: the first row's is kept"
            };
      case "rankNotRead":
        return {
          key,
          name: `"${item.text}"`,
          where,
          why: "Rank not read: read in no order"
        };
      case "numberOnSomeRows":
        return {
          key,
          name: item.name,
          where,
          why: "A camper number on some rows, not others: kept apart"
        };
      case "oneNumberTwoNames":
        return {
          key,
          name: item.name,
          where,
          why: `Camper number ${item.number} is someone else's: this row is left out`
        };
      case "differs":
        return {
          key,
          name: item.name,
          where,
          why:
            item.field === "bunk"
              ? `Another ${t.sIn("Group")} on this row: the first is kept`
              : `Another ${t.sIn("Division")} on this row: the first is kept`
        };
      case "nameFromSheet":
        return {
          key,
          name: item.sheet,
          where: "",
          why: "Name taken from the sheet's tab"
        };
      case "nameFromFile":
        return {
          key,
          name: item.sheet,
          where: "",
          why: "Name taken from the file's name"
        };
      default:
        return {
          key,
          name: where || item.sheet || "",
          where: "",
          why: "Check this"
        };
    }
  });
}

/** Each camper's comments, joined, by camper key (saved with the camper: decision 48.3). */
export function commentsOf(reading) {
  const result = new Map();
  for (const note of reading.notKept || []) {
    if (!note.camper) continue;
    const had = result.get(note.camper);
    result.set(note.camper, had ? `${had}\n${note.text}` : note.text);
  }
  return result;
}

/** Comments kept with their camper, to show: [{ key, name, text }]. */
export function keptCommentRows(reading) {
  return (reading.notKept || [])
    .filter((note) => note.camper)
    .map((note, i) => ({ key: `kept-${i}`, name: note.name, text: note.text }));
}

// ---------- the choices, settled ----------

/**
 * A camper's choices with every name settled: { n, a, add, r, k, d, p } with blank keys left out.
 * A name the camp has is that activity; Same as is the chosen one; Add carries the name to add;
 * Leave out drops that one choice (decision 53). Returns null for a name not answered yet.
 */
function settledChoice(c, known, answers) {
  const key = foldName(c.name);
  const base = { n: c.name };
  const activity = known.get(key);
  if (activity) {
    base.a = activity.id;
  } else {
    const answer = answers[key];
    if (!answer) return null;
    if (answer.kind === "leave") return undefined;
    if (answer.kind === "same") base.a = answer.activityId;
    else base.add = c.name;
  }
  if (c.rank !== null && c.rank !== undefined) base.r = c.rank;
  base.k = c.kind;
  if (c.day) base.d = c.day;
  if (c.period) base.p = c.period;
  return base;
}

/** Whether every name Shoresh doesn't know has an answer. */
export function allSettled(newNames, answers) {
  return (newNames || []).every((item) => answers[foldName(item.name)]);
}

/**
 * The request that brings the sheet in (ChoicesImport.Request), or null while a name is not
 * settled. Choices are in the order the sheet gives them.
 */
export function buildRequest({
  reading,
  activities,
  answers,
  groups,
  place,
  fileName,
  fingerprint,
  runRevision
}) {
  const known = activitiesByFold(activities);
  const byId = new Map((activities || []).map((a) => [a.Id, a.Name]));
  const comments = commentsOf(reading);
  const campers = [];
  for (const camper of reading.campers) {
    const choices = [];
    for (const c of camper.choices) {
      const settled = settledChoice(c, known, answers);
      if (settled === null) return null;
      if (settled) choices.push(settled);
    }
    campers.push({
      row: camper.rows[0] ? camper.rows[0].row : null,
      name: camper.name || camper.number,
      camperNumber: camper.number || null,
      comment: comments.get(camper.key) || null,
      groupId: bunkOf(camper, groups).groupId,
      choices
    });
  }
  const addActivities = [];
  const remember = {};
  for (const [key, answer] of Object.entries(answers)) {
    const item = (reading.newNames || []).find((n) => foldName(n.name) === key);
    if (!item) continue;
    if (answer.kind === "add") addActivities.push(item.name);
    if (answer.kind === "leave") remember[`${ANSWER_PREFIX}${key}`] = "leave";
    if (answer.kind === "same" && byId.has(answer.activityId)) {
      remember[`${ANSWER_PREFIX}${key}`] =
        `same|${byId.get(answer.activityId)}`;
    }
  }
  return {
    seasonId: place.seasonId,
    electiveSetId: place.setId,
    weekId: place.weekId,
    scheduleId: place.scheduleId,
    fileName,
    fingerprint: fingerprint || null,
    runRevision: runRevision === undefined ? null : runRevision,
    addActivities,
    remember,
    campers
  };
}

// ---------- card 3: the count ----------

/**
 * What card 3 says before Bring in, from the request and the server's check: [{ key, text, look }].
 * look marks a line that needs a look (the corner mark). Nothing is resolved silently: hand
 * changes kept, a name Shoresh keeps, campers not on the sheet, choices the set doesn't offer and
 * campers left with no choices are all said.
 */
export function countLines({ request, check, set, t, activities }) {
  const lines = [];
  const camperWords = (n) =>
    `${n} ${n === 1 ? t.sIn("Camper") : t.pIn("Camper")}`;
  lines.push({
    key: "count",
    text: `${camperWords(request.campers.length)}: ${check.added} new, ${check.known} already here`
  });
  if (check.runId) {
    lines.push({
      key: "run",
      text: `Brought into "${check.runName}" again`
    });
  }
  const nameAt = (i) => request.campers[i].name;
  if (check.handChanged.length) {
    lines.push({
      key: "hand",
      text: `${plural(check.handChanged.length, "camper's choices were", "campers' choices were")} changed by hand: kept`
    });
  }
  check.differs.forEach((i) => {
    lines.push({
      key: `differs-${i}`,
      text: `${nameAt(i)}: the sheet now says something else; the hand change is kept`,
      look: true
    });
  });
  check.renamed.forEach((r) => {
    lines.push({
      key: `renamed-${r.index}`,
      text: `Camper number ${request.campers[r.index].camperNumber} is "${r.savedName}" here; the sheet says "${nameAt(r.index)}". Kept "${r.savedName}".`,
      look: true
    });
  });
  if (check.notOnSheet) {
    lines.push({
      key: "notOnSheet",
      text: `${camperWords(check.notOnSheet)} in this run ${check.notOnSheet === 1 ? "isn't" : "aren't"} on this sheet: their choices stay`
    });
  }
  const offered = new Set((set && set.activityIds) || []);
  const notOffered = new Map();
  for (const camper of request.campers) {
    for (const c of camper.choices) {
      if (c.a && !offered.has(c.a)) {
        const had = notOffered.get(c.a) || { count: 0 };
        had.count += 1;
        notOffered.set(c.a, had);
      }
    }
  }
  const nameOf = new Map((activities || []).map((a) => [a.Id, a.Name]));
  for (const [id, item] of notOffered) {
    lines.push({
      key: `offered-${id}`,
      text: `${nameOf.get(id) || "An activity"} isn't offered in ${set ? set.name : "this set"}: ${plural(item.count, "choice", "choices")}`,
      look: true
    });
  }
  const empty = request.campers.filter((c) => c.choices.length === 0).length;
  if (empty) {
    lines.push({
      key: "empty",
      text: `${camperWords(empty)} with no choices left`,
      look: true
    });
  }
  if (request.addActivities.length) {
    lines.push({
      key: "added",
      text: `Added: ${request.addActivities.join(", ")} (to confirm in ${set ? set.name : "the set"})`
    });
  }
  return lines;
}
