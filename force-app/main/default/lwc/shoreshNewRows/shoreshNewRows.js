/**
 * What a new row of each kind starts with, beyond its season and order: Camp Setup's Add row,
 * and the list import's new items when the file has no such column. Greg, 2026-10-16: a new
 * activity is 1 time block long, done once a week, low priority, indoors, one group at a time;
 * a new location fits one group. Apex starts its rows the same way (AgentSetupNewRow.startsWith),
 * held to it by staticresources/ShoreshNewRowExamples.json, which both sides' tests run.
 */
import { FIELD } from "c/shoreshSchema";

const LOCATION = FIELD.Location;
const ACTIVITY = FIELD.Activity;

const NEW_ROWS = {
  Location: { [LOCATION.GroupsThatFit]: 1 },
  Activity: {
    [ACTIVITY.Length]: 1,
    [ACTIVITY.TimesPerWeekMin]: 1,
    [ACTIVITY.TimesPerWeekMax]: 1,
    [ACTIVITY.Priority]: "Low",
    [ACTIVITY.Outdoor]: false,
    [ACTIVITY.GroupsAtOnce]: 1,
    [ACTIVITY.NoWeeklyMax]: false,
    [ACTIVITY.NoGroupLimit]: false
  }
};

/** kind: "Location" or "Activity". A new row's fields, by the package's field names. */
export function newRow(kind) {
  return { ...NEW_ROWS[kind] };
}
