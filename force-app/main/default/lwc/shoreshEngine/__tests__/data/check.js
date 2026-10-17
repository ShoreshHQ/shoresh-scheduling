/**
 * An independent check of a generated week against the camp spec it came from (camp.js),
 * written without the engine's code: every hard rule a cell breaks must be named by a flag on
 * a cell the generator placed (kept cells don't count: they were there before), every at-camp,
 * unlocked, open cell must be filled unless the result lists it as impossible, and kept cells
 * (locks, fixed activities, not-at-camp cells, and every filled cell in "fill the open cells")
 * must come back exactly as they went in.
 */
import { cellsOf } from "./camp";

const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

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
        // A cell left Open really can't be filled: the group is busy at an overlapping time.
        if (
          openCells.has(k) &&
          !(cell === null && peers[b].some((j) => row[j]))
        ) {
          out.push(`listed as impossible but isn't: ${k}`);
        }
        if (!cell) {
          return;
        }
        for (const j of peers[b]) {
          // One placement running through both blocks is still one placement.
          let sameRun = j > b;
          for (let i = b + 1; i <= j && sameRun; i++) {
            sameRun = Boolean(row[i] && !row[i].head && row[i].id === cell.id);
          }
          if (j > b && row[j] && !sameRun) {
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
          const shortened =
            len < act.span &&
            (flagged.get(k) || []).includes("shorterThanSetUp");
          if (len !== act.span && !shortened) {
            out.push(`multi-block run of ${len} for ${act.id}: ${k}`);
          }
        }
        if (!eligible(act, group) && !covered([k], "eligibility")) {
          out.push(`not set up for the group, unflagged: ${k}`);
        }
        const ck = `${g.id}|${act.id}`;
        counts.set(ck, [...(counts.get(ck) || []), k]);
        const dayKey = `${g.id}|${d}|${act.id}`;
        daily.set(dayKey, [...(daily.get(dayKey) || []), k]);
      });
    }
  });

  for (const [ck, keys] of counts) {
    const act = acts.get(ck.split("|")[1]);
    if (
      act.max != null &&
      keys.length > act.max &&
      !covered(keys, "weeklyMax")
    ) {
      out.push(`over weekly max, unflagged: ${ck}`);
    }
  }
  for (const [dk, keys] of daily) {
    if (keys.length > 1 && !covered(keys, "onceADay")) {
      out.push(`twice in a day, unflagged: ${dk}`);
    }
  }
  const other = (d, b, field, id) => {
    let n = 0;
    for (const o of spec.otherPrograms || []) {
      if (
        o[field] === id &&
        o.date === result.days[d].dateValue &&
        minutes(o.startTime) < minutes(blocks[b].endTime) &&
        minutes(blocks[b].startTime) < minutes(o.endTime)
      ) {
        n += o.groups || 1;
      }
    }
    return n;
  };
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
  return out;
}
