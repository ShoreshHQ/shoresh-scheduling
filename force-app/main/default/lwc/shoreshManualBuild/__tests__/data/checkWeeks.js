/** Small synthetic weeks for the checks' tests, from rows of slot identities. */
import { weekdayOf } from "../../checks";

const NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = [
  { id: "t1", name: "Period 1", startTime: "09:00", endTime: "10:00" },
  { id: "t2", name: "Period 2", startTime: "10:00", endTime: "11:00" },
  { id: "t3", name: "Lunch", startTime: "12:00", endTime: "12:45" }
];

export function dayName(dateValue) {
  return NAMES[weekdayOf(dateValue)];
}

/**
 * A day from rows of identities ('' Open, 'A:swim', '^A:swim', 'F:flag', 'E:Chugim'), one row
 * per group (Bunk 1, Bunk 2, …).
 */
export function dayOf(dateValue, rows, blocks) {
  const items = [];
  const tokens = rows.map((row) =>
    row
      .map((slot) => {
        if (slot === "") {
          return "";
        }
        if (slot.startsWith("^")) {
          return "^";
        }
        const colon = slot.indexOf(":");
        const kind = slot.slice(0, colon);
        const rest = slot.slice(colon + 1);
        const setUp = ["A", "F", "R"].includes(kind);
        let i = items.findIndex(
          (it) => it.kind === kind && (setUp ? it.id : it.name) === rest
        );
        if (i < 0) {
          items.push({ kind, id: rest, name: rest });
          i = items.length - 1;
        }
        return String(i + 1);
      })
      .join(",")
  );
  return {
    dateValue,
    blocks,
    groups: rows.map((_, g) => ({ id: `g${g + 1}`, name: `Bunk ${g + 1}` })),
    items,
    rows: tokens
  };
}

/** Days in date order from { date: rows }; options: blocks, or width (the first N blocks). */
export function weekOf(byDate, options = {}) {
  const blocks = options.blocks || BLOCKS.slice(0, options.width || 3);
  return Object.keys(byDate)
    .sort()
    .map((date) => dayOf(date, byDate[date], blocks));
}
