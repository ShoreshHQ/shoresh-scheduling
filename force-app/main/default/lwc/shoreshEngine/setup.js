import { FIELD } from "c/shoreshSchema";

/**
 * The generator's inputs read into plain shapes, once, in one place: every field name comes from
 * c/shoreshSchema (ADR 0009), and every list is put in a fixed order (SortOrder, then Id), so the
 * order records arrive in can never change the week (ADR 0010).
 */

const ACTIVITY = FIELD.Activity;
const ELIGIBILITY = FIELD.ActivityEligibility;
const GROUP = FIELD.Group;
const TIME_BLOCK = FIELD.TimeBlock;
const LOCATION = FIELD.Location;
const WEEK_EXCEPTION = FIELD.WeekException;

const WEEKDAYS = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7
};

/** Text compared by character code, never by locale: the same order in every browser. */
export function compareText(a, b) {
  const x = String(a == null ? "" : a);
  const y = String(b == null ? "" : b);
  if (x < y) {
    return -1;
  }
  return x > y ? 1 : 0;
}

function sortValue(record, field) {
  const value = record ? record[field] : null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
}

/** Records in their SortOrder, then by Id; records without a SortOrder go last. */
export function inOrder(records, sortField) {
  return [...(records || [])]
    .filter((r) => r && r.Id)
    .sort((a, b) => {
      const x = sortField ? sortValue(a, sortField) : 0;
      const y = sortField ? sortValue(b, sortField) : 0;
      if (x !== y) {
        return x < y ? -1 : 1;
      }
      return compareText(a.Id, b.Id);
    });
}

function wholeNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
}

/** "09:30" -> 570; anything else -> null. */
export function minutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 1 for Monday ... 7 for Sunday, from "YYYY-MM-DD", the same in every time zone. */
export function weekdayOf(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  if (!match) {
    return null;
  }
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The days an early-week goal "by" a weekday (1 Monday ... 7 Sunday) counts, of these days
 * ("YYYY-MM-DD"): the first N days of this week's run, counted from its own first day, N being
 * the named day's place counted from the camp's normal first day of the week (firstDay, 1 Monday
 * ... 7 Sunday; Monday when not given). Greg, 2026-10-25: by Tuesday = the first 2 days of a
 * Monday-to-Friday camp's week, so a short Wednesday-Friday week counts Wednesday and Thursday;
 * ADR 0022: a Sunday-to-Thursday camp's by Tuesday = the first 3. A week always has its early
 * days, so the goal is never impossible. A Set of the dates.
 */
export function earlyDates(dates, byDay, firstDay = 1) {
  const days = [...dates].filter((d) => weekdayOf(d) != null).sort(compareText);
  if (!days.length || !byDay) {
    return new Set();
  }
  return new Set(days.slice(0, ((byDay - (firstDay || 1) + 7) % 7) + 1));
}

/** The activities that run this week, as the generator reads them. */
export function readActivities(records, weekExceptions, weekId) {
  const closedActivities = new Set();
  const closedLocations = new Set();
  for (const row of inOrder(weekExceptions)) {
    if (row[WEEK_EXCEPTION.Week] !== weekId) {
      continue;
    }
    if (row[WEEK_EXCEPTION.Activity]) {
      closedActivities.add(row[WEEK_EXCEPTION.Activity]);
    }
    if (row[WEEK_EXCEPTION.Location]) {
      closedLocations.add(row[WEEK_EXCEPTION.Location]);
    }
  }
  const all = inOrder(records, ACTIVITY.SortOrder).map((r) => {
    const count = wholeNumber(r[ACTIVITY.EarlyWeekCount], null);
    const byDay = WEEKDAYS[r[ACTIVITY.EarlyWeekByDay]] || null;
    return {
      id: r.Id,
      name: r.Name || "",
      locationId: r[ACTIVITY.Location] || null,
      span: Math.max(1, wholeNumber(r[ACTIVITY.Length], 1)),
      min: Math.max(0, wholeNumber(r[ACTIVITY.TimesPerWeekMin], 0)),
      max: r[ACTIVITY.NoWeeklyMax]
        ? null
        : wholeNumber(r[ACTIVITY.TimesPerWeekMax], null),
      atOnce: r[ACTIVITY.NoGroupLimit]
        ? null
        : Math.max(1, wholeNumber(r[ACTIVITY.GroupsAtOnce], 1)),
      // Groups at once left blank (and not "No group limit"): taken as 1, and said (step 1).
      atOnceBlank:
        !r[ACTIVITY.NoGroupLimit] &&
        wholeNumber(r[ACTIVITY.GroupsAtOnce], null) == null,
      sameDivision: Boolean(r[ACTIVITY.SameDivisionOnly]),
      sortOrder:
        typeof r[ACTIVITY.SortOrder] === "number"
          ? r[ACTIVITY.SortOrder]
          : null,
      priority: r[ACTIVITY.Priority] === "High" ? "high" : "low",
      early: count && count > 0 && byDay ? { count, byDay } : null
    };
  });
  return {
    total: all.length,
    running: all.filter(
      (a) =>
        !closedActivities.has(a.id) &&
        !(a.locationId && closedLocations.has(a.locationId))
    )
  };
}

/** Who each activity is set up for: none of its rows means every group. */
export function readEligibility(activities, rows, groups) {
  const byActivity = new Map();
  for (const row of inOrder(rows)) {
    const activityId = row[ELIGIBILITY.Activity];
    if (!byActivity.has(activityId)) {
      byActivity.set(activityId, []);
    }
    byActivity.get(activityId).push(row);
  }
  const eligibility = new Map();
  for (const act of activities) {
    const own = byActivity.get(act.id);
    const set = new Set();
    for (const group of groups.values()) {
      if (
        !own ||
        own.some(
          (row) =>
            row[ELIGIBILITY.Group] === group.id ||
            (row[ELIGIBILITY.Division] &&
              row[ELIGIBILITY.Division] === group.division)
        )
      ) {
        set.add(group.id);
      }
    }
    eligibility.set(act.id, set);
  }
  return eligibility;
}

export function readGroups(records) {
  const groups = new Map();
  for (const r of inOrder(records, GROUP.SortOrder)) {
    groups.set(r.Id, {
      id: r.Id,
      name: r.Name || "",
      division: r[GROUP.Division] || null,
      availability: r[GROUP.Availability] || null
    });
  }
  return groups;
}

/** Part of day by time block Id. */
export function readPartsOfDay(records) {
  const parts = new Map();
  for (const r of inOrder(records, TIME_BLOCK.SortOrder)) {
    parts.set(r.Id, r[TIME_BLOCK.PartOfDay] || null);
  }
  return parts;
}

/**
 * How many groups fit in each location at once (at least 1), its name, and the locations whose
 * groups-that-fit is blank (taken as 1, and said: step 1), in order.
 */
export function readLocations(records) {
  const fit = new Map();
  const names = new Map();
  const blank = [];
  for (const r of inOrder(records, LOCATION.SortOrder)) {
    fit.set(r.Id, Math.max(1, wholeNumber(r[LOCATION.GroupsThatFit], 1)));
    names.set(r.Id, r.Name || "");
    if (wholeNumber(r[LOCATION.GroupsThatFit], null) == null) {
      blank.push(r.Id);
    }
  }
  return { fit, names, blank };
}

/**
 * Where each fixed and recurring activity takes place. Each object's own field is read (ADR 0009
 * rule 2): the two share a local name but are different fields.
 */
export function readSetTimeLocations(fixedActivities, recurringActivities) {
  const where = new Map();
  for (const r of inOrder(fixedActivities)) {
    where.set(r.Id, r[FIELD.FixedActivity.Location] || null);
  }
  for (const r of inOrder(recurringActivities)) {
    where.set(r.Id, r[FIELD.RecurringActivity.Location] || null);
  }
  return where;
}

/**
 * Whether a group is at camp in a time block: all day, or the part of day it comes for. The same
 * rule as the server's SetTimePlan.atCamp and Manual Build's hatched cells.
 */
export function atCamp(group, partOfDay) {
  if (group.availability === "MorningOnly") {
    return partOfDay === "Morning";
  }
  return group.availability !== "AfternoonOnly" || partOfDay === "Afternoon";
}

/**
 * The week's days in date order, each with its own frame: time blocks (in the grid's order,
 * which is the day's time order), groups and items as Manual Build's DayView has them, and each
 * group's cells as tokens ('' Open, a number into items, '^' carries on).
 */
export function readDays(days, partsOfDay) {
  return [...(days || [])]
    .filter((day) => day && day.dateValue)
    .sort((a, b) => compareText(a.dateValue, b.dateValue))
    .map((day, index) => {
      const blocks = (day.blocks || []).map((block) => ({
        id: block.id,
        name: block.name,
        start: minutes(block.startTime),
        end: minutes(block.endTime),
        partOfDay: partsOfDay.has(block.id) ? partsOfDay.get(block.id) : null
      }));
      const tokens = new Map();
      (day.groups || []).forEach((group, g) => {
        const row = String((day.rows || [])[g] || "").split(",");
        while (row.length < blocks.length) {
          row.push("");
        }
        tokens.set(group.id, row.slice(0, blocks.length));
      });
      return {
        index,
        date: day.dateValue,
        weekday: weekdayOf(day.dateValue),
        frame: day,
        blocks,
        blockIndex: new Map(blocks.map((b, i) => [b.id, i])),
        items: day.items || [],
        tokens
      };
    });
}
