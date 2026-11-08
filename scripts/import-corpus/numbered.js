// Numbered days (docs/import/corpus.md, WEEK-2.6): level-1 camps whose files say "Day 1" to
// "Day 5" instead of the weekdays, the shape the break-and-rebuild campaign found read as bunks
// on one day; and camps whose bunks are named D1, D2, ..., which are never days. Everything is
// invented; the same seed gives the same camp.
//
// A number says nothing about the weekday, so a camp read into a season with nothing in it (as
// the scorer reads every camp) starts its week on Monday: Day 1 is Monday. Its truth is the same
// days counted from Monday.
import { ordinaryCamp } from "./camps";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// How a camp writes a number. Never "D3": camps name their bunks so.
const STYLES = [(n) => `Day ${n}`, (n) => `Day${n}`, (n) => `DAY ${n}`];

/** How many camps the numbered-days variant has. */
export const NUMBERED_SIZE = 40;

/** One level-1 camp that numbers its days, and its true answer. */
export function numberedCamp(seed) {
  const camp = ordinaryCamp(seed + 5000);
  return {
    ...camp,
    id: `L1N-${String(seed).padStart(3, "0")}`,
    days: WEEKDAYS.slice(0, camp.days.length),
    dayNumber: STYLES[seed % STYLES.length]
  };
}

/** The numbered-days camps: `count` from seed 1, every layout in turn. */
export function numberedCamps(count) {
  return Array.from({ length: count }, (_, i) => numberedCamp(i + 1));
}

/** How many camps whose bunks are named D1, D2, ... (the counter-case: never days). */
export const D_BUNKS_SIZE = 40;

/**
 * One level-1 camp whose bunks are D1, D2, ... in its columns, rows, sheets, files and headings,
 * its days named, every other one also numbering its days; and its true answer.
 */
export function dBunkCamp(seed) {
  const base = seed % 2 ? numberedCamp(seed + 100) : ordinaryCamp(seed + 6000);
  let n = 0;
  const divisions = base.divisions.map((d) => ({
    ...d,
    groups: d.groups.map(() => `D${++n}`)
  }));
  return {
    ...base,
    id: `L1D-${String(seed).padStart(3, "0")}`,
    divisions,
    // A by-activity cell lists bunks by name only, and "D3" carries no division.
    divisionsInFile: divisions.length > 1 && base.layout !== "byActivity",
    groups: divisions.flatMap((d) =>
      d.groups.map((g) => ({ name: g, division: d.name }))
    )
  };
}

/** The D-named-bunk camps: `count` from seed 1, every layout in turn. */
export function dBunkCamps(count) {
  return Array.from({ length: count }, (_, i) => dBunkCamp(i + 1));
}
