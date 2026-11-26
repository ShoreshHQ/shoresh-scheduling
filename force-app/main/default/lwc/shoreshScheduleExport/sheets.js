/**
 * A week's Excel file for what a director chose (PUB-6.10), the same on every screen and in the
 * connector (API-1.86): its sheets and its name. Pure: the same week and choice always give the
 * same file.
 *
 * The whole week follows Shoresh desktop's exportSchedule.js: one sheet per day (time blocks down
 * the side, a column per group), then a flat sheet of every group's week ("All Bunks"), and here
 * also a flat sheet of where each activity runs ("All Activities"), so the file holds what the
 * three views show. Any other choice is a sheet per thing chosen (pick.js chosenParts), each read
 * as the whole week's sheets read: a day's sheet is the whole week's sheet of that day, and every
 * sheet names a time block "Period 1 (9:00 AM – 9:45 AM)". A cell that runs several blocks is
 * written in each block it covers, as the desktop writes one slot per block. Every text cell goes
 * through the spreadsheet-formula guard (c/shoreshLists sanitizeCell, the desktop's
 * exportSanitize.js).
 *
 * Special days and events (ADR 0014 slice 5; desktop ADR 2026-10-09-special-day-binds-to-a-week-day
 * D7): given the view as the page shows it (c/shoreshScheduleViews withSpecials), a day a special
 * day replaces is its own schedule, with its name and notes under it, and left out of All
 * Activities as Activity View leaves it out; each special event placed on the week with a
 * schedule of its own gets a sheet after the days.
 */
import { sanitizeCell, sheetName } from "c/shoreshLists";
import {
  activityCards,
  clock,
  days,
  eventPlans,
  groupCells,
  groups,
  isElectiveItem,
  isSetUpItem
} from "c/shoreshScheduleViews";
import { CANT_BE_SHOWN, withRemoved } from "./removed";
import { choiceLabel, chosenParts, withGroups } from "./pick";

/** "Period 1 (9:00 AM – 9:45 AM)", or just the range when that is the block's name (desktop). */
export function blockText(block) {
  const name = withRemoved(block.name, block.gone);
  if (!block.startTime) {
    return name;
  }
  const range = `${clock(block.startTime)} – ${clock(block.endTime)}`;
  return block.name === range
    ? withRemoved(range, block.gone)
    : `${name} (${range})`;
}

/**
 * What a placed item says in a cell: its name only, on every sheet (word walk 2026-11-12: no
 * "[Fixed activity]" tag in a sheet a counselor reads; the import reads names, not tags).
 */
export function itemText(item) {
  if (!item) {
    return "";
  }
  return withRemoved(item.name, item.gone && isSetUpItem(item));
}

/**
 * An elective set's cell lists its offerings, as the desktop's Excel export does
 * ("Chugim (Archery, Drama)"), on every sheet (ELECT-6.3). offerings: a Map of set Id to its
 * offerings' names; a set with none reads as its name.
 */
function withOfferings(name, setId, offerings) {
  const names = offerings.get(setId) || [];
  return names.length ? `${name} (${names.join(", ")})` : name;
}

/** A placed item's cell: an elective set with its offerings, one removed as itemText. */
function cellText(item, offerings) {
  if (!isElectiveItem(item) || item.gone) {
    return itemText(item);
  }
  return withOfferings(item.name, item.id, offerings);
}

/** One group's day, one entry per time block: the item there (or null), carried-on blocks too. */
function itemsByBlock(day, groupIndex) {
  const out = day.blocks.map(() => null);
  groupCells(day, groupIndex).forEach((c) => {
    for (let b = c.blockIndex; b < c.blockIndex + c.length; b++) {
      out[b] = c.item;
    }
  });
  return out;
}

/**
 * Sheet names, each used once (the workbook refuses two of the same name), counted after the
 * workbook shortens them to Excel's 31 characters: a second sheet of a name takes its fallback (a
 * day's date as well), then " 2", " 3"... Each sheet: { name, fallback?, rows, widths }.
 */
function oneEach(sheets) {
  const seen = new Set();
  return sheets.map(({ fallback, ...sheet }) => {
    const base = sheetName(sheet.name);
    const stem =
      seen.has(base.toLowerCase()) && fallback ? sheetName(fallback) : base;
    let name = stem;
    let n = 2;
    while (seen.has(name.toLowerCase())) {
      const more = ` ${n}`;
      name = `${stem.slice(0, 31 - more.length)}${more}`;
      n += 1;
    }
    seen.add(name.toLowerCase());
    return { ...sheet, name };
  });
}

function guarded(rows) {
  return rows.map((row) => row.map(sanitizeCell));
}

/** A day's (or a special event's) grid as rows: the time block, then a column per group or station. */
function gridRows(day, t, offerings) {
  const byGroup = day.groups.map((grp, g) => itemsByBlock(day, g));
  return [
    [t.s("TimeBlock"), ...day.groups.map((g) => withRemoved(g.name, g.gone))],
    ...day.blocks.map((block, b) => [
      blockText(block),
      ...byGroup.map((items) => cellText(items[b], offerings))
    ])
  ];
}

/**
 * A day's sheet: its grid, and under a special day's its name and kind, then its notes. A day
 * that can't be read says so.
 */
function daySheet(day, t, offerings) {
  if (day.problem) {
    return { rows: [[CANT_BE_SHOWN]], widths: [22] };
  }
  const rows = gridRows(day, t, offerings);
  if (day.special) {
    rows.push([], [`${day.special.name} (${t.s("SpecialDay")})`]);
    if (day.special.notes) {
      rows.push([day.special.notes]);
    }
  }
  return { rows: guarded(rows), widths: [22, ...day.groups.map(() => 16)] };
}

/**
 * The whole week's file: [{ name, rows, widths }]. catalogue: the season's activities (their
 * order is Activity View's). offerings: each elective set's offerings' names, by set Id
 * (c/shoreshElectiveDetails offeringNames).
 */
export function scheduleSheets(view, catalogue, t, offerings = new Map()) {
  const allDays = (view && view.days) || [];
  const labels = allDays.map((day) => days({ days: [day] })[0]);

  const daySheets = allDays.map((day, i) => ({
    name: labels[i].label,
    fallback: `${labels[i].label} ${labels[i].sub}`,
    ...daySheet(day, t, offerings)
  }));

  // Each special event's own schedule: its time blocks down, its stations across.
  const eventSheets = eventPlans(view).map((event) => ({
    name: event.name,
    fallback: `${event.name} (event)`,
    rows: guarded(gridRows(event.plan, t, offerings)),
    widths: [22, ...event.plan.groups.map(() => 16)]
  }));

  // Every group's week, one row per thing placed (desktop: All Groups).
  const groupRows = [];
  groups(view).forEach((grp) => {
    allDays.forEach((day, i) => {
      if (day.problem) {
        return;
      }
      const g = day.groups.findIndex((x) => (x.id || x.name) === grp.key);
      if (g < 0) {
        return;
      }
      itemsByBlock(day, g).forEach((item, b) => {
        if (item) {
          groupRows.push([
            withRemoved(grp.name, grp.gone),
            labels[i].label,
            blockText(day.blocks[b]),
            cellText(item, offerings)
          ]);
        }
      });
    });
  });

  // Where each activity runs: one row per block it runs in, with the groups doing it.
  const activityRows = [];
  activityCards(view, catalogue, t).forEach((card) => {
    allDays.forEach((day, i) => {
      if (day.problem || day.special) {
        return;
      }
      const byGroup = day.groups.map((grp, g) => itemsByBlock(day, g));
      day.blocks.forEach((block, b) => {
        const here = day.groups.filter((grp, g) => {
          const item = byGroup[g][b];
          return item && item.kind === "A" && item.id === card.key;
        });
        if (here.length) {
          activityRows.push([
            withRemoved(card.name, card.gone),
            labels[i].label,
            blockText(block),
            here.map((grp) => withRemoved(grp.name, grp.gone)).join(", ")
          ]);
        }
      });
    });
  });

  return oneEach([
    ...daySheets,
    ...eventSheets,
    {
      name: `All ${t.p("Group")}`,
      rows: guarded([
        [t.s("Group"), "Day", t.s("TimeBlock"), t.s("Activity")],
        ...groupRows
      ]),
      widths: [16, 12, 22, 20]
    },
    {
      name: `All ${t.p("Activity")}`,
      rows: guarded([
        [t.s("Activity"), "Day", t.s("TimeBlock"), t.p("Group")],
        ...activityRows
      ]),
      widths: [20, 12, 22, 30]
    }
  ]);
}

/**
 * One thing's week as a sheet (c/shoreshScheduleViews groupGrid, activityGrid, locationGrid): the
 * corner and a column per day, then a row per time block with what is in each day there. An
 * elective set lists its offerings (ELECT-6.3). lines: said under the grid, a row each, after an
 * empty row (who leads, PUB-6.12).
 */
function gridSheet(name, grid, t, offerings, lines = []) {
  const at = new Map();
  grid.cells.forEach((cell) => {
    for (let r = cell.row; r < cell.row + cell.length; r++) {
      at.set(`${r}:${cell.column}`, cell);
    }
  });
  const text = (cell) => {
    if (!cell || cell.open) return "";
    if (cell.names) return cell.names.map((n) => n.name).join(", ");
    if (cell.electiveKey && !cell.gone) {
      return withOfferings(cell.text, cell.electiveKey.slice(2), offerings);
    }
    return withRemoved(cell.text, cell.gone);
  };
  return {
    name,
    rows: guarded([
      [
        t.s("TimeBlock"),
        ...grid.columns.map((col) =>
          [col.label, col.sub, col.note].filter(Boolean).join(" ")
        )
      ],
      ...grid.rows.map((row, r) => [
        blockText(row),
        ...grid.columns.map((col, c) => text(at.get(`${r}:${c}`)))
      ]),
      ...(lines.length ? [[], ...lines.map((line) => [line])] : [])
    ]),
    widths: [22, ...grid.columns.map(() => 16)]
  };
}

/**
 * The Excel file's sheets for a choice: the whole week as scheduleSheets; else a sheet per day,
 * group, activity, location or staff member chosen, and a division's a sheet per day with only
 * its groups (a day it has no group on left out). A day's sheet holds the whole camp (a sheet has
 * no pages to split).
 */
export function sheetsFor(view, choice, catalogue, setup, t, offerings) {
  if (choice.kind === "week") {
    return scheduleSheets(view, catalogue, t, offerings);
  }
  const chosen = chosenParts(view, choice, catalogue, setup, t);
  if (!chosen) return [];
  const said = days(view);
  const sheets = chosen.parts.map((part) => {
    if (part.grid) {
      const lines = [part.lead, ...(part.lines || [])].filter(Boolean);
      return gridSheet(part.title, part.grid, t, offerings, lines);
    }
    const shown = view.days[part.day];
    const label = [part.head, said[part.day].label].filter(Boolean).join(" ");
    const indexes = shown.problem
      ? []
      : shown.groups
          .map((grp, g) => (!part.keep || part.keep(grp) ? g : -1))
          .filter((g) => g >= 0);
    if (part.keep && !shown.problem && !indexes.length) return null;
    return {
      name: label,
      fallback: `${label} ${said[part.day].sub}`,
      ...daySheet(
        shown.problem ? shown : withGroups(shown, indexes),
        t,
        offerings
      )
    };
  });
  return oneEach(sheets.filter(Boolean));
}

/**
 * The file's name before ".xlsx" (or the printout's): "<week> - <version>" for the whole week,
 * then " - <choice>" for anything else, as the menu names it ("Every Bunk", "Monday, Jun 29").
 * choices: the menu's (printChoices).
 */
export function fileTitle(choices, choice, week, version) {
  const base = `${week} - ${version}`;
  return choice.kind === "week"
    ? base
    : `${base} - ${choiceLabel(choices, choice)}`;
}
