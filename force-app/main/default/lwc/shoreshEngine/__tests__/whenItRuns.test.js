/**
 * When an activity can run (ADR 0031 piece A; protocol GEN-3.13 to 3.16): the boxes unticked in
 * its details panel's When it runs grid are times the build never places it, a limit that never
 * gives way (not even to never-blank); a person's own placement there is kept and shown, never
 * refused; and a camp that unticks nothing gets exactly the week it got before.
 */
import { checkWeek, generateWeek } from "c/shoreshEngine";
import { mulberry32 } from "../random";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";

const SEEDS = 150;
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
// dateAt(0) is a Monday.
const weekdayAt = (d) => WEEKDAYS[d % 7];

/** Every activity placement in a built week: { d, groupId, id, blocks: [block Ids] }. */
function placements(days) {
  const out = [];
  cellsOf(days).forEach((byGroup, d) => {
    for (const [groupId, row] of Object.entries(byGroup)) {
      row.forEach((cell, b) => {
        if (!cell || !cell.head || cell.kind !== "A") {
          return;
        }
        const blocks = [days[d].blocks[b].id];
        for (let i = b + 1; i < row.length && row[i] && !row[i].head; i++) {
          blocks.push(days[d].blocks[i].id);
        }
        out.push({ d, groupId, id: cell.id, first: b, blocks });
      });
    }
  });
  return out;
}

describe("When it runs", () => {
  // GEN-3.13
  it("never places an activity in a box its When it runs leaves out, and places it where it can run", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        days: 2,
        blocks: [block(0), block(1)],
        activities: [
          activity("swim", {
            min: 2,
            off: [{ block: "b0", day: "Monday" }]
          }),
          activity("arts", { min: 0 })
        ]
      })
    );
    expect(result.ok).toBe(true);
    expect(at(result, 0, "g1", 0)).not.toBe("swim");
    // Swim still gets both its sessions: Monday's second block, and Tuesday.
    expect(at(result, 0, "g1", 1)).toBe("swim");
    expect([at(result, 1, "g1", 0), at(result, 1, "g1", 1)]).toContain("swim");
  });

  // GEN-3.13
  it("a box left out on Monday says nothing about Tuesday", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        days: 2,
        blocks: [block(0)],
        activities: [
          activity("swim", { off: [{ block: "b0", day: "Monday" }] })
        ]
      })
    );
    expect(at(result, 0, "g1", 0)).toBeNull();
    expect(at(result, 1, "g1", 0)).toBe("swim");
  });

  // GEN-3.13
  it("a multi-block activity needs every block of its length to be one it can run in", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        blocks: [block(0), block(1), block(2)],
        activities: [
          activity("hike", {
            span: 2,
            min: 1,
            off: [{ block: "b1", day: "Monday" }]
          }),
          activity("arts", { max: null, atOnce: null })
        ]
      })
    );
    expect(result.ok).toBe(true);
    // b0-b1 and b1-b2 both touch b1, so the hike can't go anywhere this day.
    expect(
      [0, 1, 2].map((b) => at(result, 0, "g1", b)).filter((x) => x === "hike")
    ).toEqual([]);
    expect(result.stillNeeded).toEqual(["hike · Bunk g1: 1 still needed"]);
  });

  // GEN-3.14
  it("a cell where nothing set up for the group runs stays Open and says so, never-blank or not", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        blocks: [block(0), block(1)],
        activities: [
          activity("swim", { off: [{ block: "b0", day: "Monday" }] }),
          activity("arts", { off: [{ block: "b0", day: "Monday" }] })
        ]
      })
    );
    expect(result.ok).toBe(true);
    expect(at(result, 0, "g1", 0)).toBeNull();
    const open = result.openCells.find(
      (c) => c.date === dateAt(0) && c.groupId === "g1" && c.blockId === "b0"
    );
    expect(open.reason).toBe("No activity for Bunk g1 runs then");
    expect(open.why).toBe("offTime");
    expect(at(result, 0, "g1", 1)).not.toBeNull();
  });

  // GEN-3.14: never-blank bends only the weekly maximum, never When it runs.
  it("never-blank goes over a weekly maximum before it would place an activity where it can't run", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        blocks: [block(0), block(1)],
        activities: [
          activity("swim", { max: 1, off: [{ block: "b1", day: "Monday" }] }),
          activity("arts", { max: 0 }),
          activity("games", { max: 1 })
        ]
      })
    );
    expect(result.ok).toBe(true);
    const day = [at(result, 0, "g1", 0), at(result, 0, "g1", 1)];
    expect(day[1]).not.toBe("swim");
    expect(day.filter(Boolean).length).toBe(2);
  });

  // GEN-3.15
  it("a locked hand edit where its activity can't run is kept, and its placement says so", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1")],
        blocks: [block(0), block(1)],
        activities: [
          activity("swim", { off: [{ block: "b0", day: "Monday" }] }),
          activity("arts")
        ],
        cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }],
        locks: [{ date: dateAt(0), groupId: "g1", blockId: "b0" }]
      })
    );
    expect(result.ok).toBe(true);
    expect(at(result, 0, "g1", 0)).toBe("swim");
    const dot = result.flags.find(
      (f) => f.groupId === "g1" && f.blockId === "b0"
    );
    expect(dot.bends).toEqual(["offTime"]);
    expect(dot.reason).toBe("Not running then");
  });

  // GEN-3.15: the same dot on Manual Build, from the grid alone (checks.js).
  it("checkWeek dots a placement where its activity can't run, and nothing else", () => {
    const input = camp({
      groups: [group("g1")],
      days: 2,
      blocks: [block(0)],
      activities: [activity("swim", { off: [{ block: "b0", day: "Monday" }] })],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 1, group: "g1", block: "b0", act: "swim" }
      ]
    });
    const act = {
      id: "swim",
      name: "swim",
      span: 1,
      min: 0,
      max: 5,
      atOnce: 1,
      off: new Set(["b0|1"])
    };
    const checked = checkWeek(
      input.days,
      { activities: new Map([["swim", act]]) },
      { t: undefined, dayName: (d) => d }
    );
    expect([...checked.bends]).toEqual([[`${dateAt(0)}|g1|b0`, ["offTime"]]]);
  });

  // GEN-3.16
  it(`a camp that unticks nothing gets exactly the week it got before (${SEEDS} random camps)`, () => {
    const changed = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const spec = withHistory(randomCamp(seed), seed);
      const before = JSON.stringify(generateWeek(camp(spec)));
      const none = {
        ...spec,
        activities: spec.activities.map((a) => ({ ...a, off: [] }))
      };
      if (JSON.stringify(generateWeek(camp(none))) !== before) {
        changed.push(seed);
      }
    }
    expect(changed).toEqual([]);
  });

  // GEN-3.13, GEN-3.15
  it(`on random camps with boxes unticked, nothing the build places is in one, and the same camp builds the same week (${SEEDS} seeds)`, () => {
    const bad = [];
    let unticked = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = mulberry32(seed ^ 0x51ed270b);
      const base = withHistory(randomCamp(seed), seed);
      const spec = {
        ...base,
        activities: base.activities.map((a) => {
          const off = [];
          for (const b of base.blocks) {
            for (let d = 0; d < base.days; d++) {
              if (r() < 0.25) {
                off.push({ block: b.id, day: weekdayAt(d) });
              }
            }
          }
          unticked += off.length;
          return { ...a, off };
        })
      };
      const input = camp(spec);
      const result = generateWeek(input);
      if (!result.ok) {
        bad.push(`seed ${seed}: ${result.error}`);
        continue;
      }
      if (JSON.stringify(generateWeek(camp(spec))) !== JSON.stringify(result)) {
        bad.push(`seed ${seed}: not deterministic`);
      }
      const offOf = new Map(
        spec.activities.map((a) => [
          a.id,
          new Set(a.off.map((o) => `${o.block}|${o.day}`))
        ])
      );
      const lock = new Set(
        (input.locks || []).map((l) => `${l.date}|${l.groupId}|${l.blockId}`)
      );
      const was = new Set(
        placements(input.days).map(
          (p) => `${p.d}|${p.groupId}|${p.id}|${p.blocks.join(",")}`
        )
      );
      for (const p of placements(result.days)) {
        const day = weekdayAt(p.d);
        if (!p.blocks.some((b) => offOf.get(p.id).has(`${b}|${day}`))) {
          continue;
        }
        const date = result.days[p.d].dateValue;
        const kept =
          was.has(`${p.d}|${p.groupId}|${p.id}|${p.blocks.join(",")}`) &&
          (spec.mode === "fillOpen" ||
            p.blocks.some((b) => lock.has(`${date}|${p.groupId}|${b}`)));
        const dotted = result.flags.some(
          (f) =>
            f.date === date &&
            f.groupId === p.groupId &&
            f.blockId === p.blocks[0] &&
            f.bends.includes("offTime")
        );
        if (!kept) {
          bad.push(`seed ${seed}: ${p.id} placed where it can't run (${date})`);
        } else if (!dotted) {
          bad.push(`seed ${seed}: ${p.id} kept where it can't run, no dot`);
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(unticked).toBeGreaterThan(0);
  });
});
