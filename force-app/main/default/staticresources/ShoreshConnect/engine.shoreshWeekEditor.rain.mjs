/**
 * Rainy day (repo docs/adr/0019; desktop src/utils/rainyDay.js planRainyDay): one day's outdoor
 * activities switched to their rain plans. Pure: the editor saves the result as one edit.
 *
 * On the day, each activity cell (not a fixed or recurring activity, an event, an elective, or
 * something not set up yet) whose activity is outdoors is one of:
 * - `spans`: it runs longer than one time block, so it is left as it is;
 * - `noPlan`: it has no rain plan, or its rain plan is outdoors too;
 * - `locked`: a cell the director locked (Generated Schedule): a Lock beats a switch, as it beats
 *   a paste (ADR 0008 part 9);
 * - `full`: its rain plan has no room in that block: its groups at once are taken, or its place is
 *   full (counting what stays, what has switched before it, and other programs' groups, as the
 *   checks count them). It keeps its activity and gets the "Rain plan full" mark;
 * - `switches`: it switches to its rain plan.
 * Cells are taken block by block, and in each block group by group, so the same day always
 * switches the same cells. A cell `skip` names (someone else's change since, ADR 0008 §24) or
 * where the group isn't at camp is left out of all of these, and counts as what it holds.
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import {
  otherProgramsAt,
  readActivities,
  readLocations,
  readOtherPrograms,
  readProgram
} from "./engine.shoreshEngine.shoreshEngine.mjs";
import { owner, placementIn, slots } from "./engine.shoreshWeekEditor.slotEdits.mjs";

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
      locationId: read ? read.locationId : null
    });
  });
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
      if (!slot || !slot.startsWith("A:") || skip(g, b) || isAway(g, b)) {
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
      const plan = act.rainPlanId ? model.activities.get(act.rainPlanId) : null;
      if (!plan || plan.outdoor) {
        result.noPlan.push({ g, b });
        return;
      }
      if (isLocked(g, b)) {
        result.locked.push({ g, b });
        return;
      }
      candidates.push({ g, b, activityId, to: act.rainPlanId });
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
    if (identity.startsWith("A:")) {
      add(byActivity, `${b}|${identity.slice(2)}`, g);
    }
    const place = placeOf(identity);
    if (place) {
      add(byPlace, `${b}|${place}`, g);
    }
  };
  rows.forEach((row, g) =>
    row.forEach((slot, b) => {
      if (slot && !leaving.has(`${g}|${b}`)) {
        book(g, b, owner(slot));
      }
    })
  );

  candidates.forEach((c) => {
    const plan = model.activities.get(c.to);
    const blockId = day.blocks[c.b].id;
    const others = (kind, id) =>
      model.othersAt(kind, id, day.dateValue, blockId);
    const doing =
      (byActivity.get(`${c.b}|${c.to}`) || new Set()).size +
      others("activity", c.to);
    const atOnceFull = plan.atOnce !== null && doing >= plan.atOnce;
    const fit = plan.locationId ? model.fit(plan.locationId) : null;
    const there =
      fit === null
        ? 0
        : (byPlace.get(`${c.b}|${plan.locationId}`) || new Set()).size +
          others("place", plan.locationId);
    if (atOnceFull || (fit !== null && there >= fit)) {
      result.full.push({ g: c.g, b: c.b, activityId: c.activityId });
      book(c.g, c.b, `A:${c.activityId}`);
    } else {
      result.switches.push({ g: c.g, b: c.b, from: c.activityId, to: c.to });
      book(c.g, c.b, `A:${c.to}`);
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
