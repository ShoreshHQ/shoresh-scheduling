/**
 * Same inputs, same seats (plan §5, product principle): the order records arrive in never
 * matters, because every list is put in id order (times by date, block, division) before
 * solving and nothing draws at random. And a pinned 100-camper camp, so a change to how seats
 * are chosen can't slip through unnoticed.
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import {
  largeElectiveCamp,
  randomElectiveCamp,
  shuffled
} from "./data/electiveCamp";

/** A 32-bit FNV-1a hash of the seats and findings: one number to pin. */
function fingerprint(out) {
  const text = JSON.stringify(out);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Captured from this engine when it was written. Re-capture only for a deliberate change to how
// seats are chosen, and say why in the commit.
const PINNED = {
  byRank: { 1: 735, 2: 176, 3: 49, 4: 20, 5: 8, locked: 2, none: 10 },
  kinds: { BELOW_MINIMUM: 20, UNSUPPORTED_LINKED_CHOICE: 1 },
  fingerprint: "6cd5e547"
};

/**
 * 100 campers in two divisions, 12 offerings at 10 times each, two scarce, one with a minimum;
 * two locked seats and a linked choice across Monday and Wednesday's first block.
 */
function pinnedCamp() {
  const input = largeElectiveCamp({ campers: 100, divisions: 2 });
  input.locks = [
    { camperId: "c000", timeId: "t010", activityId: "a00" },
    { camperId: "c003", timeId: "t211", activityId: "a07" }
  ];
  input.linkedChoices = [
    { id: "lc1", key: "pottery2", name: "Pottery (double)" }
  ];
  input.linkedChoiceTimes = [
    { linkedChoiceId: "lc1", timeId: "t010", activityId: "a05" },
    { linkedChoiceId: "lc1", timeId: "t210", activityId: "a05" }
  ];
  input.choices = [
    ...input.choices,
    ...["c000", "c002", "c004", "c006", "c008", "c010"].map((camperId) => ({
      camperId,
      key: "pottery2",
      rank: 1,
      rankKind: "ordered-fallback"
    }))
  ];
  return input;
}

describe("determinism", () => {
  it("gives identical seats for 20 shuffled orders of the same camp", () => {
    for (const input of [
      pinnedCamp(),
      randomElectiveCamp(7),
      randomElectiveCamp(19),
      randomElectiveCamp(101)
    ]) {
      const expected = assignSeats(input);
      for (let k = 1; k <= 20; k++) {
        expect(assignSeats(shuffled(input, k))).toEqual(expected);
      }
    }
  });

  it("keeps the pinned 100-camper camp's seats", () => {
    const out = assignSeats(pinnedCamp());
    const byRank = {};
    for (const s of out.seats) {
      const k = s.locked ? "locked" : String(s.rank ?? "none");
      byRank[k] = (byRank[k] || 0) + 1;
    }
    const kinds = {};
    for (const f of out.findings) {
      kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    }
    expect({ byRank, kinds, fingerprint: fingerprint(out) }).toEqual(PINNED);
    // The linked choice went, at both its times, to five of the six who asked; c000's locked
    // seat on Monday stands, so they can't take it as a set (the one linked-choice finding).
    const linked = out.seats.filter((s) => s.linkedChoiceId === "lc1");
    expect(linked.map((s) => `${s.camperId} ${s.timeId}`).sort()).toEqual(
      ["c002", "c004", "c006", "c008", "c010"].flatMap((c) => [
        `${c} t010`,
        `${c} t210`
      ])
    );
    expect(
      out.findings.find((f) => f.kind === "UNSUPPORTED_LINKED_CHOICE")
    ).toMatchObject({
      linkedChoiceIds: ["lc1"],
      camperIds: ["c000"]
    });
  });
});
