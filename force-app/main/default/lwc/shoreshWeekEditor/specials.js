/**
 * Special days and events on a week (ADR 0014 slice 4; desktop ADRs
 * 2026-08-22-events-overlay-placement and 2026-10-09-special-day-binds-to-a-week-day), worked out
 * on the week as the server sends it (ManualBuildViews.DraftView's specials). Pure: no screen.
 *
 * - A special day replaces its day for the whole camp: that day shows the special day's own
 *   schedule, read-only, and nothing on the week's grid for it is drawn, checked or counted.
 * - A special event covers the bunks and time blocks chosen: each bunk's cells hold it, and in
 *   Daily View bunks side by side holding it over the same blocks are drawn as one named cell.
 */
import { dailyGrid } from "c/shoreshScheduleViews";
import { OPEN, placementIn, rebaseRun, slots, staysPut } from "./slotEdits";

const NO_SPECIALS = { days: [] };

/** The week's specials, or none. */
export function specialsOf(draft) {
  return (draft && draft.specials) || NO_SPECIALS;
}

/** The days a special day replaces, by date ("YYYY-MM-DD"). */
export function replacedDays(draft) {
  return new Map(specialsOf(draft).days.map((day) => [day.dateValue, day]));
}

/**
 * A replaced day's grid: the special day's own time blocks and the program's bunks, read-only
 * (no slots: nothing on it is changed here). Every cell sits flat (it is the special day's, edited
 * there), the same thing over the same blocks in bunks side by side is one cell (mockup
 * placed-day.png), and a fixed or recurring activity keeps its padlock. Null when it can't be
 * shown (plan.problem) or has no time blocks yet.
 */
export function planGrid(replaced, t) {
  const plan = replaced && replaced.plan;
  if (!plan || plan.problem || !(plan.blocks || []).length) {
    return null;
  }
  const grid = dailyGrid({ days: [plan] }, 0, t);
  if (!grid) {
    return null;
  }
  return {
    ...grid,
    cells: grid.cells.map((cell) => ({
      key: `plan-${cell.key}`,
      row: cell.row,
      column: cell.column,
      length: cell.length,
      style: cell.style,
      text: cell.text,
      title: cell.title,
      note: cell.note,
      gone: cell.gone,
      open: cell.open,
      setTime: cell.setTime,
      event: cell.event,
      className: cell.open ? "cell cell_open" : "cell cell_plan",
      mergeKey: cell.open
        ? null
        : `${cell.text}|${cell.row}|${cell.length}|${cell.setTime ? 1 : 0}`
    }))
  };
}

/**
 * The bunks' runs of time blocks a set of cells covers: for each bunk's day, from the first block
 * any of them starts in to the last any of them covers. cells: { slot: { day, group, block } }.
 */
export function rowsCovered(days, cells) {
  const byRow = new Map();
  cells.forEach(({ slot }) => {
    const row = slots(days[slot.day], slot.group);
    const at = placementIn(row, slot.block);
    const last = at.slot === OPEN ? slot.block : at.first + at.length - 1;
    const first = at.slot === OPEN ? slot.block : at.first;
    const key = `${slot.day}|${slot.group}`;
    const was = byRow.get(key);
    byRow.set(key, {
      day: slot.day,
      group: slot.group,
      first: was ? Math.min(was.first, first) : first,
      last: was ? Math.max(was.last, last) : last
    });
  });
  return [...byRow.values()];
}

/**
 * The runs that put an event ("S:<Id>") over the rows' blocks (rowsCovered), each bunk's run
 * holding it for every block, whatever was there going in full (nothing is left cut short).
 * Returns { runs } or, when a block can't take it, { refused, at }: "setTime" (a fixed or
 * recurring activity, which stays where setup puts it), "away" (the bunk isn't at camp), or
 * "locked". checks: isAway(slot) and isLocked(slot), on { day, group, block }.
 */
export function eventRuns(days, rows, event, checks) {
  const runs = [];
  for (const target of rows) {
    const row = slots(days[target.day], target.group);
    for (let b = target.first; b <= target.last; b++) {
      const at = { day: target.day, group: target.group, block: b };
      if (staysPut(row[b])) {
        return { refused: "setTime", at };
      }
      if (checks.isAway(at)) {
        return { refused: "away", at };
      }
      if (checks.isLocked(at)) {
        return { refused: "locked", at };
      }
    }
    const after = [];
    for (let b = target.first; b <= target.last; b++) {
      after.push(b === target.first ? event : `^${event}`);
    }
    const run = rebaseRun(row, target.first, after);
    if (run) {
      runs.push({ day: target.day, group: target.group, ...run });
    }
  }
  return { runs };
}

/** The cells in a grid drawn as one with this one (the same event side by side), in order. */
export function mergedWith(cells, cell) {
  if (!cell || !cell.mergeKey) {
    return cell ? [cell] : [];
  }
  const look = (c) => `${!!c.locked}|${c.dot || ""}`;
  const same = cells
    .filter(
      (c) =>
        c.mergeKey === cell.mergeKey &&
        c.row === cell.row &&
        look(c) === look(cell)
    )
    .sort((a, b) => a.column - b.column);
  const at = same.findIndex((c) => c.key === cell.key);
  let first = at;
  let last = at;
  while (first > 0 && same[first - 1].column === same[first].column - 1) {
    first -= 1;
  }
  while (
    last + 1 < same.length &&
    same[last + 1].column === same[last].column + 1
  ) {
    last += 1;
  }
  return same.slice(first, last + 1);
}
