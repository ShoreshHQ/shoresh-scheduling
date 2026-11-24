/**
 * Print and Excel by what a director asks for (PUB-6.6 to PUB-6.11; Greg 2026-11-21: "print the
 * whole day. by bunk. by activity. etc. go beyond the desktop"): the whole week, one day for the
 * whole camp, one bunk, one activity, one location or one division, or every one of a kind. The
 * same choices on the Schedules page, Generated Schedule and Manual Build (c/shoreshPrintMenu).
 * Pure: the same week and choice always give the same pages and sheets.
 *
 * A day prints at most PAGE_COLUMNS bunks a page (PUB-6.7): when the camp is wider, its
 * divisions go a page at a time (small ones next to each other share one), and a division wider
 * than a page is split evenly. Each page says which bunks it holds.
 *
 * view: the week as the screen shows it (c/shoreshScheduleViews withSpecials). setup: the season
 * (SeasonSetupController.getSeasonSetup): its divisions and where each thing runs. A choice is
 * { kind, key }: kind "week", "day", "group", "activity", "location" or "division"; key the
 * one chosen, EVERY for every one of the kind (none for the week).
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
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
} from "./engine.shoreshScheduleViews.shoreshScheduleViews.mjs";
import { printTable } from "./engine.shoreshScheduleExport.table.mjs";
import { withRemoved } from "./engine.shoreshScheduleExport.removed.mjs";

export const EVERY = "*";
export const PAGE_COLUMNS = 10;

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
  if (option) return option.label;
  // Every one of a kind the menu offers no "Every" row for (the days; or a kind with one).
  return choice.key === EVERY ? `Every ${kind.label}` : "";
}

/** A day with only some of its groups (by position), for a page or a division. */
export function withGroups(day, indexes) {
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
 * A day's groups as pages (PUB-6.7): all on one page when they fit; else a division at a time,
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
    label: [...new Set(piece.names)].join(", ")
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
  // A division with no group on the day prints nothing for it.
  if (keep && !indexes.length) {
    return [];
  }
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
 * What a choice covers, in order, the same for its printout and its Excel file: days ({ day, the
 * day's position; keep, the groups a division keeps; head, the division's name }), or one thing's
 * week as a grid ({ key, title, grid }). The week and a day: the whole camp's days. A group: its
 * week. An activity or a location: where and when it runs. A division: each day with only its
 * groups. { places, parts }, or null when the week has nothing to choose.
 */
export function chosenParts(view, choice, catalogue, setup, t) {
  const choices = printChoices(view, catalogue, setup, t);
  if (!choices.length) return null;
  const places = campPlaces(setup);
  const allDays = days(view).map((d) => d.index);
  const keys = chosenKeys(choices, choice);
  const grids = (gridOf) =>
    keys.map((key) => ({
      key: `${choice.kind}-${key}`,
      title: optionLabel(choices, choice.kind, key),
      grid: gridOf(key)
    }));
  switch (choice.kind) {
    case "week":
      return { places, parts: allDays.map((day) => ({ day })) };
    case "day":
      return { places, parts: keys.map((key) => ({ day: Number(key) })) };
    case "group":
      return { places, parts: grids((key) => groupGrid(view, key, t)) };
    case "activity":
      return { places, parts: grids((key) => activityGrid(view, key, t)) };
    case "location":
      return {
        places,
        parts: grids((key) => locationGrid(view, atLocation(places, key), t))
      };
    case "division":
      return {
        places,
        parts: keys.flatMap((key) => {
          const head = optionLabel(choices, "division", key);
          const keep = (grp) => {
            const division = places.divisionOf.get(grp.id);
            return !!division && division.id === key;
          };
          return allDays.map((day) => ({ day, keep, head }));
        })
      };
    default:
      return { places, parts: [] };
  }
}

/**
 * The printout for a choice: [{ key, title, table | null, notes, empty }], as c-shoresh-schedule-
 * print draws them: each day chosen a page at a time as dayPieces splits it, each grid a page;
 * the whole week then each special event's own schedule.
 */
export function pagesFor(view, choice, catalogue, setup, t) {
  const chosen = chosenParts(view, choice, catalogue, setup, t);
  if (!chosen) return [];
  const pages = chosen.parts.flatMap((part) => {
    if (part.grid) {
      return [
        { key: part.key, title: part.title, table: printTable(part.grid) }
      ];
    }
    return dayPagesOf(view, part.day, t, chosen.places, part.keep, part.head);
  });
  return choice.kind === "week" ? [...pages, ...eventPages(view, t)] : pages;
}
