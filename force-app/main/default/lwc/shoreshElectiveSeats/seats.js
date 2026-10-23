/**
 * The Elective seats screen's working (electives slice E7; repo ADR 0018 choices 28 to 37): from
 * one run as the server reads it (ElectiveSeats.RunView) to the seat engine's input
 * (c/shoreshElectiveEngine, ADR 0016) and back to what is saved, and the two views, the counter
 * and its problems. Pure: no server calls, no clock, no chance.
 *
 * The run's words (desktop runStateCopy.js, notRequestedReasons.js, findingDisplayMessage.js;
 * Greg's approved mock-ups design-research/electives-r1 seats-*): "13 of 15", "Dropped had 4 of
 * 6", "2nd", "Not chosen", "One of their choices", "2 couldn't be placed", "Second choice".
 */
import {
  CELL_CHOICE,
  ORDERED_FALLBACK,
  UNORDERED_SET
} from "c/shoreshElectiveEngine";
import { foldName } from "c/shoreshImportEngine";
import { dayLabel, shortClock } from "c/shoreshScheduleViews";

// The choices' kinds as Bring in choices saves them (ADR 0017 choice 16).
const KIND = {
  ranked: ORDERED_FALLBACK,
  cell: CELL_CHOICE,
  unordered: UNORDERED_SET
};
// A roster's dots: one per seat, up to this many; beyond, the count alone says it.
const MAX_DOTS = 40;

const RANK_NAMES = {
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth"
};

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A camper's saved choices (Preference__c.Choices__c), or none when they can't be read. */
export function parseChoices(text) {
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((c) => c && c.a) : [];
  } catch {
    return [];
  }
}

/** "Tue 12:30" (or the block's name when it has no time). */
export function timeLabel(time) {
  const day = dayLabel(time.day);
  return `${day.short} ${time.startTime ? shortClock(time.startTime) : time.blockName}`;
}

/** "Tuesday 12:30", for words read out and said. */
export function timeWords(time) {
  const day = dayLabel(time.day);
  return `${day.label} ${time.startTime ? shortClock(time.startTime) : time.blockName}`;
}

const slotOf = (day, blockId) => `${day}|${blockId}`;

/**
 * Everything the screen needs about a run, worked out once: its times in order, which time each
 * camper takes at each day and block, each camper's choices with the time they are for.
 */
export function readRun(view) {
  const times = (view && view.times) || [];
  const groups = new Map(((view && view.groups) || []).map((g) => [g.id, g]));
  const offerings = (view && view.offerings) || [];
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const offeringByActivity = new Map(offerings.map((o) => [o.activityId, o]));
  const timeByKey = new Map(times.map((t) => [t.key, t]));
  // day|block -> its times, in division order (as the server sends them).
  const bySlot = new Map();
  times.forEach((t) => {
    const slot = slotOf(t.day, t.blockId);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(t);
  });
  const campers = ((view && view.campers) || []).map((c) => ({
    ...c,
    group: c.groupId ? groups.get(c.groupId) || null : null
  }));
  const camperById = new Map(campers.map((c) => [c.id, c]));

  /** The time a camper takes at a day and block (ElectiveTimes.periodOf's rule), or null. */
  const timeOf = (camper, day, blockId) => {
    const here = bySlot.get(slotOf(day, blockId));
    if (!here) return null;
    if (!camper.groupId) return here[0];
    return (
      here.find((t) => (t.groupIds || []).includes(camper.groupId)) || null
    );
  };
  /** The times a camper takes, in the week's order. */
  const timesOf = (camper) =>
    [...bySlot.values()]
      .map((here) => {
        if (!camper.groupId) return here[0];
        return here.find((t) => (t.groupIds || []).includes(camper.groupId));
      })
      .filter(Boolean);

  return {
    view,
    times,
    timeByKey,
    groups,
    offerings,
    offeringById,
    offeringByActivity,
    campers,
    camperById,
    timeOf,
    timesOf
  };
}

// ---------- a camper's choices, matched to the times ----------

const DAY_WORDS = (day) => {
  const label = dayLabel(day);
  return [foldName(label.label), foldName(label.short)];
};

/** "Period 2", "2" and "Block 2" are one period (desktop preferenceCoordinateKeys.js). */
function periodAliases(text) {
  const raw = String(text || "").trim();
  const out = [foldName(raw)];
  if (/^\d+$/.test(raw)) {
    out.push(foldName(`Period ${raw}`), foldName(`Block ${raw}`));
  }
  const bare = raw.replace(/^(period|block)\s*/i, "");
  if (bare !== raw && /^\d+$/.test(bare)) out.push(foldName(bare));
  return out;
}

/**
 * The time a choice is for: the camper's time on that day in that period (desktop
 * resolvePreferenceCoordinates.js). A choice for no day and period is for the whole week (null).
 * One whose day or period this schedule doesn't have is also used for the whole week, and said:
 * { timeKey: null, unmatched: "No session at Tuesday Period 9 on this schedule." }.
 */
export function timeOfChoice(run, camper, choice) {
  if (!choice.d && !choice.p) return { timeKey: null };
  if (!choice.d || !choice.p) {
    return {
      timeKey: null,
      unmatched: `Day or period missing: ${choice.d || "(no day)"} ${choice.p || "(no period)"}.`
    };
  }
  const day = foldName(choice.d);
  const periods = periodAliases(choice.p);
  const found = run
    .timesOf(camper)
    .find(
      (t) =>
        DAY_WORDS(t.day).includes(day) &&
        (periods.includes(foldName(t.blockName)) ||
          (t.startTime && periods.includes(foldName(shortClock(t.startTime)))))
    );
  return found
    ? { timeKey: found.key }
    : {
        timeKey: null,
        unmatched: `No session at ${choice.d} ${choice.p} on this schedule.`
      };
}

/**
 * Each camper's choices as the engine takes them, and the choices whose day and period didn't
 * match ({ camperId, text }). Unordered choices are a tie among equals (rank 1, never an order:
 * desktop owner ruling 2026-09-29); a choice "left out" was never saved.
 */
export function choicesOf(run) {
  const choices = [];
  const unmatched = [];
  run.campers.forEach((camper) => {
    parseChoices(camper.choices).forEach((c) => {
      const where = timeOfChoice(run, camper, c);
      if (where.unmatched) {
        unmatched.push({ camperId: camper.id, text: where.unmatched });
      }
      choices.push({
        camperId: camper.id,
        key: c.a,
        timeId: where.timeKey,
        rank: c.k === "unordered" || c.r == null ? 1 : Number(c.r),
        rankKind: KIND[c.k] || null
      });
    });
  });
  return { choices, unmatched };
}

/**
 * How a camper ranked an activity at a time (the engine's own rule: their choice for that time,
 * else their choice for the week, the best rank winning): { rank, kind } or null (not chosen).
 */
export function rankAt(choices, camperId, timeKey, activityId) {
  const better = (held, c) => {
    if (held == null || c.rank < held.rank) {
      return { rank: c.rank, kind: c.rankKind };
    }
    return held;
  };
  let atTime = null;
  let fallback = null;
  choices.forEach((c) => {
    if (c.camperId !== camperId || c.key !== activityId) return;
    if (c.timeId === timeKey) atTime = better(atTime, c);
    else if (c.timeId == null) fallback = better(fallback, c);
  });
  return atTime || fallback;
}

/** The words after an offering in By camper: none for a first choice (the mock-up's). */
export function rankWords(ranked) {
  if (!ranked) return "Not chosen";
  if (ranked.kind === UNORDERED_SET) return "One of their choices";
  if (ranked.rank === 1) return "";
  return ordinal(ranked.rank);
}

function ordinal(n) {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix}`;
}

// ---------- the engine's input, and what is saved ----------

/**
 * The seat engine's input for this run (ADR 0016 choice 3): campers by Id, the times, each time's
 * offerings (keyed by their activity, as choices name them), choices, who takes which time, and
 * the locked seats that still fit. Linked choices come with slice E8: none yet, in the shape the
 * engine takes them. Also the locks that no longer fit (shown, never sent).
 */
export function engineInput(run, terms) {
  const { choices, unmatched } = choicesOf(run);
  const offerings = [];
  run.times.forEach((t) => {
    (t.offeringIds || []).forEach((id) => {
      const o = run.offeringById.get(id);
      if (!o) return;
      offerings.push({
        timeId: t.key,
        activityId: o.activityId,
        key: o.activityId,
        name: o.name,
        seats: o.noLimit ? null : o.seats == null ? null : Number(o.seats),
        noLimit: !!o.noLimit,
        minimum: o.minimum == null ? null : Number(o.minimum)
      });
    });
  });
  const attendance = {};
  run.campers.forEach((camper) => {
    attendance[camper.id] = run.timesOf(camper).map((t) => t.key);
  });
  const { locks, stray } = locksOf(run);
  return {
    input: {
      campers: run.campers.map((c) => ({ id: c.id })),
      times: run.times.map((t) => ({
        id: t.key,
        date: t.day,
        blockOrder: t.blockOrder,
        divisionOrder: t.divisionOrder
      })),
      offerings,
      choices,
      attendance,
      locks,
      linkedChoices: [],
      linkedChoiceTimes: [],
      terms
    },
    unmatched,
    stray
  };
}

/** Locked seats: those at a time the camper still takes, in something offered then; the rest. */
export function locksOf(run) {
  const locks = [];
  const stray = [];
  ((run.view && run.view.seats) || []).forEach((seat) => {
    if (!seat.locked) return;
    const camper = run.camperById.get(seat.camperId);
    const time = camper ? run.timeOf(camper, seat.day, seat.blockId) : null;
    const offering = run.offeringById.get(seat.offeringId);
    if (time && offering && (time.offeringIds || []).includes(offering.id)) {
      locks.push({
        camperId: seat.camperId,
        timeId: time.key,
        activityId: offering.activityId
      });
    } else {
      stray.push(seat);
    }
  });
  return { locks, stray };
}

/**
 * What Assign seats sends (ElectiveSeatSaves.AssignRequest): every seat the engine placed that is
 * not a lock (locks stay as they are), and what did not run, with how many it had and needed.
 */
export function assignRequest(run, result) {
  const seats = [];
  result.seats.forEach((s) => {
    if (s.locked) return;
    const time = run.timeByKey.get(s.timeId);
    const offering = run.offeringByActivity.get(s.activityId);
    if (!time || !offering) return;
    seats.push({
      camperId: s.camperId,
      day: time.day,
      blockId: time.blockId,
      offeringId: offering.id
    });
  });
  const dropped = result.findings
    .filter((f) => f.kind === "BELOW_MINIMUM")
    .map((f) => ({
      t: f.timeId,
      a: f.activityId,
      h: f.enrolled,
      m: f.minimum
    }));
  return {
    runId: run.view.run.id,
    revision: run.view.revision,
    seats,
    dropped
  };
}

/** What did not run when seats were last assigned: timeKey|activityId -> { had, needed }. */
export function droppedOf(view) {
  const result = new Map();
  if (!view || !view.dropped) return result;
  try {
    (JSON.parse(view.dropped) || []).forEach((d) => {
      result.set(`${d.t}|${d.a}`, { had: d.h, needed: d.m });
    });
  } catch {
    // Unreadable: nothing is shown as dropped rather than something wrong.
  }
  return result;
}

// ---------- the board: both views, the counter and the problems ----------

function seatWords(offering) {
  if (offering.noLimit) return "No limit";
  if (offering.seats == null) return "Seats not filled in";
  const n = Number(offering.seats);
  if (n === 0) return "Closed";
  return `${n} seat${n === 1 ? "" : "s"}`;
}

/** The dots under a count: filled for each camper, open for each seat left (the mock-up's). */
function dotsFor(count, seats) {
  const total = seats == null ? count : Math.max(count, seats);
  if (total > MAX_DOTS) return [];
  return Array.from({ length: total }, (_, i) => ({
    key: `d${i}`,
    className: i < count ? "dot dot_on" : "dot"
  }));
}

/**
 * Both views and the problems, from the run and its seats. t: the camp's words. Columns are the
 * times, one per day and block (with the division when two share a day and block).
 */
export function buildBoard(run, t) {
  const view = run.view;
  const { choices, unmatched } = choicesOf(run);
  const { stray } = locksOf(run);
  const strayIds = new Set(stray.map((s) => s.id));
  const dropped = droppedOf(view);
  const slotCount = new Map();
  run.times.forEach((time) => {
    const slot = slotOf(time.day, time.blockId);
    slotCount.set(slot, (slotCount.get(slot) || 0) + 1);
  });
  const divisionName = new Map(
    [...run.groups.values()].map((g) => [g.divisionId, g.divisionName])
  );
  const columns = run.times.map((time) => {
    const shared = slotCount.get(slotOf(time.day, time.blockId)) > 1;
    const division = shared ? divisionName.get(time.divisionId) : null;
    return {
      key: time.key,
      time,
      label: division ? `${timeLabel(time)} · ${division}` : timeLabel(time),
      words: division ? `${timeWords(time)}, ${division}` : timeWords(time)
    };
  });
  const columnByKey = new Map(columns.map((c) => [c.key, c]));

  // Each seat at the time its camper takes there (stray locks have none).
  const seatAt = new Map();
  const byCell = new Map();
  ((view && view.seats) || []).forEach((seat) => {
    const camper = run.camperById.get(seat.camperId);
    if (!camper || strayIds.has(seat.id)) return;
    const time = run.timeOf(camper, seat.day, seat.blockId);
    if (!time) return;
    const offering = run.offeringById.get(seat.offeringId);
    const ranked = offering
      ? rankAt(choices, camper.id, time.key, offering.activityId)
      : null;
    const placed = { seat, camper, time, offering, ranked };
    seatAt.set(`${camper.id}|${time.key}`, placed);
    const cell = `${time.key}|${seat.offeringId}`;
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(placed);
  });

  const problems = {
    unplaced: [],
    dropped: [],
    belowMinimum: [],
    overSeats: [],
    stray: [],
    ranks: new Map(),
    noBunk: 0,
    notOnSchedule: 0,
    unmatched,
    noOfferings: []
  };

  const offeringRows = run.offerings
    .filter((o) => !o.proposed)
    .map((offering) => {
      const subs = [seatWords(offering)];
      if (offering.minimum != null) subs.push(`at least ${offering.minimum}`);
      return {
        key: offering.id,
        offering,
        name: offering.name,
        subs: subs.map((text, i) => ({ key: `s${i}`, text })),
        cells: columns.map((column) =>
          offeringCell(column, offering, byCell, dropped, problems)
        )
      };
    });
  columns.forEach((column) => {
    if (!(column.time.offeringIds || []).length) {
      problems.noOfferings.push(column);
    }
  });

  const attending = [];
  let placedCount = 0;
  const camperRows = run.campers.map((camper) => {
    const mine = new Set(run.timesOf(camper).map((x) => x.key));
    if (mine.size) attending.push(camper);
    else problems.notOnSchedule += 1;
    let complete = mine.size > 0;
    const cells = columns.map((column) => {
      if (!mine.has(column.key)) {
        return { key: column.key, attends: false };
      }
      const placed = seatAt.get(`${camper.id}|${column.key}`);
      if (!placed) {
        complete = false;
        problems.unplaced.push({ camper, column });
        return { key: column.key, attends: true, unplaced: true };
      }
      countRank(problems.ranks, placed.ranked);
      const words = rankWords(placed.ranked);
      return {
        key: column.key,
        attends: true,
        name: placed.offering ? placed.offering.name : "",
        words,
        locked: !!placed.seat.locked
      };
    });
    if (complete) placedCount += 1;
    if (!camper.groupId) problems.noBunk += 1;
    return { key: camper.id, camper, cells };
  });

  stray.forEach((seat) => {
    const camper = run.camperById.get(seat.camperId);
    if (camper) problems.stray.push({ camper, seat });
  });

  return {
    columns,
    columnByKey,
    offeringRows,
    camperSections: camperSections(camperRows, run, t),
    counter: {
      placed: placedCount,
      total: attending.length
    },
    problems,
    byCell,
    seatAt,
    choices
  };
}

function offeringCell(column, offering, byCell, dropped, problems) {
  const offered = (column.time.offeringIds || []).includes(offering.id);
  const here = byCell.get(`${column.key}|${offering.id}`) || [];
  const count = here.length;
  const limited = !offering.noLimit && offering.seats != null;
  const seats = limited ? Number(offering.seats) : null;
  const gone = dropped.get(`${column.key}|${offering.activityId}`);
  const cell = {
    key: `${column.key}|${offering.id}`,
    column,
    offering,
    offered,
    count,
    seats,
    roster: here
  };
  if (!offered) {
    return { ...cell, text: "Not offered", dots: [] };
  }
  if (count === 0 && gone) {
    problems.dropped.push({ offering, column, ...gone });
    return { ...cell, dropped: gone, look: true, dots: [] };
  }
  const over = limited && count > seats;
  const below =
    offering.minimum != null && count > 0 && count < Number(offering.minimum);
  if (over) problems.overSeats.push({ offering, column, count, seats });
  if (below) {
    problems.belowMinimum.push({
      offering,
      column,
      count,
      minimum: Number(offering.minimum)
    });
  }
  return {
    ...cell,
    of: limited ? `of ${seats}` : "",
    dots: dotsFor(count, seats),
    look: over || below,
    free: limited ? Math.max(0, seats - count) : null
  };
}

function countRank(ranks, ranked) {
  let key;
  if (!ranked) key = "notChosen";
  else if (ranked.kind === UNORDERED_SET) key = "oneOf";
  else if (ranked.rank === 1) return;
  else key = String(ranked.rank);
  ranks.set(key, (ranks.get(key) || 0) + 1);
}

/** By camper: one section per bunk (bunk order), then those with no bunk (the mock-up's). */
function camperSections(rows, run, t) {
  const byGroup = new Map();
  rows.forEach((row) => {
    const key = row.camper.groupId || "";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(row);
  });
  const byName = (a, b) =>
    compareText(
      (a.camper.name || "").toLowerCase(),
      (b.camper.name || "").toLowerCase()
    ) || compareText(a.camper.id, b.camper.id);
  const sections = [...run.groups.values()]
    .filter((g) => byGroup.has(g.id))
    .map((g) => ({
      key: g.id,
      name: g.name,
      noBunk: false,
      rows: byGroup.get(g.id).sort(byName)
    }));
  if (byGroup.has("")) {
    sections.push({
      key: "none",
      name: `No ${t.sIn("Group")}`,
      noBunk: true,
      rows: byGroup.get("").sort(byName)
    });
  }
  return sections.map((s) => ({ ...s, count: s.rows.length }));
}

/**
 * The counter's list, in the mock-up's order: who couldn't be placed, what was dropped below its
 * minimum, then what else needs a look, then how many didn't get their first choice and how.
 * Each section { key, head, rows: [{ key, text, aside, target }] }.
 */
export function problemSections(board, t) {
  const p = board.problems;
  const sections = [];
  const add = (key, head, rows) => {
    if (rows.length) sections.push({ key, head, rows });
  };
  add(
    "unplaced",
    `${p.unplaced.length} couldn't be placed`,
    p.unplaced.map((u) => ({
      key: `u|${u.camper.id}|${u.column.key}`,
      text: u.camper.name,
      aside: u.column.label,
      target: { view: "camper", camperId: u.camper.id }
    }))
  );
  add(
    "dropped",
    `${p.dropped.length} dropped below minimum`,
    p.dropped.map((d) => ({
      key: `d|${d.offering.id}|${d.column.key}`,
      text: d.offering.name,
      aside: `${d.column.label} · ${d.had} of ${d.needed}`,
      target: { view: "offering", cell: `${d.column.key}|${d.offering.id}` }
    }))
  );
  add(
    "below",
    `${p.belowMinimum.length} kept below minimum`,
    p.belowMinimum.map((d) => ({
      key: `b|${d.offering.id}|${d.column.key}`,
      text: d.offering.name,
      aside: `${d.column.label} · ${d.count} of ${d.minimum}`,
      target: { view: "offering", cell: `${d.column.key}|${d.offering.id}` }
    }))
  );
  add(
    "over",
    `${p.overSeats.length} over ${t.pIn("Seats")}`,
    p.overSeats.map((d) => ({
      key: `o|${d.offering.id}|${d.column.key}`,
      text: d.offering.name,
      aside: `${d.column.label} · ${d.count} of ${d.seats}`,
      target: { view: "offering", cell: `${d.column.key}|${d.offering.id}` }
    }))
  );
  add(
    "stray",
    `${p.stray.length} ${p.stray.length === 1 ? "lock no longer applies" : "locks no longer apply"}`,
    p.stray.map((s) => ({
      key: `l|${s.seat.id}`,
      text: `${s.camper.name}'s lock no longer applies.`,
      aside: "",
      target: { view: "camper", camperId: s.camper.id },
      stray: s
    }))
  );
  add(
    "nothing",
    `${p.noOfferings.length} with nothing offered`,
    p.noOfferings.map((c) => ({
      key: `n|${c.key}`,
      text: c.label,
      aside: "Nothing is offered in this period, so nobody was placed in it.",
      target: null
    }))
  );
  const notFirst = [...p.ranks.values()].reduce((a, b) => a + b, 0);
  if (notFirst) {
    const order = [...p.ranks.keys()]
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    const rows = order.map((k) => ({
      key: `r|${k}`,
      text: `${RANK_NAMES[k] || `${ordinal(Number(k))}`} choice`,
      aside: String(p.ranks.get(k)),
      target: null
    }));
    if (p.ranks.get("oneOf")) {
      rows.push({
        key: "r|oneOf",
        text: "One of their choices",
        aside: String(p.ranks.get("oneOf")),
        target: null
      });
    }
    if (p.ranks.get("notChosen")) {
      rows.push({
        key: "r|not",
        text: "Not one they chose",
        aside: String(p.ranks.get("notChosen")),
        target: null
      });
    }
    sections.push({
      key: "ranks",
      head: `${notFirst} not their first choice`,
      rows
    });
  }
  const others = [];
  if (p.noBunk) {
    others.push({
      key: "x|bunk",
      text: `No ${t.sIn("Group")} on the sheet`,
      aside: String(p.noBunk),
      target: { view: "camper", camperId: null }
    });
  }
  if (p.notOnSchedule) {
    others.push({
      key: "x|off",
      text: `${t.s("Group")} has no ${t.sIn("ElectiveSet")} this ${t.sIn("Week")}`,
      aside: String(p.notOnSchedule),
      target: null
    });
  }
  const seen = new Set();
  p.unmatched.forEach((u) => {
    if (seen.has(u.text)) return;
    seen.add(u.text);
    others.push({ key: `x|${u.text}`, text: u.text, aside: "", target: null });
  });
  add("others", "Also", others);
  return sections;
}

/** Whether anything in the problems needs a look (the counter's corner). */
export function needsLook(board) {
  const p = board.problems;
  return (
    p.unplaced.length +
      p.dropped.length +
      p.belowMinimum.length +
      p.overSeats.length +
      p.stray.length +
      p.noOfferings.length +
      p.noBunk +
      p.notOnSchedule +
      p.unmatched.length >
    0
  );
}

/** The other offerings a camper can be moved to at a time ("Move to…"), by name. */
export function moveTargets(run, time, offeringId) {
  return (time.offeringIds || [])
    .filter((id) => id !== offeringId)
    .map((id) => run.offeringById.get(id))
    .filter(Boolean)
    .map((o) => ({ value: o.id, label: o.name }));
}
