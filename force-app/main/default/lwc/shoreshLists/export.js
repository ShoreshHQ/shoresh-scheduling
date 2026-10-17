/*
 * Writing setup out (slice 4c part C): "Download this list" on every screen, and the whole camp
 * in one workbook (Greg, #5 and Q3). Each screen's sheet is that screen's import layout, so
 * whatever Shoresh writes reads back with no changes. The workbook also carries what has no list
 * of its own, so a camp can be rebuilt in a fresh season from it alone (coordinator, Q3): the
 * location types, the camp's words, the weeks, and the weeks each item runs in.
 *
 * Every text cell goes through the spreadsheet-formula guard (cells.js sanitizeCell). Pure
 * JavaScript: the screen turns the sheets into a file with SheetJS.
 */
import { screenLabels } from "c/shoreshScreens";
import { sanitizeCell } from "./cells";
import { LIST_SCREENS, cellText, listScreen } from "./screens";
import { whoTargets } from "./who";

function safe(row) {
  return row.map((cell) => {
    return cell === null || cell === undefined ? "" : sanitizeCell(cell);
  });
}

/** One screen's list: its headings, then a row per item set up, as the import reads them. */
export function listRows(screenKey, setup, t) {
  const screen = listScreen(screenKey, t);
  const targets = whoTargets(setup);
  const rows = screen
    .records(setup)
    .map((record) =>
      screen.columns.map((column) =>
        cellText(column, column.fromRecord(record, setup), targets)
      )
    );
  const written = [screen.columns.map((c) => c.heading), ...rows].map(safe);
  fitsExcel(written);
  return written;
}

/** Excel's most in one cell. */
const CELL_LIMIT = 32767;

/** Refuses a cell Excel can't hold, naming its row, rather than cut it short. */
function fitsExcel(rows) {
  rows.forEach((row) =>
    row.forEach((cell, c) => {
      if (typeof cell === "string" && cell.length > CELL_LIMIT) {
        throw new Error(
          `${rows[0][c]} for “${row[0]}” is longer than a spreadsheet cell holds.`
        );
      }
    })
  );
}

/** The location types: a list of names (the Locations sheet only names the types in use). */
function locationTypeRows(setup, t) {
  return [
    [t.s("LocationType")],
    ...(setup.locationTypes || []).map((type) => [type.Name])
  ].map(safe);
}

/** The camp's own words, only those it changed: term, singular, plural. */
function campWordRows(setup) {
  return [
    ["Shoresh word", "Camp word", "Camp word (more than one)"],
    ...(setup.labels || [])
      .filter((label) => label.isCustom)
      .map((label) => [label.modelSingular, label.singular, label.plural])
  ].map(safe);
}

function weekRows(setup, t) {
  return [
    [t.s("Week"), "Start", "End"],
    ...(setup.weeks || []).map((w) => [w.Name, w.StartDate__c, w.EndDate__c])
  ].map(safe);
}

/**
 * The weeks each item runs in, as the screens' "Runs in" / "Open in" ticks: one row per group,
 * location, activity, fixed and recurring activity, Yes or No under each week.
 */
function runsInRows(setup, t) {
  const weeks = setup.weeks || [];
  // Two weeks of one name are told apart by their start dates.
  const named = weeks.map((w) => String(w.Name).toLowerCase());
  const heading = (w) => {
    const twice =
      named.filter((n) => n === String(w.Name).toLowerCase()).length > 1;
    return twice ? `${w.Name} (${w.StartDate__c})` : w.Name;
  };
  const off = new Set(
    (setup.weekExceptions || []).map((x) => {
      const item =
        x.Group__c ||
        x.Activity__c ||
        x.Location__c ||
        x.FixedActivity__c ||
        x.RecurringActivity__c;
      return `${item}|${x.Week__c}`;
    })
  );
  const rows = [];
  const add = (kind, program, item, division = "") => {
    rows.push([
      t.s(kind),
      program,
      division,
      item.Name,
      ...weeks.map((w) => (off.has(`${item.Id}|${w.Id}`) ? "No" : "Yes"))
    ]);
  };
  (setup.programs || []).forEach((entry) => {
    const program = entry.program.Name;
    (entry.divisions || []).forEach((d) =>
      (d.groups || []).forEach((g) => add("Group", program, g, d.division.Name))
    );
    (entry.fixedActivities || []).forEach((f) =>
      add("FixedActivity", program, f)
    );
    (entry.recurringActivities || []).forEach((r) =>
      add("RecurringActivity", program, r)
    );
  });
  (setup.locations || []).forEach((l) => add("Location", "", l));
  (setup.activities || []).forEach((a) => add("Activity", "", a));
  return [
    ["Kind", t.s("Program"), t.s("Division"), "Name", ...weeks.map(heading)],
    ...rows
  ].map(safe);
}

/**
 * The whole camp: a sheet per list screen (named as the menu names it, in its order), then the
 * location types, camp words, weeks, and the weeks each item runs in. [{ name, rows }].
 */
export function campWorkbookSheets(setup, t) {
  const labels = screenLabels(t);
  return uniqueNames([
    ...LIST_SCREENS.map((key) => ({
      name: labels[key],
      rows: listRows(key, setup, t)
    })),
    { name: t.p("LocationType"), rows: locationTypeRows(setup, t) },
    { name: "Camp words", rows: campWordRows(setup) },
    { name: t.p("Week"), rows: weekRows(setup, t) },
    { name: "Runs in", rows: runsInRows(setup, t) }
  ]);
}

/**
 * Sheet names as Excel takes them, never two alike (capitals aside): camp words can make two
 * screens' names the same ("Cabins" for units and bunks); the second gets " (2)".
 */
function uniqueNames(sheets) {
  const taken = new Set();
  return sheets.map((sheet) => {
    let name = sheetName(sheet.name);
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      name = `${sheetName(sheetName(sheet.name).slice(0, 26))} (${n})`;
    }
    taken.add(name.toLowerCase());
    return { ...sheet, name };
  });
}

/**
 * Excel's sheet names: at most 31 characters, none of : \ / ? * [ ], no apostrophe at either
 * end, and never "History" (Excel keeps that one).
 */
export function sheetName(name) {
  let clean = String(name)
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/^'+|'+$/g, "")
    .trim();
  if (clean.toLowerCase() === "history") {
    clean = `${clean} sheet`;
  }
  clean = clean.slice(0, 31).replace(/'+$/, "");
  // Never half of a two-part character (an emoji) at the cut.
  return (
    (/[\uD800-\uDBFF]$/.test(clean) ? clean.slice(0, -1) : clean) || "Sheet"
  );
}
