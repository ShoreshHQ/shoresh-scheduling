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
// The origins that are screens a week is built and published on.
const SCREENS = new Set(["Manual", "Generated"]);
// VersionReason__c's value for a version kept by the app ("Before Restore").
const AUTO_SAVED = "AutoSaved";

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
    version.publishedAt && showSaved ? "Published" : null
  ]
    .filter(Boolean)
    .join(" · ");
  return { meta, showSaved };
}

/** The screen a schedule was built on, by its Origin__c ("Manual Build"); null for a copy or an import. */
export function screenOf(origin) {
  return SCREENS.has(origin) ? ORIGINS[origin] : null;
}

/** What a failed rename says first, on every screen with Versions (CORE-6.18: the version by name). */
export function notRenamed(name) {
  return `${name || "That version"} wasn't renamed.`;
}

/** A version Shoresh kept by itself ("Before Restore"), not one a person kept or published. */
export function isAutomatic(version) {
  return version.reason === AUTO_SAVED && !version.publishedAt;
}

/**
 * Whether a version of a week being built has a delete: never once it was the week's published
 * schedule (kept as history, SchedulePublish), nor the imported week (kept as it came in,
 * ImportedWeekGuard).
 */
export function canDelete(version) {
  return !version.publishedAt && version.origin !== "Imported";
}
