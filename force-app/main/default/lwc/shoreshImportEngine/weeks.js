/*
 * The weeks of a season with no weeks yet, as "Fill in weeks" makes them: shared by the camp
 * workbook import (c/shoreshLists) and Import last year.
 */
import { FIELD } from "c/shoreshSchema";

const SEASON = FIELD.Season;
const WEEK = FIELD.Week;

const DAY_MS = 86400000;

function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Monday-to-Friday weeks covering the season's dates, as "Fill in weeks" makes them
 * (WeekCalendar.weekdayWeeks, which the save uses): short first and last weeks are kept.
 */
export function weekdayWeeks(startDate, endDate) {
  const result = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  while (cursor <= end) {
    // 0 = Monday ... 6 = Sunday.
    const day = (new Date(cursor).getUTCDay() + 6) % 7;
    if (day >= 5) {
      cursor += (7 - day) * DAY_MS;
      continue;
    }
    const friday = cursor + (4 - day) * DAY_MS;
    result.push({ start: isoDay(cursor), end: isoDay(Math.min(friday, end)) });
    cursor = friday + 3 * DAY_MS;
  }
  return result;
}

/**
 * A season with dates but no weeks yet: the weeks "Fill in weeks" would add (SeasonWeeks.toFill),
 * not saved, keyed as weeks an import adds ("Week:<start>"). An import fills them in its own save
 * (ImportWorkbookExtras.fillWeeks) rather than make the director add them first (Greg, 4c: "never
 * make the director add it by hand first"). [] when the season has weeks, or no dates.
 */
export function weeksToFill(setup, t) {
  const season = setup.season || {};
  if (
    (setup.weeks || []).length ||
    !season[SEASON.StartDate] ||
    !season[SEASON.EndDate]
  ) {
    return [];
  }
  return weekdayWeeks(season[SEASON.StartDate], season[SEASON.EndDate]).map(
    (w, i) => ({
      Id: `Week:${w.start}`,
      Name: `${t.s("Week")} ${i + 1}`,
      [WEEK.StartDate]: w.start,
      [WEEK.EndDate]: w.end,
      // In order, as "Fill in weeks" numbers them.
      [WEEK.SortOrder]: i + 1,
      filled: true
    })
  );
}
