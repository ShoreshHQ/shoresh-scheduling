/**
 * The drawer's tiles (wiki decisions 38 and 41, ADR 0008 part 8): one per activity, its name
 * only. The numbers come from the week's measure (c/shoreshEngine measureWeek), the same one
 * the rail's counter shows, so the drawer and the counter can never disagree: "N under" in the
 * drawer's time column is the measure's under count, an activity over its weekly limit carries
 * the needs-a-look corner, and on hover or hold a tile shows "placed of goal" in the counter's
 * dropdown's words. Activities still under their goal come first, then the rest, each by name
 * (as the desktop's ActivityPalette lists still needed first).
 *
 * In Daily View the measure is the camp's; in Group View the page measures the one bunk shown
 * (the desktop's palette counts one group there), so its tiles and "N under" are that bunk's.
 */

import { RULE, reasonFor } from "c/shoreshEngine";

/** Names compared the way people type them: spaces and capitals aside. */
function loose(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * "3 of 4": the counter dropdown's own row when the activity has one (under: what counts toward
 * the goal, of the goal; over: what the bunks past the limit have, of what they may have), else
 * every placement of it, of its goal; "2 placed" with no goal, or once past it. Empty when the week wasn't
 * measured for it (closed this week on Generated).
 */
function wordsFor(id, measure) {
  const row =
    measure.over.rows.find((r) => r.id === id) ||
    measure.under.rows.find((r) => r.id === id);
  if (row) {
    return `${row.placed} of ${row.goal}`;
  }
  const entry = measure.byActivity && measure.byActivity.get(id);
  if (!entry) {
    return "";
  }
  // Past its goal but within its limit: "3 placed" ("3 of 2" would read as over).
  return entry.goal > 0 && entry.placed <= entry.goal
    ? `${entry.placed} of ${entry.goal}`
    : `${entry.placed} placed`;
}

/**
 * The tiles: [{ id, name, length, under, over, words, said }]. measure: measureWeek's answer for
 * what the drawer counts. activities: those that can be placed ({ id, name, length }). filter:
 * what was typed in the drawer's Filter box.
 */
export function drawerTiles(measure, activities, filter) {
  const typed = loose(filter);
  const m = measure || {
    under: { rows: [] },
    over: { rows: [] },
    byActivity: new Map()
  };
  const tiles = (activities || [])
    .filter((a) => !typed || loose(a.name).includes(typed))
    .map((a) => {
      const entry = m.byActivity && m.byActivity.get(a.id);
      const under = !!entry && entry.short > 0;
      const over = !!entry && entry.extra > 0;
      const words = wordsFor(a.id, m);
      return {
        id: a.id,
        name: a.name,
        length: a.length,
        under,
        over,
        words,
        // What a screen reader hears on the tile: its name, its numbers, and the corner's words.
        said: [a.name, words, over ? reasonFor(RULE.WEEKLY_MAX) : null]
          .filter(Boolean)
          .join(", ")
      };
    });
  const byName = (x, y) => x.name.localeCompare(y.name);
  return [
    ...tiles.filter((t) => t.under).sort(byName),
    ...tiles.filter((t) => !t.under).sort(byName)
  ];
}
