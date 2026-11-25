/**
 * What the Versions list says of each version, apart from when it was saved: shared by the panel
 * (shoreshVersions.js) and the connector's list_versions (docs/protocol/api.md API-1.32), which
 * runs this file as scripts/build-connect.js ships it.
 */

const ORIGINS = {
  Manual: "Manual Build",
  Generated: "Generated Schedule",
  Copied: "Copied",
  Imported: "Imported"
};
// VersionReason__c's value for a version kept by the app ("Before Restore").
const AUTO_SAVED = "AutoSaved";
// Its value for a version kept before a change the person made through an agent (AgentWeeks).
const THROUGH_AGENT = "ThroughAgent";

/**
 * "Manual · Auto-saved" (then, when showSaved, " · " and when it was saved). Once the week's
 * published schedule: "Published", unless the name already says it and when ("Published Oct 18,
 * 2:40 PM"), and then when it was saved isn't shown either.
 */
export function metaOf(version) {
  const showSaved = !version.namedByPublish;
  const meta = [
    // An origin Shoresh has no words for is left out, never shown as stored (CORE-6.18).
    ORIGINS[version.origin],
    version.reason === AUTO_SAVED ? "Auto-saved" : null,
    version.reason === THROUGH_AGENT ? "By your AI" : null,
    version.publishedAt && showSaved ? "Published" : null
  ]
    .filter(Boolean)
    .join(" · ");
  return { meta, showSaved };
}

/** A version Shoresh kept by itself ("Before Restore"), not one a person kept or published. */
export function isAutomatic(version) {
  return (
    (version.reason === AUTO_SAVED || version.reason === THROUGH_AGENT) &&
    !version.publishedAt
  );
}

/**
 * Whether a version of a week being built has a delete: never once it was the week's published
 * schedule (kept as history, SchedulePublish), nor the imported week (kept as it came in,
 * ImportedWeekGuard).
 */
export function canDelete(version) {
  return !version.publishedAt && version.origin !== "Imported";
}
