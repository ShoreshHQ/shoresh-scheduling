/** Random small camps for the property test, from a seed. Synthetic data only. */
import { generateWeek } from "c/shoreshEngine";
import { mulberry32 } from "../../random";
import { activity, block, camp, cellsOf, dateAt, group } from "./camp";

export function randomCamp(seed) {
  const r = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const divisions = ["div1", "div2", "div3"].slice(0, int(1, 3));
  const groups = Array.from({ length: int(1, 6) }, (_, i) =>
    group(`g${i}`, {
      division: pick(divisions),
      availability:
        r() < 0.75 ? "AllDay" : pick(["MorningOnly", "AfternoonOnly"])
    })
  );
  // Blocks from 08:00; some camps get two blocks that overlap in time.
  const blocks = Array.from({ length: int(2, 6) }, (_, i) => block(i * 2));
  if (r() < 0.15) {
    blocks.push(
      block(2, {
        id: "bx",
        name: "Overlap",
        startTime: "12:30",
        endTime: "13:15",
        partOfDay: "Afternoon"
      })
    );
  }
  // Some camps start with a short Wake-up overlapping the first hour, then back-to-back hours,
  // with more multi-block activities: the overlap choice must weigh activity lengths.
  const wakeUp = r() < 0.2;
  if (wakeUp) {
    const pad = (n) => String(n).padStart(2, "0");
    blocks.length = 0;
    blocks.push(
      block(0, {
        id: "wake",
        name: "Wake-up",
        startTime: "08:00",
        endTime: "08:30"
      })
    );
    for (let i = 0; i < int(2, 4); i++) {
      blocks.push(
        block(i, {
          id: `p${i}`,
          name: `P${i + 1}`,
          startTime: `${pad(8 + i)}:00`,
          endTime: `${pad(9 + i)}:00`
        })
      );
    }
  }
  const locations = Array.from({ length: int(0, 3) }, (_, i) => ({
    id: `loc${i}`,
    fit: int(1, 3)
  }));
  const activities = Array.from({ length: int(1, 7) }, (_, i) => {
    const min = int(0, 2);
    return activity(`a${i}`, {
      min,
      max: r() < 0.2 ? null : min + int(0, 3),
      span:
        i > 0 && r() < (wakeUp ? 0.5 : 0.2) ? (wakeUp && r() < 0.3 ? 3 : 2) : 1,
      atOnce: r() < 0.3 ? null : int(1, 3),
      location: locations.length && r() < 0.6 ? pick(locations).id : null,
      sameDivision: r() < 0.15,
      priority: r() < 0.5 ? "High" : "Low",
      early:
        r() < 0.2 ? { count: 1, day: pick(["Tuesday", "Wednesday"]) } : null,
      eligible:
        r() < 0.3 ? [pick([...groups.map((g) => g.id), ...divisions])] : []
    });
  });
  const fixed =
    r() < 0.4
      ? [
          {
            id: "fix1",
            name: "Lunch",
            block: blocks[int(0, blocks.length - 1)].id,
            location: locations.length && r() < 0.5 ? locations[0].id : null
          }
        ]
      : [];
  // A recurring activity for some groups, at a block the fixed one doesn't use.
  const free = blocks.filter((b) => !fixed.length || b.id !== fixed[0].block);
  const recurring =
    free.length && r() < 0.3
      ? [
          {
            id: "rec1",
            name: "Swim test",
            block: pick(free).id,
            groups: groups.filter(() => r() < 0.5).map((g) => g.id),
            location: locations.length && r() < 0.5 ? pick(locations).id : null
          }
        ]
      : [];
  const days = int(1, 5);
  const otherPrograms = [];
  if (locations.length && r() < 0.3) {
    otherPrograms.push({
      date: dateAt(0),
      startTime: "08:00",
      endTime: "12:00",
      locationId: locations[0].id,
      groups: 1
    });
  }
  // Another program's groups at one of these activities (no count means one; 0 means none).
  if (r() < 0.3) {
    otherPrograms.push({
      date: dateAt(int(0, days - 1)),
      startTime: "10:00",
      endTime: "14:00",
      activityId: pick(activities).id,
      groups: r() < 0.3 ? null : int(0, 2)
    });
  }
  return {
    groups,
    blocks,
    days,
    activities,
    locations,
    fixed,
    recurring,
    otherPrograms,
    programId: `p${seed % 7}`,
    weekId: `w${seed % 5}`,
    option: int(1, 4),
    mode: r() < 0.3 ? "fillOpen" : "full"
  };
}

/** Locks and filled cells taken from an earlier build of the same camp. */
export function withHistory(spec, seed) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const first = generateWeek(camp({ ...spec, mode: "full" }));
  if (!first.ok) {
    return spec;
  }
  const cells = [];
  const locks = [];
  cellsOf(first.days).forEach((byGroup, d) => {
    for (const [groupId, row] of Object.entries(byGroup)) {
      row.forEach((cell, b) => {
        if (!cell || cell.kind !== "A" || !cell.head) {
          return;
        }
        if (r() < 0.35) {
          const act = spec.activities.find((a) => a.id === cell.id);
          cells.push({
            day: d,
            group: groupId,
            block: spec.blocks[b].id,
            act: cell.id
          });
          if (r() < 0.5) {
            locks.push({
              date: dateAt(d),
              groupId,
              blockId: spec.blocks[b + (act.span > 1 && r() < 0.5 ? 1 : 0)].id
            });
          }
        }
      });
    }
  });
  // An open cell locked: it must stay Open.
  if (r() < 0.3) {
    locks.push({
      date: dateAt(0),
      groupId: spec.groups[0].id,
      blockId: spec.blocks[0].id
    });
  }
  return { ...spec, cells, locks };
}
