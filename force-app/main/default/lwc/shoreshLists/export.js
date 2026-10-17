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
  return [screen.columns.map((c) => c.heading), ...rows].map(safe);
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
  const add = (kind, program, item) => {
    rows.push([
      t.s(kind),
      program,
      item.Name,
      ...weeks.map((w) => (off.has(`${item.Id}|${w.Id}`) ? "No" : "Yes"))
    ]);
  };
  (setup.programs || []).forEach((entry) => {
    const program = entry.program.Name;
    (entry.divisions || []).forEach((d) =>
      (d.groups || []).forEach((g) => add("Group", program, g))
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
    ["Kind", t.s("Program"), "Name", ...weeks.map((w) => w.Name)],
    ...rows
  ].map(safe);
}

/**
 * The whole camp: a sheet per list screen (named as the menu names it, in its order), then the
 * location types, camp words, weeks, and the weeks each item runs in. [{ name, rows }].
 */
export function campWorkbookSheets(setup, t) {
  const labels = screenLabels(t);
  return [
    ...LIST_SCREENS.map((key) => ({
      name: labels[key],
      rows: listRows(key, setup, t)
    })),
    { name: t.p("LocationType"), rows: locationTypeRows(setup, t) },
    { name: "Camp words", rows: campWordRows(setup) },
    { name: t.p("Week"), rows: weekRows(setup, t) },
    { name: "Runs in", rows: runsInRows(setup, t) }
  ];
}

/** Excel's sheet names: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(name) {
  return String(name)
    .replace(/[:\\/?*[\]]/g, " ")
    .slice(0, 31);
}
