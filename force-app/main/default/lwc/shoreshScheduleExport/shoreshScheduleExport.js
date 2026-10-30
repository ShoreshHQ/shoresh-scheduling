/**
 * Getting one opened schedule out of Shoresh (parity items 9 and 10): the sheets of its Excel file
 * and the pages of its printout. Pure: worked out from the opened version as the server sends it
 * (SchedulesController.openSchedule), in the camp's words, the same week always giving the same
 * file and the same pages.
 *
 * Excel follows Shoresh desktop's exportSchedule.js: one sheet per day (time blocks down the
 * side, a column per group), then a flat sheet of every group's week ("All Bunks"), and here also
 * a flat sheet of where each activity runs ("All Activities"), so the file holds what the three
 * views show. A cell that runs several blocks is written in each block it covers, as the desktop
 * writes one slot per block. Every text cell goes through the spreadsheet-formula guard
 * (c/shoreshLists sanitizeCell, the desktop's exportSanitize.js).
 *
 * Printing follows the view on screen: Daily View prints one page per day, Group View one per
 * group, Activity View one per activity that runs this week (ADR 0005 part 2).
 *
 * Special days and events (ADR 0014 slice 5; desktop ADR 2026-10-09-special-day-binds-to-a-week-day
 * D7): given the view as the page shows it (c/shoreshScheduleViews withSpecials), a day a special
 * day replaces is its own schedule, with its name and notes under it, and left out of All
 * Activities as Activity View leaves it out; each special event placed on the week with a
 * schedule of its own gets a sheet, and in Daily View a page, after the days.
 */
import { sanitizeCell } from "c/shoreshLists";
import {
  activityCards,
  activityGrid,
  clock,
  dailyGrid,
  days,
  eventPlans,
  groupCells,
  groupGrid,
  groups,
  isElectiveItem,
  isSetUpItem,
  kindLabel
} from "c/shoreshScheduleViews";

const REMOVED = "(removed)";
const CANT_BE_SHOWN = "Can't be shown";

function withRemoved(name, gone) {
  return gone ? `${name} ${REMOVED}` : name;
}

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
 * What a placed item says in a cell. bracket: the flat sheets name the kind of anything that is
 * not an activity, as the desktop's All Groups sheet does ("[Fixed activity] Lunch").
 */
export function itemText(item, t, bracket = false) {
  if (!item) {
    return "";
  }
  const name = withRemoved(item.name, item.gone && isSetUpItem(item));
  return bracket && item.kind !== "A"
    ? `[${kindLabel(item.kind, t)}] ${name}`
    : name;
}

/**
 * An elective set's cell lists its offerings, as the desktop's Excel export does
 * ("Chugim (Archery, Drama)"), on every sheet and with no kind in brackets (ELECT-6.3). offerings:
 * a Map of set Id to its offerings' names; a set with none reads as its name; one removed as itemText.
 */
function cellText(item, t, offerings, bracket = false) {
  if (!isElectiveItem(item) || item.gone) {
    return itemText(item, t, bracket);
  }
  const names = offerings.get(item.id) || [];
  return names.length ? `${item.name} (${names.join(", ")})` : item.name;
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

function dayName(day) {
  return days({ days: [day] })[0];
}

/** Sheet names, each used once: a second day of the same name takes its date as well. */
function uniqueNames(names) {
  const seen = new Set();
  return names.map(({ name, fallback }) => {
    let chosen = seen.has(name.toLowerCase()) ? fallback : name;
    let n = 2;
    while (seen.has(chosen.toLowerCase())) {
      chosen = `${fallback} ${n}`;
      n += 1;
    }
    seen.add(chosen.toLowerCase());
    return chosen;
  });
}

function guarded(rows) {
  return rows.map((row) => row.map(sanitizeCell));
}

/** A day's (or a special event's) grid as rows: the time block, then a column per group or station. */
function gridRows(day, t, offerings = new Map()) {
  const byGroup = day.groups.map((grp, g) => itemsByBlock(day, g));
  return [
    [t.s("TimeBlock"), ...day.groups.map((g) => withRemoved(g.name, g.gone))],
    ...day.blocks.map((block, b) => [
      blockText(block),
      ...byGroup.map((items) => cellText(items[b], t, offerings))
    ])
  ];
}

/** Under a special day's grid: its name and kind, then its notes. */
function specialRows(special, t) {
  const rows = [[], [`${special.name} (${t.s("SpecialDay")})`]];
  if (special.notes) {
    rows.push([special.notes]);
  }
  return rows;
}

/**
 * The Excel file's sheets for an opened schedule: [{ name, rows, widths }]. catalogue: the
 * season's activities (their order is Activity View's). offerings: each elective set's offerings'
 * names, by set Id (c/shoreshElectiveDetails offeringNames).
 */
export function scheduleSheets(view, catalogue, t, offerings = new Map()) {
  const allDays = (view && view.days) || [];
  const labels = allDays.map(dayName);
  const events = eventPlans(view);
  const names = uniqueNames([
    ...labels.map((d) => ({ name: d.label, fallback: `${d.label} ${d.sub}` })),
    ...events.map((e) => ({ name: e.name, fallback: `${e.name} (event)` }))
  ]);

  const daySheets = allDays.map((day, i) => {
    if (day.problem) {
      return { name: names[i], rows: [[CANT_BE_SHOWN]], widths: [22] };
    }
    const rows = gridRows(day, t, offerings);
    if (day.special) {
      rows.push(...specialRows(day.special, t));
    }
    return {
      name: names[i],
      rows: guarded(rows),
      widths: [22, ...day.groups.map(() => 16)]
    };
  });

  // Each special event's own schedule: its time blocks down, its stations across.
  const eventSheets = events.map((event, i) => ({
    name: names[allDays.length + i],
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
            cellText(item, t, offerings, true)
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

  return [
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
  ];
}

// ---------- printing ----------

/**
 * What a grid cell prints, in parts ({ key, text, rain }): its name, or in Activity View each
 * group's; a part a rainy-day switch put there carries its raindrop (issue #129), as on screen.
 * Nothing for Open.
 */
function printParts(cell) {
  if (cell.names) {
    return cell.names.map((n, i) => ({
      key: String(i),
      text: i ? `, ${n.name}` : n.name,
      rain: !!n.rain
    }));
  }
  if (cell.open || !cell.text) {
    return [];
  }
  return [{ key: "0", text: cell.text, rain: !!cell.rain }];
}

/** What a grid cell prints: its words, nothing for Open. */
function printText(cell) {
  if (cell.names) {
    return cell.names.map((n) => n.name).join(", ");
  }
  if (cell.open) {
    return "";
  }
  return cell.text;
}

/**
 * A schedule grid ({ columns, rows, cells }) as table rows: each row its time block, then a cell
 * per column that starts there (rowspan for one running several blocks; covered places left out).
 */
export function printTable(grid) {
  const rowCount = grid.rows.length;
  const colCount = grid.columns.length;
  const starts = new Map();
  const covered = new Set();
  grid.cells.forEach((cell) => {
    starts.set(`${cell.row}:${cell.column}`, cell);
    for (let r = cell.row + 1; r < cell.row + cell.length; r++) {
      covered.add(`${r}:${cell.column}`);
    }
  });
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const row = grid.rows[r];
    const cells = [];
    for (let c = 0; c < colCount; c++) {
      const at = `${r}:${c}`;
      if (covered.has(at)) {
        continue;
      }
      const cell = starts.get(at);
      const text = cell ? printText(cell) : "";
      cells.push({
        key: at,
        text,
        parts: cell ? printParts(cell) : [],
        note: cell && cell.note && text ? cell.note : null,
        rowspan: cell ? cell.length : 1,
        className: text ? "cell" : "cell cell_empty"
      });
    }
    rows.push({
      key: row.key,
      time: row.said || row.time,
      note: row.gone ? REMOVED : null,
      cells
    });
  }
  return {
    columns: grid.columns.map((col) => ({
      key: col.key,
      label: col.label,
      sub: col.sub,
      note: col.note
    })),
    rows
  };
}

/**
 * The printout of an opened schedule, following the view on screen ("day", "group", "activity"):
 * [{ key, title, table | null, notes, empty }]. A day that can't be read prints its title and
 * "Can't be shown". In Daily View a day a special day replaces prints its own schedule titled with
 * its name, its notes under it ("empty" when it has no schedule yet), and each special event's own
 * schedule follows the days on a page of its own.
 */
export function printPages(view, viewKey, catalogue, t) {
  if (!view) {
    return [];
  }
  if (viewKey === "group") {
    return groups(view).map((grp) => ({
      key: `group-${grp.key}`,
      title: withRemoved(grp.name, grp.gone),
      table: printTable(groupGrid(view, grp.key, t))
    }));
  }
  if (viewKey === "activity") {
    return activityCards(view, catalogue, t)
      .map((card) => ({ card, grid: activityGrid(view, card.key, t) }))
      .filter(({ grid }) =>
        grid.cells.some((cell) => cell.names && cell.names.length)
      )
      .map(({ card, grid }) => ({
        key: `activity-${card.key}`,
        title: withRemoved(card.name, card.gone),
        table: printTable(grid)
      }));
  }
  const dayPages = days(view).map((day) => {
    const shown = view.days[day.index];
    const special = shown.special;
    if (special && !shown.problem && !shown.blocks.length) {
      return {
        key: `day-${day.key}`,
        title: `${day.label}, ${day.sub} · ${special.name}`,
        table: null,
        notes: special.notes,
        empty: noScheduleYet(special.name)
      };
    }
    const grid = dailyGrid(view, day.index, t);
    return {
      key: `day-${day.key}`,
      title: special
        ? `${day.label}, ${day.sub} · ${special.name}`
        : `${day.label}, ${day.sub}`,
      table: grid ? printTable(grid) : null,
      notes: special ? special.notes : null,
      empty: null
    };
  });
  const eventPages = eventPlans(view).map((event) => ({
    key: `event-${event.eventId}`,
    title: `${event.name} (${t.s("SpecialEvent")})`,
    table: printTable(dailyGrid({ days: [event.plan] }, 0, t)),
    notes: null,
    empty: null
  }));
  return [...dayPages, ...eventPages];
}

/** What a special day with no time blocks yet says in place of its grid. */
export function noScheduleYet(name) {
  return `${name} has no schedule yet.`;
}

export { CANT_BE_SHOWN };
