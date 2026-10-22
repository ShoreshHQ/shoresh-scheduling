/*
 * The camp's shape as the files show it: time blocks (in the order the day runs), which pages
 * share a set of time blocks (one program each), groups and their divisions, and the days.
 *
 * Adapted in part from Shoresh desktop (Apache-2.0, see NOTICE): src/ingest/periodSpan.js
 * (a row of ten minutes or less with nothing in it is passing time, not a time block) and
 * src/ingest/orderTimeBlocks.js (ordering, via text.timeRange).
 */
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
    guessedPm: !!(range && range.guessedPm)
  };
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

function conflicts(blocksA, blocksB) {
  return blocksA.some((a) =>
    blocksB.some(
      (b) => blockKey(a) !== blockKey(b) && !sameTimes(a, b) && overlaps(a, b)
    )
  );
}

/** The rows of each page that are time blocks: a short row with nothing starting in it is not. */
function pageBlocks(page, pageIndex, placements) {
  const used = new Set(
    placements.filter((p) => p.page === pageIndex).map((p) => p.row)
  );
  const blocks = [];
  page.rows.forEach((row, r) => {
    const block = blockFromLabel(row.label);
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
    const name = /[A-Za-z]/.test(b.name) ? b.name : b.holds || "This block";
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
  timetables.forEach((t) => {
    t.blocks = orderedBlocks(t.raw, context);
    for (const [key, value] of blockAt) {
      if (
        t.blocks.aliases.has(value) &&
        t.pages.includes(Number(key.split("|")[0]))
      ) {
        blockAt.set(key, t.blocks.aliases.get(value));
      }
    }
    delete t.raw;
  });
  return { timetables, blockAt, timetableOfPage, asks: context.asks };
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
  return ordered.map((group, order) => {
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
  });
}

/** Monday to Friday, in order, that the placements of a timetable fall on. */
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
