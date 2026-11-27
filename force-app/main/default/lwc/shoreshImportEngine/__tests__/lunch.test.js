// docs/import/classification.md INGEST-3.13: a group at camp on a day the file shows no Lunch for
// it has its division's Lunch that day, or its own of another day. Made-up camp only.
import { buildProposal, importNotes } from "./data/engine";
import { csv, existingSetup, program, terms } from "./data/samples";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIMES = [
  "9:00-9:45",
  "10:00-10:45",
  "11:00-11:45",
  "12:00-12:45",
  "1:00-1:45"
];
const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4", "Bunk 5"];
// Bunks 1 and 2 are Juniors, 3 and 4 Seniors, 5 Leaders on its own.
const DIVISIONS = ["Juniors", "", "Seniors", "", "Leaders"];
const ROTATION = ["Art", "Soccer", "Drama", "Music", "Archery"];
const LUNCH_AT = [2, 2, 3, 3, 3];

function week(cell) {
  return DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ["", ...DIVISIONS],
      ["Time", ...GROUPS],
      ...TIMES.map((t, b) => [t, ...GROUPS.map((_, g) => cell(g, d, b))])
    ])
  );
}

const plain = (g, d, b) => {
  return b === LUNCH_AT[g] ? "Lunch" : ROTATION[(g + d + b) % ROTATION.length];
};
const propose = (cell, answers = {}) =>
  buildProposal({
    files: week(cell),
    existing: null,
    terms,
    answers: { "kind|Lunch": "recurring", ...answers }
  });
const filled = (p) =>
  p.recurring
    .filter((r) => r.lunchFor)
    .map((r) => [r.lunchFor.join(), r.block, r.days.join()]);

describe("INGEST-3.13: a day the file shows no Lunch for a group", () => {
  it("INGEST-3.13: a group on a trip over Lunch has its division's Lunch that day, said on the review", () => {
    // The trip is over the middle of Tuesday: Bunk 2 is at camp first and last thing.
    const trip = (g, d, b) => {
      return g === 1 && d === 1 && b >= 1 && b <= 3
        ? "Field Trip"
        : plain(g, d, b);
    };
    const p = propose(trip);
    // Bunk 2 joins Bunk 1's Lunch, which is every day: no record is added.
    expect(filled(p)).toEqual([
      ["Bunk 2", 2, "Monday,Tuesday,Wednesday,Thursday,Friday"]
    ]);
    expect(p.recurring.filter((r) => r.name === "Lunch")).toHaveLength(2);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "Bunk 2 has no Lunch in the file, so it has its division's Lunch then, or its own of another day."
    );
  });

  it("INGEST-3.13: a group alone in its division has its own Lunch's time on its trip days", () => {
    // Bunk 5 is on a trip over Lunch Monday and Tuesday; it eats at 12:00 the other days.
    const trip = (g, d, b) => {
      return g === 4 && d < 2 && b >= 1 && b <= 3
        ? "Field Trip"
        : plain(g, d, b);
    };
    // Widened, it is the Seniors' very Lunch: one record for all three, never two alike.
    const p = propose(trip);
    expect(filled(p)).toEqual([
      ["Bunk 5", 3, "Monday,Tuesday,Wednesday,Thursday,Friday"]
    ]);
    const keys = p.recurring.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("INGEST-3.13: counter-case: a group away all day, or with Lunch at another time, has none added", () => {
    const away = (g, d, b) => {
      return g === 1 && d === 1 ? "Field Trip" : plain(g, d, b);
    };
    expect(filled(propose(away))).toEqual([]);
    const late = (g, d, b) => {
      if (g === 1 && d === 1) return b === 4 ? "Lunch" : ROTATION[b];
      return plain(g, d, b);
    };
    expect(filled(propose(late))).toEqual([]);
  });

  it("INGEST-3.13: counter-case: another Lunch name, or a block taken, has nothing added", () => {
    const trip = (g, d, b) => g === 1 && d === 1 && b >= 1 && b <= 3;
    // Bunk 1 writes its Lunch otherwise: Bunk 2's Lunch is the only "Lunch" of its division.
    const early = (g, d, b) => {
      if (trip(g, d, b)) return "Field Trip";
      if (g === 0 && b === LUNCH_AT[g]) return "Early Lunch";
      return plain(g, d, b);
    };
    // Bunk 2's own Lunch is widened; no one is given the other name's Lunch.
    expect(filled(propose(early))).toEqual([
      ["Bunk 2", 2, "Monday,Tuesday,Wednesday,Thursday,Friday"]
    ]);
    expect(
      propose(early).recurring.filter((r) => r.name === "Early Lunch")
    ).toEqual([
      expect.objectContaining({ groups: ["Bunk 1"], lunchFor: undefined })
    ]);
    // Bunk 2 has something else in its Lunch block on Tuesday.
    const taken = (g, d, b) => {
      if (g === 1 && d === 1 && b === LUNCH_AT[g]) return "Archery";
      return trip(g, d, b) && b !== LUNCH_AT[g] ? "Field Trip" : plain(g, d, b);
    };
    expect(filled(propose(taken))).toEqual([]);
  });

  it("INGEST-3.13: counter-case: an activity not named Lunch has nothing added", () => {
    const swim = (g, d, b) => {
      if (g === 1 && d === 1 && b >= 1 && b <= 3) return "Field Trip";
      return b === LUNCH_AT[g]
        ? "Swim"
        : ROTATION[(g + d + b) % ROTATION.length];
    };
    expect(filled(propose(swim, { "kind|Swim": "recurring" }))).toEqual([]);
  });

  it("INGEST-3.13: counter-case: a Lunch at another time one day is never joined to one on more days", () => {
    // Bunks 1 and 2 at block 2 every day; Bunk 2 at block 3 on Tuesday, on a trip Friday.
    const moved = (g, d, b) => {
      if (g === 1 && d === 4 && b >= 1 && b <= 3) return "Field Trip";
      if (g === 1 && d === 1) return b === 3 ? "Lunch" : ROTATION[b];
      return plain(g, d, b);
    };
    const p = propose(moved);
    const twice = p.recurring.filter(
      (r) =>
        r.name === "Lunch" &&
        r.groups.includes("Bunk 2") &&
        r.days.includes("Tuesday")
    );
    // Its own Tuesday Lunch at block 3 stands; no Lunch is added beside it.
    expect(twice).toEqual([]);
  });

  it("INGEST-3.13: importing the same file again finds the Lunch it set up, trip day and all", () => {
    // Bunk 1 has Lunch at block 2, on a trip over it on Tuesday; Bunk 3 at block 3, Tuesday only.
    const one = (g, d, b) => {
      if (g === 0 && d === 1 && b >= 1 && b <= 3) return "Field Trip";
      if (g === 0 && b === 2) return "Lunch";
      if (g === 2 && d === 1 && b === 3) return "Lunch";
      return ROTATION[(g + d + b) % ROTATION.length];
    };
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: TIMES.map((t, i) => {
            const [a, z] = t.split("-").map((x) => {
              const [h, m] = x.split(":").map(Number);
              return (h < 7 ? h + 12 : h) * 60 + m;
            });
            return [`b${i}`, t, a, z];
          }),
          recurring: [
            {
              Id: "r1",
              Name: "Lunch",
              TimeBlock__c: "b2",
              Length__c: 1,
              Monday__c: true,
              Tuesday__c: true,
              Wednesday__c: true,
              Thursday__c: true,
              Friday__c: true
            }
          ]
        })
      ]
    });
    const p = buildProposal({
      files: week(one),
      existing,
      terms,
      answers: {}
    });
    expect(p.asks.map((a) => a.id).join()).not.toContain("change|recurring");
    expect(p.updates.recurring).toEqual([]);
  });

  it("INGEST-3.13: counter-case: a day no group has Lunch (a short Friday, a cookout) has none added", () => {
    // Camp ends at 11:45 on Friday for the Seniors; the Juniors still eat at 11:00.
    const short = (g, d, b) => {
      if (d === 4 && b >= 3) return "";
      return plain(g, d, b);
    };
    expect(filled(propose(short))).toEqual([]);
    const cookout = (g, d, b) => {
      if (d === 4 && b === LUNCH_AT[g]) return "";
      if (d === 4 && b === 4) return "Cookout";
      return plain(g, d, b);
    };
    expect(filled(propose(cookout))).toEqual([]);
  });
});
