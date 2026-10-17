import { buildTerms } from "c/shoreshTerms";
import {
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
import { OVERLAP, RELAX_ORDER, RULE, lockKey, scheduleWeek } from "./week";

export { RELAX_ORDER, RULE };

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
 * Returns { ok: true, days, flags, stillToPlace, openCells } or { ok: false, error }:
 *   days: the same DayView shape, with new rows and items
 *   flags: [{ date, groupId, blockId, activityId, bends: [RULE...], reason }] for every cell of
 *     a placement that bends a rule because nothing fitted cleanly
 *   stillToPlace: [{ kind: "weeklyMin" | "earlyWeek", groupId, activityId, placed, wanted,
 *     byDay?, text }]
 *   openCells: [{ date, groupId, blockId, reason }] for an at-camp cell nothing can go in at
 *     all (the group is busy at an overlapping time, or no activity is short enough)
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
        ? `No ${t.pIn("Activity")} run this week.`
        : `No ${t.pIn("Activity")} are set up yet.`
    };
  }
  const groups = readGroups(input.groups);
  const days = readDays(input.days, readPartsOfDay(input.timeBlocks));
  if (!days.length) {
    return { ok: false, error: "This week has no days to build." };
  }
  const { fit, names: locationNames } = readLocations(input.locations);
  const option =
    Number.isInteger(input.option) && input.option > 0 ? input.option : 1;
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
  const words = { t, groups, locationNames, fit };
  return {
    ok: true,
    days: writeDays(model, state),
    flags: flagList(model, state, words),
    stillToPlace: stillToPlace(model, state),
    openCells: state.openCells.map(({ key, why }) => {
      const [groupId, d, blockId] = state.splitKey(key);
      const group = groups.get(groupId);
      return {
        date: days[d].date,
        groupId,
        blockId,
        reason:
          why === OVERLAP
            ? `${group.name} is busy at an overlapping time`
            : `No ${t.sIn("Activity")} is short enough for this gap`
      };
    })
  };
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
    const n =
      Number.isInteger(entry.groups) && entry.groups > 0 ? entry.groups : 1;
    if (start == null || end == null || end <= start) {
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

function identity(item) {
  return `${item.kind}:${item.id || item.name}`;
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
            return kept.head ? numberOf(kept.item) : "^";
          }
          const actId = state.assigned.get(k);
          if (!actId) {
            return "";
          }
          if (state.spanTails.has(k)) {
            return "^";
          }
          const act = state.actById.get(actId);
          return numberOf({
            kind: "A",
            id: act.id,
            name: act.name,
            gone: false
          });
        })
        .join(",")
    );
    return { ...day.frame, items, rows };
  });
}

function reasonFor(rule, act, groupId, words) {
  const { t, groups, locationNames, fit } = words;
  const atPlace = act.locationId && fit.has(act.locationId);
  const place = atPlace ? locationNames.get(act.locationId) : "";
  switch (rule) {
    case RULE.WEEKLY_MAX:
      return "Over its weekly limit";
    case RULE.ONCE_A_DAY:
      return "Twice in a day";
    case RULE.ELIGIBILITY:
      return `Not set up for ${groups.get(groupId).name}`;
    case RULE.GROUPS_AT_ONCE:
      return `Over its limit of ${act.atOnce} ${
        act.atOnce === 1 ? t.sIn("Group") : t.pIn("Group")
      } at once`;
    case RULE.SAME_DIVISION:
      return atPlace
        ? `Shares ${place} with another ${t.sIn("Division")}`
        : `With another ${t.sIn("Division")} at the same time`;
    default:
      return `More ${t.pIn("Group")} at ${place} than fit`;
  }
}

/** A flag on every cell of each placement that bends a rule. */
function flagList(model, state, words) {
  const out = [];
  for (const [head, bends] of state.flags) {
    const [groupId, d, blockId] = state.splitKey(head);
    const act = state.actById.get(state.assigned.get(head));
    const day = model.days[d];
    const reason = bends
      .map((rule) => reasonFor(rule, act, groupId, words))
      .join(" · ");
    const first = day.blockIndex.get(blockId);
    for (let i = 0; i < act.span; i++) {
      const block = day.blocks[first + i];
      const k = block ? state.cellKey(groupId, d, block.id) : null;
      if (
        k &&
        state.assigned.get(k) === act.id &&
        (i === 0 || state.spanTails.has(k))
      ) {
        out.push({
          date: day.date,
          groupId,
          blockId: block.id,
          activityId: act.id,
          bends: [...bends],
          reason
        });
      }
    }
  }
  return out;
}

/** Weekly minimums not met and early-week goals missed, group by group, in setup order. */
function stillToPlace(model, state) {
  const earlyHeads = new Map();
  for (const [k, actId] of state.assigned) {
    if (!state.spanTails.has(k)) {
      const [groupId, d] = state.splitKey(k);
      const key = `${groupId}|${actId}`;
      if (!earlyHeads.has(key)) {
        earlyHeads.set(key, []);
      }
      earlyHeads.get(key).push(d);
    }
  }
  const out = [];
  for (const groupId of model.groupIds) {
    const group = model.groups.get(groupId);
    if (!group) {
      continue;
    }
    for (const act of model.acts) {
      if (!model.eligibility.get(act.id).has(groupId)) {
        continue;
      }
      const placed = state.usageCount.get(`${groupId}|${act.id}`) || 0;
      if (placed < act.min) {
        out.push({
          kind: "weeklyMin",
          groupId,
          activityId: act.id,
          placed,
          wanted: act.min,
          text: `${act.name} · ${group.name}: ${act.min - placed} still needed`
        });
      }
      if (
        act.early &&
        model.days.some((day) => day.weekday <= act.early.byDay)
      ) {
        const early = (earlyHeads.get(`${groupId}|${act.id}`) || []).filter(
          (d) => model.days[d].weekday <= act.early.byDay
        ).length;
        if (early < act.early.count) {
          const byDay = DAY_NAMES[act.early.byDay];
          out.push({
            kind: "earlyWeek",
            groupId,
            activityId: act.id,
            placed: early,
            wanted: act.early.count,
            byDay,
            text: `${act.name} · ${group.name}: ${act.early.count - early} still needed by ${byDay}`
          });
        }
      }
    }
  }
  return out;
}
