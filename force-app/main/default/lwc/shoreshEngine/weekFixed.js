import { atCamp } from "./setup";
import { fillable } from "./weekOptions";

/**
 * Step 2 of the protocol (docs/engine/protocol.md): lay down what's fixed. Reads the grid the
 * build starts from: locked cells, fixed and recurring activities, special events and elective
 * sets, and in "fill the open cells" every filled cell, are kept as they are and counted in the
 * ledgers; locked Open cells and not-at-camp cells are set aside; every other cell is one the
 * build may fill (its options are step 3's, weekOptions.js).
 */

export function lockKey(date, groupId, blockId) {
  return `${date}|${groupId}|${blockId}`;
}

function keepRun(st, day, groupId, run) {
  const act = run.item.kind === "A" ? st.actById.get(run.item.id) : null;
  for (let i = 0; i < run.length; i++) {
    const blockId = day.blocks[run.first + i].id;
    const k = st.cellKey(groupId, day.index, blockId);
    st.keptKeys.add(k);
    st.keptCells.set(k, { item: run.item, head: i === 0 });
    if (run.item.kind === "F" || run.item.kind === "R") {
      st.occupy(
        st.setTimeLocation.get(run.item.id),
        groupId,
        day.index,
        blockId
      );
    } else if (run.item.kind === "E") {
      // An elective set is at each place of its offerings (ADR 0018 slice E5; desktop
      // registerOverlayOccupancy with electiveOccupancy.js), so the places it takes up are full
      // to that many fewer groups.
      st.electivePlaces
        .get(run.item.id)
        ?.forEach((placeId) => st.occupy(placeId, groupId, day.index, blockId));
    } else if (act) {
      st.assigned.set(k, act.id);
      if (i > 0) {
        st.spanTails.add(k);
      }
      st.occupy(act.locationId, groupId, day.index, blockId, act);
      st.joinActivity(act, groupId, day.index, blockId);
    }
  }
  if (act) {
    st.bump(st.usageCount, `${groupId}|${act.id}`, 1);
    st.bump(st.dailyUsage, `${groupId}|${day.index}|${act.id}`, 1);
  }
}

function readRow(st, grid, day, groupId, row) {
  const group = st.groups.get(groupId) || null;
  const runs = [];
  let current = null;
  row.forEach((token, b) => {
    if (token === "^" && current) {
      current.length += 1;
      return;
    }
    const item = /^\d+$/.test(token) ? day.items[Number(token) - 1] : null;
    current = item ? { first: b, length: 1, item } : null;
    if (current) {
      runs.push(current);
    }
  });
  const covered = new Set();
  for (const run of runs) {
    let locked = !group;
    for (let i = 0; i < run.length && !locked; i++) {
      locked = st.locks.has(
        lockKey(day.date, groupId, day.blocks[run.first + i].id)
      );
    }
    // A full build clears every activity that isn't locked; everything else stays.
    if (run.item.kind === "A" && !locked && !st.fillOpenOnly) {
      continue;
    }
    keepRun(st, day, groupId, run);
    for (let i = 0; i < run.length; i++) {
      covered.add(run.first + i);
    }
  }
  const open = [];
  row.forEach((token, b) => {
    if (covered.has(b)) {
      return;
    }
    const block = day.blocks[b];
    const k = st.cellKey(groupId, day.index, block.id);
    if (!group || st.locks.has(lockKey(day.date, groupId, block.id))) {
      grid.lockedOpen.add(k);
    } else if (!atCamp(group, block.partOfDay)) {
      grid.away.add(k);
    } else {
      open.push(b);
    }
  });
  const eligibleActs = st.acts.filter((a) =>
    st.eligibility.get(a.id).has(groupId)
  );
  const chosen = fillable(st, day, open, covered, eligibleActs);
  for (const b of open) {
    const slot = {
      groupId,
      dayIndex: day.index,
      blockId: day.blocks[b].id,
      eligibleActs
    };
    grid.freeSlots.push(slot);
    if (chosen.has(b)) {
      grid.openSlots.push(slot);
    } else {
      grid.busyThen.set(st.keyOf(slot), slot);
    }
  }
}

/**
 * Reads every group's row of every day into the ledgers, and puts on `st` the cells to fill:
 * openSlots (to fill now), freeSlots (every Open, at-camp, unlocked cell, in order), busyThen
 * (left out because the group is busy at an overlapping time), lockedOpen and away.
 */
export function readGrid(st) {
  const grid = {
    openSlots: [],
    freeSlots: [],
    busyThen: new Map(),
    lockedOpen: new Set(),
    away: new Set()
  };
  for (const groupId of st.model.groupIds) {
    for (const day of st.days) {
      if (day.tokens.has(groupId)) {
        readRow(st, grid, day, groupId, day.tokens.get(groupId));
      }
    }
  }
  Object.assign(st, grid);

  st.openSlotByKey = new Map(st.openSlots.map((s) => [st.keyOf(s), s]));
  st.emptyCells = st.openSlots.length;
  st.openSlotsByGroup = new Map();
  st.openSlotsByPeriod = new Map();
  for (const s of st.openSlots) {
    if (!st.openSlotsByGroup.has(s.groupId)) {
      st.openSlotsByGroup.set(s.groupId, []);
    }
    st.openSlotsByGroup.get(s.groupId).push(s);
    const pk = `${s.dayIndex}|${s.blockId}`;
    if (!st.openSlotsByPeriod.has(pk)) {
      st.openSlotsByPeriod.set(pk, []);
    }
    st.openSlotsByPeriod.get(pk).push(s);
  }
}
