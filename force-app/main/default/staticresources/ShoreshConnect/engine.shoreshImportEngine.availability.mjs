/*
 * A group here for part of the day (docs/import/names-and-divisions.md, INGEST-2.9; Greg,
 * 2026-10-28): a new group whose cells are all in the morning, on every day it is in the files,
 * comes in as Morning only (and all in the afternoon: Afternoon only), the same field the Groups
 * screen sets and the engine reads (c/shoreshSetupRules atCamp). Its blank half of the day is
 * then not a gap. Listed under "Shoresh read these as" with All day (review.md INGEST-5.9).
 */
import { blocksOf } from "./engine.shoreshImportEngine.reading-constants.mjs";

const NOON = 12 * 60;
const PARTS = { Morning: "MorningOnly", Afternoon: "AfternoonOnly" };

/** The answer key for one group's part of the day. */
export function availabilityKey(group) {
  return `availability|${group}`;
}

/**
 * A block's part of the day: the camp's own for a block it has, else the import's (before noon is
 * the morning, plan.js), or null for a block with no time.
 */
function partOf(timetable, block) {
  if (!block || block.start === null || block.start === undefined) {
    return null;
  }
  const own =
    block.id &&
    timetable.program &&
    timetable.program.blocks.find((b) => b.id === block.id);
  if (own && own.partOfDay) {
    return own.partOfDay;
  }
  // INGEST-2.30: a new block a morning group is still here for.
  if (block.isNew && block.partOfDay) {
    return block.partOfDay;
  }
  return block.start < NOON ? "Morning" : "Afternoon";
}

/** The parts of the day a placement covers. */
function partsOf(p, timetables) {
  const t = timetables[p.timetable];
  const parts = [];
  for (const b of blocksOf(p)) {
    parts.push(partOf(t, t.blocks[b]));
  }
  return parts;
}

/**
 * Each timetable's parts of the day that hold a cell read, for any group: Map(index -> Set). A
 * half of the day no one has anything read in (a legend's codes, nothing to read) shows no one
 * away.
 */
function heldParts(usable, timetables) {
  const held = new Map();
  for (const p of usable) {
    const parts = held.get(p.timetable) || new Set();
    partsOf(p, timetables).forEach((part) => parts.add(part));
    held.set(p.timetable, parts);
  }
  return held;
}

const dayKey = (p) => `${p.timetable}|${p.week || ""}|${p.day}`;

/** The blocks any group has a cell in, by day: Map(day key -> Set(block index)). */
function heldBlocks(usable) {
  const held = new Map();
  for (const p of usable) {
    const blocks = held.get(dayKey(p)) || new Set();
    blocksOf(p).forEach((b) => blocks.add(b));
    held.set(dayKey(p), blocks);
  }
  return held;
}

/**
 * INGEST-2.30 (coordinator's call 2026-11-27, Greg can change): a group empty every afternoon,
 * where it leaves at another time on another day (12:10 on Friday, 1:00 the other days). On each
 * of its days the afternoon blocks other groups have are blank for it from one on to the end of
 * the day, and those are half of that day's afternoon blocks or more.
 */
function emptyEveryAfternoon(cells, timetables, heldByDay) {
  const byDay = new Map();
  cells.forEach((p) =>
    byDay.set(dayKey(p), [...(byDay.get(dayKey(p)) || []), p])
  );
  if (byDay.size < 2) {
    return false;
  }
  return [...byDay].every(([key, own]) => {
    const t = timetables[own[0].timetable];
    const afternoon = [...heldByDay.get(key)]
      .filter((b) => partOf(t, t.blocks[b]) === "Afternoon")
      .sort((a, b) => t.blocks[a].start - t.blocks[b].start);
    const mine = new Set(own.flatMap((p) => blocksOf(p)));
    let blank = 0;
    for (let i = afternoon.length - 1; i >= 0 && !mine.has(afternoon[i]); i--) {
      blank++;
    }
    return blank >= 1 && blank * 2 >= afternoon.length;
  });
}

/**
 * The afternoon blocks a group read as here mornings still has cells in (its 12:10 Lunch), each
 * { timetable, block }, or null when one is the camp's own (its part of day stays the camp's).
 */
function lateMorning(cells, timetables) {
  const late = [];
  for (const p of cells) {
    const t = timetables[p.timetable];
    for (const b of blocksOf(p)) {
      const block = t.blocks[b];
      if (partOf(t, block) !== "Afternoon") {
        continue;
      }
      if (!block.isNew) {
        return null;
      }
      late.push({ timetable: p.timetable, block });
    }
  }
  return late;
}

/** What the cells of one group show: { read, days } or null when they show nothing. */
function readGroup(cells, timetables, held, heldByDay) {
  const parts = new Set();
  const days = new Set();
  for (const p of cells) {
    const both = held.get(p.timetable);
    // Only where other groups have both halves of the day can one half be blank for this one.
    if (!both.has("Morning") || !both.has("Afternoon")) {
      return null;
    }
    partsOf(p, timetables).forEach((part) => parts.add(part));
    days.add(`${p.timetable}|${p.week || ""}|${p.day}`);
  }
  // Two days at least: one day shows no pattern (classification rule 4).
  if (days.size < 2) {
    return null;
  }
  if (parts.size === 2 && emptyEveryAfternoon(cells, timetables, heldByDay)) {
    const late = lateMorning(cells, timetables);
    return late ? { read: PARTS.Morning, days: days.size, late } : null;
  }
  if (parts.size !== 1) {
    return null;
  }
  const read = PARTS[[...parts][0]];
  return read ? { read, days: days.size } : null;
}

/**
 * Each new group's part of the day: Map(group name -> { read, availability }), only for groups
 * read as here for part of it. A remembered "AllDay" (the line's All day) wins over the read.
 */
export function readAvailability(usable, timetables, groups, answers) {
  const byGroup = new Map();
  for (const p of usable) {
    byGroup.set(p.group, [...(byGroup.get(p.group) || []), p]);
  }
  const held = heldParts(usable, timetables);
  const heldByDay = heldBlocks(usable);
  const result = new Map();
  for (const g of groups.filter((x) => x.isNew && !x.leftOut)) {
    const found = readGroup(
      byGroup.get(g.name) || [],
      timetables,
      held,
      heldByDay
    );
    if (!found) {
      continue;
    }
    const answer = answers[availabilityKey(g.name)];
    result.set(g.name, {
      read: found.read,
      // Only the line's two choices: any other answer leaves the read.
      availability: answer === "AllDay" ? "AllDay" : found.read,
      late: found.late || []
    });
  }
  // INGEST-2.30: the blocks a morning group is still here for are morning blocks, when every
  // group read as here mornings has the block and none read as here afternoons does; otherwise
  // the group is not read (one gone home by then would be scheduled in it).
  const has = (name, x) =>
    (byGroup.get(name) || []).some(
      (p) =>
        p.timetable === x.timetable &&
        blocksOf(p).some((b) => timetables[p.timetable].blocks[b] === x.block)
    );
  const fits = (x) =>
    [...result].every(([name, a]) => {
      const inTimetable = (byGroup.get(name) || []).some(
        (p) => p.timetable === x.timetable
      );
      if (!inTimetable || a.read === PARTS.Morning) {
        return !inTimetable || has(name, x);
      }
      return a.read !== PARTS.Afternoon || !has(name, x);
    });
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, a] of result) {
      if (!a.late.every(fits)) {
        result.delete(name);
        changed = true;
      }
    }
  }
  for (const a of result.values()) {
    if (a.availability === PARTS.Morning) {
      a.late.forEach((x) => {
        x.block.partOfDay = "Morning";
      });
    }
  }
  return result;
}

/**
 * Whether a group is at camp in a timetable's block, by its part of the day (c/shoreshSetupRules
 * atCamp), except a file's block with no time to place it by: the file doesn't say, so it is not
 * one the group is away for (saved setup always has a part of day).
 */
export function atCampIn(availability, timetable, group, blockIndex) {
  const a = availability && availability.get(group);
  if (!a || a.availability === "AllDay") {
    return true;
  }
  const part = PARTS[partOf(timetable, timetable.blocks[blockIndex])];
  // A block of no known part of the day is not one it is away for.
  return !part || part === a.availability;
}
