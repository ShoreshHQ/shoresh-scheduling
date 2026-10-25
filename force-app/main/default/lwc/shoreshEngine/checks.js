/**
 * The one rules module for a finished week (ADR 0010), shared by Manual Build (ADR 0008 §23) and
 * Generated Schedule: worked out from the grid alone, so the same grid always gets the same dots,
 * whatever order it was filled in. Nothing is stored and nothing is blocked. Written for Manual
 * Build part 3 and moved here so both schedules use it.
 *
 * - Bronze dots on placements, one rule at a time, in the order rules give way (week.js
 *   RELAX_ORDER), in reasonFor's words (words.js): over its weekly limit, twice in a day, not set
 *   up for the group, over its limit of groups at once, sharing a place with another division (an
 *   activity that is for one division at a time), more groups at a place than fit; and a group
 *   busy in two time blocks that overlap. Over its weekly limit dots only the sessions past the
 *   limit, the latest in the week (Greg, 2026-10-17); any other rule broken by several placements
 *   dots all of them (twice in a day dots both). Fixed and recurring activities count toward a
 *   place but never get a dot; so does an elective set, at each place of its offerings.
 * - Still needed: each activity and group short of its weekly minimum ("Swim · Bunk 3: 2 still
 *   needed"). Spread across the week: short of its early-week goal ("… still needed by
 *   Wednesday"). Overlapping: each group's cell (day, time block) where one of its placements
 *   breaks a rule that time block shares with other cells (groups at once, same division, place
 *   capacity, busy at an overlapping time), like the desktop's computeOverlaps; a placement
 *   running two time blocks that clashes in one is one cell. Filled: cells filled, of the cells to
 *   fill.
 *
 * A placement counts once, however many time blocks it runs. A day that can't be read is left out.
 */
import { CARRIES_ON, OPEN, slots } from "./grid";
import { compareText, earlyDates } from "./setup";
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

/** Day names by weekday (1 Monday ... 7 Sunday), for the lines that name a day. */
export const DAY_NAMES = [
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
// An elective set placed on the grid (its record's Id), not one noted from a file by name.
const PLACED_ELECTIVE = /^E:[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const isElective = (p) => PLACED_ELECTIVE.test(`${p.kind}:${p.id}`);

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

/** The time block index of an occupancy key "d|b". */
const blockOf = (at) => Number(at.split("|")[1]);

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

// ---------- the rules: each returns flags [{ p, rule, reason, b }] ----------
// b: the time block the rule is broken in, for the rules a time block shares with other cells.

/**
 * Placements in the order they happen: by day, then their first block's start time, then its
 * place in the day's blocks, then its Id.
 */
function inWeekOrder(ctx, list) {
  const start = (p) => {
    const t = minutes(ctx.days[p.d].blocks[p.first].startTime);
    return t === null ? Number.POSITIVE_INFINITY : t;
  };
  return [...list].sort(
    (a, b) =>
      compareText(ctx.days[a.d].dateValue, ctx.days[b.d].dateValue) ||
      start(a) - start(b) ||
      a.first - b.first ||
      compareText(
        ctx.days[a.d].blocks[a.first].id,
        ctx.days[b.d].blocks[b.first].id
      )
  );
}

function weeklyMax(ctx) {
  const flags = [];
  groupBy(
    ctx.placements.filter(isActivity),
    (p) => `${p.groupId}|${p.id}`
  ).forEach((list) => {
    const act = ctx.activities.get(list[0].id);
    if (act && act.max !== null && list.length > act.max) {
      // Only the sessions past the limit, the latest in the week (Greg, 2026-10-17), and of
      // those not a locked one while an unlocked one can carry the dot instead: the director's
      // choices win (coordinator, 2026-10-17).
      const ordered = inWeekOrder(ctx, list);
      const extra = list.length - act.max;
      const unlocked = ordered.filter((p) => !ctx.locked.has(p.key));
      const locked = ordered.filter((p) => ctx.locked.has(p.key));
      const fromLocked = Math.max(0, extra - unlocked.length);
      [
        ...unlocked.slice(unlocked.length - Math.min(extra, unlocked.length)),
        ...locked.slice(locked.length - fromLocked)
      ].forEach((p) =>
        flags.push({
          p,
          rule: RULES.WEEKLY_MAX,
          reason: reasonFor(RULES.WEEKLY_MAX)
        })
      );
    }
  });
  return flags;
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
  return flags;
}

function eligibility(ctx) {
  const flags = ctx.placements
    .filter((p) => isActivity(p) && ctx.notFor(p.id).has(p.groupId))
    .map((p) => ({
      p,
      rule: RULES.ELIGIBILITY,
      reason: reasonFor(RULES.ELIGIBILITY, { groupName: p.groupName })
    }));
  return flags;
}

function groupsAtOnce(ctx) {
  const flags = [];
  ctx.occupancy.forEach((here, at) => {
    groupBy(here.filter(isActivity), (p) => p.id).forEach((list, actId) => {
      const act = ctx.activities.get(actId);
      const others = ctx.others("activity", actId, at);
      if (!act || act.atOnce === null || list.length + others <= act.atOnce) {
        return;
      }
      const words = { groupsAtOnce: act.atOnce, terms: ctx.t };
      const reason = reasonFor(RULES.GROUPS_AT_ONCE, {
        ...words,
        otherProgram: others > 0
      });
      list.forEach((p) =>
        flags.push({
          p,
          rule: RULES.GROUPS_AT_ONCE,
          reason,
          b: blockOf(at),
          words,
          otherProgram: others > 0
        })
      );
    });
  });
  // A placement over several blocks says it once: "with another program" if any block has them.
  const withOthers = new Set(
    flags.filter((f) => f.otherProgram).map((f) => f.p.key)
  );
  return flags.map((f) => ({
    ...f,
    whole: reasonFor(RULES.GROUPS_AT_ONCE, {
      ...f.words,
      otherProgram: withOthers.has(f.p.key)
    })
  }));
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
  const division = (p) => ctx.divisions.get(p.groupId) || null;
  const strict = (p) => {
    const act = isActivity(p) ? ctx.activities.get(p.id) : null;
    return Boolean(act && act.sameDivision);
  };
  ctx.occupancy.forEach((here, at) => {
    const b = blockOf(at);
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
      [...clashing]
        .filter(isActivity)
        .forEach((p) =>
          flags.push({ p, rule: RULES.SAME_DIVISION, reason, b })
        );
    });
    // The activity itself: its groups at the same time are of one division (with a place, the
    // place above already compares them), and another program's groups doing it are another.
    groupBy(here.filter(isActivity), (p) => (strict(p) ? p.id : null)).forEach(
      (list, actId) => {
        const locationId = placeOf(ctx, list[0]);
        const mixed = !locationId && new Set(list.map(division)).size > 1;
        if (!mixed && !ctx.others("activity", actId, at)) {
          return;
        }
        const reason = reasonFor(RULES.SAME_DIVISION, {
          placeName: locationId ? ctx.locations.get(locationId).name : null,
          terms: ctx.t
        });
        list.forEach((p) =>
          flags.push({ p, rule: RULES.SAME_DIVISION, reason, b })
        );
      }
    );
  });
  return flags;
}

/**
 * The placements at each place in one time block: each at its own place, and an elective set at
 * every place its offerings use (ADR 0018 slice E5; desktop computeOverlaps.js), once per group.
 */
function byPlace(ctx, here) {
  const places = groupBy(here, (p) => placeOf(ctx, p));
  here.filter(isElective).forEach((p) =>
    (ctx.electivePlaces.get(p.id) || [])
      .filter((locationId) => ctx.locations.has(locationId))
      .forEach((locationId) => {
        if (!places.has(locationId)) {
          places.set(locationId, []);
        }
        places.get(locationId).push(p);
      })
  );
  return places;
}

function placeCapacity(ctx) {
  const flags = [];
  ctx.occupancy.forEach((here, at) => {
    byPlace(ctx, here).forEach((list, locationId) => {
      const place = ctx.locations.get(locationId);
      const movable = list.filter(isActivity);
      const others = ctx.others("place", locationId, at);
      if (list.length + others <= place.fit || !movable.length) {
        return;
      }
      const words = { placeName: place.name, terms: ctx.t };
      const inUseBy = others > 0 ? ctx.otherNames(locationId, at) : [];
      const reason = reasonFor(RULES.PLACE_CAPACITY, { ...words, inUseBy });
      movable.forEach((p) =>
        flags.push({
          p,
          rule: RULES.PLACE_CAPACITY,
          reason,
          b: blockOf(at),
          words,
          inUseBy
        })
      );
    });
  });
  // A placement over several blocks says it once, naming what is there in any of them.
  const names = new Map();
  flags.forEach((f) => {
    const set = names.get(f.p.key) || new Set();
    f.inUseBy.forEach((name) => set.add(name));
    names.set(f.p.key, set);
  });
  return flags.map((f) => ({
    ...f,
    whole: reasonFor(RULES.PLACE_CAPACITY, {
      ...f.words,
      inUseBy: [...names.get(f.p.key)].sort(compareText)
    })
  }));
}

/** A group with something in two time blocks whose times overlap (blocks that touch don't). */
function busy(ctx) {
  const flags = [];
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
          // Each in the time block it holds: both cells are the group busy twice.
          [
            [p1, b1],
            [p2, b2]
          ]
            .filter(([p]) => isActivity(p))
            .forEach(([p, b]) => flags.push({ p, rule: BUSY, reason, b }));
        }
      }
    });
  });
  return flags;
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
  // The same, as data: entry i is line i's activity, group and how many are missing.
  const stillNeededBy = [];
  const spreadBy = [];
  // An early-week goal the week has no day for: said once per activity, not per group.
  const noEarlyDay = [];
  const noEarlyDayBy = [];
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
  const early = new Map(
    activities
      .filter((act) => act.early)
      .map((act) => [
        act.id,
        earlyDates(
          readable.map((day) => day.dateValue),
          act.early.byDay
        )
      ])
  );
  for (const act of activities) {
    if (act.early && readable.length && !early.get(act.id).size) {
      const byDay = DAY_NAMES[act.early.byDay];
      noEarlyDay.push(
        `${act.name}: this ${ctx.t ? ctx.t.sIn("Week") : "week"} has no day by ${byDay}`
      );
      noEarlyDayBy.push({ activityId: act.id, byDay });
    }
  }
  groups.forEach((groupName, groupId) => {
    activities.forEach((act) => {
      if (ctx.notFor(act.id).has(groupId)) {
        return;
      }
      const mine = heads.get(`${groupId}|${act.id}`) || [];
      if (mine.length < act.min) {
        const missing = act.min - mine.length;
        stillNeeded.push(`${act.name} · ${groupName}: ${missing} still needed`);
        stillNeededBy.push({ activityId: act.id, groupId, missing });
      }
      if (act.early && early.get(act.id).size) {
        const done = mine.filter((p) =>
          early.get(act.id).has(ctx.days[p.d].dateValue)
        ).length;
        if (done < act.early.count) {
          const missing = act.early.count - done;
          const byDay = DAY_NAMES[act.early.byDay];
          spread.push(
            `${act.name} · ${groupName}: ${missing} still needed by ${byDay}`
          );
          spreadBy.push({ activityId: act.id, groupId, missing, byDay });
        }
      }
    });
  });
  return {
    stillNeeded,
    spread,
    stillNeededBy,
    spreadBy,
    noEarlyDay,
    noEarlyDayBy
  };
}

/**
 * Cells filled, of the cells to fill: at camp, not a fixed or recurring activity, not a special
 * event or day (counters and Still to place leave them out, ADR 0014 slice 4), not an elective
 * set placed on the grid (ADR 0018 slice E5; desktop: elective cells don't count toward placed;
 * one noted from a file by name counts as before), and not a cell
 * the director locked empty (Generated Schedule: a Lock on an Open cell keeps it empty).
 */
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
          item.startsWith("R:") ||
          item.startsWith("S:") ||
          item.startsWith("D:") ||
          PLACED_ELECTIVE.test(item) ||
          (item === OPEN &&
            ctx.isLockedOpen(grp.id, day.dateValue, day.blocks[b].id))
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
 * and setTimeLocations (readProgram), electivePlaces (readElectivePlaces), notFor: activity Id -> group Ids it isn't set up for,
 * isAway(groupId, blockId), locked (placement keys the director locked), isLockedOpen(groupId,
 * dateValue, blockId) (a cell locked empty, not counted as to fill), othersAt(kind, id, dayIndex,
 * blockId), otherNamesAt(locationId, dayIndex, blockId) }. words: { t (camp terms),
 * dayName(dateValue) }.
 *
 * Returns { flags: placement key "date|groupId|firstBlockId" -> its reasons ("A · B"), bends:
 * the same key -> its rules (RULE values and BUSY, in give-way order), placements,
 * overlapping ([{ dateValue, groupId, blockId, rules, text }]: one per group's cell where a
 * placement breaks a rule shared with other cells there, by day, then time block, then the
 * day's group order; rules in give-way order; text "Bunk 3 · Monday · Period 2: reason · reason"),
 * stillNeeded, spread (lines of text), stillNeededBy ([{ activityId, groupId,
 * missing }], entry i for line i), spreadBy ([{ activityId, groupId, missing, byDay }], byDay the
 * day's name as the line says it), noEarlyDay (lines: an early-week goal whose day the week
 * doesn't reach, once per activity, "Climbing: this week has no day by Tuesday"), noEarlyDayBy
 * ([{ activityId, byDay }], entry i for line i), cells: { filled, total }, hasCoverageTargets and
 * hasSpreadTargets (some activity has a weekly minimum / an early-week goal: without one, the
 * screens don't show that counter, desktop ScheduleScreen), activityIds (the activities checked:
 * on Generated, those running this week) }.
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
    electivePlaces: model.electivePlaces || new Map(),
    notFor: (id) => notForSets.get(id) || new Set(),
    isAway: model.isAway || (() => false),
    isLockedOpen: model.isLockedOpen || (() => false),
    locked: model.locked || new Set(),
    // Other programs' groups (G5): kind "place" or "activity", its Id, and "d|b". Both schedules
    // pass them (the engine's checkModel, Manual Build through otherProgramsAt).
    others: (kind, id, at) => {
      if (!model.othersAt) {
        return 0;
      }
      const [d, b] = at.split("|").map(Number);
      return model.othersAt(kind, id, d, days[d].blocks[b].id) || 0;
    },
    // What other programs are doing at a place in "d|b", by name (none for what the user
    // can't read).
    otherNames: (locationId, at) => {
      if (!model.otherNamesAt) {
        return [];
      }
      const [d, b] = at.split("|").map(Number);
      return model.otherNamesAt(locationId, d, days[d].blocks[b].id) || [];
    },
    t: words.t
  };
  const marks = [
    weeklyMax,
    onceADay,
    eligibility,
    groupsAtOnce,
    sameDivision,
    placeCapacity,
    busy
  ].map((rule) => rule(ctx));

  const reasons = new Map();
  const bends = new Map();
  const cellMarks = new Map();
  marks
    .flat()
    .sort((a, b) => RULE.indexOf(a.rule) - RULE.indexOf(b.rule))
    // whole: the placement's one sentence for a rule broken in several of its blocks; reason:
    // this block's own (the Overlapping line for that cell).
    .forEach(({ p, rule, reason, b, whole }) => {
      if (b !== undefined) {
        const key = `${p.d}|${b}|${p.groupId}`;
        const cell = cellMarks.get(key) || { p, b, rules: [], reasons: [] };
        if (!cell.rules.includes(rule)) {
          cell.rules.push(rule);
        }
        if (!cell.reasons.includes(reason)) {
          cell.reasons.push(reason);
        }
        cellMarks.set(key, cell);
      }
      const list = reasons.get(p.key) || [];
      const said = whole || reason;
      if (!list.includes(said)) {
        list.push(said);
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

  const row = (c) =>
    ctx.days[c.p.d].groups.findIndex((grp) => grp.id === c.p.groupId);
  const overlapping = [...cellMarks.values()]
    .sort((a, b) => a.p.d - b.p.d || a.b - b.b || row(a) - row(b))
    .map((c) => {
      const day = ctx.days[c.p.d];
      const blockName = day.blocks[c.b].name;
      return {
        dateValue: day.dateValue,
        groupId: c.p.groupId,
        blockId: day.blocks[c.b].id,
        rules: c.rules,
        text: `${c.p.groupName} · ${words.dayName(day.dateValue)} · ${blockName}: ${c.reasons.join(" · ")}`
      };
    });

  // Which targets the camp has set (desktop hasCoverageTargets / hasSpreadTargets): with none, a
  // count of zero means nothing was checked, so the screens don't show that counter.
  const activities = [...ctx.activities.values()];
  return {
    flags,
    bends,
    placements,
    overlapping,
    ...stillToPlace(ctx),
    cells: filledCount(ctx),
    hasCoverageTargets: activities.some((a) => a.min > 0),
    hasSpreadTargets: activities.some((a) => !!a.early),
    activityIds: [...ctx.activities.keys()]
  };
}
