/**
 * The settled rules (wiki projects/shoresh-sf-engine-care-plan.md), checked on a built week from
 * the camp spec it came from, without the engine's code:
 *   hardLimits     the engine never breaks who an activity is for, groups at once, groups that
 *                  fit, or same division only (only a person's hand edit can);
 *   visible        every problem shows in the output: every broken rule flagged, every
 *                  shortfall listed (data/check.js, plus minimums, early-week goals and blank
 *                  setup fields counted here);
 *   gapIsABug      every Open cell is proven unfillable: nothing allowed is physically free there,
 *                  and (small camps) no week fills more cells within the hard limits.
 * Weekly maximums and once a day are preferences (step 7), so they never make a cell unfillable.
 */
import { cellsOf } from "./camp";
import { busiestOther, problems } from "./check";

export const HARD = [
  "eligibility",
  "groupsAtOnce",
  "placeCapacity",
  "sameDivision"
];
const NODE_BUDGET = 200000;
const WEEKDAY = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};

const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
function atCamp(group, partOfDay) {
  if (group.availability === "MorningOnly") {
    return partOfDay === "Morning";
  }
  return group.availability !== "AfternoonOnly" || partOfDay === "Afternoon";
}
const eligible = (act, group) =>
  !act.eligible.length ||
  act.eligible.includes(group.id) ||
  act.eligible.includes(group.division);

/** The camp as the checks see it: days built, who is where, what was kept. */
function model(spec, input, result) {
  const blocks = spec.blocks;
  const groups = new Map(spec.groups.map((g) => [g.id, g]));
  const closedPlaces = new Set(
    (spec.weekExceptions || []).map((w) => w.Location__c).filter(Boolean)
  );
  const closedActs = new Set(
    (spec.weekExceptions || []).map((w) => w.Activity__c).filter(Boolean)
  );
  const acts = spec.activities.filter(
    (a) =>
      !closedActs.has(a.id) && !(a.location && closedPlaces.has(a.location))
  );
  const fit = new Map((spec.locations || []).map((l) => [l.id, l.fit]));
  const replaced = new Set(input.replacedDates || []);
  const before = cellsOf(input.days);
  const after = cellsOf(result.days);
  const lock = new Set(
    (input.locks || []).map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
  );
  const peers = blocks.map((x, i) =>
    blocks
      .map((y, j) => j)
      .filter(
        (j) =>
          j !== i &&
          minutes(x.startTime) < minutes(blocks[j].endTime) &&
          minutes(blocks[j].startTime) < minutes(x.endTime)
      )
  );
  const days = input.days
    .map((day, d) => ({ d, date: day.dateValue, groups: day.groups }))
    .filter((day) => !replaced.has(day.date));
  // A cell is the engine's to fill: at camp, not locked, and empty or (full build) a generated
  // activity no lock holds.
  const free = (d, g, b) => {
    const k = `${input.days[d].dateValue}|${g}|${blocks[b].id}`;
    const was = before[d][g][b];
    if (lock.has(k) || !atCamp(groups.get(g), blocks[b].partOfDay)) {
      return false;
    }
    if (!was) {
      return true;
    }
    if (was.kind !== "A" || input.mode === "fillOpen") {
      return false;
    }
    // A generated activity is cleared unless a lock holds any of its cells.
    let s = b;
    while (s > 0 && !before[d][g][s].head) {
      s--;
    }
    for (let i = s; i < blocks.length && before[d][g][i]; i++) {
      if (i > s && before[d][g][i].head) {
        break;
      }
      if (lock.has(`${input.days[d].dateValue}|${g}|${blocks[i].id}`)) {
        return false;
      }
    }
    return true;
  };
  return {
    blocks,
    groups,
    acts,
    fit,
    days,
    before,
    after,
    lock,
    peers,
    free,
    replaced
  };
}

/**
 * Who holds each activity and each place in a grid (cells[d][g][b]), and the room left:
 * room(act, d, b, group) says whether one more group could do act there within the hard limits.
 */
function ledger(spec, m, cells) {
  const actsById = new Map(spec.activities.map((a) => [a.id, a]));
  const setTimePlace = new Map(
    [...(spec.fixed || []), ...(spec.recurring || [])].map((f) => [
      f.id,
      f.location || null
    ])
  );
  const at = new Map();
  const add = (key, entry) => {
    if (!at.has(key)) {
      at.set(key, []);
    }
    at.get(key).push(entry);
  };
  const put = (cell, d, g, b, sign = 1) => {
    const group = m.groups.get(g);
    const act = cell.kind === "A" ? actsById.get(cell.id) : null;
    const place = act ? act.location : setTimePlace.get(cell.id) || null;
    const entries = [];
    if (act) {
      entries.push([`a|${act.id}|${d}|${b}`, { group, act }]);
    }
    if (place) {
      entries.push([`p|${place}|${d}|${b}`, { group, act }]);
    }
    for (const [key, entry] of entries) {
      if (sign > 0) {
        add(key, entry);
      } else {
        const list = at.get(key);
        list.splice(
          list.findIndex((x) => x.group === group),
          1
        );
      }
    }
  };
  for (const day of m.days) {
    for (const g of day.groups) {
      cells[day.d][g.id].forEach(
        (cell, b) => cell && put(cell, day.d, g.id, b)
      );
    }
  }
  const other = (d, b, field, id) =>
    busiestOther(
      spec.otherPrograms,
      field,
      id,
      spec.daysDates[d],
      m.blocks[b].startTime,
      m.blocks[b].endTime
    );
  const room = (act, d, b, group) => {
    const there = at.get(`a|${act.id}|${d}|${b}`) || [];
    const othersAtAct = other(d, b, "activityId", act.id);
    if (act.atOnce != null && there.length + othersAtAct >= act.atOnce) {
      return false;
    }
    if (
      act.sameDivision &&
      (othersAtAct > 0 ||
        there.some((x) => x.group.division !== group.division))
    ) {
      return false;
    }
    if (act.location) {
      const inPlace = at.get(`p|${act.location}|${d}|${b}`) || [];
      const othersAtPlace = other(d, b, "locationId", act.location);
      if (
        m.fit.has(act.location) &&
        inPlace.length + othersAtPlace >= m.fit.get(act.location)
      ) {
        return false;
      }
      const strictClash = inPlace.some(
        (x) =>
          x.group.division !== group.division &&
          ((x.act && x.act.sameDivision) || act.sameDivision)
      );
      if (
        m.fit.has(act.location) &&
        (strictClash || (act.sameDivision && othersAtPlace > 0))
      ) {
        return false;
      }
    }
    return true;
  };
  return { put, room };
}

/** Could act start at cell (d, g, b) of grid `cells` within the hard limits? */
function fitsAt(m, led, cells, act, d, g, b, isFree) {
  const group = m.groups.get(g);
  if (!eligible(act, group) || b + act.span > m.blocks.length) {
    return false;
  }
  const span = [];
  for (let i = b; i < b + act.span; i++) {
    if (cells[d][g][i] || !isFree(d, g, i)) {
      return false;
    }
    if (m.peers[i].some((j) => cells[d][g][j] || span.includes(j))) {
      return false;
    }
    span.push(i);
  }
  return span.every((i) => led.room(act, d, i, group));
}

/**
 * The most engine cells any week can fill within the hard limits, by exhaustive search with a
 * bound; null when the search runs past its budget (then the local check alone decides).
 */
function bestFill(spec, m) {
  const cells = m.before.map((day, d) =>
    Object.fromEntries(
      Object.entries(day).map(([g, row]) => [
        g,
        row.map((c, b) => (m.free(d, g, b) ? null : c))
      ])
    )
  );
  const led = ledger(spec, m, cells);
  const order = [];
  for (const day of m.days) {
    for (const g of day.groups) {
      m.blocks.forEach(
        (x, b) => m.free(day.d, g.id, b) && order.push([day.d, g.id, b])
      );
    }
  }
  let best = 0;
  let nodes = 0;
  const search = (i, filled) => {
    if (++nodes > NODE_BUDGET) {
      throw new Error("budget");
    }
    if (filled + (order.length - i) <= best) {
      return;
    }
    if (i === order.length) {
      best = filled;
      return;
    }
    const [d, g, b] = order[i];
    if (cells[d][g][b]) {
      search(i + 1, filled);
      return;
    }
    for (const act of m.acts) {
      if (!fitsAt(m, led, cells, act, d, g, b, m.free)) {
        continue;
      }
      const placed = [];
      for (let k = 0; k < act.span; k++) {
        const cell = { kind: "A", id: act.id, head: k === 0 };
        cells[d][g][b + k] = cell;
        led.put(cell, d, g, b + k);
        placed.push(b + k);
      }
      search(i + 1, filled + act.span);
      for (const k of placed) {
        led.put(cells[d][g][k], d, g, k, -1);
        cells[d][g][k] = null;
      }
    }
    search(i + 1, filled);
  };
  try {
    search(0, 0);
  } catch {
    return null;
  }
  return best;
}

/** The days an early-week goal counts, from the week's real first day (settled rule). */
function earlyDays(dates, dayName) {
  const want = WEEKDAY[dayName];
  const last = dates.findIndex(
    (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === want
  );
  return last < 0 ? [] : dates.slice(0, last + 1);
}

/**
 * Every settled rule this week breaks: { hardLimits, visible, gapIsABug }, each a list of
 * plain-words lines, for a library camp (data/oddCamps.js). options.exhaustive runs the gap oracle.
 */
export function settledRules(c, input, result, options = {}) {
  const spec = { ...c.spec, blank: c.blank };
  const out = { hardLimits: [], visible: [], gapIsABug: [] };
  if (!result.ok) {
    out.visible.push(`not built: ${result.error}`);
    return out;
  }
  const full = { ...spec, daysDates: input.days.map((d) => d.dateValue) };
  const m = model(full, input, result);
  const actsById = new Map(spec.activities.map((a) => [a.id, a]));

  // Hard limits: a flag on a cell the engine placed that bends one.
  const placedByEngine = (f) => {
    const d = input.days.findIndex((x) => x.dateValue === f.date);
    const b = m.blocks.findIndex((x) => x.id === f.blockId);
    return m.free(d, f.groupId, b);
  };
  for (const f of result.flags) {
    const hard = f.bends.filter((r) => HARD.includes(r));
    if (hard.length && placedByEngine(f)) {
      out.hardLimits.push(
        `${f.date} ${f.groupId} ${f.blockId}: ${hard.join(", ")}`
      );
    }
  }

  // Visible: data/check.js's problems, then shortfalls and blank setup fields.
  // check.js knows nothing of replaced days, so it sees the week without them.
  const kept = (days) => days.filter((day) => !m.replaced.has(day.dateValue));
  out.visible.push(
    ...problems(
      spec,
      { ...input, days: kept(input.days) },
      { ...result, days: kept(result.days) }
    )
  );
  const heads = new Map();
  for (const day of m.days) {
    for (const g of day.groups) {
      m.after[day.d][g.id].forEach((cell) => {
        if (cell && cell.head && cell.kind === "A") {
          const k = `${g.id}|${cell.id}`;
          heads.set(k, [...(heads.get(k) || []), day.date]);
        }
      });
    }
  }
  const present = spec.groups.filter((g) =>
    m.days.some((day) => day.groups.some((x) => x.id === g.id))
  );
  const dates = m.days.map((day) => day.date);
  const listed = (list, a, g) =>
    list.find((e) => e.activityId === a.id && e.groupId === g.id);
  for (const g of present) {
    for (const a of m.acts) {
      if (!eligible(a, g)) {
        continue;
      }
      const mine = heads.get(`${g.id}|${a.id}`) || [];
      const short = Math.max(0, a.min - mine.length);
      const said = listed(result.stillNeededBy, a, g);
      if ((said ? said.missing : 0) !== short) {
        out.visible.push(
          `${a.id} for ${g.id}: ${short} short, listed ${said ? said.missing : 0}`
        );
      }
      if (a.early) {
        const days = earlyDays(dates, a.early.day);
        const said2 = listed(result.spreadBy, a, g);
        if (!days.length) {
          // Said once for the goal (noEarlyDayBy), not per group.
          const once = (result.noEarlyDayBy || []).some(
            (e) => e.activityId === a.id
          );
          if (!said2 && !once) {
            out.visible.push(
              `${a.id} for ${g.id}: the week has no day by ${a.early.day}, unsaid`
            );
          }
          continue;
        }
        const early = mine.filter((date) => days.includes(date)).length;
        const missing = Math.max(0, a.early.count - early);
        if ((said2 ? said2.missing : 0) !== missing) {
          out.visible.push(
            `${a.id} for ${g.id}: ${missing} short by ${a.early.day}, listed ${said2 ? said2.missing : 0}`
          );
        }
      }
    }
  }
  // Every line of words the result holds, anywhere in it.
  const lines = [];
  const collect = (v) => {
    if (typeof v === "string") {
      lines.push(v);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(collect);
    }
  };
  collect({ ...result, days: undefined });
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const id of [
    ...((spec.blank || {}).atOnce || []),
    ...((spec.blank || {}).fit || [])
  ]) {
    const name = (
      actsById.get(id) || (spec.locations || []).find((l) => l.id === id)
    ).name;
    const named = new RegExp(`\\b${escape(name)}\\b`);
    if (!lines.some((l) => named.test(l) && /\bblank\b/i.test(l))) {
      out.visible.push(`${name}: a blank setup field, unsaid`);
    }
  }

  // A cell of a placement the engine made that bends a hard limit.
  function bentAt(d, g, b) {
    const row = m.after[d][g];
    if (!m.free(d, g, b) || !row[b]) {
      return false;
    }
    let s = b;
    while (!row[s].head) {
      s--;
    }
    return result.flags.some(
      (f) =>
        f.date === input.days[d].dateValue &&
        f.groupId === g &&
        f.blockId === m.blocks[s].id &&
        f.bends.some((r) => HARD.includes(r))
    );
  }

  // Gap is a bug: every Open engine cell has nothing allowed physically free there.
  // Room is judged without the engine's own placements that break a hard limit: a bent
  // placement holds no room a cell could be refused for.
  const legal = m.after.map((day, d) =>
    Object.fromEntries(
      Object.entries(day).map(([g, row]) => [
        g,
        row.map((cell, b) => (cell && bentAt(d, g, b) ? null : cell))
      ])
    )
  );
  const led = ledger(full, m, legal);
  let filled = 0;
  for (const day of m.days) {
    for (const g of day.groups) {
      for (let b = 0; b < m.blocks.length; b++) {
        const x = m.blocks[b];
        if (!m.free(day.d, g.id, b)) {
          continue;
        }
        const cell = m.after[day.d][g.id][b];
        if (cell) {
          filled += bentAt(day.d, g.id, b) ? 0 : 1;
          continue;
        }
        const could = m.acts.filter((a) =>
          fitsAt(m, led, m.after, a, day.d, g.id, b, m.free)
        );
        if (could.length) {
          out.gapIsABug.push(
            `${day.date} ${g.id} ${x.id} Open, but ${could.map((a) => a.id).join(", ")} could go there`
          );
        }
      }
    }
  }
  if (options.exhaustive) {
    const best = bestFill(full, m);
    if (best == null) {
      out.gapIsABug.push(
        "the exhaustive search ran out of budget: no proof either way"
      );
    } else if (best > filled) {
      out.gapIsABug.push(
        `filled ${filled} cells within the hard limits; a week exists that fills ${best}`
      );
    }
  }
  return out;
}
