/**
 * Engine care PR 8 (nothing in a setup stops or refuses the run) changes seats only where a linked
 * choice has a period this run can't give it (not in the run, or its offering not offered then),
 * shares a period's seats with another linked choice of the same offering, or a limited offering
 * has blank or 0 seats (now no limit, said). Everywhere else
 * the seats and findings are exactly what they were: the random camps without either case are
 * pinned to one hash, captured from the engine before that change.
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import { randomElectiveCamp } from "./data/electiveCamp";

function fnv(text, h) {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Whether a limited offering has blank or 0 seats (now placed as no limit and said). */
function hasUnsetSeats(input) {
  return input.offerings.some((o) => !o.noLimit && !o.seats);
}

/** Whether a linked choice of more than one time can't be given whole, or shares seats. */
function hasLinkedConflict(input) {
  const timeIds = new Set(input.times.map((t) => t.id));
  const offered = new Set(
    input.offerings.map((o) => `${o.timeId}|${o.activityId}`)
  );
  const byId = new Map();
  for (const m of input.linkedChoiceTimes) {
    if (!byId.has(m.linkedChoiceId)) byId.set(m.linkedChoiceId, []);
    byId.get(m.linkedChoiceId).push(m);
  }
  const holders = new Map();
  for (const members of byId.values()) {
    if (new Set(members.map((m) => m.timeId)).size < 2) continue;
    for (const m of members) {
      if (!timeIds.has(m.timeId) || !offered.has(`${m.timeId}|${m.activityId}`))
        return true;
      const k = `${m.timeId}|${m.activityId}`;
      holders.set(k, (holders.get(k) || 0) + 1);
    }
  }
  return [...holders.values()].some((n) => n > 1);
}

describe("seats without a linked-choice conflict", () => {
  // ELECT-4.3
  it("are what they were before linked choices stopped being refused", () => {
    let h = 0x811c9dc5;
    let camps = 0;
    for (let seed = 0; seed < 300; seed++) {
      const input = randomElectiveCamp(seed);
      if (hasLinkedConflict(input) || hasUnsetSeats(input)) continue;
      camps += 1;
      h = fnv(JSON.stringify(assignSeats(input)), h);
    }
    expect({ camps, hash: h.toString(16) }).toEqual({
      camps: 89,
      hash: "30c3a1b6"
    });
  });
});
