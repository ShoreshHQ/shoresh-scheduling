/**
 * Reading a day's rows (ADR 0005's grid format, as Manual Build's DayView has it): what each of a
 * group's cells holds, as an identity: '' (Open), "A:<Id>" for an item starting there (kind and
 * record Id; kind and name for things not set up yet), or '^' and the identity of the item
 * carrying on into it. The same identities as Manual Build's slotEdits.js, without depending on
 * the screen.
 */

export const OPEN = "";
export const CARRIES_ON = "^";
const SET_UP = new Set(["A", "F", "R"]);
const SET_UP_LATER = new Set(["S", "D", "E"]);

export function identity(item) {
  // A special event or day (ADR 0014 slice 4) or an elective set (ADR 0018 slice E5) with its
  // record is that record; one noted from a file is its name.
  const byRecord =
    SET_UP.has(item.kind) || (SET_UP_LATER.has(item.kind) && Boolean(item.id));
  return `${item.kind}:${byRecord ? item.id : item.name}`;
}

/** What each of group g's cells holds on a day. */
export function slots(day, g) {
  let carrying = OPEN;
  return String((day.rows || [])[g] || "")
    .split(",")
    .map((token) => {
      if (token === CARRIES_ON) {
        return carrying ? CARRIES_ON + carrying : OPEN;
      }
      const item = /^\d+$/.test(token) ? day.items[Number(token) - 1] : null;
      carrying = item ? identity(item) : OPEN;
      return carrying;
    });
}
