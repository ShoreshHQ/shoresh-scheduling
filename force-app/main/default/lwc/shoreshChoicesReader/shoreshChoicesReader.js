/**
 * Electives, bringing in choices (slice E3a): reading a camp's own choices sheet into campers
 * with their choices, and saying what could not be read. Pure JavaScript, no server calls and no
 * saving: the screen (slice E6) reads the file with c/shoreshImportEngine's csvFile or
 * workbookFile, calls readChoices, shows the reading, and saves only what the director confirms.
 * Decisions: docs/adr/0017-reading-a-choices-sheet.md.
 *
 * Adapted from Shoresh desktop (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * Apache-2.0): src/ingest/preferenceSheet.js (parsePreferenceSheet: one reading for every
 * shape, rank kinds, ties kept unordered, packed cells, footer rows, campers who share a name,
 * a name with and without a camper number, comments that are not choices, a
 * planner that is one camper's own sheet, a menu told apart by how many options a period holds)
 * and its ADR 2026-09-27-elective-preference-etl (§4.1-4.4, §14.1, §14.1a). See the NOTICE file.
 *
 * The rules (desktop §14.1 and §14.1a): never refuse a readable sheet; read what is there and
 * say what was not read; never guess. The one thing it will not decide is which of two campers
 * with one name and no camper number is which: those rows are set aside (cantTellApart).
 */
import { dayOf, foldName, tidy } from "c/shoreshImportEngine";
import {
  CHOICE_KINDS,
  cellAt,
  choicesInCell,
  columnLetter,
  isBlankRow
} from "./cells";
import { findTable, periodLabel, rankOf } from "./headings";
import { readPlanner } from "./planner";

export { headingMeaning } from "./headings";
export { CHOICE_KINDS, columnLetter } from "./cells";

const { RANKED, CELL, UNORDERED } = CHOICE_KINDS;

/** Which columns hold what: the first column of each field wins; the rest are "not used". */
function plan(columns) {
  const fields = {};
  const choiceColumns = [];
  const notes = [];
  const unused = [];
  for (const col of columns) {
    const m = col.meaning;
    if (!col.heading) continue;
    if (!m) {
      unused.push(col);
    } else if (m.use === "choice") {
      choiceColumns.push(col);
    } else if (m.use === "comment") {
      notes.push(col);
    } else if (fields[m.use] === undefined) {
      fields[m.use] = col.index;
    } else {
      unused.push(col);
    }
  }
  // Two columns claiming one rank of one day and period are a tie, never an order (desktop
  // §4.1): both are read as unordered choices.
  const bySlot = new Map();
  for (const col of choiceColumns) {
    const { rank, day, period } = col.meaning;
    const slot = `${day}|${period}|${rank}`;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(col);
  }
  const tied = [...bySlot.values()].filter((cols) => cols.length > 1);
  const tiedIndexes = new Set(tied.flat().map((c) => c.index));
  const choiceRules = choiceColumns.map((col) => {
    const { rank, day, period } = col.meaning;
    if (tiedIndexes.has(col.index)) {
      return { col, rule: { rank: null, kind: UNORDERED, day, period } };
    }
    return {
      col,
      rule:
        rank === null
          ? { rank: 1, kind: CELL, day, period }
          : { rank, kind: RANKED, day, period }
    };
  });
  return { fields, choiceRules, notes, unused, tied };
}

/** Read one sheet that has a table of campers. Returns rows read and findings. */
function readTable(sheet, table, out) {
  const { fields, choiceRules, notes, unused, tied } = plan(table.columns);
  const at = (row) => ({ sheet: sheet.name, row: row + 1 });

  for (let r = 0; r < table.firstRow; r++) {
    if (!isBlankRow(sheet.rows[r]))
      out.notRead.push({ kind: "aboveTable", ...at(r) });
  }
  for (const col of unused) {
    // The heading only: what an unused column holds is never copied (it may be an email
    // address, a date of birth, a parent's name).
    out.notRead.push({
      kind: "column",
      sheet: sheet.name,
      column: columnLetter(col.index),
      heading: col.heading
    });
  }
  for (const cols of tied) {
    out.toCheck.push({
      kind: "sameRankTwice",
      sheet: sheet.name,
      column: columnLetter(cols[0].index),
      columns: cols.map((c) => columnLetter(c.index)),
      rank: cols[0].meaning.rank
    });
  }

  for (let r = table.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (isBlankRow(row)) continue;
    const name =
      fields.name !== undefined
        ? cellAt(row, fields.name)
        : [cellAt(row, fields.firstName), cellAt(row, fields.lastName)]
            .filter(Boolean)
            .join(" ");
    const number =
      fields.number !== undefined ? cellAt(row, fields.number) : "";
    if (!name && !number) {
      out.notRead.push({ kind: "noName", ...at(r) });
      continue;
    }
    const choices = [];
    const report = (column) => (list, item) =>
      out[list].push({ ...item, ...at(r), column: columnLetter(column) });

    for (const { col, rule } of choiceRules) {
      for (const c of choicesInCell(
        cellAt(row, col.index),
        rule,
        report(col.index),
        out.known
      )) {
        choices.push({
          ...c,
          sheet: sheet.name,
          row: r + 1,
          column: columnLetter(col.index)
        });
      }
    }
    if (fields.choices !== undefined) {
      const rule = { rank: null, kind: UNORDERED, day: null, period: null };
      for (const c of choicesInCell(
        cellAt(row, fields.choices),
        rule,
        report(fields.choices),
        out.known
      )) {
        choices.push({
          ...c,
          sheet: sheet.name,
          row: r + 1,
          column: columnLetter(fields.choices)
        });
      }
    }
    if (fields.choiceValue !== undefined) {
      choices.push(...valueChoices(sheet, row, r, fields, report, out.known));
    }

    const notesHere = [];
    for (const col of notes) {
      const text = cellAt(row, col.index);
      if (!text) continue;
      notesHere.push({
        kind: col.meaning.use,
        heading: col.heading,
        text,
        ...at(r),
        column: columnLetter(col.index)
      });
    }

    const read = {
      ...at(r),
      name,
      number: number || null,
      division:
        fields.division !== undefined
          ? cellAt(row, fields.division) || null
          : null,
      bunk: fields.bunk !== undefined ? cellAt(row, fields.bunk) || null : null,
      choices,
      notes: notesHere,
      // A sheet with one row per camper (no Activity column): a name on two of its rows is two
      // submissions or two campers, never one camper's rows.
      oneRowEach: fields.choiceValue === undefined
    };
    if (choices.length === 0) {
      out.notRead.push({ kind: "noChoices", ...at(r), name: name || number });
    }
    out.rows.push(read);
  }
}

/** One row per choice: the choice, and its rank, day and period when the sheet has them. */
function valueChoices(sheet, row, r, fields, report, known) {
  const day =
    fields.dayValue !== undefined ? cellAt(row, fields.dayValue) || null : null;
  const periodText =
    fields.periodValue !== undefined ? cellAt(row, fields.periodValue) : "";
  const period = periodText ? periodLabel(periodText) : null;
  const dayName = day ? dayOfValue(day) : null;
  let rule;
  if (fields.rankValue !== undefined) {
    const rankText = cellAt(row, fields.rankValue);
    const rank = rankText ? rankOf(rankText) : null;
    if (rankText && rank === null) {
      report(fields.rankValue)("toCheck", {
        kind: "rankNotRead",
        text: rankText
      });
    }
    rule =
      rank === null
        ? { rank: null, kind: UNORDERED, day: dayName, period }
        : { rank, kind: RANKED, day: dayName, period };
  } else if (dayName || period) {
    rule = { rank: 1, kind: CELL, day: dayName, period };
  } else {
    rule = { rank: null, kind: UNORDERED, day: null, period: null };
  }
  return choicesInCell(
    cellAt(row, fields.choiceValue),
    rule,
    report(fields.choiceValue),
    known
  ).map((c) => ({
    ...c,
    sheet: sheet.name,
    row: r + 1,
    column: columnLetter(fields.choiceValue)
  }));
}

/** The day a value names, in full ("Tue" is Tuesday), else the value as written. */
function dayOfValue(text) {
  return dayOf(tidy(text).split(" ")[0]) || tidy(text);
}

// ---------- campers: one per camper number, else one per name ----------

function slotOf(c) {
  return c.kind === UNORDERED
    ? `${c.day}|${c.period}|u|${foldName(c.name)}`
    : `${c.day}|${c.period}|${c.rank}`;
}

/**
 * Whether two rows fill one slot: two campers, or a contradiction. A ranked slot clashes when
 * the rows name different activities for it; an unranked slot is the activity itself, so two
 * rows naming it clash (desktop preferenceSheet.js, sameNameCampers). With a camper number the
 * rows are one child, so only a ranked contradiction counts (byName false).
 */
function clash(rowsOfOne, byName) {
  const seen = new Map();
  for (const row of rowsOfOne) {
    for (const c of row.choices) {
      if (c.kind === UNORDERED && !byName) continue;
      const slot = slotOf(c);
      const before = seen.get(slot);
      if (
        before &&
        before.row !== row &&
        (c.kind === UNORDERED || foldName(before.name) !== foldName(c.name))
      ) {
        return row;
      }
      if (!before) seen.set(slot, { row, name: c.name });
    }
  }
  return null;
}

const sameChoice = (a, b) =>
  foldName(a.name) === foldName(b.name) &&
  a.rank === b.rank &&
  a.kind === b.kind &&
  a.day === b.day &&
  a.period === b.period;

function camperFrom(key, rowsOfOne, out) {
  const first = rowsOfOne[0];
  const camper = {
    key,
    name: first.name,
    number: first.number,
    division: null,
    bunk: null,
    choices: [],
    rows: rowsOfOne.map((r) => ({ sheet: r.sheet, row: r.row }))
  };
  for (const row of rowsOfOne) {
    for (const field of ["division", "bunk"]) {
      if (!row[field]) continue;
      if (!camper[field]) camper[field] = row[field];
      else if (foldName(camper[field]) !== foldName(row[field])) {
        out.toCheck.push({
          kind: "differs",
          field,
          sheet: row.sheet,
          row: row.row,
          name: camper.name
        });
      }
    }
    for (const c of row.choices) {
      if (camper.choices.some((had) => sameChoice(had, c))) continue;
      // A later row naming something else for a rank the camper already has contradicts it:
      // the first is kept and the clash is marked to check (campersFrom), so a saved camper
      // never holds two first choices for one period.
      if (
        c.kind !== UNORDERED &&
        camper.choices.some(
          (had) => had.kind !== UNORDERED && slotOf(had) === slotOf(c)
        )
      )
        continue;
      camper.choices.push(c);
    }
    for (const note of row.notes)
      out.notKept.push({ camper: key, name: camper.name, ...note });
  }
  return camper;
}

function campersFrom(rows, out) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.number
      ? `number:${row.number}`
      : `name:${foldName(row.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const numberedNames = new Set(
    rows.filter((r) => r.number && r.name).map((r) => foldName(r.name))
  );
  const campers = [];
  for (const [key, rowsOfOne] of groups) {
    if (key.startsWith("number:")) {
      // One number with two names: the first name's rows are the camper; a row with another
      // name is marked to check and none of its choices join the camper (ADR 0017 §5). Its
      // comments are still shown, with no camper.
      const firstName = rowsOfOne.find((r) => r.name);
      const isOther = (r) =>
        r.name && foldName(r.name) !== foldName(firstName.name);
      for (const other of rowsOfOne.filter(isOther)) {
        out.toCheck.push({
          kind: "oneNumberTwoNames",
          sheet: other.sheet,
          row: other.row,
          number: other.number,
          name: other.name
        });
        for (const note of other.notes)
          out.notKept.push({ camper: null, name: other.name, ...note });
      }
      const kept = rowsOfOne.filter((r) => !isOther(r));
      const contradiction = clash(kept, false);
      if (contradiction) {
        out.toCheck.push({
          kind: "sameRankTwice",
          sheet: contradiction.sheet,
          row: contradiction.row,
          number: contradiction.number
        });
      }
      campers.push(camperFrom(key, kept, out));
      continue;
    }
    const repeated = rowsOfOne.filter((r) => r.oneRowEach).length > 1;
    if (repeated || clash(rowsOfOne, true)) {
      // Two campers with one name and nothing to tell them apart: the one thing the reader
      // will not decide (desktop §4.4, §13.1). Rows of one name collide when they give
      // different choices for one rank, or when the sheet has one row per camper, where a
      // name on two rows is two children or a form sent twice, even with the same choices.
      // Neither becomes a camper until the director says.
      out.cantTellApart.push({
        name: rowsOfOne[0].name,
        rows: rowsOfOne.map((r) => ({
          sheet: r.sheet,
          row: r.row,
          division: r.division,
          bunk: r.bunk
        }))
      });
      for (const row of rowsOfOne) {
        for (const note of row.notes)
          out.notKept.push({ camper: null, name: row.name, ...note });
      }
      continue;
    }
    if (numberedNames.has(foldName(rowsOfOne[0].name))) {
      // One name with a camper number on some rows and none on others: kept apart, never
      // merged (desktop §4.4, the partial-id fork), and shown.
      out.toCheck.push({
        kind: "numberOnSomeRows",
        sheet: rowsOfOne[0].sheet,
        row: rowsOfOne[0].row,
        name: rowsOfOne[0].name
      });
    }
    campers.push(camperFrom(key, rowsOfOne, out));
  }
  return campers.filter((c) => c.choices.length > 0);
}

// ---------- names the camp has no activity for ----------

function newNames(campers, activities) {
  if (!activities) return [];
  const known = new Set(
    activities.map((a) => foldName(typeof a === "string" ? a : a && a.name))
  );
  const found = new Map();
  for (const camper of campers) {
    for (const c of camper.choices) {
      const key = foldName(c.name);
      if (known.has(key)) continue;
      if (!found.has(key)) found.set(key, { name: c.name, campers: new Set() });
      found.get(key).campers.add(camper.key);
    }
  }
  return [...found.values()].map((f) => ({
    name: f.name,
    campers: f.campers.size
  }));
}

/**
 * Read a choices file: { name, sheets: [{ name, rows, merges }] } (c/shoreshImportEngine's
 * csvFile or workbookFile). `activities` (names, or records with a name) are the camp's own; when
 * given, a cell naming one of them is read as that activity before any splitting ("Arts, Crafts"
 * stays one), and choices that name none of them are listed in newNames.
 *
 * Returns:
 * - campers: [{ key, name, number, division, bunk, rows, choices: [{ name, rank, kind, day,
 *   period, sheet, row, column }] }], in the order the file first names them. A camper is one
 *   camper number, or with none, one name. Division and bunk are as the sheet writes them.
 * - notKept: parents' comments ({ camper, name, kind: "comment", heading, text,
 *   sheet, row, column }). Shown to the director; saving them with the camper comes
 *   later (Greg, 2026-10-21, plan question 3). They are kept apart from the campers so a save of the campers cannot carry them.
 * - cantTellApart: campers sharing a name with no camper number ({ name, rows }); not in campers.
 *   On a sheet with one row per camper, any name on two rows without a number is here.
 * - notRead: what was not read ({ kind, sheet, row?, column?, ... }): aboveTable, column (a
 *   heading the reader does not use; its contents are never copied), noName, noChoices,
 *   notAChoice, sheet (no choices on it), menu (a list of what is offered), outsideTable.
 * - toCheck: what was read but deserves a look: listInOneCell, sameRankTwice, rankNotRead,
 *   numberOnSomeRows, oneNumberTwoNames, differs, nameFromSheet, nameFromFile.
 * - newNames: [{ name, campers }], choices naming no activity the camp has.
 */
export function readChoices(file, { activities } = {}) {
  const out = {
    rows: [],
    known: activities
      ? new Set(
          activities.map((a) =>
            foldName(typeof a === "string" ? a : a && a.name)
          )
        )
      : null,
    notKept: [],
    cantTellApart: [],
    notRead: [],
    toCheck: []
  };
  for (const sheet of file.sheets || []) {
    const rows = sheet.rows || [];
    if (rows.every(isBlankRow)) continue;
    const table = findTable({ ...sheet, rows });
    if (table) {
      readTable({ ...sheet, rows }, table, out);
    } else if (!readPlanner(file, { ...sheet, rows }, out)) {
      out.notRead.push({ kind: "sheet", sheet: sheet.name });
    }
  }
  const campers = campersFrom(out.rows, out);
  return {
    campers,
    notKept: out.notKept,
    cantTellApart: out.cantTellApart,
    notRead: out.notRead,
    toCheck: out.toCheck,
    newNames: newNames(campers, activities)
  };
}
