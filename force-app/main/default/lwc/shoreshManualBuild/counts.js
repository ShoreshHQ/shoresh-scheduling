/**
 * The activity list's counts (desktop ActivityPalette.jsx): how often each activity is placed this
 * week, against its weekly targets. In Group View it counts one group, against the activity's own
 * times a week; in Daily View the whole camp, against those times multiplied by the number of
 * groups it is set up for. A multi-block placement counts once. Activities still under their
 * minimum come first, then the rest, each by name. Over the maximum is never blocked (Greg,
 * 2026-10-17): its count gets the bronze dot. Which group a chip sits in and its dot follow the
 * numbers its own words show, as on the desktop (Greg, round 2 decision 8: palette counts work as
 * on the desktop). What is placed comes from the engine's checkWeek (c/shoreshEngine).
 */
/** "2 placed (needs 3–5)", "14 placed (needs 6+)", "4 placed (up to 5)". */
export function countLabel(count, target, cap) {
  let needs = null;
  if (target > 0) {
    if (cap === null) {
      needs = `needs ${target}+`;
    } else {
      needs = target === cap ? `needs ${target}` : `needs ${target}–${cap}`;
    }
  } else if (cap !== null && cap > 0) {
    needs = `up to ${cap}`;
  }
  return `${count} placed${needs ? ` (${needs})` : ""}`;
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
 * The list: { stillNeeded, placed }, each chip { id, name, length, count, label, over }. checked:
 * checkWeek's answer for the week (its placements). groupId: the group in Group View, or null for
 * the whole camp. filter: what was typed in the list's Filter box (spaces and capitals aside).
 */
export function paletteChips(schedule, checked, activities, groupId, filter) {
  const mine = ((checked && checked.placements) || []).filter(
    (p) => p.kind === "A" && (!groupId || p.groupId === groupId)
  );
  const groupIds = weekGroupIds(schedule);
  const typed = String(filter || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const chips = (activities || [])
    .filter(
      (a) => !typed || a.name.replace(/\s+/g, "").toLowerCase().includes(typed)
    )
    .map((a) => {
      const notFor = a.notFor || [];
      // Group View: the bunk's own times a week, whoever it is set up for (desktop scaleFor;
      // the grid's dot says "not set up"). Daily View: times the bunks it is set up for.
      const scale = groupId
        ? 1
        : groupIds.filter((id) => !notFor.includes(id)).length;
      const target = (a.minPerWeek || 0) * scale;
      const cap =
        a.maxPerWeek === null || a.maxPerWeek === undefined
          ? null
          : a.maxPerWeek * scale;
      const count = mine.filter((p) => p.id === a.id).length;
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
