import { buildTerms } from "c/shoreshTerms";
import { reasonFor } from "./words";
import { DAY_NAMES, checkWeek, weekdayOf } from "./checks";
import { readLocations as readLocationMap } from "./checkInputs";
import { identity } from "./grid";
import {
  atCamp,
  compareText,
  minutes,
  readActivities,
  readDays,
  readEligibility,
  readGroups,
  readLocations,
  readPartsOfDay,
  readSetTimeLocations
} from "./setup";
import {
  BUSY,
  NO_FIT,
  OVERLAP,
  RELAX_ORDER,
  RULE,
  lockKey,
  scheduleWeekSteps
} from "./week";

export { BUSY, NO_FIT, RELAX_ORDER, RULE, reasonFor, checkWeek };
export { readActivities, readLocations, readProgram } from "./checkInputs";

/** How a week is built: every unlocked cell again, or only the Open ones. */
export const MODE = Object.freeze({ FULL: "full", FILL_OPEN: "fillOpen" });

/**
 * Generated Schedule's engine (ADR 0010): one program's week, built in the browser from the
 * week's grid and the season's setup. Pure: no server calls, no saving, no clock, no
 * Math.random; the same inputs and option always give the same week.
 *
 * input:
 *   programId, weekId, option (1, 2, ... for "Try another"), mode (MODE.FULL keeps locked cells,
 *     fixed and recurring activities and not-set-up items; MODE.FILL_OPEN keeps every filled cell)
 *   days: the week's days as Manual Build's DayView has them
 *     ({ dateValue, blocks: [{ id, name, startTime, endTime }], groups: [{ id, name }],
 *        items: [{ kind, id, name }], rows: ["1,^,", ...] }), fixed and recurring activities in
 *   groups, timeBlocks, activities, eligibilities (ActivityEligibility rows), locations,
 *     fixedActivities, recurringActivities, weekExceptions: the season's records
 *   locks: [{ date, groupId, blockId }]: a lock on any cell of a placement keeps all of it
 *   otherPrograms: [{ date, startTime, endTime, locationId, activityId, groups }]: other
 *     programs' groups in a place (or doing an activity) at a clock time; counted against
 *     groups that fit and groups at once
 *   terms: the camp's words (c/shoreshTerms), for the reasons
 *
 * Returns { ok: true, days, flags, stillNeeded, spread, stillNeededBy, spreadBy, overlapping, cells,
 * openCells, ruleChecks }
 * or
 * { ok: false, error }:
 *   days: the same DayView shape, with new rows and items
 *   flags: checkWeek's dots on the finished week, one entry per cell of each dotted placement:
 *     [{ date, groupId, blockId, activityId, bends: [RULE...], reason }]. A cell the engine had to
 *     bend a rule for always has one; so does anything kept that breaks a rule
 *   stillNeeded, spread, stillNeededBy, spreadBy, cells: checkWeek's lines, the same as data,
 *     and counts, the same words as Manual Build ("Swim · Bunk 3: 1 still needed by Wednesday")
 *   overlapping: checkWeek's cells where a placement breaks a rule that time block shares with
 *     other cells: [{ dateValue, groupId, blockId, rules: [RULE... or BUSY], text }]
 *   ruleChecks: how many times a placement was checked against the rules, over every build: the
 *     work done, the same on any machine
 *   openCells: [{ date, groupId, blockId, reason }] for an at-camp cell left Open: the group is
 *     busy at an overlapping time ("Already busy then"), or no activity's length fits the gap
 */
export function generateWeek(input) {
  const steps = generateWeekSteps(input);
  let step = steps.next();
  while (!step.done) {
    step = steps.next();
  }
  return step.value;
}

/**
 * generateWeek in steps (ADR 0010 §22): a generator that yields how far the build has got, a
 * number from 0 to 1 that only goes up, and returns generateWeek's result. A screen runs a few
 * steps at a time between paints so a big week never freezes the tab; the steps never change
 * the week, so it is the same as generateWeek's. It ends at 1. A week built twice (the minimum
 * repair's leniency, below) spends the first half of the way on the first build; once the first
 * build's minimum repair shows it won't be built again, the rest of the first build fills the
 * rest of the way.
 */
export function* generateWeekSteps(input) {
  const t = input.terms || buildTerms([]);
  const weekId = input.weekId || null;
  const activities = readActivities(
    input.activities,
    input.weekExceptions,
    weekId
  );
  if (!activities.running.length) {
    return {
      ok: false,
      error: activities.total
        ? `No ${t.pIn("Activity")} run this ${t.sIn("Week")}.`
        : `No ${t.pIn("Activity")} are set up yet.`
    };
  }
  const groups = readGroups(input.groups);
  const days = readDays(input.days, readPartsOfDay(input.timeBlocks));
  if (!days.length) {
    return {
      ok: false,
      error: `This ${t.sIn("Week")} has no days to build.`
    };
  }
  const option = optionOf(input.option);
  if (!option) {
    return { ok: false, error: "That option can't be built." };
  }
  const { fit } = readLocations(input.locations);
  const model = {
    days,
    groups,
    groupIds: groupOrder(groups, days),
    acts: activities.running,
    eligibility: readEligibility(
      activities.running,
      input.eligibilities,
      groups
    ),
    fit,
    setTimeLocation: readSetTimeLocations(
      input.fixedActivities,
      input.recurringActivities
    ),
    locks: new Set(
      (input.locks || []).map((l) => lockKey(l.date, l.groupId, l.blockId))
    ),
    mode: input.mode === MODE.FILL_OPEN ? MODE.FILL_OPEN : MODE.FULL,
    seed: `${input.programId || ""}|${weekId || ""}|${option}`,
    ...otherPrograms(input.otherPrograms, days)
  };
  const words = { t, dayName: (date) => DAY_NAMES[weekdayOf(date)] || "" };
  function* build(settings, from, share, once) {
    const notes = {};
    const steps = scheduleWeekSteps(settings, notes);
    // Where the bar was when it became known this is the only build (see above), if it is.
    let alone = null;
    let step = steps.next();
    while (!step.done) {
      const f = step.value;
      if (once && !alone && notes.settled && !notes.leftForNeverBlank) {
        alone = { f, at: from + share * f };
      }
      yield alone && alone.f < 1
        ? alone.at + ((f - alone.f) / (1 - alone.f)) * (1 - alone.at)
        : from + share * f;
      step = steps.next();
    }
    const state = step.value;
    const built = writeDays(settings, state);
    yield once && !state.leftForNeverBlank ? 1 : from + share;
    return {
      state,
      built,
      checked: checkWeek(built, checkModel(input, settings, state), words)
    };
  }
  let chosen = yield* build(model, 0, 0.5, true);
  let ruleChecks = chosen.state.ruleChecks;
  if (chosen.state.leftForNeverBlank) {
    // The minimum repair left a cell for never-blank to fill. Keep that week only if it is no
    // worse: it meets more minimums, or as many with no more bends (ADR 0010).
    const strict = yield* build(
      { ...model, strictRepair: true },
      0.5,
      0.5,
      false
    );
    ruleChecks += strict.state.ruleChecks;
    if (worse(chosen.checked, strict.checked)) {
      chosen = strict;
    }
  }
  const { state, built, checked } = chosen;
  return {
    ok: true,
    days: built,
    flags: flagCells(built, checked),
    stillNeeded: checked.stillNeeded,
    spread: checked.spread,
    stillNeededBy: checked.stillNeededBy,
    spreadBy: checked.spreadBy,
    overlapping: checked.overlapping,
    cells: checked.cells,
    ruleChecks,
    openCells: state.openCells.map(({ key, why }) => {
      const [groupId, d, blockId] = state.splitKey(key);
      return {
        date: days[d].date,
        groupId,
        blockId,
        reason: reasonFor(why === OVERLAP ? BUSY : NO_FIT, { terms: t })
      };
    })
  };
}

/**
 * A Generated week as it stands (built, saved or cleared), checked by the same rules and model
 * the engine checks its own builds with: the screen's dots, counters and lines, worked out again
 * whenever the week is shown, never stored (ADR 0010 §11). input: generateWeek's (days are the
 * week to check; option and mode don't matter). Returns { days, checked, isAway, shortest }: the
 * days in date order (checkWeek's day numbers count in it), checkWeek's answer, whether a group
 * is away from camp in a block (the cells shown hatched; a group the server didn't send is away
 * in all of them), and the shortest activity running this week, in blocks.
 */
export function checkGeneratedWeek(input) {
  const t = input.terms || buildTerms([]);
  const activities = readActivities(
    input.activities,
    input.weekExceptions,
    input.weekId || null
  );
  const groups = readGroups(input.groups);
  const days = readDays(input.days, readPartsOfDay(input.timeBlocks));
  const model = {
    days,
    groups,
    groupIds: groupOrder(groups, days),
    acts: activities.running,
    eligibility: readEligibility(
      activities.running,
      input.eligibilities,
      groups
    ),
    setTimeLocation: readSetTimeLocations(
      input.fixedActivities,
      input.recurringActivities
    ),
    ...otherPrograms(input.otherPrograms, days)
  };
  const check = checkModel(input, model, null);
  // A group the server didn't send (away this week since the draft was made, G2 §13) keeps its
  // row, but is away in every block: hatched, not counted to fill, nothing goes in.
  const isAway = (groupId, blockId) =>
    !groups.has(groupId) || check.isAway(groupId, blockId);
  const shown = days.map((day) => day.frame);
  return {
    days: shown,
    checked: checkWeek(
      shown,
      { ...check, isAway },
      { t, dayName: (date) => DAY_NAMES[weekdayOf(date)] || "" }
    ),
    isAway,
    // The fewest blocks any activity running this week takes: a gap shorter than this fits
    // nothing (the engine's "No activity fits this gap"); null with none running.
    shortest: activities.running.length
      ? Math.min(...activities.running.map((a) => a.span))
      : null
  };
}

/** Every bend the week's dots name: each rule on each dotted placement. */
function bendCount(checked) {
  let n = 0;
  for (const rules of checked.bends.values()) {
    n += rules.length;
  }
  return n;
}

/** Whether week a is worse than week b: fewer minimums met, or as many with more bends. */
function worse(a, b) {
  const short = (c) => c.stillNeeded.length;
  if (short(a) !== short(b)) {
    return short(a) > short(b);
  }
  return bendCount(a) > bendCount(b);
}

/**
 * The option for "Try another": 1, 2, ... (a whole number, or the same in decimal digits). Left out means the
 * first; 0, a fraction or anything else is refused rather than quietly built as option 1, so a
 * screen bug can't show the wrong week as if it were the one asked for.
 */
// The last option a schedule can store (Schedule__c.EngineOption__c holds four digits).
const LAST_OPTION = 9999;

function optionOf(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  // A whole number from 1 to LAST_OPTION, or those as plain decimal digits: never "1e3",
  // "0x10" or " 2".
  const option =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(option) && option > 0 && option <= LAST_OPTION
    ? option
    : null;
}

/**
 * checkWeek's model from the engine's inputs: the activities that run this week, the places,
 * each group's division, where fixed and recurring activities take place, who each activity
 * isn't set up for (and a group setup no longer has isn't set up for anything), not-at-camp
 * blocks, and the activities it kept (locked, or every filled cell in "fill the open cells").
 */
export function checkModel(input, model, state) {
  const groupsInSetup = model.groups;
  const parts = readPartsOfDay(input.timeBlocks);
  const notFor = new Map(
    model.acts.map((act) => [
      act.id,
      model.groupIds.filter((g) => !model.eligibility.get(act.id).has(g))
    ])
  );
  return {
    activities: new Map(model.acts.map((a) => [a.id, a])),
    locations: readLocationMap(input.locations),
    divisions: new Map(
      [...groupsInSetup.values()].map((g) => [g.id, g.division])
    ),
    setTimeLocations: model.setTimeLocation,
    notFor,
    isAway: (groupId, blockId) =>
      groupsInSetup.has(groupId) &&
      !atCamp(groupsInSetup.get(groupId), parts.get(blockId) || null),
    locked: lockedPlacements(model, state),
    othersAt: (kind, id, d, blockId) =>
      (kind === "place" ? model.otherPlace : model.otherActivity).get(
        `${id}|${d}|${blockId}`
      ) || 0
  };
}

/** The placements (head keys "date|groupId|firstBlockId") of activities the build kept. */
function lockedPlacements(model, state) {
  const keys = new Set();
  if (state) {
    for (const [k, cell] of state.keptCells) {
      if (cell.head && cell.item.kind === "A") {
        const [groupId, d, blockId] = state.splitKey(k);
        keys.add(`${model.days[d].date}|${groupId}|${blockId}`);
      }
    }
  }
  return keys;
}

/** checkWeek's dots, one entry per cell of each dotted placement. */
function flagCells(days, checked) {
  const out = [];
  for (const p of checked.placements) {
    const bends = checked.bends.get(p.key);
    if (!bends) {
      continue;
    }
    const day = days[p.d];
    for (let b = p.first; b < p.first + p.length; b++) {
      out.push({
        date: day.dateValue,
        groupId: p.groupId,
        blockId: day.blocks[b].id,
        activityId: p.id,
        bends: [...bends],
        reason: checked.flags.get(p.key)
      });
    }
  }
  return out;
}

/** Groups in setup order, then any group the grid has that setup doesn't (kept as it is). */
function groupOrder(groups, days) {
  const inGrid = new Set();
  for (const day of days) {
    for (const groupId of day.tokens.keys()) {
      inGrid.add(groupId);
    }
  }
  const known = [...groups.keys()].filter((id) => inGrid.has(id));
  const unknown = [...inGrid].filter((id) => !groups.has(id)).sort(compareText);
  return [...known, ...unknown];
}

/** Other programs' groups per place and per activity, on each of this program's blocks. */
function otherPrograms(entries, days) {
  const otherPlace = new Map();
  const otherActivity = new Map();
  const ordered = [...(entries || [])].sort(
    (a, b) =>
      compareText(a.date, b.date) ||
      compareText(a.startTime, b.startTime) ||
      compareText(a.locationId, b.locationId) ||
      compareText(a.activityId, b.activityId)
  );
  for (const entry of ordered) {
    const start = minutes(entry.startTime);
    const end = minutes(entry.endTime);
    // No count means one group; a count of 0 means none.
    const n = entry.groups == null ? 1 : Number(entry.groups);
    if (!(n > 0) || start == null || end == null || end <= start) {
      continue;
    }
    for (const day of days) {
      if (day.date !== entry.date) {
        continue;
      }
      for (const block of day.blocks) {
        if (block.start == null || !(block.start < end && start < block.end)) {
          continue;
        }
        if (entry.locationId) {
          const k = `${entry.locationId}|${day.index}|${block.id}`;
          otherPlace.set(k, (otherPlace.get(k) || 0) + n);
        }
        if (entry.activityId) {
          const k = `${entry.activityId}|${day.index}|${block.id}`;
          otherActivity.set(k, (otherActivity.get(k) || 0) + n);
        }
      }
    }
  }
  return { otherPlace, otherActivity };
}

function activityItem(act) {
  return { kind: "A", id: act.id, name: act.name, gone: false };
}

/** Each day in Manual Build's shape: items in the order cells first use them, rows rebuilt. */
function writeDays(model, state) {
  return model.days.map((day) => {
    const items = [];
    const numbers = new Map();
    const numberOf = (item) => {
      const id = identity(item);
      if (!numbers.has(id)) {
        items.push(item);
        numbers.set(id, items.length);
      }
      return String(numbers.get(id));
    };
    const rows = (day.frame.groups || []).map((group) =>
      day.blocks
        .map((block) => {
          const k = state.cellKey(group.id, day.index, block.id);
          const kept = state.keptCells.get(k);
          if (kept) {
            // A kept activity shows its name as setup has it now (a rename shows the new name).
            const current =
              kept.item.kind === "A" && state.actById.get(kept.item.id);
            return kept.head
              ? numberOf(current ? activityItem(current) : kept.item)
              : "^";
          }
          const actId = state.assigned.get(k);
          if (!actId) {
            return "";
          }
          if (state.spanTails.has(k)) {
            return "^";
          }
          return numberOf(activityItem(state.actById.get(actId)));
        })
        .join(",")
    );
    return { ...day.frame, items, rows };
  });
}
