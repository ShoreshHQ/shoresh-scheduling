/*
 * One setup list read from a file and set against what the season has (slice 4c, Greg's
 * decisions of 2026-10-17):
 * - an unreadable row is listed with its reason and left out;
 * - a row naming an item already set up is compared on the columns the file has, never on the
 *   ones it doesn't, and every difference is shown for Keep or Change;
 * - a location or location type the season doesn't have yet "will also be added";
 * - similar names (Music / Musik) are always asked, as in Import last year;
 * - the same file and answers always give the same result.
 * Pure JavaScript: the screen calls listProposal again on every answer.
 */
import { LEAVE_OUT, looseKey, similarPairs, tidy } from "c/shoreshImportEngine";
import { NONE, readCell } from "./cells";
import {
  headingRowIndex,
  mapHeadings,
  pickSheet,
  sheetChoices
} from "./headings";
import { cellText, listScreen } from "./screens";
import { resolveWho, whoTargets } from "./who";
import { unknownRainPlans, unknownWho } from "./adds";
import { resolveColumn } from "./refs";

/** Keep or Change, for one difference. */
export const KEEP = "keep";
export const CHANGE = "change";

// What each kind of name is called in similar-name questions: the same keys as Import last
// year, so an answer given there ("Music" and "Musik" are the same) is not asked again here.
const PAIR_KIND = {
  Activity: "activity",
  activity: "activity",
  Location: "location",
  location: "location",
  locationType: "locationType"
};

/** A difference's answer key: the item, the column, and the new value (a new value asks again). */
export function changeKey(screenKey, name, columnKey, to) {
  return `change|${screenKey}|${looseKey(name)}|${columnKey}|${JSON.stringify(to ?? null)}`;
}

function blankValue(column) {
  if (column.type === "list") {
    return [];
  }
  return column.type === "yesNo" ? false : null;
}

/** The columns of the screen the file gives, in the screen's order. */
function usedColumns(screen, mapping) {
  const byColumn = new Map(
    mapping.headings.filter((h) => h.column).map((h) => [h.column, h.index])
  );
  return screen.columns
    .filter((c) => byColumn.has(c.key))
    .map((c) => ({ column: c, index: byColumn.get(c.key) }));
}

/** Each row with something in it: its cells read, and why it can't be read, if so. */
function readRows(rows, start, used) {
  const result = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.some((cell) => tidy(cell))) {
      continue;
    }
    const values = {};
    const blanks = new Set();
    const problems = [];
    used.forEach(({ column, index }) => {
      const read = readCell(column, row[index]);
      if (read.problem) {
        problems.push(`${column.heading}: ${read.problem}`);
      } else if (read.blank && column.requiredValue) {
        // It can't be cleared, and a blank is never quietly skipped.
        problems.push(`${column.heading} is blank`);
      } else if (read.blank) {
        blanks.add(column.key);
      } else {
        values[column.key] = read.value;
      }
    });
    if (!values.name && !problems.length) {
      problems.push("No name");
    }
    if (
      values.rainPlan &&
      looseKey(values.rainPlan) === looseKey(values.name)
    ) {
      problems.push(
        `${used.find((u) => u.column.key === "rainPlan").column.heading}: can't be itself`
      );
    }
    if (
      typeof values.min === "number" &&
      typeof values.max === "number" &&
      values.max < values.min
    ) {
      problems.push(`At most ${values.max} is below at least ${values.min}`);
    }
    result.push({
      rowNumber: i + 1,
      name: values.name || "",
      values,
      blanks,
      problems
    });
  }
  return result;
}

function usable(row) {
  return !row.problems.length && !row.leftOut;
}

function matchNames(leads, records, kind, answers) {
  const readable = leads.filter(usable);
  const campNames = records.map((r) => r.Name);
  const pairs = similarPairs(
    PAIR_KIND[kind],
    readable.map((r) => ({ name: r.name, count: 1 })),
    campNames
  );
  const byName = new Map();
  records.forEach((r) =>
    byName.set(r.Name, [...(byName.get(r.Name) || []), r])
  );
  const rowOf = new Map(readable.map((r) => [r.name, r]));
  readable.forEach((r) => {
    r.found = byName.get(r.name) || [];
  });
  pairs.forEach((pair) => {
    const answer = answers[pair.id];
    const a = rowOf.get(pair.a);
    const b = pair.existing ? null : rowOf.get(pair.b);
    const sameThing = answer === "a" || answer === "b";
    if (answer === LEAVE_OUT) {
      a.leftOut = true;
      if (b) {
        b.leftOut = true;
      }
    } else if (pair.existing && sameThing) {
      // Either spelling chosen (Import last year asks with both): the camp's item is used.
      a.found = byName.get(pair.existing) || [];
    } else if (answer !== "different" && !sameThing) {
      // Not answered (or an answer this question doesn't offer).
      a.open = true;
      if (b) {
        b.open = true;
      }
    } else if (!pair.existing && sameThing) {
      // The same thing written twice: the row with the spelling kept is used.
      const [kept, dropped] = answer === "a" ? [a, b] : [b, a];
      dropped.leftOut = true;
      dropped.sameAs = kept.name;
    }
  });
  readable.forEach((r) => {
    r.existing = r.found.length === 1 ? r.found[0] : null;
  });
  return pairs;
}

export function whichKey(screenKey, name) {
  return `which|${screenKey}|${looseKey(name)}`;
}

/**
 * Two items set up with the name a row gives: never picked by order. The director says which
 * one the row means (or that it is a new one, or to leave it out).
 */
function whichOne(read, screen, setup, answers) {
  const cards = [];
  const asked = new Map();
  read
    .filter((r) => usable(r) && !r.open && r.found && r.found.length > 1)
    .forEach((r) => {
      const name = r.found[0].Name;
      const id = whichKey(screen.key, name);
      const answer = answers[id];
      if (!asked.has(id)) {
        asked.set(id, true);
        cards.push({
          id,
          title: `Which “${name}”?`,
          options: [
            ...r.found.map((rec) => ({
              value: rec.Id,
              label: describe(screen, rec, setup)
            })),
            { value: "new", label: `A new “${name}”` },
            { value: LEAVE_OUT, label: "Leave it out for now" }
          ],
          answer: answer || null,
          noMemory: true
        });
      }
      const chosen = r.found.find((rec) => rec.Id === answer);
      if (chosen) {
        r.existing = chosen;
      } else if (answer === LEAVE_OUT) {
        r.leftOut = true;
      } else if (answer !== "new") {
        r.open = true;
      }
    });
  return cards;
}

/** A few of a record's values, to tell two of the same name apart. */
function describe(screen, record, setup) {
  return screen.columns
    .filter((c) => c.key !== "name" && c.fromRecord)
    .slice(0, 3)
    .map(
      (c) =>
        `${c.heading}: ${cellText(c, c.fromRecord(record, setup), null) || "none"}`
    )
    .join(", ");
}

function checkNewLimits(read, screen) {
  const min = screen.columns.find((c) => c.key === "min");
  if (!min) {
    return;
  }
  read
    .filter((r) => !r.existing && !r.problems.length && !r.open)
    .forEach((r) => {
      const atLeast =
        typeof r.values.min === "number" ? r.values.min : min.newValue;
      if (typeof r.values.max === "number" && r.values.max < atLeast) {
        r.problems.push(`At most ${r.values.max} is below at least ${atLeast}`);
      }
    });
}

/**
 * The first row of each name (capitals and spacing aside) leads, even if it can't be read; the
 * rows after it with that name repeat it and follow it, never saved on their own.
 */
function settleLeads(read) {
  const first = new Map();
  read
    .filter((r) => r.name)
    .forEach((r) => {
      const key = looseKey(r.name);
      if (first.has(key)) {
        r.repeatOf = first.get(key);
      } else {
        first.set(key, r);
      }
    });
  return read.filter((r) => r.name && !r.repeatOf);
}

/**
 * Last, every repeat takes its lead's outcome: waiting with it, left out with it, or not saved
 * ("Same as row 2"); and two rows standing for one item set up keep only the first.
 */
function finishRepeats(read) {
  read
    .filter((r) => r.repeatOf && !r.problems.length)
    .forEach((r) => {
      const lead = r.repeatOf;
      if (lead.problems.length) {
        r.problems.push(`Same as row ${lead.rowNumber}, which can't be read`);
      } else if (lead.leftOut) {
        r.leftOut = true;
        r.sameAs = lead.sameAs || lead.name;
      } else if (lead.open) {
        r.open = true;
      } else {
        r.problems.push(`Same as row ${lead.rowNumber}`);
      }
    });
  const taken = new Map();
  read
    .filter((r) => !r.repeatOf && usable(r) && !r.open && r.existing)
    .forEach((r) => {
      if (taken.has(r.existing.Id)) {
        r.problems.push(`Same as row ${taken.get(r.existing.Id)}`);
      } else {
        taken.set(r.existing.Id, r.rowNumber);
      }
    });
}

/**
 * Rain plans: resolved after everything else about the rows is settled (so a plan never names
 * a row that won't be saved), and again until nothing changes (a row waiting on a question
 * makes the rows naming it wait too). A plan naming nothing is added as by hand; untick it
 * (answer "skip") and the rows naming it are saved without it (Greg, 2026-10-17).
 */
function resolveRainPlans(read, leads, column, setup, answers) {
  let pairs = [];
  for (let pass = 0; pass <= leads.length; pass++) {
    const before = leads.filter((r) => r.open || !usable(r)).length;
    pairs = resolveColumn(
      leads,
      column,
      setup.activities || [],
      leads,
      answers,
      "activity"
    );
    if (leads.filter((r) => r.open || !usable(r)).length === before) {
      break;
    }
  }
  const added = new Set();
  leads.filter(usable).forEach((r) => {
    const target = (r.targets || {})[column.key];
    if (target && target.add) {
      added.add(target.add);
    }
  });
  const adds = unknownRainPlans(added, answers);
  leads.filter(usable).forEach((r) => {
    const target = (r.targets || {})[column.key];
    if (target && target.add && adds.skipped.has(target.add)) {
      // Saved without it: as if the file said nothing about its rain plan.
      delete r.values[column.key];
      r.droppedPlan = target.add;
    }
  });
  return { pairs, adds: adds.adds };
}

/**
 * Reads one list for one screen. input: { screenKey, file, sheet (chosen, optional), setup,
 * terms, answers }. Returns the sheet used, the headings and their columns, every row with what
 * happens to it, the questions, and what will also be added. Rows are settled first (cells,
 * repeats, names, questions), then the names they refer to (refs.js), rain plans last.
 */
export function listProposal(input) {
  const t = input.terms;
  const answers = input.answers || {};
  const setup = input.setup || {};
  const screen = listScreen(input.screenKey, t);
  const sheetName = input.sheet || pickSheet(input.file, screen, t);
  const base = { screen, sheets: sheetChoices(input.file), sheet: sheetName };
  if (!sheetName) {
    return { ...base, empty: true };
  }
  const sheet = input.file.sheets.find((s) => s.name === sheetName);
  const rows = (sheet && sheet.rows) || [];
  const at = headingRowIndex(rows);
  if (at < 0) {
    return { ...base, empty: true };
  }
  const mapping = mapHeadings(rows[at], screen, answers);
  const result = {
    ...base,
    mapping,
    rows: [],
    pairs: [],
    cards: [],
    alsoAdd: {}
  };
  if (mapping.missing.length || mapping.doubled.length) {
    return { ...result, blocked: true };
  }
  const used = usedColumns(screen, mapping);
  const read = readRows(rows, at + 1, used);
  const leads = settleLeads(read);
  result.pairs.push(
    ...matchNames(leads, screen.records(setup), screen.kind, answers)
  );
  result.cards.push(...whichOne(leads, screen, setup, answers));
  used
    .filter(
      ({ column }) => column.ref === "location" || column.ref === "locationType"
    )
    .forEach(({ column }) => {
      result.pairs.push(
        ...resolveColumn(
          leads,
          column,
          (column.ref === "location" ? setup.locations : setup.locationTypes) ||
            [],
          null,
          answers,
          PAIR_KIND[column.ref]
        )
      );
    });
  const targets = whoTargets(setup);
  const whoAdds = unknownWho(leads.filter(usable), targets, setup, answers, t);
  result.cards.push(...whoAdds.cards);
  leads.forEach((r) => {
    const who = used.find(({ column }) => column.type === "list");
    if (
      !who ||
      !usable(r) ||
      !Array.isArray(r.values.who) ||
      !r.values.who.length
    ) {
      return;
    }
    const keys = r.values.who.map(looseKey);
    if (keys.some((k) => whoAdds.leftOut.has(k))) {
      r.leftOut = true;
    } else if (keys.some((k) => whoAdds.open.has(k))) {
      r.open = true;
    } else {
      const found = resolveWho(r.values.who, targets);
      if (found.problem) {
        r.problems.push(`${who.column.heading}: ${found.problem}`);
      } else {
        r.values.who = found.ids;
      }
    }
  });
  checkNewLimits(leads, screen);
  const rain = used.find(({ column }) => column.ref === "activity");
  const rainPlans = rain
    ? resolveRainPlans(read, leads, rain.column, setup, answers)
    : { pairs: [], adds: [] };
  result.pairs.push(...rainPlans.pairs);
  finishRepeats(read);
  result.rows = read.map((r) => describeRow(r, used, screen, setup, answers));
  result.targets = targets;
  result.setupActivities = setup.activities || [];
  result.alsoAdd = alsoAdded(result.rows, used, rainPlans.adds, whoAdds.adds);
  return result;
}

/**
 * What saving would add because rows name it (Greg, #4): only what a row that will be saved
 * uses (a new row, or a difference answered Change).
 */
function alsoAdded(rows, used, rainAdds, whoAdds) {
  const alsoAdd = {};
  const uses = (key) => rows.filter((row) => usesValue(row, key));
  used
    .filter(
      ({ column }) => column.ref === "location" || column.ref === "locationType"
    )
    .forEach(({ column }) => {
      alsoAdd[column.ref] = [
        ...new Set(
          uses(column.key)
            .map((row) => (row.targets || {})[column.key])
            .filter((target) => target && target.add)
            .map((target) => target.add)
        )
      ].sort((x, y) => x.localeCompare(y));
    });
  // Rain plans to add, ticked (or unticked: skipped), for the rows that will be saved.
  alsoAdd.activity = rainAdds.filter((add) =>
    rows.some(
      (row) =>
        (usesValue(row, "rainPlan") &&
          ((row.targets || {}).rainPlan || {}).add === add.name) ||
        (row.droppedPlan === add.name &&
          ["new", "changed", "unchanged"].includes(row.status))
    )
  );
  alsoAdd.who = whoAdds.filter((add) =>
    uses("who").some(
      (row) => Array.isArray(row.values.who) && row.values.who.includes(add.key)
    )
  );
  return alsoAdd;
}

/** Whether a row will save its value for a column: a new row, or a difference answered Change. */
function usesValue(row, key) {
  return (
    row.status === "new" ||
    (row.status === "changed" &&
      row.differences.some((d) => d.column === key && d.answer === CHANGE))
  );
}

export function newValueOf(column, row) {
  if (column.key in row.values) {
    return row.values[column.key];
  }
  if (column.newValue === undefined) {
    return blankValue(column);
  }
  return typeof column.newValue === "function"
    ? column.newValue(row.values)
    : column.newValue;
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function describeRow(r, used, screen, setup, answers) {
  const row = {
    rowNumber: r.rowNumber,
    name: r.name,
    values: r.values,
    problems: r.problems,
    sameAs: r.sameAs || null,
    droppedPlan: r.droppedPlan || null,
    targets: r.targets || {}
  };
  if (r.problems.length) {
    return { ...row, status: "unreadable" };
  }
  if (r.leftOut) {
    return { ...row, status: "leftOut" };
  }
  if (r.open) {
    return { ...row, status: "asked" };
  }
  if (!r.existing) {
    const values = {};
    screen.columns.forEach((column) => {
      values[column.key] = newValueOf(column, r);
    });
    return { ...row, status: "new", values };
  }
  const differences = [];
  used.forEach(({ column }) => {
    if (column.key === "name") {
      return;
    }
    const blank = r.blanks.has(column.key);
    if (!blank && !(column.key in r.values)) {
      // Not in this row (a rain plan left unticked): nothing to compare.
      return;
    }
    // A blank clears an item set up: to none, or to "no maximum" or "no limit".
    const to = blank
      ? (column.blankMeans ?? blankValue(column))
      : r.values[column.key];
    const from = column.fromRecord(r.existing, setup);
    if (!same(normal(column, from), normal(column, to))) {
      const id = changeKey(screen.key, r.existing.Name, column.key, to);
      differences.push({
        id,
        column: column.key,
        heading: column.heading,
        from,
        to,
        clears: isEmpty(column, to) && !isEmpty(column, from),
        answer: answers[id] || null
      });
    }
  });
  return {
    ...row,
    id: r.existing.Id,
    existingName: r.existing.Name,
    status: differences.length ? "changed" : "unchanged",
    differences
  };
}

/** Whether a value is "nothing": none, No, no maximum or limit, or everyone (no list). */
function isEmpty(column, value) {
  if (column.type === "list") {
    return !value || value.length === 0;
  }
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    value === NONE
  );
}

function normal(column, value) {
  if (column.type === "list") {
    return [...(value || [])].sort();
  }
  if (column.type === "yesNo") {
    return !!value;
  }
  if (column.type === "early") {
    return value ? { count: Number(value.count), day: value.day } : null;
  }
  if (typeof value === "number" || column.type === "whole") {
    return value === null || value === undefined ? null : Number(value);
  }
  if (column.type === "wholeOrNone") {
    return value === NONE || value === null || value === undefined
      ? (value ?? null)
      : Number(value);
  }
  return value === "" ? null : (value ?? null);
}

export { cellText };
