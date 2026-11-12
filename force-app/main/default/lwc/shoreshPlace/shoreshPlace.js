/**
 * Where the director is, kept for this browser tab (Greg 2026-11-12: a page reload stays where
 * you were, never back to Roots): the camp, season, screen, and on a schedule screen its program,
 * week and version. In the tab's session storage, so a reload comes back to it and a new tab
 * starts on Roots. Without storage (blocked, private window) Shoresh works as before.
 */
const KEY = "shoresh.place";

/** The place kept for this tab: { campId, seasonId, screen, programId, weekId, scheduleId }, or null. */
export function rememberedPlace() {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    return kept && typeof kept === "object" ? kept : null;
  } catch {
    return null;
  }
}

/** Keeps the place, in place of what was kept. */
export function rememberPlace(place) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    // No storage: a reload starts on Roots, as before.
  }
}
