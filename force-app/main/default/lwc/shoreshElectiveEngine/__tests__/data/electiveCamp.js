/**
 * Made-up elective camps for the property, determinism and size tests, in assignSeats's own
 * shape. Synthetic data only: campers are "c000", activities "a0". Every number comes from a
 * seeded stream, so a seed always gives the same camp.
 */
import { CELL_CHOICE, ORDERED_FALLBACK, UNORDERED_SET } from "../../rankKind";

/** Mulberry32 (as c/shoreshEngine's random.js): numbers in [0, 1) from a 32-bit seed. */
export function stream(seed) {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, width) => String(n).padStart(width, "0");
const KINDS = [CELL_CHOICE, ORDERED_FALLBACK, UNORDERED_SET, undefined];

/**
 * A random camp: up to `maxCampers` campers in two divisions, a few days x two blocks of
 * elective times per division, offerings with limits, no limit, closed and minimums, ranked
 * whole-week and per-time choices, some campers away, a few locks and linked choices.
 */
export function randomElectiveCamp(seed, { maxCampers = 30 } = {}) {
  const r = stream(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const divisions = ["d1", "d2"].slice(0, int(1, 2));
  const campers = Array.from({ length: int(1, maxCampers) }, (_, i) => ({
    id: `c${pad(i, 3)}`,
    division: divisions[int(0, divisions.length - 1)]
  }));
  const times = [];
  const days = int(1, 3);
  for (let d = 0; d < days; d++) {
    for (let b = 1; b <= 2; b++) {
      divisions.forEach((division, k) => {
        if (r() < 0.85) {
          times.push({
            id: `t${d}${b}${division}`,
            date: `2026-07-0${6 + d}`,
            blockOrder: b,
            divisionOrder: k,
            division
          });
        }
      });
    }
  }
  const activities = int(1, 6);
  const offerings = [];
  for (const time of times) {
    for (let a = 0; a < activities; a++) {
      if (r() < 0.2) {
        continue;
      }
      const noLimit = r() < 0.1;
      offerings.push({
        timeId: time.id,
        activityId: `a${a}`,
        key: `a${a}`,
        name: `Activity ${a}`,
        seats: noLimit ? null : int(0, 8),
        noLimit,
        minimum: r() < 0.25 ? int(1, 5) : null
      });
    }
  }
  const choices = [];
  for (const c of campers) {
    for (let a = 0; a < activities; a++) {
      if (r() < 0.6) {
        const own = times.filter((x) => x.division === c.division);
        choices.push({
          camperId: c.id,
          key: `a${a}`,
          rank: int(1, activities),
          rankKind: KINDS[int(0, 3)],
          ...(own.length && r() < 0.3
            ? { timeId: own[int(0, own.length - 1)].id }
            : {})
        });
      }
    }
  }
  // A camper attends their own division's times, missing some.
  const attendance = {};
  for (const c of campers) {
    attendance[c.id] = times
      .filter((x) => x.division === c.division && r() < 0.9)
      .map((x) => x.id);
  }
  const locks = [];
  for (const c of campers) {
    const mine = attendance[c.id];
    if (mine.length && r() < 0.1) {
      locks.push({
        camperId: c.id,
        timeId: mine[int(0, mine.length - 1)],
        activityId: `a${int(0, activities - 1)}`
      });
    }
  }
  const linkedChoices = [];
  const linkedChoiceTimes = [];
  if (r() < 0.5) {
    for (let k = 0; k < int(1, 2); k++) {
      const a = int(0, activities - 1);
      const division = divisions[int(0, divisions.length - 1)];
      const id = `lc${k}`;
      linkedChoices.push({ id, key: `a${a}`, name: `Linked ${k}` });
      for (const time of times.filter((x) => x.division === division)) {
        if (r() < 0.6) {
          linkedChoiceTimes.push({
            linkedChoiceId: id,
            timeId: time.id,
            activityId: `a${a}`
          });
        }
      }
    }
  }
  return {
    campers,
    times,
    offerings,
    choices,
    attendance,
    locks,
    linkedChoices,
    linkedChoiceTimes
  };
}

/** The same camp with every list (and every camper's attendance) in a shuffled order. */
export function shuffled(input, seed) {
  const r = stream(seed);
  const mix = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const out = {};
  for (const [name, value] of Object.entries(input)) {
    out[name] = Array.isArray(value) ? mix(value) : value;
  }
  if (input.attendance) {
    out.attendance = Object.fromEntries(
      mix(Object.entries(input.attendance)).map(([id, list]) => [id, mix(list)])
    );
  }
  return out;
}

/**
 * The size check's camp (plan §5): `campers` campers, 12 offerings at each of 10 times (five
 * days x two blocks), five ranked choices each, two scarce offerings and one with a minimum.
 * divisions > 1 splits the campers, each division with its own 10 times.
 */
export function largeElectiveCamp({
  campers: count = 500,
  divisions = 1
} = {}) {
  const r = stream(500);
  const campers = Array.from({ length: count }, (_, i) => ({
    id: `c${pad(i, 3)}`,
    division: i % divisions
  }));
  const times = [];
  for (let k = 0; k < divisions; k++) {
    for (let d = 0; d < 5; d++) {
      for (let b = 1; b <= 2; b++) {
        times.push({
          id: `t${d}${b}${k}`,
          date: `2026-07-0${6 + d}`,
          blockOrder: b,
          divisionOrder: k,
          division: k
        });
      }
    }
  }
  const perTime = Math.ceil(count / divisions);
  const offerings = [];
  for (const time of times) {
    for (let a = 0; a < 12; a++) {
      offerings.push({
        timeId: time.id,
        activityId: `a${pad(a, 2)}`,
        key: `a${pad(a, 2)}`,
        name: `Activity ${a}`,
        seats: a < 2 ? Math.ceil(perTime / 25) : Math.ceil(perTime / 9),
        minimum: a === 11 ? Math.ceil(perTime / 8) : null
      });
    }
  }
  const choices = [];
  for (const c of campers) {
    const order = Array.from({ length: 12 }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.slice(0, 5).forEach((a, rank) =>
      choices.push({
        camperId: c.id,
        key: `a${pad(a, 2)}`,
        rank: rank + 1,
        rankKind: ORDERED_FALLBACK
      })
    );
  }
  const attendance = {};
  for (const c of campers) {
    attendance[c.id] = times
      .filter((x) => x.division === c.division)
      .map((x) => x.id);
  }
  return { campers, times, offerings, choices, attendance };
}
