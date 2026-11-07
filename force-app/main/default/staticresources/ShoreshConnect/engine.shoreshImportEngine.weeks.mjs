/*
 * The weeks of a season with no weeks yet, as "Fill in weeks" makes them: shared by the camp
 * workbook import (c/shoreshLists) and Import last year.
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { setDayNaming } from "./engine.shoreshDayNames.shoreshDayNames.mjs";
import { setCampZone } from "./engine.shoreshCampClock.shoreshCampClock.mjs";
import { MONDAY_TO_FRIDAY, WEEKDAYS, firstDayOf } from "./engine.shoreshImportEngine.text.mjs";

const SEASON = FIELD.Season;
const WEEK = FIELD.Week;

const DAY_MS = 86400000;

function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/** The days a season's programs run between them, Monday first; Monday to Friday when none. */
export function programDays(setup) {
  const runs = new Set();
  ((setup && setup.programs) || []).forEach((entry) =>
    WEEKDAYS.forEach((d) => {
      if (entry.program && entry.program[FIELD.Program[d]]) {
        runs.add(d);
      }
    })
  );
  return runs.size ? WEEKDAYS.filter((d) => runs.has(d)) : MONDAY_TO_FRIDAY;
}

/**
 * The camp's normal first day of the week, 1 Monday ... 7 Sunday: where "Fill in weeks" starts
 * its weeks (firstDayOf the programs' days; a camp running every day, the season's first day's
 * weekday; Monday with no season dates). An early-week goal counts from it.
 */
export function campFirstDay(setup) {
  const start = setup && setup.season && setup.season[SEASON.StartDate];
  const time = Date.parse(`${start}T00:00:00Z`);
  const allDays = Number.isNaN(time) ? 0 : (new Date(time).getUTCDay() + 6) % 7;
  return firstDayOf(programDays(setup), allDays) + 1;
}

/**
 * The camp's first day of the week once an import saves (WEEK-2.6): a season with programs keeps
 * campFirstDay; one with none gets a program running the days the file numbers, counted from
 * firstDay (1 Monday ... 7 Sunday), and so the first day that program gives it.
 */
export function firstDayOnceSaved(setup, firstDay, numbers) {
  if (!numbers.length || ((setup && setup.programs) || []).length) {
    return firstDay;
  }
  const runs = numbers.map((n) => WEEKDAYS[(firstDay - 1 + n - 1) % 7]);
  return campFirstDay({
    ...setup,
    programs: [
      {
        program: Object.fromEntries(runs.map((d) => [FIELD.Program[d], true]))
      }
    ]
  });
}

/**
 * Days are said as this season says them from here on (WEEK-1.5): c/shoreshDayNames; and times on
 * its camp's clock (CORE-6.11): c/shoreshCampClock.
 */
export function nameDaysFor(setup) {
  setCampZone(setup && setup.campTimeZone);
  const season = (setup && setup.season) || {};
  setDayNaming({
    numbered: Boolean(season[SEASON.NumberedDays]),
    firstDay: campFirstDay(setup)
  });
}

/**
 * The camp's "In a short week" choice (WEEK-4.2) and its normal week's length, the days its
 * programs run (ADR 0022): { shrink (false, keep each minimum, unless the season says lower),
 * campDays }. The engine's input shortWeek.
 */
export function campShortWeek(setup) {
  const season = (setup && setup.season) || {};
  return {
    shrink: Boolean(season[SEASON.ShrinkShortWeek]),
    campDays: programDays(setup).length
  };
}

/**
 * The weeks covering the season's dates, as "Fill in weeks" makes them (WeekCalendar.weeksOf,
 * which the save uses): each week starts on the first of the days (firstDayOf; the season's own
 * first day when it runs every day) and holds the days that fall in the season, so short first
 * and last weeks are kept.
 */
export function weeksOf(startDate, endDate, days) {
  const result = [];
  const first = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  // 0 = Monday ... 6 = Sunday.
  const dayIndex = (time) => (new Date(time).getUTCDay() + 6) % 7;
  const weekStart = firstDayOf(days, dayIndex(first));
  const firstWeek = first - ((dayIndex(first) - weekStart + 7) % 7) * DAY_MS;
  for (let cursor = firstWeek; cursor <= end; cursor += 7 * DAY_MS) {
    // The week's first day (not always a Monday).
    const opens = cursor;
    const inWeek = [0, 1, 2, 3, 4, 5, 6]
      .map((i) => opens + i * DAY_MS)
      .filter(
        (time) =>
          time >= first &&
          time <= end &&
          days.includes(WEEKDAYS[dayIndex(time)])
      );
    if (inWeek.length) {
      result.push({
        start: isoDay(inWeek[0]),
        end: isoDay(inWeek[inWeek.length - 1])
      });
    }
  }
  return result;
}

/**
 * A season with dates but no weeks yet: the weeks "Fill in weeks" would add (SeasonWeeks.toFill),
 * not saved, keyed as weeks an import adds ("Week:<start>"). An import fills them in its own save
 * (ImportWorkbookExtras.fillWeeks) rather than make the director add them first (Greg, 4c: "never
 * make the director add it by hand first"). Its weeks follow the days given (an import: the days
 * its grids run), else (none given, or an empty list) the days the season's programs run. [] when the season has weeks, or no
 * dates.
 */
export function weeksToFill(setup, t, given) {
  // No days given, or none (grids that name no day): the programs' days, as the save reads it.
  const days = given && given.length ? given : programDays(setup);
  const season = setup.season || {};
  if (
    (setup.weeks || []).length ||
    !season[SEASON.StartDate] ||
    !season[SEASON.EndDate]
  ) {
    return [];
  }
  return weeksOf(season[SEASON.StartDate], season[SEASON.EndDate], days).map(
    (w, i) => ({
      Id: `Week:${w.start}`,
      Name: `${t.s("Week")} ${i + 1}`,
      [WEEK.StartDate]: w.start,
      [WEEK.EndDate]: w.end,
      // In order, as "Fill in weeks" numbers them.
      [WEEK.SortOrder]: i + 1,
      filled: true,
      // The week's days, so the save makes the same weeks.
      days
    })
  );
}
