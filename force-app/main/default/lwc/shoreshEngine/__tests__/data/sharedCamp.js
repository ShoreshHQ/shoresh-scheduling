/**
 * The desktop differential's random camps (desktopDifferential.test.js), drawn only from what
 * both engines share: no overlapping blocks, other programs, same-division activities, locks,
 * electives or special days. Shared with the tests that pin one of its camps (across.test.js).
 */
import { mulberry32 } from "../../random";
import { activity, block, group } from "./camp";

/** A random camp in plain words, from a seed. Synthetic only. */
export function sharedCamp(seed) {
  const r = mulberry32(seed * 7919 + 17);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const divisions = ["div1", "div2", "div3"].slice(0, int(1, 3));
  const groups = Array.from({ length: int(1, 8) }, (_, i) =>
    group(`g${i}`, {
      division: pick(divisions),
      availability:
        r() < 0.8 ? "AllDay" : pick(["MorningOnly", "AfternoonOnly"])
    })
  );
  const blocks = Array.from({ length: int(2, 6) }, (_, i) => block(i));
  const locations = Array.from({ length: int(0, 3) }, (_, i) => ({
    id: `loc${i}`,
    fit: int(1, 3)
  }));
  const activities = Array.from({ length: int(2, 10) }, (_, i) => {
    const min = int(0, 3);
    return activity(`a${i}`, {
      min,
      max: r() < 0.2 ? null : min + int(0, 3),
      span: i > 0 && r() < 0.2 ? 2 : 1,
      atOnce: r() < 0.3 ? null : int(1, 3),
      location: locations.length && r() < 0.5 ? pick(locations).id : null,
      priority: r() < 0.5 ? "High" : "Low",
      early:
        r() < 0.25
          ? { count: 1, day: pick(["Monday", "Tuesday", "Wednesday"]) }
          : null,
      eligible:
        r() < 0.3 ? [pick([...groups.map((g) => g.id), ...divisions])] : []
    });
  });
  const fixed =
    blocks.length > 2 && r() < 0.4
      ? [{ id: "fix1", name: "Lunch", block: pick(blocks).id }]
      : [];
  return {
    groups,
    blocks,
    days: int(1, 5),
    activities,
    locations,
    fixed,
    recurring: [],
    programId: `p${seed}`,
    weekId: "w1",
    option: 1,
    mode: "full"
  };
}
