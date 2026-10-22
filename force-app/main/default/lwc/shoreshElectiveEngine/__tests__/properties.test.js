/**
 * Rules that hold for every camp, checked on 300 made-up ones (data/electiveCamp.js): one seat per
 * camper per time, never over an offering's seats, locks kept exactly, seats only where a camper
 * attends, a dropped offering is empty, a linked choice is all or nothing, and nobody is left
 * out while a seat they could take is free (desktop owner ruling R3).
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import { randomElectiveCamp } from "./data/electiveCamp";

const at = (...parts) => parts.join("|");

function check(input) {
  const out = assignSeats(input);
  expect(out.ok).toBe(true);
  const timeIds = new Set(input.times.map((t) => t.id));
  const offeringAt = new Map(
    input.offerings.map((o) => [at(o.timeId, o.activityId), o])
  );
  const limit = (o) => (o.noLimit ? Infinity : o.seats);

  // One seat per camper per time.
  const seatOf = new Map();
  for (const s of out.seats) {
    expect(seatOf.has(at(s.camperId, s.timeId))).toBe(false);
    seatOf.set(at(s.camperId, s.timeId), s);
    expect(timeIds.has(s.timeId)).toBe(true);
  }

  // Locks come back exactly, marked locked; nothing else is marked locked.
  for (const l of input.locks) {
    expect(seatOf.get(at(l.camperId, l.timeId))).toMatchObject({
      activityId: l.activityId,
      locked: true,
      flags: []
    });
  }
  expect(out.seats.filter((s) => s.locked).length).toBe(input.locks.length);

  const dropped = new Set(
    out.findings
      .filter((f) => f.kind === "BELOW_MINIMUM")
      .map((f) => at(f.timeId, f.activityId))
  );
  const used = new Map();
  for (const s of out.seats) {
    const k = at(s.timeId, s.activityId);
    used.set(k, (used.get(k) || 0) + 1);
    if (s.locked) {
      continue;
    }
    // Only where the camper attends, only in something offered there, never in a dropped one.
    expect(input.attendance[s.camperId]).toContain(s.timeId);
    expect(offeringAt.has(k)).toBe(true);
    expect(dropped.has(k)).toBe(false);
    expect(s.rank == null).toBe(s.flags.includes("NOT_REQUESTED"));
    if (s.flags.includes("NOT_TOP_CHOICE")) {
      expect(s.rank).toBeGreaterThan(1);
    }
  }

  // Never over the seats, except where locks alone already fill it.
  const locked = new Map();
  for (const l of input.locks) {
    const k = at(l.timeId, l.activityId);
    locked.set(k, (locked.get(k) || 0) + 1);
  }
  for (const [k, n] of used) {
    const o = offeringAt.get(k);
    if (o) {
      expect(n).toBeLessThanOrEqual(Math.max(limit(o), locked.get(k) || 0));
    }
  }

  // Every attending camper is seated or named as unplaced, and unplaced only when every offering
  // still running at that time is full.
  const unplaced = new Set();
  for (const f of out.findings) {
    if (f.kind === "NO_CAPACITY" || f.kind === "UNPLACED_AFTER_DECLINE") {
      f.camperIds.forEach((c) => unplaced.add(at(c, f.timeId)));
    }
  }
  for (const time of input.times) {
    const here = input.offerings.filter((o) => o.timeId === time.id);
    if (!here.length) {
      continue;
    }
    for (const c of input.campers) {
      if (!input.attendance[c.id].includes(time.id)) {
        continue;
      }
      const k = at(c.id, time.id);
      expect(seatOf.has(k) !== unplaced.has(k)).toBe(true);
      if (unplaced.has(k)) {
        for (const o of here) {
          const ok = at(o.timeId, o.activityId);
          if (!dropped.has(ok)) {
            expect(used.get(ok) || 0).toBeGreaterThanOrEqual(limit(o));
          }
        }
      }
    }
  }

  // A linked choice is all of its times or none.
  for (const s of out.seats.filter((x) => x.linkedChoiceId)) {
    for (const m of input.linkedChoiceTimes.filter(
      (x) => x.linkedChoiceId === s.linkedChoiceId
    )) {
      expect(seatOf.get(at(s.camperId, m.timeId))).toMatchObject({
        linkedChoiceId: s.linkedChoiceId,
        activityId: m.activityId
      });
    }
  }
  return out;
}

describe("seat assignment properties", () => {
  it("hold on 300 random camps", () => {
    let seats = 0;
    let linked = 0;
    let dropped = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const out = check(randomElectiveCamp(seed));
      seats += out.seats.length;
      linked += out.seats.filter((s) => s.linkedChoiceId).length;
      dropped += out.findings.filter((f) => f.kind === "BELOW_MINIMUM").length;
    }
    // Not vacuous: the camps seat people, place linked choices and drop offerings.
    expect(seats).toBeGreaterThan(2500);
    expect(linked).toBeGreaterThan(25);
    expect(dropped).toBeGreaterThan(25);
  });

  it("leave the inputs as they were", () => {
    const input = randomElectiveCamp(42);
    const before = JSON.stringify(input);
    assignSeats(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
