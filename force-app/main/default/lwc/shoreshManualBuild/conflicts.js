/**
 * "Keep theirs or use yours", worked out without positions (ADR 0008 §21).
 *
 * An edit's intent is what the director chose, cell by cell, and what they saw. Each cell is named
 * by its day, group, and time block Id (never by its position in the day, which moves when a
 * time block is added), with what it should hold. Next to the cells is the director's view of
 * every row they touch, also by time block Id. The intent travels with the edit through
 * everything that can happen to it: a question, Use yours, a second question.
 *
 * When someone else's change got in the way, plan() makes the intent on the server's week as it
 * is now: the director's cells, and anything of theirs those cells overlap cleared in full (so
 * nothing is left cut short). Its rows are every cell that would change from what is there now
 * while what is there now isn't what the director saw. Its runs are exactly what Use yours sends.
 * Both come from the same comparison, so every cell someone else changed is shown before anything
 * of theirs is replaced, and nothing is replaced that wasn't shown.
 */
import { OPEN, diffRuns, placementIn, slots } from "./slotEdits";

const CARRIES_ON = "^";

function rowKey(dateValue, groupId) {
  return `${dateValue}|${groupId}`;
}

/** Where a day and group are in a week, or null. */
function locateRow(days, dateValue, groupId) {
  const dayIndex = days.findIndex((d) => d.dateValue === dateValue);
  const day = days[dayIndex];
  const g = day ? day.groups.findIndex((grp) => grp.id === groupId) : -1;
  return g < 0 ? null : { dayIndex, day, g };
}

/**
 * The intent of runs (as the server takes them) made on `days` (the week on screen when the edit
 * was made). nameOf({ dayIndex, g, block }) names a cell ("Bunk 1 · Monday · Lunch"), kept so a
 * cell that later leaves the week can still be named.
 */
export function intentOf(days, runs, nameOf) {
  const cells = [];
  const seen = {};
  runs.forEach((run, r) => {
    const at = locateRow(days, run.day, run.groupId);
    if (!at) {
      return;
    }
    const first = at.day.blocks.findIndex((b) => b.id === run.firstBlockId);
    const key = rowKey(run.day, run.groupId);
    if (!seen[key]) {
      const row = slots(at.day, at.g);
      seen[key] = {};
      at.day.blocks.forEach((block, b) => {
        seen[key][block.id] = row[b];
      });
    }
    run.after.forEach((after, i) => {
      const block = at.day.blocks[first + i];
      cells.push({
        run: r,
        day: run.day,
        groupId: run.groupId,
        blockId: block.id,
        after,
        name: nameOf
          ? nameOf({ dayIndex: at.dayIndex, g: at.g, block: first + i })
          : ""
      });
    });
  });
  return { cells, seen };
}

/**
 * The intent after Use yours: the director has now seen what the question showed, so a second
 * question compares against that.
 */
export function withSeen(intent, rows) {
  const seen = {};
  Object.keys(intent.seen).forEach((key) => {
    seen[key] = { ...intent.seen[key] };
  });
  rows.forEach((row) => {
    const key = rowKey(row.day, row.groupId);
    seen[key] = { ...(seen[key] || {}), [row.blockId]: row.theirs };
  });
  return { cells: intent.cells, seen };
}

/** Clears a carry-on left without what it carries on (its start was cleared). */
function dropOrphans(row) {
  for (let b = 0; b < row.length; b++) {
    if (
      row[b].startsWith(CARRIES_ON) &&
      (b === 0 || (row[b - 1] !== row[b].slice(1) && row[b - 1] !== row[b]))
    ) {
      row[b] = OPEN;
    }
  }
}

/**
 * The intent made on `days` (the server's week now): { runs, rows } or { gone } (the first cell
 * that left the week, or whose blocks are no longer next to each other: a time block was added
 * inside it). runs: as the server takes them. rows: { day, groupId, blockId, block, dayIndex, g,
 * theirs, yours }, slot identities.
 */
export function plan(days, intent) {
  const byRow = new Map();
  intent.cells.forEach((cell) => {
    const key = rowKey(cell.day, cell.groupId);
    if (!byRow.has(key)) {
      byRow.set(key, []);
    }
    byRow.get(key).push(cell);
  });
  const runs = [];
  const rows = [];
  for (const [key, cells] of byRow) {
    const at = locateRow(days, cells[0].day, cells[0].groupId);
    if (!at) {
      return { gone: cells[0] };
    }
    const positions = cells.map((cell) =>
      at.day.blocks.findIndex((b) => b.id === cell.blockId)
    );
    const missing = positions.findIndex((p) => p < 0);
    if (missing >= 0) {
      return { gone: cells[missing] };
    }
    // Cells of one run were next to each other; a block added between them breaks a placement.
    for (let i = 1; i < cells.length; i++) {
      if (
        cells[i].run === cells[i - 1].run &&
        positions[i] !== positions[i - 1] + 1
      ) {
        return { gone: cells[i] };
      }
    }
    const now = slots(at.day, at.g);
    const next = [...now];
    positions.forEach((p) => {
      if (now[p] !== OPEN) {
        const theirs = placementIn(now, p);
        for (let b = theirs.first; b < theirs.first + theirs.length; b++) {
          next[b] = OPEN;
        }
      }
    });
    cells.forEach((cell, i) => {
      next[positions[i]] = cell.after;
    });
    dropOrphans(next);
    const seen = intent.seen[key] || {};
    diffRuns(now, next).forEach((run) => {
      runs.push({
        day: cells[0].day,
        groupId: cells[0].groupId,
        firstBlockId: at.day.blocks[run.first].id,
        before: run.before,
        after: run.after
      });
      run.before.forEach((theirs, i) => {
        const block = run.first + i;
        const blockId = at.day.blocks[block].id;
        if (theirs !== run.after[i] && seen[blockId] !== theirs) {
          rows.push({
            day: cells[0].day,
            groupId: cells[0].groupId,
            blockId,
            block,
            dayIndex: at.dayIndex,
            g: at.g,
            theirs,
            yours: run.after[i]
          });
        }
      });
    });
  }
  return { runs, rows };
}
