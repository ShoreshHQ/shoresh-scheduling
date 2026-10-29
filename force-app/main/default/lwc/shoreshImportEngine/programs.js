/*
 * Which program each timetable belongs to, the days it runs, and its time blocks, matched to
 * what the camp already has (add only, Greg 2026-10-16): a time block at the same times is the
 * same block; one overlapping at different times is asked about (keep, change, or leave out);
 * the rest are added.
 */
import { FIELD } from "c/shoreshSchema";
import { deletedAs, deletedPrograms, deletionsIn } from "./deleted";
import { foldName } from "./names";
import { identityDivision } from "./noDivision";
import { LEAVE_OUT } from "./reading";
import { WEEKDAYS, clock, looseKey } from "./text";

const MS_PER_MINUTE = 60000;

function minutesOf(ms) {
  return ms === null || ms === undefined
    ? null
    : Math.round(ms / MS_PER_MINUTE);
}

function existingPrograms(existing, rules) {
  return ((existing && existing.programs) || []).map((entry) => ({
    id: entry.program.Id,
    name: entry.program.Name,
    days: WEEKDAYS.filter((d) => entry.program[FIELD.Program[d]]),
    blocks: (entry.timeBlocks || []).map((b) => ({
      id: b.Id,
      name: b.Name,
      start: minutesOf(b[FIELD.TimeBlock.StartTime]),
      end: minutesOf(b[FIELD.TimeBlock.EndTime]),
      partOfDay: b[FIELD.TimeBlock.PartOfDay] || null,
      sortOrder: b[FIELD.TimeBlock.SortOrder] || 0
    })),
    // Group identities (identity.js), as the files' groups are named.
    groups: (entry.divisions || []).flatMap((d) =>
      (d.groups || []).map((g) =>
        rules.identityOf(g.Name, identityDivision(d.division))
      )
    ),
    entry
  }));
}

function groupsOfTimetable(reading, index) {
  return reading.groups.filter((g) => g.timetable === index).map((g) => g.name);
}

/** The same groups as the camp names them (identities without a schedule number). */
function baseGroupsOfTimetable(reading, index) {
  return reading.groups
    .filter((g) => g.timetable === index)
    .map((g) => g.base || g.name);
}

/**
 * The program deleted on the setup screen that a timetable's groups went with, when none of its
 * groups is in a program the camp has: the one most of its groups were remembered with (then
 * by name). Something the camp has wins: a program of that name set up again is not deleted.
 */
function deletedProgramOf(reading, index, programs, gone, context) {
  const bases = baseGroupsOfTimetable(reading, index);
  if (programs.some((p) => bases.some((g) => p.groups.includes(g)))) {
    return null;
  }
  const names = new Set(
    reading.groups
      .filter((g) => g.timetable === index)
      .map((g) => foldName(g.recordName || g.name))
  );
  let best = null;
  let most = 0;
  for (const program of gone) {
    if (
      context.claimed.has(program.key) ||
      context.taken.has(looseKey(program.name))
    ) {
      continue;
    }
    const count = [...names].filter((n) => program.groups.has(n)).length;
    if (count > most) {
      best = program;
      most = count;
    }
  }
  return best;
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
 * The program a set of groups goes to, always shown and changeable (Greg, 2026-10-16):
 * preselected when sure (the program their groups are in, the camp's only program, or a new one
 * for a camp with none); otherwise nothing is preselected and the import waits for a choice. A
 * program already taken by another set of groups in these files is not offered (their time
 * blocks differ, so they cannot share it). Answers name the program, never its record Id.
 */
function sureProgram(bases, programs, free, context) {
  const owners = programs.filter((p) =>
    bases.some((g) => p.groups.includes(g))
  );
  if (owners.length === 1 && free.includes(owners[0])) {
    return owners[0].name;
  }
  if (programs.length === 0 || context.broughtBack) {
    return "new";
  }
  if (programs.length === 1 && context.count === 1 && owners.length === 0) {
    return programs[0].name;
  }
  return null;
}

function chooseProgram(groups, programs, context, answers) {
  const bases = context.bases || groups;
  const id = `program|${[...groups].sort().join(",")}`;
  const free = programs.filter((p) => !context.used.has(p.id));
  const preselected = sureProgram(bases, programs, free, context);
  const ask = {
    id,
    type: "program",
    groups,
    options: free.map((p) => p.name),
    preselected
  };
  const answer = answers[id] || preselected;
  if (answer === LEAVE_OUT) {
    return { leftOut: true, ask };
  }
  if (answer === "new") {
    return { program: null, ask };
  }
  const picked = free.find((p) => p.name === answer);
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
    return byName
      ? {
          id: byName.id,
          name: byName.name,
          start: byName.start,
          end: byName.end
        }
      : { untimed: true };
  }
  const same =
    program &&
    program.blocks.find((b) => b.start === block.start && b.end === block.end);
  if (same) {
    return { id: same.id, name: same.name };
  }
  const [current] = touchingBlocks(block, program);
  if (!current) {
    // Deleted on a setup screen before: left out with what is in it, until brought back.
    const gone = deletedAs(
      context.deletions,
      "TimeBlock",
      context.programName,
      block.name
    );
    return gone ? { leftOut: true, deleted: gone } : { isNew: true };
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
  const changed = answer === "change" && !noChange;
  return {
    id: current.id,
    name: current.name,
    // Kept: the camp's times are the block's times from now on.
    ...(changed ? {} : { start: current.start, end: current.end }),
    change:
      answer === "change" && !noChange
        ? { start: block.start, end: block.end }
        : null
  };
}

/**
 * A file block as the program's: left out by an answer, a special day's own (INGEST-4.3: never
 * added to the program), or matched to the camp's blocks.
 */
function blockMatch(block, program, context) {
  if (block.leftOutByAnswer) {
    return { leftOut: true };
  }
  if (block.ownDay) {
    return { ownDay: true };
  }
  return matchBlock(block, program, context);
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
  const programs = existingPrograms(existing, reading.identities);
  const taken = new Set(programs.map((p) => looseKey(p.name)));
  const asks = [];
  const used = new Set();
  const deletions = deletionsIn(answers);
  const gone = deletedPrograms(answers);
  const campNames = new Set(taken);
  const claimed = new Set();
  let created = 0;
  const result = reading.timetables.map((timetable) => {
    const groups = groupsOfTimetable(reading, timetable.index);
    // Its program was deleted on the setup screen: left out with all it has, without asking,
    // until brought back; brought back, it is added again under its own name.
    const deleted = deletedProgramOf(reading, timetable.index, programs, gone, {
      claimed,
      taken: campNames
    });
    if (deleted) {
      claimed.add(deleted.key);
    }
    const choice =
      deleted && !deleted.back
        ? { leftOut: true }
        : chooseProgram(
            groups,
            programs,
            {
              used,
              count: reading.timetables.length,
              bases: baseGroupsOfTimetable(reading, timetable.index),
              broughtBack: !!deleted
            },
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
    if (deleted && !program) {
      name = deleted.name;
      taken.add(looseKey(name));
    } else if (!program && !choice.leftOut) {
      name = newProgramName(taken, programs.length + created);
      taken.add(looseKey(name));
      created++;
    }
    const days = programDays(program, fileDays, answers, asks);
    const context = {
      answers,
      asks,
      deletions,
      programName: name,
      shared: sharedBlocks(
        timetable.blocks.filter((b) => !b.ownDay),
        program
      )
    };
    const blocks = timetable.blocks.map((block) => ({
      fileKey: block.key,
      name: block.name,
      start: block.start,
      end: block.end,
      guessedEnd: !!block.guessedEnd,
      readAsMorning: !!block.readAsMorning,
      ...blockMatch(block, program, context)
    }));
    return {
      index: timetable.index,
      ownDays: timetable.ownDays || [],
      key: program ? program.id : `P${timetable.index}`,
      program,
      name,
      groups,
      leftOut: !!choice.leftOut,
      ...(deleted && !deleted.back ? { deleted: deleted.key } : {}),
      unanswered: !!choice.unanswered,
      ...days,
      blocks
    };
  });
  return { timetables: result, asks, programs };
}
