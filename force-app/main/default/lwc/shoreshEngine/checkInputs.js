/**
 * What checkWeek needs from the season's setup (the records every screen gets), read into its
 * model's shapes. Activities and places are read by the engine's own readers (setup.js), so both
 * schedules see the same rules. Written for Manual Build part 3; moved here with checks.js.
 */
import { FIELD } from "c/shoreshSchema";
import {
  readActivities as readCatalog,
  readLocations as readPlaces
} from "./setup";

/** Each activity by Id, in SortOrder then Id order, as the engine reads it. */
export function readActivities(records) {
  return new Map(readCatalog(records, [], null).running.map((a) => [a.id, a]));
}

/** Each place by Id: { name, fit } (how many groups fit at once, at least 1). */
export function readLocations(records) {
  const { fit, names } = readPlaces(records);
  return new Map(
    [...fit].map(([id, groupsThatFit]) => [
      id,
      { name: names.get(id), fit: groupsThatFit }
    ])
  );
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
