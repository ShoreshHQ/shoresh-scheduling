/**
 * What moving a group to another division of its program changes, worded as the import's move
 * card words it: the activities ("who can do it") and recurring activities ("who it covers")
 * that name the old or the new division, and not the group itself.
 */

function namingDivision(divisionId, groupId, activities, recurringActivities) {
  const counts = (rows) =>
    (rows || []).some((r) => r.Division__c === divisionId) &&
    !(rows || []).some((r) => r.Group__c === groupId);
  return [
    ...(activities || [])
      .filter((a) => counts(a.Eligibilities__r))
      .map((a) => a.Name),
    ...(recurringActivities || [])
      .filter((r) => counts(r.Coverages__r))
      .map((r) => r.Name)
  ].sort();
}

function nameList(names) {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The note for a group whose division was changed on screen, or null. */
export function moveNote(values, original, context) {
  if (!original.Id || values.Division__c === original.Division__c) {
    return null;
  }
  const divisions = new Map(context.divisions.map((d) => [d.Id, d.Name]));
  const from = divisions.get(original.Division__c);
  const to = divisions.get(values.Division__c);
  const name = values.Name || original.Name;
  const loses = namingDivision(
    original.Division__c,
    original.Id,
    context.activities,
    context.recurringActivities
  );
  const gains = namingDivision(
    values.Division__c,
    original.Id,
    context.activities,
    context.recurringActivities
  );
  const parts = [];
  if (loses.length) {
    parts.push(`is no longer in ${nameList(loses)} (for ${from})`);
  }
  if (gains.length) {
    parts.push(`is now in ${nameList(gains)} (for ${to})`);
  }
  return parts.length
    ? `Moves to ${to}: ${name} ${parts.join(" and ")}.`
    : `Moves to ${to}. Nothing set up is for ${from} or ${to} by name, so nothing else changes.`;
}
