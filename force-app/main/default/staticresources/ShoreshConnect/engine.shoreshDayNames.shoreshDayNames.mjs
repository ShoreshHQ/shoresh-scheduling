/**
 * How the season on screen says a day (WEEK-1.5 to WEEK-1.7, ADR 0025 choice 3): by name, or in a
 * numbered-days season by number ("Day 3"), the date's place from the camp's first day of the
 * week, restarting every week. Nothing is stored per date, so a closed date's neighbours keep
 * their numbers, and stored keys stay weekdays: this is only for what a person reads.
 *
 * Held here rather than passed to every line that says a day: Camp Setup sets it each time it
 * reads a season (c/shoreshImportEngine nameDaysFor), and the connector before each piece of
 * work. Apex's DayWords does the same for the server.
 */
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// The first day of the week (1 Monday ... 7 Sunday), or null when days are named.
let firstDay = null;

/** naming: { numbered, firstDay (1 Monday ... 7 Sunday) }; nothing given, days are named. */
export function setDayNaming(naming) {
  firstDay = naming && naming.numbered ? naming.firstDay : null;
}

function numbered(weekday) {
  return `Day ${((weekday - firstDay + 7) % 7) + 1}`;
}

/** 0 Monday ... 6 Sunday for "2026-06-29", whatever the browser's time zone; NaN if unreadable. */
function weekdayIndex(dateValue) {
  const [y, m, d] = String(dateValue).split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "Day 3" for a date in a numbered season; null when days are named or it can't be read. */
export function numberedDay(dateValue) {
  const index = weekdayIndex(dateValue);
  return firstDay === null || Number.isNaN(index) ? null : numbered(index + 1);
}

/** "Day 3" for a stored weekday ("Wednesday") in a numbered season; null otherwise. */
export function numberedWeekday(weekday) {
  const index = WEEKDAYS.indexOf(weekday);
  return firstDay === null || index < 0 ? null : numbered(index + 1);
}

/** A stored weekday as a person reads it: "Day 3" in a numbered season, else as it is. */
export function spokenWeekday(weekday) {
  return numberedWeekday(weekday) || weekday;
}

/** "Wednesday" for a date, however the season says it: what an AI or a file may still name. */
export function weekdayName(dateValue) {
  return WEEKDAYS[weekdayIndex(dateValue)] || "";
}
