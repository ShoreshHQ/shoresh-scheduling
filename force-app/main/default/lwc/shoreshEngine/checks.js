/**
 * The one rules module for a finished week (ADR 0010), shared by Manual Build (ADR 0008 §23) and
 * Generated Schedule: worked out from the grid alone, so the same grid always gets the same dots,
 * whatever order it was filled in. Nothing is stored and nothing is blocked. Written for Manual
 * Build part 3 and moved here so both schedules use it.
 *
 * - Bronze dots on placements, one rule at a time, in the order rules give way (week.js
 *   RELAX_ORDER), in reasonFor's words (words.js): over its weekly limit, twice in a day, not set
 *   up for the group, over its limit of groups at once, sharing a place with another division (an
 *   activity that is for one division at a time), more groups at a place than fit, shorter than
 *   set up (only when model.dotShorter: Generated Schedule's last bend; Manual Build shortens by
 *   hand); and a group busy in two time blocks that overlap. A rule broken by several placements
 *   dots all of them (over the limit dots each of that group's placements; twice in a day dots
 *   both). Fixed and recurring activities count toward a place but never get a dot.
 * - Still needed: each activity and group short of its weekly minimum ("Swim · Bunk 3: 2 still
 *   needed"). Spread across the week: short of its early-week goal ("… still needed by
 *   Wednesday"). Overlapping: each clash once (a place in a time block, an activity in a time
 *   block, a group in two overlapping time blocks). Filled: cells filled, of the cells to fill.
 *
 * A placement counts once, however many time blocks it runs. A day that can't be read is left out.
 */
import { CARRIES_ON, OPEN, slots } from "./grid";
import { compareText } from "./setup";
import { BUSY, RELAX_ORDER, RULE as RULES } from "./week";
import { reasonFor } from "./words";

/** The rules in the order they give way, then the time-overlap check. */
const RULE = [...RELAX_ORDER, BUSY];

function minutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 1 for Monday … 7 for Sunday, from "YYYY-MM-DD", the same in every time zone. */
export function weekdayOf(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  if (!match) {
    return null;
  }
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).getUTCDay();
  return day === 0 ? 7 : day;
}

/** An activity's SortOrder; none goes last. */
function sortValue(act) {
  return typeof act.sortOrder === "number" && Number.isFinite(act.sortOrder)
    ? act.sortOrder
    : Number.POSITIVE_INFINITY;
}

const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

/** Every placement in the readable days: where it starts, how long it runs, what it is. */
export function placementsOf(days) {
  const list = [];
  (days || []).forEach((day, d) => {
    if (day.problem) {
      return;
    }
    day.groups.forEach((grp, g) => {
      const row = slots(day, g);
      row.forEach((slot, b) => {
        if (slot === OPEN || slot.startsWith(CARRIES_ON)) {
          return;
        }
        let length = 1;
        while (row[b + length] === CARRIES_ON + slot) {
          length += 1;
        }
        const colon = slot.indexOf(":");
        list.push({
          d,
          groupId: grp.id,
          groupName: grp.name,
          first: b,
          length,
          kind: slot.slice(0, colon),
          id: slot.slice(colon + 1),
          key: `${day.dateValue}|${grp.id}|${day.blocks[b].id}`
        });
      });
    });
  });
  return list;
}

const isActivity = (p) => p.kind === "A";
const isSetTime = (p) => p.kind === "F" || p.kind === "R";

/** Placements by a key, in the order met. */
function groupBy(list, keyOf) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyOf(item);
    if (key === null) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  });
  return map;
}

/** Each placement in each time block it covers: "d|b" -> placements. */
function occupancy(placements) {
  const map = new Map();
  placements.forEach((p) => {
    for (let b = p.first; b < p.first + p.length; b++) {
      const key = `${p.d}|${b}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(p);
    }
  });
  return map;
}

// ---------- the rules: each returns marks { flags: [{ p, rule, reason }], clashes } ----------

function weeklyMax(ctx) {
  const flags = [];
  groupBy(
    ctx.placements.filter(isActivity),
    (p) => `${p.groupId}|${p.id}`
  ).forEach((list) => {
    const act = ctx.activities.get(list[0].id);
    if (act && act.max !== null && list.length > act.max) {
      list.forEach((p) =>
        flags.push({
          p,
          rule: RULES.WEEKLY_MAX,
          reason: reasonFor(RULES.WEEKLY_MAX)
        })
      );
    }
  });
  return { flags, clashes: [] };
}

function onceADay(ctx) {
  const flags = [];
  groupBy(
    ctx.placements.filter(isActivity),
    (p) => `${p.groupId}|${p.d}|${p.id}`
  ).forEach((list) => {
    if (list.length > 1) {
      list.forEach((p) =>
        flags.push({
          p,
          rule: RULES.ONCE_A_DAY,
          reason: reasonFor(RULES.ONCE_A_DAY)
        })
      );
    }
  });
  return { flags, clashes: [] };
}

function eligibility(ctx) {
  const flags = ctx.placements
    .filter((p) => isActivity(p) && ctx.notFor(p.id).has(p.groupId))
    .map((p) => ({
      p,
      rule: RULES.ELIGIBILITY,
      reason: reasonFor(RULES.ELIGIBILITY, { groupName: p.groupName })
    }));
  return { flags, clashes: [] };
}

function groupsAtOnce(ctx) {
  const flags = [];
  const clashes = [];
  ctx.occupancy.forEach((here, at) => {
    groupBy(here.filter(isActivity), (p) => p.id).forEach((list, actId) => {
      const act = ctx.activities.get(actId);
      const others = ctx.others("activity", actId, at);
      if (!act || act.atOnce === null || list.length + others <= act.atOnce) {
        return;
      }
      const reason = reasonFor(RULES.GROUPS_AT_ONCE, {
        groupsAtOnce: act.atOnce,
        terms: ctx.t
      });
      list.forEach((p) =>
        flags.push({ p, rule: RULES.GROUPS_AT_ONCE, reason })
      );
      clashes.push(
        ctx.clash(RULES.GROUPS_AT_ONCE, `act:${actId}`, at, act.name, reason)
      );
    });
  });
  return { flags, clashes };
}

/** Where a placement takes place, if it is a place the camp has set up. */
function placeOf(ctx, p) {
  let locationId = null;
  if (isActivity(p)) {
    const act = ctx.activities.get(p.id);
    locationId = act ? act.locationId : null;
  } else if (isSetTime(p)) {
    locationId = ctx.setTimeLocations.get(p.id) || null;
  }
  return locationId && ctx.locations.has(locationId) ? locationId : null;
}

function sameDivision(ctx) {
  const flags = [];
  const clashes = [];
  const division = (p) => ctx.divisions.get(p.groupId) || null;
  const strict = (p) => {
    const act = isActivity(p) ? ctx.activities.get(p.id) : null;
    return Boolean(act && act.sameDivision);
  };
  ctx.occupancy.forEach((here, at) => {
    // At a place: a group doing a one-division activity shares it with no other division.
    groupBy(here, (p) => placeOf(ctx, p)).forEach((list, locationId) => {
      const place = ctx.locations.get(locationId).name;
      const reason = reasonFor(RULES.SAME_DIVISION, {
        placeName: place,
        terms: ctx.t
      });
      const clashing = new Set();
      // Another program's groups there are another division.
      const others = ctx.others("place", locationId, at);
      list.filter(strict).forEach((x) => {
        if (others > 0) {
          clashing.add(x);
        }
        list
          .filter((y) => y !== x && division(y) !== division(x))
          .forEach((y) => {
            clashing.add(x);
            clashing.add(y);
          });
      });
      if (clashing.size) {
        [...clashing]
          .filter(isActivity)
          .forEach((p) => flags.push({ p, rule: RULES.SAME_DIVISION, reason }));
        clashes.push(
          ctx.clash(RULES.SAME_DIVISION, `loc:${locationId}`, at, place, reason)
        );
      }
    });
    // An activity with no place: its groups at the same time are of one division.
    groupBy(here.filter(isActivity), (p) => {
      return strict(p) && !placeOf(ctx, p) ? p.id : null;
    }).forEach((list, actId) => {
      if (
        new Set(list.map(division)).size < 2 &&
        !ctx.others("activity", actId, at)
      ) {
        return;
      }
      const reason = reasonFor(RULES.SAME_DIVISION, { terms: ctx.t });
      list.forEach((p) => flags.push({ p, rule: RULES.SAME_DIVISION, reason }));
      clashes.push(
        ctx.clash(
          RULES.SAME_DIVISION,
          `act:${actId}`,
          at,
          ctx.activities.get(actId).name,
          reason
        )
      );
    });
  });
  return { flags, clashes };
}

function placeCapacity(ctx) {
  const flags = [];
  const clashes = [];
  ctx.occupancy.forEach((here, at) => {
    groupBy(here, (p) => placeOf(ctx, p)).forEach((list, locationId) => {
      const place = ctx.locations.get(locationId);
      const movable = list.filter(isActivity);
      const others = ctx.others("place", locationId, at);
      if (list.length + others <= place.fit || !movable.length) {
        return;
      }
      const reason = reasonFor(RULES.PLACE_CAPACITY, {
        placeName: place.name,
        terms: ctx.t
      });
      movable.forEach((p) =>
        flags.push({ p, rule: RULES.PLACE_CAPACITY, reason })
      );
      clashes.push(
        ctx.clash(
          RULES.PLACE_CAPACITY,
          `loc:${locationId}`,
          at,
          place.name,
          reason
        )
      );
    });
  });
  return { flags, clashes };
}

/** A multi-block activity placed shorter than set up (Generated Schedule's last bend). */
function shorterThanSetUp(ctx) {
  const flags = [];
  if (ctx.dotShorter) {
    ctx.placements.filter(isActivity).forEach((p) => {
      const act = ctx.activities.get(p.id);
      if (act && act.span && p.length < act.span) {
        flags.push({
          p,
          rule: RULES.SHORTER,
          reason: reasonFor(RULES.SHORTER, { activityName: act.name })
        });
      }
    });
  }
  return { flags, clashes: [] };
}

/** A group with something in two time blocks whose times overlap (blocks that touch don't). */
function busy(ctx) {
  const flags = [];
  const clashes = [];
  const reason = reasonFor(BUSY);
  ctx.days.forEach((day, d) => {
    if (day.problem) {
      return;
    }
    const times = day.blocks.map((block) => [
      minutes(block.startTime),
      minutes(block.endTime)
    ]);
    day.groups.forEach((grp) => {
      const holder = new Map();
      ctx.occupancy.forEach((here, at) => {
        const [dd, b] = at.split("|").map(Number);
        const p = dd === d ? here.find((x) => x.groupId === grp.id) : null;
        if (p) {
          holder.set(b, p);
        }
      });
      for (let b1 = 0; b1 < times.length; b1++) {
        for (let b2 = b1 + 1; b2 < times.length; b2++) {
          const [s1, e1] = times[b1];
          const [s2, e2] = times[b2];
          const p1 = holder.get(b1);
          const p2 = holder.get(b2);
          const overlap =
            s1 !== null &&
            e1 !== null &&
            s2 !== null &&
            e2 !== null &&
            s1 < e2 &&
            s2 < e1;
          if (!overlap || !p1 || !p2 || p1 === p2) {
            continue;
          }
          [p1, p2]
            .filter(isActivity)
            .forEach((p) => flags.push({ p, rule: BUSY, reason }));
          if (isActivity(p1) || isActivity(p2)) {
            // One clash per two placements, however many of their blocks overlap.
            clashes.push({
              ...ctx.clash(
                BUSY,
                "",
                `${d}|${b1}`,
                grp.name,
                reason,
                day.blocks[b2].name
              ),
              key: `${BUSY}|${p1.key}|${p2.key}`
            });
          }
        }
      }
    });
  });
  return { flags, clashes };
}

// ---------- still to place ----------

/** Groups in the week, in the order they first appear. */
function weekGroups(days) {
  const seen = new Map();
  (days || []).forEach((day) =>
    (day.groups || []).forEach((grp) => {
      if (!seen.has(grp.id)) {
        seen.set(grp.id, grp.name);
      }
    })
  );
  return seen;
}

function stillToPlace(ctx) {
  const stillNeeded = [];
  const spread = [];
  const groups = weekGroups(ctx.days);
  const readable = ctx.days.filter((day) => !day.problem);
  const heads = groupBy(
    ctx.placements.filter(isActivity),
    (p) => `${p.groupId}|${p.id}`
  );
  // As the engine lists them: group by group, then activity by SortOrder and Id.
  const activities = [...ctx.activities.values()].sort(
    (a, b) => sortValue(a) - sortValue(b) || compareText(a.id, b.id)
  );
  groups.forEach((groupName, groupId) => {
    activities.forEach((act) => {
      if (ctx.notFor(act.id).has(groupId)) {
        return;
      }
      const mine = heads.get(`${groupId}|${act.id}`) || [];
      if (mine.length < act.min) {
        stillNeeded.push(
          `${act.name} · ${groupName}: ${act.min - mine.length} still needed`
        );
      }
      if (
        act.early &&
        readable.some((day) => weekdayOf(day.dateValue) <= act.early.byDay)
      ) {
        const early = mine.filter(
          (p) => weekdayOf(ctx.days[p.d].dateValue) <= act.early.byDay
        ).length;
        if (early < act.early.count) {
          spread.push(
            `${act.name} · ${groupName}: ${act.early.count - early} still needed by ${
              DAY_NAMES[act.early.byDay]
            }`
          );
        }
      }
    });
  });
  return { stillNeeded, spread };
}

/** Cells filled, of the cells to fill (at camp, and not a fixed or recurring activity). */
function filledCount(ctx) {
  let filled = 0;
  let total = 0;
  ctx.days.forEach((day) => {
    if (day.problem) {
      return;
    }
    day.groups.forEach((grp, g) => {
      slots(day, g).forEach((slot, b) => {
        const item = slot.startsWith(CARRIES_ON) ? slot.slice(1) : slot;
        if (
          ctx.isAway(grp.id, day.blocks[b].id) ||
          item.startsWith("F:") ||
          item.startsWith("R:")
        ) {
          return;
        }
        total += 1;
        filled += item === OPEN ? 0 : 1;
      });
    });
  });
  return { filled, total };
}

/**
 * The week checked. model: { activities (readActivities), locations (readLocations), divisions
 * and setTimeLocations (readProgram), notFor: activity Id -> group Ids it isn't set up for,
 * isAway(groupId, blockId), dotShorter, othersAt(kind, id, dayIndex, blockId) }. words: { t (camp terms), dayName(dateValue) }.
 *
 * Returns { flags: placement key "date|groupId|firstBlockId" -> its reasons ("A · B"), bends:
 * the same key -> its rules (RULE values and BUSY, in give-way order), placements,
 * overlapping, stillNeeded, spread (lines of text), cells: { filled, total } }.
 */
export function checkWeek(days, model, words) {
  const placements = placementsOf(days);
  const notForSets = new Map(
    [...(model.notFor || new Map())].map(([id, list]) => [id, new Set(list)])
  );
  const ctx = {
    days: days || [],
    placements,
    occupancy: occupancy(placements),
    activities: model.activities || new Map(),
    locations: model.locations || new Map(),
    divisions: model.divisions || new Map(),
    setTimeLocations: model.setTimeLocations || new Map(),
    notFor: (id) => notForSets.get(id) || new Set(),
    isAway: model.isAway || (() => false),
    dotShorter: Boolean(model.dotShorter),
    // Other programs' groups (Generated Schedule, G5): kind "place" or "activity", its Id, and
    // "d|b"; Manual Build passes none.
    others: (kind, id, at) => {
      if (!model.othersAt) {
        return 0;
      }
      const [d, b] = at.split("|").map(Number);
      return model.othersAt(kind, id, d, days[d].blocks[b].id) || 0;
    },
    t: words.t,
    clash(rule, what, at, name, reason, alsoBlock) {
      const [d, b] = at.split("|").map(Number);
      const day = days[d];
      const when = [words.dayName(day.dateValue), day.blocks[b].name];
      if (alsoBlock) {
        when.push(alsoBlock);
      }
      return {
        key: `${rule}|${what}|${at}`,
        order: [d, b, RULE.indexOf(rule)],
        text: `${name} · ${when.join(" · ")}: ${reason}`
      };
    }
  };
  const marks = [
    weeklyMax,
    onceADay,
    eligibility,
    groupsAtOnce,
    sameDivision,
    placeCapacity,
    shorterThanSetUp,
    busy
  ].map((rule) => rule(ctx));

  const reasons = new Map();
  const bends = new Map();
  marks
    .flatMap((m) => m.flags)
    .sort((a, b) => RULE.indexOf(a.rule) - RULE.indexOf(b.rule))
    .forEach(({ p, rule, reason }) => {
      const list = reasons.get(p.key) || [];
      if (!list.includes(reason)) {
        list.push(reason);
      }
      reasons.set(p.key, list);
      const rules = bends.get(p.key) || [];
      if (!rules.includes(rule)) {
        rules.push(rule);
      }
      bends.set(p.key, rules);
    });
  const flags = new Map(
    [...reasons].map(([key, list]) => [key, list.join(" · ")])
  );

  const clashes = new Map();
  // The first time a clash is met names it (its earliest blocks).
  marks
    .flatMap((m) => m.clashes)
    .forEach((c) => {
      if (!clashes.has(c.key)) {
        clashes.set(c.key, c);
      }
    });
  const overlapping = [...clashes.values()]
    .sort(
      (a, b) =>
        a.order[0] - b.order[0] ||
        a.order[1] - b.order[1] ||
        a.order[2] - b.order[2] ||
        (a.text < b.text ? -1 : Number(a.text > b.text))
    )
    .map((c) => c.text);

  return {
    flags,
    bends,
    placements,
    overlapping,
    ...stillToPlace(ctx),
    cells: filledCount(ctx)
  };
}
