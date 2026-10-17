/**
 * Manual Build's edits, worked out on one group's day as the server sends it
 * (ManualBuildController): what each slot holds, and the run of slots an edit changes, with what
 * they held when the director saw them (the server makes the edit only if they still hold that;
 * SlotSaves). A slot holds '' (Open), an item starting there ('A:<Id>'; kind and record Id, or kind
 * and name for things not set up yet), or '^' and the item carrying on into it.
 */

export const OPEN = "";
const CARRIES_ON = "^";
const SET_UP = new Set(["A", "F", "R"]);

export function identity(item) {
  return `${item.kind}:${SET_UP.has(item.kind) ? item.id : item.name}`;
}

/** The item a slot belongs to, whether it starts there or carries on into it. */
export function owner(slot) {
  return slot.startsWith(CARRIES_ON) ? slot.slice(1) : slot;
}

export function isSetTime(slot) {
  const item = owner(slot);
  return item.startsWith("F:") || item.startsWith("R:");
}

/** What each of a group's slots holds on a day. */
export function slots(day, g) {
  let carrying = OPEN;
  return (day.rows[g] || "").split(",").map((token) => {
    if (token === CARRIES_ON) {
      return CARRIES_ON + carrying;
    }
    carrying = token ? identity(day.items[Number(token) - 1]) : OPEN;
    return carrying;
  });
}

/** The placement a slot is part of: its first block and length ('' for Open, length 1). */
export function placement(day, g, b) {
  const row = slots(day, g);
  if (row[b] === OPEN) {
    return { first: b, length: 1, slot: OPEN };
  }
  let first = b;
  while (first > 0 && row[first].startsWith(CARRIES_ON)) {
    first -= 1;
  }
  let length = 1;
  while (
    first + length < row.length &&
    row[first + length] === CARRIES_ON + row[first]
  ) {
    length += 1;
  }
  return { first, length, slot: row[first] };
}

/**
 * The run an edit changes: the whole placement the slot is part of, given to `next` (an item's
 * identity, or OPEN). An item runs for its length (Greg, 2026-10-17: multi-block fills its full
 * length) over Open slots, stopping at a filled slot, a slot where the group is away, or the end
 * of the day. Null when the slot can't be changed here: a fixed or recurring activity, or a
 * group away.
 */
export function editRun(day, g, b, next, length, isAway) {
  const row = slots(day, g);
  const at = placement(day, g, b);
  if (isSetTime(at.slot) || (next !== OPEN && isAway(b))) {
    return null;
  }
  let take = 0;
  if (next !== OPEN) {
    take = 1;
    while (
      take < (length || 1) &&
      at.first + take < row.length &&
      !isAway(at.first + take) &&
      (at.first + take < at.first + at.length || row[at.first + take] === OPEN)
    ) {
      take += 1;
    }
  }
  const size = Math.max(at.length, take);
  const after = [];
  for (let i = 0; i < size; i++) {
    if (i < take) {
      after.push(i === 0 ? next : CARRIES_ON + next);
    } else {
      after.push(OPEN);
    }
  }
  const before = row.slice(at.first, at.first + size);
  if (before.every((slot, i) => slot === after[i])) {
    return null;
  }
  return { first: at.first, before, after };
}

/**
 * The day with a run made, before the server answers, so the grid shows the edit at once. `named`
 * finds an item to add to the day's list ({ kind, id, name }) by its identity.
 */
export function applyRun(day, g, run, named) {
  const items = [...day.items];
  const tokens = (day.rows[g] || "").split(",");
  run.after.forEach((slot, i) => {
    const b = run.first + i;
    if (slot === OPEN) {
      tokens[b] = "";
    } else if (slot.startsWith(CARRIES_ON)) {
      tokens[b] = CARRIES_ON;
    } else {
      let index = items.findIndex((item) => identity(item) === slot);
      if (index < 0) {
        items.push({ ...named(slot), gone: false });
        index = items.length - 1;
      }
      tokens[b] = String(index + 1);
    }
  });
  const rows = [...day.rows];
  rows[g] = tokens.join(",");
  return { ...day, items, rows };
}
