/*
 * Last year's week as a version (Greg, 2026-10-16): for each program and week in the files, a
 * schedule named "Imported from <file name>", one grid per day in the compact grid format v1
 * (repo docs/adr/0005), saved with the setup and never changed by later edits.
 *
 * Each placement goes in the cell of its group and time block: a fixed, recurring, or activity
 * item set up by this import (or already in the camp), or, for an elective, special day,
 * special event, or trip, the name as it was in the file, marked "not set up yet". Placements
 * that cannot be placed (their group, time block, day, or name left out, a weekend, a week not
 * in the season, two things in one cell) are listed with the reason, never silently dropped.
 *
 * The grid names records by the keys the save uses (new records) or their Ids (records the camp
 * has); the server puts in the Ids once everything is saved.
 */
import { FIELD } from "c/shoreshSchema";
import { LEAVE_OUT } from "./reading";
import { WEEKDAYS, clock, looseKey } from "./text";
import { weeksToFill } from "./weeks";

const DAY_NUMBER = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5
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
 * The season week each week of the files goes to: sure when the files and the season name the
 * same week ("Week 2"), or both have just one; otherwise asked (by the week's name, never its
 * record Id). Returns Map(label -> week record, or null for none) and the questions.
 */
function mapWeeks(labels, weeks, answers) {
  const result = new Map();
  const asks = [];
  for (const label of labels) {
    const named =
      label && weeks.find((w) => looseKey(w.Name) === looseKey(label));
    if (weeks.length === 0) {
      result.set(label, null);
    } else if (named) {
      result.set(label, named);
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
  return { byLabel: result, asks };
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
  return (p, t) => {
    const noted = proposal.notedKinds.get(p.text);
    if (noted) {
      return { kind: noted, key: "" };
    }
    const d = decisions.get(`${t.index}|${p.text}`);
    if (!d || d.leftOut) {
      return null;
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
        key: existing ? existing.Id : `F|${t.key}|${p.text}`
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

function dayGrid(t, groups, placements, context) {
  const blocks = t.blocks
    .map((b, index) => ({ ...b, index }))
    .filter((b) => !b.leftOut && !b.untimed);
  const column = new Map(blocks.map((b, i) => [b.index, i]));
  const rows = groups.map(() => blocks.map(() => ""));
  const items = new Items();
  for (const p of placements) {
    const g = groups.findIndex((x) => x.name === p.group);
    const item = context.itemOf(p, t);
    const start = column.get(p.blockIndex);
    if (!item) {
      context.unmatched.push({ ...p, why: "leftOut" });
    } else if (g < 0) {
      context.unmatched.push({ ...p, why: "groupLeftOut" });
    } else if (start === undefined || rows[g][start] !== "") {
      context.unmatched.push({ ...p, why: "twoAtOnce" });
    } else {
      rows[g][start] = items.number(item.kind, item.key, p.text);
      for (let k = 1; k < p.span && column.has(p.blockIndex + k); k++) {
        const c = column.get(p.blockIndex + k);
        if (rows[g][c] === "") {
          rows[g][c] = "^";
        }
      }
    }
  }
  return {
    b: blocks.map((b) => [
      b.id || `B|${t.key}|${b.fileKey}`,
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
    if (!date) {
      onDay.forEach((p) =>
        context.unmatched.push({ ...p, why: "dayNotInWeek" })
      );
    } else {
      days.push({ date, grid: dayGrid(t, groups, onDay, context) });
    }
  }
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

// ---------- why the rest is not placed ----------

function reasonFor(p, proposal) {
  const t = proposal.timetables[p.timetable];
  const group = proposal.groups.find(
    (g) => g.name === p.group && g.timetable === p.timetable
  );
  if (!t || t.leftOut) {
    return "programLeftOut";
  }
  if (!group || group.leftOut) {
    return "groupLeftOut";
  }
  const block = t.blocks.find((b) => b.fileKey === p.blockKey);
  if (!block || block.leftOut || block.untimed) {
    return "blockLeftOut";
  }
  return "dayNotRun";
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
      : weeksToFill(input.existing, input.terms);
  const weeks = saved.length ? saved : filled;
  const labels = [...new Set(proposal.usable.map((p) => p.week))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const mapped = mapWeeks(labels, weeks, answers);
  const context = {
    itemOf: itemKeyFinder(proposal),
    groups: proposal.groups,
    usable: proposal.usable,
    unmatched: [],
    name: versionName((input.files || []).map((f) => f.name))
  };
  context.unmatched.push(
    ...proposal.leftOutCells.map((p) => ({ ...p, why: reasonFor(p, proposal) }))
  );
  context.unmatched.push(
    ...proposal.reading.weekend.map((p) => ({ ...p, why: "weekend" }))
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
        versions.push(versionFor(t, week, label, context));
      }
    }
  }
  return {
    versions,
    unmatched: context.unmatched,
    asks: mapped.asks,
    noWeeks: weeks.length === 0,
    // Only when last year's week is kept in one of them.
    fillWeeks: versions.some((v) => v.weekKey) ? filled : []
  };
}
