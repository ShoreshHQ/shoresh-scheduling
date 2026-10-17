/*
 * Things a row names that the season doesn't have yet (Greg, 2026-10-17: "add it, and ask for
 * whatever details it needs; never make the director add it by hand first"). Asked only where
 * Shoresh can't create the item without an answer:
 * - a name in a who list that is no division or group: a division (in which program) or a
 *   group (in which division)?
 * - a time block a fixed or recurring activity names: when does it start and end?
 * - a time at 5 or 6 o'clock written without AM or PM: morning or evening (ADR 0006)?
 * Not asked: a rain plan naming an activity neither set up nor in the file is added with an
 * activity's starting values (Greg, 2026-10-17); its tick can be taken off.
 * Answers are names and choices, never record Ids, so they still work in a copied season.
 */
import { LEAVE_OUT, clock, looseKey } from "c/shoreshImportEngine";
import { dashLabels } from "./cells";

export function whoAddKey(name, program) {
  return program
    ? `whoAdd|${looseKey(program)}|${looseKey(name)}`
    : `whoAdd|${looseKey(name)}`;
}

export function rainAddKey(name) {
  return `rainAdd|${looseKey(name)}`;
}

export function blockAddKey(program, name) {
  return `blockAdd|${looseKey(program)}|${looseKey(name)}`;
}

/** Asked per block (its program and name), as Import last year does (ADR 0006 §15). */
/** One question per dash as written ("M-W", "Tu-Th"), per item. */
export function dashKey(program, name, dash) {
  return `dash|${looseKey(program)}|${looseKey(name)}|${dash}`;
}

export function tueThuKey(program, name) {
  return `tueThu|${looseKey(program)}|${looseKey(name)}`;
}

export function ampmKey(program, name) {
  return `ampm|${looseKey(program)}|${looseKey(name)}`;
}

const LEAVE_OUT_OPTION = { value: LEAVE_OUT, label: "Leave it out for now" };

/**
 * Where a new name in a who list can go. programs: [{ id, name, divisions: [{ id, name }] }]:
 * every program for "Who can do it", the row's own for a recurring activity's "Who".
 */
function whoOptions(programs, t) {
  const several = programs.length > 1;
  const options = programs.map((p) => ({
    value: `division|${p.name}`,
    label: `${t.s("Division")} in ${p.name}`
  }));
  programs.forEach((p) => {
    p.divisions.forEach((d) => {
      options.push({
        value: `group|${p.name}|${d.name}`,
        label: `${t.s("Group")} in ${d.name}${several ? ` (${p.name})` : ""}`
      });
    });
  });
  return options;
}

/** The record an answer names: { kind, key, name, parentId }, or null if it no longer fits. */
function whoAddition(name, answer, programs) {
  const [kind, programName, divisionName] = String(answer).split("|");
  const program = programs.find((p) => p.name === programName);
  if (!program) {
    return null;
  }
  if (kind === "division") {
    return {
      kind: "Division",
      key: `Division:${program.id}:${name}`,
      name,
      parentId: program.id
    };
  }
  const division = program.divisions.find((d) => d.name === divisionName);
  return kind === "group" && division
    ? {
        kind: "Group",
        key: `Group:${division.id}:${name}`,
        name,
        parentId: division.id
      }
    : null;
}

/**
 * Names in who lists that match no division or group, bucket by bucket (one for "Who can do
 * it", one per program for a recurring activity's "Who"): their questions, and, once answered,
 * the records to add (also put into the bucket's targets, so rows can name them). bucket:
 * { rows, targets, programs, program (its name, when the bucket is one program's) }. Returns
 * { cards, adds, leftOut, open }: leftOut and open as Sets of "<bucket>|<looseKey>".
 */
export function unknownWho(buckets, answers, t) {
  const result = { cards: [], adds: [], leftOut: new Set(), open: new Set() };
  buckets.forEach((bucket, index) => {
    // One spelling per name whatever the row order: the most written across every row (repeats
    // too), then alphabetical.
    const spellings = new Map();
    bucket.rows
      .filter(
        (r) => !r.problems.length && !r.leftOut && Array.isArray(r.values.who)
      )
      .forEach((r) => {
        const own = new Set(r.values.who.map(looseKey));
        (r.whoWritten || r.values.who).forEach((name) => {
          const key = looseKey(name);
          if (own.has(key) && !bucket.targets.bySpelling.has(key)) {
            const seen = spellings.get(key) || new Map();
            seen.set(name, (seen.get(name) || 0) + 1);
            spellings.set(key, seen);
          }
        });
      });
    const names = new Map(
      [...spellings.entries()].map(([key, seen]) => [
        key,
        [...seen.entries()].sort(
          (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])
        )[0][0]
      ])
    );
    const options = whoOptions(bucket.programs, t);
    [...names.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([key, name]) => {
        const id = whoAddKey(name, bucket.program);
        const answer = answers[id];
        result.cards.push({
          id,
          title: bucket.program
            ? `“${name}” is new in ${bucket.program}. What is it?`
            : `“${name}” is new. What is it?`,
          options: [...options, LEAVE_OUT_OPTION],
          answer: answer || null
        });
        const mark = `${index}|${key}`;
        if (answer === LEAVE_OUT) {
          result.leftOut.add(mark);
          return;
        }
        const added = answer
          ? whoAddition(name, answer, bucket.programs)
          : null;
        if (!added) {
          result.open.add(mark);
          return;
        }
        result.adds.push(added);
        const target = {
          id: added.key,
          kind: added.kind,
          name,
          spellings: [name]
        };
        bucket.targets.bySpelling.set(key, [target]);
        bucket.targets.byId.set(added.key, target);
      });
  });
  return result;
}

/**
 * Rain plans naming an activity that is nowhere: each is added with an activity's starting
 * values (as when added by hand), unless its tick was taken off (answer "skip"). Returns
 * { adds: [{ name, skipped }], skipped: Set }.
 */
export function unknownRainPlans(names, answers) {
  const result = { adds: [], skipped: new Set() };
  [...names]
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const skipped = answers[rainAddKey(name)] === "skip";
      result.adds.push({ name, skipped });
      if (skipped) {
        result.skipped.add(name);
      }
    });
  return result;
}

/** "09:00-09:45" -> { start, end } in minutes, or null. */
export function answeredTimes(answer) {
  const match = String(answer || "").match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return end > start ? { start, end } : null;
}

/** A new time block's answer: "Start-End". */
export function timesAnswer(start, end) {
  return `${clock(start)}-${clock(end)}`;
}

/**
 * Time blocks rows name that their program doesn't have: one question each (program, name) for
 * its start and end. asks: Map(key -> { program: { id, name }, name }). Returns { cards, adds:
 * [{ programId, name, start, end }], leftOut, open } (Sets of keys).
 */
export function unknownBlocks(asks, answers, t) {
  const result = { cards: [], adds: [], leftOut: new Set(), open: new Set() };
  [...asks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, ask]) => {
      const answer = answers[id];
      result.cards.push({
        id,
        title: `“${ask.name}” is a new ${t.sIn("TimeBlock")} in ${ask.program.name}. When is it?`,
        timesQuestion: true,
        options: [LEAVE_OUT_OPTION],
        answer: answer || null
      });
      const times = answeredTimes(answer);
      if (answer === LEAVE_OUT) {
        result.leftOut.add(id);
      } else if (times) {
        result.adds.push({
          programId: ask.program.id,
          name: ask.name,
          ...times
        });
      } else {
        result.open.add(id);
      }
    });
  return result;
}

/** A lone "T" in a days cell: one question per item. asks: Map(key -> { name, text }). */
export function tueThuCards(asks, answers) {
  return [...asks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, ask]) => ({
      id,
      title: `“${ask.name}” on ${ask.text}: is T Tuesday or Thursday?`,
      options: [
        { value: "Tuesday", label: "Tuesday" },
        { value: "Thursday", label: "Thursday" },
        LEAVE_OUT_OPTION
      ],
      answer: answers[id] || null
    }));
}

/** A dash between two days ("T-Th"): a range, or just those two? One question per item. */
export function dashCards(asks, answers) {
  return [...asks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, ask]) => {
      const labels = dashLabels(ask.from, ask.to);
      return {
        id,
        title: `“${ask.name}” on ${ask.text}: ${labels.range}, or ${labels.list.replace(/^Just/, "just")}?`,
        options: [
          { value: "range", label: labels.range },
          { value: "list", label: labels.list },
          LEAVE_OUT_OPTION
        ],
        answer: answers[id] || null
      };
    });
}

/**
 * 5 or 6 o'clock without AM or PM: one question per block. asks: Map(key -> { name, texts }).
 */
export function ampmCards(asks, answers) {
  return [...asks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, ask]) => ({
      id,
      title: `“${ask.name}” at ${ask.texts.join("–")}: morning or evening?`,
      options: [
        { value: "morning", label: "Morning" },
        { value: "evening", label: "Evening" },
        LEAVE_OUT_OPTION
      ],
      answer: answers[id] || null
    }));
}
