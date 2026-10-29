/*
 * The camp's shape as the files show it: time blocks (in the order the day runs), which pages
 * share a set of time blocks (one program each), groups and their divisions, and the days.
 *
 * Adapted in part from Shoresh desktop (Apache-2.0, see NOTICE): src/ingest/periodSpan.js
 * (a row of ten minutes or less with nothing in it is passing time, not a time block) and
 * src/ingest/orderTimeBlocks.js (ordering, via text.timeRange).
 */
import { foldName } from "./names";
import { LEAVE_OUT } from "./reading-constants";
import { WEEKDAYS, looseKey, timeRange, tidy, withoutTimes } from "./text";

export const CHANGE_OVER_MAX_MINUTES = 10;

/** One row label as a time block: { label, name, start, end } (minutes; end may be null). */
export function blockFromLabel(label) {
  const range = timeRange(label);
  const name = withoutTimes(label);
  return {
    label: tidy(label),
    name: name || tidy(label),
    start: range ? range.start : null,
    end: range ? range.end : null,
    guessedPm: !!(range && range.guessedPm),
    bare: !!(range && range.bare)
  };
}

/**
 * INGEST-2.10: a page's day runs forward. A time with no AM or PM whose morning reading would be
 * earlier than a block written above it is the afternoon or evening, read on in order and not
 * asked: Dinner "6:00-6:45" under a 2:45 block, then Evening Program "7:00-8:00" (7 in the
 * evening, never 7 in the morning before the day starts). Only a time with nothing later above it
 * is read by the camp-day rule alone, and a 5 or 6 o'clock one asked. Changes the blocks in place.
 */
function readForward(blocks) {
  let latest = null;
  for (const b of blocks) {
    if (b.start === null) {
      continue;
    }
    const morning = b.start < 12 * 60 ? b.start : b.start - 12 * 60;
    const evening = morning + 12 * 60;
    if (b.bare && latest !== null && morning < latest) {
      b.end = b.end === null ? null : b.end + evening - b.start;
      b.start = evening;
      // Still earlier than a block above, either way round (written out of order): asked.
      b.guessedPm = evening < latest && evening >= 17 * 60;
    }
    // A time still asked (6:00 at the top: morning or evening?) moves the day on only as far as
    // its earlier reading, so what follows is never read past it on a guess.
    const at = b.guessedPm ? b.start - 12 * 60 : b.start;
    latest = latest === null ? at : Math.max(latest, at);
  }
}

function blockKey(block) {
  if (block.start === null) {
    return `name:${looseKey(block.name)}`;
  }
  // A time read as afternoon only by the camp-day rule ("6:00-6:30") is kept apart from a
  // stated one ("6:00 PM-6:30 PM") until the director says morning or evening.
  const guessed = block.guessedPm && block.start >= 17 * 60 ? "?" : "";
  return `${block.start}-${block.end === null ? "" : block.end}${guessed}`;
}

function sameTimes(a, b) {
  return a.start === b.start && a.end === b.end;
}

function overlaps(a, b) {
  if (a.start === null || b.start === null) {
    return false;
  }
  const aEnd = a.end === null ? a.start + 1 : a.end;
  const bEnd = b.end === null ? b.start + 1 : b.end;
  return a.start < bEnd && b.start < aEnd;
}

/**
 * Whether a page's blocks clash with a timetable's: one of them, not already in the timetable,
 * overlaps one of the timetable's at other times. A page whose blocks are all the timetable's
 * joins it, even when they overlap each other (a by-group page with a week's short Friday).
 */
function conflicts(blocksA, blocksB) {
  const keysA = new Set(blocksA.map(blockKey));
  return blocksB
    .filter((b) => !keysA.has(blockKey(b)))
    .some((b) =>
      blocksA.some(
        (a) => blockKey(a) !== blockKey(b) && !sameTimes(a, b) && overlaps(a, b)
      )
    );
}

/** The rows of each page that are time blocks: a short row with nothing starting in it is not. */
function pageBlocks(page, pageIndex, placements) {
  const used = new Set(
    placements.filter((p) => p.page === pageIndex).map((p) => p.row)
  );
  const read = page.rows.map((row) => blockFromLabel(row.label));
  readForward(read);
  const blocks = [];
  page.rows.forEach((row, r) => {
    const block = read[r];
    const short =
      block.start !== null &&
      block.end !== null &&
      block.end - block.start <= CHANGE_OVER_MAX_MINUTES;
    if (short && !used.has(r)) {
      return;
    }
    blocks.push({
      ...block,
      row: r,
      key: blockKey(block),
      holds: mostSeen(placements, pageIndex, r)
    });
  });
  return blocks;
}

/** What a row holds most often ("Late pickup"), to name a block that is only a time. */
function mostSeen(placements, pageIndex, row) {
  const counts = new Map();
  placements
    .filter((p) => p.page === pageIndex && p.row === row)
    .forEach((p) => counts.set(p.text, (counts.get(p.text) || 0) + 1));
  const [top] = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  return top ? top[0] : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 45;
}

/**
 * A block written without AM or PM at 5 or 6 o'clock ("6:00-6:30") could be early morning
 * (before the day) or evening (aftercare): nothing in the file settles it, so the director is
 * asked (coordinator review, 2026-10-16), never guessed. Until answered it stays in the evening,
 * as the camp-day rule reads it; "Leave it out" leaves the block out with what is in it.
 */
function morningOrEvening(blocks, context) {
  for (const b of blocks.filter((x) => x.guessedPm && x.start >= 17 * 60)) {
    // A block that is only a time is named by what it holds.
    const name = /\p{L}/u.test(b.name) ? b.name : b.holds || "This block";
    // Per time and what it holds: two programs' "6:00-6:30" rows are separate questions.
    const id = `ampm|${b.label}|${name}`;
    context.asks.push({
      id,
      type: "ampm",
      name,
      start: b.start,
      end: b.end
    });
    const answer = context.answers[id];
    // Unanswered, it is not merged with any other block.
    b.pending = !answer;
    if (answer === "morning") {
      b.start -= 12 * 60;
      b.end = b.end === null ? null : b.end - 12 * 60;
      b.readAsMorning = true;
    } else if (answer === "leaveOut") {
      b.leftOutByAnswer = true;
    }
  }
}

/** One timetable's blocks: each once, in time order, every end filled in (or marked guessed). */
function orderedBlocks(blocks, context) {
  const byKey = new Map();
  for (const block of blocks) {
    if (!byKey.has(block.key)) {
      byKey.set(block.key, { ...block });
    }
  }
  const timed = [...byKey.values()].filter((b) => b.start !== null);
  const untimed = [...byKey.values()].filter((b) => b.start === null);
  morningOrEvening(timed, context);
  // An answer can make two blocks the same ("6:00 AM-6:30 AM" and "6:00-6:30" read as
  // morning): keep one, and send the other's placements to it.
  const aliases = new Map();
  const seen = new Map();
  // Unanswered or left out, a bare time is never merged into another block.
  for (const b of timed.filter((x) => !x.pending && !x.leftOutByAnswer)) {
    const at = `${b.start}-${b.end}`;
    const first = seen.get(at);
    if (!first) {
      seen.set(at, b);
    } else if (first.guessedPm && !b.guessedPm) {
      // Keep the block whose label states AM or PM ("6:00 AM-6:30 AM").
      aliases.set(first.key, b.key);
      seen.set(at, b);
    } else {
      aliases.set(b.key, first.key);
    }
  }
  for (const [from, to] of aliases) {
    if (aliases.has(to)) {
      aliases.set(from, aliases.get(to));
    }
  }
  const kept = timed.filter((b) => !aliases.has(b.key));
  timed.length = 0;
  timed.push(...kept);
  timed.sort((a, b) => a.start - b.start || (a.end || 0) - (b.end || 0));
  const usual = median(
    timed.filter((b) => b.end !== null).map((b) => b.end - b.start)
  );
  timed.forEach((block, i) => {
    if (block.end === null) {
      const next = timed[i + 1];
      block.end = next ? next.start : block.start + usual;
      block.guessedEnd = !next;
    }
  });
  const result = [...timed, ...untimed];
  result.aliases = aliases;
  return result;
}

/** What one timetable's pages hold: its groups, its week|day pairs, and its block keys. */
function timetableShape(t, placements) {
  const pages = new Set(t.pages);
  const here = placements.filter((p) => pages.has(p.page));
  return {
    groups: new Set(here.map((p) => p.group)),
    cells: new Set(here.map((p) => `${p.group}|${p.week || ""}|${p.day}`)),
    weekDays: new Set(here.map((p) => `${p.week || ""}|${p.day}`)),
    ownDays: t.ownDays || [],
    // Its regular blocks: not those of a day joined as that day's own (INGEST-4.3).
    keys: new Set(
      t.raw.map((b) => b.key).filter((k) => !(t.ownKeys || new Set()).has(k))
    ),
    here
  };
}

/**
 * INGEST-4.3 (weeks.md): the week|day pairs of `other` whose cells sit in time blocks `main`
 * does not have, when `other` is only a few days' own shape of `main`'s program, else null.
 * It is when: the files have two weeks or more; it covers groups and days `main` does not have
 * for them; its blocks differ on at most one day of a week, on fewer than half of all the days,
 * and not in every week, unless it is the same weekday in every week or the files hold one week
 * (INGEST-4.12, `every`); and its groups are `main`'s, or (new groups, a second session) its
 * other days use only `main`'s blocks. Different groups on different blocks most days: a program.
 */
function ownDayShape(main, other, blockAt) {
  if (
    other.cells.size === 0 ||
    [...other.cells].some((c) => main.cells.has(c))
  ) {
    return null;
  }
  const differing = new Set(
    other.here
      .filter((p) => !main.keys.has(blockAt.get(`${p.page}|${p.row}`)))
      .map((p) => `${p.week || ""}|${p.day}`)
  );
  const weeks = [...differing].map((wd) => wd.split("|")[0]);
  // A week with another day of its own already (INGEST-4.8): asked, never decided.
  const already = main.ownDays.map((o) => o.week);
  const counted = [...weeks, ...already];
  const allWeeks = new Set(
    [...main.weekDays, ...other.weekDays].map((wd) => wd.split("|")[0])
  );
  const total = new Set([...main.weekDays, ...other.weekDays]).size;
  const sameGroups = [...other.groups].every((g) => main.groups.has(g));
  const sameOtherDays = [...other.weekDays].some((wd) => !differing.has(wd));
  // INGEST-4.12: the same weekday on its own times in every week of the files (one week too).
  const every =
    new Set([...differing].map((wd) => wd.split("|")[1])).size === 1 &&
    new Set(weeks).size === allWeeks.size;
  const shape =
    differing.size > 0 &&
    differing.size * 2 < total &&
    (every || (allWeeks.size >= 2 && new Set(weeks).size < allWeeks.size)) &&
    (sameGroups || sameOtherDays);
  if (!shape) {
    return null;
  }
  return {
    days: [...differing],
    every,
    oneWeek: allWeeks.size === 1,
    twoInAWeek: new Set(counted).size !== counted.length
  };
}

const WEEKEND = ["Saturday", "Sunday"];

/**
 * INGEST-4.12: whether a weekday on its own times is that day in every week. In files of two
 * weeks or more, or a weekend day, it is; a mid-week day in a one-week file is asked "Every week,
 * or just this once?" (unanswered, just this once).
 */
function everyWeek(found, context) {
  const day = found.days[0].split("|")[1];
  if (!found.oneWeek || WEEKEND.includes(day)) {
    return true;
  }
  const id = `everyWeek|${day}`;
  if (!context.asks.some((a) => a.id === id)) {
    context.asks.push({ id, type: "everyWeek", day });
  }
  return context.answers[id] === "every";
}

/**
 * INGEST-4.12 on pages that hold every day's blocks (by-group pages): a weekday whose cells use
 * blocks no other day uses, at times that overlap the other days' blocks, in every week it has,
 * is that weekday on its own times. Marks its blocks as its own and its days as days of their own.
 */
function ownWeekdays(t, placements, blockAt, context, notes) {
  const pages = new Set(t.pages);
  const here = placements
    .filter((p) => pages.has(p.page))
    .map((p) => ({ ...p, key: blockAt.get(`${p.page}|${p.row}`) }));
  const byKey = new Map(t.raw.map((b) => [b.key, b]));
  const keysOn = (day) =>
    new Set(here.filter((p) => p.day === day).map((p) => p.key));
  const days = [...new Set(here.map((p) => p.day))];
  const weeks = new Set(here.map((p) => p.week || ""));
  for (const day of days) {
    const others = new Set(
      here
        .filter((p) => p.day !== day && !(t.ownKeys || new Set()).has(p.key))
        .map((p) => p.key)
    );
    const own = [...keysOn(day)].filter(
      (k) =>
        !others.has(k) &&
        byKey.get(k) &&
        [...others].some(
          (o) =>
            byKey.get(o) &&
            !sameTimes(byKey.get(o), byKey.get(k)) &&
            overlaps(byKey.get(o), byKey.get(k))
        )
    );
    const ownSet = new Set(own);
    const inWeeks = new Set(
      here
        .filter((p) => p.day === day && ownSet.has(p.key))
        .map((p) => p.week || "")
    );
    if (
      own.length === 0 ||
      days.length < 3 ||
      inWeeks.size !== weeks.size ||
      (t.ownDays || []).some((o) => o.day === day)
    ) {
      continue;
    }
    const found = {
      days: [...weeks].map((w) => `${w}|${day}`),
      oneWeek: weeks.size === 1
    };
    const every = everyWeek(found, context);
    t.ownKeys = new Set([...(t.ownKeys || []), ...own]);
    t.ownDays = [
      ...(t.ownDays || []),
      ...[...weeks].map((week) => ({ week, day, every }))
    ];
    notes.push({ type: "weekDay", week: [...weeks][0], day, id: null, every });
  }
}

/**
 * INGEST-4.8: a week with two days of their own times could be two special days or a second
 * program: asked. Unanswered (or "A second program") the days stay a program of their own, as
 * before; "Special days" joins them; "Leave it out" joins them, left out.
 */
function twoDaysAsk(main, found, context) {
  const all = [
    ...main.ownDays,
    ...found.days.map((wd) => {
      const [week, day] = wd.split("|");
      return { week, day };
    })
  ];
  const week = found.days[0].split("|")[0];
  const days = all.filter((o) => o.week === week).map((o) => o.day);
  const id = `ownDays|${week}`;
  if (!context.asks.some((a) => a.id === id)) {
    context.asks.push({ id, type: "ownDays", week, days });
  }
  return context.answers[id];
}

/**
 * Timetables that are only one day's own blocks in some week (a short Friday in week 2) join
 * the program whose groups they share, instead of reading as a second program (INGEST-4.3).
 * Changes `timetables` in place; returns a note for each such day.
 */
function weekDayShapes(timetables, placements, blockAt, context) {
  const notes = [];
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < timetables.length && !merged; i++) {
      for (let j = 0; j < timetables.length && !merged; j++) {
        const main = timetables[i];
        const other = timetables[j];
        const found =
          i !== j &&
          ownDayShape(
            timetableShape(main, placements),
            timetableShape(other, placements),
            blockAt
          );
        // review.md INGEST-5.4: one day of its own is read as a special day, listed under
        // "Read as", where "A second program" keeps it a program of its own.
        const oneDayId = found
          ? `ownDays|${found.days[0].split("|")[0]}`
          : null;
        const answer =
          found && found.twoInAWeek
            ? twoDaysAsk(timetableShape(main, placements), found, context)
            : (found && context.answers[oneDayId]) || "special";
        if (found && !found.twoInAWeek && answer === "program") {
          const [week, day] = found.days[0].split("|");
          notes.push({ type: "weekDay", week, day, id: oneDayId, answer });
        }
        const join = found && (answer === "special" || answer === LEAVE_OUT);
        const every = join && found.every && everyWeek(found, context);
        const days = join ? found.days : null;
        if (days) {
          const regular = timetableShape(main, placements).keys;
          main.ownKeys = new Set([
            ...(main.ownKeys || []),
            ...other.raw.map((b) => b.key).filter((k) => !regular.has(k))
          ]);
          main.pages.push(...other.pages);
          main.raw.push(...other.raw);
          timetables.splice(j, 1);
          days.forEach((wd) => {
            const [week, day] = wd.split("|");
            main.ownDays = [
              ...(main.ownDays || []),
              { week, day, leftOut: answer === LEAVE_OUT, every }
            ];
            // Every week: one note for the day, not one a week.
            if (answer !== LEAVE_OUT && (!every || wd === days[0])) {
              notes.push({
                type: "weekDay",
                week,
                day,
                id: found.twoInAWeek ? null : oneDayId,
                answer,
                ...(every ? { every } : {})
              });
            }
          });
          merged = true;
        }
      }
    }
  }
  return notes;
}

/**
 * INGEST-4.13 (weeks.md): a day of its own times (INGEST-4.3, 4.12) that is only the regular day
 * ending early is the regular day. Every week it has, its cells sit in the regular blocks that end
 * by the time its one own block starts, and that last block holds, for every group, what the
 * regular day's last block holds (Dismissal), starting earlier and ending by the day's end. Then
 * it is no day of its own: that block's cells run from the regular block it starts in to the end
 * of the day (dismissal holds the extra time), nothing is asked or noted. Changes `t`, `blockAt`
 * and `context` in place; returns Map(cellAt -> { keys: the regular blocks it covers, text }).
 */
export const cellAt = (p) =>
  `${p.page}|${p.row}|${p.recordName ?? p.group}|${p.day}`;

function earlyEnds(t, placements, blockAt, context, notes) {
  const found = new Map();
  t.ownKeys = t.ownKeys || new Set();
  const ownKeys = t.ownKeys;
  const byKey = new Map(t.raw.map((b) => [b.key, b]));
  const regular = [...byKey.values()]
    .filter((b) => !ownKeys.has(b.key) && b.start !== null && b.end !== null)
    .sort((a, b) => a.start - b.start);
  if (regular.length < 2) {
    return found;
  }
  const last = regular[regular.length - 1];
  const pages = new Set(t.pages);
  const here = placements
    .filter((p) => pages.has(p.page))
    .map((p) => ({ ...p, key: blockAt.get(`${p.page}|${p.row}`) }));
  // What the regular day ends with: a text in the last block on most of the group-days.
  const groupDays = new Set(here.map((p) => `${p.group}|${p.week}|${p.day}`));
  const inLast = new Map();
  here
    .filter((p) => p.key === last.key)
    .forEach((p) =>
      inLast.set(looseKey(p.text), (inLast.get(looseKey(p.text)) || 0) + 1)
    );
  const lastHolds = [...inLast]
    .filter(([text, n]) => text && n * 2 > groupDays.size)
    .map(([text]) => text);
  // "Dismissal at 12" (its time read off as a time: "Dismissal at") is the last block's Dismissal.
  const dismissal = (text) => {
    const key = looseKey(text);
    return (
      lastHolds.find(
        (h) =>
          key === h ||
          (key.startsWith(h) && /^ at( |$)/.test(key.slice(h.length)))
      ) || null
    );
  };
  const days = [...new Set((t.ownDays || []).map((o) => o.day))];
  for (const day of days) {
    const entries = t.ownDays.filter((o) => o.day === day);
    if (
      entries.some((o) => o.leftOut) ||
      context.asks.some(
        (a) => a.type === "ownDays" && entries.some((o) => o.week === a.week)
      )
    ) {
      continue;
    }
    const remap = new Map();
    const early = entries.every((o) => {
      const cells = here.filter(
        (p) => p.day === day && (p.week || "") === o.week
      );
      const own = [...new Set(cells.map((p) => p.key))].filter((k) =>
        t.ownKeys.has(k)
      );
      const block = own.length === 1 && byKey.get(own[0]);
      if (!block || block.start === null || block.end === null) {
        return false;
      }
      const inOwn = cells.filter((p) => p.key === own[0]);
      const texts = new Set(inOwn.map((p) => dismissal(p.text)));
      const groups = new Set(cells.map((p) => p.group));
      const before = cells.filter((p) => p.key !== own[0]);
      const ok =
        texts.size === 1 &&
        [...texts][0] !== null &&
        new Set(inOwn.map((p) => p.group)).size === groups.size &&
        block.end <= last.end &&
        block.start < last.start &&
        before.every((p) => {
          const b = byKey.get(p.key);
          return b && !t.ownKeys.has(p.key) && b.end <= block.start;
        });
      if (ok) {
        const from = regular.findIndex((b) => b.end > block.start);
        const keys = regular.slice(from).map((b) => b.key);
        inOwn.forEach((p) => remap.set(cellAt(p), { keys, p }));
      }
      return ok;
    });
    if (!early) {
      continue;
    }
    const weeks = new Set(entries.map((o) => o.week));
    t.ownDays = t.ownDays.filter((o) => o.day !== day);
    const gone = new Set();
    for (const [at, { keys, p }] of remap) {
      const row = `${p.page}|${p.row}`;
      gone.add(p.key);
      blockAt.set(row, keys[0]);
      found.set(at, { keys, text: textOf(p) });
    }
    t.ownKeys = new Set([...t.ownKeys].filter((k) => !gone.has(k)));
    t.raw = t.raw.filter((b) => !gone.has(b.key));
    context.asks = context.asks.filter((a) => a.id !== `everyWeek|${day}`);
    const kept = notes.filter(
      (n) => !(n.type === "weekDay" && n.day === day && weeks.has(n.week))
    );
    notes.length = 0;
    notes.push(...kept);
  }
  // Dismissal written in an earlier regular block for every group, the rest of the day blank
  // (or one cell merged down to the day's end): it runs to the end of the day.
  const order = new Map(regular.map((b, i) => [b.key, i]));
  const byDay = new Map();
  here
    .filter((p) => order.has(p.key) && !found.has(cellAt(p)))
    .forEach((p) => {
      const wd = `${p.week || ""}|${p.day}`;
      byDay.set(wd, [...(byDay.get(wd) || []), p]);
    });
  for (const cells of byDay.values()) {
    const latest = Math.max(...cells.map((p) => order.get(p.key)));
    const end = cells.filter((p) => order.get(p.key) === latest);
    const groups = new Set(cells.map((p) => p.group));
    if (
      latest === regular.length - 1 ||
      new Set(end.map((p) => p.group)).size !== groups.size ||
      !end.every((p) => dismissal(p.text))
    ) {
      continue;
    }
    const keys = regular.slice(latest).map((b) => b.key);
    end.forEach((p) => found.set(cellAt(p), { keys, text: textOf(p) }));
  }
  return found;

  function textOf(p) {
    const hold = dismissal(p.text);
    const named = here.find(
      (x) => x.key === last.key && looseKey(x.text) === hold
    );
    return named ? named.text : p.text;
  }
}

/**
 * Pages that share a set of time blocks become one timetable (one program). Pages whose blocks
 * overlap at different times (9:00-9:45 against 9:00-9:50) go to separate timetables. Returns
 * { timetables: [{ index, pages, blocks }], blockAt: Map("page|row" -> block key),
 *   timetableOfPage: Map(page -> index) }.
 */
export function buildTimetables(pages, placements, answers = {}) {
  const context = { answers, asks: [] };
  const timetables = [];
  const timetableOfPage = new Map();
  const blockAt = new Map();
  pages.forEach((page, pageIndex) => {
    const blocks = pageBlocks(page, pageIndex, placements);
    blocks.forEach((b) => blockAt.set(`${pageIndex}|${b.row}`, b.key));
    let target = timetables.find((t) => !conflicts(t.raw, blocks));
    if (!target) {
      target = { index: timetables.length, pages: [], raw: [] };
      timetables.push(target);
    }
    target.pages.push(pageIndex);
    target.raw.push(...blocks);
    timetableOfPage.set(pageIndex, target.index);
  });
  const notes = weekDayShapes(timetables, placements, blockAt, context);
  timetables.forEach((t) =>
    ownWeekdays(t, placements, blockAt, context, notes)
  );
  const early = new Map();
  timetables.forEach((t) =>
    earlyEnds(t, placements, blockAt, context, notes).forEach((keys, at) =>
      early.set(at, keys)
    )
  );
  timetables.forEach((t, index) => {
    t.index = index;
    t.pages.forEach((page) => timetableOfPage.set(page, index));
  });
  timetables.forEach((t) => {
    t.blocks = orderedBlocks(t.raw, context);
    // A block only a day's own shape has (INGEST-4.3) is that special day's, not the program's.
    t.ownDays = t.ownDays || [];
    t.blocks.forEach((b) => {
      b.ownDay = !!(t.ownKeys && t.ownKeys.has(b.key));
    });
    delete t.ownKeys;
    for (const [key, value] of blockAt) {
      if (
        t.blocks.aliases.has(value) &&
        t.pages.includes(Number(key.split("|")[0]))
      ) {
        blockAt.set(key, t.blocks.aliases.get(value));
      }
    }
    // An early end's blocks, as merged by an answer (INGEST-4.13).
    for (const [at, v] of early) {
      if (t.pages.includes(Number(at.split("|")[0]))) {
        v.keys = [...new Set(v.keys.map((k) => t.blocks.aliases.get(k) ?? k))];
      }
    }
    delete t.raw;
  });
  return {
    timetables,
    blockAt,
    timetableOfPage,
    earlyEnds: early,
    asks: context.asks,
    notes
  };
}

/**
 * The groups the files name, each once (first spelling kept), with the division the files give
 * it most often, and the timetable of the first page it appears on.
 */
export function collectGroups(noted, timetableOfPage) {
  const byName = new Map();
  for (const entry of noted) {
    const name = tidy(entry.name);
    if (!name) {
      continue;
    }
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        recordName: entry.recordName || name,
        base: entry.base || name,
        hint: entry.hint || null,
        votes: new Map(),
        // Divisions a page states for it, not only its file's name.
        stated: new Set(),
        timetable: timetableOfPage.get(entry.page),
        order: byName.size,
        onlyInCells: true
      });
    }
    byName.get(name).onlyInCells =
      byName.get(name).onlyInCells && !!entry.fromCell;
    if (entry.division && !entry.weakDivision) {
      const votes = byName.get(name).votes;
      votes.set(entry.division, (votes.get(entry.division) || 0) + 1);
      if (!entry.fromFileName) {
        byName.get(name).stated.add(entry.division);
      }
    }
  }
  // Groups only ever listed inside cells (by-activity files) come in no order of their own:
  // they follow the others, in natural order ("Bunk 2" before "Bunk 10").
  const natural = (a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  const listed = [...byName.values()];
  const ordered = [
    ...listed.filter((g) => !g.onlyInCells),
    ...listed.filter((g) => g.onlyInCells).sort(natural)
  ];
  return ownDivisions(
    ordered.map((group, order) => {
      let division = null;
      let best = 0;
      for (const [name, count] of group.votes) {
        if (count > best) {
          division = name;
          best = count;
        }
      }
      return {
        name: group.name,
        recordName: group.recordName,
        base: group.base,
        hint: group.hint,
        division,
        // Its division only a file's name gave: a guess (ADR 0006 §21).
        divisionGuessed: !!division && !group.stated.has(division),
        timetable: group.timetable,
        order
      };
    })
  );
}

/**
 * Rule 1 (names-and-divisions.md, Greg 2026-10-27): where the file shows divisions for the other
 * groups of a timetable, a group it names with no division is its own division, named after it
 * (CIT beside Pirchim 1 and Garinim 1 is division CIT), marked `ownDivision` for the notes. A
 * file with no divisions at all keeps its groups undivided.
 */
// Columns for everyone or for no group (All Camp, Staff, Notes) are never a division of one:
// left to the division question.
const CAMP_WIDE =
  /^(all|allcamp|wholecamp|entirecamp|everyone|everybody|camp|staff|counsell?ors?|notes?|totals?|other|misc)$/;

export function ownDivisions(groups) {
  const withDivision = groups.filter((g) => g.division);
  const divided = new Set(withDivision.map((g) => g.timetable));
  // A name the files give a division elsewhere (Bunk 1 in Juniors, in another program) is that
  // division's group, still asked about, not a division of its own.
  const named = new Set(withDivision.map((g) => g.recordName));
  const alone = (g) =>
    !g.division &&
    !CAMP_WIDE.test(foldName(g.name)) &&
    !g.hint &&
    divided.has(g.timetable) &&
    !named.has(g.recordName);
  return groups.map((g) => {
    return alone(g) ? { ...g, division: g.name, ownDivision: true } : g;
  });
}

/** The days, Monday first, that the placements of a timetable fall on. */
export function daysOf(placements) {
  const days = new Set(placements.map((p) => p.day));
  return WEEKDAYS.filter((day) => days.has(day));
}

/**
 * Cells two files (or two pages) both describe and disagree about: the same group, week, day,
 * and time block with different names. Returns [{ id, week, group, day, block, versions:
 * [{ text, files }] }] and the placements grouped by cell.
 */
export function crossCheck(placements, blockName) {
  const byCell = new Map();
  for (const p of placements) {
    const key = [p.week, p.group, p.day, p.blockKey].join("|");
    if (!byCell.has(key)) {
      byCell.set(key, []);
    }
    byCell.get(key).push(p);
  }
  const disagreements = [];
  for (const [key, list] of byCell) {
    const texts = new Map();
    for (const p of list) {
      if (!texts.has(p.text)) {
        texts.set(p.text, new Set());
      }
      texts.get(p.text).add(p.file);
    }
    if (texts.size > 1) {
      const first = list[0];
      disagreements.push({
        id: `cross|${key}`,
        cell: key,
        week: first.week,
        group: first.group,
        day: first.day,
        block: blockName(first),
        versions: [...texts].map(([text, files]) => ({
          text,
          files: [...files].sort()
        }))
      });
    }
  }
  return { disagreements, byCell };
}
