/*
 * Which way round each page is, and what each of its cells says: who was doing what, on which
 * day, in which time block.
 *
 * Three layouts (Greg, 2026-10-16), each the way a camp prints one of the schedule page's views:
 * - "allCamp": one page per day, a column per group, cells name the activity;
 * - "byGroup": one page per group, a column per day, cells name the activity;
 * - "byActivity": one page per day, a column per activity, cells list the groups doing it
 *   (or one page per activity with the days across).
 *
 * Day columns are recognised as Shoresh desktop does (src/ingest/extractEntities.js
 * detectOrientation: most headings are day names; Apache-2.0, see NOTICE). Telling groups from
 * activities is new: a row where several cells say the same thing (everyone at Lunch) only
 * happens when the cells are activities, and a cell listing several names only when they are
 * groups. The layout found is always shown, and the director can change it.
 */
import {
  cellName,
  dayInTitle,
  dayOf,
  divisionInTitle,
  isNotAGroupColumn,
  listedNames,
  looseKey,
  tidy
} from "./text";
import { weekInTitle, withoutWeek } from "./weekLabels";

export const LAYOUTS = ["allCamp", "byGroup", "byActivity"];

function share(count, total) {
  return total === 0 ? 0 : count / total;
}

function columnsAreDays(page) {
  const named = page.columns.filter((c) => c !== "");
  return (
    named.length > 0 &&
    named.filter((c) => dayOf(c)).length >= Math.ceil(named.length * 0.6)
  );
}

/** How the cells of a page read: repeats within a row, cells listing several names, numbers. */
function cellSignals(page) {
  let rowsWithRepeat = 0;
  const cells = page.rows.flatMap((row) => row.cells.filter(Boolean));
  for (const row of page.rows) {
    const keys = row.cells.filter(Boolean).map(looseKey);
    if (new Set(keys).size < keys.length) {
      rowsWithRepeat++;
    }
  }
  return {
    repeatRows: share(rowsWithRepeat, page.rows.length),
    listCells: share(
      cells.filter((c) => listedNames(c).length > 1).length,
      cells.length
    ),
    numberedCells: share(cells.filter((c) => /\d/.test(c)).length, cells.length)
  };
}

/**
 * INGEST-2.6: whether every time block calls the same roll. A group is in one place at a time, so
 * on a by-activity page each block names every group once (a full roll, the blank cells being
 * activities nobody had), while an all-camp page fills one cell per group column with whatever
 * each did. True when no block names anything twice, at least four fifths of the blocks with
 * names name every one of the page's cell names, and those blocks do not simply fill one cell
 * per column (then the page reads both ways and is left unsure).
 */
function blocksCallTheRoll(page) {
  const rows = page.rows
    .map((row) => ({
      names: row.cells.flatMap((cell) => listedNames(cell)).map(looseKey),
      filled: row.cells.filter(Boolean).length
    }))
    .filter((row) => row.names.length > 0);
  const all = new Set(rows.flatMap((row) => row.names));
  // INGEST-2.17: one group alone, under a different activity block to block, calls a roll of
  // one; the same name in one column all day is an activity (an all-camp page of one group).
  const columnsUsed = new Set(
    page.rows.flatMap((row) =>
      row.cells.map((cell, c) => (cell ? c : -1)).filter((c) => c >= 0)
    )
  );
  if (
    rows.length < 2 ||
    all.size < 1 ||
    (all.size < 2 && columnsUsed.size < 2)
  ) {
    return false;
  }
  const full = rows.filter(
    (row) =>
      new Set(row.names).size === all.size && row.names.length === all.size
  );
  const oneCellPerColumn = full.every(
    (row) => row.filled === page.columns.filter(Boolean).length
  );
  return share(full.length, rows.length) >= 0.8 && !oneCellPerColumn;
}

function knownShare(names, known) {
  const named = names.filter(Boolean);
  return share(
    named.filter((n) => known.has(looseKey(n))).length,
    named.length
  );
}

/** Whether the cells name groups (true), activities (false), or it cannot tell (null). */
function cellsAreGroups(page, headings, known) {
  const cellNames = page.rows.flatMap((row) =>
    row.cells.flatMap((cell) => listedNames(cell))
  );
  if (knownShare(headings, known.groups) >= 0.5) {
    return false;
  }
  if (knownShare(cellNames, known.groups) >= 0.5) {
    return true;
  }
  const signals = cellSignals(page);
  if (signals.repeatRows >= 0.15) {
    return false;
  }
  if (signals.listCells >= 0.2) {
    return true;
  }
  // INGEST-2.6: a group cannot be in two places in one block, so a name twice in a row is an
  // activity (everyone at Lunch); every block calling the same roll once is groups.
  if (signals.repeatRows > 0) {
    return false;
  }
  if (blocksCallTheRoll(page)) {
    return true;
  }
  const numberedHeadings = share(
    headings.filter((h) => /\d/.test(h)).length,
    headings.filter(Boolean).length
  );
  if (signals.numberedCells > numberedHeadings + 0.3) {
    return true;
  }
  if (numberedHeadings > signals.numberedCells + 0.3) {
    return false;
  }
  return null;
}

/**
 * The layout of one page: { layout, daysAcross, confident }. `known.groups` holds the camp's
 * group names (loose keys), which settle it when they appear.
 */
export function detectLayout(page, known) {
  const daysAcross = columnsAreDays(page);
  // INGEST-2.17: one column, not days: one group's day (a by-activity page names many).
  if (!daysAcross && page.columns.filter(Boolean).length === 1) {
    return { layout: "allCamp", daysAcross, confident: true };
  }
  const headings = daysAcross ? [pageName(page)] : page.columns;
  const groups = cellsAreGroups(page, headings, known);
  if (daysAcross) {
    return {
      layout: groups ? "byActivity" : "byGroup",
      daysAcross,
      confident: groups !== null
    };
  }
  return {
    layout: groups ? "byActivity" : "allCamp",
    daysAcross,
    confident: groups !== null
  };
}

/** The day a page is for (all-camp and by-activity pages), from its title, sheet, or file. */
export function pageDay(page) {
  const n = page.names || {};
  return dayInTitle(n.section) || dayInTitle(n.sheet) || dayInTitle(n.file);
}

/** The week a page is for, if its title, sheet, or file names one ("Week 2"); "" otherwise. */
export function pageWeek(page) {
  const n = page.names || {};
  // INGEST-4.1: a week column's week; INGEST-4.2: the file name's week, kept when the file's
  // name is turned into a group's name.
  return (
    page.week ||
    weekInTitle(n.section, { maxWeek: n.maxWeek }) ||
    weekInTitle(n.sheet, { maxWeek: n.maxWeek }) ||
    n.fileWeek ||
    weekInTitle(n.file, { maxWeek: n.maxWeek, bareDates: true }) ||
    ""
  );
}

function isOnlyDayOrWeek(text, maxWeek) {
  // Any script's letters: a Hebrew title is a name, not nothing (INGEST-2.16).
  const rest = withoutWeek(text, { maxWeek })
    .split(/[^\p{L}]+/u)
    .filter((w) => w && !dayOf(w));
  return rest.length === 0;
}

/** The name a page-per-group (or page-per-activity) page gives its group: title, sheet, or file. */
export function pageName(page) {
  const n = page.names || {};
  // INGEST-2.17: a workbook's one sheet with a name of its own ("Bunk 1") names its page; the
  // file's name is most often the camp's.
  const candidates = [
    n.section,
    n.severalSheets || n.ownSheet ? n.sheet : "",
    n.file,
    n.sheet
  ];
  return tidy(
    candidates.find((c) => c && !isOnlyDayOrWeek(c, n.maxWeek)) || n.file || ""
  );
}

// ---------- what each cell says ----------

class CellReader {
  constructor(page, pageIndex, layout) {
    this.page = page;
    this.pageIndex = pageIndex;
    this.layout = layout;
    this.week = pageWeek(page);
    this.out = [];
    this.groups = [];
    // The last placement in each column, to join a name repeated in the next block.
    this.lastInColumn = new Map();
  }

  add(column, rowIndex, entry) {
    const key = `${column}|${entry.group}|${entry.division || ""}`;
    const last = this.lastInColumn.get(key);
    if (
      last &&
      last.endRow === rowIndex - 1 &&
      looseKey(last.text) === looseKey(entry.text) &&
      last.day === entry.day
    ) {
      last.span += entry.span;
      last.endRow = rowIndex + entry.span - 1;
      return;
    }
    const placement = {
      page: this.pageIndex,
      file: this.page.file,
      week: this.week,
      row: rowIndex,
      endRow: rowIndex + entry.span - 1,
      block: this.page.rows[rowIndex].label,
      ...entry
    };
    this.lastInColumn.set(key, placement);
    this.out.push(placement);
  }

  noteGroup(name, division, fromCell, weakDivision) {
    this.groups.push({
      name,
      division: division || null,
      weakDivision: !!weakDivision,
      page: this.pageIndex,
      file: this.page.file,
      fromCell: !!fromCell
    });
  }
}

function readCampPage(reader, page, day) {
  page.columns.forEach((heading, c) => {
    if (!heading || isNotAGroupColumn(heading)) {
      return;
    }
    const split = divisionInTitle(heading);
    const division = page.divisions[c] || split.division;
    const group = page.divisions[c] ? heading : split.group;
    reader.noteGroup(group, division);
    page.rows.forEach((row, r) => {
      const named = cellName(row.cells[c]);
      if (named) {
        reader.add(c, r, {
          group,
          division: division || null,
          day,
          text: named.name,
          place: named.place,
          bracket: named.bracket,
          emoji: named.emoji,
          span: row.spans[c]
        });
      }
    });
  });
}

function readGroupPage(reader, page) {
  const name = pageName(page);
  const split = divisionInTitle(name);
  // A division read from a file's name ("Camp 2026 - Bunk 3") is only a hint: the camp's name
  // or a year looks just like one. A division any page states outright wins over it.
  const names = page.names || {};
  const fromFileName = name === names.file && !!names.fileIsWholeName;
  reader.noteGroup(split.group, split.division, false, fromFileName);
  page.columns.forEach((heading, c) => {
    const day = dayOf(heading);
    if (!day) {
      return;
    }
    page.rows.forEach((row, r) => {
      const named = cellName(row.cells[c]);
      if (named) {
        reader.add(c, r, {
          group: split.group,
          division: split.division,
          weakDivision: fromFileName,
          day,
          text: named.name,
          place: named.place,
          bracket: named.bracket,
          emoji: named.emoji,
          span: row.spans[c]
        });
      }
    });
  });
}

function readActivityCell(reader, column, r, cell, entry) {
  for (const listed of listedNames(cell)) {
    const split = divisionInTitle(listed);
    reader.noteGroup(split.group, split.division, true);
    reader.add(column, r, {
      ...entry,
      group: split.group,
      division: split.division
    });
  }
}

function readActivityPage(reader, page, day, daysAcross) {
  page.columns.forEach((heading, c) => {
    const columnDay = daysAcross ? dayOf(heading) : day;
    const named = cellName(daysAcross ? pageName(page) : heading);
    if (!heading || !columnDay || !named || isNotAGroupColumn(heading)) {
      return;
    }
    page.rows.forEach((row, r) => {
      readActivityCell(reader, c, r, row.cells[c], {
        day: columnDay,
        text: named.name,
        place: named.place,
        bracket: named.bracket,
        emoji: named.emoji,
        span: row.spans[c]
      });
    });
  });
}

/**
 * Every placement a page shows: { page, file, week, day, group, block (row label), row, span,
 * text, place }, a name repeated in the blocks right after it joined into one placement, and
 * the groups it names with any division written beside them. A page whose day cannot be told
 * gives nothing and says so (`noDay`), unless `dayGiven` (a single-day file's answered day,
 * INGEST-4.14) gives it.
 */
export function readPage(page, pageIndex, found, dayGiven = null) {
  const reader = new CellReader(page, pageIndex, found.layout);
  const day = pageDay(page) || dayGiven;
  if (found.layout === "byGroup") {
    readGroupPage(reader, page);
  } else if (!found.daysAcross && !day) {
    return { placements: [], groups: [], noDay: true };
  } else if (found.layout === "allCamp") {
    readCampPage(reader, page, day);
  } else {
    readActivityPage(reader, page, day, found.daysAcross);
  }
  return { placements: reader.out, groups: reader.groups, noDay: false };
}
