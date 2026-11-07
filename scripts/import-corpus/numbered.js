// Numbered days (docs/import/corpus.md, WEEK-2.6): level-1 camps whose files say "Day 1" to
// "Day 5" instead of the weekdays, the shape the break-and-rebuild campaign found read as bunks
// on one day. Everything is invented; the same seed gives the same camp.
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

// How a camp writes a number. "D3" only across a page per group: on its own it is a heading,
// never part of a title or file name, where it could be anything.
const STYLES = [
  (n) => `Day ${n}`,
  (n) => `Day${n}`,
  (n) => `DAY ${n}`,
  (n) => `D${n}`
];

/** How many camps the numbered-days variant has. */
export const NUMBERED_SIZE = 40;

/** One level-1 camp that numbers its days, and its true answer. */
export function numberedCamp(seed) {
  const camp = ordinaryCamp(seed + 5000);
  const styles = camp.layout === "byGroup" ? STYLES : STYLES.slice(0, 3);
  return {
    ...camp,
    id: `L1N-${String(seed).padStart(3, "0")}`,
    days: WEEKDAYS.slice(0, camp.days.length),
    dayNumber: styles[seed % styles.length]
  };
}

/** The numbered-days camps: `count` from seed 1, every layout in turn. */
export function numberedCamps(count) {
  return Array.from({ length: count }, (_, i) => numberedCamp(i + 1));
}
