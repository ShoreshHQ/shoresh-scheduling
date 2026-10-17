/*
 * Which program each timetable belongs to, the days it runs, and its time blocks, matched to
 * what the camp already has (add only, Greg 2026-10-16): a time block at the same times is the
 * same block; one overlapping at different times is asked about (keep, change, or leave out);
 * the rest are added.
 */
import { LEAVE_OUT } from "./reading";
import { WEEKDAYS, clock, looseKey } from "./text";

const MS_PER_MINUTE = 60000;

function minutesOf(ms) {
  return ms === null || ms === undefined
    ? null
    : Math.round(ms / MS_PER_MINUTE);
}

function existingPrograms(existing) {
  return ((existing && existing.programs) || []).map((entry) => ({
    id: entry.program.Id,
    name: entry.program.Name,
    days: WEEKDAYS.filter((d) => entry.program[`${d}__c`]),
    blocks: (entry.timeBlocks || []).map((b) => ({
      id: b.Id,
      name: b.Name,
      start: minutesOf(b.StartTime__c),
      end: minutesOf(b.EndTime__c),
      sortOrder: b.SortOrder__c || 0
    })),
    groups: (entry.divisions || []).flatMap((d) =>
      (d.groups || []).map((g) => g.Name)
    ),
    entry
  }));
}

function groupsOfTimetable(reading, index) {
  return reading.groups.filter((g) => g.timetable === index).map((g) => g.name);
}

function newProgramName(taken, count) {
  if (count === 0 && !taken.has("main")) {
    return "Main";
  }
  let n = count + 1;
  while (taken.has(looseKey(`Program ${n}`))) {
    n++;
  }
  return `Program ${n}`;
}

/**
 * The program a timetable goes to: sure from its groups, or the camp's only program; else asked.
 * A program already taken by another timetable of these files is never chosen on its own
 * (their time blocks differ, so they cannot share it): that is asked too.
 */
function chooseProgram(groups, programs, context, answers) {
  const id = `program|${[...groups].sort().join(",")}`;
  const free = programs.filter((p) => !context.used.has(p.id));
  const owners = programs.filter((p) =>
    groups.some((g) => p.groups.includes(g))
  );
  if (owners.length === 1 && free.includes(owners[0])) {
    return { program: owners[0] };
  }
  if (programs.length === 0) {
    return { program: null };
  }
  if (programs.length === 1 && context.count === 1 && owners.length === 0) {
    return { program: programs[0] };
  }
  const answer = answers[id];
  const ask = {
    id,
    type: "program",
    groups,
    options: free.map((p) => ({ id: p.id, name: p.name }))
  };
  if (answer === LEAVE_OUT) {
    return { leftOut: true, ask };
  }
  if (answer === "new") {
    return { program: null, ask };
  }
  const picked = free.find((p) => p.id === answer);
  return { program: picked || null, ask, unanswered: !picked };
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function touchingBlocks(block, program) {
  const blocks = program ? program.blocks.filter((b) => b.start !== null) : [];
  return blocks
    .filter((b) => overlap(b, block) > 0)
    .sort((a, b) => overlap(b, block) - overlap(a, block));
}

/**
 * The camp's blocks that more than one of the file's blocks overlaps (9:00-10:00 against
 * 9:00-9:30 and 9:30-10:00): changing their times cannot fit both, so it is not offered.
 */
function sharedBlocks(fileBlocks, program) {
  const claims = new Map();
  for (const block of fileBlocks.filter((b) => b.start !== null)) {
    const exact =
      program &&
      program.blocks.some(
        (b) => b.start === block.start && b.end === block.end
      );
    const [best] = exact ? [] : touchingBlocks(block, program);
    if (best) {
      claims.set(best.id, (claims.get(best.id) || 0) + 1);
    }
  }
  return new Set(
    [...claims].filter(([, n]) => n > 1).map(([blockId]) => blockId)
  );
}

/** One file block against the program's blocks: same, asked about, or new. */
function matchBlock(block, program, context) {
  if (block.start === null) {
    const byName =
      program &&
      program.blocks.find((b) => looseKey(b.name) === looseKey(block.name));
    return byName ? { id: byName.id, name: byName.name } : { untimed: true };
  }
  const same =
    program &&
    program.blocks.find((b) => b.start === block.start && b.end === block.end);
  if (same) {
    return { id: same.id, name: same.name };
  }
  const [current] = touchingBlocks(block, program);
  if (!current) {
    return { isNew: true };
  }
  const noChange = context.shared.has(current.id);
  const id = `change|block|${program.name}|${current.name}|${clock(block.start)}-${clock(block.end)}`;
  context.asks.push({
    id,
    type: "block",
    program: program.name,
    current,
    file: block,
    noChange
  });
  const answer = context.answers[id];
  if (answer === LEAVE_OUT) {
    return { leftOut: true };
  }
  return {
    id: current.id,
    name: current.name,
    change:
      answer === "change" && !noChange
        ? { start: block.start, end: block.end }
        : null
  };
}

function programDays(program, fileDays, answers, asks) {
  if (!program) {
    return { days: fileDays, addDays: [] };
  }
  const missing = fileDays.filter((d) => !program.days.includes(d));
  if (missing.length === 0) {
    return { days: program.days, addDays: [] };
  }
  const id = `change|days|${program.name}|${missing.join(",")}`;
  asks.push({
    id,
    type: "days",
    program: program.name,
    current: program.days,
    missing
  });
  if (answers[id] === "change") {
    return {
      days: WEEKDAYS.filter(
        (d) => program.days.includes(d) || missing.includes(d)
      ),
      addDays: missing
    };
  }
  return { days: program.days, addDays: [] };
}

/**
 * Each timetable with its program (existing, new, or left out), its days, and its blocks:
 * [{ index, key, program (existing or null), name, days, addDays, leftOut, blocks: [{ fileKey,
 * id, name, start, end, isNew, change, leftOut, untimed, guessedEnd }] }], and the questions it
 * raised.
 */
export function mapPrograms(reading, existing, answers) {
  const programs = existingPrograms(existing);
  const taken = new Set(programs.map((p) => looseKey(p.name)));
  const asks = [];
  const used = new Set();
  let created = 0;
  const result = reading.timetables.map((timetable) => {
    const groups = groupsOfTimetable(reading, timetable.index);
    const choice = chooseProgram(
      groups,
      programs,
      { used, count: reading.timetables.length },
      answers
    );
    if (choice.ask) {
      asks.push(choice.ask);
    }
    if (choice.program) {
      used.add(choice.program.id);
    }
    const placements = reading.placements.filter(
      (p) => p.timetable === timetable.index
    );
    const fileDays = WEEKDAYS.filter((d) =>
      placements.some((p) => p.day === d)
    );
    const program = choice.program;
    let name = program ? program.name : null;
    if (!program && !choice.leftOut) {
      name = newProgramName(taken, programs.length + created);
      taken.add(looseKey(name));
      created++;
    }
    const days = programDays(program, fileDays, answers, asks);
    const context = {
      answers,
      asks,
      shared: sharedBlocks(timetable.blocks, program)
    };
    const blocks = timetable.blocks.map((block) => ({
      fileKey: block.key,
      name: block.name,
      start: block.start,
      end: block.end,
      guessedEnd: !!block.guessedEnd,
      ...matchBlock(block, program, context)
    }));
    return {
      index: timetable.index,
      key: program ? program.id : `P${timetable.index}`,
      program,
      name,
      groups,
      leftOut: !!choice.leftOut,
      unanswered: !!choice.unanswered,
      ...days,
      blocks
    };
  });
  return { timetables: result, asks, programs };
}
