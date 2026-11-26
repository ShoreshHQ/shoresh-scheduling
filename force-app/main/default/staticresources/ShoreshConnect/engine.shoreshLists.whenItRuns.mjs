/*
 * When an activity runs (ADR 0031 A7): one column of the Activities list, in the words its
 * details panel says it (c/shoreshActivityDetails runsShown): "Whenever", or "Not " and the boxes
 * unticked, each "<time block>, <day>" (" (<program>)" after it when the season has several),
 * joined by "; ", in the panel's order: programs, their time blocks, then the camp's week. A
 * cell's value is { off: [boxes, "<time block Id>|<weekday>"], said: [each box's words] }: read
 * here as words, matched to the season's boxes in the proposal (checkRuns), and saved as the
 * boxes off, one ActivityOffTime record each, as a list's Weeks are (weeks.js weekRecords).
 */
import { CHILDREN, childRows, FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { WEEKDAYS, firstDayOf, programDays, tidy } from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import { spokenWeekday } from "./engine.shoreshDayNames.shoreshDayNames.mjs";

const OFF = FIELD.ActivityOffTime;
const PROGRAM = FIELD.Program;
const WHENEVER = "Whenever";

/** The When it runs column of the Activities list. */
export function runsColumn(t) {
  return {
    key: "runs",
    heading: "When it runs",
    words: ["When it runs"],
    type: "runs",
    // A box said without its program, when two programs have one of that name.
    programWord: t.sIn("Program"),
    unlike: `isn't "${WHENEVER}" or "Not" and the ${t.pIn("TimeBlock")} it can't run`,
    fromRecord: (r, setup) => shown(boxes(setup), new Set(offKeys(r)))
  };
}

/** The boxes unticked on an activity, as "<time block Id>|<weekday>". */
function offKeys(activity) {
  return childRows(activity, CHILDREN.Activity.OffTimes)
    .filter((row) => row[OFF.TimeBlock] && row[OFF.Day])
    .map((row) => `${row[OFF.TimeBlock]}|${row[OFF.Day]}`);
}

/** Capitals, spacing, and the spaces around a comma or bracket aside. */
function plain(text) {
  return tidy(text)
    .toLowerCase()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)/g, ")");
}

/**
 * Every box of the season's grids, in the panel's order: { key, block, day, said, words (each
 * way a file may say it: the day as the season says it or by its weekday name, with or without the program) }.
 */
function boxes(setup) {
  const programs = (setup && setup.programs) || [];
  const several = programs.length > 1;
  const first = firstDayOf(programDays(setup));
  const week = [...WEEKDAYS.slice(first), ...WEEKDAYS.slice(0, first)];
  const all = [];
  programs.forEach((entry) => {
    const program = entry.program || {};
    const days = week.filter((day) => program[PROGRAM[day]]);
    (entry.timeBlocks || []).forEach((block) =>
      days.forEach((day) => {
        const where = ` (${program.Name})`;
        const bare = [spokenWeekday(day), day].map(
          (name) => `${block.Name}, ${name}`
        );
        all.push({
          key: `${block.Id}|${day}`,
          block: block.Id,
          day,
          said: `${bare[0]}${several ? where : ""}`,
          words: new Set(
            [...bare, ...bare.map((b) => `${b}${where}`)].map(plain)
          )
        });
      })
    );
  });
  return all;
}

/** The boxes off, in the grids' order, with their words. */
function shown(all, off) {
  const on = all.filter((box) => off.has(box.key));
  return { off: on.map((box) => box.key), said: on.map((box) => box.said) };
}

/** When it runs as the panel says it. */
export function runsText(value) {
  const said = (value && value.said) || [];
  return said.length ? `Not ${said.join("; ")}` : WHENEVER;
}

/**
 * A When it runs cell: { value: { asked: [each box as written] } } ({ off: [] } for "Whenever"),
 * matched to the season's boxes by checkRuns, or { problem }.
 */
export function readRuns(column, text) {
  const said = tidy(text);
  if (["whenever", "every time"].includes(said.toLowerCase())) {
    return { value: { off: [], said: [] } };
  }
  const not = /^not\s+(.+)$/i.exec(said);
  if (!not) {
    return { problem: `"${said}" ${column.unlike}` };
  }
  const asked = not[1]
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part);
  return { value: { asked: [...new Set(asked)] } };
}

/**
 * Each row's boxes set against the season's: a box it doesn't have can't be read ("When it runs:
 * there's no Lunch, Saturday"), nor one said without its program that two programs have.
 */
export function checkRuns(rows, column, setup) {
  const all = boxes(setup);
  rows.forEach((r) => {
    const value = r.values[column.key];
    if (!value || !value.asked) {
      return;
    }
    const off = new Set();
    for (const part of value.asked) {
      const found = all.filter((box) => box.words.has(plain(part)));
      if (found.length !== 1) {
        r.problems.push(
          found.length
            ? `${column.heading}: "${part}" is in more than one ${column.programWord}`
            : `${column.heading}: there's no ${part}`
        );
        return;
      }
      off.add(found[0].key);
    }
    r.values[column.key] = shown(all, off);
  });
}

/**
 * The save's boxes off for one activity (ActivityOffTime records): one added for each box newly
 * off, one removed for each box back on. item: the activity's Id, or its key when the same save
 * adds it.
 */
export function runsRecords(setup, item, value) {
  const activity = ((setup && setup.activities) || []).find(
    (a) => a.Id === item
  );
  const now = new Map(
    childRows(activity, CHILDREN.Activity.OffTimes)
      .filter((row) => row[OFF.TimeBlock] && row[OFF.Day])
      .map((row) => [`${row[OFF.TimeBlock]}|${row[OFF.Day]}`, row])
  );
  const wanted = new Set((value && value.off) || []);
  const records = [];
  boxes(setup).forEach((box) => {
    if (wanted.has(box.key) && !now.has(box.key)) {
      records.push({
        kind: "ActivityOffTime",
        key: `ActivityOffTime:${item}:${box.key}`,
        fields: { [OFF.Day]: box.day },
        refs: { [OFF.TimeBlock]: box.block, [OFF.Activity]: item }
      });
    } else if (!wanted.has(box.key) && now.has(box.key)) {
      records.push({
        kind: "ActivityOffTime",
        id: now.get(box.key).Id,
        remove: true,
        fields: {}
      });
    }
  });
  return records;
}
