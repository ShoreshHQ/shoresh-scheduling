/**
 * A saved schedule row (wiki data model, compact grid format version 1): one group's day, a cell
 * per time block, "" Open, a number for an item of the day's list from 1, or "^" (the item before
 * carries on). Read and written here for the engine (c/shoreshEngine grid.js, which re-exports
 * it) and every screen, so all of them read a row the same way.
 */

export const OPEN = "";
export const CARRIES_ON = "^";

/**
 * A saved row (one group's day: a cell per time block, "" Open, a number for an item of the
 * day's list from 1, "^" the item before carries on), read the one way every screen and the
 * engine read it: each cell null (Open) or { item, number, carriesOn }. Anything else is Open: a
 * token that is no item's number, and "^" with nothing before it to carry on.
 */
export function readRow(row, items) {
  let before = null;
  return String(row || "")
    .split(",")
    .map((token) => {
      if (token === CARRIES_ON) {
        before = before && { ...before, carriesOn: true };
        return before;
      }
      const item = /^\d+$/.test(token)
        ? (items || [])[Number(token) - 1]
        : null;
      before = item ? { item, number: Number(token), carriesOn: false } : null;
      return before;
    });
}

/** A saved row from its cells (readRow's): "" Open, the item's number, "^" carrying on. */
export function writeRow(cells) {
  return cells
    .map((cell) => {
      if (!cell) {
        return OPEN;
      }
      return cell.carriesOn ? CARRIES_ON : String(cell.number);
    })
    .join(",");
}
