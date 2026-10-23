/**
 * What Import last year's one page shows as quiet counts (wiki decision 56, design-research
 * screens-r1 import-review-a and import-done): how many of each kind the save will add, each
 * opening into its names, and the small picture of last year's schedule.
 */

// The kinds in the order the tiles show them (the mock-up's order, then the rest).
const KINDS = [
  ["groups", "Group"],
  ["divisions", "Division"],
  ["timeBlocks", "TimeBlock"],
  ["activities", "Activity"],
  ["locations", "Location"],
  ["fixedActivities", "FixedActivity"],
  ["recurringActivities", "RecurringActivity"],
  ["programs", "Program"]
];

const ORDER = [...KINDS.map(([, term]) => term), "Week"];

/** One tile: the number, and the kind in the camp's words (one or many). */
function tile(term, names, t) {
  const n = names.length;
  return {
    key: term,
    count: n,
    label: n === 1 ? t.s(term) : t.p(term),
    spoken: `${n} ${n === 1 ? t.sIn(term) : t.pIn(term)}`,
    names
  };
}

/**
 * What the plan adds, kind by kind: [{ key, count, label, names }], only kinds with something
 * new. A record the plan only changes (it has an Id) is not counted: it is a question answered.
 */
export function comingIn(plan, t) {
  if (!plan) {
    return [];
  }
  const tiles = KINDS.map(([list, term]) =>
    tile(
      term,
      (plan[list] || []).filter((r) => !r.id).map((r) => r.name || ""),
      t
    )
  );
  tiles.push(
    tile(
      "Week",
      (plan.fillWeeks || []).map((w) => w.name || ""),
      t
    )
  );
  return tiles.filter((x) => x.count > 0);
}

/**
 * The save's own counts by model term ("Group" -> 6) as tiles, in the same order. The version
 * is shown under Last year's schedule, not as a tile.
 */
export function countTiles(counts, t) {
  const terms = Object.keys(counts || {}).filter((term) => term !== "Version");
  terms.sort((a, b) => {
    const ia = ORDER.indexOf(a) < 0 ? ORDER.length : ORDER.indexOf(a);
    const ib = ORDER.indexOf(b) < 0 ? ORDER.length : ORDER.indexOf(b);
    return ia - ib || a.localeCompare(b);
  });
  return terms.map((term) => {
    const n = counts[term];
    return {
      key: term,
      count: n,
      label: n === 1 ? t.s(term) : t.p(term),
      spoken: `${n} ${n === 1 ? t.sIn(term) : t.pIn(term)}`,
      names: []
    };
  });
}

export function total(tiles) {
  return tiles.reduce((sum, x) => sum + x.count, 0);
}

const MAX = 8;

/**
 * Last year's schedule drawn small (its first day): a row per time block, a column per group, at
 * most eight of each. A set-time cell is filled with the primary, an activity is a well, and a
 * special day, event, elective or trip (noted, not set up) is a dashed outline, as the mock-up
 * draws them. Decoration only: the words beside it say what it is.
 */
export function miniCells(version) {
  const day = version && version.days && version.days[0];
  if (!day) {
    return { columns: 0, cells: [] };
  }
  const grid = day.grid;
  const rows = (grid.r || []).slice(0, MAX).map((r) => r.split(","));
  const blocks = Math.min(MAX, (grid.b || []).length);
  const cells = [];
  for (let b = 0; b < blocks; b++) {
    for (let g = 0; g < rows.length; g++) {
      let row = b;
      while (row > 0 && rows[g][row] === "^") {
        row--;
      }
      const at = rows[g][row];
      const item = at && at !== "^" ? grid.i[Number(at) - 1] : null;
      const kind = item ? item[0] : "";
      cells.push({
        key: `${b}|${g}`,
        className:
          kind === "F" || kind === "R"
            ? "mini-cell mini-cell_set"
            : kind === "A"
              ? "mini-cell"
              : kind
                ? "mini-cell mini-cell_noted"
                : "mini-cell mini-cell_empty"
      });
    }
  }
  return { columns: rows.length, cells };
}
