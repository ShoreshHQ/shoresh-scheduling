/**
 * What the build is doing now, for a progress screen to say in camp words (engine care PR 6).
 * The engine only says it as a code and ids, never a sentence: a step sets `now` to one of these
 * just before it pauses, and the screen reads the latest when it gets the tab back. Nothing here
 * is read by the build, so a week built while watched is the same as one built without.
 *
 * now: { code, step (the protocol step, docs/engine/protocol.md), dayIndex, groupId, blockId,
 *        activityId, toActivityId, toDayIndex, times } (each null when it doesn't apply; TRADE
 *        also has forGroupId);
 *        generateWeekSteps adds the day's date (and toDate, toDayIndex's).
 */
export const NOW = Object.freeze({
  // Step 1: reading the week's setup.
  READ: "read",
  // Step 2: laying down what's fixed (locks, fixed and recurring activities, special events).
  FIXED: "fixed",
  // Step 3: what can go in one cell (day, group, block).
  OPTIONS: "options",
  // Steps 4-6: an activity placed in a cell.
  PLACE: "place",
  // Step 8, the repairs: trying to fill one empty cell.
  FILL: "fill",
  // Step 8, the repairs: finding room for an activity a group is still short of this week.
  SHORT: "short",
  // Step 8, the repairs: activityId has no room left for another group then, so groupId moves to
  // toActivityId in that cell (and another group takes its place in activityId).
  FULL: "full",
  // Step 8, the search: the group moved from activityId to toActivityId in this cell.
  MOVE: "move",
  // Step 8, the repairs: the group's activityId moved here from another time, to fill this cell.
  SHIFT: "shift",
  // Step 7: filling a cell nothing fits cleanly, so nothing is left blank.
  BLANK: "blank",
  // Step 8, the search: every way to fill one group's day (dayIndex, groupId, blockId).
  SEARCH: "search",
  // Step 8, the search: every way to fill the whole day.
  SEARCH_DAY: "searchDay",
  // Step 8, the search: rearranging the day so fewer groups are short of a weekly minimum.
  NEEDED: "needed",
  // Step 8, moves between days: groupId's activityId moves from dayIndex to toDayIndex, so it gets
  // toActivityId `times` times this week (a weekly minimum).
  ACROSS: "across",
  // Step 8, the last resort (minimums first): groupId's cell (dayIndex, blockId) is left Open so
  // forGroupId gets toActivityId (a weekly minimum).
  TRADE: "trade",
  // The same week built a second time, the stricter way, to keep the better of the two.
  AGAIN: "again",
  // Step 8's floor: building from the imported week, to compare.
  IMPORTED: "imported"
});

/** A `now` record (see above). */
export function nowOf(
  code,
  step,
  dayIndex = null,
  groupId = null,
  blockId = null,
  activityId = null,
  toActivityId = null,
  toDayIndex = null,
  times = null
) {
  return {
    code,
    step,
    dayIndex,
    groupId,
    blockId,
    activityId,
    toActivityId,
    toDayIndex,
    times
  };
}

/** Tells the build's watcher (st.watch, scheduleWeekSteps' notes) what it is doing now. */
export function tell(st, code, step, s = null, activityId = null, to = null) {
  st.watch.now = nowOf(
    code,
    step,
    s ? s.dayIndex : null,
    s ? s.groupId : null,
    s ? s.blockId : null,
    activityId,
    to
  );
}
