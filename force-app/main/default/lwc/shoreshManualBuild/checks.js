/**
 * What Manual Build checks while the director works (ADR 0008 §23), worked out live from the grid:
 * nothing is stored, nothing is blocked, and a mark clears as soon as its cause moves.
 *
 * - Bronze dots on placements, one rule at a time, in the order the Generated Schedule engine's
 *   rules give way, and in its words (c/shoreshEngine): over its weekly limit, twice in a day, not
 *   set up for the group, over its limit of groups at once, sharing a place with another division
 *   (an activity that is for one division at a time), more groups at a place than fit; and a group
 *   busy in two time blocks that overlap. Fixed and recurring activities count toward a place but
 *   never get a dot.
 * - Still needed: each activity and group short of its weekly minimum ("Swim · Bunk 3: 2 still
 *   needed"). Spread across the week: short of its early-week goal ("… still needed by
 *   Wednesday"). Overlapping: each clash once (a place in a time block, an activity in a time
 *   block, a group in two overlapping time blocks). Filled: cells filled, of the cells to fill.
 *
 * A placement counts once, however many time blocks it runs. A day that can't be read is left out.
 */
import { OPEN, slots } from "./slotEdits";

const CARRIES_ON = "^";

/** The rules in the order they give way (c/shoreshEngine), then the time-overlap check. */
const RULE = [
  "weeklyMax",
  "onceADay",
  "eligibility",
  "groupsAtOnce",
  "sameDivision",
  "placeCapacity",
  "busy"
];

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

/** Text compared by character code, never by locale (the engine's order). */
function compareText(a, b) {
  const x = String(a == null ? "" : a);
  const y = String(b == null ? "" : b);
  if (x < y) {
    return -1;
  }
  return x > y ? 1 : 0;
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
        flags.push({ p, rule: "weeklyMax", reason: "Over its weekly limit" })
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
        flags.push({ p, rule: "onceADay", reason: "Twice in a day" })
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
      rule: "eligibility",
      reason: `Not set up for ${p.groupName}`
    }));
  return { flags, clashes: [] };
}

function groupsAtOnce(ctx) {
  const flags = [];
  const clashes = [];
  ctx.occupancy.forEach((here, at) => {
    groupBy(here.filter(isActivity), (p) => p.id).forEach((list, actId) => {
      const act = ctx.activities.get(actId);
      if (!act || act.atOnce === null || list.length <= act.atOnce) {
        return;
      }
      const reason = `Over its limit of ${act.atOnce} ${
        act.atOnce === 1 ? ctx.t.sIn("Group") : ctx.t.pIn("Group")
      } at once`;
      list.forEach((p) => flags.push({ p, rule: "groupsAtOnce", reason }));
      clashes.push(
        ctx.clash("groupsAtOnce", `act:${actId}`, at, act.name, reason)
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
      const reason = `Shares ${place} with another ${ctx.t.sIn("Division")}`;
      const clashing = new Set();
      list.filter(strict).forEach((x) =>
        list
          .filter((y) => y !== x && division(y) !== division(x))
          .forEach((y) => {
            clashing.add(x);
            clashing.add(y);
          })
      );
      if (clashing.size) {
        [...clashing]
          .filter(isActivity)
          .forEach((p) => flags.push({ p, rule: "sameDivision", reason }));
        clashes.push(
          ctx.clash("sameDivision", `loc:${locationId}`, at, place, reason)
        );
      }
    });
    // An activity with no place: its groups at the same time are of one division.
    groupBy(here.filter(isActivity), (p) => {
      return strict(p) && !placeOf(ctx, p) ? p.id : null;
    }).forEach((list, actId) => {
      if (new Set(list.map(division)).size < 2) {
        return;
      }
      const reason = `With another ${ctx.t.sIn("Division")} at the same time`;
      list.forEach((p) => flags.push({ p, rule: "sameDivision", reason }));
      clashes.push(
        ctx.clash(
          "sameDivision",
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
      if (list.length <= place.fit || !movable.length) {
        return;
      }
      const reason = `More ${ctx.t.pIn("Group")} at ${place.name} than fit`;
      movable.forEach((p) => flags.push({ p, rule: "placeCapacity", reason }));
      clashes.push(
        ctx.clash("placeCapacity", `loc:${locationId}`, at, place.name, reason)
      );
    });
  });
  return { flags, clashes };
}

/** A group with something in two time blocks whose times overlap (blocks that touch don't). */
function busy(ctx) {
  const flags = [];
  const clashes = [];
  const reason = "Already busy then";
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
            .forEach((p) => flags.push({ p, rule: "busy", reason }));
          if (isActivity(p1) || isActivity(p2)) {
            // One clash per two placements, however many of their blocks overlap.
            clashes.push({
              ...ctx.clash(
                "busy",
                "",
                `${d}|${b1}`,
                grp.name,
                reason,
                day.blocks[b2].name
              ),
              key: `busy|${p1.key}|${p2.key}`
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
 * isAway(groupId, blockId) }. words: { t (camp terms), dayName(dateValue) }.
 *
 * Returns { flags: placement key "date|groupId|firstBlockId" -> its reasons ("A · B"),
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
    busy
  ].map((rule) => rule(ctx));

  const reasons = new Map();
  marks
    .flatMap((m) => m.flags)
    .sort((a, b) => RULE.indexOf(a.rule) - RULE.indexOf(b.rule))
    .forEach(({ p, reason }) => {
      const list = reasons.get(p.key) || [];
      if (!list.includes(reason)) {
        list.push(reason);
      }
      reasons.set(p.key, list);
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
    overlapping,
    ...stillToPlace(ctx),
    cells: filledCount(ctx)
  };
}
