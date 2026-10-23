/**
 * Manual Build's moves, swaps, and length changes (desktop dragHandlers.js, useSpanExtendDrag.js),
 * worked out on rows of slot identities (slotEdits.js) and turned into the runs the server checks:
 * each change is made on a copy of the rows it touches, then compared with the original, so a run
 * covers exactly the slots that changed, widened to whole placements so it never cuts into one
 * (SlotSaves refuses that). A swap is refused when either side runs several blocks, as on the
 * desktop. A position is { day, group, block }: indexes into the schedule's days, that day's
 * groups, and its time blocks.
 */
import {
  OPEN,
  diffRuns,
  isMovable,
  isPlacedOverlay,
  placementIn,
  slots,
  staysPut
} from "./slotEdits";

const CARRIES_ON = "^";

/** Why a move can't be made (the page puts it into words). */
export const REFUSED = Object.freeze({
  SET_TIME: "setTime",
  AWAY: "away",
  SWAP_LONG: "swapLong",
  FIXED_HERE: "fixedHere",
  NO_SWAP: "noSwap",
  NO_ROOM: "noRoom"
});

/** Puts an item at a block for up to `length` blocks over Open, at-camp slots. Returns how many. */
function fill(row, start, slot, length, isAway) {
  let take = 0;
  while (
    take < length &&
    start + take < row.length &&
    row[start + take] === OPEN &&
    !isAway(start + take)
  ) {
    row[start + take] = take === 0 ? slot : CARRIES_ON + slot;
    take += 1;
  }
  return take;
}

/** Rows of the schedule by "day|group", copied when first touched, with their originals. */
export class Rows {
  constructor(days) {
    this.days = days;
    this.original = new Map();
    this.changed = new Map();
  }

  get(day, group) {
    const key = `${day}|${group}`;
    if (!this.changed.has(key)) {
      const row = slots(this.days[day], group);
      this.original.set(key, row);
      this.changed.set(key, [...row]);
    }
    return this.changed.get(key);
  }

  /** The runs that make the changes: { day, group, first, before, after }. */
  runs() {
    const result = [];
    this.changed.forEach((row, key) => {
      const [day, group] = key.split("|").map(Number);
      diffRuns(this.original.get(key), row).forEach((run) =>
        result.push({ day, group, ...run })
      );
    });
    return result;
  }
}

/**
 * Moves the placement at `from` to `to`: onto Open slots it moves, keeping its length (refused
 * where it doesn't fit), onto a filled slot the two swap. isAway(position) says a group isn't at camp in a block.
 * Returns { runs } or { refused } (one of REFUSED), or null when there is nothing to do.
 */
export function moveEdit(days, from, to, isAway, ownPlan = false) {
  const rows = new Rows(days);
  const source = rows.get(from.day, from.group);
  const p = placementIn(source, from.block);
  if (!isMovable(p.slot, ownPlan)) {
    return null;
  }
  const target = rows.get(to.day, to.group);
  const sameRow = target === source;
  if (sameRow && to.block >= p.first && to.block < p.first + p.length) {
    return null;
  }
  const q = placementIn(target, to.block);
  if (staysPut(q.slot, ownPlan)) {
    return { refused: REFUSED.SET_TIME };
  }
  if (q.slot === OPEN) {
    if (isAway({ ...to, block: to.block })) {
      return { refused: REFUSED.AWAY };
    }
    for (let b = p.first; b < p.first + p.length; b++) {
      source[b] = OPEN;
    }
    // A move keeps the placement's length; somewhere too short for it is refused, not cut.
    const placed = fill(target, to.block, p.slot, p.length, (b) =>
      isAway({ ...to, block: b })
    );
    if (placed < p.length) {
      return { refused: REFUSED.NO_ROOM };
    }
    return { runs: rows.runs() };
  }
  // A swap puts something at both ends: neither may be where its bunk isn't at camp.
  if (isAway({ ...to, block: q.first })) {
    return { refused: REFUSED.AWAY, at: to };
  }
  if (isAway({ ...from, block: p.first })) {
    return { refused: REFUSED.AWAY, at: from };
  }
  if (isPlacedOverlay(q.slot)) {
    // An elective set or a special event never swaps (desktop useSlotMutations.js; ADR 0018
    // slice E5): the activity goes to an empty cell instead.
    return { refused: REFUSED.NO_SWAP };
  }
  if (!isMovable(q.slot, ownPlan)) {
    // Something noted from a file but not set up yet: it stays where it is.
    return { refused: REFUSED.FIXED_HERE };
  }
  if (p.length > 1 || q.length > 1) {
    return { refused: REFUSED.SWAP_LONG };
  }
  source[p.first] = q.slot;
  target[q.first] = p.slot;
  return { runs: rows.runs() };
}

/** Takes the placement at `from` out of the week (dragged back to the list). */
export function removeEdit(days, from, ownPlan = false) {
  const rows = new Rows(days);
  const row = rows.get(from.day, from.group);
  const p = placementIn(row, from.block);
  if (!isMovable(p.slot, ownPlan)) {
    return null;
  }
  for (let b = p.first; b < p.first + p.length; b++) {
    row[b] = OPEN;
  }
  return { runs: rows.runs() };
}

/**
 * Makes the placement at `at` end at `lastBlock` (shorter, or longer over Open, at-camp slots).
 * Returns { runs }, { refused: NO_ROOM } when it can't reach, or null when nothing changes.
 */
export function resizeEdit(days, at, lastBlock, isAway, ownPlan = false) {
  const rows = new Rows(days);
  const row = rows.get(at.day, at.group);
  const p = placementIn(row, at.block);
  if (!isMovable(p.slot, ownPlan) || lastBlock < p.first) {
    return null;
  }
  const length = lastBlock - p.first + 1;
  for (let b = p.first + 1; b < p.first + p.length; b++) {
    row[b] = OPEN;
  }
  let reached = 1;
  while (
    reached < length &&
    p.first + reached < row.length &&
    row[p.first + reached] === OPEN &&
    !isAway({ ...at, block: p.first + reached })
  ) {
    row[p.first + reached] = CARRIES_ON + p.slot;
    reached += 1;
  }
  if (reached < length) {
    return { refused: REFUSED.NO_ROOM };
  }
  const runs = rows.runs();
  return runs.length ? { runs } : null;
}

/** The runs that undo runs: in reverse order, each back to what it held. */
export function inverse(runs) {
  return [...runs]
    .reverse()
    .map((run) => ({ ...run, before: run.after, after: run.before }));
}
