import { buildTerms } from "c/shoreshTerms";
import { reasonFor } from "./words";
import { checkWeek, weekdayOf } from "./checks";
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
import { BUSY, RELAX_ORDER, RULE, lockKey, scheduleWeek } from "./week";

export { BUSY, RELAX_ORDER, RULE, reasonFor, checkWeek };
export { readActivities, readLocations, readProgram } from "./checkInputs";

/** How a week is built: every unlocked cell again, or only the Open ones. */
export const MODE = Object.freeze({ FULL: "full", FILL_OPEN: "fillOpen" });

const DAY_NAMES = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday"
};

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
 * Returns { ok: true, days, flags, stillNeeded, spread, overlapping, cells, openCells } or
 * { ok: false, error }:
 *   days: the same DayView shape, with new rows and items
 *   flags: checkWeek's dots on the finished week, one entry per cell of each dotted placement:
 *     [{ date, groupId, blockId, activityId, bends: [RULE...], reason }]. A cell the engine had to
 *     bend a rule for always has one; so does anything kept that breaks a rule
 *   stillNeeded, spread, overlapping, cells: checkWeek's lines and counts, the same words as
 *     Manual Build ("Swim · Bunk 3: 1 still needed by Wednesday")
 *   openCells: [{ date, groupId, blockId, reason }] for an at-camp cell left Open because the
 *     group is busy at an overlapping time ("Already busy then")
 */
export function generateWeek(input) {
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
  const state = scheduleWeek(model);
  const built = writeDays(model, state);
  const checked = checkWeek(built, checkModel(input, model), {
    t,
    dayName: (date) => DAY_NAMES[weekdayOf(date)] || ""
  });
  return {
    ok: true,
    days: built,
    flags: flagCells(built, checked),
    stillNeeded: checked.stillNeeded,
    spread: checked.spread,
    overlapping: checked.overlapping,
    cells: checked.cells,
    openCells: state.openCells.map(({ key }) => {
      const [groupId, d, blockId] = state.splitKey(key);
      return { date: days[d].date, groupId, blockId, reason: reasonFor(BUSY) };
    })
  };
}

/**
 * The option for "Try another": 1, 2, ... (a number, or the same as text). Left out means the
 * first; 0, a fraction or anything else is refused rather than quietly built as option 1, so a
 * screen bug can't show the wrong week as if it were the one asked for.
 */
function optionOf(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * checkWeek's model from the engine's inputs: the activities that run this week, the places,
 * each group's division, where fixed and recurring activities take place, who each activity
 * isn't set up for (and a group setup no longer has isn't set up for anything), not-at-camp
 * blocks, and shorter-than-set-up dotted (the engine's last bend).
 */
export function checkModel(input, model) {
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
    dotShorter: true,
    othersAt: (kind, id, d, blockId) =>
      (kind === "place" ? model.otherPlace : model.otherActivity).get(
        `${id}|${d}|${blockId}`
      ) || 0
  };
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
