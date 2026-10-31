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
/** What never-blank may bend (care plan step 7, Greg 2026-10-25): the weekly max only. Once a
 * day, who an activity is set up for, groups at once, same division and groups that fit are
 * limits and never give way there. */
export const PREFERENCES = Object.freeze([RULE.WEEKLY_MAX]);
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
// Every activity set up for the group is taken then: full, or held for another division (a
// limit, never a preference).
export const FULL = "full";
// No activity running this week is set up for the group.
export const NONE_FOR = "noneFor";
// What the step 8 search found (weekSearch.js) for a cell no cheaper proof covers: every
// arrangement of the day was tried and none holds more; one that holds more exists but would take
// a group below an activity's weekly minimum; or the search ran out of work before it could tell.
export const SEARCHED = "searched";
export const MIN_COST = "minCost";
export const BUDGET = "budget";
// Left Open on purpose (Greg, 2026-10-26, "minimums first" as a last resort): the group that was
// here had to move so another group gets an activity's weekly minimum, and nothing allowed is left
// for it here (weekAcross.js, protocol 8.29-8.32).
export const TRADE = "trade";

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
