/**
 * One special day's or event's schedule from a file (ADR 0014 choice 17; desktop ADR
 * 2026-08-22-event-schedule-import): the import's own reader (c/shoreshImportEngine) turns the
 * file into pages, and the first page becomes what SpecialScheduleController.importPlan takes:
 * its time blocks down (each with a start and an end), its columns across, and in each cell a
 * name, '' (nothing) or '^' (the cell above carries on, from a merged cell). Pure.
 *
 * Nothing is left out quietly: rows with no time, and places written in cells ("Swim (Pool)",
 * which a special schedule doesn't keep), are counted for the screen to say.
 */
import {
  blockFromLabel,
  cellName,
  clock,
  filesToPages
} from "c/shoreshImportEngine";

export const CARRIES_ON = "^";

/** A file read by the import's reader ({ name, sheets }) as its schedule pages. */
export function pagesOf(file) {
  return filesToPages([file]).pages;
}

/**
 * A page as one schedule: { imported: { blocks, columns }, noTimes: [labels], places: count }.
 * A row whose label has only a start ends where the next row starts; one with no time at all,
 * or no end to give it, is left out (a schedule's time blocks have times).
 */
export function planFromPage(page) {
  const rows = ((page && page.rows) || []).map((row) => ({
    row,
    block: blockFromLabel(row.label)
  }));
  const kept = [];
  const noTimes = [];
  rows.forEach((entry, i) => {
    const { block } = entry;
    let end = block.end;
    if (block.start !== null && end === null) {
      const next = rows.slice(i + 1).find((n) => n.block.start !== null);
      end = next && next.block.start > block.start ? next.block.start : null;
    }
    if (block.start === null || end === null) {
      noTimes.push(block.label);
      return;
    }
    kept.push({ index: i, block, end });
  });
  const keptAt = new Map(kept.map((k) => [k.index, k]));
  let places = 0;
  const columns = ((page && page.columns) || []).map((heading, c) => {
    const cells = [];
    let carry = 0;
    rows.forEach((entry, i) => {
      const here = keptAt.has(i);
      if (carry > 0) {
        carry -= 1;
        if (here) {
          cells.push(cells.length && cells[cells.length - 1] ? CARRIES_ON : "");
        }
        return;
      }
      const named = cellName(entry.row.cells[c]);
      const span = (entry.row.spans && entry.row.spans[c]) || 1;
      carry = named ? span - 1 : 0;
      if (!here) {
        return;
      }
      if (named && named.place) {
        places += 1;
      }
      cells.push(named ? named.name : "");
    });
    return { name: heading || "", cells };
  });
  return {
    imported: {
      blocks: kept.map(({ block, end }) => ({
        // A label that is only its times ("9:00-9:45") gives no name: the server names it by them.
        name: block.name === block.label ? "" : block.name,
        startTime: clock(block.start),
        endTime: clock(end)
      })),
      columns
    },
    noTimes,
    places
  };
}
