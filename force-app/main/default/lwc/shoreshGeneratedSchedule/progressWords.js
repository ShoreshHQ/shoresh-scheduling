import { NOW } from "c/shoreshEngine";
import { dayLabel } from "c/shoreshScheduleViews";

/**
 * What the build is doing now (c/shoreshEngine NOW, watch.now), in the camp's words and setup's
 * names: "Finding everything that can go in Period 1 for Badgers on Monday", "Sports is full, so
 * moving Eagles to Playground for Monday's Period 2" (engine care PR 6). The engine says only a
 * code and ids; the sentences are all here.
 */

/** "Badgers" -> "Badgers'", "Bunk 3" -> "Bunk 3's". */
export function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** The names a line needs, read once per build from the engine's input: ids -> names. */
export function namesOf(input) {
  const named = (records) =>
    new Map((records || []).map((r) => [r.Id, r.Name || ""]));
  const blocks = new Map();
  for (const day of (input && input.days) || []) {
    for (const block of day.blocks || []) {
      if (block && block.id && !blocks.has(block.id)) {
        blocks.set(block.id, block.name || "");
      }
    }
  }
  return {
    group: named(input && input.groups),
    activity: named(input && input.activities),
    block: blocks
  };
}

/**
 * The line for one watch.now, or null when it names something the setup no longer has (the
 * screen keeps the line it shows). t: the camp's words (c/shoreshTerms).
 */
export function progressLine(now, names, t) {
  if (!now) {
    return null;
  }
  const day = now.date ? dayLabel(now.date).label : "";
  const group = names.group.get(now.groupId) || "";
  const block = names.block.get(now.blockId) || "";
  const act = names.activity.get(now.activityId) || "";
  const to = names.activity.get(now.toActivityId) || "";
  const all = (...words) => words.every(Boolean);
  switch (now.code) {
    case NOW.READ:
      return "Reading your setup";
    case NOW.FIXED:
      return `Putting in locked cells, ${t.pIn("FixedActivity")} and ${t.pIn("RecurringActivity")}`;
    case NOW.OPTIONS:
      return all(block, group, day)
        ? `Finding everything that can go in ${block} for ${group} on ${day}`
        : null;
    case NOW.PLACE:
      return all(act, group, day, block)
        ? `Placing ${act} for ${group} in ${possessive(day)} ${block}`
        : null;
    case NOW.FILL:
      return all(group, day, block)
        ? `Finding something for ${group} in ${possessive(day)} ${block}`
        : null;
    case NOW.SHORT:
      return all(group, act)
        ? `Finding a time for ${group} to have ${act}`
        : null;
    case NOW.FULL:
      return all(act, group, to, day, block)
        ? `${act} is full, so moving ${group} to ${to} for ${possessive(day)} ${block}`
        : null;
    case NOW.MOVE:
      return all(group, act, to, day, block)
        ? `Moving ${group} from ${act} to ${to} for ${possessive(day)} ${block}`
        : null;
    case NOW.SHIFT:
      return all(group, act, day, block)
        ? `Moving ${possessive(group)} ${act} to ${possessive(day)} ${block}`
        : null;
    case NOW.BLANK:
      return all(group, day, block)
        ? `Making sure ${group} has something in ${possessive(day)} ${block}`
        : null;
    case NOW.SEARCH:
      return all(group, day)
        ? `Checking every way to fill ${possessive(group)} ${day}`
        : null;
    case NOW.SEARCH_DAY:
      return day ? `Checking every way to fill ${day}` : null;
    case NOW.NEEDED:
      return day
        ? `Rearranging ${day} so each ${t.sIn("Group")} gets what it still needs`
        : null;
    case NOW.AGAIN:
      return `Trying a second way, to keep the better ${t.sIn("Week")}`;
    case NOW.IMPORTED:
      return `Building from the imported ${t.sIn("Week")}, to compare`;
    default:
      return null;
  }
}
