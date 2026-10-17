/**
 * What the checks need from the season's setup (the records every screen gets), read once into
 * plain shapes. Every field name comes from c/shoreshSchema (ADR 0009). The activity shape is the
 * Generated Schedule engine's (c/shoreshEngine setup.js), so the two can share one rules module.
 */
import { FIELD } from "c/shoreshSchema";

const ACTIVITY = FIELD.Activity;
const WEEKDAYS = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5
};

function wholeNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
}

/** Each activity by Id: { id, name, locationId, min, max, atOnce, sameDivision, early }. */
export function readActivities(records) {
  const byId = new Map();
  (records || []).forEach((r) => {
    const count = wholeNumber(r[ACTIVITY.EarlyWeekCount], null);
    const byDay = WEEKDAYS[r[ACTIVITY.EarlyWeekByDay]] || null;
    byId.set(r.Id, {
      id: r.Id,
      name: r.Name || "",
      locationId: r[ACTIVITY.Location] || null,
      min: Math.max(0, wholeNumber(r[ACTIVITY.TimesPerWeekMin], 0)),
      max: r[ACTIVITY.NoWeeklyMax]
        ? null
        : wholeNumber(r[ACTIVITY.TimesPerWeekMax], null),
      atOnce: r[ACTIVITY.NoGroupLimit]
        ? null
        : Math.max(1, wholeNumber(r[ACTIVITY.GroupsAtOnce], 1)),
      sameDivision: Boolean(r[ACTIVITY.SameDivisionOnly]),
      early: count && count > 0 && byDay ? { count, byDay } : null
    });
  });
  return byId;
}

/** Each place by Id: { name, fit } (how many groups fit at once, at least 1). */
export function readLocations(records) {
  const byId = new Map();
  (records || []).forEach((r) => {
    byId.set(r.Id, {
      name: r.Name || "",
      fit: Math.max(1, wholeNumber(r[FIELD.Location.GroupsThatFit], 1))
    });
  });
  return byId;
}

/**
 * From a program's setup: each group's division, and where each fixed and recurring activity
 * takes place (each object's own field: the two share a local name but are different fields).
 */
export function readProgram(entry) {
  const divisions = new Map();
  ((entry && entry.divisions) || []).forEach((division) =>
    (division.groups || []).forEach((grp) =>
      divisions.set(grp.Id, grp[FIELD.Group.Division] || null)
    )
  );
  const setTimeLocations = new Map();
  ((entry && entry.fixedActivities) || []).forEach((r) =>
    setTimeLocations.set(r.Id, r[FIELD.FixedActivity.Location] || null)
  );
  ((entry && entry.recurringActivities) || []).forEach((r) =>
    setTimeLocations.set(r.Id, r[FIELD.RecurringActivity.Location] || null)
  );
  return { divisions, setTimeLocations };
}
