/**
 * What moving a group to another division of its program changes, worded as the import's move
 * card words it: the activities ("who can do it") and recurring activities ("who it covers")
 * that name the old or the new division, and not the group itself. Lists are told apart by
 * record, not name: two recurring activities can share a name (staggered lunches, one per
 * division, ADR 0006).
 */

/** The lists (record Id -> name) that name this division and not the group itself. */
function namingDivision(divisionId, groupId, activities, recurringActivities) {
  const counts = (rows) =>
    (rows || []).some((r) => r.Division__c === divisionId) &&
    !(rows || []).some((r) => r.Group__c === groupId);
  const lists = new Map();
  (activities || [])
    .filter((a) => counts(a.Eligibilities__r))
    .forEach((a) => lists.set(a.Id, a.Name));
  (recurringActivities || [])
    .filter((r) => counts(r.Coverages__r))
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

/** The note for a group whose division was changed on screen, or null when nothing changes. */
export function moveNote(values, original, context) {
  if (!original.Id || values.Division__c === original.Division__c) {
    return null;
  }
  const divisions = new Map(context.divisions.map((d) => [d.Id, d.Name]));
  const from = divisions.get(original.Division__c);
  const to = divisions.get(values.Division__c);
  const name = values.Name || original.Name;
  const before = namingDivision(
    original.Division__c,
    original.Id,
    context.activities,
    context.recurringActivities
  );
  const after = namingDivision(
    values.Division__c,
    original.Id,
    context.activities,
    context.recurringActivities
  );
  // A list naming both divisions keeps the group either way.
  const left = onlyIn(before, after);
  const joined = onlyIn(after, before);
  const parts = [];
  if (left.length) {
    parts.push(`is no longer in ${nameList(left)} (for ${from})`);
  }
  if (joined.length) {
    parts.push(`is now in ${nameList(joined)} (for ${to})`);
  }
  return parts.length ? `Moves to ${to}: ${name} ${parts.join(" and ")}.` : null;
}
