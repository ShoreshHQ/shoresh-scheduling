/*
 * A group here for part of the day (docs/import/names-and-divisions.md, INGEST-2.9; Greg,
 * 2026-10-28): a new group whose cells are all in the morning, on every day it is in the files,
 * comes in as Morning only (and all in the afternoon: Afternoon only), the same field the Groups
 * screen sets and the engine reads (shoreshEngine/setup.js atCamp). Its blank half of the day is
 * then not a gap. Listed under "Shoresh read these as" with All day (review.md INGEST-5.9).
 */
import { blocksOf } from "./reading-constants";

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

/** What the cells of one group show: { read, days } or null when they show nothing. */
function readGroup(cells, timetables, held) {
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
  if (parts.size !== 1 || days.size < 2) {
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
  const result = new Map();
  for (const g of groups.filter((x) => x.isNew && !x.leftOut)) {
    const found = readGroup(byGroup.get(g.name) || [], timetables, held);
    if (!found) {
      continue;
    }
    const answer = answers[availabilityKey(g.name)];
    result.set(g.name, {
      read: found.read,
      // Only the line's two choices: any other answer leaves the read.
      availability: answer === "AllDay" ? "AllDay" : found.read
    });
  }
  return result;
}

/** Whether a group is at camp in a timetable's block, by its part of the day (setup.js atCamp). */
export function atCampIn(availability, timetable, group, blockIndex) {
  const a = availability && availability.get(group);
  if (!a || a.availability === "AllDay") {
    return true;
  }
  const part = PARTS[partOf(timetable, timetable.blocks[blockIndex])];
  // A block of no known part of the day is not one it is away for.
  return !part || part === a.availability;
}
