/*
 * Import camp workbook (slice 4c part D): every sheet of the workbook Roots downloads, read in one
 * go and saved at once (Greg, Q3: to rebuild a camp, often in a fresh season). Nothing is deleted
 * that the workbook leaves out.
 *
 * - Sheets are found by what they hold, never by their names (a camp word can make "Weeks (2)").
 * - Camp words first (the other sheets' headings are in them), then weeks, then each list in the
 *   order they depend on each other. Each list is read as its screen's import reads it, against
 *   the season as the sheets before it would leave it, so nothing is added or asked twice.
 * - Then "Runs in": the weeks each item runs, as the screens' ticks.
 *
 * Pure JavaScript: Roots shows the proposal, and sends workbookPlan's request to
 * ImportController.saveWorkbook.
 */
import { CHILDREN, FIELD, localName } from "c/shoreshSchema";
import { buildTerms } from "c/shoreshTerms";
import {
  LEAVE_OUT,
  WEEKDAYS,
  foldName,
  looseKey,
  tidy,
  weeksToFill
} from "c/shoreshImportEngine";
import { NONE, readCell, unescapeCell } from "./cells";
import { headingRowIndex, mapHeadings } from "./headings";
import { CHANGE, KEEP, listProposal } from "./proposal";
import { listPlan, questionCards, waitingFor } from "./plan";
import { LIST_SCREENS, listScreen } from "./screens";

/** The lists, in the order they depend on each other. */
export const WORKBOOK_LISTS = [
  "programs",
  "divisions",
  "groups",
  "timeBlocks",
  "locationTypes",
  "locations",
  "activities",
  "fixedActivities",
  "recurringActivities"
];

const MS = 60000;
const RUNS_IN_KINDS = [
  "Group",
  "Location",
  "Activity",
  "FixedActivity",
  "RecurringActivity"
];
// Weeks, seasons, and weeks off (a week exception names its week and one item, by kind).
const WEEK = FIELD.Week;
const SEASON = FIELD.Season;
const OFF = FIELD.WeekException;
const TARGET_FIELD = {
  Group: OFF.Group,
  Location: OFF.Location,
  Activity: OFF.Activity,
  FixedActivity: OFF.FixedActivity,
  RecurringActivity: OFF.RecurringActivity
};

function cells(sheet) {
  const rows = (sheet && sheet.rows) || [];
  const at = headingRowIndex(rows);
  return at < 0
    ? { headings: [], body: [], at }
    : {
        headings: rows[at].map((h) => tidy(unescapeCell(h))),
        body: rows.slice(at + 1),
        at
      };
}

function filled(headings) {
  return headings.filter((h) => h);
}

function wordsOf(t, term) {
  const shown = buildTerms([]);
  return new Set(
    [t.s(term), t.p(term), shown.s(term), shown.p(term)].map(foldName)
  );
}

// ---------------------------------------------------------------------------------------------
// Which sheet holds what.

/**
 * Each sheet's part, by its headings alone: { campWords, weeks, runsIn, lists: { key: name } }.
 * The four extra sheets have headings no list has; each list then takes the sheet its headings
 * fit best (most headings matched, fewest unknown), one sheet per list, in the workbook's order
 * when two fit equally.
 */
export function findSheets(file, t) {
  const sheets = (file.sheets || []).filter((s) => cells(s).at >= 0);
  const found = { lists: {}, unused: [] };
  const taken = new Set();
  const take = (part, sheet) => {
    found[part] = sheet.name;
    taken.add(sheet.name);
  };
  sheets.forEach((sheet) => {
    const h = filled(cells(sheet).headings).map(foldName);
    if (
      h[0] === foldName("Shoresh word") &&
      h.includes(foldName("Camp word"))
    ) {
      if (!found.campWords) take("campWords", sheet);
    } else if (
      h[0] === foldName("Kind") &&
      h[3] === foldName("Name") &&
      !found.runsIn
    ) {
      take("runsIn", sheet);
    }
  });
  sheets
    .filter((s) => !taken.has(s.name))
    .forEach((sheet) => {
      const h = filled(cells(sheet).headings).map(foldName);
      if (
        !found.weeks &&
        h.length === 3 &&
        wordsOf(t, "Week").has(h[0]) &&
        ["start", "startdate"].includes(h[1]) &&
        ["end", "enddate"].includes(h[2])
      ) {
        take("weeks", sheet);
      }
    });
  const fits = [];
  sheets
    .filter((s) => !taken.has(s.name))
    .forEach((sheet, order) => {
      const { headings } = cells(sheet);
      WORKBOOK_LISTS.forEach((key, rank) => {
        const screen = listScreen(key, t);
        const mapping = mapHeadings(headings, screen, {});
        if (mapping.missing.length || mapping.doubled.length) {
          return;
        }
        // Location types: a sheet of one column, its heading the camp's word for them.
        if (key === "locationTypes" && filled(headings).length !== 1) {
          return;
        }
        const matched = mapping.headings.filter((x) => x.column).length;
        const unknown = mapping.headings.length - matched;
        fits.push({
          sheet: sheet.name,
          key,
          score: matched - unknown,
          order,
          rank
        });
      });
    });
  const why = new Map();
  const doubled = new Set();
  fits
    .sort((a, b) => b.score - a.score || a.order - b.order || a.rank - b.rank)
    .forEach((fit) => {
      if (
        taken.has(fit.sheet) ||
        found.lists[fit.key] ||
        doubled.has(fit.key)
      ) {
        return;
      }
      // Two sheets fitting one list as well as each other (a copy kept beside it): neither is
      // read, and both are said, never one picked by where it sits in the workbook.
      const twins = fits.filter(
        (f) => f.key === fit.key && f.score === fit.score && !taken.has(f.sheet)
      );
      if (twins.length > 1) {
        doubled.add(fit.key);
        twins.forEach((f) => {
          why.set(
            f.sheet,
            `${twins.map((x) => `“${x.sheet}”`).join(" and ")} could both be ${labelOf(f.key, t)}`
          );
        });
        return;
      }
      found.lists[fit.key] = fit.sheet;
      taken.add(fit.sheet);
    });
  found.unused = sheets
    .map((s) => s.name)
    .filter((n) => !taken.has(n))
    .map((name) => ({ name, why: why.get(name) || "" }));
  return found;
}

// ---------------------------------------------------------------------------------------------
// Camp words.

/** A difference the director keeps or changes: { id, heading, from, to, answer }. */
function difference(id, heading, from, to, answers) {
  return { id, heading, from, to, answer: answers[id] || null };
}

/**
 * The camp's words the workbook gives, set against the camp's. Returns { rows, labels (the
 * camp's labels with the workbook's words, for reading the other sheets), changes }.
 */
function readCampWords(sheet, labels, answers) {
  const result = { rows: [], labels: labels.map((l) => ({ ...l })) };
  if (!sheet) {
    return result;
  }
  const { body, at } = cells(sheet);
  const seen = new Set();
  body.forEach((row, i) => {
    const [word, singular, plural] = row.map((c) => tidy(unescapeCell(c)));
    if (!word && !singular && !plural) {
      return;
    }
    const entry = {
      rowNumber: at + i + 2,
      name: word,
      problems: [],
      differences: []
    };
    result.rows.push(entry);
    const label = result.labels.find(
      (l) =>
        foldName(l.modelSingular || "") === foldName(word) ||
        foldName(l.term || "") === foldName(word)
    );
    if (!label) {
      entry.problems.push(`"${word}" isn't a Shoresh word`);
      return;
    }
    if (!singular || !plural) {
      entry.problems.push("A camp word is blank");
      return;
    }
    if (seen.has(label.term)) {
      entry.problems.push(`${label.modelSingular} is given twice`);
      return;
    }
    seen.add(label.term);
    entry.term = label.term;
    const original = labels.find((l) => l.term === label.term);
    if (original.singular === singular && original.plural === plural) {
      entry.status = "unchanged";
      return;
    }
    entry.status = "changed";
    entry.differences.push(
      difference(
        `change|campWords|${label.term}|${singular}|${plural}`,
        "Camp word",
        `${original.singular} / ${original.plural}`,
        `${singular} / ${plural}`,
        answers
      )
    );
    entry.fields = {
      [FIELD.CampLabel.Singular]: singular,
      [FIELD.CampLabel.Plural]: plural
    };
    // The other sheets were written in the workbook's words.
    label.singular = singular;
    label.plural = plural;
    label.isCustom = true;
  });
  return result;
}

// ---------------------------------------------------------------------------------------------
// Weeks.

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec"
];

function iso(y, m, d) {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date as a cell gives it: "2027-06-28", "Jun 28, 2027", "28-Jun-27", or numbers in the
 * column's order. order: "md" or "dm" when the column shows it, else null: "7/5/2027" is then
 * read two ways and can't be read (never guessed).
 */
function readDate(text, order) {
  const t = tidy(text);
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    return { value: iso(+m[1], +m[2], +m[3]) };
  }
  m =
    t.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})\.?[-\s,]+(\d{2,4})$/) ||
    t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m) {
    const [day, name] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const month = MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
    return month ? { value: iso(+m[3], month, +day) } : { value: null };
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    const fixed = a > 12 ? "dm" : b > 12 ? "md" : null;
    const use = fixed || order || (a === b ? "md" : null);
    if (!use) {
      return { twoWays: true };
    }
    return { value: use === "md" ? iso(y, a, b) : iso(y, b, a), order: fixed };
  }
  return { value: null };
}

/** Day and month order a column shows: one cell that can only be read one way settles it. */
function columnOrder(texts) {
  const orders = new Set(
    texts.map((x) => readDate(x, null).order).filter((o) => o)
  );
  return orders.size === 1 ? [...orders][0] : null;
}

/** "Jul 3 2027"; "none" for a date not set (a week set up with no end). */
function shortDate(isoDate) {
  if (!isoDate) {
    return "none";
  }
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} ${d} ${y}`;
}

/** A Runs in column of a week left out: its ticks are not read. */
export const SKIP_WEEK = "skip";

function bySeasonOrder(weeks) {
  return [...(weeks || [])].sort(
    (a, b) =>
      String(a[WEEK.StartDate]).localeCompare(String(b[WEEK.StartDate])) ||
      (a[WEEK.SortOrder] || 0) - (b[WEEK.SortOrder] || 0) ||
      String(a.Id).localeCompare(String(b.Id))
  );
}

/**
 * Which week of the season each of the workbook's weeks is (Greg, 2026-10-17):
 * - a workbook from this season (a week starting within the season's dates): by start date (a
 *   season can't have two weeks starting the same day); one starting a day nothing set up starts
 *   is a week to add;
 * - a workbook from another season (no week starting within them): by order, as opening a new
 *   season copies weeks ("you'd copy the weeks but need to update the dates"): its first week
 *   is the season's first, and so on, the season keeping its own dates. A workbook week past
 *   the season's last is left out; a season week past the workbook's is left as it is.
 *   A this-season workbook's week starting outside the season's dates is left out too.
 * Returns { byOrder, pairs: [{ row, week (set up) | null, leftOut ("noneLeft", "outside", or null) }] }.
 * byOrder, when given, is the way already decided for the whole sheet (weeksByOrder).
 */
export function matchWeeks(fileWeeks, setupWeeks, season, decided) {
  const inSeason = seasonHas(season);
  const byOrder =
    decided === undefined ? weeksByOrder(fileWeeks, season) : decided;
  if (byOrder) {
    const ordered = bySeasonOrder(setupWeeks);
    const rows = [...fileWeeks].sort((a, b) => a.start.localeCompare(b.start));
    return {
      byOrder,
      pairs: rows.map((row, i) => ({
        row,
        week: ordered[i] || null,
        leftOut: ordered[i] ? null : "noneLeft"
      }))
    };
  }
  const byStart = new Map(
    (setupWeeks || []).map((w) => [w[WEEK.StartDate], w])
  );
  return {
    byOrder,
    // Some weeks inside the season's dates and some not (coordinator): those outside are left
    // out and said, never added to this season or dropped quietly.
    pairs: fileWeeks.map((row) => ({
      row,
      week: byStart.get(row.start) || null,
      leftOut:
        !byStart.has(row.start) && !inSeason(row.start) ? "outside" : null
    }))
  };
}

function seasonHas(season) {
  const from = (season && season[SEASON.StartDate]) || null;
  const to = (season && season[SEASON.EndDate]) || null;
  return (start) => (!from || start >= from) && (!to || start <= to);
}

/** Another season's workbook (no week starting within this season's dates): paired by order. */
export function weeksByOrder(fileWeeks, season) {
  const dated = !!(
    season &&
    (season[SEASON.StartDate] || season[SEASON.EndDate])
  );
  const inSeason = seasonHas(season);
  return (
    dated && fileWeeks.length > 0 && !fileWeeks.some((r) => inSeason(r.start))
  );
}

/** Why a week is left out, in the camp's words. */
function leftOutReason(why, t) {
  return why === "noneLeft"
    ? `no ${t.sIn("Week")} of this ${t.sIn("Season")} left for it`
    : `starts outside this ${t.sIn("Season")}'s dates`;
}

/**
 * By start date, a week the workbook adds, or gives a new end, must not overlap another of the
 * season's weeks as they would be after the import: that row is said, never added on top.
 */
function sayOverlaps(pairs, setupWeeks) {
  const matchedIds = new Set(pairs.map((p) => p.week && p.week.Id));
  const after = [
    ...pairs
      .filter((p) => !p.leftOut)
      .map((p) => ({
        row: p.row,
        // Only a week added, or given a new end, is the workbook's to say.
        moves: !p.week || p.week[WEEK.EndDate] !== p.row.end,
        name: p.row.name,
        start: p.row.start,
        end: p.row.end
      })),
    ...(setupWeeks || [])
      .filter((w) => !matchedIds.has(w.Id))
      .map((w) => ({
        name: w.Name,
        start: w[WEEK.StartDate],
        end: w[WEEK.EndDate] || w[WEEK.StartDate]
      }))
  ];
  after
    .filter((a) => a.moves)
    .forEach((a) => {
      after
        .filter((b) => b !== a && a.start <= b.end && b.start <= a.end)
        .forEach((b) => {
          a.row.problems.push(`Overlaps ${b.name} (${shortDate(b.start)})`);
        });
    });
}

function readWeeks(sheet, setup, answers, t) {
  const result = { rows: [], records: [], refs: new Map() };
  if (!sheet) {
    return result;
  }
  const { body, at } = cells(sheet);
  const texts = body
    .flatMap((r) => [r[1], r[2]].map((c) => tidy(c)))
    .filter((x) => x);
  const order = columnOrder(texts);
  const read = [];
  body.forEach((row, i) => {
    const [name, start, end] = row.map((c) => tidy(unescapeCell(c)));
    if (!name && !start && !end) {
      return;
    }
    const entry = {
      rowNumber: at + i + 2,
      name,
      problems: [],
      differences: []
    };
    result.rows.push(entry);
    if (!name) {
      entry.problems.push("No name");
    }
    const dates = [start, end].map((x, k) => {
      const heading = k ? "End" : "Start";
      if (!x) {
        entry.problems.push(`${heading} is blank`);
        return null;
      }
      const d = readDate(x, order);
      if (d.twoWays) {
        entry.problems.push(`${heading}: "${x}" could be read two ways`);
      } else if (!d.value) {
        entry.problems.push(`${heading}: "${x}" isn't a date`);
      }
      return d.value || null;
    });
    [entry.start, entry.end] = dates;
    if (entry.start && entry.end && entry.end < entry.start) {
      entry.problems.push("End is before Start");
    }
    if (!entry.problems.length) {
      read.push(entry);
    }
  });
  // Date matching or pairing by order is decided once, on every row whose dates can be read,
  // before any row is set aside (an overlap, a twin start), so setting one aside can't flip it.
  const byOrder = weeksByOrder(read, setup.season);
  // Another season's workbook into a season with dates but no weeks yet (coordinator, following
  // Greg's "copy the weeks, update the dates"): its weeks are filled from its dates in the same
  // save, then paired by order.
  const toFill = byOrder ? weeksToFill(setup, t) : [];
  const seasonWeeks = toFill.length ? toFill : setup.weeks || [];
  // A season with only a first or a last day can't tell this season's weeks from another's:
  // every week is left out, saying so, rather than "no week left" or added by mistake.
  const season = setup.season || {};
  const needsDates = !season[SEASON.StartDate] !== !season[SEASON.EndDate];
  // Two weeks starting the same day: both are said, never the first row kept.
  const starts = new Map();
  read.forEach((r) => starts.set(r.start, (starts.get(r.start) || 0) + 1));
  read
    .filter((r) => starts.get(r.start) > 1)
    .forEach((r) => {
      r.problems.push(`Another ${t.sIn("Week")} starts ${shortDate(r.start)}`);
    });
  if (!byOrder && !needsDates) {
    sayOverlaps(
      matchWeeks(
        read.filter((r) => !r.problems.length),
        seasonWeeks,
        setup.season,
        false
      ).pairs,
      seasonWeeks
    );
  }
  // By order, a week that can't be read would move every week after it onto the wrong week of
  // this season: none is paired until each can be read.
  const unreadable = result.rows.filter((r) => r.problems.length);
  const usable = read.filter((r) => !r.problems.length);
  if (unreadable.length && byOrder && !needsDates) {
    usable.forEach((r) => {
      r.problems.push(
        `Matched by order once row ${unreadable.map((u) => u.rowNumber).join(", ")} can be read`
      );
    });
  }
  read.splice(0, read.length, ...read.filter((r) => !r.problems.length));
  const matched = matchWeeks(read, seasonWeeks, setup.season, byOrder);
  result.byOrder = byOrder;
  matched.pairs.forEach(({ row, week, leftOut }) => {
    const named = read.filter((r) => looseKey(r.name) === looseKey(row.name));
    if (leftOut || needsDates) {
      // Another season's week past this season's last: its Runs in ticks aren't read. Its bare
      // name only when no other week has it, so a week read under that name is never skipped.
      row.status = "leftOut";
      row.reason = needsDates
        ? `this ${t.sIn("Season")} needs its first and last day`
        : leftOutReason(leftOut, t);
      result.refs.set(foldName(`${row.name} (${row.start})`), SKIP_WEEK);
      if (named.length === 1) {
        result.refs.set(foldName(row.name), SKIP_WEEK);
      }
      return;
    }
    if (!week) {
      row.status = "new";
      row.ref = `Week:${row.start}`;
      result.records.push({
        kind: "Week",
        key: row.ref,
        fields: {
          Name: row.name,
          [WEEK.StartDate]: row.start,
          [WEEK.EndDate]: row.end
        }
      });
    } else {
      row.ref = week.Id;
      row.week = week;
      if (matched.byOrder) {
        // Shown: "Week 1 (Jun 30 2026) → Week 1 (Jun 28 2027)".
        row.pairing = `${row.name} (${shortDate(row.start)}) → ${week.Name} (${shortDate(week[WEEK.StartDate])})`;
      }
      const changes = [];
      if (row.name !== week.Name) {
        changes.push(["Name", "Name", week.Name, row.name]);
      }
      // By order the season keeps its own dates.
      if (!matched.byOrder && row.end !== week[WEEK.EndDate]) {
        changes.push([
          WEEK.EndDate,
          "End",
          shortDate(week[WEEK.EndDate]),
          shortDate(row.end)
        ]);
      }
      row.status = changes.length ? "changed" : "unchanged";
      row.differences = changes.map(([field, heading, from, to]) => ({
        ...difference(
          // The field's local name: a remembered answer means the same with the namespace.
          `change|weeks|${week.Id}|${localName(field)}|${field === "Name" ? row.name : row.end}`,
          heading,
          from,
          to,
          answers
        ),
        field,
        value: field === "Name" ? row.name : row.end
      }));
      const chosen = row.differences.filter((d) => d.answer === CHANGE);
      if (week.filled) {
        // A week this save fills in takes the workbook's name on Change.
        week.saveName = chosen.length ? row.name : week.Name;
      } else if (chosen.length) {
        result.records.push({
          kind: "Week",
          id: week.Id,
          fields: Object.fromEntries(chosen.map((d) => [d.field, d.value]))
        });
      }
    }
    // A Runs in column is headed by the week's name, or "Name (start date)" when two share it.
    result.refs.set(foldName(`${row.name} (${row.start})`), row.ref);
    if (named.length === 1) {
      result.refs.set(foldName(row.name), row.ref);
    }
  });
  const nameOf = (w) => w.saveName || w.Name;
  if (byOrder && !needsDates) {
    const paired = new Set(matched.pairs.map((p) => p.week && p.week.Id));
    result.lists = [
      ...(toFill.length
        ? [
            {
              key: "filled",
              heading: "Will also add",
              lines: toFill.map((w) => ({
                pairing: `${nameOf(w)} (${shortDate(w[WEEK.StartDate])})`
              }))
            }
          ]
        : []),
      {
        key: "paired",
        heading: "Matched by order",
        lines: matched.pairs.filter((p) => p.week).map((p) => p.row)
      },
      {
        key: "untouched",
        heading: "Not in the workbook",
        lines: bySeasonOrder(setup.weeks)
          .filter((w) => !paired.has(w.Id))
          .map((w) => ({
            pairing: `${w.Name} (${shortDate(w[WEEK.StartDate])})`
          }))
      }
    ];
  }
  // The weeks to fill, as the save makes them (start dates checked again there), and as records
  // for the lists and Runs in read after.
  result.fillWeeks = toFill.map((w) => ({
    start: w[WEEK.StartDate],
    name: nameOf(w)
  }));
  result.fillRecords = toFill.map((w) => ({
    kind: "Week",
    key: w.Id,
    fields: {
      Name: nameOf(w),
      [WEEK.StartDate]: w[WEEK.StartDate],
      [WEEK.EndDate]: w[WEEK.EndDate],
      // The later sheets see the weeks in their places, as the save numbers them.
      [WEEK.SortOrder]: w[WEEK.SortOrder]
    }
  }));
  return result;
}

// ---------------------------------------------------------------------------------------------
// The season as the sheets before would leave it.

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ms(clockText) {
  const [h, m] = String(clockText).split(":").map(Number);
  return (h * 60 + m) * MS;
}

function divisionsOf(setup) {
  return (setup.programs || []).flatMap((e) => e.divisions || []);
}

/** who: the rows' own fields (who can do an activity, or who a recurring activity covers). */
function whoRows(ids, setup, who) {
  const divisions = new Set(divisionsOf(setup).map((d) => d.division.Id));
  return (ids || []).map((id) => {
    return divisions.has(id) ? { [who.Division]: id } : { [who.Group]: id };
  });
}

function fieldsOf(record) {
  const fields = { ...record.fields };
  // A time block's times are written as "HH:mm" and read back as milliseconds.
  [FIELD.TimeBlock.StartTime, FIELD.TimeBlock.EndTime].forEach((f) => {
    if (typeof fields[f] === "string") {
      fields[f] = ms(fields[f]);
    }
  });
  return { ...fields, ...(record.refs || {}) };
}

/** A setup with a list's records saved into it, as the next sheets should see it. */
export function withRecords(setup, records) {
  const s = clone(setup);
  s.programs = s.programs || [];
  const entryOf = (id) => s.programs.find((e) => e.program.Id === id);
  const inPrograms = (list) =>
    s.programs.flatMap((e) => (e[list] || []).map((item) => ({ e, item })));
  const upsert = (list, record, extra = {}) => {
    const id = record.id || record.key;
    const found = list.find((x) => x.Id === id);
    if (found) {
      Object.assign(found, fieldsOf(record), extra);
      return found;
    }
    const added = { Id: id, ...fieldsOf(record), ...extra };
    list.push(added);
    return added;
  };
  records.forEach((record) => {
    const id = record.id || record.key;
    const who = record.who
      ? whoRows(
          record.who,
          s,
          record.kind === "Activity"
            ? FIELD.ActivityEligibility
            : FIELD.Coverage
        )
      : null;
    switch (record.kind) {
      case "Program": {
        const entry = entryOf(id);
        if (entry) {
          Object.assign(entry.program, fieldsOf(record));
        } else {
          s.programs.push({
            program: { Id: id, ...fieldsOf(record) },
            timeBlocks: [],
            divisions: [],
            fixedActivities: [],
            recurringActivities: []
          });
        }
        break;
      }
      case "Division": {
        const found = divisionsOf(s).find((d) => d.division.Id === id);
        if (found) {
          Object.assign(found.division, record.fields);
        } else {
          const entry = entryOf(record.refs[FIELD.Division.Program]);
          if (entry) {
            entry.divisions = entry.divisions || [];
            entry.divisions.push({
              division: { Id: id, ...record.fields },
              groups: []
            });
          }
        }
        break;
      }
      case "Group": {
        const holder = divisionsOf(s).find((d) =>
          (d.groups || []).some((g) => g.Id === id)
        );
        const target = (record.refs || {})[FIELD.Group.Division];
        const into = target
          ? divisionsOf(s).find((d) => d.division.Id === target)
          : holder;
        let group = holder && holder.groups.find((g) => g.Id === id);
        if (group && into && into !== holder) {
          holder.groups = holder.groups.filter((g) => g !== group);
          into.groups.push(group);
        }
        if (group) {
          Object.assign(group, record.fields);
        } else if (into) {
          group = { Id: id, ...record.fields };
          into.groups = into.groups || [];
          into.groups.push(group);
        }
        break;
      }
      case "TimeBlock":
      case "FixedActivity":
      case "RecurringActivity": {
        const list = {
          TimeBlock: "timeBlocks",
          FixedActivity: "fixedActivities",
          RecurringActivity: "recurringActivities"
        }[record.kind];
        const found = inPrograms(list).find(({ item }) => item.Id === id);
        // Only a recurring activity has who it covers.
        const extra = who
          ? { [CHILDREN.RecurringActivity.Coverages]: who }
          : {};
        if (found) {
          Object.assign(found.item, fieldsOf(record), extra);
        } else {
          const entry = entryOf(
            (record.refs || {})[FIELD[record.kind].Program]
          );
          if (entry) {
            entry[list] = entry[list] || [];
            upsert(entry[list], record, extra);
          }
        }
        break;
      }
      case "LocationType":
        s.locationTypes = s.locationTypes || [];
        upsert(s.locationTypes, record);
        break;
      case "Location":
        s.locations = s.locations || [];
        upsert(s.locations, record);
        break;
      case "Activity":
        s.activities = s.activities || [];
        upsert(
          s.activities,
          record,
          who ? { [CHILDREN.Activity.Eligibilities]: who } : {}
        );
        break;
      case "Week":
        s.weeks = s.weeks || [];
        upsert(s.weeks, record);
        break;
      default:
    }
  });
  return s;
}

/**
 * One request from many lists: a record a later list changes that an earlier one adds is
 * folded into the add (it has no Id yet); one added twice is added once.
 */
export function combineRecords(lists) {
  const records = [];
  const byKey = new Map();
  lists.flat().forEach((record) => {
    const key = record.key || (byKey.has(record.id) ? record.id : null);
    const earlier = key && byKey.get(key);
    if (earlier) {
      Object.assign(earlier.fields, record.fields || {});
      earlier.refs = { ...(earlier.refs || {}), ...(record.refs || {}) };
      if (record.who) {
        earlier.who = record.who;
      }
      return;
    }
    const copy = {
      ...record,
      fields: { ...(record.fields || {}) },
      ...(record.refs ? { refs: { ...record.refs } } : {})
    };
    records.push(copy);
    if (record.key) {
      byKey.set(record.key, copy);
    }
  });
  return records;
}

// ---------------------------------------------------------------------------------------------
// Runs in.

function itemsOf(setup) {
  const items = [];
  const push = (kind, item, program = "", division = "") =>
    items.push({ kind, id: item.Id, name: item.Name, program, division });
  (setup.programs || []).forEach((e) => {
    const program = e.program.Name;
    (e.divisions || []).forEach((d) =>
      (d.groups || []).forEach((g) =>
        push("Group", g, program, d.division.Name)
      )
    );
    (e.fixedActivities || []).forEach((f) => push("FixedActivity", f, program));
    (e.recurringActivities || []).forEach((r) =>
      push("RecurringActivity", r, program)
    );
  });
  (setup.locations || []).forEach((l) => push("Location", l));
  (setup.activities || []).forEach((a) => push("Activity", a));
  return items;
}

function findItem(items, kind, program, division, name) {
  const same = (a, b) => looseKey(a) === looseKey(b);
  const candidates = items.filter(
    (it) =>
      it.kind === kind &&
      same(it.name, name) &&
      (kind === "Location" ||
        kind === "Activity" ||
        same(it.program, program)) &&
      (kind !== "Group" || same(it.division, division))
  );
  if (candidates.length > 1) {
    const exact = candidates.filter((it) => tidy(it.name) === tidy(name));
    return exact.length === 1 ? exact[0] : { ambiguous: true };
  }
  return candidates[0] || null;
}

function readRunsIn(sheet, setup, weeks, t, answers) {
  const result = { rows: [], records: [] };
  if (!sheet) {
    return result;
  }
  const { headings, body, at } = cells(sheet);
  const kinds = new Map();
  RUNS_IN_KINDS.forEach((kind) =>
    wordsOf(t, kind).forEach((w) => kinds.set(w, kind))
  );
  const headed = headings
    .slice(4)
    .map((h, i) => ({
      index: i + 4,
      heading: h,
      week: h ? weeks.refs.get(foldName(h)) || null : null
    }))
    // A week left out (another season's, past this season's last): not read.
    .filter((c) => c.week !== SKIP_WEEK);
  // Two columns for one week ("Week 1" and "Week 1 (2027-06-28)"): neither is read, both said.
  const perWeek = new Map();
  headed
    .filter((c) => c.week)
    .forEach((c) => perWeek.set(c.week, [...(perWeek.get(c.week) || []), c]));
  const twins = [...perWeek.values()].filter((list) => list.length > 1);
  const columns = headed.filter(
    (c) => !c.week || perWeek.get(c.week).length === 1
  );
  const unknown = columns.filter((c) => c.heading && !c.week);
  const weekName = new Map(
    weeks.rows.filter((r) => r.ref).map((r) => [r.ref, r.name])
  );
  (setup.weeks || []).forEach((w) => {
    if (!weekName.has(w.Id)) weekName.set(w.Id, w.Name);
  });
  const items = itemsOf(setup);
  const offNow = new Map();
  (setup.weekExceptions || []).forEach((x) => {
    const target = RUNS_IN_KINDS.map((k) => x[TARGET_FIELD[k]]).find((v) => v);
    offNow.set(`${target}|${x[OFF.Week]}`, x);
  });
  // A column whose week isn't in the workbook (or can't be read) is said once; the other
  // columns are still read.
  if (unknown.length || twins.length) {
    result.rows.push({
      rowNumber: at + 1,
      name: "",
      problems: [
        ...unknown.map(
          (c) =>
            `"${c.heading}" isn't a ${t.sIn("Week")} of the workbook that can be read`
        ),
        ...twins.map(
          (list) =>
            `"${list.map((c) => c.heading).join('" and "')}" are the same ${t.sIn("Week")}`
        )
      ],
      differences: []
    });
  }
  const seenItems = new Map();
  body.forEach((row, i) => {
    const [kindWord, program, division, name] = row
      .slice(0, 4)
      .map((c) => tidy(unescapeCell(c)));
    if (!kindWord && !name) {
      return;
    }
    const entry = {
      rowNumber: at + i + 2,
      name,
      problems: [],
      differences: []
    };
    result.rows.push(entry);
    const kind = kinds.get(foldName(kindWord));
    if (!kind) {
      entry.problems.push(`"${kindWord}" isn't a kind of item with weeks`);
      return;
    }
    const item = findItem(items, kind, program, division, name);
    if (!item) {
      entry.problems.push(`No ${t.sIn(kind)} “${name}”`);
      return;
    }
    if (item.ambiguous) {
      entry.problems.push(`Two of “${name}”`);
      return;
    }
    // One item on two rows: the same ticks are one row; different ticks are both said.
    const ticksText = columns
      .filter((c) => c.week)
      .map((c) => tidy(row[c.index]).toLowerCase())
      .join("|");
    const earlier = seenItems.get(item.id);
    if (earlier) {
      if (earlier.ticks === ticksText) {
        entry.status = "leftOut";
        entry.reason = `same as row ${earlier.entry.rowNumber}`;
      } else {
        const both = `Rows ${earlier.entry.rowNumber} and ${entry.rowNumber} differ`;
        entry.problems.push(both);
        if (!earlier.entry.problems.includes(both)) {
          earlier.entry.problems.push(both);
          earlier.entry.differences = [];
          earlier.entry.status = undefined;
          earlier.records.forEach((r) => {
            const at2 = result.records.indexOf(r);
            if (at2 >= 0) {
              result.records.splice(at2, 1);
            }
          });
        }
      }
      return;
    }
    const seen = { ticks: ticksText, entry, records: [] };
    seenItems.set(item.id, seen);
    const off = [];
    const on = [];
    columns
      .filter((c) => c.week)
      .forEach((c) => {
        const read = readCell({ type: "yesNo" }, row[c.index]);
        if (!tidy(row[c.index])) {
          entry.problems.push(`${c.heading} is blank`);
        } else if (read.problem) {
          entry.problems.push(`${c.heading}: ${read.problem}`);
        } else if (read.value) {
          on.push(c);
        } else {
          off.push(c);
        }
      });
    if (entry.problems.length) {
      return;
    }
    const isNew = String(item.id).includes(":");
    const toAdd = off.filter((c) => !offNow.has(`${item.id}|${c.week}`));
    const toRemove = on
      .map((c) => ({ c, x: offNow.get(`${item.id}|${c.week}`) }))
      .filter(({ x }) => x);
    const records = [
      ...toAdd.map((c) => ({
        kind: "WeekException",
        key: `WeekException:${item.id}:${c.week}`,
        fields: {},
        refs: { [OFF.Week]: c.week, [TARGET_FIELD[kind]]: item.id }
      })),
      ...toRemove.map(({ x }) => ({
        kind: "WeekException",
        id: x.Id,
        remove: true,
        fields: {}
      }))
    ];
    if (!records.length) {
      entry.status = "unchanged";
      return;
    }
    seen.records = records;
    if (isNew) {
      // An item this workbook adds runs the weeks it says, as a new row's values (counted with
      // the item, not again).
      entry.status = "new";
      entry.withItem = true;
      result.records.push(...records);
      return;
    }
    entry.status = "changed";
    const text = (list, from, to) =>
      list.map((c) => `${c.heading}: ${from} → ${to}`);
    const ticks = [
      ...text(toAdd, "Yes", "No"),
      ...text(
        toRemove.map(({ c }) => c),
        "No",
        "Yes"
      )
    ];
    const id = `change|runsIn|${item.id}|${off
      .map((c) => c.week)
      .sort()
      .join(",")}`;
    entry.differences.push(
      difference(id, "Runs in", "", ticks.join(", "), answers)
    );
    entry.differences[0].text = `Runs in: ${ticks.join(", ")}`;
    if (answers[id] === CHANGE) {
      result.records.push(...records);
    }
  });
  return result;
}

// ---------------------------------------------------------------------------------------------
// The whole workbook.

function extraSection(key, label, part) {
  part.rows.forEach((r) => {
    if (r.problems.length) {
      r.status = "unreadable";
    }
  });
  return { key, label, extra: true, rows: part.rows, lists: part.lists || [] };
}

/**
 * The workbook set against the season: { sections: [{ key, label, sheet, proposal } or extra
 * { key, label, rows }], unused (sheets nothing reads), cards, labels }. input: { file, setup,
 * terms, labels (the camp's words, every term), answers }.
 */
export function workbookProposal(input) {
  const answers = input.answers || {};
  const found = findSheets(input.file, input.terms);
  const sheetOf = (name) => {
    return name ? input.file.sheets.find((s) => s.name === name) : null;
  };
  const words = readCampWords(
    sheetOf(found.campWords),
    input.labels || [],
    answers
  );
  // Read in the workbook's words; the screens' own headings still count (listScreen).
  const t = buildTerms(words.labels);
  const sheetsFound =
    words.rows.length || found.campWords ? findSheets(input.file, t) : found;
  const weeks = readWeeks(sheetOf(sheetsFound.weeks), input.setup, answers, t);
  let setup = withRecords(input.setup, [
    ...(weeks.fillRecords || []),
    ...weeks.records
  ]);
  const sections = [];
  if (sheetsFound.campWords) {
    sections.push(extraSection("campWords", "Camp words", words));
  }
  if (sheetsFound.weeks) {
    sections.push(extraSection("weeks", t.p("Week"), weeks));
  }
  const lists = [];
  WORKBOOK_LISTS.filter((key) => sheetsFound.lists[key]).forEach((key) => {
    const proposal = listProposal({
      screenKey: key,
      file: input.file,
      sheet: sheetsFound.lists[key],
      setup,
      terms: t,
      answers,
      knownKeys: combineRecords([
        weeks.fillRecords || [],
        weeks.records,
        ...lists.map((l) => l.records)
      ])
        .map((r) => r.key)
        .filter((k) => k)
    });
    const plan =
      proposal.mapping && !proposal.blocked
        ? listPlan(proposal, answers, input.setup.season.Id, input.file.name)
        : { records: [], remember: [], forget: [] };
    lists.push(plan);
    setup = withRecords(setup, plan.records);
    sections.push({
      key,
      label: key === "locationTypes" ? t.p("LocationType") : labelOf(key, t),
      sheet: sheetsFound.lists[key],
      proposal
    });
  });
  const runsIn = readRunsIn(
    sheetOf(sheetsFound.runsIn),
    setup,
    weeks,
    t,
    answers
  );
  if (sheetsFound.runsIn) {
    sections.push(extraSection("runsIn", "Runs in", runsIn));
  }
  return {
    sections,
    unused: sheetsFound.unused,
    terms: t,
    words,
    weeks,
    runsIn,
    lists,
    setup: input.setup,
    fileName: input.file.name
  };
}

function labelOf(key, t) {
  const term = listScreen(key, t).term;
  return t.p(term);
}

/** Every question the workbook asks, list by list. */
export function workbookCards(proposal, answers) {
  return proposal.sections
    .filter((s) => s.proposal && s.proposal.mapping)
    .flatMap((s) => questionCards(s.proposal, proposal.terms, answers));
}

/** Every Keep or Change the workbook asks, list by list. */
export function workbookDifferences(proposal) {
  return proposal.sections.flatMap((s) =>
    (s.extra ? s.rows : s.proposal.rows || []).flatMap((r) => {
      return r.status === "changed" ? r.differences : [];
    })
  );
}

/**
 * What the save waits on, or ["Nothing to change"]: the lists' own (an unknown heading, a
 * question, a difference not yet kept or changed) and the extra sheets' differences.
 */
export function workbookWaiting(proposal, answers) {
  const waiting = [];
  proposal.sections.forEach((s) => {
    if (s.extra) {
      if (
        s.rows.some((r) => (r.differences || []).some((d) => !answers[d.id]))
      ) {
        waiting.push(`${s.label}: Keep or Change`);
      }
      return;
    }
    if (!s.proposal.mapping) {
      return;
    }
    waitingFor(s.proposal, proposal.terms, answers)
      .filter((w) => w !== "Nothing to change")
      .forEach((w) => waiting.push(`${s.label}: ${w}`));
  });
  const plan = workbookPlan(proposal, answers);
  if (
    !waiting.length &&
    !plan.records.length &&
    !plan.campWords.length &&
    !plan.fillWeeks
  ) {
    waiting.push("Nothing to change");
  }
  return waiting;
}

/**
 * The save request: the weeks, every list's records (combined), the weeks items run, and the
 * camp's words; the answers to remember or forget, list by list.
 */
export function workbookPlan(proposal, answers, seasonId) {
  const words = proposal.words.rows
    .filter(
      (r) => r.term && r.differences.some((d) => answers[d.id] === CHANGE)
    )
    .map((r) => ({ kind: "CampLabel", term: r.term, fields: r.fields }));
  const records = combineRecords([
    proposal.weeks.records,
    ...proposal.lists.map((p) => p.records),
    proposal.runsIn.records
  ]);
  return {
    seasonId: seasonId || proposal.setup.season.Id,
    files: proposal.fileName,
    records,
    campWords: words,
    remember: proposal.lists.flatMap((p) => p.remember || []),
    forget: proposal.lists.flatMap((p) => p.forget || []),
    ...((proposal.weeks.fillWeeks || []).length
      ? { fillWeeks: proposal.weeks.fillWeeks }
      : {})
  };
}

export { KEEP, CHANGE, LEAVE_OUT, NONE, WEEKDAYS, LIST_SCREENS };
