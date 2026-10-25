/**
 * An independent check of a generated week against the camp spec it came from (camp.js),
 * written without the engine's code: every hard rule a cell breaks must be named by a flag on
 * a cell the generator placed (kept cells don't count: they were there before), every at-camp,
 * unlocked, open cell must be filled unless the result lists it as impossible (busy then, too
 * short a gap, or everything set up for the group full there), and kept cells
 * (locks, fixed activities, not-at-camp cells, and every filled cell in "fill the open cells")
 * must come back exactly as they went in.
 */
import { cellsOf } from "./camp";

const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Other programs' groups at a place or activity during a block, the most at one moment: tried at
 * every moment one of them starts (or the block starts), summing those there then. Written
 * without the engine's sweep.
 */
export function busiestOther(entries, field, id, date, startTime, endTime) {
  const from = minutes(startTime);
  const to = minutes(endTime);
  const there = (entries || []).filter(
    (o) =>
      o[field] === id &&
      o.date === date &&
      minutes(o.startTime) < to &&
      from < minutes(o.endTime)
  );
  let most = 0;
  for (const o of there) {
    const moment = Math.max(from, minutes(o.startTime));
    const n = there
      .filter(
        (x) => minutes(x.startTime) <= moment && moment < minutes(x.endTime)
      )
      .reduce((sum, x) => sum + (x.groups == null ? 1 : Number(x.groups)), 0);
    most = Math.max(most, n);
  }
  return most;
}

function atCamp(group, partOfDay) {
  if (group.availability === "MorningOnly") {
    return partOfDay === "Morning";
  }
  return group.availability !== "AfternoonOnly" || partOfDay === "Afternoon";
}

function eligible(act, group) {
  return (
    !act.eligible.length ||
    act.eligible.includes(group.id) ||
    act.eligible.includes(group.division)
  );
}

export function problems(spec, input, result) {
  const out = [];
  if (!result.ok) {
    return [`not ok: ${result.error}`];
  }
  const blocks = spec.blocks;
  const groups = new Map(spec.groups.map((g) => [g.id, g]));
  const acts = new Map(spec.activities.map((a) => [a.id, a]));
  const fit = new Map((spec.locations || []).map((l) => [l.id, l.fit]));
  const fixedAt = new Map(
    [...(spec.fixed || []), ...(spec.recurring || [])].map((f) => [
      f.id,
      f.location
    ])
  );
  const before = cellsOf(input.days);
  const after = cellsOf(result.days);
  const lock = new Set(
    (input.locks || []).map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
  );
  const flagged = new Map(
    result.flags.map((f) => [`${f.date}|${f.groupId}|${f.blockId}`, f.bends])
  );
  const openCells = new Set(
    result.openCells.map((c) => `${c.date}|${c.groupId}|${c.blockId}`)
  );
  const fillOpen = input.mode === "fillOpen";
  for (const f of result.flags) {
    if (!f.bends.length || !/^\S[^·]*\S( · \S[^·]*\S)*$/.test(f.reason)) {
      out.push(`flag without a rule or a reason: ${JSON.stringify(f)}`);
    }
  }

  // Which cells were kept: a placement that had a locked cell, every set-time or not-set-up
  // item, and (fill the open cells) every filled cell.
  const kept = new Set();
  input.days.forEach((day, d) => {
    for (const g of day.groups) {
      const row = before[d][g.id];
      for (let b = 0; b < row.length; b++) {
        if (!row[b] || !row[b].head) {
          continue;
        }
        let e = b + 1;
        while (
          e < row.length &&
          row[e] &&
          !row[e].head &&
          row[e].id === row[b].id
        ) {
          e++;
        }
        const run = [];
        for (let i = b; i < e; i++) {
          run.push(`${day.dateValue}|${g.id}|${blocks[i].id}`);
        }
        if (
          row[b].kind !== "A" ||
          fillOpen ||
          !groups.has(g.id) ||
          run.some((k) => lock.has(k))
        ) {
          run.forEach((k) => kept.add(k));
        }
      }
    }
  });

  const covered = (keys, rule) =>
    keys.every((k) => kept.has(k)) ||
    keys.some((k) => !kept.has(k) && (flagged.get(k) || []).includes(rule));

  // Every clash (a strict occupant and another division, or another program) is either
  // between kept cells only, or named by a flag on a generated cell in it.
  const sameDivisionHolds = (list, extra, strict) =>
    list.every(
      (x) =>
        !strict(x) ||
        ((extra === 0 || covered([x.k], "sameDivision")) &&
          list.every(
            (y) =>
              y === x ||
              y.group.division === x.group.division ||
              covered([x.k, y.k], "sameDivision")
          ))
    );

  const maybeFull = [];
  const counts = new Map();
  const daily = new Map();
  const place = new Map();
  const doing = new Map();
  result.days.forEach((day, d) => {
    const peers = blocks.map((x) =>
      blocks
        .map((y, j) => j)
        .filter(
          (j) =>
            blocks[j].id !== x.id &&
            minutes(x.startTime) < minutes(blocks[j].endTime) &&
            minutes(blocks[j].startTime) < minutes(x.endTime)
        )
    );
    for (const g of day.groups) {
      const group = groups.get(g.id);
      const row = after[d][g.id];
      const was = before[d][g.id];
      row.forEach((cell, b) => {
        const k = `${day.dateValue}|${g.id}|${blocks[b].id}`;
        const prior = was[b];
        if (kept.has(k)) {
          if (JSON.stringify(cell) !== JSON.stringify(prior)) {
            out.push(`kept cell changed: ${k}`);
          }
        }
        if (!group) {
          return;
        }
        const here = atCamp(group, blocks[b].partOfDay);
        if (!kept.has(k) && !here && cell) {
          out.push(`placed where not at camp: ${k}`);
        }
        if (!kept.has(k) && lock.has(k) && cell) {
          out.push(`locked open cell filled: ${k}`);
        }
        if (here && !cell && !lock.has(k) && !openCells.has(k)) {
          out.push(`blank: ${k}`);
        }
        // A cell left Open really can't be filled: the group is busy at an overlapping time, or
        // no activity's length fits the run of Open, at-camp, unlocked cells starting there.
        let gap = 0;
        while (
          b + gap < row.length &&
          row[b + gap] === null &&
          atCamp(group, blocks[b + gap].partOfDay) &&
          !lock.has(`${day.dateValue}|${g.id}|${blocks[b + gap].id}`)
        ) {
          gap++;
        }
        const busyThen = cell === null && peers[b].some((j) => row[j]);
        const tooShort =
          cell === null && spec.activities.every((a) => a.span > gap);
        if (openCells.has(k) && !busyThen && !tooShort) {
          // Or (never-blank, care plan step 7) everything set up for the group that fits the gap
          // is full there: judged once every cell is counted, below.
          maybeFull.push({ k, d, b, group, gap, row, peers });
        }
        if (!cell) {
          return;
        }
        for (const j of peers[b]) {
          // Two overlapping blocks both filled, even by one multi-block placement running
          // through them (two overlapping blocks are one stretch of time), unless both were kept.
          if (j > b && row[j]) {
            const pk = `${day.dateValue}|${g.id}|${blocks[j].id}`;
            if (!(kept.has(k) && kept.has(pk))) {
              out.push(`overlapping blocks both filled: ${k}`);
            }
          }
        }
        const occupant = (loc) => {
          const lk = `${loc}|${d}|${b}`;
          if (!place.has(lk)) {
            place.set(lk, []);
          }
          place.get(lk).push({ k, group, act: acts.get(cell.id) || null });
        };
        if ((cell.kind === "F" || cell.kind === "R") && fixedAt.get(cell.id)) {
          occupant(fixedAt.get(cell.id));
        }
        const act = cell.kind === "A" ? acts.get(cell.id) : null;
        if (!act) {
          return;
        }
        if (act.location) {
          occupant(act.location);
        }
        const dk = `${act.id}|${d}|${b}`;
        if (!doing.has(dk)) {
          doing.set(dk, []);
        }
        doing.get(dk).push({ k, group });
        if (!cell.head) {
          return;
        }
        if (!kept.has(k)) {
          let len = 1;
          while (
            row[b + len] &&
            !row[b + len].head &&
            row[b + len].id === act.id
          ) {
            len++;
          }
          if (len !== act.span) {
            out.push(`multi-block run of ${len} for ${act.id}: ${k}`);
          }
        }
        if (!eligible(act, group) && !covered([k], "eligibility")) {
          out.push(`not set up for the group, unflagged: ${k}`);
        }
        const ck = `${g.id}|${act.id}`;
        counts.set(ck, [
          ...(counts.get(ck) || []),
          {
            k,
            date: day.dateValue,
            start: minutes(blocks[b].startTime),
            b,
            id: blocks[b].id
          }
        ]);
        const dayKey = `${g.id}|${d}|${act.id}`;
        daily.set(dayKey, [...(daily.get(dayKey) || []), k]);
      });
    }
  });

  // Over the weekly limit: exactly as many sessions as are past it are dotted, the latest in the
  // week (day, start time, place in the day, Id), and not a kept one while an unkept one can be.
  for (const [ck, sessions] of counts) {
    const act = acts.get(ck.split("|")[1]);
    const ordered = [...sessions].sort(
      (x, y) =>
        (x.date < y.date ? -1 : x.date > y.date ? 1 : 0) ||
        x.start - y.start ||
        x.b - y.b ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    );
    // The dots go on the latest unkept sessions; kept ones only when there aren't enough.
    const extra = act.max == null ? 0 : Math.max(0, ordered.length - act.max);
    const unkept = ordered.filter((x) => !kept.has(x.k));
    const keptOnes = ordered.filter((x) => kept.has(x.k));
    const fromKept = Math.max(0, extra - unkept.length);
    const due = new Set(
      [
        ...unkept.slice(unkept.length - Math.min(extra, unkept.length)),
        ...keptOnes.slice(keptOnes.length - fromKept)
      ].map((x) => x.k)
    );
    ordered.forEach((s) => {
      const past = due.has(s.k);
      const dotted = (flagged.get(s.k) || []).includes("weeklyMax");
      if (past !== dotted) {
        out.push(
          `${past ? "past the weekly max, undotted" : "dotted within the weekly max"}: ${s.k}`
        );
      }
    });
  }
  for (const [dk, keys] of daily) {
    if (keys.length > 1 && !covered(keys, "onceADay")) {
      out.push(`twice in a day, unflagged: ${dk}`);
    }
  }
  const other = (d, b, field, id) =>
    busiestOther(
      spec.otherPrograms,
      field,
      id,
      result.days[d].dateValue,
      blocks[b].startTime,
      blocks[b].endTime
    );
  for (const [lk, list] of place) {
    const [loc, d, b] = lk.split("|");
    const extra = other(Number(d), Number(b), "locationId", loc);
    const keys = list.map((o) => o.k);
    if (
      fit.has(loc) &&
      list.length + extra > fit.get(loc) &&
      !covered(keys, "placeCapacity")
    ) {
      out.push(`over groups that fit, unflagged: ${lk}`);
    }
    // Same division only, pair by pair: a group doing a same-division-only activity shares
    // its place with no other division (and with no other program's group).
    if (
      fit.has(loc) &&
      !sameDivisionHolds(list, extra, (o) => o.act && o.act.sameDivision)
    ) {
      out.push(`two divisions share a place, unflagged: ${lk}`);
    }
  }
  for (const [dk, list] of doing) {
    const [actId, d, b] = dk.split("|");
    const act = acts.get(actId);
    const extra = other(Number(d), Number(b), "activityId", actId);
    const keys = list.map((o) => o.k);
    if (
      act.atOnce != null &&
      list.length + extra > act.atOnce &&
      !covered(keys, "groupsAtOnce")
    ) {
      out.push(`over groups at once, unflagged: ${dk}`);
    }
    if (act.sameDivision && !sameDivisionHolds(list, extra, () => true)) {
      out.push(`two divisions at one activity, unflagged: ${dk}`);
    }
  }
  // A cell left Open with something set up for the group free there, within every limit (who
  // it's for, groups at once, groups that fit, same division): weekly max and once a day are
  // preferences, so they never excuse it.
  const free = (act, group, d, b) => {
    const there = doing.get(`${act.id}|${d}|${b}`) || [];
    if (
      act.atOnce != null &&
      there.length + other(d, b, "activityId", act.id) >= act.atOnce
    ) {
      return false;
    }
    if (
      act.sameDivision &&
      (other(d, b, "activityId", act.id) > 0 ||
        there.some((o) => o.group.division !== group.division))
    ) {
      return false;
    }
    if (!act.location || !fit.has(act.location)) {
      return true;
    }
    const at = place.get(`${act.location}|${d}|${b}`) || [];
    const extra = other(d, b, "locationId", act.location);
    return (
      at.length + extra < fit.get(act.location) &&
      !(
        act.sameDivision &&
        (extra > 0 || at.some((o) => o.group.division !== group.division))
      ) &&
      !at.some(
        (o) =>
          o.act && o.act.sameDivision && o.group.division !== group.division
      )
    );
  };
  for (const { k, d, b, group, gap, row, peers } of maybeFull) {
    const could = [...acts.values()].filter((act) => {
      if (!eligible(act, group) || act.span > gap) {
        return false;
      }
      for (let i = b; i < b + act.span; i++) {
        // Each block it runs into: the group not busy at an overlapping time there, and not a
        // block overlapping one it already runs (two overlapping blocks are one stretch of time).
        if (
          !free(act, group, d, i) ||
          (i > b && peers[i].some((j) => row[j] || (j >= b && j < i)))
        ) {
          return false;
        }
      }
      return true;
    });
    if (could.length) {
      out.push(`listed as impossible but isn't: ${k}`);
    }
  }
  return out;
}
