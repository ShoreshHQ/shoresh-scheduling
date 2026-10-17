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
import {
  LEAVE_OUT,
  looseKey,
  mergesFrom,
  similarPairs,
  tidy
} from "c/shoreshImportEngine";
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
      typeof values.min === "number" &&
      typeof values.max === "number" &&
      values.max < values.min
    ) {
      problems.push(
        `At most ${values.max} is less than at least ${values.min} times a week`
      );
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

/** A later row with the same name as an earlier one is left out, and says which row is used. */
function markRepeats(rows) {
  const first = new Map();
  rows
    .filter((r) => !r.problems.length)
    .forEach((r) => {
      const key = looseKey(r.name);
      if (first.has(key)) {
        r.problems.push(
          `${r.name} is also on row ${first.get(key)}; only row ${first.get(key)} is used`
        );
      } else {
        first.set(key, r.rowNumber);
      }
    });
}

/** Similar names among the rows and against the camp's: the question, and what each answer did. */
function matchNames(rows, records, kind, answers) {
  const readable = rows.filter((r) => !r.problems.length);
  const campNames = records.map((r) => r.Name);
  const pairs = similarPairs(
    PAIR_KIND[kind],
    readable.map((r) => ({ name: r.name, count: 1 })),
    campNames
  );
  const byName = new Map(records.map((r) => [r.Name, r]));
  const rowOf = new Map(readable.map((r) => [r.name, r]));
  readable.forEach((r) => {
    r.existing = byName.get(r.name) || null;
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
      a.existing = byName.get(pair.existing);
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
  // Two rows that now stand for the same item: the second is a repeat.
  const taken = new Map();
  readable
    .filter((r) => r.existing && !r.leftOut && !r.open)
    .forEach((r) => {
      if (taken.has(r.existing.Id)) {
        r.problems.push(
          `${r.name} is the same as row ${taken.get(r.existing.Id)}; only row ${taken.get(r.existing.Id)} is used`
        );
      } else {
        taken.set(r.existing.Id, r.rowNumber);
      }
    });
  return pairs;
}

/**
 * Names of other records (a location, a location type): the season's, asked about when only
 * similar, or added with the list. Returns { pairs, merged (name -> name kept), leftOut
 * (names answered "leave it out"), open (names still asked about) }.
 */
function matchRefs(rows, column, records, answers) {
  const counts = new Map();
  rows
    .filter((r) => !r.problems.length && !r.leftOut)
    .forEach((r) => {
      const name = r.values[column.key];
      if (name) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    });
  const campNames = records.map((r) => r.Name);
  const pairs = similarPairs(
    PAIR_KIND[column.ref],
    [...counts.entries()].map(([name, count]) => ({ name, count })),
    campNames
  );
  const merged = mergesFrom(pairs, answers);
  const leftOut = new Set();
  const open = new Set();
  pairs.forEach((pair) => {
    const answer = answers[pair.id];
    if (answer === LEAVE_OUT) {
      leftOut.add(pair.a);
      if (!pair.existing) {
        leftOut.add(pair.b);
      }
    } else if (answer === undefined) {
      open.add(pair.a);
      if (!pair.existing) {
        open.add(pair.b);
      }
    }
  });
  return { pairs, merged, leftOut, open };
}

/**
 * Rain plans: a plan naming the camp's activity, or a row of the list that will be saved, is
 * fine; one naming a row that can't be read or is left out, or nothing at all, is added after
 * asking its length (Greg, Q2). A row whose plan is still asked about waits with it, and one
 * whose plan is left out is left out too, which can leave out further rows: repeated until
 * nothing changes, so the order of the rows never matters.
 */
function rainPlans(read, column, setup, answers, t) {
  const camp = new Set((setup.activities || []).map((a) => a.Name));
  read.forEach((r) => {
    const plan = r.values[column.key];
    if (plan && looseKey(plan) === looseKey(r.name) && !r.problems.length) {
      r.problems.push(`${column.heading}: can't be itself`);
    }
  });
  let pass = rainPass(read, column, camp, answers, t);
  // Each pass can only leave out or hold more rows, so this ends.
  for (let i = 0; pass.changed && i < read.length; i++) {
    pass = rainPass(read, column, camp, answers, t);
  }
  return pass.adds;
}

function usable(row) {
  return !row.problems.length && !row.leftOut;
}

/** One pass of rainPlans: what is missing now, and the rows that wait or are left out with it. */
function rainPass(read, column, camp, answers, t) {
  const rows = read.filter(usable);
  const rowOf = new Map();
  rows.forEach((row) => {
    if (!rowOf.has(row.name)) {
      rowOf.set(row.name, row);
    }
  });
  const missing = new Set();
  rows.forEach((r) => {
    const plan = r.values[column.key];
    if (plan && !camp.has(plan) && !rowOf.has(plan)) {
      missing.add(plan);
    }
  });
  const adds = unknownRainPlans(missing, answers, t);
  let changed = false;
  rows.forEach((r) => {
    const plan = r.values[column.key];
    const target = plan && rowOf.get(plan);
    if (plan && adds.leftOut.has(plan)) {
      r.leftOut = true;
      changed = true;
    } else if ((plan && adds.open.has(plan)) || (target && target.open)) {
      changed = changed || !r.open;
      r.open = true;
    }
  });
  return { adds, changed };
}

/** Whether a row will save its value for a column: a new row, or a difference answered Change. */
function usesValue(row, key) {
  return (
    row.status === "new" ||
    (row.status === "changed" &&
      row.differences.some((d) => d.column === key && d.answer === CHANGE))
  );
}

/** What a reference column's names are matched against: the season's, and for a rain plan the list's own. */
function refRecords(column, setup, ownNames) {
  if (column.ref === "activity") {
    return [
      ...(setup.activities || []),
      ...ownNames.map((name) => ({ Name: name }))
    ];
  }
  return (
    (column.ref === "location" ? setup.locations : setup.locationTypes) || []
  );
}

/** The value a column has for a new item: the file's, or what a new item starts with. */
export function newValueOf(column, row) {
  if (column.key in row.values) {
    return row.values[column.key];
  }
  if (!column.keepWhenBlank) {
    return blankValue(column);
  }
  return typeof column.newValue === "function"
    ? column.newValue(row.values)
    : column.newValue;
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Reads one list for one screen. input: { screenKey, file, sheet (chosen, optional), setup,
 * terms, answers }. Returns the sheet used (or the sheets to choose from), the headings and
 * their columns, every row with what happens to it, the questions, and what will also be added.
 */
export function listProposal(input) {
  const t = input.terms;
  const answers = input.answers || {};
  const setup = input.setup || {};
  const screen = listScreen(input.screenKey, t);
  const sheetName = input.sheet || pickSheet(input.file, screen, t);
  const base = { screen, sheets: sheetChoices(input.file), sheet: sheetName };
  if (!sheetName) {
    return { ...base, needsSheet: true };
  }
  const sheet = input.file.sheets.find((s) => s.name === sheetName);
  const rows = (sheet && sheet.rows) || [];
  const at = headingRowIndex(rows);
  if (at < 0) {
    return { ...base, empty: true };
  }
  const mapping = mapHeadings(rows[at], screen, answers);
  const result = { ...base, mapping, rows: [], pairs: [], alsoAdd: {} };
  if (mapping.missing.length || mapping.doubled.length) {
    return { ...result, blocked: true };
  }
  const used = usedColumns(screen, mapping);
  const read = readRows(rows, at + 1, used);
  markRepeats(read);
  const records = screen.records(setup);
  result.pairs.push(...matchNames(read, records, screen.kind, answers));
  const targets = whoTargets(setup);
  const ownNames = read
    .filter((r) => !r.problems.length && !r.leftOut)
    .map((r) => r.name);
  used
    .filter(({ column }) => column.ref)
    .forEach(({ column }) => {
      const refs = matchRefs(
        read,
        column,
        refRecords(column, setup, ownNames),
        answers
      );
      result.pairs.push(...refs.pairs);
      read.forEach((r) => {
        const name = r.values[column.key];
        if (!name) {
          return;
        }
        if (refs.leftOut.has(name)) {
          r.leftOut = true;
        } else if (refs.open.has(name)) {
          r.open = true;
        }
        r.values[column.key] = refs.merged.get(name) || name;
      });
    });
  const whoAdds = unknownWho(read, targets, setup, answers, t);
  result.cards = [...whoAdds.cards];
  result.whoAdds = whoAdds.adds;
  read.forEach((r) => {
    const who = used.find(({ column }) => column.type === "list");
    if (!who || !Array.isArray(r.values.who) || !r.values.who.length) {
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
  const rain = used.find(({ column }) => column.ref === "activity");
  const rainAdds = rain
    ? rainPlans(read, rain.column, setup, answers, t)
    : { cards: [], adds: [] };
  result.cards.push(...rainAdds.cards);
  result.rainAdds = rainAdds.adds;
  result.rows = read.map((r) => describeRow(r, used, screen, setup, answers));
  result.targets = targets;
  // What the save request points at by name.
  result.setupRefs = {
    location: setup.locations || [],
    locationType: setup.locationTypes || [],
    activity: setup.activities || []
  };
  result.setupActivities = setup.activities || [];
  result.alsoAdd = alsoAdded(result.rows, used, setup);
  const counted = (row, key) => usesValue(row, key);
  result.alsoAdd.activity = rainAdds.adds.filter((add) =>
    result.rows.some(
      (row) => counted(row, "rainPlan") && row.values.rainPlan === add.name
    )
  );
  result.alsoAdd.who = whoAdds.adds.filter((add) =>
    result.rows.some(
      (row) =>
        counted(row, "who") &&
        Array.isArray(row.values.who) &&
        row.values.who.includes(add.key)
    )
  );
  return result;
}

/**
 * The locations and location types rows name that the season doesn't have: added with the list
 * (Greg, #4: shown ticked, and can't be unticked). Only for rows that are added, or changed in
 * that column.
 */
function alsoAdded(rows, used, setup) {
  const result = {};
  used
    .filter(({ column }) => column.ref && column.ref !== "activity")
    .forEach(({ column }) => {
      const known = new Set(
        (
          (column.ref === "location" ? setup.locations : setup.locationTypes) ||
          []
        ).map((r) => r.Name)
      );
      const names = new Set();
      rows.forEach((row) => {
        const name = row.values[column.key];
        const counts =
          row.status === "new" ||
          (row.status === "changed" &&
            row.differences.some(
              (d) => d.column === column.key && d.answer === CHANGE
            ));
        if (name && counts && !known.has(name)) {
          names.add(name);
        }
      });
      result[column.ref] = [...names].sort((x, y) => x.localeCompare(y));
    });
  return result;
}

/** What happens to one row: unreadable, left out, waiting on a question, new, unchanged, or changed. */
function describeRow(r, used, screen, setup, answers) {
  const row = {
    rowNumber: r.rowNumber,
    name: r.name,
    values: r.values,
    problems: r.problems,
    sameAs: r.sameAs || null
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
    if (
      "max" in values &&
      typeof values.max === "number" &&
      values.max < values.min
    ) {
      // At most written, at least left to start at 1: Salesforce would refuse the whole save.
      return {
        ...row,
        status: "unreadable",
        problems: [
          `At most ${values.max} is less than at least ${values.min} times a week`
        ]
      };
    }
    return { ...row, status: "new", values };
  }
  const differences = [];
  used.forEach(({ column }) => {
    if (column.key === "name") {
      return;
    }
    const blank = r.blanks.has(column.key);
    if (blank && column.keepWhenBlank) {
      return;
    }
    const to = blank ? blankValue(column) : r.values[column.key];
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

function isEmpty(column, value) {
  if (column.type === "list") {
    // Everyone (no list) is a value, not a blank: nothing is cleared.
    return false;
  }
  return (
    value === null || value === undefined || value === "" || value === false
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
