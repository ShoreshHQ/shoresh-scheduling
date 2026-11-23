/**
 * Reading a day's rows (ADR 0005's grid format, as Manual Build's DayView has it): what each of a
 * group's cells holds, as an identity: '' (Open), "A:<Id>" for an item starting there (kind and
 * record Id; kind and name for things not set up yet), or '^' and the identity of the item
 * carrying on into it. Every screen reads and writes a saved row here (readRow, writeRow), and
 * Apex SlotIds reads it the same way (both pass staticresources/ShoreshCellExamples.json).
 */

export const OPEN = "";
export const CARRIES_ON = "^";
/** The kinds a cell's identity starts with. */
export const KIND = Object.freeze({
  ACTIVITY: "A",
  FIXED: "F",
  RECURRING: "R",
  EVENT: "S",
  SPECIAL_DAY: "D",
  ELECTIVE_SET: "E"
});
const SET_UP = new Set([KIND.ACTIVITY, KIND.FIXED, KIND.RECURRING]);
const SET_UP_LATER = new Set([KIND.EVENT, KIND.SPECIAL_DAY, KIND.ELECTIVE_SET]);

export function identity(item) {
  // A special event or day (ADR 0014 slice 4) or an elective set (ADR 0018 slice E5) with its
  // record is that record; one noted from a file is its name.
  const byRecord =
    SET_UP.has(item.kind) || (SET_UP_LATER.has(item.kind) && Boolean(item.id));
  return `${item.kind}:${byRecord ? item.id : item.name}`;
}

/** The item a cell belongs to, whether it starts there or carries on into it. */
export function owner(slot) {
  return isCarryOn(slot) ? slot.slice(CARRIES_ON.length) : slot;
}

export function isCarryOn(slot) {
  return slot.startsWith(CARRIES_ON);
}

/** A fixed or recurring activity, starting in the cell or carrying on into it. */
export function isSetTime(slot) {
  const item = owner(slot);
  return (
    item.startsWith(`${KIND.FIXED}:`) || item.startsWith(`${KIND.RECURRING}:`)
  );
}

/** Whether an activity starts in the cell (not one carrying on into it). */
export function startsActivity(slot) {
  return slot.startsWith(`${KIND.ACTIVITY}:`);
}

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

/** What each of group g's cells holds on a day. */
export function slots(day, g) {
  return readRow((day.rows || [])[g], day.items).map((cell) => {
    if (!cell) {
      return OPEN;
    }
    return (cell.carriesOn ? CARRIES_ON : "") + identity(cell.item);
  });
}
