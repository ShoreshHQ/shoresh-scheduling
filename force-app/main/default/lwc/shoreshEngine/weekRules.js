/**
 * The rules a week build weighs, by name, and the order they give way in (docs/engine/protocol.md).
 * week.js re-exports them; checks.js and words.js read them from there.
 */

/** The rules a placement can bend, by name. */
export const RULE = Object.freeze({
  WEEKLY_MAX: "weeklyMax",
  ONCE_A_DAY: "onceADay",
  ELIGIBILITY: "eligibility",
  GROUPS_AT_ONCE: "groupsAtOnce",
  SAME_DIVISION: "sameDivision",
  PLACE_CAPACITY: "placeCapacity"
});

/**
 * The order rules give way when nothing fits (Greg and the coordinator, 2026-10-17): weekly max
 * first, then once a day, then who it's set up for, then groups at once, then the place last.
 * Same division only gives way just before the place's capacity (Greg, 2026-10-17). Locks, fixed and recurring activities and not-at-camp cells never give way.
 */
export const RELAX_ORDER = Object.freeze([
  RULE.WEEKLY_MAX,
  RULE.ONCE_A_DAY,
  RULE.ELIGIBILITY,
  RULE.GROUPS_AT_ONCE,
  RULE.SAME_DIVISION,
  RULE.PLACE_CAPACITY
]);
// Most serious first, for comparing two bends.
export const SEVERITY = [...RELAX_ORDER].reverse();

/** Not rules that bend, but why a cell stays Open: the group holds something at an overlapping
 * time, or no activity's length fits the gap. */
export const BUSY = "busy";
export const NO_FIT = "noFit";

// Why nothing can go in a cell at all: no room for the activity's full length, or the group is
// already somewhere at an overlapping time. These never give way.
export const LENGTH = "length";
export const OVERLAP = "overlap";

export const PRIORITY_RANK = { high: 0, low: 1 };

/** Whether rank a comes before rank b, entry by entry. */
export function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}
