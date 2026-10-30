/*
 * Last year's week as a version (Greg, 2026-10-16): for each program and week in the files, a
 * schedule named "Imported from <file name>", one grid per day in the compact grid format v1
 * (repo docs/adr/0005), saved with the setup and never changed by later edits.
 *
 * Each placement goes in the cell of its group and time block: a fixed, recurring, or activity
 * item set up by this import (or already in the camp), an elective set by its record (slice E9),
 * or, for a special day, special event, or trip, the name as it was in the file, marked "not set
 * up yet". Placements
 * that cannot be placed (their group, time block, day, or name left out, a week not in the season, two things in one cell) are listed with the reason, never silently dropped.
 *
 * The grid names records by the keys the save uses (new records) or their Ids (records the camp
 * has); the server puts in the Ids once everything is saved.
 */
import { FIELD } from "c/shoreshSchema";
import { fixedKey } from "./items";
import { LEAVE_OUT } from "./reading";
import { blocksOf } from "./reading-constants";
import { WEEKDAYS, clock, looseKey, tidy } from "./text";
import { labelDates } from "./weekLabels";
import { weeksToFill } from "./weeks";

// Date.getUTCDay's number for each day.
const DAY_NUMBER = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};
const MAX_NAME = 80;
const WEEK = FIELD.Week;

function seasonWeeks(existing) {
  return [...((existing && existing.weeks) || [])].sort((a, b) =>
    String(a[WEEK.StartDate]).localeCompare(String(b[WEEK.StartDate]))
  );
}

/** The date ("YYYY-MM-DD") of a weekday within a week's dates, or null. */
export function dateIn(week, day) {
  const [y, m, d] = String(week[WEEK.StartDate]).split("-").map(Number);
  const end = String(week[WEEK.EndDate]);
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const text = date.toISOString().slice(0, 10);
    if (text > end) {
      return null;
    }
    if (date.getUTCDay() === DAY_NUMBER[day]) {
      return text;
    }
  }
  return null;
}

/** The version's name: "Imported from <file>" (or "<file> and N more"), at most 80 characters. */
export function versionName(fileNames) {
  const names = fileNames || [];
  const more = names.length > 1 ? ` and ${names.length - 1} more` : "";
  const name = `Imported from ${names[0] || "a file"}${more}`;
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

/**
 * "Session 2" as the season's second week, when the season's weeks are numbered ("Week 1",
 * "Week 2", ... one word and a number each, the same word): INGEST-4.5. undefined otherwise.
 */
function nthWeek(weeks, label) {
  const session = /^Session (\d+)$/.exec(label || "");
  const numbered = weeks.map((w) => /^(\D+?)\s*(\d+)$/.exec(tidy(w.Name)));
  if (
    !session ||
    !numbered.length ||
    numbered.some((m) => !m) ||
    new Set(numbered.map((m) => looseKey(m[1]))).size !== 1 ||
    looseKey(numbered[0][1]) === "session"
  ) {
    return undefined;
  }
  const n = Number(session[1]);
  return weeks.find((_, i) => Number(numbered[i][2]) === n);
}

/** The season week whose dates hold a month and day, any year; else undefined. */
function weekOnDate(weeks, date) {
  const at = (iso) => {
    const [, month, day] = String(iso || "")
      .split("-")
      .map(Number);
    return month * 100 + day;
  };
  const wanted = date.month * 100 + date.day;
  return weeks.find(
    (w) => at(w[WEEK.StartDate]) <= wanted && wanted <= at(w[WEEK.EndDate])
  );
}

/**
 * A "Week of" label's season week (INGEST-4.4, 4.7): { week } when its dates land in one season
 * week, with `readAs` (the date it was read as) when a date of numbers only could be read day
 * first too and only that reading lands; { split } when both land in different weeks (asked);
 * null when none lands.
 */
function datedWeek(weeks, label) {
  const dates = labelDates(label);
  const landed = dates
    .map((date) => ({ date, week: weekOnDate(weeks, date) }))
    .filter((x) => x.week);
  const distinct = [...new Set(landed.map((x) => x.week))];
  if (distinct.length > 1) {
    return { split: true };
  }
  if (!distinct.length) {
    return null;
  }
  return {
    week: distinct[0],
    readAs: dates.length > 1 ? landed[0].date : null
  };
}

const MONTH_NAMES =
  "January February March April May June July August September October November December".split(
    " "
  );

/** The week a label goes to without asking, and the note it gives (or null). */
function sureWeek(weeks, label) {
  const byName = weeks.find((w) => looseKey(w.Name) === looseKey(label));
  if (byName) {
    return { week: byName };
  }
  const dated = datedWeek(weeks, label);
  if (dated && dated.split) {
    return null;
  }
  if (dated) {
    const note = dated.readAs && {
      type: "dateOrder",
      label,
      week: dated.week.Name,
      date: `${MONTH_NAMES[dated.readAs.month - 1]} ${dated.readAs.day}`
    };
    return { week: dated.week, note };
  }
  const bySession = nthWeek(weeks, label);
  return bySession
    ? {
        week: bySession,
        note: { type: "sessionWeek", label, week: bySession.Name }
      }
    : null;
}

/**
 * The season week each week of the files goes to: sure when the files and the season name the
 * same week ("Week 2"), a date in one of its weeks ("Week of 7/6", INGEST-4.4 and 4.7), a
 * session of numbered weeks (INGEST-4.5), or both have just one; otherwise asked (by the week's
 * name, never its record Id). Returns Map(label -> week record, or null for none), the
 * questions, and the notes of what was read without asking.
 */
function mapWeeks(labels, weeks, answers) {
  const result = new Map();
  const asks = [];
  const notes = [];
  for (const label of labels) {
    const sure = label && weeks.length ? sureWeek(weeks, label) : null;
    if (weeks.length === 0) {
      result.set(label, null);
    } else if (sure) {
      result.set(label, sure.week);
      if (sure.note) {
        notes.push(sure.note);
      }
    } else if (weeks.length === 1 && labels.length === 1) {
      result.set(label, weeks[0]);
    } else {
      const id = `week|${label || "the file's week"}`;
      asks.push({
        id,
        type: "week",
        label,
        options: weeks.map((w) => w.Name),
        starts: weeks.map((w) => w[WEEK.StartDate])
      });
      const answer = answers[id];
      result.set(
        label,
        answer === LEAVE_OUT
          ? null
          : weeks.find((w) => w.Name === answer) || null
      );
    }
  }
  return { byLabel: result, asks, notes };
}

// ---------- what goes in a cell ----------

class Items {
  constructor() {
    this.list = [];
    this.numbers = new Map();
  }

  /** The item's number in the day's list (from 1), adding it the first time. */
  number(kind, key, name) {
    const id = `${kind}|${key}|${name}`;
    if (!this.numbers.has(id)) {
      this.list.push([kind, key, name]);
      this.numbers.set(id, this.list.length);
    }
    return String(this.numbers.get(id));
  }
}

function itemKeyFinder(proposal) {
  const camp = proposal.camp;
  const decisions = new Map(
    proposal.decisions.map((d) => [`${d.timetable.index}|${d.name}`, d])
  );
  const recurring = [...proposal.recurring];
  const electives = proposal.electives.texts;
  return (p, t) => {
    // An elective set by its record (slice E9); one deleted before, or a list not answered, is not
    // placed.
    const elective = electives.get(p.text);
    if (elective) {
      if (elective.set) {
        return { kind: "E", key: elective.set.key, name: elective.set.name };
      }
      return elective.deleted ? { deleted: true } : null;
    }
    const noted = proposal.notedKinds.get(p.text);
    if (noted) {
      return { kind: noted, key: "" };
    }
    const d = decisions.get(`${t.index}|${p.text}`);
    if (!d || d.leftOut) {
      return d && d.deleted ? { deleted: true } : null;
    }
    const programId = t.program ? t.program.id : null;
    if (d.kind === "activity") {
      const existing = camp.activities.get(p.text);
      return { kind: "A", key: existing ? existing.Id : `A|${p.text}` };
    }
    if (d.kind === "fixed") {
      const existing = camp.fixed.get(`${programId}|${p.text}`);
      return {
        kind: "F",
        key: existing
          ? existing.Id
          : fixedKey(t, p.text, d.patterns.length > 1 ? p.blockIndex : null)
      };
    }
    const existing = camp.recurring.get(`${programId}|${p.text}`);
    if (existing) {
      return { kind: "R", key: existing.Id };
    }
    const mine = recurring.filter(
      (r) => r.timetable === t && r.name === p.text
    );
    const fits = mine.find(
      (r) =>
        r.block === p.blockIndex &&
        r.length === p.span &&
        r.days.includes(p.day) &&
        r.groups.includes(p.group)
    );
    return { kind: "R", key: (fits || mine[0]).key };
  };
}

// ---------- one day ----------

/**
 * One day's grid. A regular day has the program's blocks (not a special day's own); a special
 * day (`own`, INGEST-4.3) has the blocks its cells use, with ids of its own ("b1", ADR 0014).
 */
function dayGrid(t, groups, placements, context, own) {
  return gridOf([{ t, groups, placements }], context, own);
}

/**
 * The grid of one day for one program's groups, or (a special day, INGEST-4.11) for several
 * programs' together: the blocks each part's cells use, in time order, and every part's groups.
 */
function gridOf(parts, context, own) {
  const blocks = parts
    .flatMap(({ t, placements }, part) => {
      const used = new Set(placements.flatMap((p) => blocksOf(p)));
      return t.blocks
        .map((b, index) => ({ ...b, index, part, t }))
        .filter((b) => !b.leftOut && !b.untimed)
        .filter((b) => (own ? used.has(b.index) : !b.ownDay));
    })
    .sort((a, b) => (parts.length > 1 ? a.start - b.start : 0));
  // Two programs' blocks at the same times (a Dinner for everyone) are one column of the day.
  const shared = new Map();
  const kept = [];
  const column = new Map();
  for (const b of blocks) {
    const at =
      parts.length > 1 ? `${b.start}-${b.end}` : `${b.part}|${b.index}`;
    if (!shared.has(at)) {
      shared.set(at, kept.length);
      kept.push(b);
    }
    column.set(`${b.part}|${b.index}`, shared.get(at));
  }
  blocks.length = 0;
  blocks.push(...kept);
  const groups = parts.flatMap((x) => x.groups);
  const rows = groups.map(() => blocks.map(() => ""));
  const items = new Items();
  const placed = parts.flatMap(({ t, placements }, part) =>
    placements.map((p) => ({ p, t, part }))
  );
  for (const { p, t, part } of placed) {
    const g = groups.findIndex(
      (x) => x.name === p.group && x.timetable === t.index
    );
    const item = context.itemOf(p, t);
    const start = column.get(`${part}|${p.blockIndex}`);
    if (!item || item.deleted) {
      context.unmatched.push({ ...p, why: item ? "deleted" : "leftOut" });
    } else if (g < 0) {
      context.unmatched.push({ ...p, why: "groupLeftOut" });
    } else if (start === undefined || rows[g][start] !== "") {
      context.unmatched.push({ ...p, why: "twoAtOnce" });
    } else {
      const number = items.number(item.kind, item.key, item.name || p.text);
      rows[g][start] = number;
      for (const b of blocksOf(p)
        .slice(1)
        .filter((x) => column.has(`${part}|${x}`))) {
        const c = column.get(`${part}|${b}`);
        if (rows[g][c] === "") {
          // An elective set holds each time block on its own (ADR 0018 choice 21), so a double
          // period is the set in both blocks, not one cell carried on.
          rows[g][c] = item.kind === "E" ? number : "^";
        }
      }
    }
  }
  return {
    b: blocks.map((b, i) => [
      own ? `b${i + 1}` : b.id || `B|${b.t.key}|${b.fileKey}`,
      b.name,
      clock(b.change ? b.change.start : b.start),
      clock(b.change ? b.change.end : b.end)
    ]),
    g: groups.map((x) => [x.key, x.name]),
    i: items.list,
    r: rows.map((r) => r.join(","))
  };
}

function versionFor(t, week, label, context) {
  const groups = context.groups
    .filter((g) => g.timetable === t.index && !g.leftOut)
    .sort((a, b) => a.order - b.order);
  const here = context.usable.filter(
    (p) => p.timetable === t.index && p.week === label
  );
  const days = [];
  for (const day of WEEKDAYS.filter((d) => t.days.includes(d))) {
    const onDay = here.filter((p) => p.day === day);
    const date = dateIn(week, day);
    const own = date && ownDayOf(t, label, day);
    const taken = own && takenBy(context, week, day);
    const joins =
      date &&
      !own &&
      !takenBy(context, week, day) &&
      context.ownerOf(label, day);
    if (joins) {
      // INGEST-4.11: another program's day of its own replaces the day for the whole camp, so
      // this program's groups are in that special day, on their own blocks, not on a regular day.
      context.joining.push({
        at: `${joins.index}|${label}|${day}`,
        t,
        groups,
        placements: onDay
      });
    } else if (own && own.leftOut) {
      onDay.forEach((p) =>
        context.unmatched.push({ ...p, why: "ownDayLeftOut" })
      );
    } else if (taken) {
      // The director's special day on that day wins (INGEST-4.6): the file's day is left out.
      context.notes.push({
        type: "specialDayTaken",
        week: week.Name,
        day,
        name: taken
      });
      onDay.forEach((p) =>
        context.unmatched.push({ ...p, why: "specialDayTaken" })
      );
    } else if (own) {
      context.specialDays.push(
        specialDayFor(t, week, day, label, {
          parts: [{ t, groups, placements: onDay }],
          at: `${t.index}|${label}|${day}`,
          program: t.name,
          cells: onDay,
          every: !!own.every
        })
      );
    } else if (!date) {
      onDay.forEach((p) =>
        context.unmatched.push({ ...p, why: "dayNotInWeek" })
      );
    } else {
      days.push({ date, grid: dayGrid(t, groups, onDay, context) });
    }
  }
  // In date order: a week that starts on Sunday has its Sunday first.
  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    key: `${t.key}|${week.Id}`,
    programKey: t.key,
    programName: t.name,
    // A week this import adds (the season had none) is named by its key, the rest by Id.
    weekId: week.filled ? null : week.Id,
    weekKey: week.filled ? week.Id : null,
    weekName: week.Name,
    name: context.name,
    days
  };
}

/**
 * INGEST-4.9: two programs' own days on the same week's day: a day holds one special day, so
 * which one is asked; until answered (or left out) neither is made, never two.
 */
function oneSpecialDayADay(context, answers) {
  const byDay = new Map();
  for (const d of context.specialDays) {
    const at = `${d.weekId || d.weekKey}|${d.day}`;
    byDay.set(at, [...(byDay.get(at) || []), d]);
  }
  const kept = [];
  for (const list of byDay.values()) {
    if (list.length === 1) {
      kept.push(list[0]);
      continue;
    }
    const { weekName, day } = list[0];
    const id = `specialDayClash|${weekName}|${day}`;
    context.asks.push({
      id,
      type: "specialDayClash",
      week: weekName,
      day,
      options: list.map((d) => d.program)
    });
    const chosen = list.find((d) => d.program === answers[id]);
    if (chosen) {
      kept.push(chosen);
    }
    list
      .filter((d) => d !== chosen)
      .forEach((d) =>
        d.cells.forEach((p) =>
          context.unmatched.push({ ...p, why: "specialDayClash" })
        )
      );
  }
  return kept;
}

/**
 * INGEST-4.12: a weekday on its own times every week is one special day, on that day of each week
 * of the files (a one-week file: of every season week, `allWeeks`, but one the camp's own
 * special day already holds). A cell differs from week to week: not placed in any week (one
 * special day has one schedule), never one week's chosen quietly.
 */
function everyWeekDays(specialDays, allWeeks, context) {
  const kept = [];
  const first = new Map();
  for (const d of specialDays) {
    const at = `${d.program}|${d.day}`;
    const one = d.every && first.get(at);
    const sameBlocks =
      one && JSON.stringify(one.grid.b) === JSON.stringify(d.grid.b);
    if (!d.every || !one || !sameBlocks) {
      if (d.every && !one) {
        first.set(at, d);
        d.name = d.day;
        d.also = [];
      }
      kept.push(d);
      continue;
    }
    one.also.push(d);
    one.grid.g.forEach(([key], g) => {
      const other = d.grid.g.findIndex(([k]) => k === key);
      if (cellsOf(one, g) !== cellsOf(d, other)) {
        one.differs = [...(one.differs || []), key];
      }
    });
    // A group only a later week has on that day differs too.
    d.grid.g
      .filter(([key]) => !one.grid.g.some(([k]) => k === key))
      .forEach(([key, name]) => {
        one.differs = [...(one.differs || []), key];
        one.extraNames = { ...(one.extraNames || {}), [key]: name };
      });
  }
  for (const one of first.values()) {
    for (const w of allWeeks) {
      const id = w.filled ? null : w.Id;
      const key = w.filled ? w.Id : null;
      const taken = takenBy(context, w, one.day);
      if ((one.weekId || one.weekKey) === w.Id || !dateIn(w, one.day)) {
        continue;
      }
      if (taken) {
        context.notes.push({
          type: "specialDayTaken",
          week: w.Name,
          day: one.day,
          name: taken
        });
      } else {
        one.also.push({
          weekId: id,
          weekKey: key,
          weekName: w.Name,
          cells: []
        });
      }
    }
    const differs = new Set(one.differs || []);
    if (differs.size) {
      const names = new Map([
        ...one.grid.g.map(([key, name]) => [key, name]),
        ...Object.entries(one.extraNames || {})
      ]);
      const gone = new Set([...differs].map((k) => names.get(k)));
      [one, ...one.also].forEach((x) =>
        x.cells
          .filter((p) => gone.has(p.group))
          .forEach((p) =>
            context.unmatched.push({ ...p, why: "differsByWeek" })
          )
      );
      one.grid.r = one.grid.r.map((r, g) => {
        return differs.has(one.grid.g[g][0]) ? r.replace(/[^,]/g, "") : r;
      });
    }
    delete one.differs;
    delete one.extraNames;
  }
  return kept;
}

/** A special day grid's row g as the names in it, so two days' own item numbering compare. */
function cellsOf(d, g) {
  if (g < 0) {
    return "";
  }
  return d.grid.r[g]
    .split(",")
    .map((c) => (/^\d+$/.test(c) ? d.grid.i[Number(c) - 1].join("|") : c))
    .join(",");
}

/** The name of the special day the camp already has on a season week's day, or null. */
function takenBy(context, week, day) {
  const special = (context.existing && context.existing.special) || {};
  const brief = (special.briefs || []).find((b) =>
    (b.days || []).some((d) => d.weekId === week.Id && d.day === day)
  );
  const item =
    brief && (special.specialDays || []).find((x) => x.Id === brief.itemId);
  return item ? item.Name : null;
}

function ownDayOf(t, label, day) {
  return (t.ownDays || []).find((o) => o.week === label && o.day === day);
}

/** A week's day with its own blocks, saved as a special day on it (INGEST-4.3). */
function specialDayFor(t, week, day, label, extra) {
  return {
    key: `SpecialDay:${t.key}|${label}|${day}`,
    name: `${week.Name} ${day}`.slice(0, 80),
    weekName: week.Name,
    label,
    day,
    weekId: week.filled ? null : week.Id,
    weekKey: week.filled ? week.Id : null,
    ...extra
  };
}

// ---------- why the rest is not placed ----------

function reasonFor(p, proposal) {
  const t = proposal.timetables[p.timetable];
  const group = proposal.groups.find(
    (g) => g.name === p.group && g.timetable === p.timetable
  );
  if (t && t.deleted) {
    return "programDeleted";
  }
  if (!t || t.leftOut) {
    return "programLeftOut";
  }
  if (group && group.deleted) {
    return "groupDeleted";
  }
  if (!group || group.leftOut) {
    return "groupLeftOut";
  }
  const block = t.blocks.find((b) => b.fileKey === p.blockKey);
  if (block && block.deleted) {
    return "blockDeleted";
  }
  if (!block || block.leftOut || block.untimed) {
    return "blockLeftOut";
  }
  return "dayNotRun";
}

/** The days the grids run between them, Monday first: the shape of the weeks an import adds. */
function gridDays(proposal) {
  const runs = new Set(
    proposal.timetables.filter((t) => !t.leftOut).flatMap((t) => t.days)
  );
  return WEEKDAYS.filter((d) => runs.has(d));
}

/**
 * The versions to save, the placements that could not be placed (each with why), and the
 * week questions. Needs the proposal's usable placements and decisions.
 */
export function versionsFor(proposal, input) {
  const answers = input.answers || {};
  // A season with no weeks gets them from its dates, as "Fill in weeks" makes them, in the same
  // save, instead of telling the director to add them first (Greg's rule for every import:
  // anything missing is added; coordinator, 2026-10-17).
  const saved = seasonWeeks(input.existing);
  const filled =
    saved.length || !input.existing || !input.terms
      ? []
      : weeksToFill(input.existing, input.terms, gridDays(proposal));
  const weeks = saved.length ? saved : filled;
  const labels = [...new Set(proposal.usable.map((p) => p.week))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const mapped = mapWeeks(labels, weeks, answers);
  const context = {
    itemOf: itemKeyFinder(proposal),
    groups: proposal.groups,
    usable: proposal.usable,
    existing: input.existing,
    unmatched: [],
    specialDays: [],
    joining: [],
    // INGEST-4.11: the program whose day of its own a week's day is, made as a special day.
    ownerOf: (label, day) =>
      proposal.timetables.find(
        (x) =>
          !x.leftOut &&
          (x.ownDays || []).some(
            (o) => o.week === label && o.day === day && !o.leftOut
          )
      ),
    notes: [],
    asks: [],
    name: versionName((input.files || []).map((f) => f.name))
  };
  context.unmatched.push(
    ...proposal.leftOutCells.map((p) => ({ ...p, why: reasonFor(p, proposal) }))
  );
  const versions = [];
  for (const t of proposal.timetables.filter((x) => !x.leftOut)) {
    const used = new Set();
    for (const label of labels) {
      const week = mapped.byLabel.get(label);
      if (week && used.has(week.Id)) {
        // Two weeks of the files went to the same season week: the first one is kept.
        proposal.usable
          .filter((p) => p.timetable === t.index && p.week === label)
          .forEach((p) => context.unmatched.push({ ...p, why: "sameWeek" }));
        continue;
      }
      if (week) {
        used.add(week.Id);
      }
      const here = proposal.usable.filter(
        (p) => p.timetable === t.index && p.week === label
      );
      if (here.length === 0) {
        continue;
      }
      if (!week) {
        here.forEach((p) =>
          context.unmatched.push({
            ...p,
            why: weeks.length ? "weekLeftOut" : "noWeeks"
          })
        );
      } else {
        const version = versionFor(t, week, label, context);
        // A single-day file's only day is a special day (INGEST-4.14): no empty version.
        if (version.days.length || !t.ownDays.length) {
          versions.push(version);
        }
      }
    }
  }
  for (const d of context.specialDays) {
    for (const j of context.joining.filter((x) => x.at === d.at)) {
      d.parts.push(j);
      d.cells = [...d.cells, ...j.placements];
    }
    d.grid = gridOf(d.parts, context, true);
    delete d.parts;
    delete d.at;
  }
  // A program's day joined to a special day never made (its week asked, left out): cells not placed.
  for (const j of context.joining) {
    if (!context.specialDays.some((d) => d.cells.includes(j.placements[0]))) {
      j.placements.forEach((p) =>
        context.unmatched.push({ ...p, why: "ownDayLeftOut" })
      );
    }
  }
  const specialDays = everyWeekDays(
    oneSpecialDayADay(context, answers),
    labels.length === 1 ? weeks : [],
    context
  );
  return {
    versions,
    specialDays,
    notes: [...mapped.notes, ...context.notes],
    unmatched: context.unmatched,
    asks: [...mapped.asks, ...context.asks],
    noWeeks: weeks.length === 0,
    // Only when last year's week is kept in one of them.
    fillWeeks: [...versions, ...context.specialDays].some((v) => v.weekKey)
      ? filled
      : []
  };
}
