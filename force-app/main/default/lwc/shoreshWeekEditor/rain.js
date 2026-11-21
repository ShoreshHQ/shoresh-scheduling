/**
 * Rainy day (repo docs/adr/0019; desktop src/utils/rainyDay.js planRainyDay): one day's outdoor
 * activities switched to their rain plans. Pure: the editor saves the result as one edit.
 *
 * On the day, each activity cell (not a fixed or recurring activity, an event, an elective, or
 * something not set up yet) whose activity is outdoors is one of:
 * - `spans`: it runs longer than one time block, so it is left as it is;
 * - `locked`: a cell the director locked (Generated Schedule): a Lock beats a switch, as it beats
 *   a paste (ADR 0008 part 9);
 * - `switches`: it switches indoors: to its rain plan when that fits, or else to the first indoor
 *   activity in the Activities screen's order that fits (CLOSE-4.9);
 * - `full`: it has an indoor rain plan but nothing indoors fits. It keeps its activity and gets
 *   the "Rain plan full" mark;
 * - `noPlan`: it has no rain plan, or its rain plan is outdoors too, and nothing indoors fits.
 * An indoor activity fits a cell when it is one block long, set up for the group, not already the
 * group's that day, and has room in that block: its groups at once aren't taken and its place
 * isn't full (counting what stays, what has switched before it, a fixed or recurring activity at
 * the place, and other programs' groups, as the checks count them).
 * Cells are taken block by block, and in each block group by group, so the same day always
 * switches the same cells. A cell `skip` names (someone else's change since, ADR 0008 §24) or
 * where the group isn't at camp is left out of all of these, and counts as what it holds.
 */
import { FIELD } from "c/shoreshSchema";
import {
  otherProgramsAt,
  readActivities,
  readLocations,
  readOtherPrograms,
  readProgram,
  startsActivity
} from "c/shoreshEngine";
import { owner, placementIn, slots } from "./slotEdits";

export const RAIN_PLAN_FULL = "Rain plan full: choose another";

const never = () => false;

/** An Id as the first 15 characters, so a mark matches whichever length a day wrote it in. */
const short = (id) => String(id || "").slice(0, 15);

/** A "Rain plan full" mark: "group Id|time block Id|activity Id" (RainMarks on the server). */
export function markOf(groupId, blockId, activityId) {
  return `${groupId}|${blockId}|${activityId}`;
}

// The last part of a switched cell's mark (RainMarks.SWITCHED).
const SWITCHED = "switched";

/**
 * A switched cell's mark: "group Id|time block Id|rain plan Id|switched" (repo docs/adr/0019
 * choice 9). The Schedules page draws its raindrop from it (issue #129).
 */
export function switchedOf(groupId, blockId, activityId) {
  return `${markOf(groupId, blockId, activityId)}|${SWITCHED}`;
}

function hasMark(day, parts) {
  const wanted = parts.map((part, i) => (i < 3 ? short(part) : part)).join("|");
  return ((day && day.rain) || []).some(
    (mark) =>
      mark
        .split("|")
        .map((part, i) => (i < 3 ? short(part) : part))
        .join("|") === wanted
  );
}

/** Whether a day's "Rain plan full" marks name this cell holding this activity. */
export function isMarked(day, groupId, blockId, activityId) {
  return hasMark(day, [groupId, blockId, activityId]);
}

/** Whether a rainy day switched this cell to this activity, its rain plan. */
export function isSwitched(day, groupId, blockId, activityId) {
  return hasMark(day, [groupId, blockId, activityId, SWITCHED]);
}

/**
 * The marks a rainy day leaves on its day: the ones it had (a mark whose cell changes is dropped
 * when the day is saved, RainMarks.keptOn) and this switch's own, once each.
 */
export function marksAfter(before, made) {
  return [...new Set([...(before || []), ...(made || [])])];
}

/**
 * What a rainy day needs from the season's setup (the records the editor's draft carries):
 * activities ({ outdoor, rainPlanId, atOnce, locationId }), how many groups fit each place, where
 * fixed and recurring activities are, and other programs' groups by day and time block.
 */
export function rainModel(draft, weekDays) {
  const records = (draft && draft.activityRecords) || [];
  const catalog = readActivities(records);
  const activities = new Map();
  records.forEach((r) => {
    const read = catalog.get(r.Id);
    activities.set(r.Id, {
      outdoor: Boolean(r[FIELD.Activity.Outdoor]),
      rainPlanId: r[FIELD.Activity.RainPlan] || null,
      atOnce: read ? read.atOnce : 1,
      locationId: read ? read.locationId : null,
      span: read ? read.span : 1
    });
  });
  // The indoor activities a cell can switch to, in the Activities screen's order (the order
  // both screens list draft.activities in): none closed this week, nor at a place closed this
  // week (CLOSE-4.2).
  const closed = new Set((draft && draft.closed) || []);
  const listed = ((draft && draft.activities) || []).map((a) => a.id);
  const order = [...new Set([...listed, ...catalog.keys()])];
  const indoor = order.filter((id) => {
    const act = activities.get(id);
    return (
      act &&
      catalog.has(id) &&
      !act.outdoor &&
      !closed.has(id) &&
      !(act.locationId && closed.has(act.locationId))
    );
  });
  const notFor = new Map(
    ((draft && draft.activities) || []).map((a) => [
      a.id,
      new Set(a.notFor || [])
    ])
  );
  const places = readLocations((draft && draft.locationRecords) || []);
  const { setTimeLocations } = readProgram({
    fixedActivities: (draft && draft.fixedActivityRecords) || [],
    recurringActivities: (draft && draft.recurringActivityRecords) || []
  });
  const days = weekDays || [];
  const { othersAt } = otherProgramsAt(
    readOtherPrograms((draft && draft.otherPrograms) || []),
    days
  );
  const indexOf = new Map(days.map((d, i) => [d.dateValue, i]));
  return {
    activities,
    indoor,
    isFor: (activityId, groupId) =>
      !(notFor.get(activityId) || new Set()).has(groupId),
    fit: (locationId) => {
      const place = places.get(locationId);
      return place ? place.fit : null;
    },
    setTimeLocations,
    othersAt: (kind, id, dateValue, blockId) => {
      const d = indexOf.get(dateValue);
      return d === undefined ? 0 : othersAt(kind, id, d, blockId) || 0;
    }
  };
}

/**
 * The rainy day for one day (the editor's day shape). options: skip(g, b), isAway(g, b),
 * isLocked(g, b), by the day's own indexes. Returns { switches: [{ g, b, from, to }], full: [{ g,
 * b, activityId }], noPlan, spans, locked: [{ g, b }] }.
 */
export function planRain(day, model, options = {}) {
  const { skip = never, isAway = never, isLocked = never } = options;
  const result = { switches: [], full: [], noPlan: [], spans: [], locked: [] };
  if (!day || day.problem || !day.rows) {
    return result;
  }
  const rows = day.groups.map((grp, g) => slots(day, g));
  const candidates = [];
  day.blocks.forEach((block, b) => {
    day.groups.forEach((grp, g) => {
      const slot = rows[g][b];
      if (!slot || !startsActivity(slot) || skip(g, b) || isAway(g, b)) {
        return;
      }
      const activityId = slot.slice(2);
      const act = model.activities.get(activityId);
      if (!act || !act.outdoor) {
        return;
      }
      if (placementIn(rows[g], b).length > 1) {
        result.spans.push({ g, b });
        return;
      }
      if (isLocked(g, b)) {
        result.locked.push({ g, b });
        return;
      }
      const plan = act.rainPlanId ? model.activities.get(act.rainPlanId) : null;
      const named = plan && !plan.outdoor ? act.rainPlanId : null;
      candidates.push({ g, b, activityId, named });
    });
  });
  const leaving = new Set(candidates.map((c) => `${c.g}|${c.b}`));

  // Groups doing each activity, and at each place, in each block: "b|id" -> groups.
  const byActivity = new Map();
  const byPlace = new Map();
  const add = (map, key, g) => {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key).add(g);
  };
  const placeOf = (identity) => {
    const kind = identity.slice(0, 1);
    const id = identity.slice(2);
    if (kind === "A") {
      const act = model.activities.get(id);
      return act ? act.locationId : null;
    }
    return kind === "F" || kind === "R"
      ? model.setTimeLocations.get(id) || null
      : null;
  };
  const book = (g, b, identity) => {
    if (startsActivity(identity)) {
      add(byActivity, `${b}|${identity.slice(2)}`, g);
    }
    const place = placeOf(identity);
    if (place) {
      add(byPlace, `${b}|${place}`, g);
    }
  };
  // The activities each group has that day: "g|id" (CLOSE-4.9: no repeat in a day).
  const held = new Set();
  const hold = (g, identity) => {
    if (startsActivity(identity)) {
      held.add(`${g}|${identity.slice(2)}`);
    }
  };
  rows.forEach((row, g) =>
    row.forEach((slot, b) => {
      if (slot && !leaving.has(`${g}|${b}`)) {
        book(g, b, owner(slot));
        hold(g, slot);
      }
    })
  );

  candidates.forEach((c) => {
    const blockId = day.blocks[c.b].id;
    const groupId = day.groups[c.g].id;
    const others = (kind, id) =>
      model.othersAt(kind, id, day.dateValue, blockId);
    const fits = (id) => {
      const act = model.activities.get(id);
      if (
        act.span > 1 ||
        !model.isFor(id, groupId) ||
        held.has(`${c.g}|${id}`)
      ) {
        return false;
      }
      const doing =
        (byActivity.get(`${c.b}|${id}`) || new Set()).size +
        others("activity", id);
      const fit = act.locationId ? model.fit(act.locationId) : null;
      const there =
        fit === null
          ? 0
          : (byPlace.get(`${c.b}|${act.locationId}`) || new Set()).size +
            others("place", act.locationId);
      return (
        (act.atOnce === null || doing < act.atOnce) &&
        (fit === null || there < fit)
      );
    };
    const to = [c.named, ...model.indoor].find(
      (id) => id && model.indoor.includes(id) && fits(id)
    );
    if (to) {
      result.switches.push({ g: c.g, b: c.b, from: c.activityId, to });
      book(c.g, c.b, `A:${to}`);
      hold(c.g, `A:${to}`);
    } else {
      if (c.named) {
        result.full.push({ g: c.g, b: c.b, activityId: c.activityId });
      } else {
        result.noPlan.push({ g: c.g, b: c.b });
      }
      book(c.g, c.b, `A:${c.activityId}`);
    }
  });
  return result;
}

/**
 * The receipt (desktop rainyReceiptText): "Rainy Monday: 3 switched to rain plans, 1 full, 2
 * without a rain plan, 1 longer than one block, left as is", or "… nothing outdoors to switch".
 * A locked cell (Generated) is said the same way: "1 locked, left as is".
 */
export function rainReceipt(label, plan) {
  return `${label}: ${rainCounts(plan)}`;
}

/** The receipt's counts alone ("3 switched to rain plans, 1 full"). */
export function rainCounts(plan) {
  const parts = [];
  if (plan.switches.length) {
    parts.push(`${plan.switches.length} switched to rain plans`);
  }
  if (plan.full.length) {
    parts.push(`${plan.full.length} full`);
  }
  if (plan.noPlan.length) {
    parts.push(`${plan.noPlan.length} without a rain plan`);
  }
  if (plan.spans.length) {
    parts.push(`${plan.spans.length} longer than one block, left as is`);
  }
  if (plan.locked.length) {
    parts.push(`${plan.locked.length} locked, left as is`);
  }
  return parts.length ? parts.join(", ") : "nothing outdoors to switch";
}
