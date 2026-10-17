/**
 * The activity list's counts (desktop ActivityPalette.jsx): how often each activity is placed this
 * week, against its weekly targets. In Group View it counts one group, against the activity's own
 * times a week; in Daily View the whole camp, against those times multiplied by the number of
 * groups it is set up for. A multi-block placement counts once. Activities still under their
 * minimum come first, then the rest, each by name. Over the maximum is never blocked (Greg,
 * 2026-10-17): its count gets the bronze dot.
 */
import { slots } from "./slotEdits";

/** "2 placed (needs 3–5)", "14 placed (needs 6+)", "4 placed (up to 5)". */
export function countLabel(count, target, cap) {
  let needs = null;
  if (target > 0) {
    if (cap === null) {
      needs = `needs ${target}+`;
    } else {
      needs = target === cap ? `needs ${target}` : `needs ${target}–${cap}`;
    }
  } else if (cap !== null) {
    needs = `up to ${cap}`;
  }
  return `${count} placed${needs ? ` (${needs})` : ""}`;
}

/** How many placements of each activity start in the week, for one group or all. */
function placedCounts(schedule, groupId) {
  const counts = new Map();
  ((schedule && schedule.days) || [])
    .filter((day) => !day.problem)
    .forEach((day) =>
      day.groups.forEach((grp, g) => {
        if (groupId && grp.id !== groupId) {
          return;
        }
        slots(day, g)
          .filter((slot) => slot.startsWith("A:"))
          .forEach((slot) => counts.set(slot, (counts.get(slot) || 0) + 1));
      })
    );
  return counts;
}

/** Every group in the week, by id. */
function weekGroupIds(schedule) {
  const ids = new Set();
  ((schedule && schedule.days) || []).forEach((day) =>
    (day.groups || []).forEach((grp) => ids.add(grp.id))
  );
  return [...ids];
}

/**
 * The list: { stillNeeded, placed }, each chip { id, name, length, count, label, over }. filter:
 * what was typed in the list's Filter box (spaces and capitals aside).
 */
export function paletteChips(schedule, activities, groupId, filter) {
  const counts = placedCounts(schedule, groupId);
  const groupIds = weekGroupIds(schedule);
  const typed = String(filter || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const chips = (activities || [])
    .filter(
      (a) =>
        !typed ||
        a.name.replace(/\s+/g, "").toLowerCase().includes(typed)
    )
    .map((a) => {
      const scale = groupId
        ? 1
        : groupIds.filter((id) => !(a.notFor || []).includes(id)).length;
      const target = (a.minPerWeek || 0) * scale;
      const cap =
        a.maxPerWeek === null || a.maxPerWeek === undefined
          ? null
          : a.maxPerWeek * scale;
      const count = counts.get(`A:${a.id}`) || 0;
      return {
        id: a.id,
        name: a.name,
        length: a.length,
        count,
        label: countLabel(count, target, cap),
        over: cap !== null && count > cap,
        needed: target > 0 && count < target
      };
    });
  const byName = (x, y) => x.name.localeCompare(y.name);
  return {
    stillNeeded: chips.filter((c) => c.needed).sort(byName),
    placed: chips.filter((c) => !c.needed).sort(byName)
  };
}
