/**
 * What moving a group to another division of its program changes, worded as the import's move
 * card words it: the activities ("who can do it") and recurring activities ("who it covers")
 * that name the old or the new division, and not the group itself. Lists are told apart by
 * record, not name: two recurring activities can share a name (staggered lunches, one per
 * division, ADR 0006).
 *
 * And what it already has in its schedules: an activity it leaves that it is placed in keeps
 * those cells, marked "Not set up for <group>" there (ADR 0008); the note says how many first,
 * so nothing shifts unseen (ADR 0006 §16). The placements come from the server
 * (GroupPlacements), asked once per group the first time a move would leave an activity.
 */
import { CHILDREN, FIELD } from "c/shoreshSchema";

/** The lists (record Id -> name) that name this division and not the group itself. */
function namingDivision(divisionId, groupId, activities, recurringActivities) {
  // who: the rows' own fields (who can do an activity, or who a recurring activity covers).
  const counts = (rows, who) =>
    (rows || []).some((r) => r[who.Division] === divisionId) &&
    !(rows || []).some((r) => r[who.Group] === groupId);
  const lists = new Map();
  (activities || [])
    .filter((a) =>
      counts(a[CHILDREN.Activity.Eligibilities], FIELD.ActivityEligibility)
    )
    .forEach((a) => lists.set(a.Id, a.Name));
  (recurringActivities || [])
    .filter((r) =>
      counts(r[CHILDREN.RecurringActivity.Coverages], FIELD.Coverage)
    )
    .forEach((r) => lists.set(r.Id, r.Name));
  return lists;
}

/** Names of the lists in one map and not the other, sorted. */
function onlyIn(lists, other) {
  return [...lists]
    .filter(([id]) => !other.has(id))
    .map(([, name]) => name)
    .sort();
}

function nameList(names) {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "4 cells" or "1 cell". */
function cells(count) {
  return `${count} ${count === 1 ? "cell" : "cells"}`;
}

/**
 * What the group's schedules already hold of the activities it leaves, or "" when nothing (or
 * not known yet: the note is drawn again when the answer comes).
 * placements: { placed: [{ activity, cells }], complete } | "failed" | undefined.
 */
function placedNote(placements, leftActivities, name) {
  if (placements === "failed") {
    return " Its schedules could not be checked.";
  }
  if (!placements) {
    return "";
  }
  const kept = (placements.placed || [])
    .filter((p) => leftActivities.has(p.activity) && p.cells > 0)
    .map((p) => ({ name: leftActivities.get(p.activity), cells: p.cells }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const more =
    placements.complete === false ? " Not every schedule could be read." : "";
  if (!kept.length) {
    return more;
  }
  const listed = nameList(kept.map((k) => `${k.name} (${cells(k.cells)})`));
  return ` Its schedules keep ${listed}, marked “Not set up for ${name}”.${more}`;
}

/**
 * The note for a group whose division was changed on screen, or null when nothing changes.
 * context: { divisions, activities, recurringActivities, placements: groupId -> what
 * GroupPlacements answered (or "failed"), want(groupId): asks for a group's placements }.
 */
export function moveNote(values, original, context) {
  const division = FIELD.Group.Division;
  if (!original.Id || values[division] === original[division]) {
    return null;
  }
  const divisions = new Map(context.divisions.map((d) => [d.Id, d.Name]));
  const from = divisions.get(original[division]);
  const to = divisions.get(values[division]);
  const name = values.Name || original.Name;
  const before = namingDivision(
    original[division],
    original.Id,
    context.activities,
    context.recurringActivities
  );
  const after = namingDivision(
    values[division],
    original.Id,
    context.activities,
    context.recurringActivities
  );
  // A list naming both divisions keeps the group either way.
  const left = onlyIn(before, after);
  const joined = onlyIn(after, before);
  // The activities it leaves (not recurring ones: those are the setup-changed marks).
  const beforeActivities = namingDivision(
    original[division],
    original.Id,
    context.activities,
    []
  );
  const afterActivities = namingDivision(
    values[division],
    original.Id,
    context.activities,
    []
  );
  const leftActivities = new Map(
    [...beforeActivities].filter(([id]) => !afterActivities.has(id))
  );
  const placements = (context.placements || {})[original.Id];
  if (leftActivities.size && !placements && context.want) {
    context.want(original.Id);
  }
  const parts = [];
  if (left.length) {
    parts.push(`is no longer in ${nameList(left)} (for ${from})`);
  }
  if (joined.length) {
    parts.push(`is now in ${nameList(joined)} (for ${to})`);
  }
  return parts.length
    ? `Moves to ${to}: ${name} ${parts.join(" and ")}.${placedNote(
        placements,
        leftActivities,
        name
      )}`
    : null;
}
