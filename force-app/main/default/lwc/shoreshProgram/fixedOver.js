import { FIELD } from "c/shoreshSchema";
import { WEEKDAYS } from "c/shoreshImportEngine";
import { spokenWeekday } from "c/shoreshDayNames";

const FIXED = FIELD.FixedActivity;
const RECURRING = FIELD.RecurringActivity;
const EXCEPTION = FIELD.WeekException;

/** "A", "A and B", "A, B and C". */
function listed(words) {
  return words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function quoted(name) {
  return `"${name}"`;
}

/** The weeks a row runs in: every week but its week-off marks. Null when the season has none. */
function weeksOf(weeks, off) {
  return weeks.length ? weeks.filter((w) => !off.has(w.Id)) : null;
}

function overlapInWeeks(a, b) {
  return a === null || b === null || a.some((w) => b.includes(w));
}

/**
 * CORE-3.9: the recurring activities a fixed activity being saved would share a time block with,
 * for the same groups on the same day (a fixed activity holds its blocks every day the program
 * runs, for every group, and on its early day from earlier, CORE-3.7), as the import asks it
 * (INGEST-3.11). Null when there is none, or when one sits only in the fixed activity's blocks
 * and can't go around it (the save then refuses, saying what to change). Otherwise the question
 * and the pieces each recurring activity keeps: { heading, lines, confirmLabel, around }.
 *
 * save: the table's save detail. weekExceptions: the season's week-off marks.
 */
export function fixedOver(entry, save, weeks, weekExceptions, terms) {
  const record = save.record || {};
  const saved = record.Id
    ? (entry.fixedActivities || []).find((f) => f.Id === record.Id)
    : null;
  if (
    record.Id &&
    ![FIXED.TimeBlock, FIXED.Length, FIXED.EarlyDay, FIXED.EarlyBlocks].some(
      (field) => field in record
    )
  ) {
    return null;
  }
  const fixed = { ...(saved || {}), ...record };
  const blocks = entry.timeBlocks || [];
  const start = blocks.findIndex((b) => b.Id === fixed[FIXED.TimeBlock]);
  if (start < 0) {
    return null;
  }
  const length = fixed[FIXED.Length] || 1;
  const earlyDay = fixed[FIXED.EarlyDay];
  const earlyBlocks = fixed[FIXED.EarlyBlocks] || 0;
  const program = entry.program || {};
  const runs = (day) => !!program[FIELD.Program[day]];
  const holds = (day, b) => {
    const from = day === earlyDay ? Math.max(0, start - earlyBlocks) : start;
    return runs(day) && b >= from && b < start + length;
  };

  const extras = save.extras || {};
  const backOn = new Set(extras.weeksBackOn || []);
  const fixedOff = new Set([
    ...(record.Id
      ? (weekExceptions || [])
          .filter(
            (x) => x[EXCEPTION.FixedActivity] === record.Id && !backOn.has(x.Id)
          )
          .map((x) => x[EXCEPTION.Week])
      : []),
    ...(extras.weeksOff || []).map((off) => off.week)
  ]);
  const fixedWeeks = weeksOf(weeks || [], fixedOff);

  const clashing = [];
  for (const item of entry.recurringActivities || []) {
    const first = blocks.findIndex((b) => b.Id === item[RECURRING.TimeBlock]);
    if (first < 0) {
      continue;
    }
    const off = new Set(
      (weekExceptions || [])
        .filter((x) => x[EXCEPTION.RecurringActivity] === item.Id)
        .map((x) => x[EXCEPTION.Week])
    );
    if (!overlapInWeeks(fixedWeeks, weeksOf(weeks || [], off))) {
      continue;
    }
    const days = WEEKDAYS.filter((d) => item[RECURRING[d]] && runs(d));
    const span = Math.min(first + (item[RECURRING.Length] || 1), blocks.length);
    const held = (b) => days.some((d) => holds(d, b));
    const at = [];
    const pieces = [];
    for (let b = first; b < span; b++) {
      if (held(b)) {
        at.push(b);
        continue;
      }
      const last = pieces[pieces.length - 1];
      if (last && last.end === b) {
        last.length += 1;
        last.end += 1;
      } else {
        pieces.push({ block: b, length: 1, end: b + 1 });
      }
    }
    if (!at.length) {
      continue;
    }
    if (!pieces.length) {
      return null;
    }
    clashing.push({
      item,
      at,
      days: days.filter((d) => at.some((b) => holds(d, b))),
      pieces
    });
  }
  if (!clashing.length) {
    return null;
  }

  const names = listed(clashing.map((c) => quoted(c.item.Name)));
  const atBlocks = [...new Set(clashing.flatMap((c) => c.at))].sort(
    (a, b) => a - b
  );
  const blockNames = listed(atBlocks.map((b) => blocks[b].Name));
  const onDays = listed(
    WEEKDAYS.filter((d) => clashing.some((c) => c.days.includes(d))).map(
      spokenWeekday
    )
  );
  const name = quoted(fixed.Name);
  const one = clashing.length === 1;
  return {
    heading: `What ${one ? "is" : "are"} ${names} at ${blockNames} on ${onDays}, where ${name} is?`,
    lines: [
      `${names} ${one ? "keeps its" : "keep their"} other ${terms.pIn("TimeBlock")}; ${name} takes ${blockNames}.`
    ],
    confirmLabel: `${names}, not at ${blockNames}`,
    around: clashing.flatMap((c) =>
      c.pieces.map((p) => ({
        target: c.item.Id,
        timeBlock: blocks[p.block].Id,
        length: p.length
      }))
    )
  };
}
