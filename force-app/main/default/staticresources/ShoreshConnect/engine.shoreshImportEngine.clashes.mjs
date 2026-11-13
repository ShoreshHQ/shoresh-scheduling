/*
 * classification.md INGEST-3.11: a recurring activity this import brings in that the file has in a
 * fixed activity's time block (a "Field day" printed over the whole of each Friday, with Lunch a
 * fixed activity) would share that block with it for the same group and day, which the save
 * refuses. It is asked in the review instead, naming both, with the desktop's default pre-selected
 * (ADR 2026-10-11-import-special-days-and-field-trips: an event never claims a fixed Lunch's block,
 * its run splits around it; a special day only when the director says so).
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { blockRecordKey } from "./engine.shoreshImportEngine.items.mjs";
import { LEAVE_OUT, blocksOf } from "./engine.shoreshImportEngine.reading-constants.mjs";
import { WEEKDAYS } from "./engine.shoreshImportEngine.text.mjs";

/** Recurring at its other time blocks, not the fixed activity's. */
export const AROUND = "around";
/** Noted as a special day of its name (SPECIAL-1.5), set up later. */
export const SPECIAL = "special";

/** A name in one program: "Program|Name". */
export function specialKey(t, name) {
  return `${t.name}|${name}`;
}

export function clashId(t, name) {
  return `clash|${specialKey(t, name)}`;
}

/**
 * The names answered "special day", each in its own program ("Program|Name"): noted as one in that
 * program's timetable only, before anything is read as fixed.
 */
export function specialByAnswer(answers) {
  return new Set(
    Object.entries(answers || {})
      .filter(([key, value]) => key.startsWith("clash|") && value === SPECIAL)
      .map(([key]) => key.slice("clash|".length))
  );
}

/** A fixed activity as the time blocks it holds each day (its early day from earlier, CORE-3.7). */
function holder(name, block, length, earlyDay, earlyBlocks) {
  return {
    name,
    holds(day, b) {
      const from =
        day === earlyDay ? Math.max(0, block - (earlyBlocks || 0)) : block;
      return b >= from && b < block + length;
    }
  };
}

function blockIndexOf(t, key, id) {
  return t.blocks.findIndex(
    (b, i) => (id && b.id === id) || (key && blockRecordKey(t, i) === key)
  );
}

/**
 * The fixed activities of a timetable's program: the new ones this import adds, and the camp's
 * own (at the time block an update moves it to, if any). A fixed activity holds its block every
 * day the program runs, for every group in it.
 */
function fixedIn(t, setTime, ctx) {
  const result = setTime
    .filter((r) => r.kind === "fixed" && r.programKey === t.key)
    .map((r) => holder(r.name, r.block, r.length, r.earlyDay, r.earlyBlocks));
  if (!t.program) {
    return result;
  }
  const f = FIELD.FixedActivity;
  for (const [key, record] of ctx.camp.fixed) {
    if (!key.startsWith(`${t.program.id}|`)) {
      continue;
    }
    const update = ctx.updates.fixed.find((u) => u.id === record.Id);
    const block = update
      ? blockIndexOf(t, update.blockKey, null)
      : blockIndexOf(t, null, record[f.TimeBlock]);
    if (block < 0) {
      continue;
    }
    const length = update ? update.length : record[f.Length] || 1;
    // An update from a file with no early day keeps the director's own (INGEST-4.13).
    const early =
      update && update.earlyDay
        ? update
        : { earlyDay: record[f.EarlyDay], earlyBlocks: record[f.EarlyBlocks] };
    result.push(
      holder(record.Name, block, length, early.earlyDay, early.earlyBlocks)
    );
  }
  return result;
}

/** Whether a name's cells fill the day for each group that has it: three quarters of its blocks. */
function fillsTheDay(cells, t) {
  const covered = new Map();
  for (const c of cells) {
    const key = `${c.week}|${c.day}|${c.group}`;
    covered.set(key, (covered.get(key) || 0) + blocksOf(c).length);
  }
  const blocks = t.blocks.filter((b) => !b.ownDay && !b.leftOut).length;
  return [...covered.values()].every((n) => n * 4 >= blocks * 3);
}

/** Each { name, day, block } a name's cells cover. */
function cellSpots(cells) {
  return cells.flatMap((c) =>
    blocksOf(c).map((block) => ({ name: c.text, day: c.day, block }))
  );
}

/** Each { name, day, block } recurring records cover. */
function recordSpots(records) {
  return records.flatMap((r) =>
    r.days.flatMap((day) =>
      Array.from({ length: r.length }, (_, k) => ({
        name: r.name,
        day,
        block: r.block + k
      }))
    )
  );
}

/** Where a name's spots sit in a fixed activity's block: { fixed names, days, block indexes }. */
function overlapOf(spots, fixed) {
  const names = new Set();
  const days = new Set();
  const blocks = new Set();
  for (const s of spots) {
    for (const f of fixed.filter((x) => x.name !== s.name)) {
      if (f.holds(s.day, s.block)) {
        names.add(f.name);
        days.add(s.day);
        blocks.add(s.block);
      }
    }
  }
  return {
    names: [...names].sort(),
    days: WEEKDAYS.filter((d) => days.has(d)),
    blocks: [...blocks].sort((a, b) => a - b)
  };
}

/** Questions in the same order for the same files: by day, time block, then name. */
function byDayAndBlock(a, b) {
  return (
    WEEKDAYS.indexOf(a.days[0]) - WEEKDAYS.indexOf(b.days[0]) ||
    a.blocks[0] - b.blocks[0] ||
    a.name.localeCompare(b.name)
  );
}

/** A recurring record without the blocks a fixed activity holds on any of its days. */
function around(record, fixed) {
  const held = (b) => record.days.some((d) => fixed.some((f) => f.holds(d, b)));
  const runs = [];
  for (let b = record.block; b < record.block + record.length; b++) {
    const last = runs[runs.length - 1];
    if (held(b)) {
      continue;
    }
    if (last && last.block + last.length === b) {
      last.length += 1;
    } else {
      runs.push({ block: b, length: 1 });
    }
  }
  const t = record.timetable;
  return runs.map((run) => ({
    ...record,
    key: `R|${t.key}|${record.name}|${run.block}|${run.length}|${record.days.join(",")}`,
    block: run.block,
    blockKey: blockRecordKey(t, run.block),
    length: run.length
  }));
}

/** The names that might clash in a timetable: new recurring ones, and those answered special. */
function candidates(t, decisions, usable, asSpecial) {
  const result = decisions
    .filter(
      (d) =>
        d.timetable === t && d.kind === "recurring" && !d.existing && !d.leftOut
    )
    .map((d) => ({ name: d.name, cells: d.cells, decision: d }));
  const prefix = specialKey(t, "");
  const special = [...asSpecial]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .sort();
  for (const name of special) {
    const cells = usable.filter(
      (p) => p.timetable === t.index && p.text === name
    );
    if (cells.length) {
      result.push({ name, cells, decision: null });
    }
  }
  return result;
}

/**
 * INGEST-3.11: asks about each new recurring activity whose cells sit in a fixed activity's time
 * block, and applies the answer (the pre-selected one until answered) to the set-time records.
 * Returns the records to add.
 */
export function settleClashes(setTime, decisions, usable, ctx, asSpecial) {
  let records = setTime;
  for (const t of ctx.timetables.filter((x) => !x.leftOut)) {
    const fixed = fixedIn(t, records, ctx);
    if (!fixed.length) {
      continue;
    }
    const asks = [];
    for (const c of candidates(t, decisions, usable, asSpecial)) {
      const mine = (r) =>
        r.kind === "recurring" && r.timetable === t && r.name === c.name;
      // What the import writes (the first week's patterns, never a stray cell), or, once answered
      // a special day, the cells it is noted on.
      const overlap = overlapOf(
        c.decision !== null
          ? recordSpots(records.filter(mine))
          : cellSpots(c.cells),
        fixed
      );
      if (!overlap.names.length) {
        continue;
      }
      const clashing = fixed.filter((f) => overlap.names.includes(f.name));
      const trimmed = records.filter(mine).flatMap((r) => around(r, clashing));
      const id = clashId(t, c.name);
      const canGoAround = c.decision !== null ? trimmed.length > 0 : true;
      const preselected = canGoAround ? AROUND : null;
      asks.push({
        id,
        type: "clash",
        name: c.name,
        program: t.name,
        timetable: t,
        fixed: overlap.names,
        days: overlap.days,
        blocks: overlap.blocks,
        special: fillsTheDay(c.cells, t),
        around: canGoAround,
        preselected
      });
      const answer = ctx.answers[id] || preselected;
      if (c.decision === null || answer === SPECIAL) {
        continue;
      }
      if (answer === AROUND && canGoAround) {
        records = [...records.filter((r) => !mine(r)), ...trimmed];
      } else if (answer === LEAVE_OUT) {
        records = records.filter((r) => !mine(r));
        c.decision.leftOut = true;
      }
    }
    ctx.asks.push(...asks.sort(byDayAndBlock));
  }
  return records;
}
