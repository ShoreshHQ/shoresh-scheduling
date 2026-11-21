/**
 * Print and Excel by what a director asks for (PUB-6.4 to PUB-6.9; Greg 2026-11-21: "print the
 * whole day. by bunk. by activity. etc. go beyond the desktop"): the whole week, one day for the
 * whole camp, one bunk, one activity, one location or one division, or every one of a kind. The
 * same choices on the Schedules page, Generated Schedule and Manual Build (c/shoreshPrintMenu).
 * Pure: the same week and choice always give the same pages and sheets.
 *
 * A day prints at most PAGE_COLUMNS bunks a page (PUB-6.5): when the camp is wider, its
 * divisions go a page at a time (small ones next to each other share one), and a division wider
 * than a page is split evenly. Each page says which bunks it holds.
 *
 * view: the week as the screen shows it (c/shoreshScheduleViews withSpecials). setup: the season
 * (SeasonSetupController.getSeasonSetup): its divisions and where each thing runs. A choice is
 * { kind, key }: kind "week", "day", "group", "activity", "location" or "division"; key the
 * one chosen, EVERY for every one of the kind (none for the week).
 */
import { FIELD } from "c/shoreshSchema";
import { sanitizeCell } from "c/shoreshLists";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  days,
  eventPlans,
  groupCells,
  groupGrid,
  groups,
  locationGrid
} from "c/shoreshScheduleViews";
import { printTable } from "./table";

export const EVERY = "*";
export const PAGE_COLUMNS = 10;

const REMOVED = "(removed)";
const CANT_BE_SHOWN = "Can't be shown";

function withRemoved(name, gone) {
  return gone ? `${name} ${REMOVED}` : name;
}

/**
 * The season's divisions and places, as printing needs them: each group's division (in the
 * season's order; a program's No division holder is none), and the location of each activity,
 * fixed and recurring activity and special event.
 */
export function campPlaces(setup) {
  const divisionOf = new Map();
  const divisions = [];
  ((setup && setup.programs) || []).forEach((program) => {
    (program.divisions || []).forEach((entry) => {
      const division = entry.division || {};
      if (division[FIELD.Division.NoDivision]) {
        return;
      }
      const info = { id: division.Id, name: division.Name };
      divisions.push(info);
      (entry.groups || []).forEach((grp) => divisionOf.set(grp.Id, info));
    });
  });
  const locationOf = new Map();
  const note = (records, field) =>
    (records || []).forEach((record) => {
      if (record[field]) {
        locationOf.set(record.Id, record[field]);
      }
    });
  note(setup && setup.activities, FIELD.Activity.Location);
  ((setup && setup.programs) || []).forEach((program) => {
    note(program.fixedActivities, FIELD.FixedActivity.Location);
    note(program.recurringActivities, FIELD.RecurringActivity.Location);
  });
  note(
    setup && setup.special && setup.special.specialEvents,
    FIELD.SpecialEvent.Location
  );
  const locations = ((setup && setup.locations) || []).map((place) => ({
    id: place.Id,
    name: place.Name
  }));
  return { divisionOf, divisions, locationOf, locations };
}

/** The readable days of the week, as positions in it. */
function readableDays(view) {
  return ((view && view.days) || [])
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => !day.problem);
}

/** The divisions with a group in this week, in the season's order. */
function weekDivisions(view, places) {
  const seen = new Set();
  readableDays(view).forEach(({ day }) =>
    day.groups.forEach((grp) => {
      const division = places.divisionOf.get(grp.id);
      if (division) seen.add(division.id);
    })
  );
  return places.divisions.filter((division) => seen.has(division.id));
}

/** Whether a placed item runs at a location (by its record). */
function atLocation(places, locationId) {
  return (item) => !!item.id && places.locationOf.get(item.id) === locationId;
}

/** The locations something runs at this week, in the season's order. */
function weekLocations(view, places) {
  const used = new Set();
  readableDays(view).forEach(({ day }) => {
    if (day.special) return;
    day.groups.forEach((grp, g) =>
      groupCells(day, g).forEach(({ item }) => {
        const location = item && item.id && places.locationOf.get(item.id);
        if (location) used.add(location);
      })
    );
  });
  return places.locations.filter((place) => used.has(place.id));
}

/** The activities placed this week (Activity View's cards that run). */
function weekActivities(view, catalogue, t) {
  return activityCards(view, catalogue, t).filter((card) =>
    activityGrid(view, card.key, t).cells.some(
      (cell) => cell.names && cell.names.length
    )
  );
}

/**
 * What can be printed or downloaded from this week, for the menu: the whole week, then each kind
 * with its choices ("Every Bunk" first where there are several). A kind with nothing this week
 * (no location used, no divisions) is left out. [{ kind, label, options: [{ key, label }] }].
 */
export function printChoices(view, catalogue, setup, t) {
  if (!view || !(view.days || []).length) {
    return [];
  }
  const places = campPlaces(setup);
  const every = (word, list) => {
    return list.length > 1
      ? [{ key: EVERY, label: `Every ${word}` }, ...list]
      : list;
  };
  const dayOptions = days(view)
    .filter((d) => !d.problem)
    .map((d) => ({ key: d.key, label: `${d.label}, ${d.sub}` }));
  const kinds = [
    { kind: "week", label: `Whole ${t.s("Week")}`, options: [] },
    { kind: "day", label: "Day", options: dayOptions },
    {
      kind: "group",
      label: t.s("Group"),
      options: every(
        t.s("Group"),
        groups(view).map((grp) => ({
          key: grp.key,
          label: withRemoved(grp.name, grp.gone)
        }))
      )
    },
    {
      kind: "activity",
      label: t.s("Activity"),
      options: every(
        t.s("Activity"),
        weekActivities(view, catalogue, t).map((card) => ({
          key: card.key,
          label: withRemoved(card.name, card.gone)
        }))
      )
    },
    {
      kind: "location",
      label: t.s("Location"),
      options: every(
        t.s("Location"),
        weekLocations(view, places).map((place) => ({
          key: place.id,
          label: place.name
        }))
      )
    },
    {
      kind: "division",
      label: t.s("Division"),
      options: every(
        t.s("Division"),
        weekDivisions(view, places).map((division) => ({
          key: division.id,
          label: division.name
        }))
      )
    }
  ];
  return kinds.filter((k) => k.kind === "week" || k.options.length);
}

/** What a choice is called, for the file's name: "Monday, Jun 29", "Cedar", "Every Bunk". */
export function choiceLabel(choices, choice) {
  const kind = choices.find((k) => k.kind === choice.kind);
  if (!kind) return "";
  if (choice.kind === "week") return kind.label;
  const option = kind.options.find((o) => o.key === choice.key);
  return option ? option.label : "";
}

/** A day with only some of its groups (by position), for a page or a division. */
function withGroups(day, indexes) {
  return {
    ...day,
    groups: indexes.map((i) => day.groups[i]),
    rows: indexes.map((i) => day.rows[i] || "")
  };
}

function evenParts(list, size) {
  const count = Math.ceil(list.length / size);
  const each = Math.ceil(list.length / count);
  const out = [];
  for (let i = 0; i < list.length; i += each) out.push(list.slice(i, i + each));
  return out;
}

/**
 * A day's groups as pages (PUB-6.5): all on one page when they fit; else a division at a time,
 * divisions side by side sharing a page while they fit, and one wider than a page split evenly.
 * Groups with no division form a run of their own. [{ indexes, label }]: label says which bunks
 * ("Juniors", "Juniors, Inters", "Seniors (1 of 2)", or "Cedar – Oak" outside any division);
 * null when the day is one page.
 */
export function dayPieces(day, places) {
  const all = day.groups.map((grp, i) => i);
  if (all.length <= PAGE_COLUMNS) {
    return [{ indexes: all, label: null }];
  }
  // Runs of groups next to each other in the same division (or none).
  const runs = [];
  day.groups.forEach((grp, i) => {
    const division = places.divisionOf.get(grp.id) || null;
    const last = runs[runs.length - 1];
    if (last && last.division === division) {
      last.indexes.push(i);
    } else {
      runs.push({ division, indexes: [i] });
    }
  });
  const range = (indexes) => {
    const first = day.groups[indexes[0]].name;
    const last = day.groups[indexes[indexes.length - 1]].name;
    return indexes.length === 1 ? first : `${first} – ${last}`;
  };
  const pieces = [];
  let open = null;
  const close = () => {
    if (open) pieces.push(open);
    open = null;
  };
  runs.forEach((run) => {
    if (run.indexes.length > PAGE_COLUMNS) {
      close();
      const parts = evenParts(run.indexes, PAGE_COLUMNS);
      parts.forEach((indexes, n) =>
        pieces.push({
          indexes,
          names: [
            run.division
              ? `${run.division.name} (${n + 1} of ${parts.length})`
              : range(indexes)
          ]
        })
      );
      return;
    }
    if (open && open.indexes.length + run.indexes.length > PAGE_COLUMNS) {
      close();
    }
    if (!open) open = { indexes: [], names: [] };
    open.indexes.push(...run.indexes);
    open.names.push(run.division ? run.division.name : range(run.indexes));
  });
  close();
  return pieces.map((piece) => ({
    indexes: piece.indexes,
    label: piece.names.join(", ")
  }));
}

function dayTitle(d, special) {
  return special
    ? `${d.label}, ${d.sub} · ${special.name}`
    : `${d.label}, ${d.sub}`;
}

/** What a special day with no time blocks yet says in place of its grid. */
export function noScheduleYet(name) {
  return `${name} has no schedule yet.`;
}

/**
 * One day's pages: its groups (or those given, by position) a page at a time. head: put before
 * the day's title (a division's name).
 */
function dayPagesOf(view, dayIndex, t, places, keep = null, head = null) {
  const d = days(view)[dayIndex];
  const shown = view.days[dayIndex];
  const title = (more) =>
    [head, dayTitle(d, shown.special), more].filter(Boolean).join(" · ");
  const key = `day-${d.key}${head ? `-${head}` : ""}`;
  if (shown.problem) {
    return [{ key, title: title(), table: null, notes: null, empty: null }];
  }
  if (shown.special && !shown.blocks.length) {
    return [
      {
        key,
        title: title(),
        table: null,
        notes: shown.special.notes,
        empty: noScheduleYet(shown.special.name)
      }
    ];
  }
  const indexes = keep
    ? shown.groups.map((grp, i) => (keep(grp) ? i : -1)).filter((i) => i >= 0)
    : shown.groups.map((grp, i) => i);
  const day = withGroups(shown, indexes);
  const pieces = dayPieces(day, places);
  return pieces.map((piece, n) => {
    const one = { ...view, days: [withGroups(day, piece.indexes)] };
    return {
      key: pieces.length > 1 ? `${key}-${n}` : key,
      title: title(piece.label),
      table: printTable(dailyGrid(one, 0, t)),
      // A special day's notes under its last page.
      notes:
        shown.special && n === pieces.length - 1 ? shown.special.notes : null,
      empty: null
    };
  });
}

function eventPages(view, t) {
  return eventPlans(view).map((event) => ({
    key: `event-${event.eventId}`,
    title: `${event.name} (${t.s("SpecialEvent")})`,
    table: printTable(dailyGrid({ days: [event.plan] }, 0, t)),
    notes: null,
    empty: null
  }));
}

/** The keys a choice covers: the one chosen, or every option of its kind. */
function chosenKeys(choices, choice) {
  const kind = choices.find((k) => k.kind === choice.kind);
  if (!kind) return [];
  const keys = kind.options.map((o) => o.key).filter((key) => key !== EVERY);
  if (choice.key === EVERY) return keys;
  return keys.includes(choice.key) ? [choice.key] : [];
}

function optionLabel(choices, kind, key) {
  const found = choices.find((k) => k.kind === kind);
  const option = found && found.options.find((o) => o.key === key);
  return option ? option.label : "";
}

/**
 * The printout for a choice: [{ key, title, table | null, notes, empty }], as c-shoresh-schedule-
 * print draws them. The week: every day, a page per day split as dayPieces, then each special
 * event's own schedule. A day: that day for the whole camp. A group: its week. An activity or a
 * location: where and when it runs. A division: a page per day with only its groups.
 */
export function pagesFor(view, choice, catalogue, setup, t) {
  const choices = printChoices(view, catalogue, setup, t);
  if (!choices.length) return [];
  const places = campPlaces(setup);
  const allDays = days(view).map((d) => d.index);
  switch (choice.kind) {
    case "week":
      return [
        ...allDays.flatMap((i) => dayPagesOf(view, i, t, places)),
        ...eventPages(view, t)
      ];
    case "day":
      return chosenKeys(choices, choice).flatMap((key) =>
        dayPagesOf(view, Number(key), t, places)
      );
    case "group":
      return chosenKeys(choices, choice).map((key) => ({
        key: `group-${key}`,
        title: optionLabel(choices, "group", key),
        table: printTable(groupGrid(view, key, t))
      }));
    case "activity":
      return chosenKeys(choices, choice).map((key) => ({
        key: `activity-${key}`,
        title: optionLabel(choices, "activity", key),
        table: printTable(activityGrid(view, key, t))
      }));
    case "location":
      return chosenKeys(choices, choice).map((key) => ({
        key: `location-${key}`,
        title: optionLabel(choices, "location", key),
        table: printTable(locationGrid(view, atLocation(places, key), t))
      }));
    case "division":
      return chosenKeys(choices, choice).flatMap((key) => {
        const name = optionLabel(choices, "division", key);
        const keep = (grp) => {
          const division = places.divisionOf.get(grp.id);
          return !!division && division.id === key;
        };
        return allDays.flatMap((i) =>
          dayPagesOf(view, i, t, places, keep, name)
        );
      });
    default:
      return [];
  }
}

// ---------- Excel ----------

/**
 * A grid as sheet rows: the corner and its columns, then a row per time block with what is in
 * each column there; a cell running several blocks is written in each, as the desktop writes a
 * slot per block. An elective set lists its offerings (ELECT-6.3).
 */
function gridSheetRows(grid, corner, offerings) {
  const at = new Map();
  grid.cells.forEach((cell) => {
    for (let r = cell.row; r < cell.row + cell.length; r++) {
      at.set(`${r}:${cell.column}`, cell);
    }
  });
  const text = (cell) => {
    if (!cell || cell.open) return "";
    if (cell.names) return cell.names.map((n) => n.name).join(", ");
    const setId = cell.electiveKey ? cell.electiveKey.slice(2) : null;
    const names = setId && !cell.gone ? offerings.get(setId) || [] : [];
    const name = withRemoved(cell.text, cell.gone);
    return names.length ? `${cell.text} (${names.join(", ")})` : name;
  };
  return [
    [
      corner,
      ...grid.columns.map((col) =>
        [col.label, col.sub, col.note].filter(Boolean).join(" ")
      )
    ],
    ...grid.rows.map((row, r) => [
      withRemoved(row.said || row.time, row.gone),
      ...grid.columns.map((col, c) => text(at.get(`${r}:${c}`)))
    ])
  ];
}

function sheet(name, grid, corner, offerings) {
  if (!grid) {
    return { name, rows: [[CANT_BE_SHOWN]], widths: [22] };
  }
  return {
    name,
    rows: gridSheetRows(grid, corner, offerings).map((row) =>
      row.map(sanitizeCell)
    ),
    widths: [22, ...grid.columns.map(() => 16)]
  };
}

/** Sheet names, each used once (the workbook refuses two of the same name). */
function oneEach(sheets) {
  const seen = new Set();
  return sheets.map((s) => {
    let name = s.name;
    let n = 2;
    while (seen.has(name.toLowerCase())) {
      name = `${s.name} ${n}`;
      n += 1;
    }
    seen.add(name.toLowerCase());
    return { ...s, name };
  });
}

/**
 * The Excel file for a choice other than the whole week (which is scheduleSheets): a sheet per
 * day, group, activity or location chosen; a division's is a sheet per day with only its groups.
 * A day's sheet holds the whole camp (a sheet has no pages to split). offerings: each elective
 * set's offerings' names, by set Id.
 */
export function sheetsFor(view, choice, catalogue, setup, t, offerings) {
  const choices = printChoices(view, catalogue, setup, t);
  if (!choices.length) return [];
  const places = campPlaces(setup);
  const corner = t.s("TimeBlock");
  const said = days(view);
  const daySheet = (i, name, keep) => {
    const shown = view.days[i];
    if (shown.problem) return sheet(name, null, corner, offerings);
    const indexes = shown.groups
      .map((grp, g) => (!keep || keep(grp) ? g : -1))
      .filter((g) => g >= 0);
    const one = { ...view, days: [withGroups(shown, indexes)] };
    return sheet(name, dailyGrid(one, 0, t), corner, offerings);
  };
  let sheets;
  switch (choice.kind) {
    case "day":
      sheets = chosenKeys(choices, choice).map((key) =>
        daySheet(Number(key), said[Number(key)].label)
      );
      break;
    case "group":
      sheets = chosenKeys(choices, choice).map((key) =>
        sheet(
          optionLabel(choices, "group", key),
          groupGrid(view, key, t),
          corner,
          offerings
        )
      );
      break;
    case "activity":
      sheets = chosenKeys(choices, choice).map((key) =>
        sheet(
          optionLabel(choices, "activity", key),
          activityGrid(view, key, t),
          corner,
          offerings
        )
      );
      break;
    case "location":
      sheets = chosenKeys(choices, choice).map((key) =>
        sheet(
          optionLabel(choices, "location", key),
          locationGrid(view, atLocation(places, key), t),
          corner,
          offerings
        )
      );
      break;
    case "division":
      sheets = chosenKeys(choices, choice).flatMap((key) => {
        const name = optionLabel(choices, "division", key);
        const keep = (grp) => {
          const division = places.divisionOf.get(grp.id);
          return !!division && division.id === key;
        };
        return said.map((d) => daySheet(d.index, `${name} ${d.label}`, keep));
      });
      break;
    default:
      sheets = [];
  }
  return oneEach(sheets);
}
