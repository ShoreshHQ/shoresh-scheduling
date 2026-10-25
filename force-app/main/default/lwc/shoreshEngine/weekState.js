/**
 * One week build's ledgers: what is in each cell, how often each group has had each activity,
 * who is at each place and activity at each block, and the two moves every step makes, place()
 * and its exact inverse unplace(). Every step (week.js lists them) reads and writes this one
 * object; none keeps ledgers of its own.
 */

/** Block id -> ids of the day's blocks whose clock times overlap it (touching ones don't). */
function overlappingPeers(blocks) {
  const peers = new Map();
  const timed = blocks.filter(
    (b) => b.start != null && b.end != null && b.end > b.start
  );
  for (const x of timed) {
    for (const y of timed) {
      if (x.id !== y.id && x.start < y.end && y.start < x.end) {
        if (!peers.has(x.id)) {
          peers.set(x.id, []);
        }
        peers.get(x.id).push(y.id);
      }
    }
  }
  return peers;
}

export function createWeekState(model) {
  const { days, groups, acts } = model;
  const actById = new Map(acts.map((a) => [a.id, a]));
  const cellKey = (g, d, b) => `${g}|${d}|${b}`;
  const blocksOf = (d) => days[d].blocks;
  const blockIdx = (d, b) => days[d].blockIndex.get(b);

  const st = {
    model,
    days,
    groups,
    acts,
    eligibility: model.eligibility,
    fit: model.fit,
    setTimeLocation: model.setTimeLocation,
    locks: model.locks,
    // Each elective set's places (readElectivePlaces), for the elective cells kept.
    electivePlaces: model.electivePlaces || new Map(),
    fillOpenOnly: model.mode === "fillOpen",
    // The minimum repair may leave a cell for never-blank (model.strictRepair turns it off), and
    // whether any chain it kept did so.
    lenientRepair: !model.strictRepair,
    leftForNeverBlank: false,
    // How many times a placement was checked against the rules: the build's work, the same on any
    // machine (the performance test bounds it; a build run in pieces could show progress by it).
    ruleChecks: 0,
    actById,
    cellKey,
    keyOf: (s) => cellKey(s.groupId, s.dayIndex, s.blockId),
    splitKey: (k) => {
      const [g, d, b] = k.split("|");
      return [g, Number(d), b];
    },
    blocksOf,
    blockIdx,
    peersByDay: days.map((day) => overlappingPeers(day.blocks)),
    getMin: (actId) => actById.get(actId).min,

    // ── Ledgers ──────────────────────────────────────────────────────────────
    assigned: new Map(), // cell -> activity id (kept and generated)
    spanTails: new Set(), // cells that carry on a multi-block placement
    keptKeys: new Set(), // cells the generator may not change, whatever they hold
    keptCells: new Map(), // kept cell -> { item, head } as the grid had it
    usageCount: new Map(), // "group|activity" -> sessions this week
    dailyUsage: new Map(), // "group|day|activity" -> sessions that day
    placeUsage: new Map(), // "location|day|block" -> occupants
    activityUsers: new Map(), // "activity|day|block" -> groups doing it
    otherPlace: model.otherPlace || new Map(),
    otherActivity: model.otherActivity || new Map(),

    openSlotByKey: null, // the cells the generator fills, once the grid is read
    // Open cells nothing is in yet: the repairs may trade one for another, never add one.
    emptyCells: 0
  };

  st.getCount = (g, actId) => st.usageCount.get(`${g}|${actId}`) || 0;
  st.onDay = (g, d, actId) =>
    (st.dailyUsage.get(`${g}|${d}|${actId}`) || 0) > 0;
  st.bump = function bump(map, key, by) {
    const n = (map.get(key) || 0) + by;
    if (n > 0) {
      map.set(key, n);
    } else {
      map.delete(key);
    }
  };
  const divisionOf = (g) => (groups.has(g) ? groups.get(g).division : null);

  st.occupy = function occupy(locId, g, d, b, act) {
    if (locId == null) {
      return;
    }
    const k = `${locId}|${d}|${b}`;
    const list = st.placeUsage.get(k) || [];
    list.push({
      groupId: g,
      division: divisionOf(g),
      actId: act ? act.id : null,
      sameDivision: Boolean(act && act.sameDivision)
    });
    st.placeUsage.set(k, list);
  };
  st.joinActivity = function joinActivity(act, g, d, b) {
    const k = `${act.id}|${d}|${b}`;
    const list = st.activityUsers.get(k) || [];
    list.push({ groupId: g, division: divisionOf(g) });
    st.activityUsers.set(k, list);
  };
  function release(map, k, matches) {
    const list = map.get(k);
    const i = list ? list.findIndex(matches) : -1;
    if (i >= 0) {
      list.splice(i, 1);
    }
  }

  /** The blocks a placement of `act` at block `b` covers (its head and whatever of its tail fits). */
  st.ownBlocks = function ownBlocks(act, g, d, b) {
    const own = [b];
    const idx = blockIdx(d, b);
    for (let i = 1; i < act.span; i++) {
      const next = blocksOf(d)[idx + i];
      if (next) {
        own.push(next.id);
      }
    }
    return own;
  };

  const isOpenSlot = (k) => st.openSlotByKey && st.openSlotByKey.has(k);

  st.place = function place(act, g, d, b) {
    st.assigned.set(cellKey(g, d, b), act.id);
    st.bump(st.usageCount, `${g}|${act.id}`, 1);
    st.bump(st.dailyUsage, `${g}|${d}|${act.id}`, 1);
    st.ownBlocks(act, g, d, b).forEach((blockId, i) => {
      const k = cellKey(g, d, blockId);
      if (isOpenSlot(k)) {
        st.emptyCells--;
      }
      if (i > 0) {
        st.assigned.set(k, act.id);
        st.spanTails.add(k);
      }
      st.occupy(act.locationId, g, d, blockId, act);
      st.joinActivity(act, g, d, blockId);
    });
  };

  // Exact inverse of place(), span tails included. Only the repair passes call it.
  st.unplace = function unplace(act, g, d, b) {
    st.bump(st.usageCount, `${g}|${act.id}`, -1);
    st.bump(st.dailyUsage, `${g}|${d}|${act.id}`, -1);
    for (const blockId of st.ownBlocks(act, g, d, b)) {
      const k = cellKey(g, d, blockId);
      if (isOpenSlot(k)) {
        st.emptyCells++;
      }
      st.assigned.delete(k);
      st.spanTails.delete(k);
      if (act.locationId != null) {
        release(
          st.placeUsage,
          `${act.locationId}|${d}|${blockId}`,
          (o) => o.groupId === g && o.actId === act.id
        );
      }
      release(
        st.activityUsers,
        `${act.id}|${d}|${blockId}`,
        (u) => u.groupId === g
      );
    }
  };

  return st;
}
